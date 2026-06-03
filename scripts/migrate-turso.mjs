/**
 * Applies pending schema changes to the Turso database.
 * Run via: node scripts/migrate-turso.mjs
 * Called automatically during Vercel build.
 */
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith("file:")) {
  console.log("DATABASE_URL is local SQLite — skipping Turso migration.");
  process.exit(0);
}

const client = createClient({ url, authToken });

const migrations = [
  `CREATE TABLE IF NOT EXISTS DispatchGroup (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS DispatchGroupItem (
    id TEXT NOT NULL PRIMARY KEY,
    dispatchGroupId TEXT NOT NULL,
    groupId TEXT NOT NULL,
    CONSTRAINT DispatchGroupItem_dispatchGroupId_fkey
      FOREIGN KEY (dispatchGroupId) REFERENCES DispatchGroup (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT DispatchGroupItem_groupId_fkey
      FOREIGN KEY (groupId) REFERENCES WhatsAppGroup (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS DispatchGroupItem_dispatchGroupId_groupId_key
    ON DispatchGroupItem(dispatchGroupId, groupId)`,
  `CREATE TABLE IF NOT EXISTS UserSession (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    country TEXT,
    city TEXT,
    region TEXT,
    deviceType TEXT,
    browser TEXT,
    os TEXT,
    lastActiveAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revokedAt DATETIME,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS UserSession_userId_idx ON UserSession(userId)`,
  `CREATE TABLE IF NOT EXISTS ContactTemplate (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    variations TEXT NOT NULL DEFAULT '[]',
    mediaType TEXT,
    mediaUrl TEXT,
    mediaCaption TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS ContactCampaign (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    instanceId TEXT NOT NULL,
    templateId TEXT NOT NULL,
    variableValues TEXT NOT NULL DEFAULT '{}',
    startAt DATETIME NOT NULL,
    sendType TEXT NOT NULL DEFAULT 'scheduled',
    repeatType TEXT NOT NULL DEFAULT 'none',
    repeatEndAt DATETIME,
    nextRunAt DATETIME,
    runCount INTEGER NOT NULL DEFAULT 0,
    cadenceMinSeconds INTEGER NOT NULL DEFAULT 30,
    cadenceMaxSeconds INTEGER NOT NULL DEFAULT 90,
    cadenceMaxPerHour INTEGER NOT NULL DEFAULT 40,
    windowStart TEXT,
    windowEnd TEXT,
    windowDays TEXT NOT NULL DEFAULT '[]',
    batchSize INTEGER,
    batchIntervalMinutes INTEGER,
    repeatEveryX INTEGER,
    repeatEveryUnit TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL,
    FOREIGN KEY (instanceId) REFERENCES WhatsAppInstance(id) ON UPDATE CASCADE,
    FOREIGN KEY (templateId) REFERENCES ContactTemplate(id) ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS ContactCampaignContact (
    id TEXT NOT NULL PRIMARY KEY,
    campaignId TEXT NOT NULL,
    contactId TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (campaignId) REFERENCES ContactCampaign(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (contactId) REFERENCES Contact(id) ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ContactCampaignContact_campaignId_contactId_key ON ContactCampaignContact(campaignId, contactId)`,
  `CREATE TABLE IF NOT EXISTS ContactCampaignDispatch (
    id TEXT NOT NULL PRIMARY KEY,
    campaignId TEXT NOT NULL,
    contactId TEXT NOT NULL,
    runIndex INTEGER NOT NULL DEFAULT 0,
    scheduledFor DATETIME NOT NULL,
    sentAt DATETIME,
    status TEXT NOT NULL DEFAULT 'pending',
    errorMessage TEXT,
    messageId TEXT,
    variationIdx INTEGER NOT NULL DEFAULT 0,
    resolvedText TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL,
    FOREIGN KEY (campaignId) REFERENCES ContactCampaign(id) ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (contactId) REFERENCES Contact(id) ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ContactCampaignDispatch_campaignId_contactId_runIndex_key ON ContactCampaignDispatch(campaignId, contactId, runIndex)`,
  `ALTER TABLE SystemSettings ADD COLUMN faviconBase64 TEXT`,
  `CREATE TABLE IF NOT EXISTS "SystemChangelog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "changes" TEXT NOT NULL DEFAULT '[]',
    "deployedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
  )`,
  `INSERT OR IGNORE INTO "SystemChangelog" ("id","version","title","description","changes","deployedAt","createdAt","updatedAt") VALUES (
    'changelog-v1-5-1',
    'v1.5.1',
    'Agendamento de campanhas mais intuitivo',
    'Melhoria no fluxo de criação e agendamento de campanhas em grupo, reduzindo etapas manuais e deixando claro quando a campanha entra na fila.',
    '[{"type":"feature","text":"Novo modo Enviar agora na etapa de agendamento de campanhas"},{"type":"improvement","text":"Botão final de nova campanha agora cria e agenda automaticamente, mantendo Salvar rascunho como ação separada"},{"type":"improvement","text":"Atalhos rápidos para iniciar em 15 minutos, em 1 hora ou amanhã"},{"type":"improvement","text":"Resumo de agendamento mais claro com data, recorrência, janela ou lotes"},{"type":"fix","text":"Validação do agendamento não exige data no modo imediato e evita cálculo inválido de lotes"}]',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )`,
];

try {
  for (const sql of migrations) {
    try {
      await client.execute(sql);
    } catch (err) {
      // Ignore "duplicate column" errors from ALTER TABLE ADD COLUMN
      if (err.message?.includes("duplicate column") || err.message?.includes("already exists")) {
        continue;
      }
      throw err;
    }
  }
  console.log("✓ Turso schema up to date");
} catch (err) {
  console.error("Migration error:", err.message);
  process.exit(1);
}
