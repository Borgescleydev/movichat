import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const MEDIA_TYPES = ["image", "video", "audio", "document"];

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const ownerFilter = isSuperAdmin(user) ? {} : { createdById: user.userId };
  const dispatches = await prisma.quickDispatch.findMany({
    where: { ...ownerFilter },
    include: {
      instance: { select: { id: true, label: true, instanceName: true, status: true } },
      _count: { select: { recipients: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const ids = dispatches.map((d) => d.id);
  const grouped = ids.length
    ? await prisma.quickDispatchRecipient.groupBy({
        by: ["quickDispatchId", "status"],
        where: { quickDispatchId: { in: ids } },
        _count: { _all: true },
      })
    : [];

  const counts = new Map<string, { sent: number; failed: number; pending: number }>();
  for (const id of ids) counts.set(id, { sent: 0, failed: 0, pending: 0 });
  for (const row of grouped) {
    const c = counts.get(row.quickDispatchId);
    if (!c) continue;
    const n = row._count._all;
    if (row.status === "sent") c.sent += n;
    else if (row.status === "failed") c.failed += n;
    else if (row.status === "pending" || row.status === "processing") c.pending += n;
  }

  const enriched = dispatches.map((d) => {
    const cnt = counts.get(d.id)!;
    return {
      id: d.id,
      name: d.name,
      status: d.status,
      createdAt: d.createdAt,
      total: d._count.recipients,
      sentCount: cnt.sent,
      failedCount: cnt.failed,
      pendingCount: cnt.pending,
      instance: d.instance
        ? { label: d.instance.label, instanceName: d.instance.instanceName, status: d.instance.status }
        : null,
    };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const {
    name,
    instanceId,
    message,
    media,
    cadenceMinSeconds,
    cadenceMaxSeconds,
    cadenceMaxPerHour,
    startAt,
    recipients,
  } = body as {
    name?: string;
    instanceId?: string;
    message?: string;
    media?: { type: string; url: string; caption?: string; fileName?: string } | null;
    cadenceMinSeconds?: number;
    cadenceMaxSeconds?: number;
    cadenceMaxPerHour?: number;
    startAt?: string;
    recipients?: Array<{ phone: string; vars: Record<string, string> }>;
  };

  // --- Validações ---
  if (!instanceId) return NextResponse.json({ error: "Instância obrigatória" }, { status: 400 });

  const isAdminOrAbove = ["superadmin", "admin"].includes(user.role);
  const ownedInstance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, ...(isAdminOrAbove ? {} : { ownerId: user.userId }) },
    select: { id: true },
  });
  if (!ownedInstance) return NextResponse.json({ error: "Instância inválida ou sem permissão" }, { status: 403 });

  if (!message?.trim()) return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 });
  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos um destinatário" }, { status: 400 });
  }

  const cadenceMin = Number(cadenceMinSeconds) || 10;
  const cadenceMax = Number(cadenceMaxSeconds) || 30;
  if (cadenceMin > cadenceMax) {
    return NextResponse.json({ error: "Cadência mínima não pode ser maior que a máxima" }, { status: 400 });
  }
  const maxPerHour = Number(cadenceMaxPerHour) || 60;

  // --- Mídia ---
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaCaption: string | null = null;
  if (media && media.type && media.url) {
    if (!MEDIA_TYPES.includes(media.type)) {
      return NextResponse.json({ error: "Tipo de mídia inválido" }, { status: 400 });
    }
    mediaType = media.type;
    mediaUrl = media.url;
    mediaCaption = media.caption?.trim() ? media.caption : null;
  }

  // --- Limpeza dos destinatários ---
  let skipped = 0;
  const cleaned: Array<{ phone: string; vars: Record<string, string> }> = [];
  for (const r of recipients) {
    const phone = String(r?.phone ?? "").replace(/\D/g, "");
    if (phone.length < 7) {
      skipped++;
      continue;
    }
    cleaned.push({ phone, vars: r?.vars && typeof r.vars === "object" ? r.vars : {} });
  }

  if (cleaned.length === 0) {
    return NextResponse.json({ error: "Nenhum destinatário válido (telefones com menos de 7 dígitos)" }, { status: 400 });
  }

  // --- Cálculo dos horários espaçados pela cadência ---
  const baseStart = startAt ? new Date(startAt) : new Date();
  const startMs = isNaN(baseStart.getTime()) ? Date.now() : baseStart.getTime();

  const hourBuckets: Record<number, number> = {};
  let cursor = startMs;
  const scheduled: Date[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    if (i > 0) {
      const delaySec = randomBetween(cadenceMin, cadenceMax);
      cursor += delaySec * 1000;
      const hourKey = Math.floor(cursor / 3_600_000);
      hourBuckets[hourKey] = (hourBuckets[hourKey] || 0) + 1;
      if (hourBuckets[hourKey] > maxPerHour) {
        cursor = (hourKey + 1) * 3_600_000;
        hourBuckets[hourKey + 1] = 1;
      }
    } else {
      hourBuckets[Math.floor(cursor / 3_600_000)] = 1;
    }
    scheduled.push(new Date(cursor));
  }

  try {
    const dispatch = await prisma.quickDispatch.create({
      data: {
        name: name?.trim() || null,
        instanceId,
        message,
        mediaType,
        mediaUrl,
        mediaCaption,
        status: "scheduled",
        cadenceMinSeconds: cadenceMin,
        cadenceMaxSeconds: cadenceMax,
        cadenceMaxPerHour: maxPerHour,
        startAt: new Date(startMs),
        createdById: user.userId,
        recipients: {
          create: cleaned.map((r, index) => ({
            phone: r.phone,
            varsJson: JSON.stringify(r.vars),
            order: index,
            scheduledFor: scheduled[index],
          })),
        },
      },
      select: { id: true },
    });

    return NextResponse.json(
      { id: dispatch.id, total: cleaned.length, scheduled: cleaned.length, skipped },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/individual/quick-dispatch]", err);
    const msg = err instanceof Error ? err.message : "Erro interno ao criar disparo rápido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
