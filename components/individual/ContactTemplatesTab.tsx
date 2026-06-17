"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ContactTemplate {
  id: string;
  name: string;
  variations: string; // JSON array
  mediaType: string | null;
  mediaUrl: string | null;
  mediaCaption: string | null;
  createdAt: string;
  updatedAt: string;
}

type MediaTab = "none" | "image" | "video" | "document" | "audio";

const MEDIA_TABS: { id: MediaTab; label: string; accept: string; icon: string }[] = [
  { id: "none",     label: "Sem mídia",  accept: "",                                                     icon: "✍️" },
  { id: "image",    label: "Imagem",     accept: "image/*",                                              icon: "🖼️" },
  { id: "video",    label: "Vídeo",      accept: "video/*",                                              icon: "🎬" },
  { id: "document", label: "Documento",  accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv", icon: "📄" },
  { id: "audio",    label: "Áudio",      accept: "audio/*",                                              icon: "🎵" },
];

const MEDIA_ICONS: Record<string, string> = { image: "🖼", video: "🎬", audio: "🎵", document: "📎" };

const CONTACT_VARS = ["name", "phone", "email", "notes", "date", "time"];
const CONTACT_VAR_LABELS: Record<string, string> = {
  name: "Nome do contato",
  phone: "Telefone",
  email: "E-mail",
  notes: "Observações",
  date: "Data atual",
  time: "Hora atual",
};

const SAMPLE_CONTACT = {
  name: "Maria Silva",
  phone: "5511999998888",
  email: "maria@email.com",
  notes: "Cliente Premium",
  date: new Date().toLocaleDateString("pt-BR"),
  time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
};

function resolvePreview(text: string, varIdx: number): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, v) => {
    return (SAMPLE_CONTACT as Record<string, string>)[v] ?? `{{${v}}}`;
  });
}

interface FormState {
  name: string;
  variations: string[];
  mediaTab: MediaTab;
  mediaUrl: string;
  mediaCaption: string;
  mediaInputMode: "file" | "url";
  mediaFile: File | null;
  mediaBase64: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  variations: [""],
  mediaTab: "none",
  mediaUrl: "",
  mediaCaption: "",
  mediaInputMode: "url",
  mediaFile: null,
  mediaBase64: "",
};

export default function ContactTemplatesTab() {
  const [templates, setTemplates] = useState<ContactTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ContactTemplate | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [previewVariationIdx, setPreviewVariationIdx] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/individual/templates");
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPreviewVariationIdx(0);
    setShowForm(true);
  }

  async function openEdit(t: ContactTemplate) {
    const variations = (() => { try { return JSON.parse(t.variations); } catch { return [""]; } })() as string[];
    setEditing(t);
    // A listagem não traz mais mediaUrl (base64 pesado); busca o registro completo sob demanda.
    let mediaUrl = "";
    try {
      const res = await fetch(`/api/individual/templates/${t.id}`);
      if (res.ok) {
        const full = await res.json();
        mediaUrl = full.mediaUrl || "";
      }
    } catch {
      mediaUrl = "";
    }
    setForm({
      name: t.name,
      variations: variations.length ? variations : [""],
      mediaTab: (t.mediaType as MediaTab) || "none",
      mediaUrl,
      mediaCaption: t.mediaCaption || "",
      mediaInputMode: "url",
      mediaFile: null,
      mediaBase64: "",
    });
    setPreviewVariationIdx(0);
    setShowForm(true);
  }

  function clearMedia() {
    setForm(f => ({ ...f, mediaFile: null, mediaBase64: "", mediaUrl: "" }));
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, mediaFile: file, mediaBase64: "" }));
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, mediaBase64: reader.result as string }));
    reader.readAsDataURL(file);
  }

  function updateVariation(idx: number, value: string) {
    setForm(f => {
      const variations = [...f.variations];
      variations[idx] = value;
      return { ...f, variations };
    });
  }

  function addVariation() {
    if (form.variations.length >= 10) return;
    setForm(f => ({ ...f, variations: [...f.variations, ""] }));
  }

  function removeVariation(idx: number) {
    if (form.variations.length <= 1) return;
    setForm(f => {
      const variations = f.variations.filter((_, i) => i !== idx);
      return { ...f, variations };
    });
    if (previewVariationIdx >= form.variations.length - 1) {
      setPreviewVariationIdx(Math.max(0, form.variations.length - 2));
    }
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (form.variations.every(v => !v.trim())) {
      alert("Adicione ao menos uma variação com texto");
      return;
    }
    setSaving(true);
    try {
      const effectiveUrl = form.mediaInputMode === "file" ? form.mediaBase64 : form.mediaUrl;
      const payload = {
        name: form.name,
        variations: form.variations.filter(v => v.trim()),
        mediaType: form.mediaTab !== "none" ? form.mediaTab : null,
        mediaUrl: form.mediaTab !== "none" && effectiveUrl ? effectiveUrl : null,
        mediaCaption: form.mediaTab !== "none" && form.mediaTab !== "audio" && form.mediaCaption ? form.mediaCaption : null,
      };
      const res = editing
        ? await fetch(`/api/individual/templates/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/individual/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) { setShowForm(false); loadTemplates(); }
      else { const data = await res.json(); alert(data.error || "Erro ao salvar"); }
    } finally { setSaving(false); }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/individual/templates/${id}`, { method: "DELETE" });
    if (res.ok) { setDeleteConfirm(null); loadTemplates(); }
    else { const data = await res.json(); alert(data.error || "Erro ao excluir"); setDeleteConfirm(null); }
  }

  const currentPreviewText = form.variations[previewVariationIdx] || "";

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        <button onClick={openCreate}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: "var(--primary)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Novo Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl p-16 text-center border-2 border-dashed" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--primary-light)" }}>
            <svg className="w-7 h-7" style={{ color: "var(--primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="font-semibold text-base" style={{ color: "var(--text-secondary)" }}>Nenhum template criado</p>
          <p className="text-sm mt-1">Crie templates com múltiplas variações de mensagem</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const vars = (() => {
              try { return JSON.parse(t.variations) as string[]; } catch { return []; }
            })();
            return (
              <div key={t.id} className="rounded-xl p-4" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: "var(--primary-light)" }}>
                    {t.mediaType ? MEDIA_ICONS[t.mediaType] : "💬"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{t.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
                        {vars.length} variação{vars.length !== 1 ? "ões" : ""}
                      </span>
                      {t.mediaType && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                          {MEDIA_TABS.find(m => m.id === t.mediaType)?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mb-2 line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                      {vars[0] || "(sem texto)"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {CONTACT_VARS.map(v => (
                        <code key={v} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>{`{{${v}}}`}</code>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg" style={{ color: "var(--text-secondary)" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {deleteConfirm === t.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteTemplate(t.id)} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor: "var(--danger)" }}>Excluir</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded" style={{ color: "var(--text-muted)" }}>Cancelar</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(t.id)} className="p-1.5 rounded-lg" style={{ color: "var(--danger)" }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Template Form Modal ─────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full shadow-2xl overflow-hidden" style={{ maxWidth: "960px", maxHeight: "92vh", display: "flex", flexDirection: "column", backgroundColor: "var(--card-bg)" }}>

            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                {editing ? "Editar Template" : "Novo Template"}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ color: "var(--text-muted)" }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body — 2 columns */}
            <div className="flex-1 overflow-y-auto">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: "100%" }}>

                {/* ── Left: form ── */}
                <form id="ctpl-form" onSubmit={saveTemplate} className="p-6 space-y-5 overflow-y-auto" style={{ borderRight: "1px solid var(--border)" }}>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Nome do Template</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="Ex: Boas-vindas Individual"
                      className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} required />
                  </div>

                  {/* Variáveis disponíveis */}
                  <div className="rounded-xl p-3" style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: "var(--primary)" }}>Variáveis de contato disponíveis:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {CONTACT_VARS.map(v => (
                        <span key={v} className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ backgroundColor: "var(--card-bg)", color: "var(--primary)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" }}>
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs mt-1.5" style={{ color: "var(--primary)" }}>
                      {CONTACT_VARS.map(v => `{{${v}}} = ${CONTACT_VAR_LABELS[v]}`).join(" · ")}
                    </p>
                  </div>

                  {/* Variations */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        Variações de mensagem
                        <span className="text-xs font-normal ml-2" style={{ color: "var(--text-muted)" }}>
                          (uma aleatória por envio)
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={addVariation}
                        disabled={form.variations.length >= 10}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                        style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}
                      >
                        + Adicionar variação
                      </button>
                    </div>

                    <div className="space-y-3">
                      {form.variations.map((variation, idx) => (
                        <div key={idx} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                          <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: "var(--page-bg)", borderBottom: "1px solid var(--border)" }}>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>Variação {idx + 1}</span>
                              <button
                                type="button"
                                onClick={() => setPreviewVariationIdx(idx)}
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={previewVariationIdx === idx
                                  ? { backgroundColor: "var(--primary)", color: "#fff" }
                                  : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }
                                }
                              >
                                {previewVariationIdx === idx ? "Prévia ativa" : "Ver prévia"}
                              </button>
                            </div>
                            {form.variations.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeVariation(idx)}
                                className="text-xs"
                                style={{ color: "var(--danger)" }}
                              >
                                Remover
                              </button>
                            )}
                          </div>
                          <textarea
                            value={variation}
                            onChange={e => updateVariation(idx, e.target.value)}
                            placeholder={`Olá {{name}}! 👋\n\nEsta é a variação ${idx + 1} da mensagem...`}
                            rows={5}
                            className="w-full px-3 py-2.5 text-sm resize-vertical outline-none"
                            style={{ color: "var(--text-primary)", backgroundColor: "var(--card-bg)", border: "none", fontFamily: "inherit" }}
                          />
                          <div className="px-3 py-1.5 flex items-center justify-between" style={{ borderTop: "1px solid var(--border)", backgroundColor: "var(--page-bg)" }}>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{variation.length} caracteres</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Media */}
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Mídia (opcional)</label>
                    <div className="flex gap-1 flex-wrap mb-3">
                      {MEDIA_TABS.map(t => (
                        <button key={t.id} type="button"
                          onClick={() => { setForm(f => ({ ...f, mediaTab: t.id })); clearMedia(); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={form.mediaTab === t.id ? { backgroundColor: "var(--primary)", color: "#fff" } : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
                          <span>{t.icon}</span>{t.label}
                        </button>
                      ))}
                    </div>

                    {form.mediaTab !== "none" && (
                      <div className="space-y-3">
                        <div className="flex gap-2">
                          {(["file", "url"] as const).map(m => (
                            <button key={m} type="button"
                              onClick={() => { setForm(f => ({ ...f, mediaInputMode: m })); clearMedia(); }}
                              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                              style={form.mediaInputMode === m ? { borderColor: "var(--primary)", color: "var(--primary)", backgroundColor: "var(--primary-light)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}>
                              {m === "file" ? "📁 Arquivo" : "🔗 URL"}
                            </button>
                          ))}
                        </div>

                        {form.mediaInputMode === "file" ? (
                          <div>
                            <input ref={fileRef} type="file"
                              accept={MEDIA_TABS.find(t => t.id === form.mediaTab)?.accept || "*"}
                              onChange={handleFileSelect} className="hidden" id="ctpl-media-file" />
                            <label htmlFor="ctpl-media-file"
                              className="flex flex-col items-center justify-center gap-2 rounded-xl p-5 cursor-pointer border-2 border-dashed transition-colors"
                              style={{ borderColor: form.mediaFile ? "var(--primary)" : "var(--border)", backgroundColor: form.mediaFile ? "var(--primary-light)" : "var(--page-bg)" }}>
                              {form.mediaFile ? (
                                <>
                                  <span className="text-2xl">{MEDIA_TABS.find(t => t.id === form.mediaTab)?.icon}</span>
                                  <span className="text-xs font-medium text-center truncate max-w-full" style={{ color: "var(--primary)" }}>{form.mediaFile.name}</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-2xl opacity-40">{MEDIA_TABS.find(t => t.id === form.mediaTab)?.icon}</span>
                                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Clique para selecionar {form.mediaTab}</span>
                                </>
                              )}
                            </label>
                          </div>
                        ) : (
                          <input value={form.mediaUrl} onChange={e => setForm(f => ({ ...f, mediaUrl: e.target.value }))}
                            placeholder={`URL do ${form.mediaTab} (https://...)`}
                            className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                            style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
                        )}

                        {form.mediaTab !== "audio" && (
                          <div>
                            <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Legenda (opcional)</p>
                            <textarea
                              value={form.mediaCaption}
                              onChange={e => setForm(f => ({ ...f, mediaCaption: e.target.value }))}
                              placeholder="Legenda da mídia..."
                              rows={3}
                              className="w-full text-sm rounded-xl px-3 py-2.5 resize-none outline-none"
                              style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={saving}
                      className="flex-1 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
                      style={{ backgroundColor: "var(--primary)" }}>
                      {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Criar Template"}
                    </button>
                    <button type="button" onClick={() => setShowForm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm border"
                      style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                      Cancelar
                    </button>
                  </div>
                </form>

                {/* ── Right: preview ── */}
                <div className="p-5 overflow-y-auto" style={{ backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-center" style={{ color: "var(--text-muted)" }}>Pré-visualização</p>

                  {/* Variation selector */}
                  {form.variations.length > 1 && (
                    <div className="flex gap-1 flex-wrap mb-3 justify-center">
                      {form.variations.map((_, idx) => (
                        <button key={idx} type="button"
                          onClick={() => setPreviewVariationIdx(idx)}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={previewVariationIdx === idx
                            ? { backgroundColor: "var(--primary)", color: "#fff" }
                            : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }
                          }>
                          V{idx + 1}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Resolved preview */}
                  <div className="rounded-xl p-4 mb-3 text-sm whitespace-pre-wrap" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)", color: "var(--text-primary)", minHeight: 80 }}>
                    {currentPreviewText
                      ? resolvePreview(currentPreviewText, previewVariationIdx)
                      : <span style={{ color: "var(--text-muted)" }}>Digite uma mensagem na variação {previewVariationIdx + 1}</span>
                    }
                  </div>

                  <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                    Usando dados de exemplo: {SAMPLE_CONTACT.name}
                  </p>

                  {/* Show all variations */}
                  {form.variations.length > 1 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Todas as variações:</p>
                      <div className="space-y-2">
                        {form.variations.map((v, idx) => (
                          <div key={idx} className="rounded-lg p-2" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
                            <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>V{idx + 1}: </span>
                            <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{v ? resolvePreview(v, idx).slice(0, 60) : "(vazia)"}...</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
