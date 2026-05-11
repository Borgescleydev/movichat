import type { ProviderConfig, InstanceInfo, SendMessageResult, WhatsAppProvider, WebhookEvent, GroupInfo, ChatInfo } from "./types";

/**
 * WPPConnect Server provider
 * GitHub: https://github.com/wppconnect-team/wppconnect-server
 * Docker: docker run -d -p 21465:21465 -e SECRETKEY=MYKEY wppconnect/wppconnect-server
 *
 * API format: /api/{secretKey}/{session}/endpoint
 * config.apiKey = SECRETKEY from the WPPConnect Server config
 */
export class WPPConnectProvider implements WhatsAppProvider {
  type = "wppconnect";

  private url(config: ProviderConfig, session: string, endpoint: string) {
    const base = config.baseUrl.replace(/\/$/, "");
    return `${base}/api/${config.apiKey}/${session}/${endpoint}`;
  }

  private headers() {
    return { "Content-Type": "application/json" };
  }

  async createInstance(config: ProviderConfig, instanceName: string, webhookUrl: string): Promise<InstanceInfo> {
    const res = await fetch(this.url(config, instanceName, "start-session"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        webhook: webhookUrl,
        waitQrCode: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`WPPConnect: falha ao iniciar sessão - ${err}`);
    }

    const data = await res.json();
    // data.qrcode may be a data URL
    const qrCode = data.qrcode || null;
    const status = data.status === "CONNECTED" ? "connected" : "connecting";

    return {
      instanceId: instanceName,
      instanceName,
      status,
      qrCode,
    };
  }

  async getQrCode(config: ProviderConfig, instanceName: string): Promise<string | null> {
    // Re-call start-session to get current QR or status
    try {
      const res = await fetch(this.url(config, instanceName, "start-session"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ waitQrCode: false }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.qrcode || null;
    } catch {
      return null;
    }
  }

  async getStatus(config: ProviderConfig, instanceName: string): Promise<string> {
    try {
      const res = await fetch(this.url(config, instanceName, "check-connection-session"), {
        headers: this.headers(),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return "disconnected";
      const data = await res.json();
      return data.status === true ? "connected" : "disconnected";
    } catch {
      return "disconnected";
    }
  }

  async sendTextMessage(config: ProviderConfig, instanceName: string, phone: string, text: string): Promise<SendMessageResult> {
    const number = phone.replace(/\D/g, "");
    const res = await fetch(this.url(config, instanceName, "send-message"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ phone: number, message: text, isGroup: false }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`WPPConnect: falha ao enviar mensagem - ${err}`);
    }
    const data = await res.json();
    return { messageId: data.id || "", status: "sent" };
  }

  async fetchChats(config: ProviderConfig, instanceName: string): Promise<ChatInfo[]> {
    try {
      const res = await fetch(
        this.url(config, instanceName, "list-chats") + "?count=100&id=&direction=before&isDefined=false",
        { headers: this.headers(), signal: AbortSignal.timeout(30000) }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const list: Record<string, unknown>[] = Array.isArray(data?.response) ? data.response : Array.isArray(data) ? data : [];

      return list
        .filter((c) => {
          const id = (c.id as Record<string, unknown>)?._serialized || String(c.id || "");
          return (String(id).includes("@c.us") || String(id).includes("@s.whatsapp.net")) && !String(id).includes("@g.us");
        })
        .map((c) => {
          const idRaw = (c.id as Record<string, unknown>)?._serialized || String(c.id || "");
          const phone = String(idRaw).replace(/@.+/, "");
          return {
            jid: String(idRaw),
            name: String(c.name || c.formattedTitle || phone),
            phone,
            isGroup: false,
            unreadCount: Number(c.unreadCount || 0),
            lastMessageText: String(c.lastMessage || ""),
            lastMessageFromMe: Boolean(c.isMe),
            lastMessageTs: c.timestamp ? Number(c.timestamp) : undefined,
          } as ChatInfo;
        });
    } catch {
      return [];
    }
  }

  async fetchGroups(config: ProviderConfig, instanceName: string): Promise<GroupInfo[]> {
    const res = await fetch(
      this.url(config, instanceName, "all-groups") + "?getAllParticipants=false",
      {
        headers: this.headers(),
        signal: AbortSignal.timeout(30000),
      }
    );
    if (!res.ok) {
      throw new Error(`WPPConnect: HTTP ${res.status} ao listar grupos`);
    }
    const data = await res.json();
    const list: Record<string, unknown>[] = Array.isArray(data)
      ? data
      : Array.isArray(data.response)
      ? (data.response as Record<string, unknown>[])
      : [];

    return list
      .filter((g) => {
        const id = (g.id as Record<string, unknown>)?._serialized || g.id;
        return String(id || "").includes("@g.us");
      })
      .map((g) => {
        const id = (g.id as Record<string, unknown>)?._serialized || g.id;
        return {
          groupJid: String(id || ""),
          name: String(g.name || g.subject || "Grupo sem nome"),
          participantCount: Number((g.participants as unknown[])?.length || g.size || 0),
        };
      });
  }

  async sendGroupMessage(config: ProviderConfig, instanceName: string, groupJid: string, text: string): Promise<SendMessageResult> {
    const res = await fetch(this.url(config, instanceName, "send-message"), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ phone: groupJid, message: text, isGroup: true }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`WPPConnect: falha ao enviar para grupo - ${err}`);
    }
    const data = await res.json();
    return { messageId: data.id || "", status: "sent" };
  }

  async sendGroupMedia(config: ProviderConfig, instanceName: string, groupJid: string, mediaType: string, mediaUrl: string, caption?: string, fileName?: string): Promise<SendMessageResult> {
    const isBase64 = mediaUrl.startsWith("data:");
    const endpoint = isBase64 ? "send-file-base64" : "send-file";
    const resolvedFileName = fileName || (mediaType === "document" ? "arquivo.pdf" : mediaType === "audio" ? "audio.ogg" : mediaType === "video" ? "video.mp4" : "imagem.jpg");

    const bodyObj = isBase64
      ? { phone: groupJid, isGroup: true, base64: mediaUrl, filename: resolvedFileName, caption: caption || "" }
      : { phone: groupJid, isGroup: true, path: mediaUrl, caption: caption || "", type: mediaType };

    const res = await fetch(this.url(config, instanceName, endpoint), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(bodyObj),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      throw new Error(`WPPConnect: falha ao enviar mídia - ${err}`);
    }
    const data = await res.json();
    return { messageId: data.id || "", status: "sent" };
  }

  async deleteInstance(config: ProviderConfig, instanceName: string): Promise<void> {
    await fetch(this.url(config, instanceName, "close-session"), {
      method: "POST",
      headers: this.headers(),
      signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }

  parseWebhookEvent(body: Record<string, unknown>): WebhookEvent | null {
    const event = body.event as string;
    const session = body.session as string;
    if (!session) return null;

    if (event === "onmessage") {
      const message = body.message as Record<string, unknown>;
      if (!message || message.fromMe) return null;

      const from = String(message.from || "");
      // Skip group messages in DM handler (groups have @g.us)
      if (from.includes("@g.us")) return null;

      const phone = from.replace(/@.+/, "").replace(/\D/g, "");
      const text = String(message.body || "");
      const pushName = String(message.pushName || phone);

      if (!phone || !text) return null;

      return {
        type: "message",
        instanceName: session,
        data: { phone, name: pushName, message: text },
      };
    }

    if (event === "onStateChanged") {
      const state = String(body.state || "");
      let status = "disconnected";
      if (state === "CONNECTED" || state === "open") status = "connected";
      else if (state === "CONNECTING" || state === "qrReadSuccess") status = "connecting";
      return {
        type: "status",
        instanceName: session,
        data: { status },
      };
    }

    if (event === "onQRCode") {
      const qrCode = String(body.qrcode || "");
      return {
        type: "qrcode",
        instanceName: session,
        data: { qrCode, status: "connecting" },
      };
    }

    return null;
  }
}
