import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

// One-time migration endpoint to create missing tables
// Protected by WEBHOOK_SECRET env var passed as ?secret= query param
export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const results: string[] = [];

  const tables = [
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
      name: "WhatsAppInstance_conversationsEnabled",
      sql: `ALTER TABLE "WhatsAppInstance" ADD COLUMN "conversationsEnabled" INTEGER NOT NULL DEFAULT 1`,
    },
    {
      name: "Contact_instanceId",
      sql: `ALTER TABLE "Contact" ADD COLUMN "instanceId" TEXT REFERENCES "WhatsAppInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
    },
    {
      name: "Contact_lastReadAt",
      sql: `ALTER TABLE "Contact" ADD COLUMN "lastReadAt" DATETIME`,
    },
    {
      name: "Message_mediaUrl",
      sql: `ALTER TABLE "Message" ADD COLUMN "mediaUrl" TEXT`,
    },
    {
      name: "Message_mediaType",
      sql: `ALTER TABLE "Message" ADD COLUMN "mediaType" TEXT`,
    },
    {
      name: "Message_waMessageId",
      sql: `ALTER TABLE "Message" ADD COLUMN "waMessageId" TEXT`,
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
  ];

  for (const t of tables) {
    try {
      await prisma.$executeRawUnsafe(t.sql);
      results.push(`✓ ${t.name}`);
    } catch (e) {
      results.push(`✗ ${t.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({ results });
}

// GET: debug DB state
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, active: true } });
  const providers = await prisma.apiProvider.findMany({
    select: { id: true, name: true, type: true, baseUrl: true, active: true, instances: { select: { id: true, instanceName: true, status: true, phone: true, label: true } } }
  });
  return NextResponse.json({ users, providers });
}

// PUT: reset superadmin password
export async function PUT(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }
  const body = await req.json();
  const { username, password } = body;
  if (!username || !password) return NextResponse.json({ error: "username e password obrigatórios" }, { status: 400 });

  const hashed = await hashPassword(password);
  // Upsert superadmin
  const existing = await prisma.user.findFirst({ where: { username } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { password: hashed, role: "superadmin", active: true } });
    return NextResponse.json({ updated: username });
  } else {
    await prisma.user.create({ data: { name: username, username, password: hashed, role: "superadmin" } });
    return NextResponse.json({ created: username });
  }
}
