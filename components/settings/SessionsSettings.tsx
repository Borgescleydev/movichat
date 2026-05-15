"use client";

import { useCallback, useEffect, useState } from "react";

interface SessionUser {
  id: string;
  name: string;
  username: string;
  role: string;
  avatar?: string | null;
}

interface Session {
  id: string;
  userId: string;
  user: SessionUser;
  ipAddress: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  lastActiveAt: string;
  createdAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
  isActive: boolean;
}

const AV_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#22c55e","#10b981","#06b6d4","#3b82f6","#eab308"];
function avColor(n: string) { let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))>>>0; return AV_COLORS[h%AV_COLORS.length]; }

function UserAvatar({ name, avatar, size = 32 }: { name: string; avatar?: string | null; size?: number }) {
  if (avatar) return <img src={avatar} alt={name} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  const ini = name.replace(/[^a-zA-ZÀ-ÿ\s]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("") || name.charAt(0).toUpperCase();
  return <div style={{ width:size,height:size,borderRadius:"50%",flexShrink:0,backgroundColor:avColor(name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:"#fff",userSelect:"none" }}>{ini}</div>;
}

function DeviceIcon({ type }: { type: string | null }) {
  if (type === "mobile") return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
  if (type === "tablet") return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "Agora mesmo";
  if (secs < 3600) return `${Math.floor(secs / 60)} min atrás`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} h atrás`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)} d atrás`;
  return new Date(dateStr).toLocaleDateString("pt-BR");
}

function locationStr(s: Session): string {
  const parts = [s.city, s.region, s.country].filter(Boolean);
  return parts.length ? parts.join(", ") : s.ipAddress || "Desconhecido";
}

export default function SessionsSettings({ userRole }: { userRole: string }) {
  const isAdmin = ["superadmin", "admin"].includes(userRole);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"active" | "all">("active");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/sessions");
    if (res.ok) {
      const d = await res.json();
      setSessions(d.sessions || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function revokeSession(sessionId: string) {
    setRevoking(sessionId);
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, revokedAt: new Date().toISOString(), isActive: false } : s));
    setRevoking(null);
  }

  async function revokeAllForUser(userId: string, keepCurrent = false) {
    setRevokingAll(userId);
    await fetch(`/api/sessions/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keepCurrent }),
    });
    setSessions((prev) =>
      prev.map((s) => {
        if (s.userId !== userId) return s;
        if (keepCurrent && s.isCurrent) return s;
        return { ...s, revokedAt: new Date().toISOString(), isActive: false };
      })
    );
    setRevokingAll(null);
  }

  // Group sessions by user
  const userMap = new Map<string, { user: SessionUser; sessions: Session[] }>();
  for (const s of sessions) {
    if (!userMap.has(s.userId)) userMap.set(s.userId, { user: s.user, sessions: [] });
    userMap.get(s.userId)!.sessions.push(s);
  }
  const users = Array.from(userMap.values());

  const filteredUsers = filterUser === "all"
    ? users
    : users.filter((u) => u.user.id === filterUser);

  const displaySessions = (sessList: Session[]) =>
    filterStatus === "active" ? sessList.filter((s) => s.isActive) : sessList;

  // Stats
  const totalActive = sessions.filter((s) => s.isActive).length;
  const totalUsers = new Set(sessions.filter((s) => s.isActive).map((s) => s.userId)).size;

  const ROLE_LABELS: Record<string, string> = { superadmin: "Super Admin", admin: "Admin", agent: "Agente" };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Sessões ativas", value: totalActive, icon: "🟢" },
          { label: "Usuários online", value: totalUsers, icon: "👥" },
          { label: "Total de sessões", value: sessions.length, icon: "📋" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl p-4 flex items-center gap-4"
            style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}
          >
            <span className="text-2xl">{stat.icon}</span>
            <div>
              <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{stat.value}</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {isAdmin && (
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
          >
            <option value="all">Todos os usuários</option>
            {users.map((u) => (
              <option key={u.user.id} value={u.user.id}>{u.user.name} (@{u.user.username})</option>
            ))}
          </select>
        )}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          {(["active", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className="text-sm px-4 py-2 transition-colors"
              style={
                filterStatus === f
                  ? { backgroundColor: "var(--primary)", color: "#fff" }
                  : { backgroundColor: "var(--card-bg)", color: "var(--text-secondary)" }
              }
            >
              {f === "active" ? "Ativas" : "Todas"}
            </button>
          ))}
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--card-bg)" }}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Atualizar
        </button>
      </div>

      {/* Sessions list */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div
          className="rounded-2xl p-16 text-center border-2 border-dashed"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <p className="font-semibold">Nenhuma sessão encontrada</p>
          <p className="text-sm mt-1">As sessões aparecem após o próximo login</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUsers.map(({ user, sessions: userSessions }) => {
            const visible = displaySessions(userSessions);
            const activeCount = userSessions.filter((s) => s.isActive).length;
            if (visible.length === 0) return null;

            return (
              <div
                key={user.id}
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}
              >
                {/* User header */}
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ borderBottom: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar name={user.name} avatar={user.avatar} size={32} />
                    <div>
                      <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{user.name}</span>
                      <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>@{user.username}</span>
                      <span className="text-xs ml-2 px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {activeCount} ativa{activeCount !== 1 ? "s" : ""}
                    </span>
                    {isAdmin && activeCount > 0 && (
                      <button
                        onClick={() => revokeAllForUser(user.id, true)}
                        disabled={revokingAll === user.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                        style={{ backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)" }}
                      >
                        {revokingAll === user.id ? "Encerrando..." : "Encerrar outras"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Sessions rows */}
                <div className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--border) 50%, transparent)" }}>
                  {visible.map((s) => (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
                      {/* Device icon */}
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: s.isActive
                            ? "color-mix(in srgb, var(--success) 12%, transparent)"
                            : "color-mix(in srgb, var(--border) 60%, transparent)",
                          color: s.isActive ? "var(--success)" : "var(--text-muted)",
                        }}
                      >
                        <DeviceIcon type={s.deviceType} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                            {s.browser || "Navegador desconhecido"}
                          </span>
                          {s.os && (
                            <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                              {s.os}
                            </span>
                          )}
                          {s.isCurrent && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}
                            >
                              Sessão atual
                            </span>
                          )}
                          {!s.isActive && (
                            <span
                              className="text-xs px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)" }}
                            >
                              Encerrada
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {/* Location */}
                          <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {locationStr(s)}
                          </span>
                          {/* Last active */}
                          <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {s.isActive ? `Ativo ${formatRelative(s.lastActiveAt)}` : `Encerrado ${formatRelative(s.revokedAt!)}`}
                          </span>
                          {/* Created */}
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            Login em {new Date(s.createdAt).toLocaleDateString("pt-BR")} {new Date(s.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>

                      {/* Revoke */}
                      {s.isActive && !s.isCurrent && (
                        <button
                          onClick={() => revokeSession(s.id)}
                          disabled={revoking === s.id}
                          className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 disabled:opacity-40"
                          style={{ backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)", color: "var(--danger)", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)" }}
                        >
                          {revoking === s.id ? "..." : "Encerrar"}
                        </button>
                      )}
                      {s.isActive && s.isCurrent && (
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* My sessions section for non-admins */}
      {!isAdmin && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)", color: "var(--primary)" }}
        >
          <p className="font-semibold">Suas sessões ativas</p>
          <p className="text-xs mt-1 opacity-80">
            Você está vendo somente suas próprias sessões. Para encerrar uma sessão suspeita, clique em "Encerrar".
          </p>
        </div>
      )}
    </div>
  );
}
