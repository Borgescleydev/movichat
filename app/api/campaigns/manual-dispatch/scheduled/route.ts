import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET() {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const where = isSuperAdmin(user) ? {} : { createdById: user.userId };
  const schedules = await prisma.scheduledManualDispatch.findMany({
    where,
    include: { instance: { select: { label: true, instanceName: true, status: true } } },
    orderBy: { scheduledFor: "desc" },
    take: 50,
  });

  return NextResponse.json({ schedules });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const body = await req.json();
  const { instanceId, groupIds, message, mediaType, mediaUrl, mediaCaption, fileName, scheduledFor } = body as {
    instanceId?: string;
    groupIds?: string[];
    message?: string;
    mediaType?: string;
    mediaUrl?: string;
    mediaCaption?: string;
    fileName?: string;
    scheduledFor?: string;
  };

  const hasMedia = Boolean(mediaType && mediaUrl?.trim());
  if (!instanceId || !Array.isArray(groupIds) || groupIds.length === 0 || (!message?.trim() && !hasMedia)) {
    return NextResponse.json({ error: "instanceId, groupIds e mensagem ou midia sao obrigatorios" }, { status: 400 });
  }

  const scheduledDate = scheduledFor ? new Date(scheduledFor) : null;
  if (!scheduledDate || Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: "Data de agendamento invalida" }, { status: 400 });
  }
  if (scheduledDate.getTime() < Date.now() - 60_000) {
    return NextResponse.json({ error: "Escolha uma data futura para o agendamento" }, { status: 400 });
  }

  const instance = await prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });
  if (!instance) return NextResponse.json({ error: "Instancia nao encontrada" }, { status: 404 });
  if (instance.status !== "connected") {
    return NextResponse.json({ error: "A instancia nao esta conectada" }, { status: 400 });
  }

  const validGroups = await prisma.whatsAppGroup.count({ where: { id: { in: groupIds }, instanceId } });
  if (validGroups === 0) return NextResponse.json({ error: "Nenhum grupo valido encontrado" }, { status: 400 });

  const schedule = await prisma.scheduledManualDispatch.create({
    data: {
      instanceId,
      groupIds: JSON.stringify(groupIds),
      message: message?.trim() || mediaCaption?.trim() || "",
      mediaType: hasMedia ? mediaType : null,
      mediaUrl: hasMedia ? mediaUrl : null,
      mediaCaption: hasMedia ? (mediaCaption || null) : null,
      fileName: fileName || null,
      scheduledFor: scheduledDate,
      createdById: user.userId,
    },
  });

  return NextResponse.json(schedule, { status: 201 });
}
