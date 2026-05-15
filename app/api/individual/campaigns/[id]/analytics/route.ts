import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const runIndex = req.nextUrl.searchParams.get("run") ? Number(req.nextUrl.searchParams.get("run")) : null;

  const campaign = await prisma.contactCampaign.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, variations: true } },
      instance: { select: { label: true, instanceName: true } },
      contacts: { include: { contact: { select: { id: true, name: true, phone: true, email: true } } } },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  const dispatchWhere = {
    campaignId: id,
    ...(runIndex !== null ? { runIndex } : {}),
  };

  const [totalCount, sentCount, failedCount, skippedCount, pendingCount, dispatches] = await Promise.all([
    prisma.contactCampaignDispatch.count({ where: dispatchWhere }),
    prisma.contactCampaignDispatch.count({ where: { ...dispatchWhere, status: "sent" } }),
    prisma.contactCampaignDispatch.count({ where: { ...dispatchWhere, status: "failed" } }),
    prisma.contactCampaignDispatch.count({ where: { ...dispatchWhere, status: { in: ["skipped"] } } }),
    prisma.contactCampaignDispatch.count({ where: { ...dispatchWhere, status: { in: ["pending", "processing"] } } }),
    prisma.contactCampaignDispatch.findMany({
      where: dispatchWhere,
      include: { contact: { select: { id: true, name: true, phone: true } } },
      orderBy: { scheduledFor: "asc" },
      take: 200,
    }),
  ]);

  const progressPct = totalCount > 0 ? Math.round(((sentCount + failedCount + skippedCount) / totalCount) * 100) : 0;

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      runCount: campaign.runCount,
      nextRunAt: campaign.nextRunAt,
      repeatType: campaign.repeatType,
      templateName: campaign.template.name,
      instanceLabel: campaign.instance.label || campaign.instance.instanceName,
      sendType: campaign.sendType,
    },
    totalContacts: campaign.contacts.length,
    totalCount,
    sentCount,
    failedCount,
    skippedCount,
    pendingCount,
    progressPct,
    dispatches: dispatches.map((d) => ({
      id: d.id,
      contactName: d.contact.name,
      contactPhone: d.contact.phone,
      status: d.status,
      scheduledFor: d.scheduledFor,
      sentAt: d.sentAt,
      errorMessage: d.errorMessage,
      messageId: d.messageId,
      variationIdx: d.variationIdx,
      resolvedText: d.resolvedText,
      runIndex: d.runIndex,
    })),
  });
}
