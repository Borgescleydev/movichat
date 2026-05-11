"use client";

import { useEffect, useState, useCallback } from "react";
import CampaignForm from "./CampaignForm";
import CampaignDetail from "./CampaignDetail";

interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
  channel: string;
  sendType: string;
  templateId: string;
  instanceId: string;
  variableValues: string;
  startAt: string;
  repeatType: string;
  repeatEndAt: string | null;
  cadenceMinSeconds: number;
  cadenceMaxSeconds: number;
  cadenceMaxPerHour: number;
  windowStart: string | null;
  windowEnd: string | null;
  windowDays: string;
  batchSize: number | null;
  batchIntervalMinutes: number | null;
  repeatEveryX: number | null;
  repeatEveryUnit: string | null;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  totalGroups: number;
  template: { id: string; name: string; mediaType: string | null };
  instance: { id: string; label: string | null; instanceName: string; status: string };
  groups: { group: { id: string; name: string; groupJid: string } }[];
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  draft:     { label: "Rascunho",    bg: "color-mix(in srgb, #6b7280 15%, transparent)", color: "#6b7280", dot: "#6b7280" },
  scheduled: { label: "Agendada",    bg: "color-mix(in srgb, #3b82f6 15%, transparent)", color: "#3b82f6", dot: "#3b82f6" },
  running:   { label: "Em andamento",bg: "color-mix(in srgb, #10b981 15%, transparent)", color: "#10b981", dot: "#10b981" },
  paused:    { label: "Pausada",     bg: "color-mix(in srgb, #f59e0b 15%, transparent)", color: "#f59e0b", dot: "#f59e0b" },
  completed: { label: "Concluída",   bg: "color-mix(in srgb, #8b5cf6 15%, transparent)", color: "#8b5cf6", dot: "#8b5cf6" },
  cancelled: { label: "Cancelada",   bg: "color-mix(in srgb, #ef4444 15%, transparent)", color: "#ef4444", dot: "#ef4444" },
  error:     { label: "Com erro",    bg: "color-mix(in srgb, #dc2626 15%, transparent)", color: "#dc2626", dot: "#dc2626" },
};

const CHANNEL_ICON: Record<string, string> = {
  whatsapp: "💬",
  sms: "📱",
  email: "📧",
};

const SEND_TYPE_LABEL: Record<string, string> = {
  immediate: "Imediato",
  scheduled: "Único",
  recurring: "Recorrente",
  windowed: "Janela",
  batch: "Lotes",
};

const REPEAT_LABELS: Record<string, string> = {
  none: "Única", daily: "Diária", weekly: "Semanal", monthly: "Mensal", custom: "Personalizado",
};

const ALL_STATUSES = ["all", "draft", "scheduled", "running", "paused", "completed", "cancelled", "error"];

export default function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const loadCampaigns = useCallback(async () => {
    const url = statusFilter === "all" ? "/api/campaigns" : `/api/campaigns?status=${statusFilter}`;
    const res = await fetch(url);
    if (res.ok) setCampaigns(await res.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  async function scheduleCampaign(id: string) {
    setScheduling(id);
    try {
      const res = await fetch(`/api/campaigns/${id}/schedule`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        loadCampaigns();
      } else {
        alert(data.error || "Erro ao agendar campanha");
      }
    } finally {
      setScheduling(null);
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Excluir esta campanha permanentemente?")) return;
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (res.ok) {
      loadCampaigns();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao excluir");
    }
  }

  function openEdit(c: Campaign) {
    setEditingCampaign(c);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCampaign(null);
  }

  const filtered = campaigns.filter((c) =>
    statusFilter === "all" ? true : c.status === statusFilter
  );

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="max-w-4xl">
      {/* Controls */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {ALL_STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="text-xs font-medium px-3 py-1.5 rounded-full transition-colors"
              style={
                statusFilter === s
                  ? { backgroundColor: "var(--primary)", color: "#fff" }
                  : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }
              }
            >
              {s === "all" ? "Todas" : STATUS_STYLE[s]?.label || s}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: "var(--primary)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nova Campanha
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div
          className="rounded-2xl p-16 text-center border-2 border-dashed"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--primary-light)" }}>
            <svg className="w-7 h-7" style={{ color: "var(--primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <p className="font-semibold text-base" style={{ color: "var(--text-secondary)" }}>Nenhuma campanha</p>
          <p className="text-sm mt-1">Crie sua primeira campanha de disparos</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const style = STATUS_STYLE[c.status] || STATUS_STYLE.draft;
            const totalDone = c.sentCount + c.failedCount;
            const totalDispatches = c.totalGroups;
            const pct = totalDispatches > 0 ? Math.round((totalDone / totalDispatches) * 100) : 0;
            const isActive = ["running", "scheduled"].includes(c.status);
            const canEdit = ["draft", "paused", "cancelled", "error"].includes(c.status);
            const canDelete = !["running", "scheduled"].includes(c.status);
            const windowDaysParsed: number[] = (() => { try { return JSON.parse(c.windowDays || "[]"); } catch { return []; } })();

            return (
              <div key={c.id} className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Status dot */}
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: style.bg }}
                    >
                      <div className={`w-3 h-3 rounded-full ${isActive ? "animate-pulse" : ""}`} style={{ backgroundColor: style.dot }} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{c.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: style.bg, color: style.color }}>
                          {style.label}
                        </span>
                        {/* Channel */}
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                          {CHANNEL_ICON[c.channel] || "📤"} {c.channel}
                        </span>
                        {/* Send type */}
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                          {SEND_TYPE_LABEL[c.sendType] || c.sendType}
                        </span>
                        {/* Recurrence */}
                        {c.sendType === "recurring" && c.repeatType !== "none" && (
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                            {REPEAT_LABELS[c.repeatType]}
                          </span>
                        )}
                      </div>

                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {c.template.name} · {c.instance.label || c.instance.instanceName} · {c.totalGroups} grupo{c.totalGroups !== 1 ? "s" : ""}
                        {c.startAt && ` · ${new Date(c.startAt).toLocaleString("pt-BR")}`}
                      </p>

                      {/* Windowed info */}
                      {c.sendType === "windowed" && c.windowStart && c.windowEnd && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          🕐 Janela: {c.windowStart}–{c.windowEnd} · {windowDaysParsed.length} dias/semana
                        </p>
                      )}

                      {/* Batch info */}
                      {c.sendType === "batch" && c.batchSize && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                          📦 {c.batchSize} msgs a cada {c.batchIntervalMinutes} min
                        </p>
                      )}

                      {c.description && (
                        <p className="text-xs mt-1 line-clamp-1" style={{ color: "var(--text-secondary)" }}>{c.description}</p>
                      )}

                      {/* Progress bar */}
                      {totalDispatches > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {c.sentCount} enviado{c.sentCount !== 1 ? "s" : ""}
                              {c.failedCount > 0 && `, ${c.failedCount} falho${c.failedCount !== 1 ? "s" : ""}`}
                              {" / "}{totalDispatches} total
                            </span>
                            <span className="text-xs font-semibold" style={{ color: "var(--primary)" }}>{pct}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: "var(--border)" }}>
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: c.status === "completed" ? "var(--success)" : c.status === "error" ? "var(--danger)" : "var(--primary)",
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setDetailId(c.id)}
                        className="p-1.5 rounded-lg text-xs"
                        style={{ color: "var(--primary)" }}
                        title="Ver relatório"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      </button>

                      {c.status === "draft" && (
                        <button
                          onClick={() => scheduleCampaign(c.id)}
                          disabled={scheduling === c.id}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-50"
                          style={{ borderColor: "var(--success)", color: "var(--success)" }}
                          title="Agendar campanha"
                        >
                          {scheduling === c.id ? "…" : "▶ Agendar"}
                        </button>
                      )}

                      {canEdit && (
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg"
                          style={{ color: "var(--text-secondary)" }}
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      )}

                      {canDelete && (
                        <button
                          onClick={() => deleteCampaign(c.id)}
                          className="p-1.5 rounded-lg"
                          style={{ color: "var(--danger)" }}
                          title="Excluir"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Campaign Form Modal */}
      {showForm && (
        <CampaignForm
          onClose={closeForm}
          onSaved={() => { closeForm(); loadCampaigns(); }}
          editing={
            editingCampaign
              ? {
                  id: editingCampaign.id,
                  name: editingCampaign.name,
                  description: editingCampaign.description || undefined,
                  channel: editingCampaign.channel,
                  sendType: editingCampaign.sendType,
                  templateId: editingCampaign.templateId,
                  instanceId: editingCampaign.instanceId,
                  groupIds: editingCampaign.groups.map((g) => g.group.id),
                  variableValues: JSON.parse(editingCampaign.variableValues || "{}"),
                  startAt: editingCampaign.startAt,
                  repeatType: editingCampaign.repeatType,
                  repeatEndAt: editingCampaign.repeatEndAt || undefined,
                  cadenceMinSeconds: editingCampaign.cadenceMinSeconds,
                  cadenceMaxSeconds: editingCampaign.cadenceMaxSeconds,
                  cadenceMaxPerHour: editingCampaign.cadenceMaxPerHour,
                  windowStart: editingCampaign.windowStart,
                  windowEnd: editingCampaign.windowEnd,
                  windowDays: (() => { try { return JSON.parse(editingCampaign.windowDays || "[]"); } catch { return []; } })(),
                  batchSize: editingCampaign.batchSize,
                  batchIntervalMinutes: editingCampaign.batchIntervalMinutes,
                  repeatEveryX: editingCampaign.repeatEveryX,
                  repeatEveryUnit: editingCampaign.repeatEveryUnit,
                }
              : null
          }
        />
      )}

      {/* Campaign Detail Drawer */}
      {detailId && (
        <CampaignDetail
          campaignId={detailId}
          onClose={() => setDetailId(null)}
          onAction={loadCampaigns}
        />
      )}
    </div>
  );
}
