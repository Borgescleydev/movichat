import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildCadenceDispatches(
  contactIds: string[],
  campaignId: string,
  runIndex: number,
  startMs: number,
  cadenceMin: number,
  cadenceMax: number,
  cadenceMaxPerHour: number
) {
  const hourBuckets: Record<number, number> = {};
  let cursor = startMs;
  const dispatches: { campaignId: string; contactId: string; runIndex: number; scheduledFor: Date }[] = [];

  for (let i = 0; i < contactIds.length; i++) {
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
    dispatches.push({ campaignId, contactId: contactIds[i], runIndex, scheduledFor: new Date(cursor) });
  }

  return dispatches;
}

function buildBatchDispatches(
  contactIds: string[],
  campaignId: string,
  runIndex: number,
  startMs: number,
  batchSize: number,
  batchIntervalMs: number
) {
  const dispatches: { campaignId: string; contactId: string; runIndex: number; scheduledFor: Date }[] = [];
  let batchStart = startMs;

  for (let i = 0; i < contactIds.length; i++) {
    if (i > 0 && i % batchSize === 0) {
      batchStart += batchIntervalMs;
    }
    dispatches.push({ campaignId, contactId: contactIds[i], runIndex, scheduledFor: new Date(batchStart) });
  }

  return dispatches;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.contactCampaign.findUnique({
    where: { id },
    include: {
      template: true,
      instance: true,
      contacts: { orderBy: { order: "asc" } },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  if (!["draft", "paused"].includes(campaign.status)) {
    return NextResponse.json({ error: `Não é possível agendar campanha com status "${campaign.status}"` }, { status: 400 });
  }
  if (campaign.contacts.length === 0) {
    return NextResponse.json({ error: "Adicione ao menos um contato à campanha" }, { status: 400 });
  }
  if (campaign.instance.status !== "connected") {
    return NextResponse.json({ error: "A instância WhatsApp não está conectada" }, { status: 400 });
  }

  const runIndex = campaign.runCount;
  const contactIds = campaign.contacts.map((c) => c.contactId);

  const startMs = campaign.sendType === "immediate"
    ? Date.now()
    : campaign.startAt.getTime();

  let dispatches: { campaignId: string; contactId: string; runIndex: number; scheduledFor: Date }[];

  if (campaign.sendType === "batch" && campaign.batchSize && campaign.batchIntervalMinutes) {
    dispatches = buildBatchDispatches(
      contactIds, id, runIndex, startMs,
      campaign.batchSize,
      campaign.batchIntervalMinutes * 60 * 1000
    );
  } else {
    dispatches = buildCadenceDispatches(
      contactIds, id, runIndex, startMs,
      campaign.cadenceMinSeconds,
      campaign.cadenceMaxSeconds,
      campaign.cadenceMaxPerHour
    );
  }

  // Delete any existing pending dispatches for this run index (re-schedule)
  await prisma.contactCampaignDispatch.deleteMany({
    where: { campaignId: id, runIndex, status: { in: ["pending", "processing"] } },
  });

  await prisma.contactCampaignDispatch.createMany({ data: dispatches });

  const updateData: Record<string, unknown> = { status: "scheduled", nextRunAt: null };
  if (campaign.sendType === "immediate") {
    updateData.startAt = new Date();
  }

  const updated = await prisma.contactCampaign.update({ where: { id }, data: updateData });

  return NextResponse.json({ campaign: updated, dispatches: dispatches.length });
}
