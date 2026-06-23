import { prisma } from "@/lib/prisma";
import { EvolutionApiProvider } from "@/lib/providers/evolution";
import { checkInstanceForDispatch } from "@/lib/dispatch-instance-check";
import { resolveQuickMessage } from "@/lib/quick-resolve";

export interface QuickDispatchRunResult {
  processed: number;
  errors: number;
  skipped: number;
  timestamp: string;
}

export async function runQuickDispatcher(): Promise<QuickDispatchRunResult> {
  const now = new Date();
  let processed = 0;
  let errors = 0;
  let skipped = 0;

  const staleCutoff = new Date(now.getTime() - 5 * 60 * 1000);

  const duePending = await prisma.quickDispatchRecipient.findMany({
    where: {
      OR: [
        { status: "pending" },
        { status: "processing", updatedAt: { lt: staleCutoff } },
      ],
      scheduledFor: { lte: now },
      quickDispatch: { status: { in: ["scheduled", "running"] } },
    },
    include: {
      quickDispatch: {
        include: {
          instance: { include: { provider: true } },
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: 15,
  });

  if (duePending.length === 0) {
    return { processed: 0, errors: 0, skipped: 0, timestamp: now.toISOString() };
  }

  // Marca os QuickDispatch envolvidos como "running" (apenas os ainda agendados).
  const quickDispatchIds = [...new Set(duePending.map((d) => d.quickDispatchId))];
  await prisma.quickDispatch.updateMany({
    where: { id: { in: quickDispatchIds }, status: "scheduled" },
    data: { status: "running" },
  });

  const evolution = new EvolutionApiProvider();

  for (const recipient of duePending) {
    const qd = recipient.quickDispatch;
    const instance = qd.instance;
    const provider = instance.provider;

    // Claim atômico: garante que apenas um worker processa este destinatário.
    const claimed = await prisma.quickDispatchRecipient.updateMany({
      where: {
        id: recipient.id,
        OR: [
          { status: "pending" },
          { status: "processing", updatedAt: { lt: staleCutoff } },
        ],
      },
      data: { status: "processing" },
    });
    if (claimed.count === 0) continue;

    try {
      if (instance.status !== "connected") {
        // O status no banco pode estar stale (instância órfã/derrubada na Evolution).
        // Revalida ao vivo: se conectada, sincroniza e prossegue; se desconectada/inacessível,
        // reagenda (volta a "pending") para retentar até a janela de 24h em vez de descartar.
        const check = await checkInstanceForDispatch({
          providerType: provider.type,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          instanceId: instance.id,
          instanceName: instance.instanceName,
          dbStatus: instance.status,
          scheduledFor: recipient.scheduledFor,
          now,
        });
        if (check.action === "reschedule") {
          await prisma.quickDispatchRecipient.update({
            where: { id: recipient.id },
            data: { status: "pending", errorMessage: check.reason },
          });
          skipped++;
          continue;
        }
        if (check.action === "fail") {
          await prisma.quickDispatchRecipient.update({
            where: { id: recipient.id },
            data: { status: "failed", errorMessage: check.reason },
          });
          errors++;
          continue;
        }
        // action === "proceed": status sincronizado para "connected" — segue o envio normal.
      }

      const config = { baseUrl: provider.baseUrl, apiKey: provider.apiKey };

      let vars: Record<string, string> = {};
      try {
        vars = JSON.parse(recipient.varsJson || "{}") as Record<string, string>;
      } catch {
        vars = {};
      }

      const text = resolveQuickMessage(qd.message, vars);

      let result: { messageId: string; status: string } = { messageId: "", status: "sent" };

      if (qd.mediaType && qd.mediaUrl) {
        const caption = qd.mediaCaption ? resolveQuickMessage(qd.mediaCaption, vars) : text;
        result = await evolution.sendGroupMedia(
          config, instance.instanceName, recipient.phone,
          qd.mediaType, qd.mediaUrl, caption
        );
        // Quando há legenda própria, o corpo da mensagem é enviado como texto separado.
        if (text && qd.mediaCaption !== null) {
          await evolution.sendTextMessage(config, instance.instanceName, recipient.phone, text);
        }
      } else {
        result = await evolution.sendTextMessage(config, instance.instanceName, recipient.phone, text);
      }

      await prisma.quickDispatchRecipient.update({
        where: { id: recipient.id },
        data: { status: "sent", sentAt: new Date(), messageId: result.messageId, resolvedText: text },
      });
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      await prisma.quickDispatchRecipient.update({
        where: { id: recipient.id },
        data: { status: "failed", errorMessage: msg },
      });
      errors++;
    }
  }

  // Finalização: sem recorrência. Marca cada QuickDispatch concluído.
  for (const quickDispatchId of quickDispatchIds) {
    const remaining = await prisma.quickDispatchRecipient.count({
      where: { quickDispatchId, status: { in: ["pending", "processing"] } },
    });

    if (remaining === 0) {
      const total = await prisma.quickDispatchRecipient.count({ where: { quickDispatchId } });
      const failed = await prisma.quickDispatchRecipient.count({ where: { quickDispatchId, status: "failed" } });
      const finalStatus = total > 0 && failed === total ? "error" : "completed";
      await prisma.quickDispatch.update({ where: { id: quickDispatchId }, data: { status: finalStatus } });
    }
  }

  return { processed, errors, skipped, timestamp: now.toISOString() };
}
