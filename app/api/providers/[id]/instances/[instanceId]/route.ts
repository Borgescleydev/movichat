import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

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

  // Ownership check
  if (user.role !== "superadmin" && instance.ownerId && instance.ownerId !== user.userId) {
    return NextResponse.json({ error: "Sem permissão para editar esta instância" }, { status: 403 });
  }

  const updated = await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: {
      ...(body.conversationsEnabled !== undefined ? { conversationsEnabled: body.conversationsEnabled } : {}),
      ...(body.label !== undefined ? { label: body.label } : {}),
    },
  });

  return NextResponse.json(updated);
}
