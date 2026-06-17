-- CreateTable
CREATE TABLE "QuickDispatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "instanceId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "mediaCaption" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "cadenceMinSeconds" INTEGER NOT NULL DEFAULT 10,
    "cadenceMaxSeconds" INTEGER NOT NULL DEFAULT 30,
    "cadenceMaxPerHour" INTEGER NOT NULL DEFAULT 60,
    "startAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuickDispatch_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "WhatsAppInstance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuickDispatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuickDispatchRecipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quickDispatchId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "varsJson" TEXT NOT NULL DEFAULT '{}',
    "order" INTEGER NOT NULL DEFAULT 0,
    "scheduledFor" DATETIME NOT NULL,
    "sentAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "messageId" TEXT,
    "resolvedText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuickDispatchRecipient_quickDispatchId_fkey" FOREIGN KEY ("quickDispatchId") REFERENCES "QuickDispatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "QuickDispatchRecipient_status_scheduledFor_idx" ON "QuickDispatchRecipient"("status", "scheduledFor");
