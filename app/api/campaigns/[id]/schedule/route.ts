import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Build dispatch timestamps using cadence logic (random delay + hourly cap) */
function buildCadenceDispatches(
  groupIds: string[],
  campaignId: string,
  runIndex: number,
  startMs: number,
  cadenceMin: number,
  cadenceMax: number,
  cadenceMaxPerHour: number
) {
  const hourBuckets: Record<number, number> = {};
  let cursor = startMs;
  const dispatches: { campaignId: string; groupId: string; runIndex: number; scheduledFor: Date }[] = [];

  for (let i = 0; i < groupIds.length; i++) {
    if (i > 0) {
      const delaySec = randomBetween(cadenceMin, cadenceMax);
      cursor += delaySec * 1000;
      const hourKey = Math.floor(cursor / 3_600_000);
      hourBuckets[hourKey] = (hourBuckets[hourKey] || 0) + 1;
      if (hourBuckets[hourKey] > cadenceMaxPerHour) {
        cursor = (hourKey + 1) * 3_600_000;
        hourBuckets[hourKey + 1] = 1;
      }
    } else {
      hourBuckets[Math.floor(cursor / 3_600_000)] = 1;
    }
    dispatches.push({ campaignId, groupId: groupIds[i], runIndex, scheduledFor: new Date(cursor) });
  }

  return dispatches;
}

/** Build dispatch timestamps using batch logic (N messages every X minutes) */
function buildBatchDispatches(
  groupIds: string[],
  campaignId: string,
  runIndex: number,
  startMs: number,
  batchSize: number,
  batchIntervalMs: number
) {
  const dispatches: { campaignId: string; groupId: string; runIndex: number; scheduledFor: Date }[] = [];
  let batchStart = startMs;

  for (let i = 0; i < groupIds.length; i++) {
    if (i > 0 && i % batchSize === 0) {
      batchStart += batchIntervalMs;
    }
    dispatches.push({ campaignId, groupId: groupIds[i], runIndex, scheduledFor: new Date(batchStart) });
  }

  return dispatches;
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

  const runIndex = campaign.runCount;
  const groupIds = campaign.groups.map((g) => g.groupId);

  // For immediate sendType, use now; otherwise use configured startAt
  const startMs = campaign.sendType === "immediate"
    ? Date.now()
    : campaign.startAt.getTime();

  let dispatches: { campaignId: string; groupId: string; runIndex: number; scheduledFor: Date }[];

  if (campaign.sendType === "batch" && campaign.batchSize && campaign.batchIntervalMinutes) {
    dispatches = buildBatchDispatches(
      groupIds, id, runIndex, startMs,
      campaign.batchSize,
      campaign.batchIntervalMinutes * 60 * 1000
    );
  } else {
    dispatches = buildCadenceDispatches(
      groupIds, id, runIndex, startMs,
      campaign.cadenceMinSeconds,
      campaign.cadenceMaxSeconds,
      campaign.cadenceMaxPerHour
    );
  }

  // Delete any existing pending dispatches for this run index (re-schedule)
  await prisma.campaignDispatch.deleteMany({
    where: { campaignId: id, runIndex, status: { in: ["pending", "processing"] } },
  });

  await prisma.campaignDispatch.createMany({ data: dispatches });

  // For immediate, update startAt to now so the scheduler finds it immediately
  const updateData: Record<string, unknown> = { status: "scheduled", nextRunAt: null };
  if (campaign.sendType === "immediate") {
    updateData.startAt = new Date();
  }

  const updated = await prisma.campaign.update({ where: { id }, data: updateData });

  return NextResponse.json({ campaign: updated, dispatches: dispatches.length });
}
