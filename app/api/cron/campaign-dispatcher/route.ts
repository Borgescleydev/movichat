import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EvolutionApiProvider } from "@/lib/providers/evolution";
import { addDays, addWeeks, addMonths } from "date-fns";

// Resolve template body with variable values and group name
function resolveTemplate(body: string, variableValues: Record<string, string>, groupName: string): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    if (varName === "group_name") return groupName;
    if (varName === "date") return new Date().toLocaleDateString("pt-BR");
    if (varName === "time") return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return variableValues[varName] ?? `{{${varName}}}`;
  });
}

function calculateNextRunAt(startAt: Date, repeatType: string, runCount: number): Date | null {
  const base = startAt;
  switch (repeatType) {
    case "daily":   return addDays(base, runCount + 1);
    case "weekly":  return addWeeks(base, runCount + 1);
    case "monthly": return addMonths(base, runCount + 1);
    default:        return null;
  }
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function GET(req: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      // Also allow Vercel's internal cron (no auth header in some setups)
      const isVercelCron = req.headers.get("x-vercel-cron") === "1";
      if (!isVercelCron) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  const now = new Date();
  let processed = 0;
  let errors = 0;

  try {
    // Fetch due dispatches — optimistic locking: claim them by setting status=processing
    const duePending = await prisma.campaignDispatch.findMany({
      where: {
        OR: [
          { status: "pending" },
          // Retry stuck "processing" dispatches older than 5 min
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

    if (duePending.length === 0) return NextResponse.json({ processed: 0, errors: 0 });

    // Mark campaigns as running (first dispatch per campaign)
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

      // Claim dispatch atomically
      const claimed = await prisma.campaignDispatch.updateMany({
        where: { id: dispatch.id, status: { in: ["pending", "processing"] } },
        data: { status: "processing" },
      });
      if (claimed.count === 0) continue; // Already claimed by another invocation

      try {
        // Check instance connectivity
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
          // Send media with caption (caption contains the resolved text)
          result = await evolution.sendGroupMedia(
            config,
            instance.instanceName,
            dispatch.group.groupJid,
            template.mediaType,
            template.mediaUrl,
            template.mediaCaption ? resolveTemplate(template.mediaCaption, variableValues, dispatch.group.name) : resolvedText
          );
          // If there's both text body and media, send text separately
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
        if (campaign.repeatType === "none") {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { status: "completed" },
          });
        } else {
          const nextRunAt = calculateNextRunAt(campaign.startAt, campaign.repeatType, campaign.runCount);
          const expired = campaign.repeatEndAt && nextRunAt && nextRunAt > campaign.repeatEndAt;

          if (!nextRunAt || expired) {
            await prisma.campaign.update({
              where: { id: campaignId },
              data: { status: "completed" },
            });
          } else {
            // Create dispatches for the next run
            const newRunIndex = campaign.runCount + 1;
            const existingNextRun = await prisma.campaignDispatch.count({
              where: { campaignId, runIndex: newRunIndex },
            });

            if (existingNextRun === 0) {
              const groups = await prisma.campaignGroup.findMany({
                where: { campaignId },
                include: { group: true },
                orderBy: { order: "asc" },
              });

              const nextStart = nextRunAt.getTime();
              const hourBuckets: Record<number, number> = {};
              let cursor = nextStart;
              const newDispatches: { campaignId: string; groupId: string; runIndex: number; scheduledFor: Date }[] = [];

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
                newDispatches.push({
                  campaignId,
                  groupId: groups[i].groupId,
                  runIndex: newRunIndex,
                  scheduledFor: new Date(cursor),
                });
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

  return NextResponse.json({ processed, errors, timestamp: now.toISOString() });
}
