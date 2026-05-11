import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth";

/**
 * GET /api/messages/[id]/media
 *
 * Returns the media data URL for a message.
 * If already cached in mediaUrl, returns immediately.
 * Otherwise calls Evolution's getBase64FromMediaMessage using the stored waMessageId,
 * caches the result, and returns it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  const message = await prisma.message.findUnique({
    where: { id },
    include: {
      contact: {
        include: { instance: { include: { provider: true } } },
      },
    },
  });

  if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
  if (!message.mediaType) return NextResponse.json({ error: "Sem mídia" }, { status: 400 });

  // Already cached
  if (message.mediaUrl) {
    return NextResponse.json({ mediaUrl: message.mediaUrl, mediaType: message.mediaType });
  }

  if (!message.waMessageId) {
    return NextResponse.json({ error: "ID da mensagem WhatsApp não disponível" }, { status: 404 });
  }

  const instance = message.contact.instance;
  if (!instance || instance.provider.type !== "evolution") {
    return NextResponse.json({ error: "Instância não disponível" }, { status: 404 });
  }

  const base = instance.provider.baseUrl.replace(/\/$/, "");
  const headers = { "Content-Type": "application/json", "apikey": instance.provider.apiKey };

  // Evolution API: get base64 for a received media message
  // https://doc.evolution-api.com/v2/api-reference/chat-controller/get-base64-from-media-message
  try {
    const res = await fetch(`${base}/chat/getBase64FromMediaMessage/${instance.instanceName}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        message: {
          key: {
            id: message.waMessageId,
            remoteJid: `${message.contact.phone}@s.whatsapp.net`,
            fromMe: false,
          },
        },
        convertToMp4: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Evolution getBase64FromMediaMessage failed:", res.status, errText);
      return NextResponse.json({ error: "Evolution não retornou a mídia" }, { status: 502 });
    }

    const data = await res.json();
    // Evolution returns { base64: "...", mimetype: "audio/ogg; codecs=opus" }
    const b64 = (data.base64 as string | undefined)?.replace(/^data:[^,]+,/, "");
    const mime = (data.mimetype as string | undefined) || mimeFromType(message.mediaType);

    if (!b64) {
      return NextResponse.json({ error: "Base64 vazio na resposta" }, { status: 502 });
    }

    const dataUrl = `data:${mime};base64,${b64}`;

    // Cache in DB
    await prisma.message.update({ where: { id }, data: { mediaUrl: dataUrl } });

    return NextResponse.json({ mediaUrl: dataUrl, mediaType: message.mediaType });
  } catch (e) {
    console.error("Erro ao buscar mídia:", e);
    return NextResponse.json({ error: "Erro ao buscar mídia da Evolution" }, { status: 500 });
  }
}

function mimeFromType(t: string): string {
  return t === "image" ? "image/jpeg"
    : t === "video" ? "video/mp4"
    : t === "audio" ? "audio/ogg; codecs=opus"
    : "application/octet-stream";
}
