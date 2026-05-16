import { prisma } from "@/lib/prisma";
import { EvolutionApiProvider } from "@/lib/providers/evolution";
import { addDays, addWeeks, addMonths, addHours } from "date-fns";

export interface DispatchResult {
  processed: number;
  errors: number;
  skipped: number;
  timestamp: string;
}

interface ContactLike {
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
}

export function resolveContactTemplate(
  variations: string[],
  contact: ContactLike,
  variableValues: Record<string, string>
): { text: string; variationIdx: number } {
  if (!variations.length) return { text: "", variationIdx: 0 };
  const variationIdx = Math.floor(Math.random() * variations.length);
  const raw = variations[variationIdx];

  const text = raw.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    switch (varName) {
      case "name":  return contact.name;
      case "phone": return contact.phone;
      case "email": return contact.email || "";
      case "notes": return contact.notes || "";
      case "date":  return new Date().toLocaleDateString("pt-BR");
      case "time":  return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      default:      return variableValues[varName] ?? `{{${varName}}}`;
    }
  });

  return { text, variationIdx };
}

function calculateNextRunAt(
  startAt: Date,
  repeatType: string,
  runCount: number,
  repeatEveryX?: number | null,
  repeatEveryUnit?: string | null
): Date | null {
  const multiplier = runCount + 1;
  switch (repeatType) {
    case "daily":   return addDays(startAt, multiplier);
    case "weekly":  return addWeeks(startAt, multiplier);
    case "monthly": return addMonths(startAt, multiplier);
    case "custom": {
      const x = repeatEveryX || 1;
      const unit = repeatEveryUnit || "days";
      if (unit === "hours") return addHours(startAt, x * multiplier);
      return addDays(startAt, x * multiplier);
    }
    default: return null;
  }
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isWithinWindow(now: Date, windowStart: string | null, windowEnd: string | null, windowDays: string): boolean {
  if (!windowStart || !windowEnd) return true;
  const days: number[] = JSON.parse(windowDays || "[]");
  if (days.length > 0 && !days.includes(now.getDay())) return false;
  const [startH, startM] = windowStart.split(":").map(Number);
  const [endH, endM] = windowEnd.split(":").map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return currentMinutes >= startH * 60 + startM && currentMinutes <= endH * 60 + endM;
}

export async function runContactDispatcher(): Promise<DispatchResult> {
  const now = new Date();
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  const duePending = await prisma.contactCampaignDispatch.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "processing", updatedAt: { lt: new Date(now.getTime() - 5 * 60 * 1000) } },
      ],
      scheduledFor: { lte: now },
      campaign: { status: { in: ["scheduled", "running"] } },
    },
    include: {
      campaign: {
        include: {
          template: true,
          instance: { include: { provider: true } },
        },
      },
      contact: true,
    },
    orderBy: { scheduledFor: "asc" },
    take: 15,
  });

  if (duePending.length === 0) return { processed: 0, errors: 0, skipped: 0, timestamp: now.toISOString() };

  const campaignIds = [...new Set(duePending.map((d) => d.campaignId))];
  await prisma.contactCampaign.updateMany({
    where: { id: { in: campaignIds }, status: "scheduled" },
    data: { status: "running" },
  });

  const evolution = new EvolutionApiProvider();

  for (const dispatch of duePending) {
    const campaign = dispatch.campaign;
    const instance = campaign.instance;
    const template = campaign.template;
    const provider = instance.provider;
    const contact = dispatch.contact;

    if (campaign.sendType === "windowed") {
      const inWindow = isWithinWindow(now, campaign.windowStart, campaign.windowEnd, campaign.windowDays);
      if (!inWindow) { skipped++; continue; }
    }

    const claimed = await prisma.contactCampaignDispatch.updateMany({
      where: { id: dispatch.id, status: { in: ["pending", "processing"] } },
      data: { status: "processing" },
    });
    if (claimed.count === 0) continue;

    try {
      if (instance.status !== "connected") {
        await prisma.contactCampaignDispatch.update({
          where: { id: dispatch.id },
          data: { status: "skipped", errorMessage: "Instância desconectada" },
        });
        skipped++;
        continue;
      }

      const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey };
      const variableValues = JSON.parse(campaign.variableValues || "{}") as Record<string, string>;
      const variations = JSON.parse(template.variations || "[]") as string[];

      const { text: resolvedText, variationIdx } = resolveContactTemplate(variations, contact, variableValues);

      let result = { messageId: "", status: "sent" };

      if (template.mediaType && template.mediaUrl) {
        result = await evolution.sendGroupMedia(
          config, instance.instanceName, contact.phone,
          template.mediaType, template.mediaUrl,
          template.mediaCaption ? resolveContactTemplate([template.mediaCaption], contact, variableValues).text : resolvedText
        );
        if (resolvedText && template.mediaCaption !== null) {
          await evolution.sendTextMessage(config, instance.instanceName, contact.phone, resolvedText);
        }
      } else {
        result = await evolution.sendTextMessage(config, instance.instanceName, contact.phone, resolvedText);
      }

      await prisma.contactCampaignDispatch.update({
        where: { id: dispatch.id },
        data: { status: "sent", sentAt: new Date(), messageId: result.messageId, variationIdx, resolvedText },
      });
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      await prisma.contactCampaignDispatch.update({
        where: { id: dispatch.id },
        data: { status: "failed", errorMessage: msg },
      });
      errors++;
    }
  }

  // Check campaign completion / schedule next run
  for (const campaignId of campaignIds) {
    const firstDispatch = duePending.find((d) => d.campaignId === campaignId);
    const campaign = firstDispatch?.campaign;
    if (!campaign) continue;

    // Use the actual runIndex from dispatches (more reliable than campaign.runCount if data drifts)
    const currentRunIndex = firstDispatch.runIndex;

    const remaining = await prisma.contactCampaignDispatch.count({
      where: { campaignId, runIndex: currentRunIndex, status: { in: ["pending", "processing"] } },
    });

    if (remaining === 0) {
      const hasRecurrence = campaign.repeatType !== "none";

      if (!hasRecurrence) {
        const totalDispatches = await prisma.contactCampaignDispatch.count({ where: { campaignId, runIndex: currentRunIndex } });
        const failedDispatches = await prisma.contactCampaignDispatch.count({ where: { campaignId, runIndex: currentRunIndex, status: "failed" } });
        const finalStatus = totalDispatches > 0 && failedDispatches === totalDispatches ? "error" : "completed";
        await prisma.contactCampaign.update({ where: { id: campaignId }, data: { status: finalStatus } });
      } else {
        const nextRunAt = calculateNextRunAt(
          campaign.startAt, campaign.repeatType, currentRunIndex,
          campaign.repeatEveryX, campaign.repeatEveryUnit
        );
        const expired = campaign.repeatEndAt && nextRunAt && nextRunAt > campaign.repeatEndAt;

        if (!nextRunAt || expired) {
          await prisma.contactCampaign.update({ where: { id: campaignId }, data: { status: "completed" } });
        } else {
          const newRunIndex = currentRunIndex + 1;
          const existingNextRun = await prisma.contactCampaignDispatch.count({ where: { campaignId, runIndex: newRunIndex } });

          if (existingNextRun === 0) {
            const contacts = await prisma.contactCampaignContact.findMany({
              where: { campaignId },
              include: { contact: true },
              orderBy: { order: "asc" },
            });

            const nextStart = nextRunAt.getTime();
            const newDispatches: { campaignId: string; contactId: string; runIndex: number; scheduledFor: Date }[] = [];

            if (campaign.sendType === "batch" && campaign.batchSize && campaign.batchIntervalMinutes) {
              let batchStart = nextStart;
              for (let i = 0; i < contacts.length; i++) {
                if (i > 0 && i % campaign.batchSize === 0) batchStart += campaign.batchIntervalMinutes * 60 * 1000;
                newDispatches.push({ campaignId, contactId: contacts[i].contactId, runIndex: newRunIndex, scheduledFor: new Date(batchStart) });
              }
            } else {
              const hourBuckets: Record<number, number> = {};
              let cursor = nextStart;
              for (let i = 0; i < contacts.length; i++) {
                if (i > 0) {
                  const delaySec = randomBetween(campaign.cadenceMinSeconds, campaign.cadenceMaxSeconds);
                  cursor += delaySec * 1000;
                  const hourKey = Math.floor(cursor / 3_600_000);
                  hourBuckets[hourKey] = (hourBuckets[hourKey] || 0) + 1;
                  if (hourBuckets[hourKey] > campaign.cadenceMaxPerHour) {
                    cursor = (hourKey + 1) * 3_600_000;
                    hourBuckets[hourKey + 1] = 1;
                  }
                } else {
                  hourBuckets[Math.floor(cursor / 3_600_000)] = 1;
                }
                newDispatches.push({ campaignId, contactId: contacts[i].contactId, runIndex: newRunIndex, scheduledFor: new Date(cursor) });
              }
            }

            await prisma.contactCampaignDispatch.createMany({ data: newDispatches });
          }

          await prisma.contactCampaign.update({
            where: { id: campaignId },
            data: { status: "scheduled", runCount: newRunIndex, nextRunAt },
          });
        }
      }
    }
  }

  return { processed, errors, skipped, timestamp: now.toISOString() };
}
