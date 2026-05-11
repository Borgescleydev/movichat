import type { ProviderConfig, InstanceInfo, SendMessageResult, WhatsAppProvider, WebhookEvent } from "./types";

export class UazApiProvider implements WhatsAppProvider {
  type = "uazapi";

  private headers(apiKey: string) {
    return {
      "Content-Type": "application/json",
      "Token": apiKey,
    };
  }

  async createInstance(config: ProviderConfig, instanceName: string, webhookUrl: string): Promise<InstanceInfo> {
    const base = config.baseUrl.replace(/\/$/, "");

    // Try to create/start session
    const res = await fetch(`${base}/session/start`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({
        session: instanceName,
        webhook: webhookUrl,
        webhookEvents: ["message", "status", "qrcode"],
      }),
    });

    if (!res.ok) {
      // Try alternative endpoint
      const res2 = await fetch(`${base}/instance/init`, {
        method: "POST",
        headers: this.headers(config.apiKey),
        body: JSON.stringify({
          instance: instanceName,
          webhookUrl,
          webhookByEvents: true,
          events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
        }),
      });

      if (!res2.ok) {
        const err = await res2.text();
        throw new Error(`UazAPI: falha ao criar instância - ${err}`);
      }

      const data2 = await res2.json();
      return {
        instanceId: data2.instance?.instanceId || data2.instanceId || instanceName,
        instanceName,
        status: "connecting",
        qrCode: data2.qrcode?.base64 || data2.qrCode || null,
      };
    }

    const data = await res.json();
    return {
      instanceId: data.session || data.id || instanceName,
      instanceName,
      status: "connecting",
      qrCode: data.qrcode || data.qr || null,
    };
  }

  async getQrCode(config: ProviderConfig, instanceName: string): Promise<string | null> {
    const base = config.baseUrl.replace(/\/$/, "");

    // Try session endpoint first
    const res = await fetch(`${base}/session/qr?session=${instanceName}`, {
      headers: this.headers(config.apiKey),
    });

    if (res.ok) {
      const data = await res.json();
      return data.qr || data.qrcode || data.base64 || null;
    }

    // Try instance endpoint
    const res2 = await fetch(`${base}/instance/connect/${instanceName}`, {
      headers: this.headers(config.apiKey),
    });

    if (res2.ok) {
      const data2 = await res2.json();
      return data2.qrcode?.base64 || data2.qr || null;
    }

    return null;
  }

  async getStatus(config: ProviderConfig, instanceName: string): Promise<string> {
    const base = config.baseUrl.replace(/\/$/, "");

    const res = await fetch(`${base}/session/status?session=${instanceName}`, {
      headers: this.headers(config.apiKey),
    });

    if (res.ok) {
      const data = await res.json();
      const s = data.status || data.state || "";
      if (s === "CONNECTED" || s === "open" || s === "connected") return "connected";
      if (s === "CONNECTING" || s === "connecting") return "connecting";
      return "disconnected";
    }

    return "disconnected";
  }

  async sendTextMessage(config: ProviderConfig, instanceName: string, phone: string, text: string): Promise<SendMessageResult> {
    const base = config.baseUrl.replace(/\/$/, "");
    const number = phone.replace(/\D/g, "");

    const res = await fetch(`${base}/message/send`, {
      method: "POST",
      headers: this.headers(config.apiKey),
      body: JSON.stringify({
        session: instanceName,
        to: `${number}@s.whatsapp.net`,
        type: "text",
        text: { body: text },
      }),
    });

    if (!res.ok) {
      // Try send/text endpoint
      const res2 = await fetch(`${base}/send/text`, {
        method: "POST",
        headers: this.headers(config.apiKey),
        body: JSON.stringify({
          session: instanceName,
          chatId: `${number}@s.whatsapp.net`,
          text,
        }),
      });

      if (!res2.ok) throw new Error("UazAPI: falha ao enviar mensagem");
      const d2 = await res2.json();
      return { messageId: d2.id || "", status: "sent" };
    }

    const data = await res.json();
    return { messageId: data.id || data.key?.id || "", status: "sent" };
  }

  async deleteInstance(config: ProviderConfig, instanceName: string): Promise<void> {
    const base = config.baseUrl.replace(/\/$/, "");
    await fetch(`${base}/session/stop?session=${instanceName}`, {
      method: "POST",
      headers: this.headers(config.apiKey),
    });
  }

  parseWebhookEvent(body: Record<string, unknown>): WebhookEvent | null {
    // UazAPI webhook format
    const event = (body.event || body.type) as string;
    const session = (body.session || body.instance || body.instanceName) as string;

    if (!session) return null;

    if (event === "message" || event === "MESSAGES_UPSERT") {
      const data = (body.data || body.message || body) as Record<string, unknown>;
      const msg = (data.messages as Record<string, unknown>[])?.[0] || data;
      const key = msg.key as Record<string, unknown> | undefined;
      const from = (msg.from || key?.remoteJid || data.from) as string;
      const phone = from?.replace(/@.+/, "").replace(/\D/g, "");
      const pushName = (msg.pushName || msg.notifyName || data.name) as string;
      const msgObj = msg.message as Record<string, unknown> | undefined;
      const text = (msg.body || msgObj?.conversation || msg.text || data.body) as string;

      if (!phone || !text) return null;

      return {
        type: "message",
        instanceName: session,
        data: { phone, name: pushName || phone, message: text },
      };
    }

    if (event === "status" || event === "CONNECTION_UPDATE") {
      const data = (body.data || body) as Record<string, unknown>;
      const status = (data.status || data.state || body.status) as string;
      const qr = (data.qr || data.qrcode || body.qrcode) as string;
      const me = data.me as Record<string, unknown> | undefined;
      const phone_connected = (data.phone || me?.user) as string;

      let normalizedStatus = "disconnected";
      if (status === "CONNECTED" || status === "open") normalizedStatus = "connected";
      else if (status === "CONNECTING" || status === "connecting") normalizedStatus = "connecting";
      else if (qr) normalizedStatus = "connecting";

      return {
        type: "status",
        instanceName: session,
        data: { status: normalizedStatus, qrCode: qr || undefined, phone_connected },
      };
    }

    if (event === "qrcode" || event === "QRCODE_UPDATED") {
      const data = (body.data || body) as Record<string, unknown>;
      const qrObj = data.qrcode as Record<string, unknown> | undefined;
      const qr = (qrObj?.base64 || data.qr || data.base64 || body.qrcode) as string;

      return {
        type: "qrcode",
        instanceName: session,
        data: { qrCode: qr, status: "connecting" },
      };
    }

    return null;
  }
}
