import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const status = req.nextUrl.searchParams.get("status");
  const campaigns = await prisma.campaign.findMany({
    where: status ? { status } : {},
    include: {
      template: { select: { id: true, name: true, mediaType: true } },
      instance: { select: { id: true, label: true, instanceName: true, status: true } },
      groups: { include: { group: { select: { id: true, name: true, groupJid: true } } } },
      _count: { select: { dispatches: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const enriched = await Promise.all(
    campaigns.map(async (c) => {
      const [sentCount, failedCount, pendingCount] = await Promise.all([
        prisma.campaignDispatch.count({ where: { campaignId: c.id, status: "sent" } }),
        prisma.campaignDispatch.count({ where: { campaignId: c.id, status: "failed" } }),
        prisma.campaignDispatch.count({ where: { campaignId: c.id, status: { in: ["pending", "processing"] } } }),
      ]);
      const totalGroups = c.groups.length;
      return { ...c, sentCount, failedCount, pendingCount, totalGroups };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const {
    name, description, channel, sendType,
    templateId, instanceId, groupIds, variableValues,
    startAt, repeatType, repeatEndAt,
    cadenceMinSeconds, cadenceMaxSeconds, cadenceMaxPerHour,
    windowStart, windowEnd, windowDays,
    batchSize, batchIntervalMinutes,
    repeatEveryX, repeatEveryUnit,
  } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
  if (!templateId) return NextResponse.json({ error: "Template obrigatório" }, { status: 400 });
  if (!instanceId) return NextResponse.json({ error: "Instância obrigatória" }, { status: 400 });
  if (!groupIds?.length) return NextResponse.json({ error: "Selecione ao menos um grupo" }, { status: 400 });

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
      groups: {
        create: (groupIds as string[]).map((groupId, index) => ({ groupId, order: index })),
      },
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
