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
  if (!["scheduled", "running"].includes(campaign.status)) {
    return NextResponse.json({ error: "Apenas campanhas ativas podem ser pausadas" }, { status: 400 });
  }

  const updated = await prisma.campaign.update({ where: { id }, data: { status: "paused" } });
  return NextResponse.json(updated);
}
