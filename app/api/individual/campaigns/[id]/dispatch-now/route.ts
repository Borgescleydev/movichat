import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { runContactDispatcher } from "@/lib/contact-dispatcher";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.contactCampaign.findUnique({
    where: { id },
    include: { contacts: { orderBy: { order: "asc" } }, instance: true },
  });

  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  if (!["draft", "paused", "scheduled"].includes(campaign.status)) {
    return NextResponse.json({ error: `Não é possível disparar campanha com status "${campaign.status}"` }, { status: 400 });
  }
  if (campaign.contacts.length === 0) {
    return NextResponse.json({ error: "Adicione ao menos um contato à campanha" }, { status: 400 });
  }
  if (campaign.instance.status !== "connected") {
    return NextResponse.json({ error: "A instância WhatsApp não está conectada" }, { status: 400 });
  }

  const runIndex = campaign.runCount;
  const now = Date.now();

  // Cancel existing pending dispatches
  await prisma.contactCampaignDispatch.deleteMany({
    where: { campaignId: id, runIndex, status: { in: ["pending", "processing"] } },
  });

  // Create immediate dispatches (all at now)
  const dispatches = campaign.contacts.map((c) => ({
    campaignId: id,
    contactId: c.contactId,
    runIndex,
    scheduledFor: new Date(now),
  }));

  await prisma.contactCampaignDispatch.createMany({ data: dispatches });

  await prisma.contactCampaign.update({
    where: { id },
    data: { status: "scheduled", startAt: new Date(now) },
  });

  // Immediately trigger the dispatcher
  const result = await runContactDispatcher();

  return NextResponse.json({ dispatched: dispatches.length, result });
}
