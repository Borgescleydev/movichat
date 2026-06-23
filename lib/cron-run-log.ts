import { prisma } from "@/lib/prisma";

// F-229: registro leve do último disparo do cron externo para observabilidade.
// Persistido no singleton SystemSettings (campo lastCronRunJson) — compartilhado
// entre as funções serverless do dispatcher (escreve) e do status (lê), já que
// memória de processo não é compartilhada entre rotas no ambiente serverless.
export interface CronRunRecord {
  // Momento (ISO) em que o endpoint do dispatcher foi chamado.
  ranAt: string;
  // Se a chamada passou na autenticação (ou rodou em dev sem segredo).
  authorized: boolean;
  // Status HTTP retornado ao cron externo (200 / 401 / 503 / 500).
  status: number;
  // Diagnóstico legível, SEM vazar o segredo nem o token (apenas comprimentos).
  reason: string;
  // Em caso de sucesso: quantos itens foram despachados / erros / ignorados.
  dispatched?: number;
  errors?: number;
  skipped?: number;
}

// Grava o último disparo. Best-effort: NUNCA lança — qualquer falha aqui não pode
// derrubar a request do dispatcher.
export async function recordCronRun(record: CronRunRecord): Promise<void> {
  try {
    const json = JSON.stringify(record);
    await prisma.systemSettings.upsert({
      where: { id: "default" },
      update: { lastCronRunJson: json },
      create: { id: "default", themeJson: "{}", lastCronRunJson: json },
    });
  } catch (e) {
    console.warn("[CronRunLog] falha ao registrar último disparo (ignorado):", e);
  }
}

// Lê o último disparo registrado. Retorna null se não houver ou em caso de erro.
export async function readCronRun(): Promise<CronRunRecord | null> {
  try {
    const settings = await prisma.systemSettings.findUnique({
      where: { id: "default" },
      select: { lastCronRunJson: true },
    });
    if (!settings?.lastCronRunJson) return null;
    return JSON.parse(settings.lastCronRunJson) as CronRunRecord;
  } catch (e) {
    console.warn("[CronRunLog] falha ao ler último disparo (ignorado):", e);
    return null;
  }
}
