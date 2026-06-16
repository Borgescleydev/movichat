import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status");
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20));
  const ownerFilter = isSuperAdmin(user) ? {} : { createdById: user.userId };
  const where = { ...ownerFilter, ...(status ? { status } : {}) };

  const [total, campaigns] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      include: {
        template: { select: { id: true, name: true, mediaType: true } },
        instance: { select: { id: true, label: true, instanceName: true, status: true } },
        groups: { include: { group: { select: { id: true, name: true, groupJid: true } } } },
        _count: { select: { dispatches: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  // Single groupBy aggregates dispatch status counts for all campaigns on this page,
  // replacing the previous 3N+1 per-campaign count queries.
  const campaignIds = campaigns.map((c) => c.id);
  const grouped = campaignIds.length
    ? await prisma.campaignDispatch.groupBy({
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

  const data = campaigns.map((c) => {
    const cnt = counts.get(c.id)!;
    return { ...c, sentCount: cnt.sent, failedCount: cnt.failed, pendingCount: cnt.pending, totalGroups: c.groups.length };
  });

  return NextResponse.json({ data, total, page, limit });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const {
    name, description, channel, sendType,
    templateId, instanceId, groupIds, variableValues,
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
  // Groups are required only when NOT saving as a bare draft
  if (!isDraft && !groupIds?.length) return NextResponse.json({ error: "Selecione ao menos um grupo" }, { status: 400 });

  // Non-superadmin can only use instances they own
  if (!isSuperAdmin(user)) {
    const instance = await prisma.whatsAppInstance.findUnique({ where: { id: instanceId }, select: { ownerId: true } });
    if (!instance || instance.ownerId !== user.userId) {
      return NextResponse.json({ error: "Instância não pertence a você" }, { status: 403 });
    }
  }

  const resolvedSendType = sendType || "scheduled";
  const resolvedStartAt = resolvedSendType === "immediate" ? new Date() : (startAt ? new Date(startAt) : new Date());

  let campaign;
  try {
    campaign = await prisma.campaign.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        channel: channel || "whatsapp",
        sendType: resolvedSendType,
        templateId,
        instanceId,
        createdById: user.userId,
        variableValues: JSON.stringify(variableValues || {}),
        startAt: resolvedStartAt,
        repeatType: repeatType || "none",
        repeatEndAt: repeatEndAt ? new Date(repeatEndAt) : null,
        cadenceMinSeconds: Number(cadenceMinSeconds) || 10,
        cadenceMaxSeconds: Number(cadenceMaxSeconds) || 30,
        cadenceMaxPerHour: Number(cadenceMaxPerHour) || 60,
        windowStart: windowStart || null,
        windowEnd: windowEnd || null,
        windowDays: JSON.stringify(windowDays || []),
        batchSize: batchSize ? Number(batchSize) : null,
        batchIntervalMinutes: batchIntervalMinutes ? Number(batchIntervalMinutes) : null,
        repeatEveryX: repeatEveryX ? Number(repeatEveryX) : null,
        repeatEveryUnit: repeatEveryUnit || null,
        groups: groupIds?.length
          ? { create: (groupIds as string[]).map((groupId, index) => ({ groupId, order: index })) }
          : undefined,
      },
      include: {
        template: { select: { id: true, name: true } },
        instance: { select: { id: true, label: true, instanceName: true } },
        groups: { include: { group: true } },
      },
    });
  } catch (err) {
    console.error("[POST /api/campaigns]", err);
    const msg = err instanceof Error ? err.message : "Erro interno ao criar campanha";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json(campaign, { status: 201 });
}
