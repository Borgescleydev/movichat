import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers";

// Pull message history for a contact directly from the provider API.
// Useful when the webhook URL is misconfigured and messages weren't received in real-time.
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { contactId, count = 50 } = await req.json();
  if (!contactId) return NextResponse.json({ error: "contactId obrigatório" }, { status: 400 });

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: { instance: { include: { provider: true } } },
  });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  if (!contact.instance) return NextResponse.json({ error: "Contato sem instância vinculada" }, { status: 400 });

  const { instance } = contact;
  if (instance.status !== "connected") {
    return NextResponse.json({ error: "Instância não conectada" }, { status: 400 });
  }

  const provider = getProvider(instance.provider.type);
  if (!provider.fetchMessages) {
    return NextResponse.json({ error: "Este provedor não suporta busca de histórico" }, { status: 400 });
  }

  const config = { baseUrl: instance.provider.baseUrl, apiKey: instance.provider.apiKey };
  const fetched = await provider.fetchMessages(config, instance.instanceName, contact.phone, count);

  if (fetched.length === 0) {
    return NextResponse.json({ imported: 0, message: "Nenhuma mensagem encontrada no provedor." });
  }

  // Upsert each message — skip if waMessageId already exists
  let imported = 0;
  for (const m of fetched) {
    if (m.waMessageId) {
      const existing = await prisma.message.findFirst({ where: { waMessageId: m.waMessageId } });
      if (existing) continue;
    }
    await prisma.message.create({
      data: {
        contactId: contact.id,
        body: m.body,
        fromMe: m.fromMe,
        timestamp: m.timestamp ? new Date(m.timestamp * 1000) : new Date(),
        status: m.fromMe ? "sent" : "received",
        ...(m.waMessageId ? { waMessageId: m.waMessageId } : {}),
        ...(m.mediaBase64 ? { mediaUrl: m.mediaBase64 } : {}),
        ...(m.mediaType   ? { mediaType: m.mediaType }   : {}),
      },
    });
    imported++;
  }

  // Update contact updatedAt so it bubbles up in the list
  if (imported > 0) {
    await prisma.contact.update({ where: { id: contactId }, data: { updatedAt: new Date() } });
  }

  return NextResponse.json({ imported, total: fetched.length });
}
