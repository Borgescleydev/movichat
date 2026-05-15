import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers";

// Re-register the webhook URL with the provider for an existing instance
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !["superadmin", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id, instanceId } = await params;

  const apiProvider = await prisma.apiProvider.findUnique({ where: { id } });
  if (!apiProvider) return NextResponse.json({ error: "Provedor não encontrado" }, { status: 404 });

  const instance = await prisma.whatsAppInstance.findFirst({
    where: { id: instanceId, providerId: id },
  });
  if (!instance) return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });

  const appUrl = process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  if (!appUrl) {
    return NextResponse.json({
      error: "APP_URL não configurado. Defina APP_URL=https://seu-servidor.com no arquivo .env.local e reinicie o servidor.",
    }, { status: 400 });
  }

  const webhookUrl = `${appUrl}/api/whatsapp/webhook`;

  const provider = getProvider(apiProvider.type);
  if (!provider.updateWebhook) {
    return NextResponse.json({ error: "Este provedor não suporta atualização de webhook" }, { status: 400 });
  }

  try {
    await provider.updateWebhook(
      { baseUrl: apiProvider.baseUrl, apiKey: apiProvider.apiKey },
      instance.instanceName,
      webhookUrl
    );
    return NextResponse.json({ ok: true, webhookUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Falha ao atualizar webhook: ${msg}` }, { status: 500 });
  }
}
