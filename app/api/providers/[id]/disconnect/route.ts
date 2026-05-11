import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const { instanceId } = await req.json().catch(() => ({}));

  const apiProvider = await prisma.apiProvider.findUnique({ where: { id } });
  if (!apiProvider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });

  const instance = await prisma.whatsAppInstance.findUnique({ where: { id: instanceId } });
  if (!instance) return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });

  // Ownership check — only owner or superadmin can disconnect
  if (user.role !== "superadmin" && instance.ownerId && instance.ownerId !== user.userId) {
    return NextResponse.json({ error: "Sem permissão para desconectar esta instância" }, { status: 403 });
  }

  const provider = getProvider(apiProvider.type);

  try {
    await provider.deleteInstance(
      { baseUrl: apiProvider.baseUrl, apiKey: apiProvider.apiKey },
      instance.instanceName
    );
  } catch {
    // Non-fatal — remove from DB anyway
  }

  await prisma.whatsAppInstance.update({
    where: { id: instanceId },
    data: { status: "disconnected", qrCode: null },
  });

  return NextResponse.json({ ok: true });
}
