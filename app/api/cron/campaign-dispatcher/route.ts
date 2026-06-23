import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runCampaignDispatcher } from "@/lib/campaign-dispatcher";
import { runContactDispatcher } from "@/lib/contact-dispatcher";
import { runManualDispatcher } from "@/lib/manual-dispatcher";
import { runQuickDispatcher } from "@/lib/quick-dispatcher";

// F-227: comparação em tempo constante com guarda de comprimento.
// Buffers de tamanhos diferentes nunca chegam ao timingSafeEqual (que lançaria);
// tamanho divergente => não autorizado, sem vazar timing.
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";

  if (cronSecret) {
    // Gatilho esperado: cron externo (cron-job.org) enviando "Authorization: Bearer <CRON_SECRET>".
    // Bypass mantido para o header injetado pelo Vercel Cron, caso algum dia exista.
    // F-227: normaliza ambos os lados antes de comparar — remove o prefixo "Bearer "
    // (case-insensitive, qualquer whitespace) e apara espaços/newline invisíveis que,
    // colados por engano no CRON_SECRET (Vercel) ou no header (cron-job.org), causavam 401 permanente.
    const expected = cronSecret.trim();
    const token = auth?.replace(/^Bearer\s+/i, "").trim() ?? "";
    const tokenMatches = token.length > 0 && constantTimeEquals(token, expected);
    const authorized = tokenMatches || isVercelCron;
    if (!authorized) {
      // F-217/F-227: fim do 401 silencioso — log no servidor (sem vazar o segredo nem o token) +
      // corpo JSON claro. Inclui apenas os COMPRIMENTOS recebido vs esperado e se o header veio,
      // pra diagnosticar whitespace/header ausente no cron-job.org sem expor valores.
      const headerPresent = auth != null && auth.length > 0;
      console.warn(
        `[CronDispatcher] 401: Authorization ${headerPresent ? "presente porém divergente" : "ausente"}; ` +
        `token len=${token.length} vs esperado len=${expected.length}; x-vercel-cron=${isVercelCron ? "1" : "ausente"}. ` +
        "Configure no cron externo (cron-job.org) o header " +
        "'Authorization: Bearer <CRON_SECRET>' com o MESMO valor de CRON_SECRET " +
        "definido nas Environment Variables do Vercel (produção), sem espaços/newline no fim."
      );
      return NextResponse.json(
        { error: "Cron não autorizado: header Authorization ausente ou CRON_SECRET incorreto" },
        { status: 401 }
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    // F-218: sem CRON_SECRET em produção o cron externo não tem como autenticar.
    // NÃO deixamos o endpoint aberto: bloqueia e orienta a configuração.
    console.warn(
      "[CronDispatcher] CRON_SECRET não definido em produção — endpoint bloqueado. " +
      "Defina CRON_SECRET nas Environment Variables do Vercel e use o mesmo valor no header " +
      "'Authorization: Bearer <CRON_SECRET>' do cron externo (cron-job.org)."
    );
    return NextResponse.json(
      { error: "Cron indisponível: CRON_SECRET não configurado no servidor. Defina CRON_SECRET nas env vars do Vercel (produção)." },
      { status: 503 }
    );
  } else {
    console.warn(
      "[CronDispatcher] CRON_SECRET não definido — executando sem autenticação " +
      "(permitido apenas fora de produção, para testes locais)."
    );
  }

  try {
    const [groups, contacts, manual, quick] = await Promise.all([
      runCampaignDispatcher(),
      runContactDispatcher(),
      runManualDispatcher(),
      runQuickDispatcher(),
    ]);
    // Resumo útil para o painel do cron-job.org ver um 200 com corpo informativo.
    const summary = {
      processed: groups.processed + contacts.processed + manual.processed + quick.processed,
      errors: groups.errors + contacts.errors + manual.errors + quick.errors,
      skipped: groups.skipped + contacts.skipped + manual.skipped + quick.skipped,
    };
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      summary,
      groups,
      contacts,
      manual,
      quick,
    });
  } catch (e) {
    console.error("[CronDispatcher]", e);
    return NextResponse.json(
      { error: "Cron error", message: e instanceof Error ? e.message : "unknown" },
      { status: 500 }
    );
  }
}
