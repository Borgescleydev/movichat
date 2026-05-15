import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.contactCampaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  if (campaign.status === "completed") {
    return NextResponse.json({ error: "Campanha já concluída" }, { status: 400 });
  }

  // Cancel pending dispatches
  await prisma.contactCampaignDispatch.updateMany({
    where: { campaignId: id, status: { in: ["pending", "processing"] } },
    data: { status: "skipped", errorMessage: "Campanha cancelada" },
  });

  const updated = await prisma.contactCampaign.update({
    where: { id },
    data: { status: "cancelled" },
  });

  return NextResponse.json(updated);
}
