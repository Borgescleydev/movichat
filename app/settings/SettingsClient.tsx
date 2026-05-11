"use client";

import { useEffect, useState } from "react";
import ProvidersSettings from "@/components/settings/ProvidersSettings";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import CronSettings from "@/components/settings/CronSettings";

interface Column {
  id: string;
  name: string;
  color: string;
  order: number;
  isDefault: boolean;
}

interface User {
  id: string;
  name: string;
  username: string;
  role: string;
  active: boolean;
}

interface WhatsAppSession {
  id: string;
  status: string;
  qrCode?: string;
  phone?: string;
}

type Tab = "profile" | "pipeline" | "users" | "providers" | "appearance" | "whatsapp" | "cron";

export default function SettingsClient({ userRole }: { userRole: string }) {
  const [tab, setTab] = useState<Tab>("profile");
  const isAdmin = ["superadmin", "admin"].includes(userRole);

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-8 flex-wrap">
        {[
          { key: "profile", label: "Meu Perfil" },
          { key: "pipeline", label: "Pipeline" },
          ...(isAdmin ? [{ key: "users", label: "Usuários" }] : []),
          { key: "providers", label: "Provedores API" },
          { key: "appearance", label: "Aparência" },
          { key: "whatsapp", label: "WhatsApp (legado)" },
          ...(isAdmin ? [{ key: "cron", label: "Cron Job" }] : []),
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as Tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile" && <ProfileSettings />}
      {tab === "pipeline" && <PipelineSettings userRole={userRole} />}
      {tab === "users" && isAdmin && <UsersSettings userRole={userRole} />}
      {tab === "providers" && <ProvidersSettings />}
      {tab === "appearance" && <AppearanceSettings />}
      {tab === "whatsapp" && <WhatsAppSettings />}
      {tab === "cron" && isAdmin && <CronSettings />}
    </div>
  );
}

function ProfileSettings() {
  const [profile, setProfile] = useState({ id: "", name: "", username: "", role: "" });
  const [form, setForm] = useState({ name: "", username: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      setProfile({ id: d.userId, name: d.name, username: d.username, role: d.role });
      setForm((f) => ({ ...f, name: d.name, username: d.username }));
      setLoading(false);
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.password && form.password !== form.confirmPassword) {
      setMsg({ type: "err", text: "As senhas não coincidem" });
      return;
    }
    if (form.password && form.password.length < 6) {
      setMsg({ type: "err", text: "A senha deve ter pelo menos 6 caracteres" });
      return;
    }
    setSaving(true);
    setMsg(null);
    const body: Record<string, string> = { name: form.name, username: form.username };
    if (form.password) body.password = form.password;
    const res = await fetch(`/api/users/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setProfile((p) => ({ ...p, name: data.name, username: data.username }));
      setForm((f) => ({ ...f, password: "", confirmPassword: "" }));
      setMsg({ type: "ok", text: "Perfil atualizado com sucesso!" });
    } else {
      setMsg({ type: "err", text: data.error || "Erro ao salvar" });
    }
    setSaving(false);
  }

  const ROLE_LABELS: Record<string, string> = { superadmin: "Super Admin", admin: "Administrador", agent: "Agente" };

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-lg space-y-6">
      {/* Avatar card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-2xl font-bold text-green-700 flex-shrink-0">
          {profile.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">{profile.name}</p>
          <p className="text-sm text-gray-500">@{profile.username}</p>
          <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
            {ROLE_LABELS[profile.role] || profile.role}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-5">Editar Perfil</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome completo</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome de usuário</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-3">Alterar senha <span className="text-gray-400 font-normal">(deixe em branco para manter a atual)</span></p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nova senha</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar nova senha</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  placeholder="Repita a senha"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {msg && (
            <div className={`text-sm px-4 py-3 rounded-lg ${msg.type === "ok" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
              {msg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-60 transition-colors"
          >
            {saving ? "Salvando..." : "Salvar Alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PipelineSettings({ userRole }: { userRole: string }) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const isAdmin = ["superadmin", "admin"].includes(userRole);

  useEffect(() => { loadColumns(); }, []);

  async function loadColumns() {
    const res = await fetch("/api/pipeline");
    const data = await res.json();
    setColumns(data);
  }

  function startEdit(col: Column) {
    setEditing(col.id);
    setEditName(col.name);
    setEditColor(col.color);
  }

  async function saveEdit(id: string) {
    await fetch(`/api/pipeline/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, color: editColor }),
    });
    setEditing(null);
    loadColumns();
  }

  async function deleteColumn(id: string) {
    if (!confirm("Excluir coluna? Os contatos serão movidos para a coluna padrão.")) return;
    await fetch(`/api/pipeline/${id}`, { method: "DELETE" });
    loadColumns();
  }

  async function moveColumn(id: string, direction: "up" | "down") {
    const idx = columns.findIndex((c) => c.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= columns.length) return;

    const updated = [...columns];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];

    await Promise.all([
      fetch(`/api/pipeline/${updated[idx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: idx }),
      }),
      fetch(`/api/pipeline/${updated[swapIdx].id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: swapIdx }),
      }),
    ]);
    loadColumns();
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Colunas do Pipeline</h2>
      <div className="space-y-3">
        {columns.map((col, idx) => (
          <div key={col.id} className="bg-white border border-gray-200 rounded-xl p-4">
            {editing === col.id ? (
              <div className="flex items-center gap-3">
                <input
                  value={editColor}
                  type="color"
                  onChange={(e) => setEditColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0"
                />
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <button onClick={() => saveEdit(col.id)} className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-700">
                  Salvar
                </button>
                <button onClick={() => setEditing(null)} className="border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                <span className="flex-1 text-sm font-medium text-gray-900">{col.name}</span>
                {col.isDefault && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">padrão</span>
                )}
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => moveColumn(col.id, "up")}
                      disabled={idx === 0}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      onClick={() => moveColumn(col.id, "down")}
                      disabled={idx === columns.length - 1}
                      className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    <button onClick={() => startEdit(col)} className="p-1 text-blue-400 hover:text-blue-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {!col.isDefault && (
                      <button onClick={() => deleteColumn(col.id)} className="p-1 text-red-400 hover:text-red-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        A coluna padrão recebe todos os novos contatos do WhatsApp. Pode ser renomeada mas não excluída.
      </p>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = { superadmin: "Super Admin", admin: "Administrador", agent: "Agente" };
const ROLE_COLORS: Record<string, string> = { superadmin: "bg-purple-100 text-purple-700", admin: "bg-blue-100 text-blue-700", agent: "bg-gray-100 text-gray-600" };

function UsersSettings({ userRole }: { userRole: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [newForm, setNewForm] = useState({ name: "", username: "", password: "", role: "agent" });
  const [editForm, setEditForm] = useState({ name: "", username: "", password: "", role: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const isSuperAdmin = userRole === "superadmin";
  const isAdmin = ["superadmin", "admin"].includes(userRole);

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newForm),
    });
    const data = await res.json();
    if (res.ok) {
      setShowNew(false);
      setNewForm({ name: "", username: "", password: "", role: "agent" });
      loadUsers();
    } else {
      setErr(data.error || "Erro ao criar");
    }
    setSaving(false);
  }

  function openEdit(u: User) {
    setEditUser(u);
    setEditForm({ name: u.name, username: u.username, password: "", role: u.role });
    setErr("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true); setErr("");
    const body: Record<string, string> = { name: editForm.name, username: editForm.username, role: editForm.role };
    if (editForm.password.trim()) body.password = editForm.password.trim();
    const res = await fetch(`/api/users/${editUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setEditUser(null);
      loadUsers();
    } else {
      setErr(data.error || "Erro ao salvar");
    }
    setSaving(false);
  }

  async function toggleActive(u: User) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    loadUsers();
  }

  async function deleteUser(id: string) {
    if (!confirm("Excluir usuário permanentemente?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (res.ok) loadUsers();
    else { const d = await res.json(); alert(d.error || "Erro ao excluir"); }
  }

  const ModalForm = ({ title, onSubmit, onClose, form, setForm, showRole, isCreate }: {
    title: string;
    onSubmit: (e: React.FormEvent) => void;
    onClose: () => void;
    form: { name: string; username: string; password: string; role: string };
    setForm: (f: typeof form) => void;
    showRole: boolean;
    isCreate: boolean;
  }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 py-5 flex items-center justify-between border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome completo</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Nome de usuário</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">@</span>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g, "") })}
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {isCreate ? "Senha" : "Nova senha"}
              {!isCreate && <span className="text-gray-400 font-normal ml-1">(deixe em branco para manter)</span>}
            </label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={isCreate ? "Mínimo 6 caracteres" : "••••••••"}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              required={isCreate} minLength={isCreate ? 6 : undefined} />
          </div>
          {showRole && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Papel</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                <option value="agent">Agente</option>
                <option value="admin">Administrador</option>
                {isSuperAdmin && <option value="superadmin">Super Admin</option>}
              </select>
            </div>
          )}
          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 disabled:opacity-60">
              {saving ? "Salvando..." : isCreate ? "Criar Usuário" : "Salvar Alterações"}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold text-gray-900">Usuários <span className="text-sm font-normal text-gray-400">({users.length})</span></h2>
        <button onClick={() => { setShowNew(true); setErr(""); }}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Novo Usuário
        </button>
      </div>

      {showNew && (
        <ModalForm title="Novo Usuário" onSubmit={createUser} onClose={() => setShowNew(false)}
          form={newForm} setForm={setNewForm} showRole={isAdmin} isCreate={true} />
      )}
      {editUser && (
        <ModalForm title={`Editar: ${editUser.name}`} onSubmit={saveEdit} onClose={() => setEditUser(null)}
          form={editForm} setForm={setEditForm} showRole={isAdmin} isCreate={false} />
      )}

      <div className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 flex-shrink-0">
                {u.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role] || "bg-gray-100 text-gray-600"}`}>
                    {ROLE_LABELS[u.role] || u.role}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${u.active ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                    {u.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">@{u.username}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Edit */}
                <button onClick={() => openEdit(u)} title="Editar usuário"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
                {/* Toggle active */}
                <button onClick={() => toggleActive(u)} title={u.active ? "Desativar" : "Ativar"}
                  className={`p-1.5 rounded-lg transition-colors ${u.active ? "text-gray-400 hover:text-orange-500 hover:bg-orange-50" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}>
                  {u.active
                    ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  }
                </button>
                {/* Delete */}
                {isSuperAdmin && u.role !== "superadmin" && (
                  <button onClick={() => deleteUser(u.id)} title="Excluir usuário"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WhatsAppSettings() {
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession();
    const interval = setInterval(loadSession, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadSession() {
    const res = await fetch("/api/whatsapp");
    const data = await res.json();
    setSession(data);
    setLoading(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Conexão WhatsApp</h2>

      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-3 h-3 rounded-full ${
            session?.status === "connected" ? "bg-green-500" : session?.status === "connecting" ? "bg-yellow-500 animate-pulse" : "bg-red-500"
          }`} />
          <span className="text-sm font-medium text-gray-900">
            {session?.status === "connected" ? "Conectado" : session?.status === "connecting" ? "Aguardando QR Code..." : "Desconectado"}
          </span>
          {session?.phone && <span className="text-sm text-gray-500">({session.phone})</span>}
        </div>

        {session?.status === "connecting" && session.qrCode && (
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600 mb-4">Escaneie o QR Code com seu WhatsApp:</p>
            <div className="inline-block border-4 border-gray-100 rounded-xl overflow-hidden">
              <img src={session.qrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Abra o WhatsApp → Aparelhos Conectados → Conectar Aparelho
            </p>
          </div>
        )}

        {session?.status === "connected" && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-700">
            WhatsApp conectado! Novos contatos que enviarem mensagens serão automaticamente adicionados ao pipeline.
          </div>
        )}

        {session?.status === "disconnected" && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
            <p className="font-medium mb-2">Para conectar o WhatsApp:</p>
            <ol className="list-decimal list-inside space-y-1 text-gray-500">
              <li>Configure e inicie o serviço WhatsApp Bridge</li>
              <li>O QR Code aparecerá automaticamente aqui</li>
              <li>Escaneie com o WhatsApp do seu celular</li>
            </ol>
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-xs text-yellow-700">
                <strong>Webhook URL:</strong> <code className="bg-yellow-100 px-1 rounded">/api/whatsapp/webhook</code><br />
                Configure esta URL no seu serviço de integração WhatsApp (Evolution API, Z-API, etc.)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
