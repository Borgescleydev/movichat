"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface DispatchEntry {
  id: string;
  contactName: string;
  contactPhone: string;
  status: string;
  scheduledFor: string;
  sentAt: string | null;
  errorMessage: string | null;
  messageId: string | null;
  variationIdx: number;
  resolvedText: string | null;
  runIndex: number;
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
    sendType: string;
  };
  totalContacts: number;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  pendingCount: number;
  progressPct: number;
  dispatches: DispatchEntry[];
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

export default function ContactCampaignDetail({ campaignId, onClose, onAction }: Props) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedDispatch, setExpandedDispatch] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const loadAnalytics = useCallback(async () => {
    const res = await fetch(`/api/individual/campaigns/${campaignId}/analytics`);
    if (res.ok) setAnalytics(await res.json());
    setLoading(false);
  }, [campaignId]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  // Auto-refresh when running
  useEffect(() => {
    if (!analytics) return;
    const isActive = ["running", "scheduled"].includes(analytics.campaign.status);
    if (!isActive) return;
    const interval = setInterval(loadAnalytics, 10_000);
    return () => clearInterval(interval);
  }, [analytics, loadAnalytics]);

  // Close on backdrop click
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleAction(action: "pause" | "cancel" | "schedule") {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/individual/campaigns/${campaignId}/${action}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await loadAnalytics();
        onAction();
      } else {
        alert(data.error || `Erro ao executar ação`);
      }
    } finally {
      setActionLoading(null);
    }
  }

  const camp = analytics?.campaign;
  const campStyle = camp ? (CAMPAIGN_STATUS_STYLES[camp.status] || CAMPAIGN_STATUS_STYLES.draft) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div
        ref={drawerRef}
        className="ml-auto h-full overflow-hidden flex flex-col shadow-2xl"
        style={{ width: "min(680px, 100vw)", backgroundColor: "var(--card-bg)" }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-start gap-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex-1 min-w-0">
            {loading || !camp ? (
              <div className="h-5 w-48 rounded animate-pulse" style={{ backgroundColor: "var(--border)" }} />
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-lg font-bold truncate" style={{ color: "var(--text-primary)" }}>{camp.name}</h2>
                  {campStyle && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ backgroundColor: campStyle.bg, color: campStyle.color }}>
                      {campStyle.label}
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {camp.templateName} · {camp.instanceLabel}
                  {camp.nextRunAt && ` · Próxima: ${new Date(camp.nextRunAt).toLocaleString("pt-BR")}`}
                </p>
              </>
            )}
          </div>
          <button onClick={onClose} className="flex-shrink-0 p-1 rounded-lg" style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Actions */}
        {camp && (
          <div className="px-6 py-3 flex items-center gap-2 flex-wrap flex-shrink-0" style={{ borderBottom: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
            {["scheduled", "running"].includes(camp.status) && (
              <button
                onClick={() => handleAction("pause")}
                disabled={!!actionLoading}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border disabled:opacity-50"
                style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
              >
                {actionLoading === "pause" ? "Pausando..." : "⏸ Pausar"}
              </button>
            )}
            {camp.status === "paused" && (
              <button
                onClick={() => handleAction("schedule")}
                disabled={!!actionLoading}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border disabled:opacity-50"
                style={{ borderColor: "var(--success)", color: "var(--success)" }}
              >
                {actionLoading === "schedule" ? "Retomando..." : "▶ Retomar"}
              </button>
            )}
            {!["completed", "cancelled", "draft"].includes(camp.status) && (
              <button
                onClick={() => {
                  if (confirm("Cancelar campanha? As mensagens pendentes não serão enviadas.")) {
                    handleAction("cancel");
                  }
                }}
                disabled={!!actionLoading}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border disabled:opacity-50"
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
              >
                {actionLoading === "cancel" ? "Cancelando..." : "✕ Cancelar"}
              </button>
            )}
            <button
              onClick={loadAnalytics}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border ml-auto"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              ↻ Atualizar
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
            </div>
          ) : !analytics ? (
            <div className="text-center py-10" style={{ color: "var(--text-muted)" }}>Erro ao carregar dados.</div>
          ) : (
            <>
              {/* Stats cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Total",     value: analytics.totalCount,   color: "var(--text-primary)" },
                  { label: "Enviados",  value: analytics.sentCount,    color: "var(--success)" },
                  { label: "Falhas",    value: analytics.failedCount,  color: "var(--danger)" },
                  { label: "Pendentes", value: analytics.pendingCount, color: "var(--warning)" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                    <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              {analytics.totalCount > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Progresso</span>
                    <span className="text-xs font-bold" style={{ color: "var(--primary)" }}>{analytics.progressPct}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: "var(--border)" }}>
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${analytics.progressPct}%`,
                        backgroundColor: analytics.campaign.status === "completed" ? "var(--success)" : analytics.campaign.status === "error" ? "var(--danger)" : "var(--primary)",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Dispatch table */}
              <div>
                <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
                  Detalhes dos envios ({analytics.dispatches.length})
                </p>

                {analytics.dispatches.length === 0 ? (
                  <div className="text-center py-8 rounded-xl" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                    <p className="text-sm">Nenhum disparo registrado ainda.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {analytics.dispatches.map(d => (
                      <div key={d.id} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
                        <div
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                          onClick={() => setExpandedDispatch(expandedDispatch === d.id ? null : d.id)}
                        >
                          {/* Status indicator */}
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: STATUS_COLORS[d.status] || "var(--border)" }} />

                          {/* Contact info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{d.contactName}</span>
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{d.contactPhone}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs" style={{ color: STATUS_COLORS[d.status] || "var(--text-muted)" }}>
                                {STATUS_LABELS[d.status] || d.status}
                              </span>
                              {d.variationIdx !== undefined && d.status !== "pending" && (
                                <span className="text-xs" style={{ color: "var(--text-muted)" }}>· Variação {d.variationIdx + 1}</span>
                              )}
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                · {d.sentAt
                                  ? new Date(d.sentAt).toLocaleString("pt-BR")
                                  : `Agendado: ${new Date(d.scheduledFor).toLocaleString("pt-BR")}`}
                              </span>
                            </div>
                          </div>

                          {/* Expand arrow */}
                          <svg
                            className="w-4 h-4 flex-shrink-0 transition-transform"
                            style={{ color: "var(--text-muted)", transform: expandedDispatch === d.id ? "rotate(180deg)" : "none" }}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>

                        {/* Expanded details */}
                        {expandedDispatch === d.id && (
                          <div className="px-3 pb-3 space-y-2" style={{ borderTop: "1px solid var(--border)" }}>
                            {d.resolvedText && (
                              <div className="mt-2">
                                <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Mensagem enviada:</p>
                                <pre className="text-xs whitespace-pre-wrap font-sans rounded-lg p-2" style={{ backgroundColor: "var(--page-bg)", color: "var(--text-primary)", border: "1px solid var(--border)" }}>
                                  {d.resolvedText}
                                </pre>
                              </div>
                            )}
                            {d.errorMessage && (
                              <div className="mt-2">
                                <p className="text-xs font-medium mb-1" style={{ color: "var(--danger)" }}>Erro:</p>
                                <p className="text-xs rounded-lg p-2" style={{ backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 20%, transparent)" }}>
                                  {d.errorMessage}
                                </p>
                              </div>
                            )}
                            {d.messageId && (
                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Message ID: {d.messageId}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
