export interface ChatInfo {
  jid: string;
  name: string;
  phone: string;        // cleaned phone number
  isGroup: boolean;
  unreadCount: number;
  lastMessageText?: string;
  lastMessageFromMe?: boolean;
  lastMessageTs?: number; // unix timestamp
}

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

export interface MessageInfo {
  waMessageId: string;
  phone: string;
  body: string;
  fromMe: boolean;
  timestamp: number; // unix seconds
  mediaType?: string;
  mediaBase64?: string;
}

export interface WhatsAppProvider {
  type: string;
  createInstance(config: ProviderConfig, instanceName: string, webhookUrl: string): Promise<InstanceInfo>;
  getQrCode(config: ProviderConfig, instanceName: string): Promise<string | null>;
  getStatus(config: ProviderConfig, instanceName: string): Promise<string>;
  sendTextMessage(config: ProviderConfig, instanceName: string, phone: string, text: string): Promise<SendMessageResult>;
  fetchChats?(config: ProviderConfig, instanceName: string): Promise<ChatInfo[]>;
  fetchGroups?(config: ProviderConfig, instanceName: string): Promise<GroupInfo[]>;
  fetchMessages?(config: ProviderConfig, instanceName: string, phone: string, count?: number): Promise<MessageInfo[]>;
  updateWebhook?(config: ProviderConfig, instanceName: string, webhookUrl: string): Promise<void>;
  sendGroupMessage?(config: ProviderConfig, instanceName: string, groupJid: string, text: string): Promise<SendMessageResult>;
  sendGroupMedia?(config: ProviderConfig, instanceName: string, groupJid: string, mediaType: string, mediaUrl: string, caption?: string, fileName?: string): Promise<SendMessageResult>;
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
    waMessageId?: string;   // WhatsApp key.id for on-demand media fetch
    mediaBase64?: string;   // full data URL when inline base64 was present
    mediaType?: string;     // "image" | "video" | "audio" | "document"
    mediaCaption?: string;
    status?: string;
    qrCode?: string;
    phone_connected?: string;
  };
}
