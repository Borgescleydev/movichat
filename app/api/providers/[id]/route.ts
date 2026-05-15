import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  if (body.isDefault) {
    await prisma.apiProvider.updateMany({ where: {}, data: { isDefault: false } });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl.replace(/\/$/, "");
  if (body.apiKey !== undefined) data.apiKey = body.apiKey;
  if (body.active !== undefined) data.active = body.active;
  if (body.isDefault !== undefined) data.isDefault = body.isDefault;
  if (body.type !== undefined) data.type = body.type;

  const provider = await prisma.apiProvider.update({ where: { id }, data });
  return NextResponse.json({ ...provider, apiKey: provider.apiKey.slice(0, 6) + "••••••" });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;

  const provider = await prisma.apiProvider.findUnique({ where: { id } });
  if (!provider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });

  // Clean up all FK-constrained dependencies for every instance of this provider.
  // No remote API calls are made — this is a local-only operation.
  const instances = await prisma.whatsAppInstance.findMany({
    where: { providerId: id },
    select: { id: true },
  });

  for (const inst of instances) {
    const instanceId = inst.id;

    // Groups of this instance
    const groups = await prisma.whatsAppGroup.findMany({
      where: { instanceId },
      select: { id: true },
    });
    const groupIds = groups.map((g) => g.id);

    // Remove campaign records referencing these groups (any campaign)
    if (groupIds.length > 0) {
      await prisma.campaignDispatch.deleteMany({ where: { groupId: { in: groupIds } } });
      await prisma.campaignGroup.deleteMany({ where: { groupId: { in: groupIds } } });
    }

    // Campaigns owned by this instance
    const campaigns = await prisma.campaign.findMany({
      where: { instanceId },
      select: { id: true },
    });
    const campaignIds = campaigns.map((c) => c.id);
    if (campaignIds.length > 0) {
      await prisma.campaignDispatch.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.campaignGroup.deleteMany({ where: { campaignId: { in: campaignIds } } });
      await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    }

    // Contact campaigns owned by this instance
    const contactCampaigns = await prisma.contactCampaign.findMany({
      where: { instanceId },
      select: { id: true },
    });
    const ccIds = contactCampaigns.map((c) => c.id);
    if (ccIds.length > 0) {
      await prisma.contactCampaignDispatch.deleteMany({ where: { campaignId: { in: ccIds } } });
      await prisma.contactCampaignContact.deleteMany({ where: { campaignId: { in: ccIds } } });
      await prisma.contactCampaign.deleteMany({ where: { id: { in: ccIds } } });
    }

    // Delete conversations (messages) for contacts of this instance, then unlink contacts
    const contacts = await prisma.contact.findMany({
      where: { instanceId },
      select: { id: true },
    });
    const contactIds = contacts.map((c) => c.id);
    if (contactIds.length > 0) {
      await prisma.message.deleteMany({ where: { contactId: { in: contactIds } } });
      await prisma.contact.updateMany({ where: { id: { in: contactIds } }, data: { instanceId: null } });
    }
  }

  // Now safe to delete the provider — cascade deletes instances → groups → dispatchGroupItems, manualLogs
  await prisma.apiProvider.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
