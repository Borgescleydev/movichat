"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Dispatch {
  id: string;
  groupName: string;
  groupJid: string;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  errorMessage: string | null;
  messageId: string | null;
}

interface Analytics {
  campaign: {
    id: string;
    name: string;
    status: string;
    runCount: number;
    nextRunAt: string | null;
    repeatType: string;
    templateName: string;
    instanceLabel: string;
  };
  totalGroups: number;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
  progressPct: number;
  dispatches: Dispatch[];
}

const STATUS_COLORS: Record<string, string> = {
  sent: "var(--success)",
  failed: "var(--danger)",
  pending: "var(--text-muted)",
  processing: "var(--warning)",
  skipped: "var(--warning)",
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Enviado",
  failed: "Falhou",
  pending: "Pendente",
  processing: "Processando",
  skipped: "Ignorado",
};

const CAMPAIGN_STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft:     { bg: "color-mix(in srgb, #6b7280 15%, transparent)", color: "#6b7280", label: "Rascunho" },
  scheduled: { bg: "color-mix(in srgb, #3b82f6 15%, transparent)", color: "#3b82f6", label: "Agendada" },
  running:   { bg: "color-mix(in srgb, #10b981 15%, transparent)", color: "#10b981", label: "Em andamento" },
  paused:    { bg: "color-mix(in srgb, #f59e0b 15%, transparent)", color: "#f59e0b", label: "Pausada" },
  completed: { bg: "color-mix(in srgb, #8b5cf6 15%, transparent)", color: "#8b5cf6", label: "Concluída" },
  cancelled: { bg: "color-mix(in srgb, #ef4444 15%, transparent)", color: "#ef4444", label: "Cancelada" },
  error:     { bg: "color-mix(in srgb, #dc2626 15%, transparent)", color: "#dc2626", label: "Com erro" },
};

interface Props {
  campaignId: string;
  onClose: () => void;
  onAction: () => void;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export default function CampaignDetail({ campaignId, onClose, onAction }: Props) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [dispatchResult, setDispatchResult] = useState<{ processed: number; errors: number; remaining: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/campaigns/${campaignId}/analytics`);
    if (res.ok) setAnalytics(await res.json());
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [load]);

  useEffect(() => {
    if (!analytics) return;
    if (["running", "scheduled"].includes(analytics.campaign.status)) {
      pollRef.current = setInterval(load, 30000);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [analytics?.campaign.status, load]);

  async function doAction(action: "pause" | "resume" | "cancel" | "retry") {
    setActing(true);
    try {
      const url = action === "retry"
        ? `/api/campaigns/${campaignId}/retry`
        : action === "cancel"
        ? `/api/campaigns/${campaignId}/cancel`
        : `/api/campaigns/${campaignId}/${action}`;
      const res = await fetch(url, { method: "POST" });
      if (res.ok) { await load(); onAction(); }
      else { const d = await res.json(); alert(d.error || "Erro ao executar ação"); }
    } finally {
      setActing(false);
    }
  }

  async function handleDispatchNow() {
    setDispatching(true);
    setDispatchResult(null);
    setConfirm(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/dispatch-now`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setDispatchResult(data);
        await load();
        onAction();
      } else {
        alert(data.error || "Erro ao disparar campanha");
      }
    } catch {
      alert("Erro de conexão ao disparar campanha");
    } finally {
      setDispatching(false);
    }
  }

  function askDispatchNow() {
    if (!analytics) return;
    const totalGroups = analytics.totalGroups || 0;
    const pending = analytics.pendingCount;
    const groupCount = pending > 0 ? pending : totalGroups;
    setConfirm({
      title: "Disparar campanha agora",
      message: `Isso vai enviar a mensagem para ${groupCount} grupo${groupCount !== 1 ? "s" : ""} IMEDIATAMENTE, ignorando o agendamento.\n\nTem certeza?`,
      confirmLabel: "Sim, disparar agora",
      onConfirm: handleDispatchNow,
    });
  }

  function askCancel() {
    setConfirm({
      title: "Cancelar campanha",
      message: "Os envios pendentes serão removidos e a campanha não poderá ser retomada. Confirma?",
      confirmLabel: "Sim, cancelar",
      danger: true,
      onConfirm: () => doAction("cancel"),
    });
  }

  const filteredDispatches = analytics?.dispatches.filter((d) =>
    statusFilter === "all" ? true : d.status === statusFilter
  ) || [];

  const canDispatchNow = analytics && ["draft", "scheduled", "paused", "error"].includes(analytics.campaign.status);

  if (loading) return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "#fff", borderTopColor: "transparent" }} />
    </div>
  );

  if (!analytics) return null;

  const { campaign } = analytics;
  const statusStyle = CAMPAIGN_STATUS_STYLES[campaign.status] || CAMPAIGN_STATUS_STYLES.draft;

  return (
    <div className="fixed inset-0 bg-black/50 flex z-50">
      {/* Backdrop */}
      <div className="flex-1" onClick={onClose} />

      {/* Panel */}
      <div className="w-full max-w-xl bg-white flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className="text-base font-semibold truncate" style={{ color: "var(--text-primary)" }}>{campaign.name}</h2>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}>
                  {statusStyle.label}
                </span>
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {campaign.templateName} · {campaign.instanceLabel}
                {campaign.runCount > 0 && ` · Execução #${campaign.runCount + 1}`}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* Progress */}
          <div className="px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Progresso</span>
              <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{analytics.progressPct}%</span>
            </div>
            <div className="w-full rounded-full h-3 overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{
                  width: `${analytics.progressPct}%`,
                  backgroundColor: campaign.status === "completed" ? "var(--success)" : campaign.status === "error" ? "var(--danger)" : "var(--primary)",
                }}
              />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: "Enviados",  count: analytics.sentCount,    color: "var(--success)" },
                { label: "Pendentes", count: analytics.pendingCount,  color: "var(--text-muted)" },
                { label: "Falhos",    count: analytics.failedCount,   color: "var(--danger)" },
                { label: "Ignorados", count: analytics.skippedCount,  color: "var(--warning)" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <p className="text-xl font-bold" style={{ color: s.color }}>{s.count}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                </div>
              ))}
            </div>
            {campaign.nextRunAt && (
              <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                Próxima execução: {new Date(campaign.nextRunAt).toLocaleString("pt-BR")}
              </p>
            )}
            {["running", "scheduled"].includes(campaign.status) && (
              <p className="text-xs mt-1 animate-pulse" style={{ color: "var(--primary)" }}>● Atualizando automaticamente…</p>
            )}
          </div>

          {/* Dispatch result banner */}
          {dispatchResult && (
            <div className="mx-6 mt-4 p-3 rounded-xl text-sm" style={{ backgroundColor: dispatchResult.errors > 0 ? "color-mix(in srgb, var(--warning) 15%, transparent)" : "color-mix(in srgb, var(--success) 15%, transparent)", border: `1px solid ${dispatchResult.errors > 0 ? "var(--warning)" : "var(--success)"}` }}>
              <p className="font-semibold" style={{ color: dispatchResult.errors > 0 ? "var(--warning)" : "var(--success)" }}>
                Disparo concluído: {dispatchResult.processed} enviado{dispatchResult.processed !== 1 ? "s" : ""}
                {dispatchResult.errors > 0 && `, ${dispatchResult.errors} erro${dispatchResult.errors !== 1 ? "s" : ""}`}
                {dispatchResult.remaining > 0 && `, ${dispatchResult.remaining} pendente${dispatchResult.remaining !== 1 ? "s" : ""}`}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="px-6 py-4 flex flex-wrap gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
            {/* Manual dispatch — primary action */}
            {canDispatchNow && (
              <button
                onClick={askDispatchNow}
                disabled={dispatching || acting}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-50"
                style={{ backgroundColor: "var(--primary)" }}
              >
                {dispatching ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Disparando…
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Disparar agora
                  </>
                )}
              </button>
            )}

            {["scheduled", "running"].includes(campaign.status) && (
              <button onClick={() => doAction("pause")} disabled={acting || dispatching}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--warning)", color: "var(--warning)" }}>
                ⏸ Pausar
              </button>
            )}
            {campaign.status === "paused" && (
              <button onClick={() => doAction("resume")} disabled={acting || dispatching}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--success)", color: "var(--success)" }}>
                ▶ Retomar
              </button>
            )}
            {["scheduled", "running", "paused"].includes(campaign.status) && (
              <button onClick={askCancel} disabled={acting || dispatching}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                ✕ Cancelar
              </button>
            )}
            {analytics.failedCount > 0 && (
              <button onClick={() => doAction("retry")} disabled={acting || dispatching}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>
                ↻ Retentar {analytics.failedCount} falhos
              </button>
            )}
            <button onClick={load} disabled={acting || dispatching}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border ml-auto"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              ↻ Atualizar
            </button>
          </div>

          {/* Dispatch list */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Envios ({analytics.totalCount})
              </h3>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--card-bg)" }}
              >
                <option value="all">Todos</option>
                <option value="sent">Enviados</option>
                <option value="pending">Pendentes</option>
                <option value="failed">Falhos</option>
                <option value="skipped">Ignorados</option>
              </select>
            </div>

            <div className="space-y-1">
              {filteredDispatches.map((d, i) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    backgroundColor: i % 2 === 0 ? "transparent" : "color-mix(in srgb, var(--page-bg) 60%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
                  }}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[d.status] || "var(--border)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{d.groupName}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {d.sentAt
                        ? `Enviado ${new Date(d.sentAt).toLocaleString("pt-BR")}`
                        : `Agendado ${new Date(d.scheduledFor).toLocaleString("pt-BR")}`}
                    </p>
                    {d.errorMessage && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--danger)" }}>{d.errorMessage}</p>
                    )}
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap" style={{ color: STATUS_COLORS[d.status] || "var(--text-muted)" }}>
                    {STATUS_LABELS[d.status] || d.status}
                  </span>
                </div>
              ))}
              {filteredDispatches.length === 0 && (
                <p className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>Nenhum envio encontrado</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{confirm.title}</h3>
            <p className="text-sm whitespace-pre-line mb-6" style={{ color: "var(--text-secondary)" }}>{confirm.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirm(null)}
                className="text-sm px-4 py-2 rounded-lg border"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Cancelar
              </button>
              <button
                onClick={confirm.onConfirm}
                className="text-sm px-4 py-2 rounded-lg text-white font-semibold"
                style={{ backgroundColor: confirm.danger ? "var(--danger)" : "var(--primary)" }}
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
