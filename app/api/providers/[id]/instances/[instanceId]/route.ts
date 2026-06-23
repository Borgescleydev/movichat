import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/app/generated/prisma/client";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers";

/**
 * Removes all FK-constrained records that block a WhatsAppInstance deletion,
 * then unlinks contacts of this instance.
 *
 * Runs against the transactional client `tx` so that the purge and the
 * subsequent instance delete are atomic: if the delete fails, every deleteMany
 * here rolls back and no orphaned dependents are left behind.
 */
async function purgeInstanceDependents(tx: Prisma.TransactionClient, instanceId: string) {
  // 1. Groups belonging to this instance
  const groups = await tx.whatsAppGroup.findMany({
    where: { instanceId },
    select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);

  // 2. Remove campaign records referencing these groups (from any campaign)
  if (groupIds.length > 0) {
    await tx.campaignDispatch.deleteMany({ where: { groupId: { in: groupIds } } });
    await tx.campaignGroup.deleteMany({ where: { groupId: { in: groupIds } } });
  }

  // 3. Campaigns owned by this instance
  const campaigns = await tx.campaign.findMany({
    where: { instanceId },
    select: { id: true },
  });
  const campaignIds = campaigns.map((c) => c.id);
  if (campaignIds.length > 0) {
    await tx.campaignDispatch.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await tx.campaignGroup.deleteMany({ where: { campaignId: { in: campaignIds } } });
    await tx.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  }

  // 4. Contact campaigns owned by this instance
  const contactCampaigns = await tx.contactCampaign.findMany({
    where: { instanceId },
    select: { id: true },
  });
  const ccIds = contactCampaigns.map((c) => c.id);
  if (ccIds.length > 0) {
    await tx.contactCampaignDispatch.deleteMany({ where: { campaignId: { in: ccIds } } });
    await tx.contactCampaignContact.deleteMany({ where: { campaignId: { in: ccIds } } });
    await tx.contactCampaign.deleteMany({ where: { id: { in: ccIds } } });
  }

  // 5. Quick dispatches owned by this instance.
  // QuickDispatch.instance is a REQUIRED relation with no onDelete rule (schema.prisma),
  // so Prisma defaults to Restrict — leftover rows here throw an opaque FK error and block
  // the whole instance deletion. Deleting the dispatch cascades to QuickDispatchRecipient.
  await tx.quickDispatch.deleteMany({ where: { instanceId } });

  // 6. Unlink contacts linked to this instance
  const contacts = await tx.contact.findMany({
    where: { instanceId },
    select: { id: true },
  });
  const contactIds = contacts.map((c) => c.id);
  if (contactIds.length > 0) {
    await tx.contact.updateMany({ where: { id: { in: contactIds } }, data: { instanceId: null } });
  }

  // After this, prisma can safely delete the instance.
  // Cascade will handle: WhatsAppGroup → DispatchGroupItem, ManualDispatchLog,
  // ScheduledManualDispatch; ContactGroup.sourceInstance is SetNull.
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id, instanceId } = await params;
  const { deleteFromProvider } = await req.json().catch(() => ({ deleteFromProvider: false }));

  const apiProvider = await prisma.apiProvider.findUnique({ where: { id } });
  if (!apiProvider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });

  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, providerId: id },
  });
  if (!instance) return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });

  if (user.role !== "superadmin" && instance.ownerId && instance.ownerId !== user.userId) {
    return NextResponse.json({ error: "Sem permissão para excluir esta instância" }, { status: 403 });
  }

  // Removal is NO LONGER blocked by connection status. A connected instance can be deleted —
  // the user consciously confirms it in the UI (a reinforced, irreversible-action confirmation
  // is shown for connected instances). The final gate is the user's confirmation, not a backend
  // lock. We still best-effort sync the live status so the DB row isn't left stale if it differs.
  if (instance.status === "connected") {
    try {
      const provider = getProvider(apiProvider.type);
      const liveStatus = await provider.getStatus(
        { baseUrl: apiProvider.baseUrl, apiKey: apiProvider.apiKey },
        instance.instanceName
      );
      if (liveStatus && liveStatus !== instance.status) {
        await prisma.whatsAppInstance.update({ where: { id: instanceId }, data: { status: liveStatus } });
      }
    } catch {
      // Provider unreachable — non-fatal, proceed with removal regardless.
    }
  }

  // Only call the provider API when explicitly requested — never required for local-only cleanup
  if (deleteFromProvider) {
    try {
      const provider = getProvider(apiProvider.type);
      await provider.deleteInstance(
        { baseUrl: apiProvider.baseUrl, apiKey: apiProvider.apiKey },
        instance.instanceName
      );
    } catch {
      // Non-fatal — proceed with local deletion regardless
    }
  }

  try {
    // Purge dependents and delete the instance atomically: if the delete fails,
    // the whole purge rolls back so we never leave orphaned campaigns/dispatches/
    // unlinked contacts behind. The external provider call above stays OUT of the
    // transaction — network work doesn't belong in a DB transaction.
    // Bumped timeout above the ~5s interactive default: the purge runs several
    // deleteMany passes and can be slow on high-volume instances.
    await prisma.$transaction(
      async (tx) => {
        await purgeInstanceDependents(tx, instanceId);
        await tx.whatsAppInstance.delete({ where: { id: instanceId } });
      },
      { timeout: 15000 }
    );
  } catch (err) {
    // Surface the REAL reason (e.g. an FK relation not covered by the purge) instead of an
    // opaque 500 with no body, so the UI never falls back to the generic "Erro ao remover instância".
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Não foi possível remover a instância: ${detail}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id, instanceId } = await params;
  const body = await req.json();

  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, providerId: id },
  });
  if (!instance) return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });

  if (user.role !== "superadmin" && instance.ownerId && instance.ownerId !== user.userId) {
    return NextResponse.json({ error: "Sem permissão para editar esta instância" }, { status: 403 });
  }

  const ownerUpdate: Record<string, unknown> = {};
  if (body.ownerId !== undefined) {
    ownerUpdate.ownerId = body.ownerId || null;
  }

  const updated = await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: {
      ...(body.label !== undefined ? { label: body.label } : {}),
      ...ownerUpdate,
    },
  });

  return NextResponse.json(updated);
}
