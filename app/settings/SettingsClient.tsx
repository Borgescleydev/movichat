"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProvidersSettings from "@/components/settings/ProvidersSettings";
import AppearanceSettings from "@/components/settings/AppearanceSettings";
import CronSettings from "@/components/settings/CronSettings";
import SessionsSettings from "@/components/settings/SessionsSettings";

// ─── Types ───────────────────────────────────────────────────
interface Column { id: string; name: string; color: string; order: number; isDefault: boolean; }

interface UserPerms { conversations?: boolean; campaigns?: boolean; individual?: boolean; contacts?: boolean; pipeline?: boolean; providers?: boolean; reports?: boolean; }
interface User {
  id: string; name: string; username: string; role: string; active: boolean;
  avatar?: string | null; permissions?: UserPerms;
}
interface UserResources {
  instances: { id: string; label: string|null; instanceName: string; status: string; phone?: string|null; provider: { name: string; type: string } }[];
  contactCount: number;
  campaigns: { id: string; name: string; status: string; startAt: string; instance: { label: string|null; instanceName: string } }[];
}

interface WhatsAppSession { id: string; status: string; qrCode?: string; phone?: string; }

type Tab = "profile" | "pipeline" | "users" | "resources" | "providers" | "appearance" | "whatsapp" | "cron" | "sessions";

const PERM_GROUPS = [
  { key: "conversations", label: "Conversas",          icon: "💬", desc: "Acesso à área de conversas" },
  { key: "campaigns",     label: "Campanhas",           icon: "📢", desc: "Criar e gerenciar campanhas" },
  { key: "individual",    label: "Disparo Individual",  icon: "👤", desc: "Criar e gerenciar disparos para contatos individuais" },
  { key: "contacts",      label: "Contatos",            icon: "👥", desc: "Gerenciar contatos" },
  { key: "pipeline",      label: "Pipeline",            icon: "📊", desc: "Visualizar e mover pipeline" },
  { key: "providers",     label: "Provedores",          icon: "🔌", desc: "Gerenciar instâncias WhatsApp" },
  { key: "reports",       label: "Relatórios",          icon: "📈", desc: "Visualizar dashboard e relatórios" },
] as const;

const ROLE_LABELS: Record<string, string> = { superadmin: "Super Admin", admin: "Administrador", agent: "Agente" };
const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  superadmin: { bg: "color-mix(in srgb, #8b5cf6 15%, transparent)", text: "#7c3aed" },
  admin:      { bg: "color-mix(in srgb, #3b82f6 15%, transparent)", text: "#2563eb" },
  agent:      { bg: "var(--border)",                                  text: "var(--text-muted)" },
};

// ─── Avatar helpers ───────────────────────────────────────────
const AV_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#22c55e","#10b981","#06b6d4","#3b82f6","#eab308"];
function avColor(n: string) { let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))>>>0; return AV_COLORS[h%AV_COLORS.length]; }

function UserAvatar({ name, avatar, size = 40 }: { name: string; avatar?: string | null; size?: number }) {
  if (avatar) return <img src={avatar} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  const ini = name.replace(/[^a-zA-ZÀ-ÿ\s]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("") || name.charAt(0).toUpperCase();
  return <div style={{ width:size,height:size,borderRadius:"50%",flexShrink:0,backgroundColor:avColor(name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:"#fff",userSelect:"none" }}>{ini}</div>;
}

// Resize image to square via canvas and return base64
function resizeImage(file: File, maxPx = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const s = Math.min(img.width, img.height);
        canvas.width = maxPx; canvas.height = maxPx;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, maxPx, maxPx);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Main ─────────────────────────────────────────────────────
export default function SettingsClient({ userRole }: { userRole: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialTab = (searchParams.get("tab") as Tab) || "profile";
  const [tab, setTab] = useState<Tab>(initialTab);
  const isAdmin = ["superadmin", "admin"].includes(userRole);
  const isSuperAdmin = userRole === "superadmin";

  function goTab(t: Tab) {
    setTab(t);
    router.replace(`/settings?tab=${t}`, { scroll: false });
  }

  const tabs = [
    { key: "profile",    label: "Meu Perfil" },
    { key: "pipeline",   label: "Pipeline" },
    ...(isAdmin   ? [{ key: "users",     label: "Usuários" }]   : []),
    ...(isSuperAdmin ? [{ key: "resources", label: "Recursos" }] : []),
    { key: "providers",  label: "Provedores API" },
    { key: "appearance", label: "Aparência" },
    { key: "whatsapp",   label: "WhatsApp (legado)" },
    ...(isAdmin ? [{ key: "cron", label: "Cron Job" }] : []),
    { key: "sessions", label: "Sessões" },
  ] as { key: Tab; label: string }[];

  return (
    <div>
      <div className="flex gap-1 p-1 rounded-xl w-fit mb-8 flex-wrap" style={{ backgroundColor: "var(--border)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => goTab(t.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={tab === t.key
              ? { backgroundColor: "var(--card-bg)", color: "var(--text-primary)", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
              : { color: "var(--text-muted)", backgroundColor: "transparent" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "profile"    && <ProfileSettings />}
      {tab === "pipeline"   && <PipelineSettings userRole={userRole} />}
      {tab === "users"      && isAdmin      && <UsersSettings userRole={userRole} />}
      {tab === "resources"  && isSuperAdmin && <ResourcesSettings />}
      {tab === "providers"  && <ProvidersSettings />}
      {tab === "appearance" && <AppearanceSettings />}
      {tab === "whatsapp"   && <WhatsAppSettings />}
      {tab === "cron"       && isAdmin      && <CronSettings />}
      {tab === "sessions"   && <SessionsSettings userRole={userRole} />}
    </div>
  );
}

// ─── Profile Settings ──────────────────────────────────────────
function ProfileSettings() {
  const [profile, setProfile] = useState({ id: "", name: "", username: "", role: "", avatar: null as string | null });
  const [form, setForm] = useState({ name: "", username: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      setProfile({ id: d.userId, name: d.name, username: d.username, role: d.role, avatar: d.avatar ?? null });
      setForm(f => ({ ...f, name: d.name, username: d.username }));
      setLoading(false);
    });
  }, []);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const base64 = await resizeImage(file, 160);
      const res = await fetch(`/api/users/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: base64 }),
      });
      if (res.ok) setProfile(p => ({ ...p, avatar: base64 }));
    } finally {
      setUploadingAvatar(false);
      e.target.value = "";
    }
  }

  async function removeAvatar() {
    const res = await fetch(`/api/users/${profile.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar: null }),
    });
    if (res.ok) setProfile(p => ({ ...p, avatar: null }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (form.password && form.password !== form.confirmPassword) { setMsg({ type: "err", text: "As senhas não coincidem" }); return; }
    if (form.password && form.password.length < 6) { setMsg({ type: "err", text: "A senha deve ter pelo menos 6 caracteres" }); return; }
    setSaving(true); setMsg(null);
    const body: Record<string, string> = { name: form.name, username: form.username };
    if (form.password) body.password = form.password;
    const res = await fetch(`/api/users/${profile.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      setProfile(p => ({ ...p, name: data.name, username: data.username }));
      setForm(f => ({ ...f, password: "", confirmPassword: "" }));
      setMsg({ type: "ok", text: "Perfil atualizado com sucesso!" });
    } else {
      setMsg({ type: "err", text: data.error || "Erro ao salvar" });
    }
    setSaving(false);
  }

  if (loading) return <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} /></div>;

  return (
    <div className="max-w-lg space-y-6">
      {/* Avatar card */}
      <div className="rounded-2xl p-6 flex items-center gap-5" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
        <div className="relative flex-shrink-0 group">
          <UserAvatar name={profile.name} avatar={profile.avatar} size={72} />
          <button
            onClick={() => avatarRef.current?.click()}
            className="absolute inset-0 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            title="Alterar foto"
          >
            {uploadingAvatar
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            }
          </button>
          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{profile.name}</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>@{profile.username}</p>
          <span className="inline-block mt-1.5 text-xs px-2.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: ROLE_COLORS[profile.role]?.bg ?? "var(--border)", color: ROLE_COLORS[profile.role]?.text ?? "var(--text-muted)" }}>
            {ROLE_LABELS[profile.role] || profile.role}
          </span>
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          <button onClick={() => avatarRef.current?.click()}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: "var(--primary)", color: "var(--primary)" }}>
            Alterar foto
          </button>
          {profile.avatar && (
            <button onClick={removeAvatar}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              Remover foto
            </button>
          )}
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-2xl p-6" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
        <h2 className="text-base font-semibold mb-5" style={{ color: "var(--text-primary)" }}>Editar Perfil</h2>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Nome completo</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>Nome de usuário</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }}>@</span>
              <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s/g,"") })}
                className="w-full border rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none focus:ring-2"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} required />
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
            <p className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
              Alterar senha <span className="font-normal" style={{ color: "var(--text-muted)" }}>(deixe em branco para manter)</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Nova senha</label>
                <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Confirmar senha</label>
                <input type="password" value={form.confirmPassword} onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                  placeholder="Repita a senha"
                  className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
              </div>
            </div>
          </div>

          {msg && (
            <div className="text-sm px-4 py-3 rounded-xl" style={{
              backgroundColor: msg.type === "ok" ? "color-mix(in srgb, var(--success) 12%, transparent)" : "color-mix(in srgb, var(--danger) 10%, transparent)",
              color: msg.type === "ok" ? "var(--success)" : "var(--danger)",
              border: `1px solid ${msg.type === "ok" ? "color-mix(in srgb, var(--success) 30%, transparent)" : "color-mix(in srgb, var(--danger) 25%, transparent)"}`,
            }}>
              {msg.text}
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 transition-colors"
            style={{ backgroundColor: "var(--primary)" }}>
            {saving ? "Salvando..." : "Salvar Alterações"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Pipeline Settings ─────────────────────────────────────────
function PipelineSettings({ userRole }: { userRole: string }) {
  const [columns, setColumns] = useState<Column[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const isAdmin = ["superadmin","admin"].includes(userRole);

  useEffect(() => { loadColumns(); }, []);

  async function loadColumns() {
    const res = await fetch("/api/pipeline");
    if (res.ok) setColumns(await res.json());
  }
  function startEdit(col: Column) { setEditing(col.id); setEditName(col.name); setEditColor(col.color); }
  async function saveEdit(id: string) {
    await fetch(`/api/pipeline/${id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ name: editName, color: editColor }) });
    setEditing(null); loadColumns();
  }
  async function deleteColumn(id: string) {
    if (!confirm("Excluir coluna? Os contatos serão movidos para a coluna padrão.")) return;
    await fetch(`/api/pipeline/${id}`, { method:"DELETE" }); loadColumns();
  }
  async function moveColumn(id: string, dir: "up"|"down") {
    const idx = columns.findIndex(c=>c.id===id);
    const si = dir==="up"?idx-1:idx+1;
    if (si<0||si>=columns.length) return;
    const u=[...columns]; [u[idx],u[si]]=[u[si],u[idx]];
    await Promise.all([
      fetch(`/api/pipeline/${u[idx].id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:idx})}),
      fetch(`/api/pipeline/${u[si].id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({order:si})}),
    ]); loadColumns();
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-lg font-semibold mb-4" style={{ color:"var(--text-primary)" }}>Colunas do Pipeline</h2>
      <div className="space-y-3">
        {columns.map((col, idx) => (
          <div key={col.id} className="rounded-xl p-4" style={{ backgroundColor:"var(--card-bg)", border:"1px solid var(--border)" }}>
            {editing===col.id ? (
              <div className="flex items-center gap-3">
                <input type="color" value={editColor} onChange={e=>setEditColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                <input value={editName} onChange={e=>setEditName(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ borderColor:"var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }} />
                <button onClick={()=>saveEdit(col.id)} className="text-white px-3 py-2 rounded-lg text-sm" style={{ backgroundColor:"var(--primary)" }}>Salvar</button>
                <button onClick={()=>setEditing(null)} className="border px-3 py-2 rounded-lg text-sm" style={{ borderColor:"var(--border)", color:"var(--text-secondary)" }}>Cancelar</button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor:col.color }} />
                <span className="flex-1 text-sm font-medium" style={{ color:"var(--text-primary)" }}>{col.name}</span>
                {col.isDefault && <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor:"var(--primary-light)", color:"var(--primary)" }}>padrão</span>}
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button onClick={()=>moveColumn(col.id,"up")} disabled={idx===0} className="p-1 disabled:opacity-30" style={{ color:"var(--text-muted)" }}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7"/></svg></button>
                    <button onClick={()=>moveColumn(col.id,"down")} disabled={idx===columns.length-1} className="p-1 disabled:opacity-30" style={{ color:"var(--text-muted)" }}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg></button>
                    <button onClick={()=>startEdit(col)} className="p-1" style={{ color:"var(--primary)" }}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
                    {!col.isDefault && <button onClick={()=>deleteColumn(col.id)} className="p-1" style={{ color:"var(--danger)" }}><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs mt-3" style={{ color:"var(--text-muted)" }}>A coluna padrão recebe todos os novos contatos do WhatsApp. Pode ser renomeada mas não excluída.</p>
    </div>
  );
}

// ─── Users Settings ────────────────────────────────────────────
function UsersSettings({ userRole }: { userRole: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resources, setResources] = useState<Record<string, UserResources>>({});
  const [loadingRes, setLoadingRes] = useState<string | null>(null);
  const [newForm, setNewForm] = useState({ name:"", username:"", password:"", role:"agent", permissions: {} as UserPerms });
  const [editForm, setEditForm] = useState({ name:"", username:"", password:"", role:"", permissions: {} as UserPerms });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const isSuperAdmin = userRole === "superadmin";

  useEffect(() => { loadUsers(); }, []);
  async function loadUsers() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }

  async function loadResources(id: string) {
    setLoadingRes(id);
    const res = await fetch(`/api/users/${id}`);
    if (res.ok) {
      const d = await res.json();
      setResources(prev => ({ ...prev, [id]: d.resources }));
    }
    setLoadingRes(null);
  }

  function toggleExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!resources[id]) loadResources(id);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErr("");
    const res = await fetch("/api/users", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(newForm) });
    const data = await res.json();
    if (res.ok) { setShowNew(false); setNewForm({ name:"", username:"", password:"", role:"agent", permissions:{} }); loadUsers(); }
    else setErr(data.error || "Erro ao criar");
    setSaving(false);
  }

  function openEdit(u: User) {
    setEditUser(u);
    setEditForm({ name:u.name, username:u.username, password:"", role:u.role, permissions: u.permissions ?? {} });
    setErr("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault(); if (!editUser) return;
    setSaving(true); setErr("");
    const body: Record<string, unknown> = { name: editForm.name, username: editForm.username, role: editForm.role, permissions: editForm.permissions };
    if (editForm.password.trim()) body.password = editForm.password.trim();
    const res = await fetch(`/api/users/${editUser.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) { setEditUser(null); loadUsers(); }
    else setErr(data.error || "Erro ao salvar");
    setSaving(false);
  }

  async function toggleActive(u: User) {
    await fetch(`/api/users/${u.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ active: !u.active }) });
    loadUsers();
  }

  async function deleteUser(id: string) {
    if (!confirm("Excluir usuário permanentemente?")) return;
    const res = await fetch(`/api/users/${id}`, { method:"DELETE" });
    if (res.ok) loadUsers(); else { const d = await res.json(); alert(d.error || "Erro ao excluir"); }
  }

  async function transferInstance(instanceId: string, fromUserId: string) {
    if (!confirm("Desvincular esta instância do usuário?")) return;
    await fetch(`/api/providers/transfer-instance`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId, ownerId: null }),
    }).catch(() => {});
    loadResources(fromUserId);
  }

  // ── Permission toggle helper ──────────────────────────────────
  function PermToggle({ perms, setPerms }: { perms: UserPerms; setPerms: (p: UserPerms) => void }) {
    return (
      <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Permissões de acesso</p>
        <div className="grid grid-cols-2 gap-2">
          {PERM_GROUPS.map(g => {
            const enabled = perms[g.key] !== false;
            return (
              <button key={g.key} type="button"
                onClick={() => setPerms({ ...perms, [g.key]: !enabled })}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all"
                style={enabled
                  ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)", color: "var(--primary)" }
                  : { borderColor: "var(--border)", backgroundColor: "transparent", color: "var(--text-muted)" }}
              >
                <span className="text-base leading-none flex-shrink-0">{g.icon}</span>
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{g.label}</p>
                </div>
                <div className="ml-auto flex-shrink-0">
                  <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: enabled ? "var(--primary)" : "var(--text-muted)", backgroundColor: enabled ? "var(--primary)" : "transparent" }}>
                    {enabled && <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold" style={{ color:"var(--text-primary)" }}>
          Usuários <span className="text-sm font-normal" style={{ color:"var(--text-muted)" }}>({users.length})</span>
        </h2>
        <button onClick={() => { setShowNew(true); setErr(""); }}
          className="flex items-center gap-2 text-white px-4 py-2 rounded-xl text-sm font-medium"
          style={{ backgroundColor:"var(--primary)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
          Novo Usuário
        </button>
      </div>

      {/* Modal Novo Usuário */}
      {showNew && (
        <UserModal title="Novo Usuário" onSubmit={createUser} onClose={() => setShowNew(false)}
          form={newForm} setForm={setNewForm as (f: typeof newForm) => void}
          showRole={true} isCreate={true} err={err} saving={saving} isSuperAdmin={isSuperAdmin}
          PermToggle={<PermToggle perms={newForm.permissions} setPerms={p => setNewForm(f => ({ ...f, permissions: p }))} />}
        />
      )}

      {/* Modal Editar Usuário */}
      {editUser && (
        <UserModal title={`Editar: ${editUser.name}`} onSubmit={saveEdit} onClose={() => setEditUser(null)}
          form={editForm} setForm={setEditForm as (f: typeof editForm) => void}
          showRole={true} isCreate={false} err={err} saving={saving} isSuperAdmin={isSuperAdmin}
          PermToggle={<PermToggle perms={editForm.permissions} setPerms={p => setEditForm(f => ({ ...f, permissions: p }))} />}
        />
      )}

      <div className="space-y-3">
        {users.map(u => {
          const roleStyle = ROLE_COLORS[u.role] ?? { bg: "var(--border)", text: "var(--text-muted)" };
          const isExpanded = expandedId === u.id;
          const res = resources[u.id];
          return (
            <div key={u.id} className="rounded-2xl overflow-hidden" style={{ border:"1px solid var(--border)", backgroundColor:"var(--card-bg)" }}>
              <div className="p-4 flex items-center gap-4">
                <UserAvatar name={u.name} avatar={u.avatar} size={42} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{u.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: roleStyle.bg, color: roleStyle.text }}>{ROLE_LABELS[u.role] || u.role}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: u.active ? "color-mix(in srgb, var(--success) 12%, transparent)" : "color-mix(in srgb, var(--danger) 10%, transparent)", color: u.active ? "var(--success)" : "var(--danger)" }}>
                      {u.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>@{u.username}</p>
                  {/* Permissions mini-badges */}
                  {u.permissions && Object.keys(u.permissions).length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {PERM_GROUPS.filter(g => u.permissions?.[g.key] !== false).map(g => (
                        <span key={g.key} className="text-xs" title={g.label}>{g.icon}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isSuperAdmin && (
                    <button onClick={() => toggleExpand(u.id)} title="Ver recursos"
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: isExpanded ? "var(--primary)" : "var(--text-muted)", backgroundColor: isExpanded ? "var(--primary-light)" : "transparent" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                    </button>
                  )}
                  <button onClick={() => openEdit(u)} title="Editar"
                    className="p-1.5 rounded-lg transition-colors" style={{ color:"var(--text-muted)" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  </button>
                  <button onClick={() => toggleActive(u)} title={u.active ? "Desativar" : "Ativar"}
                    className="p-1.5 rounded-lg transition-colors" style={{ color: u.active ? "var(--text-muted)" : "var(--success)" }}>
                    {u.active
                      ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    }
                  </button>
                  {isSuperAdmin && u.role !== "superadmin" && (
                    <button onClick={() => deleteUser(u.id)} title="Excluir"
                      className="p-1.5 rounded-lg transition-colors" style={{ color:"var(--danger)" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded resources panel */}
              {isExpanded && (
                <div style={{ borderTop: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
                  {loadingRes === u.id ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-5 h-5 border-4 rounded-full animate-spin" style={{ borderColor:"var(--primary)", borderTopColor:"transparent" }} />
                    </div>
                  ) : res ? (
                    <div className="p-4 space-y-4">
                      {/* Instances */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color:"var(--text-muted)" }}>
                          Instâncias ({res.instances.length})
                        </p>
                        {res.instances.length === 0 ? (
                          <p className="text-xs" style={{ color:"var(--text-muted)" }}>Nenhuma instância vinculada</p>
                        ) : (
                          <div className="space-y-1.5">
                            {res.instances.map(inst => (
                              <div key={inst.id} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ backgroundColor:"var(--card-bg)", border:"1px solid var(--border)" }}>
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: inst.status === "connected" ? "var(--success)" : "var(--text-muted)" }} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate" style={{ color:"var(--text-primary)" }}>{inst.label || inst.instanceName}</p>
                                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>{inst.provider.name} · {inst.status === "connected" ? "Conectado" : "Desconectado"}{inst.phone ? ` · ${inst.phone}` : ""}</p>
                                </div>
                                <button onClick={() => transferInstance(inst.id, u.id)}
                                  className="text-xs px-2 py-1 rounded-lg border transition-colors flex-shrink-0"
                                  style={{ borderColor:"var(--danger-light)", color:"var(--danger)" }} title="Desvincular">
                                  Desvincular
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Contacts */}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color:"var(--text-muted)" }}>
                          Contatos atribuídos
                        </p>
                        <p className="text-sm font-semibold" style={{ color:"var(--text-primary)" }}>{res.contactCount}</p>
                      </div>

                      {/* Campaigns */}
                      {res.campaigns.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color:"var(--text-muted)" }}>
                            Campanhas recentes ({res.campaigns.length})
                          </p>
                          <div className="space-y-1.5">
                            {res.campaigns.map(c => (
                              <div key={c.id} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ backgroundColor:"var(--card-bg)", border:"1px solid var(--border)" }}>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate" style={{ color:"var(--text-primary)" }}>{c.name}</p>
                                  <p className="text-xs" style={{ color:"var(--text-muted)" }}>{c.instance.label || c.instance.instanceName} · {c.status}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── User modal ────────────────────────────────────────────────
function UserModal({ title, onSubmit, onClose, form, setForm, showRole, isCreate, err, saving, isSuperAdmin, PermToggle }: {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  form: { name: string; username: string; password: string; role: string; permissions: UserPerms };
  setForm: (f: { name: string; username: string; password: string; role: string; permissions: UserPerms }) => void;
  showRole: boolean; isCreate: boolean; err: string; saving: boolean; isSuperAdmin: boolean;
  PermToggle: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden my-auto" style={{ backgroundColor:"var(--card-bg)" }}>
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom:"1px solid var(--border)" }}>
          <h3 className="text-base font-semibold" style={{ color:"var(--text-primary)" }}>{title}</h3>
          <button onClick={onClose} style={{ color:"var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>Nome completo</label>
            <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ borderColor:"var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }} required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>Nome de usuário</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color:"var(--text-muted)" }}>@</span>
              <input value={form.username} onChange={e=>setForm({...form,username:e.target.value.toLowerCase().replace(/\s/g,"")})}
                className="w-full border rounded-xl pl-7 pr-3 py-2.5 text-sm outline-none"
                style={{ borderColor:"var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>
              {isCreate ? "Senha" : "Nova senha"}
              {!isCreate && <span className="font-normal ml-1" style={{ color:"var(--text-muted)" }}>(deixe em branco para manter)</span>}
            </label>
            <input type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}
              placeholder={isCreate?"Mínimo 6 caracteres":"••••••••"}
              className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ borderColor:"var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }}
              required={isCreate} minLength={isCreate?6:undefined} />
          </div>
          {showRole && (
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>Papel</label>
              <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}
                className="w-full border rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{ borderColor:"var(--border)", color:"var(--text-primary)", backgroundColor:"var(--card-bg)" }}>
                <option value="agent">Agente</option>
                <option value="admin">Administrador</option>
                {isSuperAdmin && <option value="superadmin">Super Admin</option>}
              </select>
            </div>
          )}
          {PermToggle}
          {err && <p className="text-sm px-3 py-2 rounded-xl" style={{ backgroundColor:"color-mix(in srgb, var(--danger) 10%, transparent)", color:"var(--danger)", border:"1px solid color-mix(in srgb, var(--danger) 25%, transparent)" }}>{err}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving}
              className="flex-1 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor:"var(--primary)" }}>
              {saving ? "Salvando..." : isCreate ? "Criar Usuário" : "Salvar Alterações"}
            </button>
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm border"
              style={{ borderColor:"var(--border)", color:"var(--text-secondary)" }}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Resources Settings (superadmin) ──────────────────────────
function ResourcesSettings() {
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function togglePerm(userId: string, key: string, current: boolean) {
    const u = users.find(u => u.id === userId);
    if (!u) return;
    const newPerms = { ...(u.permissions ?? {}), [key]: !current };
    setSaving(`${userId}-${key}`);
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: newPerms }),
    });
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, permissions: newPerms } : u));
    setSaving(null);
  }

  const nonSuper = users.filter(u => u.role !== "superadmin");

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold" style={{ color:"var(--text-primary)" }}>Painel de Recursos</h2>
        <p className="text-sm mt-1" style={{ color:"var(--text-muted)" }}>
          Controle quais módulos do sistema cada usuário pode acessar. Super admins têm acesso irrestrito.
        </p>
      </div>

      {/* Permission groups legend */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {PERM_GROUPS.map(g => (
          <div key={g.key} className="flex items-start gap-3 p-3 rounded-xl" style={{ backgroundColor:"var(--card-bg)", border:"1px solid var(--border)" }}>
            <span className="text-xl leading-none mt-0.5">{g.icon}</span>
            <div>
              <p className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>{g.label}</p>
              <p className="text-xs mt-0.5" style={{ color:"var(--text-muted)" }}>{g.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Permission matrix */}
      <div className="rounded-2xl overflow-hidden" style={{ border:"1px solid var(--border)" }}>
        {/* Header */}
        <div className="grid gap-0" style={{ gridTemplateColumns: `220px repeat(${PERM_GROUPS.length}, 1fr)`, backgroundColor:"var(--page-bg)", borderBottom:"1px solid var(--border)" }}>
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color:"var(--text-muted)" }}>Usuário</div>
          {PERM_GROUPS.map(g => (
            <div key={g.key} className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider" style={{ color:"var(--text-muted)" }}>
              <span className="text-base block mb-0.5">{g.icon}</span>
              {g.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {nonSuper.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color:"var(--text-muted)", backgroundColor:"var(--card-bg)" }}>
            Nenhum usuário não-superadmin encontrado
          </div>
        ) : nonSuper.map((u, idx) => {
          const roleStyle = ROLE_COLORS[u.role] ?? { bg:"var(--border)", text:"var(--text-muted)" };
          return (
            <div key={u.id} className="grid gap-0 items-center" style={{
              gridTemplateColumns: `220px repeat(${PERM_GROUPS.length}, 1fr)`,
              backgroundColor: idx % 2 === 0 ? "var(--card-bg)" : "color-mix(in srgb, var(--page-bg) 60%, transparent)",
              borderBottom:"1px solid color-mix(in srgb, var(--border) 50%, transparent)",
            }}>
              {/* User info */}
              <div className="px-4 py-3 flex items-center gap-2.5">
                <UserAvatar name={u.name} avatar={u.avatar} size={32} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color:"var(--text-primary)" }}>{u.name}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: roleStyle.bg, color: roleStyle.text }}>{ROLE_LABELS[u.role]}</span>
                </div>
              </div>

              {/* Permission toggles */}
              {PERM_GROUPS.map(g => {
                const enabled = u.permissions?.[g.key] !== false;
                const key = `${u.id}-${g.key}`;
                const isSaving = saving === key;
                return (
                  <div key={g.key} className="flex items-center justify-center py-3">
                    <button
                      onClick={() => togglePerm(u.id, g.key, enabled)}
                      disabled={isSaving}
                      className="relative w-10 h-5 rounded-full transition-all disabled:opacity-50"
                      style={{ backgroundColor: enabled ? "var(--primary)" : "var(--border)" }}
                      title={`${enabled ? "Desabilitar" : "Habilitar"} ${g.label} para ${u.name}`}
                    >
                      {isSaving ? (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                          style={{ left: enabled ? "calc(100% - 1.25rem)" : "0.125rem" }} />
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="text-xs" style={{ color:"var(--text-muted)" }}>
        Permissões controlam o acesso visual aos módulos. O superadmin sempre tem acesso total independente das configurações acima.
      </p>
    </div>
  );
}

// ─── WhatsApp Legacy ───────────────────────────────────────────
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
    setSession(data); setLoading(false);
  }

  if (loading) return <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor:"var(--primary)", borderTopColor:"transparent" }} /></div>;

  return (
    <div className="max-w-lg">
      <h2 className="text-lg font-semibold mb-4" style={{ color:"var(--text-primary)" }}>Conexão WhatsApp</h2>
      <div className="rounded-xl p-6" style={{ backgroundColor:"var(--card-bg)", border:"1px solid var(--border)" }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: session?.status==="connected"?"var(--success)":session?.status==="connecting"?"#f59e0b":"var(--danger)" }} />
          <span className="text-sm font-medium" style={{ color:"var(--text-primary)" }}>
            {session?.status==="connected"?"Conectado":session?.status==="connecting"?"Aguardando QR Code...":"Desconectado"}
          </span>
          {session?.phone && <span className="text-sm" style={{ color:"var(--text-muted)" }}>({session.phone})</span>}
        </div>
        {session?.status==="connecting" && session.qrCode && (
          <div className="text-center mb-4">
            <p className="text-sm mb-4" style={{ color:"var(--text-secondary)" }}>Escaneie o QR Code com seu WhatsApp:</p>
            <div className="inline-block p-3 rounded-xl bg-white shadow">
              <img src={session.qrCode} alt="QR Code" className="w-56 h-56" />
            </div>
          </div>
        )}
        {session?.status==="connected" && (
          <div className="rounded-lg p-4 text-sm" style={{ backgroundColor:"color-mix(in srgb, var(--success) 10%, transparent)", color:"var(--success)", border:"1px solid color-mix(in srgb, var(--success) 25%, transparent)" }}>
            WhatsApp conectado! Novos contatos serão automaticamente adicionados ao pipeline.
          </div>
        )}
      </div>
    </div>
  );
}
