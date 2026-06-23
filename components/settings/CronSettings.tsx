"use client";

import { useEffect, useState, useCallback } from "react";

interface LastCronRun {
  ranAt: string;
  authorized: boolean;
  status: number;
  reason: string;
  dispatched?: number;
  errors?: number;
  skipped?: number;
}

interface CronStatus {
  cron: { schedule: string; path: string; description: string };
  lastCronRun: LastCronRun | null;
  queue: { pending: number; processing: number };
  campaigns: { running: number; scheduled: number; all: Record<string, number> };
  recentDispatches: {
    id: string;
    campaignName: string;
    groupName: string;
    status: string;
    sentAt: string | null;
    updatedAt: string;
    errorMessage: string | null;
  }[];
}

interface TriggerResult {
  triggered: boolean;
  result?: { processed: number; errors: number; skipped: number; timestamp?: string };
  error?: string;
}

const DISPATCH_STATUS = {
  sent:       { label: "Enviado",     color: "#16a34a", bg: "#dcfce7" },
  failed:     { label: "Falhou",      color: "#dc2626", bg: "#fee2e2" },
  skipped:    { label: "Ignorado",    color: "#d97706", bg: "#fef3c7" },
  pending:    { label: "Pendente",    color: "#6b7280", bg: "#f3f4f6" },
  processing: { label: "Processando", color: "#2563eb", bg: "#dbeafe" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function CronExpressionGuide() {
  return (
    <div className="bg-gray-900 rounded-xl p-5 font-mono text-sm">
      <p className="text-gray-400 text-xs mb-3 font-sans">Formato da expressão cron:</p>
      <div className="flex gap-3 mb-4">
        {["Minuto\n0–59", "Hora\n0–23", "Dia\n1–31", "Mês\n1–12", "Dia semana\n0–7"].map((label, i) => (
          <div key={i} className="flex-1 text-center">
            <div className="text-green-400 text-lg font-bold">*</div>
            <div className="text-gray-500 text-xs mt-1 whitespace-pre-line leading-tight">{label}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-700 pt-3 space-y-1.5">
        {[
          ["* * * * *",      "Toda minuto (atual)"],
          ["*/5 * * * *",    "A cada 5 minutos"],
          ["0 * * * *",      "A cada hora (xx:00)"],
          ["0 8 * * *",      "Todo dia às 08:00"],
          ["0 8 * * 1-5",    "Dias úteis às 08:00"],
          ["0 9,18 * * *",   "Às 09:00 e 18:00"],
        ].map(([expr, desc]) => (
          <div key={expr} className="flex items-center gap-3">
            <code className="text-yellow-300 w-36 flex-shrink-0">{expr}</code>
            <span className="text-gray-400 text-xs font-sans">{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LastCronRunCard({ run }: { run: LastCronRun | null }) {
  if (!run) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
          <span className="text-sm font-semibold text-gray-900">Último disparo recebido</span>
        </div>
        <p className="text-xs text-gray-400">
          Nenhuma chamada do cron externo foi registrada ainda. Se o cron-job.org já está ativo e nada aparece aqui, verifique a URL e o header <code>Authorization</code> na aba <strong>Configuração</strong>.
        </p>
      </div>
    );
  }

  const ok = run.authorized && run.status === 200;
  const tone = ok
    ? { dot: "#16a34a", badgeBg: "#dcfce7", badgeColor: "#15803d", label: "OK" }
    : { dot: "#dc2626", badgeBg: "#fee2e2", badgeColor: "#b91c1c", label: `Falha ${run.status}` };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tone.dot }} />
        <span className="text-sm font-semibold text-gray-900">Último disparo recebido</span>
        <span
          className="ml-auto text-xs px-2 py-0.5 rounded font-medium"
          style={{ backgroundColor: tone.badgeBg, color: tone.badgeColor }}
        >
          {tone.label}
        </span>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex gap-2">
          <span className="text-gray-400 w-24 flex-shrink-0">Quando:</span>
          <span className="text-gray-700">{fmt(run.ranAt)}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-gray-400 w-24 flex-shrink-0">Autorizado:</span>
          <span className="text-gray-700">{run.authorized ? "sim" : "não"}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-gray-400 w-24 flex-shrink-0">Diagnóstico:</span>
          <span className="text-gray-700 break-words">{run.reason}</span>
        </div>
        {ok && (
          <div className="flex gap-2">
            <span className="text-gray-400 w-24 flex-shrink-0">Despachados:</span>
            <span className="text-gray-700">
              {run.dispatched ?? 0} enviados · {run.errors ?? 0} erros · {run.skipped ?? 0} ignorados
            </span>
          </div>
        )}
      </div>
      {!ok && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          O cron externo chegou ao endpoint mas foi <strong>rejeitado</strong>. Ajuste o header <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code> na aba <strong>Configuração</strong> para bater com a env var <code>CRON_SECRET</code> do Vercel.
        </p>
      )}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="relative group">
      <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto font-mono leading-relaxed">
        {children}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs px-2 py-1 rounded"
      >
        {copied ? "Copiado!" : "Copiar"}
      </button>
    </div>
  );
}

export default function CronSettings() {
  const [status, setStatus] = useState<CronStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<TriggerResult | null>(null);
  const [activeSection, setActiveSection] = useState<"status" | "config" | "technical">("status");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/cron/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function triggerNow() {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await fetch("/api/cron/status", { method: "POST" });
      const data = await res.json();
      setTriggerResult(data);
      await load();
    } catch {
      setTriggerResult({ triggered: false, error: "Erro de conexão" });
    } finally {
      setTriggering(false);
    }
  }

  const tabs = [
    { key: "status",    label: "Status & Fila" },
    { key: "config",    label: "Configuração" },
    { key: "technical", label: "Detalhes Técnicos" },
  ] as const;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Cron Job — Disparador de Campanhas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Monitore e teste o agendador automático de envio de campanhas WhatsApp.
          </p>
        </div>
        <button
          onClick={triggerNow}
          disabled={triggering}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0"
        >
          {triggering ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          {triggering ? "Executando..." : "Executar agora"}
        </button>
      </div>

      {/* Trigger result banner */}
      {triggerResult && (
        <div className={`rounded-xl px-5 py-4 border text-sm ${
          triggerResult.triggered
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {triggerResult.triggered && triggerResult.result ? (
            <div className="flex items-center gap-6 flex-wrap">
              <span className="font-semibold">Execução concluída</span>
              <span>Enviados: <b>{triggerResult.result.processed}</b></span>
              <span>Erros: <b>{triggerResult.result.errors}</b></span>
              <span>Ignorados: <b>{triggerResult.result.skipped}</b></span>
              {triggerResult.result.timestamp && (
                <span className="text-xs opacity-70">{fmt(triggerResult.result.timestamp)}</span>
              )}
            </div>
          ) : (
            <span>Erro: {triggerResult.error}</span>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveSection(t.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeSection === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── STATUS & FILA ── */}
      {activeSection === "status" && (
        <div className="space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <span className="w-6 h-6 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : status ? (
            <>
              {/* Cron info card */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <span className="text-sm font-semibold text-gray-900">Endpoint do dispatcher</span>
                  <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">Cron externo</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <span>URL:</span>
                  <code className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">{status.cron.path}</code>
                </div>
                <p className="text-xs text-gray-400">Configure um serviço externo (ex: cron-job.org) para chamar este endpoint a cada minuto. Veja a aba <strong>Configuração</strong>.</p>
              </div>

              {/* F-229: Último disparo recebido pelo endpoint (autorizado ou falha de auth) */}
              <LastCronRunCard run={status.lastCronRun} />

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Pendentes", value: status.queue.pending,       color: "#6b7280" },
                  { label: "Processando", value: status.queue.processing,  color: "#2563eb" },
                  { label: "Campanhas rodando", value: status.campaigns.running,   color: "#16a34a" },
                  { label: "Agendadas", value: status.campaigns.scheduled, color: "#d97706" },
                ].map((s) => (
                  <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                    <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Campaign status breakdown */}
              {Object.keys(status.campaigns.all).length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3">Campanhas por status</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(status.campaigns.all).map(([st, count]) => (
                      <div key={st} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                        <span className="text-sm font-bold text-gray-900">{count}</span>
                        <span className="text-xs text-gray-500 capitalize">{st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent dispatches */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-800">Últimos disparos</h3>
                  <button onClick={load} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                    Atualizar
                  </button>
                </div>
                {status.recentDispatches.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Nenhum disparo registrado ainda</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {status.recentDispatches.map((d) => {
                      const st = DISPATCH_STATUS[d.status as keyof typeof DISPATCH_STATUS] ?? DISPATCH_STATUS.pending;
                      return (
                        <div key={d.id} className="px-5 py-3 flex items-center gap-3">
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ color: st.color, backgroundColor: st.bg }}
                          >
                            {st.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 truncate font-medium">{d.campaignName}</p>
                            <p className="text-xs text-gray-400 truncate">{d.groupName}</p>
                          </div>
                          <div className="text-xs text-gray-400 flex-shrink-0 text-right">
                            {d.sentAt ? fmt(d.sentAt) : fmt(d.updatedAt)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-red-600">Erro ao carregar status do cron.</p>
          )}
        </div>
      )}

      {/* ── CONFIGURAÇÃO ── */}
      {activeSection === "config" && (
        <div className="space-y-5">

          {/* Aviso plano Hobby */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">Plano Hobby do Vercel — limitação de cron</p>
              <p>O plano Hobby só permite crons que disparam <strong>uma vez por dia</strong>. Para execução a cada minuto (recomendado para campanhas), use um serviço externo gratuito abaixo.</p>
            </div>
          </div>

          {/* cron-job.org */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
              <h3 className="text-sm font-semibold text-gray-900">Configurar cron-job.org (gratuito)</h3>
            </div>
            <p className="text-sm text-gray-600">
              O <strong>cron-job.org</strong> é um serviço gratuito que chama sua URL a cada minuto — sem limite de execuções.
            </p>
            <ol className="space-y-2 text-sm text-gray-700">
              {[
                <>Acesse <strong>cron-job.org</strong> e crie uma conta gratuita</>,
                <>Clique em <strong>Create cronjob</strong></>,
                <>Em <strong>URL</strong>, cole o endpoint abaixo</>,
                <>Em <strong>Schedule</strong>, selecione <strong>Every minute</strong> (método <strong>GET</strong>)</>,
                <>Em <strong>Headers</strong>, adicione <strong>obrigatoriamente</strong> o header <code>Authorization: Bearer &lt;CRON_SECRET&gt;</code> (passo 2)</>,
                <>Salve e ative o job</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-indigo-500 font-bold flex-shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-600">URL do endpoint:</p>
              <CodeBlock>https://movichat.vercel.app/api/cron/campaign-dispatcher</CodeBlock>
            </div>
          </div>

          {/* Proteção com CRON_SECRET */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
              <h3 className="text-sm font-semibold text-gray-900">Proteger o endpoint (obrigatório em produção)</h3>
            </div>
            <p className="text-sm text-gray-600">
              Em produção o endpoint <strong>exige</strong> autenticação: sem <code>CRON_SECRET</code> definido ele responde
              <strong> 503</strong> e não roda; com <code>CRON_SECRET</code> definido, toda chamada sem o header correto responde
              <strong> 401</strong>. Defina a variável de ambiente no Vercel:
            </p>
            <CodeBlock>CRON_SECRET=escolha_um_segredo_forte_aqui</CodeBlock>
            <p className="text-sm text-gray-600">
              E adicione <strong>exatamente</strong> este header no cron-job.org (aba <strong>Headers</strong>), com o
              <strong> mesmo valor</strong> de <code>CRON_SECRET</code>:
            </p>
            <CodeBlock>{`Authorization: Bearer escolha_um_segredo_forte_aqui`}</CodeBlock>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              Configure a variável em: <strong>vercel.com → movichat → Settings → Environment Variables</strong> (ambiente <strong>Production</strong>).
              Se o valor mudar, atualize o header no cron-job.org — caso contrário as chamadas passam a retornar 401.
            </div>
          </div>

          {/* Teste manual via cURL */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
              <h3 className="text-sm font-semibold text-gray-900">Testar via cURL</h3>
            </div>
            <p className="text-sm text-gray-600">Para verificar se o endpoint responde corretamente:</p>
            <CodeBlock>{`curl -X GET https://movichat.vercel.app/api/cron/campaign-dispatcher \\
  -H "Authorization: Bearer seu_cron_secret"`}</CodeBlock>
            <p className="text-xs text-gray-400">Ou use o botão <strong>&quot;Executar agora&quot;</strong> no topo desta página — ele chama o dispatcher diretamente sem precisar do cURL.</p>
          </div>

          {/* Expressões cron */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">4</span>
              <h3 className="text-sm font-semibold text-gray-900">Referência de expressões cron</h3>
            </div>
            <CronExpressionGuide />
          </div>
        </div>
      )}

      {/* ── DETALHES TÉCNICOS ── */}
      {activeSection === "technical" && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Fluxo de execução</h3>
            <ol className="space-y-3 text-sm text-gray-700">
              {[
                ["Cron externo dispara GET", `Um cron externo (cron-job.org) chama GET /api/cron/campaign-dispatcher a cada minuto com o header Authorization: Bearer <CRON_SECRET> (mesmo valor da env var CRON_SECRET no Vercel).`],
                ["Busca dispatches pendentes", `Consulta CampaignDispatch onde status = "pending" | "processing" (stale > 5min) e scheduledFor ≤ agora. Limita a 15 por execução para não estourar o timeout da função.`],
                ["Verifica janela de envio", `Para campanhas do tipo "windowed", verifica se o horário atual está dentro da janela configurada (windowStart, windowEnd, windowDays). Se não estiver, pula — será retentado na próxima execução.`],
                ["Claim atômico", `Atualiza o dispatch para "processing" com updateMany onde status ainda é "pending". Evita processamento duplo em execuções simultâneas.`],
                ["Envia via Evolution API", `Monta o texto do template (substituindo {{variáveis}}), envia para o groupJid via sendGroupMessage ou sendGroupMedia.`],
                ["Marca resultado", `Se enviou com sucesso → status = "sent", sentAt = agora. Se falhou → status = "failed", errorMessage = mensagem do erro.`],
                ["Verifica conclusão", `Conta dispatches ainda pending/processing. Se zero → finaliza a campanha como "completed" ou "error".`],
                ["Recorrência", `Se a campanha tem repeatType ≠ "none", calcula nextRunAt, cria a fila da próxima rodada e mantém o status como "scheduled".`],
              ].map(([title, desc], i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{title}</p>
                    <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">Tabelas envolvidas</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-4 font-semibold text-gray-700">Tabela</th>
                    <th className="text-left py-2 pr-4 font-semibold text-gray-700">Campos-chave</th>
                    <th className="text-left py-2 font-semibold text-gray-700">Papel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-gray-600">
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-700">Campaign</td>
                    <td className="py-2 pr-4">status, startAt, runCount, nextRunAt, sendType, repeatType</td>
                    <td className="py-2">Controla o ciclo de vida da campanha</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-700">CampaignDispatch</td>
                    <td className="py-2 pr-4">status, scheduledFor, runIndex, sentAt, errorMessage</td>
                    <td className="py-2">Fila de envios individuais por grupo</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-700">CampaignGroup</td>
                    <td className="py-2 pr-4">groupId, order</td>
                    <td className="py-2">Grupos alvo da campanha (ordenados)</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-700">MessageTemplate</td>
                    <td className="py-2 pr-4">body, mediaType, mediaUrl, mediaCaption</td>
                    <td className="py-2">Conteúdo do template com suporte a mídia</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-indigo-700">WhatsAppInstance</td>
                    <td className="py-2 pr-4">instanceName, status</td>
                    <td className="py-2">Instância WhatsApp conectada ao envio</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Estados do dispatch</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(DISPATCH_STATUS).map(([key, val]) => (
                <div key={key} className="flex items-center gap-2 rounded-lg px-3 py-1.5 border text-xs"
                  style={{ backgroundColor: val.bg, borderColor: val.color + "40", color: val.color }}>
                  <span className="font-mono font-bold">{key}</span>
                  <span className="text-gray-500">→ {val.label}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 space-y-1 pt-1">
              <p><code className="bg-gray-100 px-1 rounded">pending</code> → aguardando o cron chegar ao scheduledFor</p>
              <p><code className="bg-gray-100 px-1 rounded">processing</code> → sendo processado agora (claim atômico feito)</p>
              <p><code className="bg-gray-100 px-1 rounded">sent</code> → entregue com sucesso à Evolution API</p>
              <p><code className="bg-gray-100 px-1 rounded">failed</code> → erro ao enviar (errorMessage registrado)</p>
              <p><code className="bg-gray-100 px-1 rounded">skipped</code> → ignorado (fora da janela ou instância desconectada)</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Cadência e rate limiting</h3>
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Cada dispatch tem um <code className="bg-gray-100 px-1 rounded text-xs">scheduledFor</code> calculado com delay aleatório entre <b>cadenceMinSeconds</b> e <b>cadenceMaxSeconds</b>.</li>
              <li>O cron processa no máximo <b>15 dispatches por execução</b> para evitar timeout.</li>
              <li>Dispatches travados em <code className="bg-gray-100 px-1 rounded text-xs">processing</code> por mais de 5 minutos são reprocessados automaticamente.</li>
              <li>No modo <b>batch</b>, grupos são divididos em lotes de N enviados a cada X minutos.</li>
              <li>No modo <b>windowed</b>, envios fora do horário/dias configurados são adiados — não cancelados.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
