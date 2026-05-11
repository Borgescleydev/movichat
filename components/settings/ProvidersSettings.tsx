"use client";

import { useEffect, useState, useCallback } from "react";

const PROVIDER_TYPES = [
  { value: "uazapi", label: "UazAPI", url_hint: "https://free.uazapi.dev" },
  { value: "evolution", label: "Evolution API", url_hint: "https://sua-evolution.exemplo.com" },
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
}

export default function ProvidersSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", type: "uazapi", baseUrl: "", apiKey: "", isDefault: false });
  const [connecting, setConnecting] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState<Record<string, ReturnType<typeof setInterval>>>({});

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/providers");
    if (res.ok) {
      const data = await res.json();
      setProviders(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProviders();
    return () => { Object.values(qrPolling).forEach(clearInterval); };
  }, [loadProviders]);

  async function createProvider(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/providers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowNew(false);
      setForm({ name: "", type: "uazapi", baseUrl: "", apiKey: "", isDefault: false });
      loadProviders();
    } else {
      const d = await res.json();
      alert(d.error);
    }
  }

  async function deleteProvider(id: string) {
    if (!confirm("Excluir provedor e todas as instâncias?")) return;
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    loadProviders();
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

  async function connectInstance(provider: Provider) {
    setConnecting(provider.id);
    const res = await fetch(`/api/providers/${provider.id}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: `${provider.name} - ${new Date().toLocaleTimeString("pt-BR")}` }),
    });

    if (!res.ok) {
      const d = await res.json();
      alert(`Erro: ${d.error}`);
      setConnecting(null);
      return;
    }

    const instance = await res.json();
    setConnecting(null);
    loadProviders();

    // Start polling for QR code
    startQrPolling(provider.id, instance.id);
  }

  function startQrPolling(providerId: string, instanceId: string) {
    const key = `${providerId}_${instanceId}`;
    if (qrPolling[key]) return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/providers/${providerId}/qrcode?instanceId=${instanceId}`);
      if (res.ok) {
        const data = await res.json();
        setProviders((prev) =>
          prev.map((p) =>
            p.id === providerId
              ? {
                  ...p,
                  instances: p.instances.map((inst) =>
                    inst.id === instanceId
                      ? { ...inst, qrCode: data.qrCode, status: data.status }
                      : inst
                  ),
                }
              : p
          )
        );

        if (data.status === "connected") {
          clearInterval(interval);
          setQrPolling((prev) => { const n = { ...prev }; delete n[key]; return n; });
          loadProviders();
        }
      }
    }, 5000);

    setQrPolling((prev) => ({ ...prev, [key]: interval }));
  }

  async function disconnectInstance(provider: Provider, instance: Instance) {
    if (!confirm(`Desconectar "${instance.label}"?`)) return;
    await fetch(`/api/providers/${provider.id}/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: instance.id }),
    });
    loadProviders();
  }

  const selectedType = PROVIDER_TYPES.find((t) => t.value === form.type);

  if (loading) {
    return <div className="flex items-center justify-center h-32"><div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Provedores de API WhatsApp</h2>
          <p className="text-sm text-gray-500 mt-1">Configure UazAPI, Evolution API ou outros provedores compatíveis</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Provedor
        </button>
      </div>

      {/* Webhook URL info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-medium text-blue-800 mb-1">URL do Webhook (configure no seu provedor)</p>
        <code className="text-xs bg-blue-100 text-blue-900 px-3 py-1.5 rounded block">
          {typeof window !== "undefined" ? window.location.origin : ""}/api/whatsapp/webhook
        </code>
        <p className="text-xs text-blue-600 mt-2">
          Esta URL recebe eventos de mensagens e status de qualquer provedor configurado.
          O sistema identifica automaticamente o provedor pela estrutura do evento.
        </p>
      </div>

      {/* New provider modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Novo Provedor</h3>
            <form onSubmit={createProvider} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do provedor</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: UazAPI Principal"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de API</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value, baseUrl: "" })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL Base da API</label>
                <input
                  value={form.baseUrl}
                  onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                  placeholder={selectedType?.url_hint || "https://..."}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {form.type === "uazapi" ? "Token" : "API Key"}
                </label>
                <input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="Cole sua chave de API aqui"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  className="w-4 h-4 text-green-600 rounded"
                />
                <span className="text-sm text-gray-700">Definir como provedor padrão</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 bg-green-600 text-white py-2.5 rounded-lg hover:bg-green-700 text-sm font-medium">
                  Salvar Provedor
                </button>
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-lg hover:bg-gray-50 text-sm">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Provider cards */}
      {providers.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <p className="font-medium">Nenhum provedor configurado</p>
          <p className="text-sm mt-1">Adicione um provedor para conectar o WhatsApp</p>
        </div>
      ) : (
        <div className="space-y-4">
          {providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              connecting={connecting === provider.id}
              onConnect={() => connectInstance(provider)}
              onDisconnect={(inst) => disconnectInstance(provider, inst)}
              onDelete={() => deleteProvider(provider.id)}
              onToggle={() => toggleProvider(provider)}
              onSetDefault={() => setDefault(provider.id)}
              onStartPolling={(instanceId) => startQrPolling(provider.id, instanceId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider, connecting, onConnect, onDisconnect, onDelete, onToggle, onSetDefault, onStartPolling
}: {
  provider: Provider;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: (inst: Instance) => void;
  onDelete: () => void;
  onToggle: () => void;
  onSetDefault: () => void;
  onStartPolling: (instanceId: string) => void;
}) {
  const typeLabel = PROVIDER_TYPES.find((t) => t.value === provider.type)?.label || provider.type;
  const activeInstances = provider.instances.filter((i) => i.status !== "deleted");
  const connectedInstances = provider.instances.filter((i) => i.status === "connected");

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Provider header */}
      <div className="p-5 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-sm font-bold ${
            provider.type === "uazapi" ? "bg-green-600" : "bg-blue-600"
          }`}>
            {provider.type === "uazapi" ? "UA" : "EV"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{provider.name}</h3>
              {provider.isDefault && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">padrão</span>
              )}
              {!provider.active && (
                <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">inativo</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-400">{typeLabel}</span>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-400 font-mono truncate max-w-48">{provider.baseUrl}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!provider.isDefault && (
            <button onClick={onSetDefault} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 border border-gray-200 rounded-md">
              Padrão
            </button>
          )}
          <button onClick={onToggle} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 border border-gray-200 rounded-md">
            {provider.active ? "Desativar" : "Ativar"}
          </button>
          <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1.5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-5 pb-4 flex items-center gap-4 text-sm text-gray-500">
        <span>{connectedInstances.length} conectada(s)</span>
        <span className="text-gray-200">|</span>
        <span>{activeInstances.length} instância(s) total</span>
        <div className="flex-1" />
        <button
          onClick={onConnect}
          disabled={connecting || !provider.active}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm px-3 py-1.5 rounded-lg font-medium transition-colors"
        >
          {connecting ? (
            <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Criando...</>
          ) : (
            <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Nova Instância</>
          )}
        </button>
      </div>

      {/* Instances */}
      {activeInstances.length > 0 && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {activeInstances.map((inst) => (
            <InstanceRow
              key={inst.id}
              instance={inst}
              onDisconnect={() => onDisconnect(inst)}
              onStartPolling={() => onStartPolling(inst.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InstanceRow({ instance, onDisconnect, onStartPolling }: {
  instance: Instance;
  onDisconnect: () => void;
  onStartPolling: () => void;
}) {
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (instance.status === "connecting") {
      onStartPolling();
    }
  }, []);

  const statusColor = instance.status === "connected" ? "bg-green-500" :
    instance.status === "connecting" ? "bg-yellow-500 animate-pulse" : "bg-red-400";

  const statusLabel = instance.status === "connected" ? "Conectado" :
    instance.status === "connecting" ? "Aguardando QR" : "Desconectado";

  return (
    <div className="px-5 py-3 flex items-center gap-3">
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{instance.label || instance.instanceName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-gray-400">{statusLabel}</span>
          {instance.phone && <><span className="text-gray-300">·</span><span className="text-xs text-gray-400">{instance.phone}</span></>}
          <span className="text-gray-300">·</span>
          <span className="text-xs text-gray-300 font-mono">{instance.instanceName}</span>
        </div>
      </div>

      {instance.status === "connecting" && instance.qrCode && (
        <button
          onClick={() => setShowQr(!showQr)}
          className="text-xs text-green-600 hover:text-green-700 font-medium border border-green-200 px-2 py-1 rounded-md"
        >
          {showQr ? "Ocultar QR" : "Ver QR Code"}
        </button>
      )}

      {instance.status !== "disconnected" && (
        <button onClick={onDisconnect} className="text-xs text-red-400 hover:text-red-600 px-2 py-1">
          Desconectar
        </button>
      )}

      {/* QR Code panel */}
      {showQr && instance.qrCode && (
        <div className="absolute right-8 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-10">
          <p className="text-xs text-gray-500 mb-3 text-center">Escaneie com o WhatsApp</p>
          <img
            src={instance.qrCode.startsWith("data:") ? instance.qrCode : `data:image/png;base64,${instance.qrCode}`}
            alt="QR Code"
            className="w-48 h-48"
          />
          <p className="text-xs text-gray-400 mt-2 text-center">Atualizando automaticamente...</p>
        </div>
      )}
    </div>
  );
}
