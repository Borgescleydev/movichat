import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      instance: true,
      groups: { include: { group: true }, orderBy: { order: "asc" } },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  if (!["draft", "paused"].includes(campaign.status)) {
    return NextResponse.json({ error: `Não é possível agendar campanha com status "${campaign.status}"` }, { status: 400 });
  }
  if (campaign.groups.length === 0) {
    return NextResponse.json({ error: "Adicione ao menos um grupo à campanha" }, { status: 400 });
  }
  if (campaign.instance.status !== "connected") {
    return NextResponse.json({ error: "A instância WhatsApp não está conectada" }, { status: 400 });
  }

  // Calculate dispatch schedule with cadence
  const runIndex = campaign.runCount;
  const startTime = campaign.startAt.getTime();
  const hourBuckets: Record<number, number> = {};
  let cursor = startTime;
  const dispatches: { campaignId: string; groupId: string; runIndex: number; scheduledFor: Date }[] = [];

  for (let i = 0; i < campaign.groups.length; i++) {
    if (i > 0) {
      const delaySec = randomBetween(campaign.cadenceMinSeconds, campaign.cadenceMaxSeconds);
      cursor += delaySec * 1000;

      // Enforce max per hour
      const hourKey = Math.floor(cursor / 3_600_000);
      hourBuckets[hourKey] = (hourBuckets[hourKey] || 0) + 1;
      if (hourBuckets[hourKey] > campaign.cadenceMaxPerHour) {
        // Push cursor to next hour boundary
        cursor = (hourKey + 1) * 3_600_000;
        hourBuckets[hourKey + 1] = 1;
      }
    } else {
      const hourKey = Math.floor(cursor / 3_600_000);
      hourBuckets[hourKey] = 1;
    }

    dispatches.push({
      campaignId: id,
      groupId: campaign.groups[i].groupId,
      runIndex,
      scheduledFor: new Date(cursor),
    });
  }

  // Delete any existing pending dispatches for this run index (in case of re-schedule)
  await prisma.campaignDispatch.deleteMany({
    where: { campaignId: id, runIndex, status: { in: ["pending", "processing"] } },
  });

  // Create dispatches
  await prisma.campaignDispatch.createMany({ data: dispatches });

  const updated = await prisma.campaign.update({
    where: { id },
    data: { status: "scheduled", nextRunAt: null },
  });

  return NextResponse.json({ campaign: updated, dispatches: dispatches.length });
}
