import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/providers";
import { checkInstanceForDispatch } from "@/lib/dispatch-instance-check";

export interface ManualDispatchRunResult {
  processed: number;
  errors: number;
  skipped: number;
  timestamp: string;
}

export async function runManualDispatcher(): Promise<ManualDispatchRunResult> {
  const now = new Date();
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  const STALE_PROCESSING_CUTOFF = new Date(now.getTime() - 5 * 60 * 1000); // 5 min atrás

  const due = await prisma.scheduledManualDispatch.findMany({
    where: {
      OR: [
        { status: "scheduled" },
        { status: "processing", updatedAt: { lte: STALE_PROCESSING_CUTOFF } },
      ],
      scheduledFor: { lte: now },
    },
    include: { instance: { include: { provider: true } } },
    orderBy: { scheduledFor: "asc" },
    take: 10,
  });

  for (const job of due) {
    const claimed = await prisma.scheduledManualDispatch.updateMany({
      where: {
        id: job.id,
        OR: [
          { status: "scheduled" },
          { status: "processing", updatedAt: { lte: STALE_PROCESSING_CUTOFF } },
        ],
      },
      data: { status: "processing" },
    });
    if (claimed.count === 0) continue;

    try {
      if (job.instance.status !== "connected") {
        // O status no banco pode estar stale (instância órfã/derrubada na Evolution).
        // Revalida ao vivo antes de descartar: se de fato conectada, sincroniza e prossegue;
        // se desconectada/inacessível, reagenda para retentar (até a janela de 24h) em vez
        // de falhar em definitivo.
        const check = await checkInstanceForDispatch({
          providerType: job.instance.provider.type,
          baseUrl: job.instance.provider.baseUrl,
          apiKey: job.instance.provider.apiKey,
          instanceId: job.instanceId,
          instanceName: job.instance.instanceName,
          dbStatus: job.instance.status,
          scheduledFor: job.scheduledFor,
          now,
        });
        if (check.action === "reschedule") {
          await prisma.scheduledManualDispatch.update({
            where: { id: job.id },
            data: { status: "scheduled", errorMessage: check.reason },
          });
          skipped++;
          continue;
        }
        if (check.action === "fail") {
          await prisma.scheduledManualDispatch.update({
            where: { id: job.id },
            data: { status: "failed", errorMessage: check.reason },
          });
          skipped++;
          continue;
        }
        // action === "proceed": status sincronizado para "connected" — segue o envio normal.
      }

      const groupIds = JSON.parse(job.groupIds || "[]") as string[];
      const groups = await prisma.whatsAppGroup.findMany({
        where: { id: { in: groupIds }, instanceId: job.instanceId },
      });
      if (groups.length === 0) {
        await prisma.scheduledManualDispatch.update({
          where: { id: job.id },
          data: { status: "failed", errorMessage: "Nenhum grupo valido encontrado" },
        });
        skipped++;
        continue;
      }

      const provider = getProvider(job.instance.provider.type);
      const config = { baseUrl: job.instance.provider.baseUrl, apiKey: job.instance.provider.apiKey };
      const hasMedia = Boolean(job.mediaType && job.mediaUrl);
      const results: { groupId: string; name: string; status: "sent" | "failed"; error?: string }[] = [];

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        try {
          if (hasMedia && provider.sendGroupMedia) {
            await provider.sendGroupMedia(
              config,
              job.instance.instanceName,
              group.groupJid,
              job.mediaType!,
              job.mediaUrl!,
              job.mediaCaption || job.message || "",
              job.fileName || undefined,
            );
          } else if (provider.sendGroupMessage) {
            await provider.sendGroupMessage(config, job.instance.instanceName, group.groupJid, job.message);
          } else {
            await provider.sendTextMessage(config, job.instance.instanceName, group.groupJid, job.message);
          }
          results.push({ groupId: group.id, name: group.name, status: "sent" });
        } catch (e) {
          results.push({
            groupId: group.id,
            name: group.name,
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          });
        }

        // Delay randomizado entre grupos para evitar burst (não após o último)
        if (i < groups.length - 1) {
          const delayMs = 1000 + Math.floor(Math.random() * 1000); // 1-2s
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      const sent = results.filter((r) => r.status === "sent").length;
      const failed = results.filter((r) => r.status === "failed").length;

      await prisma.manualDispatchLog.create({
        data: {
          instanceId: job.instanceId,
          message: job.message,
          mediaType: hasMedia ? job.mediaType : null,
          mediaCaption: hasMedia ? job.mediaCaption : null,
          hasMedia,
          groupCount: groups.length,
          sentCount: sent,
          failedCount: failed,
          results: JSON.stringify(results),
          sentAt: new Date(),
        },
      });

      await prisma.scheduledManualDispatch.update({
        where: { id: job.id },
        data: {
          status: failed === groups.length ? "failed" : "completed",
          errorMessage: failed > 0 ? `${failed} grupo(s) falharam` : null,
        },
      });
      processed++;
    } catch (e) {
      await prisma.scheduledManualDispatch.update({
        where: { id: job.id },
        data: { status: "failed", errorMessage: e instanceof Error ? e.message : String(e) },
      });
      errors++;
    }
  }

  return { processed, errors, skipped, timestamp: now.toISOString() };
}
