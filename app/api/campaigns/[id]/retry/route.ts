import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  const retryTime = new Date();
  const result = await prisma.campaignDispatch.updateMany({
    where: { campaignId: id, status: "failed" },
    data: { status: "pending", scheduledFor: retryTime, errorMessage: null, sentAt: null, messageId: null },
  });

  // Ensure campaign is in scheduled/running state
  if (campaign.status === "completed" || campaign.status === "draft") {
    await prisma.campaign.update({ where: { id }, data: { status: "scheduled" } });
  }

  return NextResponse.json({ retried: result.count });
}
