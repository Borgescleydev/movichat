import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status");
  const ownerFilter = isSuperAdmin(user) ? {} : { createdById: user.userId };
  const campaigns = await prisma.contactCampaign.findMany({
    where: { ...ownerFilter, ...(status ? { status } : {}) },
    include: {
      template: { select: { id: true, name: true, mediaType: true } },
      instance: { select: { id: true, label: true, instanceName: true, status: true } },
      // Count contacts in the DB instead of loading every ContactCampaignContact row just to call .length.
      _count: { select: { contacts: true, dispatches: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Single groupBy aggregates dispatch status counts for all campaigns, replacing the 3N+1 count queries.
  const campaignIds = campaigns.map((c) => c.id);
  const grouped = campaignIds.length
    ? await prisma.contactCampaignDispatch.groupBy({
        by: ["campaignId", "status"],
        where: { campaignId: { in: campaignIds } },
        _count: { _all: true },
      })
    : [];

  const counts = new Map<string, { sent: number; failed: number; pending: number }>();
  for (const id of campaignIds) counts.set(id, { sent: 0, failed: 0, pending: 0 });
  for (const row of grouped) {
    const c = counts.get(row.campaignId);
    if (!c) continue;
    const n = row._count._all;
    if (row.status === "sent") c.sent += n;
    else if (row.status === "failed") c.failed += n;
    else if (row.status === "pending" || row.status === "processing") c.pending += n;
  }

  const enriched = campaigns.map((c) => {
    const cnt = counts.get(c.id)!;
    return { ...c, sentCount: cnt.sent, failedCount: cnt.failed, pendingCount: cnt.pending, totalContacts: c._count.contacts };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const {
    name, description, sendType,
    templateId, instanceId, contactIds, variableValues,
    startAt, repeatType, repeatEndAt,
    cadenceMinSeconds, cadenceMaxSeconds, cadenceMaxPerHour,
    windowStart, windowEnd, windowDays,
    batchSize, batchIntervalMinutes,
    repeatEveryX, repeatEveryUnit,
    isDraft,
  } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!templateId) return NextResponse.json({ error: "Template obrigatório" }, { status: 400 });
  if (!instanceId) return NextResponse.json({ error: "Instância obrigatória" }, { status: 400 });
  if (!isDraft && !contactIds?.length) return NextResponse.json({ error: "Selecione ao menos um contato" }, { status: 400 });

  const resolvedSendType = sendType || "scheduled";
  const resolvedStartAt = resolvedSendType === "immediate" ? new Date() : (startAt ? new Date(startAt) : new Date());

  try {
    const campaign = await prisma.contactCampaign.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        sendType: resolvedSendType,
        templateId,
        instanceId,
        variableValues: JSON.stringify(variableValues || {}),
        startAt: resolvedStartAt,
        repeatType: repeatType || "none",
        repeatEndAt: repeatEndAt ? new Date(repeatEndAt) : null,
        cadenceMinSeconds: Number(cadenceMinSeconds) || 30,
        cadenceMaxSeconds: Number(cadenceMaxSeconds) || 90,
        cadenceMaxPerHour: Number(cadenceMaxPerHour) || 40,
        windowStart: windowStart || null,
        windowEnd: windowEnd || null,
        windowDays: JSON.stringify(windowDays || []),
        batchSize: batchSize ? Number(batchSize) : null,
        batchIntervalMinutes: batchIntervalMinutes ? Number(batchIntervalMinutes) : null,
        repeatEveryX: repeatEveryX ? Number(repeatEveryX) : null,
        repeatEveryUnit: repeatEveryUnit || null,
        createdById: user.userId,
        contacts: contactIds?.length
          ? { create: (contactIds as string[]).map((contactId, index) => ({ contactId, order: index })) }
          : undefined,
      },
      include: {
        template: { select: { id: true, name: true } },
        instance: { select: { id: true, label: true, instanceName: true } },
        contacts: { include: { contact: true } },
      },
    });
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    console.error("[POST /api/individual/campaigns]", err);
    const msg = err instanceof Error ? err.message : "Erro interno ao criar campanha";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
