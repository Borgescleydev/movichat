import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const instanceId = req.nextUrl.searchParams.get("instanceId");
  const groups = await prisma.whatsAppGroup.findMany({
    where: instanceId ? { instanceId } : {},
    include: { instance: { select: { label: true, instanceName: true, status: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ groups });
}
