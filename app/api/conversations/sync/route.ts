import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";
import { getProvider } from "@/lib/providers";

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { instanceId } = await req.json();
  if (!instanceId) return NextResponse.json({ error: "instanceId obrigatório" }, { status: 400 });

  const instance = await prisma.whatsAppInstance.findUnique({
    where: { id: instanceId },
    include: { provider: true },
  });
  if (!instance) return NextResponse.json({ error: "Instância não encontrada" }, { status: 404 });
  if (instance.status !== "connected") {
    return NextResponse.json({ error: "Instância não conectada" }, { status: 400 });
  }

  const provider = getProvider(instance.provider.type);
  if (!provider.fetchChats) {
    return NextResponse.json({ error: "Este provedor não suporta sincronização de conversas" }, { status: 400 });
  }

  const config = { baseUrl: instance.provider.baseUrl, apiKey: instance.provider.apiKey };
  const chats = await provider.fetchChats(config, instance.instanceName);

  if (chats.length === 0) {
    return NextResponse.json({ synced: 0, message: "Nenhuma conversa encontrada na instância." });
  }

  // Get default pipeline column
  const defaultColumn = await prisma.pipelineColumn.findFirst({ where: { isDefault: true } })
    || await prisma.pipelineColumn.findFirst({ orderBy: { order: "asc" } });
  if (!defaultColumn) {
    return NextResponse.json({ error: "Nenhuma coluna de pipeline configurada" }, { status: 500 });
  }

  let created = 0;
  let updated = 0;

  for (const chat of chats) {
    const existingContact = await prisma.contact.findUnique({ where: { phone: chat.phone } });

    if (existingContact) {
      // Update name and link to instance if not already linked
      await prisma.contact.update({
        where: { id: existingContact.id },
        data: {
          name: chat.name !== chat.phone ? chat.name : existingContact.name,
          instanceId: existingContact.instanceId || instanceId,
          updatedAt: new Date(),
        },
      });

      // Upsert last message if present
      if (chat.lastMessageText && chat.lastMessageTs) {
        const ts = new Date(chat.lastMessageTs * 1000);
        const existing = await prisma.message.findFirst({
          where: { contactId: existingContact.id },
          orderBy: { timestamp: "desc" },
        });
        // Only add if newer than latest stored message
        if (!existing || ts > existing.timestamp) {
          await prisma.message.create({
            data: {
              contactId: existingContact.id,
              body: chat.lastMessageText,
              fromMe: chat.lastMessageFromMe ?? false,
              timestamp: ts,
              status: "received",
            },
          });
        }
      }
      updated++;
    } else {
      // Create new contact
      const contact = await prisma.contact.create({
        data: {
          name: chat.name !== chat.phone ? chat.name : `+${chat.phone}`,
          phone: chat.phone,
          columnId: defaultColumn.id,
          instanceId,
        },
      });

      if (chat.lastMessageText && chat.lastMessageTs) {
        await prisma.message.create({
          data: {
            contactId: contact.id,
            body: chat.lastMessageText,
            fromMe: chat.lastMessageFromMe ?? false,
            timestamp: new Date(chat.lastMessageTs * 1000),
            status: "received",
          },
        });
      }
      created++;
    }
  }

  return NextResponse.json({ synced: chats.length, created, updated });
}
