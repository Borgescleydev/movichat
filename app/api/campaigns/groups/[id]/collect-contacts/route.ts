import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const requestedName = typeof body.name === "string" ? body.name.trim() : "";

  const group = await prisma.whatsAppGroup.findUnique({
    where: { id },
    include: { instance: { include: { provider: true } } },
  });

  if (!group) return NextResponse.json({ error: "Grupo nao encontrado" }, { status: 404 });
  if (group.instance.status !== "connected") {
    return NextResponse.json({ error: "A instancia do grupo nao esta conectada" }, { status: 400 });
  }

  const provider = getProvider(group.instance.provider.type);
  if (!provider.fetchGroupParticipants) {
    return NextResponse.json({ error: "O provedor desta instancia nao suporta coleta de contatos de grupo" }, { status: 400 });
  }

  const participants = await provider.fetchGroupParticipants(
    { baseUrl: group.instance.provider.baseUrl, apiKey: group.instance.provider.apiKey },
    group.instance.instanceName,
    group.groupJid,
  );

  const byPhone = new Map(participants.map((participant) => [participant.phone, participant]));
  const uniqueParticipants = [...byPhone.values()];
  if (uniqueParticipants.length === 0) {
    return NextResponse.json({ error: "Nenhum contato valido foi encontrado no grupo" }, { status: 400 });
  }

  const defaultColumn = await prisma.pipelineColumn.findFirst({ where: { isDefault: true } })
    ?? await prisma.pipelineColumn.findFirst({ orderBy: { order: "asc" } });
  if (!defaultColumn) {
    return NextResponse.json({ error: "Crie uma coluna no pipeline antes de importar contatos" }, { status: 400 });
  }

  const contactIds: { contactId: string; sourcePhone: string; sourceName?: string; rawJson?: string | null }[] = [];
  for (const participant of uniqueParticipants) {
    const contact = await prisma.contact.upsert({
      where: { phone: participant.phone },
      update: {
        name: participant.name || participant.phone,
        instanceId: group.instanceId,
      },
      create: {
        name: participant.name || participant.phone,
        phone: participant.phone,
        columnId: defaultColumn.id,
        instanceId: group.instanceId,
        notes: `Origem: grupo ${group.name}`,
      },
      select: { id: true },
    });
    contactIds.push({
      contactId: contact.id,
      sourcePhone: participant.phone,
      sourceName: participant.name,
      rawJson: participant.raw ? JSON.stringify(participant.raw) : null,
    });
  }

  const contactGroup = await prisma.contactGroup.create({
    data: {
      name: requestedName || `Contatos - ${group.name}`,
      description: `Coletado automaticamente do grupo WhatsApp ${group.name}.`,
      sourceGroupId: group.id,
      sourceGroupName: group.name,
      sourceGroupJid: group.groupJid,
      sourceInstanceId: group.instanceId,
      createdById: user.userId,
      items: {
        create: contactIds.map((item) => ({
          contactId: item.contactId,
          sourcePhone: item.sourcePhone,
          sourceName: item.sourceName || null,
          rawJson: item.rawJson || null,
        })),
      },
    },
    include: {
      sourceInstance: { select: { id: true, label: true, instanceName: true } },
      _count: { select: { items: true } },
    },
  });

  return NextResponse.json({
    contactGroup,
    imported: contactIds.length,
    skipped: participants.length - contactIds.length,
  }, { status: 201 });
}
