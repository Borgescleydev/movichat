"use client";

import { useEffect, useState, useCallback } from "react";

interface Group {
  id: string;
  groupJid: string;
  name: string;
  participantCount: number;
  lastSyncAt: string;
  instance: { label: string | null; instanceName: string; status: string };
}

interface Instance {
  id: string;
  label: string | null;
  instanceName: string;
  status: string;
  provider: { type: string };
}

export default function GroupsTab() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [search, setSearch] = useState("");

  const loadInstances = useCallback(async () => {
    const res = await fetch("/api/providers");
    if (!res.ok) return;
    const providers = await res.json();
    const all: Instance[] = [];
    for (const p of providers) {
      if (["evolution", "wppconnect"].includes(p.type)) {
        for (const inst of p.instances || []) {
          all.push({ ...inst, provider: { type: p.type } });
        }
      }
    }
    setInstances(all);
    // Auto-select first connected instance, or just first
    if (all.length > 0 && !selectedInstanceId) {
      const connected = all.find((i) => i.status === "connected");
      setSelectedInstanceId(connected?.id || all[0].id);
    }

    // Refresh live status for each instance
    for (const p of providers) {
      if (["evolution", "wppconnect"].includes(p.type)) {
        for (const inst of p.instances || []) {
          fetch(`/api/providers/${p.id}/status?instanceId=${inst.id}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => {
              if (d?.status) {
                setInstances((prev) => prev.map((i) => i.id === inst.id ? { ...i, status: d.status } : i));
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [selectedInstanceId]);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    const url = selectedInstanceId ? `/api/campaigns/groups?instanceId=${selectedInstanceId}` : "/api/campaigns/groups";
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setGroups(data.groups || []);
    }
    setLoading(false);
  }, [selectedInstanceId]);

  useEffect(() => { loadInstances(); }, []);
  useEffect(() => { if (selectedInstanceId) loadGroups(); }, [selectedInstanceId]);

  async function syncGroups() {
    if (!selectedInstanceId) return;
    setSyncing(true);
    setSyncMsg("");
    setSyncError(false);
    try {
      const res = await fetch("/api/campaigns/groups/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: selectedInstanceId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncMsg(data.message || `${data.synced} grupos sincronizados com sucesso`);
        setSyncError(false);
        setGroups(data.groups || []);
      } else {
        setSyncMsg(data.error || "Erro ao sincronizar");
        setSyncError(true);
      }
    } catch (e) {
      setSyncMsg(`Erro de rede: ${e instanceof Error ? e.message : "falha ao conectar"}`);
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  }

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.groupJid.includes(search)
  );

  const lastSync = groups.length > 0 ? new Date(groups[0].lastSyncAt) : null;
  const selectedInstance = instances.find((i) => i.id === selectedInstanceId);

  return (
    <div className="max-w-4xl space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedInstanceId}
          onChange={(e) => setSelectedInstanceId(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
        >
          <option value="">Todas as instâncias</option>
          {instances.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label || i.instanceName} {i.status !== "connected" ? "(offline)" : ""}
            </option>
          ))}
        </select>

        <button
          onClick={syncGroups}
          disabled={syncing || !selectedInstanceId}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--primary)" }}
        >
          {syncing ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Sincronizar Grupos
        </button>

        <div className="flex-1 relative">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar grupos..."
            className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
          />
        </div>
      </div>

      {syncMsg && (
        <div
          className="text-sm px-4 py-3 rounded-lg"
          style={{
            backgroundColor: syncError ? "color-mix(in srgb, var(--danger) 10%, transparent)" : "var(--primary-light)",
            color: syncError ? "var(--danger)" : "var(--primary)",
            border: `1px solid ${syncError ? "color-mix(in srgb, var(--danger) 30%, transparent)" : "color-mix(in srgb, var(--primary) 20%, transparent)"}`,
          }}
        >
          {syncError ? "⚠ " : "✓ "}{syncMsg}
          {syncError && (
            <div className="mt-1.5 text-xs opacity-80">
              Verifique se a instância está conectada (status verde) e se o provedor está acessível. Consulte o guia em Configurações → Provedores API → Como configurar.
            </div>
          )}
        </div>
      )}

      {selectedInstance && selectedInstance.status !== "connected" && (
        <div className="text-sm px-4 py-3 rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)", color: "var(--warning)" }}>
          ⚠ A instância selecionada está offline. Conecte-a antes de sincronizar.
        </div>
      )}

      {/* Info bar */}
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {filtered.length} grupo{filtered.length !== 1 ? "s" : ""} {search ? "encontrado" + (filtered.length !== 1 ? "s" : "") : "sincronizado" + (filtered.length !== 1 ? "s" : "")}
        </span>
        {lastSync && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Última sincronização: {lastSync.toLocaleString("pt-BR")}
          </span>
        )}
      </div>

      {/* Groups table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-2xl p-16 text-center border-2 border-dashed"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--primary-light)" }}>
            <svg className="w-7 h-7" style={{ color: "var(--primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="font-semibold text-base" style={{ color: "var(--text-secondary)" }}>Nenhum grupo encontrado</p>
          <p className="text-sm mt-1">Selecione uma instância conectada e clique em "Sincronizar Grupos"</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>Grupo</th>
                <th className="text-left px-4 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>JID</th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>Participantes</th>
                <th className="text-right px-4 py-3 font-semibold" style={{ color: "var(--text-secondary)" }}>Instância</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g, i) => (
                <tr
                  key={g.id}
                  style={{ borderBottom: i < filtered.length - 1 ? "1px solid color-mix(in srgb, var(--border) 50%, transparent)" : "none" }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: "var(--primary)" }}>
                        {g.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>{g.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs" style={{ color: "var(--text-muted)" }}>{g.groupJid}</code>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--text-secondary)" }}>
                    {g.participantCount > 0 ? g.participantCount : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {g.instance.label || g.instance.instanceName}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
