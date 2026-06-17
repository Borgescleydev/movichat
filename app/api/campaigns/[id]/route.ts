import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      instance: { include: { provider: { select: { id: true, name: true, type: true } } } },
      groups: { include: { group: true }, orderBy: { order: "asc" } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  if (!isSuperAdmin(user) && campaign.createdById !== user.userId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  return NextResponse.json(campaign);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  if (!isSuperAdmin(user) && campaign.createdById !== user.userId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const editableStatuses = ["draft", "paused"];
  if (!editableStatuses.includes(campaign.status) && !body.status) {
    return NextResponse.json({ error: `Não é possível editar campanha com status "${campaign.status}"` }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.channel !== undefined) data.channel = body.channel;
  if (body.sendType !== undefined) data.sendType = body.sendType;
  if (body.templateId !== undefined) data.templateId = body.templateId;
  if (body.instanceId !== undefined) data.instanceId = body.instanceId;
  if (body.variableValues !== undefined) data.variableValues = JSON.stringify(body.variableValues);
  if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
  if (body.repeatType !== undefined) data.repeatType = body.repeatType;
  if (body.repeatEndAt !== undefined) data.repeatEndAt = body.repeatEndAt ? new Date(body.repeatEndAt) : null;
  if (body.cadenceMinSeconds !== undefined) data.cadenceMinSeconds = Number(body.cadenceMinSeconds);
  if (body.cadenceMaxSeconds !== undefined) data.cadenceMaxSeconds = Number(body.cadenceMaxSeconds);
  if (body.cadenceMaxPerHour !== undefined) data.cadenceMaxPerHour = Number(body.cadenceMaxPerHour);
  if (body.windowStart !== undefined) data.windowStart = body.windowStart || null;
  if (body.windowEnd !== undefined) data.windowEnd = body.windowEnd || null;
  if (body.windowDays !== undefined) data.windowDays = JSON.stringify(body.windowDays || []);
  if (body.batchSize !== undefined) data.batchSize = body.batchSize ? Number(body.batchSize) : null;
  if (body.batchIntervalMinutes !== undefined) data.batchIntervalMinutes = body.batchIntervalMinutes ? Number(body.batchIntervalMinutes) : null;
  if (body.repeatEveryX !== undefined) data.repeatEveryX = body.repeatEveryX ? Number(body.repeatEveryX) : null;
  if (body.repeatEveryUnit !== undefined) data.repeatEveryUnit = body.repeatEveryUnit || null;
  if (body.status !== undefined) data.status = body.status;

  if (body.instanceId !== undefined) {
    const isAdminOrAbove = ["superadmin", "admin"].includes(user.role);
    const ownedInstance = await prisma.whatsAppInstance.findFirst({
      where: { id: body.instanceId, ...(isAdminOrAbove ? {} : { ownerId: user.userId }) },
      select: { id: true },
    });
    if (!ownedInstance) return NextResponse.json({ error: "Instância inválida ou sem permissão" }, { status: 403 });
  }

  try {
    if (body.groupIds) {
      await prisma.campaignGroup.deleteMany({ where: { campaignId: id } });
      await prisma.campaignGroup.createMany({
        data: (body.groupIds as string[]).map((groupId: string, index: number) => ({
          campaignId: id, groupId, order: index,
        })),
      });
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data,
      include: {
        template: { select: { id: true, name: true } },
        instance: { select: { id: true, label: true, instanceName: true } },
        groups: { include: { group: true }, orderBy: { order: "asc" } },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[PATCH /api/campaigns/:id]", err);
    const msg = err instanceof Error ? err.message : "Erro interno ao atualizar campanha";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  if (!isSuperAdmin(user) && campaign.createdById !== user.userId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  if (campaign.status === "running") {
    return NextResponse.json({ error: "Pause a campanha antes de excluir" }, { status: 400 });
  }

  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
