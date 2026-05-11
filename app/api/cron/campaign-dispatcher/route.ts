import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EvolutionApiProvider } from "@/lib/providers/evolution";
import { addDays, addWeeks, addMonths, addHours } from "date-fns";

function resolveTemplate(body: string, variableValues: Record<string, string>, groupName: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    if (varName === "group_name") return groupName;
    if (varName === "date") return new Date().toLocaleDateString("pt-BR");
    if (varName === "time") return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return variableValues[varName] ?? `{{${varName}}}`;
  });
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

/** Check if current time is within the campaign's allowed time window */
function isWithinWindow(now: Date, windowStart: string | null, windowEnd: string | null, windowDays: string): boolean {
  if (!windowStart || !windowEnd) return true;

  const days: number[] = JSON.parse(windowDays || "[]");
  if (days.length > 0 && !days.includes(now.getDay())) return false;

  const [startH, startM] = windowStart.split(":").map(Number);
  const [endH, endM] = windowEnd.split(":").map(Number);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const windowStartMin = startH * 60 + startM;
  const windowEndMin = endH * 60 + endM;

  return currentMinutes >= windowStartMin && currentMinutes <= windowEndMin;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      const isVercelCron = req.headers.get("x-vercel-cron") === "1";
      if (!isVercelCron) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  const now = new Date();
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  try {
    const duePending = await prisma.campaignDispatch.findMany({
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
        group: true,
      },
      orderBy: { scheduledFor: "asc" },
      take: 15,
    });

    if (duePending.length === 0) return NextResponse.json({ processed: 0, errors: 0, skipped: 0 });

    const campaignIds = [...new Set(duePending.map((d) => d.campaignId))];
    await prisma.campaign.updateMany({
      where: { id: { in: campaignIds }, status: "scheduled" },
      data: { status: "running" },
    });

    const evolution = new EvolutionApiProvider();

    for (const dispatch of duePending) {
      const campaign = dispatch.campaign;
      const instance = campaign.instance;
      const template = campaign.template;
      const provider = instance.provider;

      // Check time window for windowed campaigns
      if (campaign.sendType === "windowed") {
        const inWindow = isWithinWindow(now, campaign.windowStart, campaign.windowEnd, campaign.windowDays);
        if (!inWindow) {
          skipped++;
          continue; // Leave as pending — will be retried next cron run inside the window
        }
      }

      // Claim dispatch atomically
      const claimed = await prisma.campaignDispatch.updateMany({
        where: { id: dispatch.id, status: { in: ["pending", "processing"] } },
        data: { status: "processing" },
      });
      if (claimed.count === 0) continue;

      try {
        if (instance.status !== "connected") {
          await prisma.campaignDispatch.update({
            where: { id: dispatch.id },
            data: { status: "skipped", errorMessage: "Instância desconectada" },
          });
          continue;
        }

        const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey };
        const variableValues = JSON.parse(campaign.variableValues || "{}") as Record<string, string>;
        const resolvedText = resolveTemplate(template.body, variableValues, dispatch.group.name);

        let result = { messageId: "", status: "sent" };

        if (template.mediaType && template.mediaUrl) {
          result = await evolution.sendGroupMedia(
            config,
            instance.instanceName,
            dispatch.group.groupJid,
            template.mediaType,
            template.mediaUrl,
            template.mediaCaption ? resolveTemplate(template.mediaCaption, variableValues, dispatch.group.name) : resolvedText
          );
          if (resolvedText && template.mediaCaption !== null) {
            await evolution.sendGroupMessage(config, instance.instanceName, dispatch.group.groupJid, resolvedText);
          }
        } else {
          result = await evolution.sendGroupMessage(config, instance.instanceName, dispatch.group.groupJid, resolvedText);
        }

        await prisma.campaignDispatch.update({
          where: { id: dispatch.id },
          data: { status: "sent", sentAt: new Date(), messageId: result.messageId },
        });
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro desconhecido";
        await prisma.campaignDispatch.update({
          where: { id: dispatch.id },
          data: { status: "failed", errorMessage: msg },
        });
        errors++;
      }
    }

    // Check campaign completion
    for (const campaignId of campaignIds) {
      const campaign = duePending.find((d) => d.campaignId === campaignId)?.campaign;
      if (!campaign) continue;

      const remaining = await prisma.campaignDispatch.count({
        where: {
          campaignId,
          runIndex: campaign.runCount,
          status: { in: ["pending", "processing"] },
        },
      });

      if (remaining === 0) {
        const hasRecurrence = campaign.repeatType !== "none";

        if (!hasRecurrence) {
          // Check if there were too many errors — mark as "error" if all dispatches failed
          const totalDispatches = await prisma.campaignDispatch.count({ where: { campaignId, runIndex: campaign.runCount } });
          const failedDispatches = await prisma.campaignDispatch.count({ where: { campaignId, runIndex: campaign.runCount, status: "failed" } });
          const finalStatus = totalDispatches > 0 && failedDispatches === totalDispatches ? "error" : "completed";

          await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: finalStatus },
          });
        } else {
          const nextRunAt = calculateNextRunAt(
            campaign.startAt, campaign.repeatType, campaign.runCount,
            campaign.repeatEveryX, campaign.repeatEveryUnit
          );
          const expired = campaign.repeatEndAt && nextRunAt && nextRunAt > campaign.repeatEndAt;

          if (!nextRunAt || expired) {
            await prisma.campaign.update({ where: { id: campaignId }, data: { status: "completed" } });
          } else {
            const newRunIndex = campaign.runCount + 1;
            const existingNextRun = await prisma.campaignDispatch.count({ where: { campaignId, runIndex: newRunIndex } });

            if (existingNextRun === 0) {
              const groups = await prisma.campaignGroup.findMany({
                where: { campaignId },
                include: { group: true },
                orderBy: { order: "asc" },
              });

              const nextStart = nextRunAt.getTime();
              const newDispatches: { campaignId: string; groupId: string; runIndex: number; scheduledFor: Date }[] = [];

              if (campaign.sendType === "batch" && campaign.batchSize && campaign.batchIntervalMinutes) {
                let batchStart = nextStart;
                for (let i = 0; i < groups.length; i++) {
                  if (i > 0 && i % campaign.batchSize === 0) {
                    batchStart += campaign.batchIntervalMinutes * 60 * 1000;
                  }
                  newDispatches.push({ campaignId, groupId: groups[i].groupId, runIndex: newRunIndex, scheduledFor: new Date(batchStart) });
                }
              } else {
                const hourBuckets: Record<number, number> = {};
                let cursor = nextStart;
                for (let i = 0; i < groups.length; i++) {
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
                  newDispatches.push({ campaignId, groupId: groups[i].groupId, runIndex: newRunIndex, scheduledFor: new Date(cursor) });
                }
              }

              await prisma.campaignDispatch.createMany({ data: newDispatches });
            }

            await prisma.campaign.update({
              where: { id: campaignId },
              data: { status: "scheduled", runCount: campaign.runCount + 1, nextRunAt },
            });
          }
        }
      }
    }
  } catch (e) {
    console.error("[CronDispatcher]", e);
    return NextResponse.json({ error: "Cron error", message: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }

  return NextResponse.json({ processed, errors, skipped, timestamp: now.toISOString() });
}
