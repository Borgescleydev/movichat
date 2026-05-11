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
  } | null;
}

const REPEAT_TYPES = [
  { value: "none", label: "Não repetir" },
  { value: "daily", label: "Diariamente" },
  { value: "weekly", label: "Semanalmente" },
  { value: "monthly", label: "Mensalmente" },
];

function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CampaignForm({ onClose, onSaved, editing }: CampaignFormProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [templateId, setTemplateId] = useState(editing?.templateId || "");
  const [instanceId, setInstanceId] = useState(editing?.instanceId || "");

  // Step 2
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(editing?.groupIds || []);
  const [groupSearch, setGroupSearch] = useState("");

  // Step 3
  const [variableValues, setVariableValues] = useState<Record<string, string>>(editing?.variableValues || {});

  // Step 4
  const [startAt, setStartAt] = useState(editing?.startAt ? toLocalDatetimeValue(editing.startAt) : "");
  const [repeatType, setRepeatType] = useState(editing?.repeatType || "none");
  const [repeatEndAt, setRepeatEndAt] = useState(editing?.repeatEndAt ? toLocalDatetimeValue(editing.repeatEndAt) : "");
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
        for (const inst of p.instances || []) {
          all.push(inst);
        }
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

  const estimatedMinutes = selectedGroupIds.length > 1
    ? Math.round(((selectedGroupIds.length - 1) * cadenceMax) / 60)
    : 0;

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedGroupIds.length === filteredGroups.length) {
      setSelectedGroupIds([]);
    } else {
      setSelectedGroupIds(filteredGroups.map((g) => g.id));
    }
  }

  function canGoNext(): boolean {
    if (step === 1) return name.trim().length > 0 && !!templateId && !!instanceId;
    if (step === 2) return selectedGroupIds.length > 0;
    if (step === 3) return true;
    if (step === 4) return !!startAt && cadenceMin <= cadenceMax;
    return true;
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const payload = {
        name,
        description: description || undefined,
        templateId,
        instanceId,
        groupIds: selectedGroupIds,
        variableValues,
        startAt: new Date(startAt).toISOString(),
        repeatType,
        repeatEndAt: repeatEndAt ? new Date(repeatEndAt).toISOString() : undefined,
        cadenceMinSeconds: cadenceMin,
        cadenceMaxSeconds: cadenceMax,
        cadenceMaxPerHour,
      };

      const res = editing
        ? await fetch(`/api/campaigns/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

      if (res.ok) {
        onSaved();
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao salvar campanha");
      }
    } finally {
      setSaving(false);
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

          {/* Step 1: Basic */}
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

          {/* Step 2: Groups */}
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

          {/* Step 3: Variables & Preview */}
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

              {/* Preview */}
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

          {/* Step 4: Schedule & Cadence */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Data e hora de início *</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Repetição</label>
                <div className="grid grid-cols-2 gap-2">
                  {REPEAT_TYPES.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRepeatType(r.value)}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all"
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

                {repeatType !== "none" && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Data de encerramento (opcional)</label>
                    <input
                      type="datetime-local"
                      value={repeatEndAt}
                      onChange={(e) => setRepeatEndAt(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>Cadência de envio</label>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Intervalo aleatório entre cada envio. Recomendado mínimo 10s para evitar bloqueios.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Mín. (seg)</label>
                    <input
                      type="number"
                      min={5}
                      max={3600}
                      value={cadenceMin}
                      onChange={(e) => setCadenceMin(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Máx. (seg)</label>
                    <input
                      type="number"
                      min={cadenceMin}
                      max={3600}
                      value={cadenceMax}
                      onChange={(e) => setCadenceMax(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Máx/hora</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={cadenceMaxPerHour}
                      onChange={(e) => setCadenceMaxPerHour(Number(e.target.value))}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-center"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                </div>
                {cadenceMin > cadenceMax && (
                  <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>O intervalo mínimo não pode ser maior que o máximo.</p>
                )}
              </div>

              {/* Summary */}
              <div className="rounded-xl p-4" style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--primary)" }}>Resumo da campanha</p>
                <ul className="text-xs space-y-1" style={{ color: "var(--primary)" }}>
                  <li>• {selectedGroupIds.length} grupo{selectedGroupIds.length !== 1 ? "s" : ""} selecionado{selectedGroupIds.length !== 1 ? "s" : ""}</li>
                  <li>• Cadência: {cadenceMin}–{cadenceMax}s entre envios</li>
                  {estimatedMinutes > 0 && <li>• Duração estimada: ~{estimatedMinutes} minuto{estimatedMinutes !== 1 ? "s" : ""}</li>}
                  {estimatedMinutes > 1440 && (
                    <li style={{ color: "var(--warning)" }}>⚠ Campanha muito longa — considere reduzir grupos ou aumentar cadência/hora</li>
                  )}
                  <li>• Repetição: {REPEAT_TYPES.find((r) => r.value === repeatType)?.label}</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            type="button"
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="text-sm px-4 py-2 rounded-lg border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            {step === 1 ? "Cancelar" : "← Voltar"}
          </button>

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
  );
}
