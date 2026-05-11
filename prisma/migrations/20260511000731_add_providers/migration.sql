-- AlterTable
ALTER TABLE "WhatsAppSession" ADD COLUMN "instanceId" TEXT;
ALTER TABLE "WhatsAppSession" ADD COLUMN "providerId" TEXT;

-- CreateTable
CREATE TABLE "ApiProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "webhookUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WhatsAppInstance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "providerId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "instanceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "phone" TEXT,
    "qrCode" TEXT,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WhatsAppInstance_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ApiProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
