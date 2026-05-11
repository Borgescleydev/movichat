import type { ProviderConfig, InstanceInfo, SendMessageResult, WhatsAppProvider, WebhookEvent, GroupInfo } from "./types";

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
        token: config.apiKey,
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

  async fetchGroups(config: ProviderConfig, instanceName: string): Promise<GroupInfo[]> {
    const base = config.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/group/fetchAllGroups/${instanceName}?getParticipants=false`, {
      headers: this.headers(config.apiKey),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Evolution API: falha ao buscar grupos (${res.status})`);
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    return list
      .filter((g: Record<string, unknown>) => String(g.id || "").endsWith("@g.us"))
      .map((g: Record<string, unknown>) => ({
        groupJid: String(g.id || ""),
        name: String(g.subject || g.name || "Grupo sem nome"),
        participantCount: Number(g.size || 0),
      }));
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

  async sendGroupMedia(config: ProviderConfig, instanceName: string, groupJid: string, mediaType: string, mediaUrl: string, caption?: string): Promise<SendMessageResult> {
    const base = config.baseUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/message/sendMedia/${instanceName}`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({ number: groupJid, mediatype: mediaType, media: mediaUrl, caption: caption || "" }),
      signal: AbortSignal.timeout(30000),
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
      const messages = data?.messages as Record<string, unknown>[];
      const msg = messages?.[0];
      if (!msg) return null;

      const key = msg.key as Record<string, unknown>;
      if (key?.fromMe) return null; // ignore outgoing

      const remoteJid = key?.remoteJid as string;
      const phone = remoteJid?.replace(/@.+/, "").replace(/\D/g, "");
      const pushName = msg.pushName as string;
      const msgContent = msg.message as Record<string, unknown>;
      const text = msgContent?.conversation as string ||
        (msgContent?.extendedTextMessage as Record<string, unknown>)?.text as string;

      if (!phone || !text) return null;

      return {
        type: "message",
        instanceName: instance,
        data: { phone, name: pushName || phone, message: text },
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
