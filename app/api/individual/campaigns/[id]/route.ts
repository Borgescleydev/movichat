import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser, isSuperAdmin } from "@/lib/auth";

async function checkOwnership(id: string, userId: string, superadmin: boolean) {
  const c = await prisma.contactCampaign.findUnique({ where: { id }, select: { createdById: true, status: true } });
  if (!c) return { error: "Campanha não encontrada", status: 404 };
  if (!superadmin && c.createdById !== userId) return { error: "Sem permissão", status: 403 };
  return { ok: true, campaignStatus: c.status };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const campaign = await prisma.contactCampaign.findUnique({
    where: { id },
    include: {
      template: true,
      instance: { select: { id: true, label: true, instanceName: true, status: true } },
      contacts: { include: { contact: true }, orderBy: { order: "asc" } },
    },
  });

  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  return NextResponse.json(campaign);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const body = await req.json();
  const {
    name, description, sendType,
    templateId, instanceId, contactIds, variableValues,
    startAt, repeatType, repeatEndAt,
    cadenceMinSeconds, cadenceMaxSeconds, cadenceMaxPerHour,
    windowStart, windowEnd, windowDays,
    batchSize, batchIntervalMinutes,
    repeatEveryX, repeatEveryUnit,
  } = body;

  if (instanceId !== undefined) {
    const isAdminOrAbove = ["superadmin", "admin"].includes(user.role);
    const ownedInstance = await prisma.whatsAppInstance.findFirst({
      where: { id: instanceId, ...(isAdminOrAbove ? {} : { ownerId: user.userId }) },
      select: { id: true },
    });
    if (!ownedInstance) return NextResponse.json({ error: "Instância inválida ou sem permissão" }, { status: 403 });
  }

  try {
    const campaign = await prisma.contactCampaign.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(sendType !== undefined && { sendType }),
        ...(templateId !== undefined && { templateId }),
        ...(instanceId !== undefined && { instanceId }),
        ...(variableValues !== undefined && { variableValues: JSON.stringify(variableValues) }),
        ...(startAt !== undefined && { startAt: new Date(startAt) }),
        ...(repeatType !== undefined && { repeatType }),
        ...(repeatEndAt !== undefined && { repeatEndAt: repeatEndAt ? new Date(repeatEndAt) : null }),
        ...(cadenceMinSeconds !== undefined && { cadenceMinSeconds: Number(cadenceMinSeconds) }),
        ...(cadenceMaxSeconds !== undefined && { cadenceMaxSeconds: Number(cadenceMaxSeconds) }),
        ...(cadenceMaxPerHour !== undefined && { cadenceMaxPerHour: Number(cadenceMaxPerHour) }),
        ...(windowStart !== undefined && { windowStart: windowStart || null }),
        ...(windowEnd !== undefined && { windowEnd: windowEnd || null }),
        ...(windowDays !== undefined && { windowDays: JSON.stringify(windowDays || []) }),
        ...(batchSize !== undefined && { batchSize: batchSize ? Number(batchSize) : null }),
        ...(batchIntervalMinutes !== undefined && { batchIntervalMinutes: batchIntervalMinutes ? Number(batchIntervalMinutes) : null }),
        ...(repeatEveryX !== undefined && { repeatEveryX: repeatEveryX ? Number(repeatEveryX) : null }),
        ...(repeatEveryUnit !== undefined && { repeatEveryUnit: repeatEveryUnit || null }),
      },
    });

    // Update contacts if provided
    if (contactIds !== undefined) {
      await prisma.contactCampaignContact.deleteMany({ where: { campaignId: id } });
      if (contactIds.length > 0) {
        await prisma.contactCampaignContact.createMany({
          data: (contactIds as string[]).map((contactId: string, index: number) => ({
            campaignId: id,
            contactId,
            order: index,
          })),
        });
      }
    }

    return NextResponse.json(campaign);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar campanha";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const check = await checkOwnership(id, user.userId, isSuperAdmin(user));
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  if (["running", "scheduled"].includes(check.campaignStatus!)) {
    return NextResponse.json({ error: "Não é possível excluir campanha em andamento" }, { status: 400 });
  }

  try {
    await prisma.contactCampaign.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao excluir";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
