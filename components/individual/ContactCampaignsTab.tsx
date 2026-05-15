"use client";

import { useEffect, useState, useCallback } from "react";
import ContactCampaignForm from "./ContactCampaignForm";
import ContactCampaignDetail from "./ContactCampaignDetail";

interface ContactCampaign {
  id: string;
  name: string;
  description: string | null;
  status: string;
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
  totalContacts: number;
  template: { id: string; name: string; mediaType: string | null };
  instance: { id: string; label: string | null; instanceName: string; status: string };
  contacts: { contact: { id: string; name: string; phone: string } }[];
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string; dot: string }> = {
  draft:     { label: "Rascunho",      bg: "color-mix(in srgb, #6b7280 15%, transparent)", color: "#6b7280", dot: "#6b7280" },
  scheduled: { label: "Agendada",      bg: "color-mix(in srgb, #3b82f6 15%, transparent)", color: "#3b82f6", dot: "#3b82f6" },
  running:   { label: "Em andamento",  bg: "color-mix(in srgb, #10b981 15%, transparent)", color: "#10b981", dot: "#10b981" },
  paused:    { label: "Pausada",       bg: "color-mix(in srgb, #f59e0b 15%, transparent)", color: "#f59e0b", dot: "#f59e0b" },
  completed: { label: "Concluída",     bg: "color-mix(in srgb, #8b5cf6 15%, transparent)", color: "#8b5cf6", dot: "#8b5cf6" },
  cancelled: { label: "Cancelada",     bg: "color-mix(in srgb, #ef4444 15%, transparent)", color: "#ef4444", dot: "#ef4444" },
  error:     { label: "Com erro",      bg: "color-mix(in srgb, #dc2626 15%, transparent)", color: "#dc2626", dot: "#dc2626" },
};

const SEND_TYPE_LABEL: Record<string, string> = {
  immediate: "Imediato",
  scheduled: "Único",
  recurring: "Recorrente",
  windowed: "Janela",
  batch: "Lotes",
};

const ALL_STATUSES = ["all", "draft", "scheduled", "running", "paused", "completed", "cancelled", "error"];

export default function ContactCampaignsTab() {
  const [campaigns, setCampaigns] = useState<ContactCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<ContactCampaign | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const loadCampaigns = useCallback(async () => {
    const url = statusFilter === "all" ? "/api/individual/campaigns" : `/api/individual/campaigns?status=${statusFilter}`;
    const res = await fetch(url);
    if (res.ok) setCampaigns(await res.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  async function scheduleCampaign(id: string) {
    setActionLoading(id + "-schedule");
    try {
      const res = await fetch(`/api/individual/campaigns/${id}/schedule`, { method: "POST" });
      const data = await res.json();
      if (res.ok) { loadCampaigns(); }
      else { alert(data.error || "Erro ao agendar"); }
    } finally { setActionLoading(null); }
  }

  async function pauseCampaign(id: string) {
    setActionLoading(id + "-pause");
    try {
      const res = await fetch(`/api/individual/campaigns/${id}/pause`, { method: "POST" });
      const data = await res.json();
      if (res.ok) { loadCampaigns(); }
      else { alert(data.error || "Erro ao pausar"); }
    } finally { setActionLoading(null); }
  }

  async function cancelCampaign(id: string) {
    if (!confirm("Cancelar esta campanha? As mensagens pendentes não serão enviadas.")) return;
    setActionLoading(id + "-cancel");
    try {
      const res = await fetch(`/api/individual/campaigns/${id}/cancel`, { method: "POST" });
      const data = await res.json();
      if (res.ok) { loadCampaigns(); }
      else { alert(data.error || "Erro ao cancelar"); }
    } finally { setActionLoading(null); }
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Excluir esta campanha permanentemente?")) return;
    const res = await fetch(`/api/individual/campaigns/${id}`, { method: "DELETE" });
    if (res.ok) { loadCampaigns(); }
    else { const data = await res.json(); alert(data.error || "Erro ao excluir"); }
  }

  async function dispatchNow(id: string) {
    if (!confirm("Disparar agora para todos os contatos desta campanha?")) return;
    setActionLoading(id + "-dispatch");
    try {
      const res = await fetch(`/api/individual/campaigns/${id}/dispatch-now`, { method: "POST" });
      const data = await res.json();
      if (res.ok) { loadCampaigns(); alert(`Disparado! ${data.dispatched} mensagens enviadas.`); }
      else { alert(data.error || "Erro ao disparar"); }
    } finally { setActionLoading(null); }
  }

  function openEdit(c: ContactCampaign) {
    setEditingCampaign(c);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingCampaign(null);
  }

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
      {campaigns.length === 0 ? (
        <div
          className="rounded-2xl p-16 text-center border-2 border-dashed"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--primary-light)" }}>
            <svg className="w-7 h-7" style={{ color: "var(--primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <p className="font-semibold text-base" style={{ color: "var(--text-secondary)" }}>Nenhuma campanha individual</p>
          <p className="text-sm mt-1">Crie sua primeira campanha de disparo individual</p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const style = STATUS_STYLE[c.status] || STATUS_STYLE.draft;
            const totalDone = c.sentCount + c.failedCount;
            const pct = c.totalContacts > 0 ? Math.round((totalDone / c.totalContacts) * 100) : 0;
            const isActive = ["running", "scheduled"].includes(c.status);
            const canEdit = ["draft", "paused", "cancelled", "error"].includes(c.status);
            const canDelete = !["running", "scheduled"].includes(c.status);
            const canSchedule = ["draft", "paused"].includes(c.status);
            const canPause = ["scheduled", "running"].includes(c.status);
            const canCancel = !["completed", "cancelled", "draft"].includes(c.status);

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
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                          {SEND_TYPE_LABEL[c.sendType] || c.sendType}
                        </span>
                      </div>

                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {c.template.name} · {c.instance.label || c.instance.instanceName} · {c.totalContacts} contato{c.totalContacts !== 1 ? "s" : ""}
                        {c.startAt && ` · ${new Date(c.startAt).toLocaleString("pt-BR")}`}
                      </p>

                      {c.description && (
                        <p className="text-xs mt-1 line-clamp-1" style={{ color: "var(--text-secondary)" }}>{c.description}</p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                        <span style={{ color: "var(--success)" }}>✓ {c.sentCount} enviados</span>
                        {c.failedCount > 0 && <span style={{ color: "var(--danger)" }}>✗ {c.failedCount} falhas</span>}
                        {c.pendingCount > 0 && <span>⏳ {c.pendingCount} pendentes</span>}
                      </div>

                      {/* Progress bar */}
                      {c.totalContacts > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {totalDone} / {c.totalContacts}
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
                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
                      <button
                        onClick={() => setDetailId(c.id)}
                        className="p-1.5 rounded-lg"
                        style={{ color: "var(--primary)" }}
                        title="Ver relatório"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      </button>

                      {canSchedule && (
                        <button
                          onClick={() => scheduleCampaign(c.id)}
                          disabled={actionLoading === c.id + "-schedule"}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-50"
                          style={{ borderColor: "var(--success)", color: "var(--success)" }}
                          title="Agendar campanha"
                        >
                          {actionLoading === c.id + "-schedule" ? "…" : "▶ Agendar"}
                        </button>
                      )}

                      {c.status === "draft" && (
                        <button
                          onClick={() => dispatchNow(c.id)}
                          disabled={!!actionLoading}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-50"
                          style={{ borderColor: "var(--primary)", color: "var(--primary)" }}
                          title="Disparar agora"
                        >
                          {actionLoading === c.id + "-dispatch" ? "…" : "⚡ Agora"}
                        </button>
                      )}

                      {canPause && (
                        <button
                          onClick={() => pauseCampaign(c.id)}
                          disabled={actionLoading === c.id + "-pause"}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-50"
                          style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
                          title="Pausar"
                        >
                          {actionLoading === c.id + "-pause" ? "…" : "⏸ Pausar"}
                        </button>
                      )}

                      {canCancel && (
                        <button
                          onClick={() => cancelCampaign(c.id)}
                          disabled={actionLoading === c.id + "-cancel"}
                          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border disabled:opacity-50"
                          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                          title="Cancelar"
                        >
                          {actionLoading === c.id + "-cancel" ? "…" : "✕ Cancelar"}
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
        <ContactCampaignForm
          onClose={closeForm}
          onSaved={() => { closeForm(); loadCampaigns(); }}
          editing={editingCampaign}
        />
      )}

      {/* Campaign Detail Drawer */}
      {detailId && (
        <ContactCampaignDetail
          campaignId={detailId}
          onClose={() => setDetailId(null)}
          onAction={loadCampaigns}
        />
      )}
    </div>
  );
}
