"use client";

import { useState } from "react";

interface ChangeItem { type: "feature" | "fix" | "improvement" | "breaking"; text: string; }
interface ChangelogEntry {
  id: string;
  version: string;
  title: string;
  description: string | null;
  changes: ChangeItem[];
  deployedAt: string;
  createdAt: string;
  updatedAt: string;
}

const TYPE_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  feature:     { label: "Nova Funcionalidade", color: "#16a34a", bg: "color-mix(in srgb,#16a34a 12%,transparent)", icon: "✨" },
  fix:         { label: "Correção de Bug",      color: "#dc2626", bg: "color-mix(in srgb,#dc2626 12%,transparent)", icon: "🔧" },
  improvement: { label: "Melhoria",             color: "#2563eb", bg: "color-mix(in srgb,#2563eb 12%,transparent)", icon: "⚡" },
  breaking:    { label: "Breaking Change",      color: "#d97706", bg: "color-mix(in srgb,#d97706 12%,transparent)", icon: "⚠️" },
};

function Badge({ type }: { type: string }) {
  const m = TYPE_META[type] || TYPE_META.improvement;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: m.bg, color: m.color }}>
      <span>{m.icon}</span>{m.label}
    </span>
  );
}

interface Props { initialEntries: ChangelogEntry[]; }

export default function ChangelogClient({ initialEntries }: Props) {
  const [entries, setEntries] = useState<ChangelogEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Form state
  const [fVersion, setFVersion]         = useState("");
  const [fTitle, setFTitle]             = useState("");
  const [fDescription, setFDescription] = useState("");
  const [fDeployedAt, setFDeployedAt]   = useState(new Date().toISOString().slice(0,16));
  const [fChanges, setFChanges]         = useState<ChangeItem[]>([{ type: "feature", text: "" }]);

  function resetForm() {
    setFVersion(""); setFTitle(""); setFDescription("");
    setFDeployedAt(new Date().toISOString().slice(0,16));
    setFChanges([{ type: "feature", text: "" }]);
    setEditId(null); setShowForm(false); setError("");
  }

  function openEdit(entry: ChangelogEntry) {
    setFVersion(entry.version);
    setFTitle(entry.title);
    setFDescription(entry.description || "");
    setFDeployedAt(new Date(entry.deployedAt).toISOString().slice(0,16));
    setFChanges(entry.changes.length > 0 ? entry.changes : [{ type: "feature", text: "" }]);
    setEditId(entry.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!fVersion.trim() || !fTitle.trim()) { setError("Versão e título são obrigatórios."); return; }
    const validChanges = fChanges.filter(c => c.text.trim());
    setSaving(true); setError("");
    try {
      const url = editId ? `/api/changelog/${editId}` : "/api/changelog";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: fVersion, title: fTitle, description: fDescription || null, changes: validChanges, deployedAt: new Date(fDeployedAt).toISOString() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erro ao salvar"); setSaving(false); return; }
      if (editId) {
        setEntries(prev => prev.map(e => e.id === editId ? data : e));
      } else {
        setEntries(prev => [data, ...prev]);
      }
      resetForm();
    } catch { setError("Erro de rede"); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta entrada do changelog?")) return;
    setDeleting(id);
    await fetch(`/api/changelog/${id}`, { method: "DELETE" });
    setEntries(prev => prev.filter(e => e.id !== id));
    setDeleting(null);
  }

  function addChange() { setFChanges(prev => [...prev, { type: "feature", text: "" }]); }
  function removeChange(i: number) { setFChanges(prev => prev.filter((_,idx) => idx !== i)); }
  function updateChange(i: number, field: keyof ChangeItem, val: string) {
    setFChanges(prev => prev.map((c,idx) => idx === i ? { ...c, [field]: val } : c));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color:"var(--text-primary)" }}>Versionamento do Sistema</h1>
          <p className="text-sm mt-1" style={{ color:"var(--text-muted)" }}>Histórico completo de deploys, correções e funcionalidades</p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
            style={{ backgroundColor:"var(--primary)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            Nova entrada
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="rounded-2xl shadow-sm p-6 mb-6" style={{ backgroundColor:"var(--card-bg)", border:"1px solid var(--border)" }}>
          <h2 className="font-semibold text-base mb-4" style={{ color:"var(--text-primary)" }}>
            {editId ? "Editar entrada" : "Nova entrada no changelog"}
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color:"var(--text-muted)" }}>Versão</label>
              <input value={fVersion} onChange={e=>setFVersion(e.target.value)} placeholder="v1.2.0"
                className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }}/>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color:"var(--text-muted)" }}>Data do deploy</label>
              <input type="datetime-local" value={fDeployedAt} onChange={e=>setFDeployedAt(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg outline-none"
                style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }}/>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color:"var(--text-muted)" }}>Título do deploy</label>
            <input value={fTitle} onChange={e=>setFTitle(e.target.value)} placeholder="Ex: Melhorias de performance e novos filtros"
              className="w-full text-sm px-3 py-2 rounded-lg outline-none"
              style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }}/>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold mb-1.5" style={{ color:"var(--text-muted)" }}>Descrição (opcional)</label>
            <textarea value={fDescription} onChange={e=>setFDescription(e.target.value)} rows={2} placeholder="Resumo geral desta versão..."
              className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
              style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }}/>
          </div>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color:"var(--text-muted)" }}>Mudanças</label>
              <button onClick={addChange} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor:"var(--primary-light)", color:"var(--primary)" }}>+ Adicionar</button>
            </div>
            <div className="space-y-2">
              {fChanges.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={c.type} onChange={e=>updateChange(i,"type",e.target.value)}
                    className="text-xs px-2 py-2 rounded-lg outline-none flex-shrink-0"
                    style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--card-bg)", width:160 }}>
                    <option value="feature">✨ Nova Funcionalidade</option>
                    <option value="fix">🔧 Correção de Bug</option>
                    <option value="improvement">⚡ Melhoria</option>
                    <option value="breaking">⚠️ Breaking Change</option>
                  </select>
                  <input value={c.text} onChange={e=>updateChange(i,"text",e.target.value)} placeholder="Descreva a mudança..."
                    className="flex-1 text-sm px-3 py-2 rounded-lg outline-none"
                    style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }}/>
                  {fChanges.length > 1 && (
                    <button onClick={()=>removeChange(i)} className="w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0" style={{ color:"var(--danger)", backgroundColor:"color-mix(in srgb,var(--danger) 10%,transparent)" }}>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {error && <p className="text-xs mb-3" style={{ color:"var(--danger)" }}>{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor:"var(--primary)" }}>
              {saving ? "Salvando..." : (editId ? "Salvar alterações" : "Criar entrada")}
            </button>
            <button onClick={resetForm} className="px-5 py-2 rounded-xl text-sm font-medium"
              style={{ border:"1px solid var(--border)", color:"var(--text-muted)" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm" style={{ color:"var(--text-muted)" }}>Nenhuma entrada no changelog ainda.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5" style={{ backgroundColor:"var(--border)" }}/>
          <div className="space-y-6">
            {entries.map((entry, idx) => (
              <div key={entry.id} className="relative flex gap-6">
                {/* Timeline dot */}
                <div className="relative z-10 flex-shrink-0">
                  <div className="w-10 h-10 rounded-full border-4 flex items-center justify-center text-sm font-bold"
                    style={{
                      backgroundColor: idx === 0 ? "var(--primary)" : "var(--card-bg)",
                      borderColor: idx === 0 ? "var(--primary)" : "var(--border)",
                      color: idx === 0 ? "#fff" : "var(--text-muted)",
                    }}>
                    {idx === 0 ? "★" : (entries.length - idx)}
                  </div>
                </div>

                {/* Card */}
                <div className="flex-1 rounded-2xl shadow-sm overflow-hidden mb-1"
                  style={{ backgroundColor:"var(--card-bg)", border:"1px solid var(--border)" }}>
                  <div className="px-5 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white"
                            style={{ backgroundColor: idx === 0 ? "var(--primary)" : "var(--text-muted)" }}>
                            {entry.version}
                          </span>
                          {idx === 0 && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor:"color-mix(in srgb,#16a34a 12%,transparent)", color:"#16a34a" }}>
                              ● Atual
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-base mt-1" style={{ color:"var(--text-primary)" }}>{entry.title}</h3>
                        {entry.description && (
                          <p className="text-sm mt-1" style={{ color:"var(--text-secondary)" }}>{entry.description}</p>
                        )}
                        <p className="text-xs mt-2" style={{ color:"var(--text-muted)" }}>
                          Publicado em {new Date(entry.deployedAt).toLocaleString("pt-BR", { day:"2-digit", month:"long", year:"numeric", hour:"2-digit", minute:"2-digit" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(entry)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                          style={{ backgroundColor:"var(--primary-light)", color:"var(--primary)" }}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                        </button>
                        <button onClick={() => handleDelete(entry.id)} disabled={deleting === entry.id}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50"
                          style={{ backgroundColor:"color-mix(in srgb,var(--danger) 10%,transparent)", color:"var(--danger)" }}>
                          {deleting === entry.id
                            ? <div className="w-3.5 h-3.5 border-2 rounded-full animate-spin" style={{ borderColor:"var(--danger)", borderTopColor:"transparent" }}/>
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>}
                        </button>
                      </div>
                    </div>
                  </div>
                  {entry.changes.length > 0 && (
                    <div className="px-5 py-4">
                      <div className="space-y-2">
                        {entry.changes.map((c, ci) => {
                          const m = TYPE_META[c.type] || TYPE_META.improvement;
                          return (
                            <div key={ci} className="flex items-start gap-3">
                              <span className="text-sm flex-shrink-0 mt-0.5">{m.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm" style={{ color:"var(--text-primary)" }}>{c.text}</p>
                              </div>
                              <Badge type={c.type} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
