import type { ProviderConfig, InstanceInfo, SendMessageResult, WhatsAppProvider, WebhookEvent, GroupInfo, ChatInfo } from "./types";

export class EvolutionApiProvider implements WhatsAppProvider {
  type = "evolution";

  private headers(apiKey: string) {
    return {
      "Content-Type": "application/json",
      "apikey": apiKey,
    };
  }

  async createInstance(config: ProviderConfig, instanceName: string, webhookUrl: string): Promise<InstanceInfo> {
    const base = config.baseUrl.replace(/\/$/, "");

    const res = await fetch(`${base}/instance/create`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: true,
          base64: true,
          events: [
            "MESSAGES_UPSERT",
            "CONNECTION_UPDATE",
            "QRCODE_UPDATED",
          ],
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Evolution API: falha ao criar instância - ${err}`);
    }

    const data = await res.json();
    return {
      instanceId: data.instance?.instanceId || data.instanceId || instanceName,
      instanceName,
      status: "connecting",
      qrCode: data.qrcode?.base64 || null,
    };
  }

  async getQrCode(config: ProviderConfig, instanceName: string): Promise<string | null> {
    const base = config.baseUrl.replace(/\/$/, "");

    const res = await fetch(`${base}/instance/connect/${instanceName}`, {
      headers: this.headers(config.apiKey),
    });

    if (!res.ok) return null;

    const data = await res.json();
    return data.base64 || data.qrcode?.base64 || null;
  }

  async getStatus(config: ProviderConfig, instanceName: string): Promise<string> {
    const base = config.baseUrl.replace(/\/$/, "");

    const res = await fetch(`${base}/instance/connectionState/${instanceName}`, {
      headers: this.headers(config.apiKey),
    });

    if (!res.ok) return "disconnected";

    const data = await res.json();
    const state = data.instance?.state || data.state || "";

    if (state === "open") return "connected";
    if (state === "connecting") return "connecting";
    return "disconnected";
  }

  async sendTextMessage(config: ProviderConfig, instanceName: string, phone: string, text: string): Promise<SendMessageResult> {
    const base = config.baseUrl.replace(/\/$/, "");
    const number = phone.replace(/\D/g, "");

    const res = await fetch(`${base}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({
        number,
        text,
      }),
    });

    if (!res.ok) throw new Error("Evolution API: falha ao enviar mensagem");

    const data = await res.json();
    return { messageId: data.key?.id || "", status: "sent" };
  }

  async fetchChats(config: ProviderConfig, instanceName: string): Promise<ChatInfo[]> {
    const base = config.baseUrl.replace(/\/$/, "");

    // Try Evolution v2 chat list endpoint
    const urls = [
      `${base}/chat/findChats/${instanceName}`,
      `${base}/chat/${instanceName}/findChats`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: this.headers(config.apiKey),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const list: Record<string, unknown>[] = Array.isArray(data) ? data : [];

        return list
          .filter((c) => {
            const id = String(c.id || "");
            return id.includes("@s.whatsapp.net") || id.includes("@c.us");
          })
          .map((c) => {
            const jid = String(c.id || "");
            const phone = jid.replace(/@.+/, "").replace(/:\d+$/, "");
            const lastMsg = c.lastMessage as Record<string, unknown> | undefined;
            const msgContent = lastMsg?.message as Record<string, unknown> | undefined;
            const lastText =
              (msgContent?.conversation as string) ||
              (msgContent?.extendedTextMessage as Record<string, unknown>)?.text as string ||
              (msgContent?.imageMessage as Record<string, unknown>)?.caption as string ||
              undefined;
            const ts = lastMsg?.messageTimestamp;
            return {
              jid,
              name: String(c.name || c.pushName || phone),
              phone,
              isGroup: false,
              unreadCount: Number(c.unreadCount || 0),
              lastMessageText: lastText,
              lastMessageFromMe: (lastMsg?.key as Record<string, unknown>)?.fromMe === true,
              lastMessageTs: ts ? Number(ts) : undefined,
            } as ChatInfo;
          });
      } catch {
        continue;
      }
    }
    return [];
  }

  async fetchGroups(config: ProviderConfig, instanceName: string): Promise<GroupInfo[]> {
    const base = config.baseUrl.replace(/\/$/, "");

    // Try both Evolution API v1 and v2 group endpoints
    const endpoints = [
      `${base}/group/fetchAllGroups/${instanceName}?getParticipants=false`,
      `${base}/group/${instanceName}/fetchAllGroups?getParticipants=false`,
      `${base}/group/findGroups/${instanceName}`,
    ];

    let lastError = "";
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: this.headers(config.apiKey),
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) { lastError = `HTTP ${res.status} em ${url}`; continue; }
        const data = await res.json();
        // Evolution returns array directly or nested
        const list: Record<string, unknown>[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.groups) ? data.groups : [];
        // API responded with 200 — return the list even if empty
        return list
          .filter((g) => String(g.id || "").includes("@g.us"))
          .map((g) => ({
            groupJid: String(g.id || ""),
            name: String(g.subject || g.name || g.groupName || "Grupo sem nome"),
            participantCount: Number(g.size || g.participantsCount || 0),
          }));
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    throw new Error(`Evolution API: não foi possível listar grupos. Último erro: ${lastError}`);
  }

  async sendGroupMessage(config: ProviderConfig, instanceName: string, groupJid: string, text: string): Promise<SendMessageResult> {
    const base = config.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({ number: groupJid, text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`Evolution API: falha ao enviar para grupo - ${err}`);
    }
    const data = await res.json();
    return { messageId: data.key?.id || "", status: "sent" };
  }

  async sendGroupMedia(config: ProviderConfig, instanceName: string, groupJid: string, mediaType: string, mediaUrl: string, caption?: string, fileName?: string): Promise<SendMessageResult> {
    const base = config.baseUrl.replace(/\/$/, "");

    // Determine if it's a base64 data URL or a remote URL
    const isBase64 = mediaUrl.startsWith("data:");

    // Strip the data:...;base64, prefix — Evolution API expects raw base64
    // Use [^,]+ to match all content up to the comma (handles MIME types with params like "audio/ogg; codecs=opus")
    const mediaData = isBase64 ? mediaUrl.replace(/^data:[^,]+,/, "") : mediaUrl;

    // Map our mediaType to Evolution's expected mediatype values
    const mimeMap: Record<string, string> = {
      image: "image",
      video: "video",
      document: "document",
      audio: "audio",
    };
    const evolMediaType = mimeMap[mediaType] || mediaType;

    // Derive a filename if not provided
    const resolvedFileName = fileName || (mediaType === "document" ? "arquivo.pdf" : mediaType === "audio" ? "audio.ogg" : mediaType === "video" ? "video.mp4" : "imagem.jpg");

    const body: Record<string, string | boolean> = {
      number: groupJid,
      mediatype: evolMediaType,
      caption: caption || "",
      fileName: resolvedFileName,
      // Send audio as PTT (voice message) so the receiver gets the native voice message UI
      ...(evolMediaType === "audio" ? { ptt: true } : {}),
    };

    // Evolution API accepts either "media" (base64 or URL) field
    body.media = mediaData;

    const res = await fetch(`${base}/message/sendMedia/${instanceName}`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`Evolution API: falha ao enviar mídia - ${err}`);
    }
    const data = await res.json();
    return { messageId: data.key?.id || "", status: "sent" };
  }

  async deleteInstance(config: ProviderConfig, instanceName: string): Promise<void> {
    const base = config.baseUrl.replace(/\/$/, "");
    await fetch(`${base}/instance/delete/${instanceName}`, {
      method: "DELETE",
      headers: this.headers(config.apiKey),
    });
  }

  parseWebhookEvent(body: Record<string, unknown>): WebhookEvent | null {
    const event = body.event as string;
    const instance = (body.instance || body.instanceName) as string;

    if (!instance) return null;

    if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
      const data = body.data as Record<string, unknown>;

      // Evolution v2 sends data as the message object directly;
      // older/some versions wrap it in data.messages[]
      const rawMsg: Record<string, unknown> =
        (data?.key ? data : (data?.messages as Record<string, unknown>[])?.[0]) || {};

      const key = rawMsg.key as Record<string, unknown>;
      if (!key) return null;
      if (key?.fromMe) return null; // ignore outgoing messages

      const remoteJid = String(key?.remoteJid || "");
      // Skip group messages (they end in @g.us)
      if (remoteJid.includes("@g.us")) return null;

      const phone = remoteJid.replace(/@.+/, "").replace(/:\d+$/, "").replace(/\D/g, "");
      if (!phone) return null;

      const pushName = String(rawMsg.pushName || "");
      const msgContent = (rawMsg.message || rawMsg.Messages) as Record<string, unknown>;

      const imgMsg  = msgContent?.imageMessage    as Record<string, unknown> | undefined;
      const vidMsg  = msgContent?.videoMessage    as Record<string, unknown> | undefined;
      const audMsg  = msgContent?.audioMessage    as Record<string, unknown> | undefined;
      const docMsg  = msgContent?.documentMessage as Record<string, unknown> | undefined;
      const docCapMsg = (msgContent?.documentWithCaptionMessage as Record<string, unknown>)
        ?.message as Record<string, unknown> | undefined;

      // Strip data: prefix and return raw base64
      function toRaw(b: unknown): string | undefined {
        if (typeof b !== "string" || !b) return undefined;
        return b.replace(/^data:[^,]+,/, "");
      }

      // Evolution v2 places base64 in different locations depending on version:
      //   - rawMsg.base64 (data level) — some versions
      //   - msgType.base64 (nested inside imageMessage / audioMessage etc.) — other versions
      // Check both; prefer the nested location as it is most common in v2.
      function pickBase64(msgObj?: Record<string, unknown>): string | undefined {
        return toRaw(msgObj?.base64) ?? toRaw(rawMsg.base64);
      }

      // Extract text/caption
      const text =
        (msgContent?.conversation as string) ||
        ((msgContent?.extendedTextMessage as Record<string, unknown>)?.text as string) ||
        (imgMsg?.caption as string) ||
        (vidMsg?.caption as string) ||
        (docMsg?.caption as string) ||
        (docCapMsg?.caption as string) ||
        (audMsg ? "🎵 Áudio" : null) ||
        (msgContent?.stickerMessage ? "🎭 Sticker" : null) ||
        (imgMsg ? "🖼️ Imagem" : null) ||
        (vidMsg ? "🎬 Vídeo" : null) ||
        (docMsg ? "📄 Documento" : null) ||
        (msgContent?.locationMessage ? "📍 Localização" : null) ||
        (msgContent?.contactMessage ? "👤 Contato" : null) ||
        null;

      if (!text) return null;

      // Build a full data URL (data:mime;base64,…) so the browser renders it directly.
      let mediaBase64: string | undefined;
      let mediaType: string | undefined;
      let mediaCaption: string | undefined;

      if (imgMsg) {
        const raw = pickBase64(imgMsg);
        if (raw) {
          const mime = (imgMsg.mimetype as string) || "image/jpeg";
          mediaBase64 = `data:${mime};base64,${raw}`;
        }
        mediaType = "image";
        mediaCaption = imgMsg.caption as string || undefined;
      } else if (vidMsg) {
        const raw = pickBase64(vidMsg);
        if (raw) {
          const mime = (vidMsg.mimetype as string) || "video/mp4";
          mediaBase64 = `data:${mime};base64,${raw}`;
        }
        mediaType = "video";
        mediaCaption = vidMsg.caption as string || undefined;
      } else if (audMsg) {
        const raw = pickBase64(audMsg);
        if (raw) {
          const mime = (audMsg.mimetype as string) || "audio/ogg; codecs=opus";
          mediaBase64 = `data:${mime};base64,${raw}`;
        }
        mediaType = "audio";
      } else if (docMsg || docCapMsg) {
        const d = docMsg || docCapMsg!;
        const raw = pickBase64(d);
        if (raw) {
          const mime = (d.mimetype as string) || "application/octet-stream";
          mediaBase64 = `data:${mime};base64,${raw}`;
        }
        mediaType = "document";
        mediaCaption = (docMsg?.caption || docCapMsg?.caption) as string || undefined;
      }

      const waMessageId = String(key.id || "");

      return {
        type: "message",
        instanceName: instance,
        data: { phone, name: pushName || phone, message: text, waMessageId, mediaBase64, mediaType, mediaCaption },
      };
    }

    if (event === "connection.update" || event === "CONNECTION_UPDATE") {
      const data = body.data as Record<string, unknown>;
      const state = data?.state as string;
      const statusReason = data?.statusReason as number;

      let status = "disconnected";
      if (state === "open") status = "connected";
      else if (state === "connecting") status = "connecting";
      else if (statusReason === 428) status = "connecting"; // QR code scan pending

      return {
        type: "status",
        instanceName: instance,
        data: { status },
      };
    }

    if (event === "qrcode.updated" || event === "QRCODE_UPDATED") {
      const data = body.data as Record<string, unknown>;
      const qrCode = (data?.qrcode as Record<string, unknown>)?.base64 as string || data?.base64 as string;

      return {
        type: "qrcode",
        instanceName: instance,
        data: { qrCode, status: "connecting" },
      };
    }

    return null;
  }
}
