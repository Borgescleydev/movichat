import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(_req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [
    pendingCount,
    processingCount,
    runningCampaigns,
    scheduledCampaigns,
    recentDispatches,
    campaignCounts,
  ] = await Promise.all([
    prisma.campaignDispatch.count({ where: { status: "pending" } }),
    prisma.campaignDispatch.count({ where: { status: "processing" } }),
    prisma.campaign.count({ where: { status: "running" } }),
    prisma.campaign.count({ where: { status: "scheduled" } }),
    prisma.campaignDispatch.findMany({
      where: { status: { in: ["sent", "failed", "skipped"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      include: { campaign: { select: { name: true } }, group: { select: { name: true } } },
    }),
    prisma.campaign.groupBy({
      by: ["status"],
      _count: { id: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const c of campaignCounts) {
    statusCounts[c.status] = c._count.id;
  }

  return NextResponse.json({
    cron: {
      schedule: "* * * * *",
      path: "/api/cron/campaign-dispatcher",
      description: "Executa a cada minuto (Vercel Cron Jobs)",
    },
    queue: {
      pending: pendingCount,
      processing: processingCount,
    },
    campaigns: {
      running: runningCampaigns,
      scheduled: scheduledCampaigns,
      all: statusCounts,
    },
    recentDispatches: recentDispatches.map((d) => ({
      id: d.id,
      campaignName: d.campaign.name,
      groupName: d.group.name,
      status: d.status,
      sentAt: d.sentAt,
      updatedAt: d.updatedAt,
      errorMessage: d.errorMessage,
    })),
  });
}

export async function POST(_req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Trigger cron internally by calling the dispatcher logic directly
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/cron/campaign-dispatcher`, {
      headers: {
        "x-vercel-cron": "1",
        "x-internal-trigger": "settings-panel",
      },
    });
    const data = await res.json();
    return NextResponse.json({ triggered: true, result: data });
  } catch (e) {
    return NextResponse.json(
      { triggered: false, error: e instanceof Error ? e.message : "Erro ao executar" },
      { status: 500 }
    );
  }
}
