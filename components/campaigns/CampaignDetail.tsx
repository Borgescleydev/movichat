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
  draft: { bg: "color-mix(in srgb, var(--text-muted) 15%, transparent)", color: "var(--text-muted)", label: "Rascunho" },
  scheduled: { bg: "color-mix(in srgb, var(--info) 15%, transparent)", color: "var(--info)", label: "Agendada" },
  running: { bg: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)", label: "Executando" },
  paused: { bg: "color-mix(in srgb, var(--warning) 15%, transparent)", color: "var(--warning)", label: "Pausada" },
  completed: { bg: "color-mix(in srgb, var(--primary) 15%, transparent)", color: "var(--primary)", label: "Concluída" },
};

interface Props {
  campaignId: string;
  onClose: () => void;
  onAction: () => void;
}

export default function CampaignDetail({ campaignId, onClose, onAction }: Props) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
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

  // Auto-refresh when running
  useEffect(() => {
    if (!analytics) return;
    if (["running", "scheduled"].includes(analytics.campaign.status)) {
      pollRef.current = setInterval(load, 8000);
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
      if (res.ok) {
        await load();
        onAction();
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao executar ação");
      }
    } finally {
      setActing(false);
    }
  }

  const filteredDispatches = analytics?.dispatches.filter((d) =>
    statusFilter === "all" ? true : d.status === statusFilter
  ) || [];

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
      {/* Backdrop close */}
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

        {/* Content */}
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
                style={{ width: `${analytics.progressPct}%`, backgroundColor: campaign.status === "completed" ? "var(--success)" : "var(--primary)" }}
              />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: "Enviados", count: analytics.sentCount, color: "var(--success)" },
                { label: "Pendentes", count: analytics.pendingCount, color: "var(--text-muted)" },
                { label: "Falhos", count: analytics.failedCount, color: "var(--danger)" },
                { label: "Ignorados", count: analytics.skippedCount, color: "var(--warning)" },
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

          {/* Actions */}
          <div className="px-6 py-4 flex flex-wrap gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
            {["scheduled", "running"].includes(campaign.status) && (
              <button onClick={() => doAction("pause")} disabled={acting}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--warning)", color: "var(--warning)" }}>
                ⏸ Pausar
              </button>
            )}
            {campaign.status === "paused" && (
              <button onClick={() => doAction("resume")} disabled={acting}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--success)", color: "var(--success)" }}>
                ▶ Retomar
              </button>
            )}
            {["scheduled", "running", "paused"].includes(campaign.status) && (
              <button onClick={() => { if (confirm("Cancelar a campanha? Os envios pendentes serão removidos.")) doAction("cancel"); }} disabled={acting}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
                ✕ Cancelar
              </button>
            )}
            {analytics.failedCount > 0 && (
              <button onClick={() => doAction("retry")} disabled={acting}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>
                ↻ Retentar {analytics.failedCount} falhos
              </button>
            )}
            <button onClick={load} className="text-xs font-medium px-3 py-1.5 rounded-lg border ml-auto"
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
    </div>
  );
}
