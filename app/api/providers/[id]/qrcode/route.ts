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

  if (!instance) return NextResponse.json({ qrCode: null, status: "disconnected" });

  // Check cached QR first
  if (instance.qrCode && instance.status === "connecting") {
    return NextResponse.json({ qrCode: instance.qrCode, status: instance.status });
  }

  // Fetch fresh from provider
  const provider = getProvider(apiProvider.type);
  try {
    const qr = await provider.getQrCode(
      { baseUrl: apiProvider.baseUrl, apiKey: apiProvider.apiKey },
      instance.instanceName
    );

    if (qr) {
      await prisma.whatsAppInstance.update({ where: { id: instance.id }, data: { qrCode: qr } });
    }

    return NextResponse.json({ qrCode: qr, status: instance.status, instanceId: instance.id });
  } catch {
    return NextResponse.json({ qrCode: instance.qrCode, status: instance.status, instanceId: instance.id });
  }
}
