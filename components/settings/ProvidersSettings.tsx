"use client";

import { useEffect, useState, useCallback } from "react";
import ProviderTutorial from "./ProviderTutorial";

const PROVIDER_TYPES = [
  { value: "uazapi", label: "UazAPI", url_hint: "https://free.uazapi.dev", initials: "UA" },
  { value: "evolution", label: "Evolution API", url_hint: "https://sua-evolution.exemplo.com", initials: "EV" },
  { value: "wppconnect", label: "WPPConnect", url_hint: "http://localhost:21465", initials: "WP" },
];

interface Provider {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKey: string;
  active: boolean;
  isDefault: boolean;
  instances: Instance[];
}

interface Instance {
  id: string;
  instanceName: string;
  label: string;
  status: string;
  phone?: string;
  qrCode?: string;
  createdAt: string;
  conversationsEnabled: boolean;
  providerId?: string;
  ownerId?: string;
  ownerName?: string;
}

interface RemoteInstance { name: string; status: string; phone?: string; }
interface UserOption { id: string; name: string; username: string; role: string; active: boolean; }

const INPUT_CLS = "w-full border rounded-lg px-3 py-2 text-sm outline-none transition-all focus:ring-2";

export default function ProvidersSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ userId: string; role: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", type: "uazapi", baseUrl: "", apiKey: "", isDefault: false });
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState<Record<string, ReturnType<typeof setInterval>>>({});
  const [pingState, setPingState] = useState<Record<string, { loading: boolean; ok?: boolean; detail?: string }>>({});
  const [remoteInstances, setRemoteInstances] = useState<Record<string, { loading: boolean; instances?: RemoteInstance[]; error?: string }>>({});
  const [importing, setImporting] = useState<Record<string, boolean>>({});
  const [importMsg, setImportMsg] = useState<Record<string, string>>({});
  const [editProvider, setEditProvider] = useState<Provider | null>(null);
  const [editForm, setEditForm] = useState({ name: "", baseUrl: "", apiKey: "", type: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  // Delete instance modal
  const [deleteModal, setDeleteModal] = useState<{ provider: Provider; instance: Instance } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // New instance naming modal
  const [newInstanceModal, setNewInstanceModal] = useState<Provider | null>(null);
  const [newInstanceLabel, setNewInstanceLabel] = useState("");

  // Assign user modal
  const [assignModal, setAssignModal] = useState<{ provider: Provider; instance: Instance } | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [assignSaving, setAssignSaving] = useState(false);

  const isAdmin = ["superadmin", "admin"].includes(currentUser?.role ?? "");

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/providers");
    if (res.ok) setProviders(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setCurrentUser({ userId: d.userId, role: d.role });
    });
    loadProviders();
    return () => { Object.values(qrPolling).forEach(clearInterval); };
  }, [loadProviders]);

  // Auto-refresh live status for evolution providers when they load
  useEffect(() => {
    if (providers.length === 0) return;
    for (const p of providers) {
      if (p.type === "evolution" && p.instances.length > 0) {
        // Refresh each instance status silently
        for (const inst of p.instances) {
          fetch(`/api/providers/${p.id}/status?instanceId=${inst.id}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => {
              if (d?.status && d.status !== inst.status) {
                setProviders((prev) =>
                  prev.map((pr) =>
                    pr.id !== p.id ? pr : {
                      ...pr,
                      instances: pr.instances.map((i) =>
                        i.id !== inst.id ? i : { ...i, status: d.status, phone: d.phone || i.phone }
                      ),
                    }
                  )
                );
              }
            })
            .catch(() => {});
        }
      }
    }
  }, [providers.length]); // eslint-disable-line

  async function safeJson(res: Response): Promise<Record<string, unknown>> {
    try { return await res.json(); } catch { return {}; }
  }

  async function createProvider(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setShowNew(false);
        setForm({ name: "", type: "uazapi", baseUrl: "", apiKey: "", isDefault: false });
        loadProviders();
      } else {
        alert(String(data.error || `Erro ${res.status}: falha ao criar provedor`));
      }
    } catch (err) {
      alert(`Erro de conexão: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSaving(false);
    }
  }

  function openEdit(provider: Provider) {
    setEditProvider(provider);
    setEditForm({ name: provider.name, baseUrl: provider.baseUrl, apiKey: "", type: provider.type });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editProvider) return;
    setEditSaving(true);
    try {
      const body: Record<string, string> = { name: editForm.name, baseUrl: editForm.baseUrl, type: editForm.type };
      if (editForm.apiKey.trim()) body.apiKey = editForm.apiKey.trim();
      const res = await fetch(`/api/providers/${editProvider.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditProvider(null);
        setPingState((prev) => { const n = { ...prev }; delete n[editProvider.id]; return n; });
        loadProviders();
      } else {
        const data = await safeJson(res);
        alert(String(data.error || "Erro ao salvar"));
      }
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm("Excluir provedor e todas as instâncias vinculadas?\n\n⚠️ Todas as conversas e mensagens de contatos vinculados a este provedor serão excluídas permanentemente.\n\nEsta ação não pode ser desfeita.")) return;
    try {
      const res = await fetch(`/api/providers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await safeJson(res);
        alert(String(data.error || `Erro ${res.status} ao excluir provedor`));
        return;
      }
      loadProviders();
    } catch (err) {
      alert(`Erro de conexão: ${err instanceof Error ? err.message : err}`);
    }
  }

  async function toggleProvider(provider: Provider) {
    await fetch(`/api/providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !provider.active }),
    });
    loadProviders();
  }

  async function setDefault(id: string) {
    await fetch(`/api/providers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    loadProviders();
  }

  function openNewInstance(provider: Provider) {
    setNewInstanceLabel("");
    setNewInstanceModal(provider);
  }

  async function confirmNewInstance() {
    if (!newInstanceModal) return;
    const provider = newInstanceModal;
    const label = newInstanceLabel.trim() || provider.name;
    setNewInstanceModal(null);
    setNewInstanceLabel("");
    setConnecting(provider.id);
    try {
      const res = await fetch(`/api/providers/${provider.id}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        alert(String(data.error || `Erro ${res.status}: falha ao conectar`));
        return;
      }
      loadProviders();
      if (data.id) startQrPolling(provider.id, data.id as string);
    } catch (err) {
      alert(`Erro de conexão: ${err instanceof Error ? err.message : err}`);
    } finally {
      setConnecting(null);
    }
  }

  function startQrPolling(providerId: string, instanceId: string) {
    const key = `${providerId}_${instanceId}`;
    if (qrPolling[key]) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/providers/${providerId}/qrcode?instanceId=${instanceId}`);
      if (!res.ok) return;
      const data = await res.json();
      setProviders((prev) =>
        prev.map((p) =>
          p.id !== providerId ? p : {
            ...p,
            instances: p.instances.map((i) =>
              i.id !== instanceId ? i : { ...i, qrCode: data.qrCode, status: data.status }
            ),
          }
        )
      );
      if (data.status === "connected") {
        clearInterval(interval);
        setQrPolling((prev) => { const n = { ...prev }; delete n[key]; return n; });
        loadProviders();
      }
    }, 5000);
    setQrPolling((prev) => ({ ...prev, [key]: interval }));
  }

  async function pingProvider(id: string) {
    setPingState((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/providers/${id}/ping`);
      const data = await safeJson(res);
      setPingState((prev) => ({ ...prev, [id]: { loading: false, ok: Boolean(data.ok), detail: String(data.detail || "") } }));
    } catch (e) {
      setPingState((prev) => ({ ...prev, [id]: { loading: false, ok: false, detail: "Falha de conexão" } }));
    }
  }

  async function importInstances(id: string) {
    setImporting((prev) => ({ ...prev, [id]: true }));
    setImportMsg((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch(`/api/providers/${id}/import-instances`, { method: "POST" });
      const data = await safeJson(res);
      if (res.ok) {
        const msg = data.imported
          ? `${data.imported} nova${Number(data.imported) !== 1 ? "s" : ""} instância${Number(data.imported) !== 1 ? "s" : ""} importada${Number(data.imported) !== 1 ? "s" : ""}, ${data.updated} atualizada${Number(data.updated) !== 1 ? "s" : ""}`
          : `${data.updated} instância${Number(data.updated) !== 1 ? "s" : ""} atualizada${Number(data.updated) !== 1 ? "s" : ""} (nenhuma nova)`;
        setImportMsg((prev) => ({ ...prev, [id]: msg }));
        loadProviders();
      } else {
        setImportMsg((prev) => ({ ...prev, [id]: String(data.error || "Erro ao importar") }));
      }
    } catch (e) {
      setImportMsg((prev) => ({ ...prev, [id]: `Erro: ${e instanceof Error ? e.message : e}` }));
    } finally {
      setImporting((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function loadRemoteInstances(id: string) {
    setRemoteInstances((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const res = await fetch(`/api/providers/${id}/remote-instances`);
      const data = await safeJson(res);
      if (data.error) {
        setRemoteInstances((prev) => ({ ...prev, [id]: { loading: false, error: String(data.error) } }));
      } else {
        setRemoteInstances((prev) => ({ ...prev, [id]: { loading: false, instances: data.instances as RemoteInstance[] } }));
      }
    } catch (e) {
      setRemoteInstances((prev) => ({ ...prev, [id]: { loading: false, error: "Falha de conexão" } }));
    }
  }

  async function disconnectInstance(provider: Provider, instance: Instance) {
    if (!confirm(`Desconectar "${instance.label || instance.instanceName}"?`)) return;
    try {
      const res = await fetch(`/api/providers/${provider.id}/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: instance.id }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        alert(String(data.error || `Erro ${res.status} ao desconectar`));
        return;
      }
      loadProviders();
    } catch (err) {
      alert(`Erro de conexão: ${err instanceof Error ? err.message : err}`);
    }
  }

  function openDeleteInstance(provider: Provider, instance: Instance) {
    setDeleteModal({ provider, instance });
  }

  async function confirmDeleteInstance(deleteFromProvider: boolean) {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/providers/${deleteModal.provider.id}/instances/${deleteModal.instance.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteFromProvider }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        alert(String(data.error || "Erro ao remover instância"));
        return;
      }
      setDeleteModal(null);
      loadProviders();
    } finally {
      setDeleting(false);
    }
  }

  async function openAssignUser(provider: Provider, instance: Instance) {
    setAssignModal({ provider, instance });
    setSelectedUserId(instance.ownerId ?? "");
    if (users.length === 0) {
      setLoadingUsers(true);
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
      setLoadingUsers(false);
    }
  }

  async function confirmAssignUser() {
    if (!assignModal) return;
    setAssignSaving(true);
    try {
      const res = await fetch(`/api/providers/${assignModal.provider.id}/instances/${assignModal.instance.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: selectedUserId || null }),
      });
      if (!res.ok) {
        const data = await safeJson(res);
        alert(String(data.error || "Erro ao atribuir usuário"));
        return;
      }
      setAssignModal(null);
      loadProviders();
    } finally {
      setAssignSaving(false);
    }
  }

  const selectedType = PROVIDER_TYPES.find((t) => t.value === form.type);
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/whatsapp/webhook` : "/api/whatsapp/webhook";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Provedores de API WhatsApp
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {isAdmin ? "Conecte UazAPI, Evolution API, WPPConnect ou qualquer provedor compatível" : "Conecte sua instância WhatsApp em um provedor ativo"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTutorial(true)}
            className="flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg border transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--card-bg)" }}
            title="Ver guia de configuração"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Como configurar
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowNew(true)}
              className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              style={{ backgroundColor: "var(--primary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Novo Provedor
            </button>
          )}
        </div>
      </div>

      {showTutorial && <ProviderTutorial onClose={() => setShowTutorial(false)} />}

      {/* ── New instance naming modal ── */}
      {newInstanceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Nova Instância</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{newInstanceModal.name}</p>
              </div>
              <button onClick={() => setNewInstanceModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
                  Nome da instância
                </label>
                <input
                  value={newInstanceLabel}
                  onChange={(e) => setNewInstanceLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmNewInstance()}
                  placeholder="Ex: João Silva | Vendas"
                  autoFocus
                  className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                />
                <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                  Formato sugerido: <span className="font-medium">Nome do usuário | Nome personalizado</span>
                  <br />Exemplo: <span className="font-mono">Maria | Suporte</span>, <span className="font-mono">Carlos | Vendas</span>
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={confirmNewInstance}
                  className="flex-1 text-white py-2.5 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  Criar e Conectar
                </button>
                <button
                  onClick={() => setNewInstanceModal(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm border"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete instance modal ── */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--danger) 12%, transparent)" }}>
                <svg className="w-5 h-5" style={{ color: "var(--danger)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Remover Instância</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {deleteModal.instance.label || deleteModal.instance.instanceName}
                </p>
              </div>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-start gap-2.5 px-3 py-3 rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--warning) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)" }}>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--warning)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs" style={{ color: "var(--warning)" }}>
                  <span className="font-semibold">Atenção:</span> ao remover esta instância, todas as conversas e mensagens vinculadas a ela serão excluídas permanentemente.
                </p>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Escolha como deseja remover esta instância:
              </p>
              <button
                onClick={() => confirmDeleteInstance(false)}
                disabled={deleting}
                className="w-full flex items-start gap-3 px-4 py-4 rounded-xl border-2 text-left transition-all disabled:opacity-40"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--warning)"; e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--warning) 8%, transparent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.backgroundColor = "var(--card-bg)"; }}
              >
                <span className="text-xl leading-none mt-0.5">🗂️</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Apenas do sistema</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Remove do MoviChat mas mantém a instância no servidor {deleteModal.provider.type === "evolution" ? "Evolution" : deleteModal.provider.name}.</p>
                </div>
              </button>
              <button
                onClick={() => confirmDeleteInstance(true)}
                disabled={deleting}
                className="w-full flex items-start gap-3 px-4 py-4 rounded-xl border-2 text-left transition-all disabled:opacity-40"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--danger)"; e.currentTarget.style.backgroundColor = "color-mix(in srgb, var(--danger) 8%, transparent)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.backgroundColor = "var(--card-bg)"; }}
              >
                <span className="text-xl leading-none mt-0.5">🗑️</span>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--danger)" }}>Remover completamente</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Remove do MoviChat e também exclui a instância no servidor {deleteModal.provider.type === "evolution" ? "Evolution" : deleteModal.provider.name}. Esta ação não pode ser desfeita.</p>
                </div>
              </button>
              <button
                onClick={() => setDeleteModal(null)}
                disabled={deleting}
                className="w-full py-2.5 rounded-xl text-sm border transition-colors disabled:opacity-40"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Cancelar
              </button>
              {deleting && (
                <div className="flex items-center justify-center gap-2 py-1">
                  <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--danger)" }} />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>Removendo...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Assign user modal ── */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Vincular Usuário</h3>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {assignModal.instance.label || assignModal.instance.instanceName}
                </p>
              </div>
              <button onClick={() => setAssignModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Selecione o usuário responsável por esta instância. Apenas este usuário (além de admins) terá acesso a ela.
              </p>
              {loadingUsers ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {/* Unassigned option */}
                  <label
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                    style={{
                      backgroundColor: selectedUserId === "" ? "var(--primary-light)" : "transparent",
                      border: `1px solid ${selectedUserId === "" ? "var(--primary)" : "var(--border)"}`,
                    }}
                  >
                    <input
                      type="radio"
                      name="assign-user"
                      checked={selectedUserId === ""}
                      onChange={() => setSelectedUserId("")}
                      style={{ accentColor: "var(--primary)" }}
                    />
                    <div>
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Sem vínculo</p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>Todos os admins terão acesso</p>
                    </div>
                  </label>
                  {users.filter((u) => u.active !== false).map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
                      style={{
                        backgroundColor: selectedUserId === u.id ? "var(--primary-light)" : "transparent",
                        border: `1px solid ${selectedUserId === u.id ? "var(--primary)" : "var(--border)"}`,
                      }}
                    >
                      <input
                        type="radio"
                        name="assign-user"
                        checked={selectedUserId === u.id}
                        onChange={() => setSelectedUserId(u.id)}
                        style={{ accentColor: "var(--primary)" }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{u.name}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>@{u.username} · {u.role}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={confirmAssignUser}
                  disabled={assignSaving || loadingUsers}
                  className="flex-1 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  {assignSaving ? "Salvando..." : "Confirmar Vínculo"}
                </button>
                <button
                  onClick={() => setAssignModal(null)}
                  disabled={assignSaving}
                  className="flex-1 py-2.5 rounded-xl text-sm border"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Webhook info */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "var(--info-light)", border: "1px solid color-mix(in srgb, var(--info) 30%, transparent)" }}>
        <p className="text-sm font-semibold mb-1.5" style={{ color: "var(--info)" }}>
          URL do Webhook — configure no seu provedor
        </p>
        <div className="flex items-center gap-2">
          <code
            className="flex-1 text-xs px-3 py-2 rounded-lg font-mono break-all"
            style={{ backgroundColor: "rgba(255,255,255,0.6)", color: "var(--text-primary)" }}
          >
            {webhookUrl}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(webhookUrl)}
            className="text-xs px-3 py-2 rounded-lg border font-medium whitespace-nowrap"
            style={{ borderColor: "var(--info)", color: "var(--info)", backgroundColor: "rgba(255,255,255,0.5)" }}
          >
            Copiar
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--info)" }}>
          O sistema detecta automaticamente o provedor pela estrutura do evento recebido.
        </p>
      </div>

      {/* Modal novo provedor */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Novo Provedor de API</h3>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={createProvider} className="p-6 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>
                  Tipo de API
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDER_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm({ ...form, type: t.value, baseUrl: "" })}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                      style={
                        form.type === t.value
                          ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)" }
                          : { borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }
                      }
                    >
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: form.type === t.value ? "var(--primary)" : "var(--text-muted)" }}
                      >
                        {t.initials}
                      </span>
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>Nome</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`Ex: ${selectedType?.label} Principal`}
                  className={INPUT_CLS}
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  required
                />
              </div>

              {/* URL */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>URL Base da API</label>
                <input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder={selectedType?.url_hint || "https://..."}
                  className={INPUT_CLS}
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  required
                />
              </div>

              {/* Token */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  {form.type === "uazapi" ? "Token" : form.type === "wppconnect" ? "Secret Key" : "API Key"}
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="Cole sua chave aqui"
                  className={INPUT_CLS}
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  required
                />
              </div>

              {/* Default */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className="relative w-10 h-5 rounded-full transition-colors"
                  style={{ backgroundColor: form.isDefault ? "var(--primary)" : "var(--border)" }}
                  onClick={() => setForm({ ...form, isDefault: !form.isDefault })}
                >
                  <div
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
                    style={{ left: form.isDefault ? "calc(100% - 1.25rem)" : "0.125rem" }}
                  />
                </div>
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Definir como provedor padrão</span>
              </label>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  {saving ? "Salvando..." : "Salvar Provedor"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm border transition-colors"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal editar provedor */}
      {editProvider && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
              <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Editar Provedor</h3>
              <button onClick={() => setEditProvider(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={saveEdit} className="p-6 space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-primary)" }}>Tipo de API</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVIDER_TYPES.map((t) => (
                    <button key={t.value} type="button" onClick={() => setEditForm({ ...editForm, type: t.value })}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all"
                      style={editForm.type === t.value ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)" } : { borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}>
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                        style={{ backgroundColor: editForm.type === t.value ? "var(--primary)" : "var(--text-muted)" }}>{t.initials}</span>
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>Nome</label>
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={INPUT_CLS} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} required />
              </div>
              {/* URL */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>URL Base</label>
                <input value={editForm.baseUrl} onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })}
                  placeholder="https://..." className={INPUT_CLS} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} required />
              </div>
              {/* API Key */}
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                  {editForm.type === "uazapi" ? "Token (Global API Token)" : "API Key"}
                </label>
                <input type="password" value={editForm.apiKey} onChange={(e) => setEditForm({ ...editForm, apiKey: e.target.value })}
                  placeholder="Deixe em branco para manter a chave atual"
                  className={INPUT_CLS} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  {editForm.type === "uazapi"
                    ? "Para UazAPI: é o GLOBAL_API_TOKEN configurado no servidor."
                    : editForm.type === "evolution"
                    ? "Para Evolution API: é a AUTHENTICATION_API_KEY do servidor."
                    : "Para WPPConnect: é o SECRETKEY configurado no servidor (padrão: THISISMYSECRET)."}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={editSaving}
                  className="flex-1 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "var(--primary)" }}>
                  {editSaving ? "Salvando..." : "Salvar Alterações"}
                </button>
                <button type="button" onClick={() => setEditProvider(null)}
                  className="flex-1 py-2.5 rounded-xl text-sm border"
                  style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista de provedores */}
      {providers.length === 0 ? (
        <div
          className="rounded-2xl p-16 text-center border-2 border-dashed"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "var(--primary-light)" }}>
            <svg className="w-7 h-7" style={{ color: "var(--primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="font-semibold text-base" style={{ color: "var(--text-secondary)" }}>Nenhum provedor configurado</p>
          <p className="text-sm mt-1">Adicione um provedor para começar a receber mensagens</p>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              currentUser={currentUser}
              isAdmin={isAdmin}
              connecting={connecting === provider.id}
              ping={pingState[provider.id]}
              remote={remoteInstances[provider.id]}
              importingState={importing[provider.id]}
              importMsg={importMsg[provider.id]}
              onConnect={() => openNewInstance(provider)}
              onDisconnect={(inst) => disconnectInstance(provider, inst)}
              onDeleteInstance={(inst) => openDeleteInstance(provider, inst)}
              onAssignUser={(inst) => openAssignUser(provider, inst)}
              onDelete={() => deleteProvider(provider.id)}
              onToggle={() => toggleProvider(provider)}
              onSetDefault={() => setDefault(provider.id)}
              onStartPolling={(id) => startQrPolling(provider.id, id)}
              onPing={() => pingProvider(provider.id)}
              onLoadRemote={() => loadRemoteInstances(provider.id)}
              onImport={() => importInstances(provider.id)}
              onEdit={() => openEdit(provider)}
              onToggleConversations={(inst) => {
                const updated = { ...inst, conversationsEnabled: !inst.conversationsEnabled };
                fetch(`/api/providers/${provider.id}/instances/${inst.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversationsEnabled: updated.conversationsEnabled }),
                }).then(() => {
                  setProviders((prev) => prev.map((p) =>
                    p.id !== provider.id ? p : {
                      ...p,
                      instances: p.instances.map((i) => i.id === inst.id ? updated : i),
                    }
                  ));
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({ provider, currentUser, isAdmin, connecting, ping, remote, importingState, importMsg, onConnect, onDisconnect, onDeleteInstance, onAssignUser, onDelete, onToggle, onSetDefault, onStartPolling, onPing, onLoadRemote, onImport, onEdit, onToggleConversations }: {
  provider: Provider;
  currentUser: { userId: string; role: string } | null;
  isAdmin: boolean;
  connecting: boolean;
  ping?: { loading: boolean; ok?: boolean; detail?: string };
  remote?: { loading: boolean; instances?: RemoteInstance[]; error?: string };
  importingState?: boolean;
  importMsg?: string;
  onConnect: () => void;
  onDisconnect: (inst: Instance) => void;
  onDeleteInstance: (inst: Instance) => void;
  onAssignUser: (inst: Instance) => void;
  onDelete: () => void;
  onToggle: () => void;
  onSetDefault: () => void;
  onStartPolling: (instanceId: string) => void;
  onPing: () => void;
  onLoadRemote: () => void;
  onImport: () => void;
  onEdit: () => void;
  onToggleConversations: (inst: Instance) => void;
}) {
  const isSuperAdmin = currentUser?.role === "superadmin";
  const typeInfo = PROVIDER_TYPES.find((t) => t.value === provider.type);
  const activeInstances = provider.instances.filter((i) => i.status !== "deleted");
  const connectedCount = provider.instances.filter((i) => i.status === "connected").length;
  const [showRemote, setShowRemote] = useState(false);

  function handleLoadRemote() {
    setShowRemote(true);
    onLoadRemote();
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>

      {/* Header do card */}
      <div className="p-5 flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: "var(--primary)" }}
        >
          {typeInfo?.initials ?? "??"}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
              {provider.name}
            </h3>
            {provider.isDefault && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary-light-text)" }}>
                padrão
              </span>
            )}
            {!provider.active && (
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                inativo
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{typeInfo?.label}</span>
            <span style={{ color: "var(--border)" }}>·</span>
            <span className="text-xs font-mono truncate max-w-xs" style={{ color: "var(--text-muted)" }}>{provider.baseUrl}</span>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {!provider.isDefault && (
              <button
                onClick={onSetDefault}
                className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
              >
                Padrão
              </button>
            )}
            <button
              onClick={onToggle}
              className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
            >
              {provider.active ? "Desativar" : "Ativar"}
            </button>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--text-secondary)" }}
              title="Editar provedor"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--danger)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Resultado do import */}
      {importMsg && (
        <div
          className="px-5 py-2.5 flex items-center gap-2 text-xs"
          style={{
            borderTop: "1px solid var(--border)",
            backgroundColor: "color-mix(in srgb, var(--primary) 6%, transparent)",
            color: "var(--primary)",
          }}
        >
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {importMsg}
        </div>
      )}

      {/* Resultado do ping */}
      {ping && !ping.loading && ping.detail && (
        <div
          className="px-5 py-2.5 flex items-center gap-2 text-xs"
          style={{
            borderTop: "1px solid var(--border)",
            backgroundColor: ping.ok ? "color-mix(in srgb, var(--success) 8%, transparent)" : "color-mix(in srgb, var(--danger) 8%, transparent)",
            color: ping.ok ? "var(--success)" : "var(--danger)",
          }}
        >
          {ping.ok
            ? <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            : <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          }
          {ping.detail}
        </div>
      )}

      {/* Barra de ações */}
      <div
        className="px-5 py-3 flex items-center gap-2 flex-wrap"
        style={{ borderTop: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}
      >
        {/* Status local */}
        <div className="flex items-center gap-1.5 mr-auto">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: connectedCount > 0 ? "var(--success)" : "var(--border)" }} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {connectedCount} conectada{connectedCount !== 1 ? "s" : ""} · {activeInstances.length} local
          </span>
        </div>

        {/* Checar conexão (admin only) */}
        {isAdmin && (
          <button
            onClick={onPing}
            disabled={ping?.loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--card-bg)" }}
          >
            {ping?.loading
              ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            }
            {ping?.loading ? "Testando..." : "Testar Conexão"}
          </button>
        )}

        {/* Importar instâncias existentes (admin only) */}
        {isAdmin && provider.type === "evolution" && (
          <button
            onClick={onImport}
            disabled={importingState}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--primary)", color: "var(--primary)", backgroundColor: "var(--primary-light)" }}
            title="Importar instâncias existentes da Evolution API"
          >
            {importingState
              ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            }
            {importingState ? "Importando..." : "Importar Instâncias"}
          </button>
        )}

        {/* Listar instâncias remotas (admin only) */}
        {isAdmin && (
          <button
            onClick={handleLoadRemote}
            disabled={remote?.loading}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--card-bg)" }}
          >
            {remote?.loading
              ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            }
            {remote?.loading ? "Buscando..." : "Listar Instâncias"}
          </button>
        )}

        {/* Nova instância */}
        <button
          onClick={onConnect}
          disabled={connecting || !provider.active}
          className="flex items-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
          style={{ backgroundColor: "var(--primary)" }}
          onMouseEnter={(e) => { if (!connecting && provider.active) e.currentTarget.style.backgroundColor = "var(--primary-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--primary)"; }}
        >
          {connecting
            ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Criando...</>
            : <><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Nova Instância</>
          }
        </button>
      </div>

      {/* Instâncias remotas */}
      {showRemote && remote && !remote.loading && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div className="px-5 py-2.5 flex items-center justify-between" style={{ backgroundColor: "color-mix(in srgb, var(--info) 8%, transparent)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--info)" }}>
              Instâncias no servidor remoto {remote.instances ? `(${remote.instances.length})` : ""}
            </span>
            <button onClick={() => setShowRemote(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>Fechar</button>
          </div>
          {remote.error ? (
            <div className="px-5 py-3 text-xs" style={{ color: "var(--danger)" }}>{remote.error}</div>
          ) : remote.instances?.length === 0 ? (
            <div className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma instância encontrada no servidor remoto.</div>
          ) : (
            remote.instances?.map((inst, i) => {
              const statusColor = inst.status === "open" || inst.status === "connected" || inst.status === "CONNECTED"
                ? "var(--success)"
                : inst.status === "connecting" || inst.status === "CONNECTING"
                ? "var(--warning)"
                : "var(--text-muted)";
              return (
                <div
                  key={i}
                  className="px-5 py-2.5 flex items-center gap-3"
                  style={{ borderBottom: "1px solid color-mix(in srgb, var(--border) 40%, transparent)" }}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                  <span className="text-sm font-medium flex-1" style={{ color: "var(--text-primary)" }}>{inst.name}</span>
                  <span className="text-xs" style={{ color: statusColor }}>{inst.status}</span>
                  {inst.phone && <span className="text-xs" style={{ color: "var(--text-muted)" }}>{inst.phone}</span>}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Instâncias locais */}
      {activeInstances.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
          <div className="px-5 py-2" style={{ backgroundColor: "color-mix(in srgb, var(--page-bg) 80%, transparent)" }}>
            <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>INSTÂNCIAS LOCAIS</span>
          </div>
          {activeInstances.map((inst) => (
            <InstanceRow
              key={inst.id}
              instance={{ ...inst, providerId: provider.id }}
              showOwner={isSuperAdmin}
              isAdmin={isAdmin}
              onDisconnect={() => onDisconnect(inst)}
              onDeleteInstance={() => onDeleteInstance(inst)}
              onAssignUser={() => onAssignUser(inst)}
              onStartPolling={() => onStartPolling(inst.id)}
              onToggleConversations={() => onToggleConversations(inst)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InstanceRow({ instance, showOwner, isAdmin, onDisconnect, onDeleteInstance, onAssignUser, onStartPolling, onToggleConversations }: {
  instance: Instance;
  showOwner?: boolean;
  isAdmin?: boolean;
  onDisconnect: () => void;
  onDeleteInstance: () => void;
  onAssignUser: () => void;
  onStartPolling: () => void;
  onToggleConversations: () => void;
}) {
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (instance.status === "connecting") onStartPolling();
  }, []); // eslint-disable-line

  const statusColor =
    instance.status === "connected" ? "var(--success)"
    : instance.status === "connecting" ? "var(--warning)"
    : "var(--danger)";

  const statusLabel =
    instance.status === "connected" ? "Conectado"
    : instance.status === "connecting" ? "Aguardando QR Code"
    : "Desconectado";

  const qrSrc = instance.qrCode?.startsWith("data:")
    ? instance.qrCode
    : instance.qrCode ? `data:image/png;base64,${instance.qrCode}` : null;

  return (
    <div className="relative">
      <div
        className="px-5 py-3.5 flex items-center gap-3"
        style={{ borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)" }}
      >
        {/* Status dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            backgroundColor: statusColor,
            boxShadow: instance.status === "connecting" ? `0 0 0 3px color-mix(in srgb, ${statusColor} 20%, transparent)` : "none",
          }}
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {instance.label || instance.instanceName}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs" style={{ color: statusColor }}>{statusLabel}</span>
            {instance.phone && (
              <><span style={{ color: "var(--border)" }}>·</span>
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{instance.phone}</span></>
            )}
            <span style={{ color: "var(--border)" }}>·</span>
            <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>{instance.instanceName}</span>
            {showOwner && instance.ownerName && (
              <><span style={{ color: "var(--border)" }}>·</span>
              <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
                {instance.ownerName}
              </span></>
            )}
            {showOwner && !instance.ownerName && (
              <><span style={{ color: "var(--border)" }}>·</span>
              <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--border)", color: "var(--text-muted)" }}>
                sem dono
              </span></>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Conversations toggle */}
          <button
            onClick={onToggleConversations}
            title={instance.conversationsEnabled ? "Desabilitar conversas" : "Habilitar conversas"}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
            style={instance.conversationsEnabled
              ? { borderColor: "var(--primary)", color: "var(--primary)", backgroundColor: "var(--primary-light)" }
              : { borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "transparent" }}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
            {instance.conversationsEnabled ? "Conversas ativa" : "Conversas off"}
          </button>

          {instance.status === "connecting" && qrSrc && (
            <button
              onClick={() => setShowQr(!showQr)}
              className="text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors"
              style={{
                borderColor: "var(--primary)",
                color: "var(--primary)",
                backgroundColor: showQr ? "var(--primary-light)" : "transparent",
              }}
            >
              {showQr ? "Fechar QR" : "Ver QR Code"}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={onAssignUser}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
              title={instance.ownerName ? `Vinculado a ${instance.ownerName}` : "Vincular usuário"}
              style={instance.ownerName
                ? { borderColor: "var(--primary)", color: "var(--primary)", backgroundColor: "var(--primary-light)" }
                : { borderColor: "var(--border)", color: "var(--text-muted)", backgroundColor: "transparent" }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {instance.ownerName ?? "Vincular"}
            </button>
          )}
          {instance.status !== "disconnected" && (
            <button
              onClick={onDisconnect}
              className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: "var(--danger-light)", color: "var(--danger)", backgroundColor: "transparent" }}
            >
              Desconectar
            </button>
          )}
          {isAdmin && instance.status !== "connected" && (
            <button
              onClick={onDeleteInstance}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--danger)" }}
              title="Remover instância"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* QR Code expandido */}
      {showQr && qrSrc && (
        <div
          className="px-5 py-4 flex items-center gap-6"
          style={{ backgroundColor: "var(--primary-light)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="bg-white p-3 rounded-xl shadow-sm">
            <img src={qrSrc} alt="QR Code WhatsApp" className="w-40 h-40" />
          </div>
          <div>
            <p className="font-semibold text-sm mb-1" style={{ color: "var(--primary-light-text)" }}>
              Conectar WhatsApp
            </p>
            <ol className="text-xs space-y-1" style={{ color: "var(--primary-light-text)" }}>
              <li>1. Abra o WhatsApp no seu celular</li>
              <li>2. Toque em <strong>Aparelhos Conectados</strong></li>
              <li>3. Toque em <strong>Conectar Aparelho</strong></li>
              <li>4. Aponte a câmera para o QR Code</li>
            </ol>
            <p className="text-xs mt-2 opacity-70" style={{ color: "var(--primary-light-text)" }}>
              Atualizando automaticamente a cada 5 segundos
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
