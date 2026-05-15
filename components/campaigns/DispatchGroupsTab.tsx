"use client";

import { useEffect, useState, useCallback } from "react";

interface WaGroup {
  id: string;
  name: string;
  groupJid: string;
  participantCount: number;
  instance: { id: string; label: string | null; instanceName: string; status: string };
}

interface DispatchGroupItem {
  id: string;
  groupId: string;
  group: WaGroup;
}

interface DispatchGroup {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  items: DispatchGroupItem[];
}

interface Instance {
  id: string;
  label: string | null;
  instanceName: string;
  status: string;
}

function DispatchGroupForm({
  editing,
  onClose,
  onSaved,
}: {
  editing?: DispatchGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(editing?.name || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState("");
  const [waGroups, setWaGroups] = useState<WaGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    editing?.items.map((i) => i.groupId) || []
  );
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.ok ? r.json() : [])
      .then((providers: Array<{ type: string; instances?: Instance[] }>) => {
        const all: Instance[] = [];
        for (const p of providers) {
          if (["evolution", "wppconnect"].includes(p.type)) {
            for (const inst of p.instances || []) all.push(inst);
          }
        }
        setInstances(all);
        // If editing, auto-select instance from first item
        if (editing?.items.length) {
          const firstInstanceId = editing.items[0].group.instance.id;
          setSelectedInstance(firstInstanceId);
        } else {
          const connected = all.find((i) => i.status === "connected");
          if (connected) setSelectedInstance(connected.id);
          else if (all[0]) setSelectedInstance(all[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!selectedInstance) return;
    setLoadingGroups(true);
    fetch(`/api/campaigns/groups?instanceId=${selectedInstance}`)
      .then((r) => r.ok ? r.json() : { groups: [] })
      .then((d) => {
        setWaGroups(d.groups || []);
        setLoadingGroups(false);
      });
  }, [selectedInstance]);

  // Also load groups for other instances that have selected groups (when editing)
  useEffect(() => {
    if (!editing || !editing.items.length) return;
    const instanceIds = [...new Set(editing.items.map((i) => i.group.instance.id))];
    Promise.all(
      instanceIds.map((iid) =>
        fetch(`/api/campaigns/groups?instanceId=${iid}`)
          .then((r) => r.ok ? r.json() : { groups: [] })
          .then((d) => d.groups || [])
      )
    ).then((results) => {
      const all = results.flat() as WaGroup[];
      setWaGroups((prev) => {
        const ids = new Set(prev.map((g) => g.id));
        return [...prev, ...all.filter((g) => !ids.has(g.id))];
      });
    });
  }, [editing]);

  const filtered = waGroups.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(id: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (filtered.every((g) => selectedGroupIds.includes(g.id))) {
      setSelectedGroupIds((prev) => prev.filter((id) => !filtered.some((g) => g.id === id)));
    } else {
      const newIds = filtered.map((g) => g.id);
      setSelectedGroupIds((prev) => [...new Set([...prev, ...newIds])]);
    }
  }

  async function handleSave() {
    if (!name.trim() || selectedGroupIds.length === 0) return;
    setSaving(true);
    try {
      const url = editing
        ? `/api/campaigns/dispatch-groups/${editing.id}`
        : "/api/campaigns/dispatch-groups";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, groupIds: selectedGroupIds }),
      });
      if (res.ok) onSaved();
      else {
        const d = await res.json();
        alert(d.error || "Erro ao salvar");
      }
    } finally {
      setSaving(false);
    }
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((g) => selectedGroupIds.includes(g.id));

  // Groups selected but possibly from other instances (not in current filter)
  const selectedInOtherInstances = waGroups.filter(
    (g) => selectedGroupIds.includes(g.id) && g.instance.id !== selectedInstance
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        style={{ backgroundColor: "var(--card-bg)" }}
      >
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
              {editing ? "Editar Grupo de Disparo" : "Novo Grupo de Disparo"}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Colecione grupos do WhatsApp para reutilizar em campanhas
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name + Description */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                Nome do grupo de disparo *
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Grupos Black Friday SP"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                Descrição (opcional)
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Para que serve este grupo?"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
              />
            </div>
          </div>

          {/* Instance selector */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
              Instância para adicionar grupos
            </label>
            <select
              value={selectedInstance}
              onChange={(e) => setSelectedInstance(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
            >
              <option value="">Selecione uma instância</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label || i.instanceName} {i.status !== "connected" ? "(offline)" : "✓"}
                </option>
              ))}
            </select>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Você pode trocar de instância para adicionar grupos de diferentes conexões.
            </p>
          </div>

          {/* Groups list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Grupos do WhatsApp
              </label>
              <span className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
                {selectedGroupIds.length} selecionado{selectedGroupIds.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
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
              <button
                onClick={toggleAll}
                className="text-xs font-medium px-3 py-2 rounded-lg border flex-shrink-0"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--card-bg)" }}
              >
                {allFilteredSelected ? "Desmarcar" : "Marcar todos"}
              </button>
            </div>

            {loadingGroups ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-5 h-5 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
              </div>
            ) : filtered.length === 0 && !selectedInstance ? (
              <div className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
                Selecione uma instância para ver os grupos disponíveis.
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-sm text-center py-6" style={{ color: "var(--text-muted)" }}>
                Nenhum grupo encontrado. Sincronize os grupos na aba "Grupos" primeiro.
              </div>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {filtered.map((g) => {
                  const selected = selectedGroupIds.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
                      style={{
                        backgroundColor: selected ? "var(--primary-light)" : "transparent",
                        border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggle(g.id)}
                        className="w-4 h-4 rounded flex-shrink-0"
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

            {/* Grupos de outras instâncias já selecionados */}
            {selectedInOtherInstances.length > 0 && (
              <div
                className="mt-3 rounded-xl p-3 text-xs"
                style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}
              >
                <p className="font-semibold mb-1">+ {selectedInOtherInstances.length} grupo{selectedInOtherInstances.length !== 1 ? "s" : ""} de outras instâncias:</p>
                <ul className="space-y-0.5">
                  {selectedInOtherInstances.map((g) => (
                    <li key={g.id} className="flex items-center justify-between">
                      <span className="truncate">{g.name}</span>
                      <button
                        onClick={() => toggle(g.id)}
                        className="ml-2 text-xs underline flex-shrink-0"
                      >
                        remover
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 flex items-center justify-between gap-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || selectedGroupIds.length === 0}
            className="text-sm px-6 py-2 rounded-lg text-white font-medium disabled:opacity-40"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar grupo de disparo"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DispatchGroupsTab() {
  const [dispatchGroups, setDispatchGroups] = useState<DispatchGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<DispatchGroup | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/campaigns/dispatch-groups");
    if (res.ok) {
      const d = await res.json();
      setDispatchGroups(d.dispatchGroups || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Remover este grupo de disparo?")) return;
    setDeleting(id);
    await fetch(`/api/campaigns/dispatch-groups/${id}`, { method: "DELETE" });
    setDispatchGroups((prev) => prev.filter((g) => g.id !== id));
    setDeleting(null);
  }

  const filtered = dispatchGroups.filter((dg) =>
    dg.name.toLowerCase().includes(search.toLowerCase()) ||
    (dg.description || "").toLowerCase().includes(search.toLowerCase())
  );

  // Group instance names for display
  function getInstanceLabels(dg: DispatchGroup): string {
    const instances = [...new Set(dg.items.map((i) => i.group.instance.label || i.group.instance.instanceName))];
    if (instances.length === 0) return "—";
    if (instances.length <= 2) return instances.join(", ");
    return `${instances[0]}, ${instances[1]} +${instances.length - 2}`;
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar grupos de disparo..."
            className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}
          />
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white flex-shrink-0"
          style={{ backgroundColor: "var(--primary)" }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo grupo de disparo
        </button>
      </div>

      {/* Explanation banner */}
      <div
        className="rounded-xl p-4 text-sm flex items-start gap-3"
        style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}
      >
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: "var(--primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div style={{ color: "var(--primary)" }}>
          <p className="font-semibold">O que são grupos de disparo?</p>
          <p className="text-xs mt-1 opacity-80">
            Uma coleção nomeada de grupos do WhatsApp de uma ou mais instâncias. Ao criar uma campanha, você pode selecionar um grupo de disparo para preencher automaticamente todos os grupos — sem precisar selecionar um por um.
          </p>
        </div>
      </div>

      {/* List */}
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
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="font-semibold text-base" style={{ color: "var(--text-secondary)" }}>
            {search ? "Nenhum resultado" : "Nenhum grupo de disparo criado"}
          </p>
          <p className="text-sm mt-1">
            {search ? "Tente outra busca." : "Crie um grupo para facilitar o disparo em campanhas."}
          </p>
          {!search && (
            <button
              onClick={() => { setEditing(null); setShowForm(true); }}
              className="mt-4 text-sm font-medium px-5 py-2 rounded-lg text-white"
              style={{ backgroundColor: "var(--primary)" }}
            >
              Criar primeiro grupo
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((dg) => (
            <div
              key={dg.id}
              className="rounded-2xl overflow-hidden"
              style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}
            >
              {/* Header row */}
              <div className="flex items-center gap-4 px-5 py-4">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold text-sm"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  {dg.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{dg.name}</p>
                  {dg.description && (
                    <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{dg.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {dg.items.length} grupo{dg.items.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>•</span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{getInstanceLabels(dg)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setExpanded(expanded === dg.id ? null : dg.id)}
                    className="text-xs px-3 py-1.5 rounded-lg border"
                    style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    {expanded === dg.id ? "Ocultar" : "Ver grupos"}
                  </button>
                  <button
                    onClick={() => { setEditing(dg); setShowForm(true); }}
                    className="p-1.5 rounded-lg"
                    style={{ color: "var(--text-muted)" }}
                    title="Editar"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(dg.id)}
                    disabled={deleting === dg.id}
                    className="p-1.5 rounded-lg disabled:opacity-40"
                    style={{ color: "var(--danger)" }}
                    title="Remover"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded groups */}
              {expanded === dg.id && (
                <div style={{ borderTop: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
                  <div className="px-5 py-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {dg.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs"
                        style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                          style={{ backgroundColor: "var(--primary)", fontSize: "10px" }}
                        >
                          {item.group.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{item.group.name}</p>
                          <p className="truncate" style={{ color: "var(--text-muted)" }}>
                            {item.group.instance.label || item.group.instance.instanceName}
                            {item.group.participantCount > 0 ? ` · ${item.group.participantCount}p` : ""}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <DispatchGroupForm
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
