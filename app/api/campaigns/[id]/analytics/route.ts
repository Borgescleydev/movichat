import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "100", 10) || 100));

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: { select: { name: true, mediaType: true } },
      instance: { select: { label: true, instanceName: true, status: true } },
      groups: { select: { groupId: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  // Status counts aggregated in the DB via groupBy instead of loading every dispatch and counting in JS.
  const grouped = await prisma.campaignDispatch.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: { _all: true },
  });
  const byStatus = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0;
  const sentCount = byStatus("sent");
  const failedCount = byStatus("failed");
  const skippedCount = byStatus("skipped");
  const pendingCount = byStatus("pending") + byStatus("processing");
  const totalCount = grouped.reduce((acc, g) => acc + g._count._all, 0);
  const doneCount = sentCount + failedCount + skippedCount;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Paginated dispatch list — avoids transferring/rendering thousands of rows on every 30s poll.
  const dispatches = await prisma.campaignDispatch.findMany({
    where: { campaignId: id },
    include: { group: { select: { name: true, groupJid: true } } },
    orderBy: { scheduledFor: "asc" },
    skip: (page - 1) * limit,
    take: limit,
  });

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
    page,
    limit,
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
