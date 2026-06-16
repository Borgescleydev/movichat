"use client";

import { useState, useEffect } from "react";

interface ContactTemplate {
  id: string;
  name: string;
  variations: string;
  mediaType: string | null;
}

interface Instance {
  id: string;
  label: string | null;
  instanceName: string;
  status: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  email: string | null;
}

interface ContactGroup {
  id: string;
  name: string;
  sourceGroupName: string | null;
  _count?: { items: number };
}

interface ContactCampaign {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  sendType: string;
  templateId: string;
  instanceId: string;
  variableValues: string;
  startAt: string;
  repeatType: string;
  repeatEndAt?: string | null;
  cadenceMinSeconds: number;
  cadenceMaxSeconds: number;
  cadenceMaxPerHour: number;
  windowStart?: string | null;
  windowEnd?: string | null;
  windowDays?: string;
  batchSize?: number | null;
  batchIntervalMinutes?: number | null;
  repeatEveryX?: number | null;
  repeatEveryUnit?: string | null;
  contacts?: { contact: { id: string; name: string; phone: string } }[];
}

interface ContactCampaignFormProps {
  onClose: () => void;
  onSaved: () => void;
  editing?: ContactCampaign | null;
  initialContactGroupId?: string | null;
}

const CONTACT_VARS = ["name", "phone", "email", "notes", "date", "time"];

const SAMPLE_CONTACT = {
  name: "Maria Silva",
  phone: "5511999998888",
  email: "maria@email.com",
  notes: "Cliente Premium",
  date: new Date().toLocaleDateString("pt-BR"),
  time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
};

const SEND_TYPES = [
  { value: "scheduled", label: "Envio único",        description: "Uma vez em data/hora específica",         icon: "📅" },
  { value: "recurring", label: "Recorrente",          description: "Repete diariamente, semanalmente etc.",   icon: "🔄" },
  { value: "windowed",  label: "Janela de horário",   description: "Só envia dentro do horário permitido",    icon: "🕐" },
  { value: "batch",     label: "Em lotes",            description: "Parcelado para evitar bloqueios",         icon: "📦" },
];

const RECURRENCE_OPTIONS = [
  { value: "daily",   label: "Diariamente" },
  { value: "weekly",  label: "Semanalmente" },
  { value: "monthly", label: "Mensalmente" },
  { value: "custom",  label: "Personalizado" },
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

function resolvePreview(text: string): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, v) => {
    return (SAMPLE_CONTACT as Record<string, string>)[v] ?? `{{${v}}}`;
  });
}

const STEPS = ["Básico", "Contatos", "Prévia", "Agendamento"];

export default function ContactCampaignForm({ onClose, onSaved, editing, initialContactGroupId }: ContactCampaignFormProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  // Step 1
  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [templateId, setTemplateId] = useState(editing?.templateId || "");
  const [instanceId, setInstanceId] = useState(editing?.instanceId || "");

  // Step 2 — Contacts
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(
    editing?.contacts?.map(c => c.contact.id) || []
  );
  const [contactSearch, setContactSearch] = useState("");

  // Step 4 — Scheduling
  const [sendType, setSendType] = useState(editing?.sendType || "scheduled");
  const [startAt, setStartAt] = useState(editing?.startAt ? toLocalDatetimeValue(editing.startAt) : "");
  const [repeatType, setRepeatType] = useState(editing?.repeatType || "daily");
  const [repeatEndAt, setRepeatEndAt] = useState(editing?.repeatEndAt ? toLocalDatetimeValue(editing.repeatEndAt) : "");
  const [repeatEveryX, setRepeatEveryX] = useState(editing?.repeatEveryX ?? 1);
  const [repeatEveryUnit, setRepeatEveryUnit] = useState(editing?.repeatEveryUnit || "days");
  const [windowStart, setWindowStart] = useState(editing?.windowStart || "08:00");
  const [windowEnd, setWindowEnd] = useState(editing?.windowEnd || "18:00");
  const [windowDays, setWindowDays] = useState<number[]>(() => {
    try { return JSON.parse(editing?.windowDays || "[1,2,3,4,5]"); } catch { return [1, 2, 3, 4, 5]; }
  });
  const [batchSize, setBatchSize] = useState(editing?.batchSize ?? 50);
  const [batchIntervalMinutes, setBatchIntervalMinutes] = useState(editing?.batchIntervalMinutes ?? 10);
  const [cadenceMin, setCadenceMin] = useState(editing?.cadenceMinSeconds ?? 30);
  const [cadenceMax, setCadenceMax] = useState(editing?.cadenceMaxSeconds ?? 90);
  const [cadenceMaxPerHour, setCadenceMaxPerHour] = useState(editing?.cadenceMaxPerHour ?? 40);

  // Data
  const [templates, setTemplates] = useState<ContactTemplate[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [selectedContactGroupId, setSelectedContactGroupId] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    fetch("/api/individual/templates").then(r => r.ok ? r.json() : []).then(setTemplates);
    fetch("/api/providers").then(async r => {
      if (!r.ok) return;
      const providers = await r.json();
      const all: Instance[] = [];
      for (const p of providers) {
        for (const inst of p.instances || []) all.push(inst);
      }
      setInstances(all);
    });
    fetch("/api/contact-groups").then(r => r.ok ? r.json() : { contactGroups: [] }).then(d => setContactGroups(d.contactGroups || []));
  }, []);

  useEffect(() => {
    setLoadingContacts(true);
    fetch("/api/contacts")
      .then(r => r.ok ? r.json() : [])
      .then(contactsData => {
        setContacts(Array.isArray(contactsData) ? contactsData : []);
        setLoadingContacts(false);
      });
  }, []);

  const selectedTemplate = templates.find(t => t.id === templateId);
  const variations: string[] = selectedTemplate
    ? (() => { try { return JSON.parse(selectedTemplate.variations); } catch { return []; } })()
    : [];

  const filteredContacts = contacts.filter(c => {
    return c.name.toLowerCase().includes(contactSearch.toLowerCase()) ||
      c.phone.includes(contactSearch);
  });

  function toggleContact(id: string) {
    setSelectedContactIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleAll() {
    if (selectedContactIds.length === filteredContacts.length) setSelectedContactIds([]);
    else setSelectedContactIds(filteredContacts.map(c => c.id));
  }

  async function selectByContactGroup(groupId: string) {
    setSelectedContactGroupId(groupId);
    if (!groupId) return;
    const res = await fetch(`/api/contact-groups/${groupId}`);
    if (!res.ok) return;
    const group = await res.json();
    const ids = (group.items || []).map((item: { contact: { id: string } }) => item.contact.id);
    setSelectedContactIds(prev => [...new Set([...prev, ...ids])]);
  }

  useEffect(() => {
    if (!initialContactGroupId || editing) return;
    selectByContactGroup(initialContactGroupId);
    setStep(2);
  }, [initialContactGroupId, editing]);

  function toggleDay(day: number) {
    setWindowDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort());
  }

  function canSaveDraft(): boolean {
    return name.trim().length > 0 && !!templateId && !!instanceId;
  }

  function canGoNext(): boolean {
    if (step === 1) return name.trim().length > 0 && !!templateId && !!instanceId;
    if (step === 2) return selectedContactIds.length > 0;
    if (step === 3) return true;
    if (step === 4) {
      if (!startAt && sendType !== "immediate") return false;
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
        sendType,
        templateId,
        instanceId,
        contactIds: selectedContactIds,
        variableValues: {},
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

      const url = editing ? `/api/individual/campaigns/${editing.id}` : "/api/individual/campaigns";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();

      if (res.ok) { onSaved(); }
      else { alert((data.error as string) || `Erro ao salvar campanha (HTTP ${res.status})`); }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      const defaultStartAt = new Date(Date.now() + 86_400_000).toISOString();
      const payload: Record<string, unknown> = {
        name: name.trim(),
        description: description.trim() || null,
        sendType,
        templateId,
        instanceId,
        contactIds: selectedContactIds,
        variableValues: {},
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

      const url = editing ? `/api/individual/campaigns/${editing.id}` : "/api/individual/campaigns";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();

      if (res.ok) { onSaved(); }
      else { alert((data.error as string) || `Erro ao salvar rascunho`); }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSavingDraft(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl" style={{ backgroundColor: "var(--card-bg)" }}>
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {editing ? "Editar Campanha Individual" : "Nova Campanha Individual"}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Passo {step} de {STEPS.length}</p>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
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
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Boas-vindas Clientes"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Descrição (opcional)</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Objetivo desta campanha..."
                  rows={2}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Template de Mensagem *</label>
                {templates.length === 0 ? (
                  <p className="text-sm py-2" style={{ color: "var(--danger)" }}>Crie um template de contato antes de continuar.</p>
                ) : (
                  <select
                    value={templateId}
                    onChange={e => setTemplateId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
                  >
                    <option value="">Selecione um template</option>
                    {templates.map(t => {
                      const vars = (() => { try { return JSON.parse(t.variations) as string[]; } catch { return []; } })();
                      return (
                        <option key={t.id} value={t.id}>{t.name} ({vars.length} variação{vars.length !== 1 ? "ões" : ""}){t.mediaType ? ` • ${t.mediaType}` : ""}</option>
                      );
                    })}
                  </select>
                )}
                {selectedTemplate && variations.length > 0 && (
                  <div className="mt-2 p-3 rounded-lg text-xs" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
                    <p className="font-semibold mb-1">{variations.length} variação{variations.length !== 1 ? "ões" : ""}</p>
                    <pre className="whitespace-pre-wrap font-sans">{variations[0].slice(0, 100)}{variations[0].length > 100 ? "..." : ""}</pre>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Instância WhatsApp *</label>
                <select
                  value={instanceId}
                  onChange={e => setInstanceId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
                >
                  <option value="">Selecione uma instância</option>
                  {instances.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.label || i.instanceName} — {i.status === "connected" ? "✓ Conectada" : "⚠ Offline"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── Step 2: Contacts ── */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Selecione os contatos para receber a mensagem
                </p>
                <span className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
                  {selectedContactIds.length} selecionado{selectedContactIds.length !== 1 ? "s" : ""}
                </span>
              </div>

              {contactGroups.length > 0 && (
                <div className="rounded-xl p-3" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Carregar grupo de contatos coletado:</p>
                  <select
                    value={selectedContactGroupId}
                    onChange={e => selectByContactGroup(e.target.value)}
                    className="w-full text-sm rounded-lg border px-3 py-2"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
                  >
                    <option value="">Selecione uma lista...</option>
                    {contactGroups.map(group => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group._count?.items || 0}){group.sourceGroupName ? ` - ${group.sourceGroupName}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Search & filter */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={contactSearch}
                    onChange={e => setContactSearch(e.target.value)}
                    placeholder="Buscar por nome ou telefone..."
                    className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
                <button onClick={toggleAll} className="text-xs font-medium px-3 py-2 rounded-lg border flex-shrink-0" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  {selectedContactIds.length === filteredContacts.length && filteredContacts.length > 0 ? "Desmarcar todos" : "Marcar todos"}
                </button>
              </div>

              {loadingContacts ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
                </div>
              ) : contacts.length === 0 ? (
                <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
                  <p className="text-sm">Nenhum contato encontrado.</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                  {filteredContacts.map(c => {
                    const selected = selectedContactIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                        style={{
                          backgroundColor: selected ? "var(--primary-light)" : "transparent",
                          border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleContact(c.id)}
                          className="w-4 h-4 rounded"
                          style={{ accentColor: "var(--primary)" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{c.name}</p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.phone}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              {filteredContacts.length === 0 && contacts.length > 0 && (
                <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
                  Nenhum contato corresponde aos filtros
                </p>
              )}
            </div>
          )}

          {/* ── Step 3: Message Preview ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--primary)" }}>
                  Variáveis de contato disponíveis (preenchidas automaticamente):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CONTACT_VARS.map(v => (
                    <code key={v} className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: "var(--card-bg)", color: "var(--primary)" }}>
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>

              {variations.length === 0 ? (
                <div className="rounded-xl p-4 text-sm text-center" style={{ color: "var(--text-muted)", backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                  Template sem variações configuradas
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {variations.length} variação{variations.length !== 1 ? "ões" : ""} — uma enviada aleatoriamente por contato:
                  </p>
                  {variations.map((v, idx) => (
                    <div key={idx} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                      <div className="px-3 py-1.5 flex items-center justify-between" style={{ backgroundColor: "var(--page-bg)", borderBottom: "1px solid var(--border)" }}>
                        <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Variação {idx + 1}</span>
                      </div>
                      <div className="p-3 space-y-2">
                        <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Original:</p>
                        <pre className="text-xs whitespace-pre-wrap font-sans" style={{ color: "var(--text-primary)" }}>{v}</pre>
                        <p className="text-xs font-medium mt-2" style={{ color: "var(--success)" }}>Com dados de exemplo ({SAMPLE_CONTACT.name}):</p>
                        <pre className="text-xs whitespace-pre-wrap font-sans rounded-lg p-2" style={{ backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)", color: "var(--text-primary)", border: "1px solid color-mix(in srgb, var(--success) 20%, transparent)" }}>
                          {resolvePreview(v)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl p-3 text-xs" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                <strong style={{ color: "var(--text-secondary)" }}>{selectedContactIds.length}</strong> contato{selectedContactIds.length !== 1 ? "s" : ""} selecionado{selectedContactIds.length !== 1 ? "s" : ""} receberão uma variação aleatória desta mensagem.
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
                  {SEND_TYPES.map(t => (
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

              {/* Envio único */}
              {sendType === "scheduled" && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                  <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                </div>
              )}

              {/* Recorrente */}
              {sendType === "recurring" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                    <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Frequência de repetição</label>
                    <div className="grid grid-cols-2 gap-2">
                      {RECURRENCE_OPTIONS.map(r => (
                        <button key={r.value} type="button" onClick={() => setRepeatType(r.value)}
                          className="px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all"
                          style={repeatType === r.value
                            ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)", color: "var(--primary)" }
                            : { borderColor: "var(--border)", color: "var(--text-secondary)" }
                          }>
                          {r.label}
                        </button>
                      ))}
                    </div>
                    {repeatType === "custom" && (
                      <div className="flex items-center gap-2 mt-3 p-3 rounded-xl" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>A cada</span>
                        <input type="number" min={1} max={999} value={repeatEveryX} onChange={e => setRepeatEveryX(Number(e.target.value))}
                          className="w-16 border rounded-lg px-2 py-1.5 text-sm text-center"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                        <select value={repeatEveryUnit} onChange={e => setRepeatEveryUnit(e.target.value)}
                          className="border rounded-lg px-2 py-1.5 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}>
                          <option value="days">dias</option>
                          <option value="hours">horas</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data de encerramento (opcional)</label>
                    <input type="datetime-local" value={repeatEndAt} onChange={e => setRepeatEndAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                  </div>
                </div>
              )}

              {/* Janela de horário */}
              {sendType === "windowed" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                    <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Janela de horário</label>
                    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Das</span>
                      <input type="time" value={windowStart} onChange={e => setWindowStart(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>até</span>
                      <input type="time" value={windowEnd} onChange={e => setWindowEnd(e.target.value)}
                        className="border rounded-lg px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Dias permitidos</label>
                    <div className="flex gap-1.5">
                      {WEEKDAYS.map(d => {
                        const active = windowDays.includes(d.value);
                        return (
                          <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                            className="flex-1 py-2 rounded-lg text-xs font-medium border-2 transition-all"
                            style={active
                              ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)", color: "var(--primary)" }
                              : { borderColor: "var(--border)", color: "var(--text-muted)" }
                            }>
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Em lotes */}
              {sendType === "batch" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                    <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Tamanho do lote</label>
                      <div className="relative">
                        <input type="number" min={1} max={1000} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>msgs</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Intervalo entre lotes</label>
                      <div className="relative">
                        <input type="number" min={1} max={1440} value={batchIntervalMinutes} onChange={e => setBatchIntervalMinutes(Number(e.target.value))}
                          className="w-full border rounded-lg px-3 py-2 text-sm"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "var(--text-muted)" }}>min</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Regras de segurança */}
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Cadência de envio</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Intervalo aleatório entre cada envio. Mínimo recomendado: 30s para contatos individuais.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Mín. (seg)</label>
                    <input type="number" min={5} max={3600} value={cadenceMin} onChange={e => setCadenceMin(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Máx. (seg)</label>
                    <input type="number" min={cadenceMin} max={3600} value={cadenceMax} onChange={e => setCadenceMax(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Máx/hora</label>
                    <input type="number" min={1} max={200} value={cadenceMaxPerHour} onChange={e => setCadenceMaxPerHour(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                  </div>
                </div>
                {cadenceMin > cadenceMax && (
                  <p className="text-xs" style={{ color: "var(--danger)" }}>O intervalo mínimo não pode ser maior que o máximo.</p>
                )}
              </div>

              {/* Resumo */}
              <div className="rounded-xl p-4" style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--primary)" }}>Resumo da campanha</p>
                <ul className="text-xs space-y-1" style={{ color: "var(--primary)" }}>
                  <li>• {selectedContactIds.length} contato{selectedContactIds.length !== 1 ? "s" : ""} selecionado{selectedContactIds.length !== 1 ? "s" : ""}</li>
                  <li>• Template: {selectedTemplate?.name} ({variations.length} variação{variations.length !== 1 ? "ões" : ""})</li>
                  <li>• Tipo: {SEND_TYPES.find(t => t.value === sendType)?.label}</li>
                  {sendType === "recurring" && <li>• Repetição: {RECURRENCE_OPTIONS.find(r => r.value === repeatType)?.label}</li>}
                  {sendType === "windowed" && <li>• Janela: {windowStart} – {windowEnd} ({windowDays.length} dias/semana)</li>}
                  {sendType === "batch" && <li>• Lotes: {batchSize} msgs a cada {batchIntervalMinutes} min</li>}
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
            {canSaveDraft() && (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft || saving}
                className="text-sm px-4 py-2 rounded-lg border font-medium disabled:opacity-40 flex items-center gap-1.5"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {savingDraft ? "Salvando..." : "Salvar rascunho"}
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
