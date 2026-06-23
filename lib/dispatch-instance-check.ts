import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/providers";

/**
 * Janela máxima de retentativa para um dispatch cuja instância aparece desconectada.
 *
 * Enquanto a instância estiver com status stale/desconectado, o item é REAGENDADO a cada
 * tick (em vez de falhar em definitivo). Passada esta janela contada a partir de
 * `scheduledFor`, o item é finalmente marcado como `failed` para não retentar para sempre.
 *
 * Usa janela de tempo (sem contador de tentativas) por não exigir migração de schema.
 */
export const DISPATCH_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24h

export type InstanceCheckResult =
  | { action: "proceed" }
  | { action: "reschedule"; reason: string }
  | { action: "fail"; reason: string };

interface CheckArgs {
  providerType: string;
  baseUrl: string;
  apiKey: string;
  instanceId: string;
  instanceName: string;
  /** Valor de `WhatsAppInstance.status` lido do banco no início do tick (pode estar stale). */
  dbStatus: string;
  scheduledFor: Date;
  now: Date;
}

/**
 * Decide o que fazer com um dispatch quando o status da instância no banco NÃO é "connected".
 *
 * O campo `WhatsAppInstance.status` pode estar dessincronizado do estado real na Evolution
 * (instância órfã/derrubada), então em vez de descartar o item cegamente revalidamos o status
 * AO VIVO via `provider.getStatus` (mesmo padrão do DELETE de instância):
 *
 *  - Status ao vivo "connected" → sincroniza o banco e retorna `proceed` (segue o envio normal).
 *  - Genuinamente desconectada OU provider inacessível → NÃO falha em definitivo: retorna
 *    `reschedule` para retentar no próximo tick, até `scheduledFor + DISPATCH_RETRY_WINDOW_MS`;
 *    depois disso retorna `fail` com motivo claro.
 *
 * Sempre devolve um `reason` legível para registrar no item/log (nunca engole o erro).
 */
export async function checkInstanceForDispatch(args: CheckArgs): Promise<InstanceCheckResult> {
  let liveStatus: string | null = null;
  try {
    const provider = getProvider(args.providerType);
    liveStatus = await provider.getStatus(
      { baseUrl: args.baseUrl, apiKey: args.apiKey },
      args.instanceName,
    );
  } catch {
    liveStatus = null; // provider inacessível — trata como indeterminado (adiável)
  }

  if (liveStatus === "connected") {
    // Status no banco estava stale: sincroniza para o real e segue o envio.
    await prisma.whatsAppInstance.update({
      where: { id: args.instanceId },
      data: { status: "connected" },
    });
    return { action: "proceed" };
  }

  const liveLabel = liveStatus ?? "provedor inacessível";
  const pastWindow = args.now.getTime() > args.scheduledFor.getTime() + DISPATCH_RETRY_WINDOW_MS;

  if (pastWindow) {
    return {
      action: "fail",
      reason: `Instância desconectada (status ao vivo: ${liveLabel}); janela de retentativa de 24h expirada.`,
    };
  }

  return {
    action: "reschedule",
    reason: `Instância desconectada (status ao vivo: ${liveLabel}); reagendado para nova tentativa no próximo tick.`,
  };
}
