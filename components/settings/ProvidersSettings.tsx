"use client";

import { useEffect, useState, useCallback } from "react";

const PROVIDER_TYPES = [
  { value: "uazapi", label: "UazAPI", url_hint: "https://free.uazapi.dev", initials: "UA" },
  { value: "evolution", label: "Evolution API", url_hint: "https://sua-evolution.exemplo.com", initials: "EV" },
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

const INPUT_CLS = "w-full border rounded-lg px-3 py-2 text-sm outline-none transition-all focus:ring-2";

export default function ProvidersSettings() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", type: "uazapi", baseUrl: "", apiKey: "", isDefault: false });
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState<Record<string, ReturnType<typeof setInterval>>>({});

  const loadProviders = useCallback(async () => {
    const res = await fetch("/api/providers");
    if (res.ok) setProviders(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadProviders();
    return () => { Object.values(qrPolling).forEach(clearInterval); };
  }, [loadProviders]);

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
    try {
      const res = await fetch(`/api/providers/${provider.id}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: `${provider.name} · ${new Date().toLocaleTimeString("pt-BR")}` }),
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

  async function disconnectInstance(provider: Provider, instance: Instance) {
    if (!confirm(`Desconectar "${instance.label || instance.instanceName}"?`)) return;
    await fetch(`/api/providers/${provider.id}/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId: instance.id }),
    });
    loadProviders();
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
            Conecte UazAPI, Evolution API ou qualquer provedor compatível
          </p>
        </div>
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
      </div>

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
                  {form.type === "uazapi" ? "Token" : "API Key"}
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
              connecting={connecting === provider.id}
              onConnect={() => connectInstance(provider)}
              onDisconnect={(inst) => disconnectInstance(provider, inst)}
              onDelete={() => deleteProvider(provider.id)}
              onToggle={() => toggleProvider(provider)}
              onSetDefault={() => setDefault(provider.id)}
              onStartPolling={(id) => startQrPolling(provider.id, id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderCard({ provider, connecting, onConnect, onDisconnect, onDelete, onToggle, onSetDefault, onStartPolling }: {
  provider: Provider;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: (inst: Instance) => void;
  onDelete: () => void;
  onToggle: () => void;
  onSetDefault: () => void;
  onStartPolling: (instanceId: string) => void;
}) {
  const typeInfo = PROVIDER_TYPES.find((t) => t.value === provider.type);
  const activeInstances = provider.instances.filter((i) => i.status !== "deleted");
  const connectedCount = provider.instances.filter((i) => i.status === "connected").length;

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
            onClick={onDelete}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--danger)" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Barra de status + botão */}
      <div
        className="px-5 py-3 flex items-center gap-4"
        style={{ borderTop: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}
      >
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: connectedCount > 0 ? "var(--success)" : "var(--border)" }} />
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {connectedCount} conectada{connectedCount !== 1 ? "s" : ""} · {activeInstances.length} instância{activeInstances.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex-1" />
        <button
          onClick={onConnect}
          disabled={connecting || !provider.active}
          className="flex items-center gap-2 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
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

      {/* Instâncias */}
      {activeInstances.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)" }}>
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
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
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
          {instance.status !== "disconnected" && (
            <button
              onClick={onDisconnect}
              className="text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: "var(--danger-light)", color: "var(--danger)", backgroundColor: "transparent" }}
            >
              Desconectar
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
