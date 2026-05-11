"use client";

import { useState, useEffect } from "react";

interface Template {
  id: string;
  name: string;
  body: string;
  variables: string;
  mediaType: string | null;
}

interface Instance {
  id: string;
  label: string | null;
  instanceName: string;
  status: string;
}

interface Group {
  id: string;
  name: string;
  groupJid: string;
  participantCount: number;
}

interface CampaignFormProps {
  onClose: () => void;
  onSaved: () => void;
  editing?: {
    id: string;
    name: string;
    description?: string;
    channel: string;
    sendType: string;
    templateId: string;
    instanceId: string;
    groupIds: string[];
    variableValues: Record<string, string>;
    startAt: string;
    repeatType: string;
    repeatEndAt?: string;
    cadenceMinSeconds: number;
    cadenceMaxSeconds: number;
    cadenceMaxPerHour: number;
    windowStart?: string | null;
    windowEnd?: string | null;
    windowDays?: number[];
    batchSize?: number | null;
    batchIntervalMinutes?: number | null;
    repeatEveryX?: number | null;
    repeatEveryUnit?: string | null;
  } | null;
}

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp", icon: "💬" },
  { value: "sms", label: "SMS", icon: "📱" },
  { value: "email", label: "E-mail", icon: "📧" },
];

const SEND_TYPES = [
  { value: "scheduled", label: "Envio único", description: "Uma vez em data/hora específica", icon: "📅" },
  { value: "recurring", label: "Recorrente", description: "Repete diariamente, semanalmente etc.", icon: "🔄" },
  { value: "windowed", label: "Janela de horário", description: "Só envia dentro do horário permitido", icon: "🕐" },
  { value: "batch", label: "Em lotes", description: "Parcelado para evitar bloqueios", icon: "📦" },
];

const RECURRENCE_OPTIONS = [
  { value: "daily", label: "Diariamente" },
  { value: "weekly", label: "Semanalmente" },
  { value: "monthly", label: "Mensalmente" },
  { value: "custom", label: "Personalizado" },
];

const WEEKDAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
];

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignForm({ onClose, onSaved, editing }: CampaignFormProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Step 1 — Basic
  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [channel, setChannel] = useState(editing?.channel || "whatsapp");
  const [templateId, setTemplateId] = useState(editing?.templateId || "");
  const [instanceId, setInstanceId] = useState(editing?.instanceId || "");

  // Step 2 — Groups
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(editing?.groupIds || []);
  const [groupSearch, setGroupSearch] = useState("");

  // Step 3 — Variables
  const [variableValues, setVariableValues] = useState<Record<string, string>>(editing?.variableValues || {});

  // Step 4 — Scheduling
  const [sendType, setSendType] = useState(editing?.sendType || "scheduled");
  const [startAt, setStartAt] = useState(editing?.startAt ? toLocalDatetimeValue(editing.startAt) : "");
  const [repeatType, setRepeatType] = useState(editing?.repeatType || "daily");
  const [repeatEndAt, setRepeatEndAt] = useState(editing?.repeatEndAt ? toLocalDatetimeValue(editing.repeatEndAt) : "");
  const [repeatEveryX, setRepeatEveryX] = useState(editing?.repeatEveryX ?? 1);
  const [repeatEveryUnit, setRepeatEveryUnit] = useState(editing?.repeatEveryUnit || "days");
  const [windowStart, setWindowStart] = useState(editing?.windowStart || "08:00");
  const [windowEnd, setWindowEnd] = useState(editing?.windowEnd || "18:00");
  const [windowDays, setWindowDays] = useState<number[]>(editing?.windowDays || [1, 2, 3, 4, 5]);
  const [batchSize, setBatchSize] = useState(editing?.batchSize ?? 100);
  const [batchIntervalMinutes, setBatchIntervalMinutes] = useState(editing?.batchIntervalMinutes ?? 10);
  const [cadenceMin, setCadenceMin] = useState(editing?.cadenceMinSeconds ?? 10);
  const [cadenceMax, setCadenceMax] = useState(editing?.cadenceMaxSeconds ?? 30);
  const [cadenceMaxPerHour, setCadenceMaxPerHour] = useState(editing?.cadenceMaxPerHour ?? 60);

  // Data
  const [templates, setTemplates] = useState<Template[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    fetch("/api/campaigns/templates").then((r) => r.ok ? r.json() : []).then(setTemplates);
    fetch("/api/providers").then(async (r) => {
      if (!r.ok) return;
      const providers = await r.json();
      const all: Instance[] = [];
      for (const p of providers) {
        for (const inst of p.instances || []) all.push(inst);
      }
      setInstances(all);
    });
  }, []);

  useEffect(() => {
    if (!instanceId) return;
    setLoadingGroups(true);
    fetch(`/api/campaigns/groups?instanceId=${instanceId}`)
      .then((r) => r.ok ? r.json() : { groups: [] })
      .then((d) => { setGroups(d.groups || []); setLoadingGroups(false); });
  }, [instanceId]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const templateVars: string[] = selectedTemplate
    ? (JSON.parse(selectedTemplate.variables || "[]") as string[]).filter((v) => v !== "group_name")
    : [];

  function previewBody(): string {
    if (!selectedTemplate) return "";
    const firstGroup = groups.find((g) => selectedGroupIds.includes(g.id));
    return selectedTemplate.body.replace(/\{\{(\w+)\}\}/g, (_, v) => {
      if (v === "group_name") return firstGroup?.name || "[nome do grupo]";
      if (v === "date") return new Date().toLocaleDateString("pt-BR");
      if (v === "time") return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      return variableValues[v] || `{{${v}}}`;
    });
  }

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    if (selectedGroupIds.length === filteredGroups.length) setSelectedGroupIds([]);
    else setSelectedGroupIds(filteredGroups.map((g) => g.id));
  }

  function toggleDay(day: number) {
    setWindowDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  }

  // Draft only requires step 1 fields
  function canSaveDraft(): boolean {
    return name.trim().length > 0 && !!templateId && !!instanceId;
  }

  function canGoNext(): boolean {
    if (step === 1) return name.trim().length > 0 && !!templateId && !!instanceId;
    if (step === 2) return selectedGroupIds.length > 0;
    if (step === 3) return true;
    if (step === 4) {
      if (sendType === "scheduled" || sendType === "recurring" || sendType === "windowed" || sendType === "batch") {
        if (!startAt) return false;
      }
      return cadenceMin <= cadenceMax;
    }
    return true;
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        channel,
        sendType,
        templateId,
        instanceId,
        groupIds: selectedGroupIds,
        variableValues,
        startAt: sendType === "immediate" ? new Date().toISOString() : (startAt ? new Date(startAt).toISOString() : new Date().toISOString()),
        repeatType: sendType === "recurring" ? repeatType : "none",
        repeatEndAt: (sendType === "recurring" && repeatEndAt) ? new Date(repeatEndAt).toISOString() : null,
        cadenceMinSeconds: cadenceMin,
        cadenceMaxSeconds: cadenceMax,
        cadenceMaxPerHour,
        windowStart: sendType === "windowed" ? (windowStart || null) : null,
        windowEnd: sendType === "windowed" ? (windowEnd || null) : null,
        windowDays: sendType === "windowed" ? windowDays : [],
        batchSize: sendType === "batch" ? batchSize : null,
        batchIntervalMinutes: sendType === "batch" ? batchIntervalMinutes : null,
        repeatEveryX: (sendType === "recurring" && repeatType === "custom") ? repeatEveryX : null,
        repeatEveryUnit: (sendType === "recurring" && repeatType === "custom") ? repeatEveryUnit : null,
      };

      const url = editing ? `/api/campaigns/${editing.id}` : "/api/campaigns";
      const method = editing ? "PATCH" : "POST";

      let res: Response;
      try {
        res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } catch {
        alert("Erro de conexão. Verifique sua internet e tente novamente.");
        return;
      }

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        // response wasn't JSON (unexpected server error)
      }

      if (res.ok) {
        onSaved();
      } else {
        alert((data.error as string) || `Erro ao salvar campanha (HTTP ${res.status})`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro inesperado ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      const defaultStartAt = new Date(Date.now() + 86_400_000).toISOString(); // tomorrow
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        channel,
        sendType,
        templateId,
        instanceId,
        groupIds: selectedGroupIds,
        variableValues,
        startAt: startAt ? new Date(startAt).toISOString() : defaultStartAt,
        repeatType: sendType === "recurring" ? repeatType : "none",
        repeatEndAt: (sendType === "recurring" && repeatEndAt) ? new Date(repeatEndAt).toISOString() : null,
        cadenceMinSeconds: cadenceMin,
        cadenceMaxSeconds: cadenceMax,
        cadenceMaxPerHour,
        windowStart: sendType === "windowed" ? (windowStart || null) : null,
        windowEnd: sendType === "windowed" ? (windowEnd || null) : null,
        windowDays: sendType === "windowed" ? windowDays : [],
        batchSize: sendType === "batch" ? batchSize : null,
        batchIntervalMinutes: sendType === "batch" ? batchIntervalMinutes : null,
        repeatEveryX: (sendType === "recurring" && repeatType === "custom") ? repeatEveryX : null,
        repeatEveryUnit: (sendType === "recurring" && repeatType === "custom") ? repeatEveryUnit : null,
        isDraft: true,
      };

      const url = editing ? `/api/campaigns/${editing.id}` : "/api/campaigns";
      const method = editing ? "PATCH" : "POST";

      let res: Response;
      try {
        res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } catch {
        alert("Erro de conexão. Verifique sua internet e tente novamente.");
        return;
      }

      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* non-JSON */ }

      if (res.ok) {
        onSaved();
      } else {
        alert((data.error as string) || `Erro ao salvar rascunho (HTTP ${res.status})`);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSavingDraft(false);
    }
  }

  const STEPS = ["Básico", "Grupos", "Mensagem", "Agendamento"];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {editing ? "Editar Campanha" : "Nova Campanha"}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Passo {step} de {STEPS.length}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  backgroundColor: i + 1 < step ? "var(--success)" : i + 1 === step ? "var(--primary)" : "var(--border)",
                  color: i + 1 <= step ? "#fff" : "var(--text-muted)",
                }}
              >
                {i + 1 < step ? "✓" : i + 1}
              </div>
              <span className="text-xs font-medium" style={{ color: i + 1 === step ? "var(--primary)" : "var(--text-muted)" }}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-6 h-px" style={{ backgroundColor: "var(--border)" }} />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Step 1: Basic ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Nome da Campanha *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Black Friday — Promoção Grupos"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Canal de envio *</label>
                <div className="flex gap-2">
                  {CHANNELS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setChannel(c.value)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all"
                      style={
                        channel === c.value
                          ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)", color: "var(--primary)" }
                          : { borderColor: "var(--border)", color: "var(--text-secondary)" }
                      }
                    >
                      <span>{c.icon}</span> {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Descrição (opcional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Objetivo desta campanha..."
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 resize-none"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Template de Mensagem *</label>
                {templates.length === 0 ? (
                  <p className="text-sm py-2" style={{ color: "var(--danger)" }}>Crie um template antes de continuar.</p>
                ) : (
                  <select
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
                  >
                    <option value="">Selecione um template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}{t.mediaType ? ` (${t.mediaType})` : ""}</option>
                    ))}
                  </select>
                )}
                {selectedTemplate && (
                  <div className="mt-2 p-3 rounded-lg text-xs" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
                    <pre className="whitespace-pre-wrap font-sans">{selectedTemplate.body.slice(0, 120)}{selectedTemplate.body.length > 120 ? "..." : ""}</pre>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Instância WhatsApp *</label>
                <select
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
                >
                  <option value="">Selecione uma instância</option>
                  {instances.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.label || i.instanceName} — {i.status === "connected" ? "✓ Conectada" : "⚠ Offline"}
                    </option>
                  ))}
                </select>
                {instanceId && instances.find((i) => i.id === instanceId)?.status !== "connected" && (
                  <p className="text-xs mt-1" style={{ color: "var(--warning)" }}>⚠ Esta instância está offline. Conecte-a antes de agendar a campanha.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Groups ── */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Selecione os grupos para receber a mensagem
                </p>
                <span className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
                  {selectedGroupIds.length} selecionado{selectedGroupIds.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    placeholder="Buscar grupos..."
                    className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
                <button onClick={toggleAll} className="text-xs font-medium px-3 py-2 rounded-lg border" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  {selectedGroupIds.length === filteredGroups.length ? "Desmarcar todos" : "Marcar todos"}
                </button>
              </div>

              {loadingGroups ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
                </div>
              ) : groups.length === 0 ? (
                <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
                  <p className="text-sm">Nenhum grupo encontrado para esta instância.</p>
                  <p className="text-xs mt-1">Sincronize os grupos na aba "Grupos" primeiro.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {filteredGroups.map((g) => {
                    const selected = selectedGroupIds.includes(g.id);
                    return (
                      <label
                        key={g.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                        style={{
                          backgroundColor: selected ? "var(--primary-light)" : "transparent",
                          border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleGroup(g.id)}
                          className="w-4 h-4 rounded"
                          style={{ accentColor: "var(--primary)" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{g.name}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {g.participantCount > 0 ? `${g.participantCount} participantes` : g.groupJid}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3: Variables & Preview ── */}
          {step === 3 && (
            <div className="space-y-4">
              {templateVars.length === 0 && (
                <div className="rounded-xl p-4 text-sm" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
                  Este template não possui variáveis personalizáveis (além de {"{{group_name}}"} que é automático).
                </div>
              )}

              {templateVars.map((v) => (
                <div key={v}>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                    <code className="text-xs px-1.5 py-0.5 rounded mr-1" style={{ backgroundColor: "var(--border)" }}>{`{{${v}}}`}</code>
                    Valor para "{v}"
                  </label>
                  <input
                    value={variableValues[v] || ""}
                    onChange={(e) => setVariableValues({ ...variableValues, [v]: e.target.value })}
                    placeholder={`Valor para {{${v}}}`}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  Pré-visualização
                  <span className="text-xs ml-2 font-normal" style={{ color: "var(--text-muted)" }}>
                    (usando o primeiro grupo selecionado: {groups.find((g) => selectedGroupIds.includes(g.id))?.name || "N/A"})
                  </span>
                </label>
                <div
                  className="rounded-xl p-4 text-sm whitespace-pre-wrap"
                  style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)", color: "var(--text-primary)", fontFamily: "inherit", minHeight: 80 }}
                >
                  {previewBody() || <span style={{ color: "var(--text-muted)" }}>Selecione um template no passo 1</span>}
                </div>
                {selectedTemplate?.mediaType && (
                  <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    <span>📎</span>
                    <span>Mídia: {selectedTemplate.mediaType}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 4: Scheduling ── */}
          {step === 4 && (
            <div className="space-y-5">

              {/* Tipo de agendamento */}
              <div>
                <label className="block text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Tipo de agendamento</label>
                <div className="grid grid-cols-2 gap-2">
                  {SEND_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setSendType(t.value)}
                      className="flex items-start gap-3 px-3 py-3 rounded-xl border-2 text-left transition-all"
                      style={
                        sendType === t.value
                          ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)" }
                          : { borderColor: "var(--border)", backgroundColor: "transparent" }
                      }
                    >
                      <span className="text-lg leading-none mt-0.5">{t.icon}</span>
                      <div>
                        <p className="text-xs font-semibold" style={{ color: sendType === t.value ? "var(--primary)" : "var(--text-primary)" }}>{t.label}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t.description}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Envio único ── */}
              {sendType === "scheduled" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                  <input
                    type="datetime-local"
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>A campanha será disparada uma única vez nesta data/hora.</p>
                </div>
              )}

              {/* ── Recorrente ── */}
              {sendType === "recurring" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                    <input
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Frequência de repetição</label>
                    <div className="grid grid-cols-2 gap-2">
                      {RECURRENCE_OPTIONS.map((r) => (
                        <button
                          key={r.value}
                          type="button"
                          onClick={() => setRepeatType(r.value)}
                          className="px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all"
                          style={
                            repeatType === r.value
                              ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)", color: "var(--primary)" }
                              : { borderColor: "var(--border)", color: "var(--text-secondary)" }
                          }
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>

                    {repeatType === "custom" && (
                      <div className="flex items-center gap-2 mt-3 p-3 rounded-xl" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>A cada</span>
                        <input
                          type="number"
                          min={1}
                          max={999}
                          value={repeatEveryX}
                          onChange={(e) => setRepeatEveryX(Number(e.target.value))}
                          className="w-16 border rounded-lg px-2 py-1.5 text-sm text-center"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                        />
                        <select
                          value={repeatEveryUnit}
                          onChange={(e) => setRepeatEveryUnit(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
                        >
                          <option value="days">dias</option>
                          <option value="hours">horas</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data de encerramento (opcional)</label>
                    <input
                      type="datetime-local"
                      value={repeatEndAt}
                      onChange={(e) => setRepeatEndAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                </div>
              )}

              {/* ── Janela de horário ── */}
              {sendType === "windowed" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                    <input
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Janela de horário permitida</label>
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Das</span>
                      <input
                        type="time"
                        value={windowStart}
                        onChange={(e) => setWindowStart(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>até</span>
                      <input
                        type="time"
                        value={windowEnd}
                        onChange={(e) => setWindowEnd(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                    </div>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                      Se não terminar hoje, continuará amanhã dentro da mesma janela.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Dias permitidos</label>
                    <div className="flex gap-1.5">
                      {WEEKDAYS.map((d) => {
                        const active = windowDays.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => toggleDay(d.value)}
                            className="flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-all"
                            style={
                              active
                                ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)", color: "var(--primary)" }
                                : { borderColor: "var(--border)", color: "var(--text-muted)" }
                            }
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Em lotes ── */}
              {sendType === "batch" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                    <input
                      type="datetime-local"
                      value={startAt}
                      onChange={(e) => setStartAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Tamanho do lote</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={batchSize}
                          onChange={(e) => setBatchSize(Number(e.target.value))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>msgs</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Intervalo entre lotes</label>
                      <div className="relative">
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          value={batchIntervalMinutes}
                          onChange={(e) => setBatchIntervalMinutes(Number(e.target.value))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>min</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Serão enviadas {batchSize} mensagens a cada {batchIntervalMinutes} minuto{batchIntervalMinutes !== 1 ? "s" : ""}.
                    Total: {selectedGroupIds.length} grupos → ~{Math.ceil(selectedGroupIds.length / batchSize)} lotes.
                  </p>
                </div>
              )}

              {/* ── Regras de segurança (always) ── */}
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>🔒 Regras de segurança</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Intervalo aleatório entre cada envio. Mínimo recomendado: 10s para evitar bloqueios.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Mín. (seg)</label>
                    <input
                      type="number" min={5} max={3600} value={cadenceMin}
                      onChange={(e) => setCadenceMin(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Máx. (seg)</label>
                    <input
                      type="number" min={cadenceMin} max={3600} value={cadenceMax}
                      onChange={(e) => setCadenceMax(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Máx/hora</label>
                    <input
                      type="number" min={1} max={500} value={cadenceMaxPerHour}
                      onChange={(e) => setCadenceMaxPerHour(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                </div>
                {cadenceMin > cadenceMax && (
                  <p className="text-xs" style={{ color: "var(--danger)" }}>O intervalo mínimo não pode ser maior que o máximo.</p>
                )}
              </div>

              {/* ── Resumo ── */}
              <div className="rounded-xl p-4" style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--primary)" }}>Resumo da campanha</p>
                <ul className="text-xs space-y-1" style={{ color: "var(--primary)" }}>
                  <li>• Canal: {CHANNELS.find((c) => c.value === channel)?.label || channel}</li>
                  <li>• {selectedGroupIds.length} grupo{selectedGroupIds.length !== 1 ? "s" : ""} selecionado{selectedGroupIds.length !== 1 ? "s" : ""}</li>
                  <li>• Tipo: {SEND_TYPES.find((t) => t.value === sendType)?.label}</li>
                  {sendType === "recurring" && <li>• Repetição: {RECURRENCE_OPTIONS.find((r) => r.value === repeatType)?.label}{repeatType === "custom" ? ` (${repeatEveryX} ${repeatEveryUnit})` : ""}</li>}
                  {sendType === "windowed" && <li>• Janela: {windowStart} – {windowEnd} ({windowDays.length} dias/semana)</li>}
                  {sendType === "batch" && <li>• Lotes: {batchSize} msgs a cada {batchIntervalMinutes} min → ~{Math.ceil(selectedGroupIds.length / batchSize)} lotes</li>}
                  <li>• Cadência: {cadenceMin}–{cadenceMax}s entre envios (máx {cadenceMaxPerHour}/hora)</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="text-sm px-4 py-2 rounded-lg border flex-shrink-0"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            {step === 1 ? "Cancelar" : "← Voltar"}
          </button>

          <div className="flex items-center gap-2">
            {/* Save as draft — visible whenever step 1 is complete */}
            {canSaveDraft() && (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft || saving}
                className="text-sm px-4 py-2 rounded-lg border font-medium disabled:opacity-40 flex items-center gap-1.5"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                title="Salvar como rascunho (pode continuar editando depois)"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {savingDraft ? "Salvando..." : editing ? "Salvar rascunho" : "Salvar rascunho"}
              </button>
            )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              disabled={!canGoNext()}
              className="text-sm px-6 py-2 rounded-lg text-white font-medium disabled:opacity-40"
              style={{ backgroundColor: "var(--primary)" }}
            >
              Próximo →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || !canGoNext()}
              className="text-sm px-6 py-2 rounded-lg text-white font-medium disabled:opacity-40"
              style={{ backgroundColor: "var(--primary)" }}
            >
              {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Criar Campanha"}
            </button>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
