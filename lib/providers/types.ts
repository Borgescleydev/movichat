export interface GroupInfo {
  groupJid: string;
  name: string;
  participantCount: number;
}

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  webhookUrl?: string;
}

export interface InstanceInfo {
  instanceId: string;
  instanceName: string;
  status: string;
  phone?: string;
  qrCode?: string;
}

export interface SendMessageResult {
  messageId: string;
  status: string;
}

export interface WhatsAppProvider {
  type: string;
  createInstance(config: ProviderConfig, instanceName: string, webhookUrl: string): Promise<InstanceInfo>;
  getQrCode(config: ProviderConfig, instanceName: string): Promise<string | null>;
  getStatus(config: ProviderConfig, instanceName: string): Promise<string>;
  sendTextMessage(config: ProviderConfig, instanceName: string, phone: string, text: string): Promise<SendMessageResult>;
  deleteInstance(config: ProviderConfig, instanceName: string): Promise<void>;
  parseWebhookEvent(body: Record<string, unknown>): WebhookEvent | null;
}

export interface WebhookEvent {
  type: "message" | "status" | "qrcode";
  instanceName: string;
  data: {
    phone?: string;
    name?: string;
    message?: string;
    status?: string;
    qrCode?: string;
    phone_connected?: string;
  };
}
