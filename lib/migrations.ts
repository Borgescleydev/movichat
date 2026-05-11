import { prisma } from "./prisma";

// Each entry is idempotent: errors on "duplicate column" are swallowed.
const MIGRATIONS = [
  // --- groups / instances / contacts ---
  {
    name: "WhatsAppGroup",
    sql: `CREATE TABLE IF NOT EXISTS "WhatsAppGroup" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "instanceId" TEXT NOT NULL,
      "groupJid" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "participantCount" INTEGER NOT NULL DEFAULT 0,
      "lastSyncAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "WhatsAppGroup_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  {
    name: "WhatsAppGroup_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppGroup_instanceId_groupJid_key" ON "WhatsAppGroup"("instanceId", "groupJid")`,
  },
  {
    name: "MessageTemplate",
    sql: `CREATE TABLE IF NOT EXISTS "MessageTemplate" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "variables" TEXT NOT NULL DEFAULT '[]',
      "mediaType" TEXT,
      "mediaUrl" TEXT,
      "mediaCaption" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
  },
  {
    name: "Campaign",
    sql: `CREATE TABLE IF NOT EXISTS "Campaign" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'draft',
      "templateId" TEXT NOT NULL,
      "instanceId" TEXT NOT NULL,
      "variableValues" TEXT NOT NULL DEFAULT '{}',
      "startAt" DATETIME NOT NULL,
      "repeatType" TEXT NOT NULL DEFAULT 'none',
      "repeatEndAt" DATETIME,
      "nextRunAt" DATETIME,
      "runCount" INTEGER NOT NULL DEFAULT 0,
      "cadenceMinSeconds" INTEGER NOT NULL DEFAULT 10,
      "cadenceMaxSeconds" INTEGER NOT NULL DEFAULT 30,
      "cadenceMaxPerHour" INTEGER NOT NULL DEFAULT 60,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "Campaign_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
  },
  {
    name: "CampaignGroup",
    sql: `CREATE TABLE IF NOT EXISTS "CampaignGroup" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "campaignId" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "CampaignGroup_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CampaignGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
  },
  {
    name: "CampaignGroup_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "CampaignGroup_campaignId_groupId_key" ON "CampaignGroup"("campaignId", "groupId")`,
  },
  {
    name: "CampaignDispatch",
    sql: `CREATE TABLE IF NOT EXISTS "CampaignDispatch" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "campaignId" TEXT NOT NULL,
      "groupId" TEXT NOT NULL,
      "runIndex" INTEGER NOT NULL DEFAULT 0,
      "scheduledFor" DATETIME NOT NULL,
      "sentAt" DATETIME,
      "status" TEXT NOT NULL DEFAULT 'pending',
      "errorMessage" TEXT,
      "messageId" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "CampaignDispatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "CampaignDispatch_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "WhatsAppGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )`,
  },
  {
    name: "CampaignDispatch_unique",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "CampaignDispatch_campaignId_groupId_runIndex_key" ON "CampaignDispatch"("campaignId", "groupId", "runIndex")`,
  },
  {
    name: "ManualDispatchLog",
    sql: `CREATE TABLE IF NOT EXISTS "ManualDispatchLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "instanceId" TEXT NOT NULL,
      "message" TEXT NOT NULL DEFAULT '',
      "mediaType" TEXT,
      "mediaCaption" TEXT,
      "hasMedia" INTEGER NOT NULL DEFAULT 0,
      "groupCount" INTEGER NOT NULL DEFAULT 0,
      "sentCount" INTEGER NOT NULL DEFAULT 0,
      "failedCount" INTEGER NOT NULL DEFAULT 0,
      "results" TEXT NOT NULL DEFAULT '[]',
      "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ManualDispatchLog_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )`,
  },
  // --- ALTER TABLE columns (idempotent: error = already exists, safe to ignore) ---
  { name: "WhatsAppInstance_conversationsEnabled", sql: `ALTER TABLE "WhatsAppInstance" ADD COLUMN "conversationsEnabled" INTEGER NOT NULL DEFAULT 1` },
  { name: "Contact_instanceId",  sql: `ALTER TABLE "Contact" ADD COLUMN "instanceId" TEXT REFERENCES "WhatsAppInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  { name: "Contact_lastReadAt",  sql: `ALTER TABLE "Contact" ADD COLUMN "lastReadAt" DATETIME` },
  { name: "Message_mediaUrl",    sql: `ALTER TABLE "Message" ADD COLUMN "mediaUrl" TEXT` },
  { name: "Message_mediaType",   sql: `ALTER TABLE "Message" ADD COLUMN "mediaType" TEXT` },
  { name: "Message_waMessageId", sql: `ALTER TABLE "Message" ADD COLUMN "waMessageId" TEXT` },
  // --- Campaign scheduling columns ---
  { name: "Campaign_channel",              sql: `ALTER TABLE "Campaign" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'whatsapp'` },
  { name: "Campaign_sendType",             sql: `ALTER TABLE "Campaign" ADD COLUMN "sendType" TEXT NOT NULL DEFAULT 'scheduled'` },
  { name: "Campaign_windowStart",          sql: `ALTER TABLE "Campaign" ADD COLUMN "windowStart" TEXT` },
  { name: "Campaign_windowEnd",            sql: `ALTER TABLE "Campaign" ADD COLUMN "windowEnd" TEXT` },
  { name: "Campaign_windowDays",           sql: `ALTER TABLE "Campaign" ADD COLUMN "windowDays" TEXT NOT NULL DEFAULT '[]'` },
  { name: "Campaign_batchSize",            sql: `ALTER TABLE "Campaign" ADD COLUMN "batchSize" INTEGER` },
  { name: "Campaign_batchIntervalMinutes", sql: `ALTER TABLE "Campaign" ADD COLUMN "batchIntervalMinutes" INTEGER` },
  { name: "Campaign_repeatEveryX",         sql: `ALTER TABLE "Campaign" ADD COLUMN "repeatEveryX" INTEGER` },
  { name: "Campaign_repeatEveryUnit",      sql: `ALTER TABLE "Campaign" ADD COLUMN "repeatEveryUnit" TEXT` },
  // --- Instance ownership ---
  { name: "WhatsAppInstance_ownerId", sql: `ALTER TABLE "WhatsAppInstance" ADD COLUMN "ownerId" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE` },
  // --- User avatar + permissions ---
  { name: "User_avatar",       sql: `ALTER TABLE "User" ADD COLUMN "avatar" TEXT` },
  { name: "User_permissions",  sql: `ALTER TABLE "User" ADD COLUMN "permissions" TEXT NOT NULL DEFAULT '{}'` },
];

let ran = false;

export async function runMigrations(): Promise<void> {
  if (ran) return;
  ran = true;
  for (const m of MIGRATIONS) {
    try {
      await prisma.$executeRawUnsafe(m.sql);
    } catch {
      // "duplicate column name" or "table already exists" — safe to ignore
    }
  }
}
