import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const instanceId = searchParams.get("instanceId");

  const apiProvider = await prisma.apiProvider.findUnique({ where: { id } });
  if (!apiProvider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });

  const instance = instanceId
    ? await prisma.whatsAppInstance.findUnique({ where: { id: instanceId } })
    : await prisma.whatsAppInstance.findFirst({ where: { providerId: id }, orderBy: { createdAt: "desc" } });

  if (!instance) return NextResponse.json({ status: "disconnected" });

  // Ownership check — only owner or superadmin (agents only check their own instances)
  const isSuperAdmin = user.role === "superadmin";
  if (!isSuperAdmin && instance.ownerId && instance.ownerId !== user.userId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const provider = getProvider(apiProvider.type);
  try {
    const status = await provider.getStatus(
      { baseUrl: apiProvider.baseUrl, apiKey: apiProvider.apiKey },
      instance.instanceName
    );

    if (status !== instance.status) {
      await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { status } });
      if (status === "connected") {
        await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { qrCode: null } });
      }
    }

    return NextResponse.json({ status, instanceId: instance.id, phone: instance.phone, label: instance.label });
  } catch {
    return NextResponse.json({ status: instance.status, instanceId: instance.id, phone: instance.phone });
  }
}
