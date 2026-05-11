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
  const { instanceName, label } = await req.json().catch(() => ({}));

  const apiProvider = await prisma.apiProvider.findUnique({ where: { id } });
  if (!apiProvider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });

  const name = instanceName?.trim() ||
    `movichat_${Date.now()}`.toLowerCase().replace(/[^a-z0-9_]/g, "");

  const appUrl = process.env.APP_URL ||
    (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
    "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/whatsapp/webhook`;

  const provider = getProvider(apiProvider.type);

  try {
    const info = await provider.createInstance(
      { baseUrl: apiProvider.baseUrl, apiKey: apiProvider.apiKey, webhookUrl },
      name,
      webhookUrl
    );

    const instance = await prisma.whatsAppInstance.create({
      data: {
        providerId: id,
        ownerId: user.userId,
        instanceName: name,
        instanceId: info.instanceId,
        status: "connecting",
        qrCode: info.qrCode || null,
        label: label || name,
      },
    });

    await prisma.whatsAppSession.update({
      where: { id: "default" },
      data: { status: "connecting", instanceId: instance.id, providerId: id, qrCode: info.qrCode || null },
    });

    return NextResponse.json(instance);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
