import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId obrigatório" }, { status: 400 });

  const messages = await prisma.message.findMany({
    where: { contactId },
    orderBy: { timestamp: "asc" },
  });

  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { contactId, body, mediaType, mediaData, mediaCaption, fileName } = await req.json();
  if (!contactId || (!body?.trim() && !mediaType)) {
    return NextResponse.json({ error: "contactId e body (ou mídia) são obrigatórios" }, { status: 400 });
  }
  const hasMedia = !!(mediaType && mediaData);

  // Load contact with instance + provider
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    include: {
      instance: { include: { provider: true } },
    },
  });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  let whatsappStatus = "pending";
  let whatsappError: string | undefined;

  // Send via WhatsApp if contact has an instance linked
  if (contact.instance && contact.instance.status === "connected") {
    try {
      const { getProvider } = await import("@/lib/providers");
      const provider = getProvider(contact.instance.provider.type);
      const config = {
        baseUrl: contact.instance.provider.baseUrl,
        apiKey: contact.instance.provider.apiKey,
      };
      if (hasMedia && provider.sendGroupMedia) {
        await provider.sendGroupMedia(config, contact.instance.instanceName, contact.phone, mediaType, mediaData, mediaCaption || body?.trim() || "", fileName);
      } else {
        await provider.sendTextMessage(config, contact.instance.instanceName, contact.phone, body.trim());
      }
      whatsappStatus = "sent";
    } catch (e) {
      whatsappError = e instanceof Error ? e.message : String(e);
      whatsappStatus = "failed";
    }
  } else if (!contact.instance) {
    // No instance linked — try the default connected instance
    const defaultInstance = await prisma.whatsAppInstance.findFirst({
      where: { status: "connected" },
      include: { provider: true },
      orderBy: { updatedAt: "desc" },
    });

    if (defaultInstance) {
      try {
        const { getProvider } = await import("@/lib/providers");
        const provider = getProvider(defaultInstance.provider.type);
        const config = {
          baseUrl: defaultInstance.provider.baseUrl,
          apiKey: defaultInstance.provider.apiKey,
        };
        if (hasMedia && provider.sendGroupMedia) {
          await provider.sendGroupMedia(config, defaultInstance.instanceName, contact.phone, mediaType, mediaData, mediaCaption || body?.trim() || "", fileName);
        } else {
          await provider.sendTextMessage(config, defaultInstance.instanceName, contact.phone, body.trim());
        }
        whatsappStatus = "sent";

        // Link contact to this instance for future messages
        await prisma.contact.update({
          where: { id: contactId },
          data: { instanceId: defaultInstance.id },
        });
      } catch (e) {
        whatsappError = e instanceof Error ? e.message : String(e);
        whatsappStatus = "failed";
      }
    } else {
      whatsappStatus = "no_instance";
    }
  }

  // Save message to DB regardless of WhatsApp status
  const displayBody = hasMedia
    ? (mediaCaption?.trim() || body?.trim() || (mediaType === "image" ? "🖼️ Imagem" : mediaType === "video" ? "🎬 Vídeo" : mediaType === "audio" ? "🎵 Áudio" : "📄 Documento"))
    : body.trim();

  const message = await prisma.message.create({
    data: {
      contactId,
      body: displayBody,
      fromMe: true,
      status: whatsappStatus,
      ...(hasMedia ? {
        mediaType,
        mediaUrl: mediaData ?? undefined,   // store full data URL (data:mime;base64,...)
      } : {}),
    },
  });

  await prisma.contact.update({ where: { id: contactId }, data: { updatedAt: new Date() } });

  if (whatsappStatus === "failed") {
    return NextResponse.json(
      { ...message, warning: `Salvo, mas falha ao enviar pelo WhatsApp: ${whatsappError}` },
      { status: 207 }
    );
  }

  if (whatsappStatus === "no_instance") {
    return NextResponse.json(
      { ...message, warning: "Nenhuma instância conectada. Mensagem salva localmente." },
      { status: 207 }
    );
  }

  return NextResponse.json(message);
}
