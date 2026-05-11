"use client";

import { useEffect, useState, useCallback } from "react";

interface Template {
  id: string;
  name: string;
  body: string;
  variables: string;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaCaption: string | null;
  createdAt: string;
  updatedAt: string;
}

const MEDIA_TYPES = [
  { value: "", label: "Sem mídia" },
  { value: "image", label: "Imagem" },
  { value: "video", label: "Vídeo" },
  { value: "audio", label: "Áudio" },
  { value: "document", label: "Documento" },
];

const MEDIA_ICONS: Record<string, string> = { image: "🖼", video: "🎬", audio: "🎵", document: "📎" };

function extractVars(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

interface FormState {
  name: string;
  body: string;
  mediaType: string;
  mediaUrl: string;
  mediaCaption: string;
}

const EMPTY_FORM: FormState = { name: "", body: "", mediaType: "", mediaUrl: "", mediaCaption: "" };

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/campaigns/templates");
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(t: Template) {
    setEditing(t);
    setForm({ name: t.name, body: t.body, mediaType: t.mediaType || "", mediaUrl: t.mediaUrl || "", mediaCaption: t.mediaCaption || "" });
    setShowForm(true);
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { name: form.name, body: form.body, mediaType: form.mediaType || null, mediaUrl: form.mediaUrl || null, mediaCaption: form.mediaCaption || null };
      const res = editing
        ? await fetch(`/api/campaigns/templates/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/campaigns/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) {
        setShowForm(false);
        loadTemplates();
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao salvar");
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/campaigns/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteConfirm(null);
      loadTemplates();
    } else {
      const data = await res.json();
      alert(data.error || "Erro ao excluir");
      setDeleteConfirm(null);
    }
  }

  const liveVars = extractVars(form.body);

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor: "var(--primary)" }}
        >
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
          <p className="text-sm mt-1">Crie templates reutilizáveis com variáveis e mídia</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const vars = JSON.parse(t.variables || "[]") as string[];
            return (
              <div key={t.id} className="rounded-xl p-4" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor: "var(--primary-light)" }}>
                    {t.mediaType ? MEDIA_ICONS[t.mediaType] : "💬"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{t.name}</h3>
                      {t.mediaType && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
                          {MEDIA_TYPES.find((m) => m.value === t.mediaType)?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mb-2 line-clamp-2" style={{ color: "var(--text-secondary)" }}>{t.body}</p>
                    {vars.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {vars.map((v) => (
                          <code key={v} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
                            {`{{${v}}}`}
                          </code>
                        ))}
                      </div>
                    )}
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

      {/* Template Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-5 flex items-center justify-between sticky top-0 bg-white" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                {editing ? "Editar Template" : "Novo Template"}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={saveTemplate} className="p-6 space-y-5">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Nome do Template</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Black Friday 2024"
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  required
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Mensagem</label>
                <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                  Use {"{{variavel}}"} para inserir variáveis dinâmicas. {"{{group_name}}"} é preenchido automaticamente com o nome do grupo.
                </p>
                <textarea
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  placeholder={"Olá {{group_name}}! 🎉\n\nTemos uma promoção especial para vocês..."}
                  rows={6}
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 font-mono resize-y"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  required
                />
                {liveVars.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>Variáveis detectadas:</span>
                    {liveVars.map((v) => (
                      <code key={v} className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: v === "group_name" ? "var(--primary-light)" : "var(--border)", color: v === "group_name" ? "var(--primary)" : "var(--text-secondary)" }}>
                        {`{{${v}}}`}{v === "group_name" && " ✓ auto"}
                      </code>
                    ))}
                  </div>
                )}
              </div>

              {/* Media */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Mídia (opcional)</label>
                <select
                  value={form.mediaType}
                  onChange={(e) => setForm({ ...form, mediaType: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
                >
                  {MEDIA_TYPES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>

                {form.mediaType && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>URL da mídia</label>
                      <input
                        value={form.mediaUrl}
                        onChange={(e) => setForm({ ...form, mediaUrl: e.target.value })}
                        placeholder="https://exemplo.com/imagem.jpg"
                        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                    </div>
                    {form.mediaType !== "audio" && (
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Legenda (opcional)</label>
                        <input
                          value={form.mediaCaption}
                          onChange={(e) => setForm({ ...form, mediaCaption: e.target.value })}
                          placeholder="Legenda da mídia..."
                          className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Criar Template"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm border"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
