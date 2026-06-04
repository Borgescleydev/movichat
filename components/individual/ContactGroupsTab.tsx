"use client";

import { useCallback, useEffect, useState } from "react";

interface Instance {
  id: string;
  label: string | null;
  instanceName: string;
  status: string;
}

interface WhatsAppGroup {
  id: string;
  name: string;
  groupJid: string;
  participantCount: number;
}

interface ContactGroup {
  id: string;
  name: string;
  description: string | null;
  sourceGroupName: string | null;
  sourceGroupJid: string | null;
  createdAt: string;
  sourceInstance?: { id: string; label: string | null; instanceName: string } | null;
  _count?: { items: number };
}

interface Props {
  onCreateCampaign: (contactGroupId: string) => void;
}

export default function ContactGroupsTab({ onCreateCampaign }: Props) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [selectedInstanceId, setSelectedInstanceId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [name, setName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [message, setMessage] = useState("");

  const loadInstances = useCallback(async () => {
    const res = await fetch("/api/providers");
    if (!res.ok) return;
    const providers = await res.json();
    const all: Instance[] = [];
    for (const provider of providers) {
      if (["evolution", "wppconnect"].includes(provider.type)) {
        for (const instance of provider.instances || []) all.push(instance);
      }
    }
    setInstances(all);
    const connected = all.find((instance) => instance.status === "connected");
    if (connected) setSelectedInstanceId((prev) => prev || connected.id);
  }, []);

  const loadContactGroups = useCallback(async () => {
    const res = await fetch("/api/contact-groups");
    if (!res.ok) return;
    const data = await res.json();
    setContactGroups(data.contactGroups || []);
  }, []);

  const loadGroups = useCallback(async () => {
    if (!selectedInstanceId) {
      setGroups([]);
      return;
    }
    setLoadingGroups(true);
    setSelectedGroupId("");
    const res = await fetch(`/api/campaigns/groups?instanceId=${selectedInstanceId}`);
    if (res.ok) {
      const data = await res.json();
      setGroups(data.groups || []);
    }
    setLoadingGroups(false);
  }, [selectedInstanceId]);

  useEffect(() => { loadInstances(); loadContactGroups(); }, [loadInstances, loadContactGroups]);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(groupSearch.toLowerCase()) ||
    group.groupJid.toLowerCase().includes(groupSearch.toLowerCase())
  );

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);
  const selectedInstance = instances.find((instance) => instance.id === selectedInstanceId);

  useEffect(() => {
    if (selectedGroup && !name.trim()) setName(`Disparo - ${selectedGroup.name}`);
  }, [selectedGroup, name]);

  async function collectContacts() {
    if (!selectedGroupId) {
      setMessage("Selecione um grupo do WhatsApp.");
      return;
    }
    setCollecting(true);
    setMessage("");
    try {
      const res = await fetch(`/api/campaigns/groups/${selectedGroupId}/collect-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Nao foi possivel coletar os contatos.");
        return;
      }
      setMessage(`${data.imported} contato(s) coletados em "${data.contactGroup.name}".`);
      setSelectedGroupId("");
      setName("");
      await loadContactGroups();
    } finally {
      setCollecting(false);
    }
  }

  async function deleteContactGroup(id: string) {
    if (!confirm("Excluir este grupo de contatos? Os contatos continuam na base.")) return;
    const res = await fetch(`/api/contact-groups/${id}`, { method: "DELETE" });
    if (res.ok) loadContactGroups();
    else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erro ao excluir grupo de contatos.");
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-5">
        <div className="rounded-2xl p-5 space-y-4" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Novo grupo de contatos</h2>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Extraia contatos de um grupo WhatsApp e salve uma lista isolada para disparos individuais.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Instancia</label>
            <select
              value={selectedInstanceId}
              onChange={(e) => setSelectedInstanceId(e.target.value)}
              className="w-full text-sm rounded-lg px-3 py-2 outline-none"
              style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}
            >
              <option value="">Selecione uma instancia</option>
              {instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.label || instance.instanceName} - {instance.status === "connected" ? "conectada" : "offline"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Grupo WhatsApp</label>
            <input
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
              placeholder="Buscar grupo..."
              className="w-full text-sm rounded-lg px-3 py-2 outline-none mb-2"
              style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}
            />
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="max-h-72 overflow-y-auto">
                {loadingGroups ? (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
                  </div>
                ) : filteredGroups.length === 0 ? (
                  <p className="text-xs text-center py-8 px-4" style={{ color: "var(--text-muted)" }}>
                    {selectedInstance ? "Nenhum grupo encontrado. Sincronize os grupos em Campanhas > Grupos." : "Selecione uma instancia conectada."}
                  </p>
                ) : filteredGroups.map((group) => {
                  const active = selectedGroupId === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setSelectedGroupId(group.id);
                        setName(`Disparo - ${group.name}`);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                      style={{
                        borderBottom: "1px solid color-mix(in srgb, var(--border) 45%, transparent)",
                        backgroundColor: active ? "var(--primary-light)" : "var(--card-bg)",
                      }}
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ backgroundColor: "var(--primary)" }}>
                        {group.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{group.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{group.participantCount || 0} participante(s)</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Nome do grupo de disparo</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Leads Workshop - Grupo A"
              className="w-full text-sm rounded-lg px-3 py-2 outline-none"
              style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}
            />
          </div>

          {message && (
            <div className="rounded-xl px-3 py-2 text-xs" style={{
              color: message.includes("coletados") ? "var(--success)" : "var(--danger)",
              backgroundColor: message.includes("coletados") ? "color-mix(in srgb, var(--success) 10%, transparent)" : "color-mix(in srgb, var(--danger) 10%, transparent)",
              border: `1px solid ${message.includes("coletados") ? "color-mix(in srgb, var(--success) 25%, transparent)" : "color-mix(in srgb, var(--danger) 25%, transparent)"}`,
            }}>
              {message}
            </div>
          )}

          <button
            type="button"
            onClick={collectContacts}
            disabled={collecting || !selectedGroupId}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
            style={{ backgroundColor: "var(--primary)" }}
          >
            {collecting ? "Coletando contatos..." : "Criar grupo com contatos coletados"}
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Grupos de contatos</h2>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Use estas listas como grupos de disparo em campanhas individuais.
              </p>
            </div>
          </div>

          {contactGroups.length === 0 ? (
            <div className="rounded-2xl p-12 text-center border-2 border-dashed" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>Nenhum grupo de contatos criado</p>
              <p className="text-xs mt-1">Extraia contatos de um grupo WhatsApp para criar sua primeira lista isolada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contactGroups.map((group) => (
                <div key={group.id} className="rounded-2xl p-4" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold flex-shrink-0" style={{ backgroundColor: "var(--primary)" }}>
                      {(group.name || "GC").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>{group.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
                          {group._count?.items || 0} contatos
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        Origem: {group.sourceGroupName || "manual"}{group.sourceInstance ? ` - ${group.sourceInstance.label || group.sourceInstance.instanceName}` : ""}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        Criado em {new Date(group.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <button
                        type="button"
                        onClick={() => onCreateCampaign(group.id)}
                        className="text-xs font-semibold px-3 py-2 rounded-lg text-white"
                        style={{ backgroundColor: "var(--primary)" }}
                      >
                        Criar campanha
                      </button>
                      <a
                        href={`/api/contact-groups/${group.id}/export`}
                        className="text-xs font-semibold px-3 py-2 rounded-lg border"
                        style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        CSV
                      </a>
                      <button
                        type="button"
                        onClick={() => deleteContactGroup(group.id)}
                        className="text-xs font-semibold px-3 py-2 rounded-lg border"
                        style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
