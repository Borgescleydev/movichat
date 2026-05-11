import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, mediaType: true } },
      instance: { select: { label: true, instanceName: true, status: true } },
      groups: { select: { groupId: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  const dispatches = await prisma.campaignDispatch.findMany({
    where: { campaignId: id },
    include: { group: { select: { name: true, groupJid: true } } },
    orderBy: { scheduledFor: "asc" },
  });

  const sentCount = dispatches.filter((d) => d.status === "sent").length;
  const failedCount = dispatches.filter((d) => d.status === "failed").length;
  const skippedCount = dispatches.filter((d) => d.status === "skipped").length;
  const pendingCount = dispatches.filter((d) => ["pending", "processing"].includes(d.status)).length;
  const totalCount = dispatches.length;
  const doneCount = sentCount + failedCount + skippedCount;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

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
    },
    totalGroups: campaign.groups.length,
    totalCount,
    sentCount,
    failedCount,
    skippedCount,
    pendingCount,
    progressPct,
    dispatches: dispatches.map((d) => ({
      id: d.id,
      groupName: d.group.name,
      groupJid: d.group.groupJid,
      status: d.status,
      scheduledFor: d.scheduledFor,
      sentAt: d.sentAt,
      errorMessage: d.errorMessage,
      messageId: d.messageId,
    })),
  });
}
