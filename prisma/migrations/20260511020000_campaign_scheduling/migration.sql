-- AlterTable: add new scheduling fields to Campaign
ALTER TABLE "Campaign" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'whatsapp';
ALTER TABLE "Campaign" ADD COLUMN "sendType" TEXT NOT NULL DEFAULT 'scheduled';
ALTER TABLE "Campaign" ADD COLUMN "windowStart" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "windowEnd" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "windowDays" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Campaign" ADD COLUMN "batchSize" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "batchIntervalMinutes" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "repeatEveryX" INTEGER;
ALTER TABLE "Campaign" ADD COLUMN "repeatEveryUnit" TEXT;
