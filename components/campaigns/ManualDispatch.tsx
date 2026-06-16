"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";

interface Instance { id: string; label: string | null; instanceName: string; status: string; }
interface Group { id: string; name: string; groupJid: string; participantCount: number; }
interface DispatchGroup {
  id: string;
  name: string;
  items: { group: Group & { instance?: Instance } }[];
}
interface ContactGroup {
  id: string;
  name: string;
  sourceGroupName: string | null;
  sourceGroupJid: string | null;
  _count?: { items: number };
}
interface Template { id: string; name: string; body: string; variables: string; mediaType: string | null; mediaUrl: string | null; mediaCaption: string | null; }
interface DispatchResult { groupId: string; name: string; status: "sent" | "failed"; error?: string; }
interface Campaign { id: string; name: string; status: string; sentCount: number; failedCount: number; pendingCount: number; totalGroups: number; }

type MediaTab = "none" | "image" | "video" | "document" | "audio";

const MESSAGE_LIMIT = 4096;
const CAPTION_LIMIT = 1024;

const MEDIA_TABS: { id: MediaTab; label: string; accept: string; icon: string }[] = [
  { id: "none",     label: "Sem mídia",  accept: "",                           icon: "✍️" },
  { id: "image",    label: "Imagem",     accept: "image/*",                    icon: "🖼️" },
  { id: "video",    label: "Vídeo",      accept: "video/*",                    icon: "🎬" },
  { id: "document", label: "Documento",  accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv", icon: "📄" },
  { id: "audio",    label: "Áudio",      accept: "audio/*",                    icon: "🎵" },
];

export default function ManualDispatch() {
  // Instances & groups
  const [instances, setInstances] = useState<Instance[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedInstance, setSelectedInstance] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [groupSearch, setGroupSearch] = useState("");
  const [loadingInst, setLoadingInst] = useState(true);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [dispatchGroups, setDispatchGroups] = useState<DispatchGroup[]>([]);
  const [selectedDispatchGroupId, setSelectedDispatchGroupId] = useState("");
  const [contactGroups, setContactGroups] = useState<ContactGroup[]>([]);
  const [collectingContacts, setCollectingContacts] = useState(false);
  const [collectMessage, setCollectMessage] = useState("");

  // Message
  const [message, setMessage] = useState("");
  const [mediaTab, setMediaTab] = useState<MediaTab>("none");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaBase64, setMediaBase64] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [mediaInputMode, setMediaInputMode] = useState<"file" | "url">("file");
  const fileRef = useRef<HTMLInputElement>(null);

  // Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // Campaigns
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [activeSection, setActiveSection] = useState<"compose" | "history" | "campaigns">("compose");

  // Results
  const [results, setResults] = useState<DispatchResult[] | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [dispatchMode, setDispatchMode] = useState<"now" | "scheduled">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const msgRef = useRef<HTMLTextAreaElement | null>(null);

  const loadInstances = useCallback(async () => {
    setLoadingInst(true);
    const res = await fetch("/api/providers");
    if (!res.ok) { setLoadingInst(false); return; }
    const providers = await res.json();
    const all: Instance[] = [];
    for (const p of providers) {
      if (["evolution", "wppconnect"].includes(p.type)) {
        for (const inst of p.instances || []) all.push(inst);
      }
    }
    setInstances(all);
    const connected = all.find((i) => i.status === "connected");
    if (connected) setSelectedInstance((prev) => prev || connected.id);
    setLoadingInst(false);
  }, []);

  const loadGroups = useCallback(async () => {
    if (!selectedInstance) return;
    setLoadingGroups(true);
    setSelectedGroups(new Set());
    const res = await fetch(`/api/campaigns/groups?instanceId=${selectedInstance}`);
    if (res.ok) { const d = await res.json(); setGroups(d.groups || []); }
    setLoadingGroups(false);
  }, [selectedInstance]);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/campaigns/templates");
    if (res.ok) setTemplates(await res.json());
  }, []);

  const loadCampaigns = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    if (res.ok) {
      const json = await res.json();
      setCampaigns(json.data ?? []);
    }
  }, []);

  const loadDispatchGroups = useCallback(async () => {
    const res = await fetch("/api/campaigns/dispatch-groups");
    if (res.ok) {
      const data = await res.json();
      setDispatchGroups(data.dispatchGroups || []);
    }
  }, []);

  const loadContactGroups = useCallback(async () => {
    const res = await fetch("/api/contact-groups");
    if (res.ok) {
      const data = await res.json();
      setContactGroups(data.contactGroups || []);
    }
  }, []);

  useEffect(() => { loadInstances(); loadTemplates(); loadCampaigns(); loadDispatchGroups(); loadContactGroups(); }, []);
  useEffect(() => { loadGroups(); }, [selectedInstance]);

  // Apply template
  useEffect(() => {
    if (!selectedTemplate) return;
    const tpl = templates.find((t) => t.id === selectedTemplate);
    if (!tpl) return;
    setMessage(tpl.body);
    if (tpl.mediaType) {
      setMediaTab(tpl.mediaType as MediaTab);
      setMediaUrl(tpl.mediaUrl || "");
      setMediaCaption(tpl.mediaCaption || "");
      setMediaInputMode("url");
    }
  }, [selectedTemplate, templates]);

  // File selection → base64
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaBase64("");
    const reader = new FileReader();
    reader.onload = () => setMediaBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearMedia() {
    setMediaFile(null); setMediaBase64(""); setMediaUrl(""); setMediaCaption("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const [groupSort, setGroupSort] = useState<"selected" | "alpha">("selected");

  // Memoized so the filter + localeCompare sort only re-runs when its inputs change,
  // instead of on every render (e.g. each keystroke in the search field).
  const filteredGroups = useMemo(() => {
    const base = groups.filter((g) =>
      g.name.toLowerCase().includes(groupSearch.toLowerCase()) || g.groupJid.includes(groupSearch)
    );
    if (groupSort === "alpha") return [...base].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    // selected-first: selected on top (in original order), then unselected (alphabetical)
    const sel = base.filter((g) => selectedGroups.has(g.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    const unsel = base.filter((g) => !selectedGroups.has(g.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return [...sel, ...unsel];
  }, [groups, groupSearch, groupSort, selectedGroups]);

  function toggleGroup(id: string) {
    setSelectedGroups((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleAll() {
    if (selectedGroups.size === filteredGroups.length) setSelectedGroups(new Set());
    else setSelectedGroups(new Set(filteredGroups.map((g) => g.id)));
  }

  function applyDispatchGroup(id: string) {
    setSelectedDispatchGroupId(id);
    const dispatchGroup = dispatchGroups.find((dg) => dg.id === id);
    if (!dispatchGroup) return;
    const ids = dispatchGroup.items
      .map((item) => item.group)
      .filter((group) => !selectedInstance || group.instance?.id === selectedInstance || groups.some((g) => g.id === group.id))
      .map((group) => group.id);
    setSelectedGroups(new Set(ids));
    if (ids.length === 0) {
      setSendError("Esse grupo de disparo nao possui grupos da instancia selecionada.");
    } else if (sendError) {
      setSendError("");
    }
  }

  async function collectSelectedGroupContacts() {
    const groupId = Array.from(selectedGroups)[0];
    if (!groupId) {
      setCollectMessage("Selecione um grupo para coletar contatos.");
      return;
    }
    setCollectingContacts(true);
    setCollectMessage("");
    try {
      const group = groups.find((g) => g.id === groupId);
      const res = await fetch(`/api/campaigns/groups/${groupId}/collect-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: group ? `Contatos - ${group.name}` : undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCollectMessage(data.error || "Erro ao coletar contatos.");
        return;
      }
      setCollectMessage(`${data.imported} contato(s) coletados em "${data.contactGroup.name}".`);
      await loadContactGroups();
    } finally {
      setCollectingContacts(false);
    }
  }

  const inst = instances.find((i) => i.id === selectedInstance);
  const isConnected = inst?.status === "connected";
  const effectiveMedia = mediaInputMode === "file" ? mediaBase64 : mediaUrl;
  const hasMedia = mediaTab !== "none" && effectiveMedia.trim();
  const msgOverLimit = message.length > MESSAGE_LIMIT;
  const capOverLimit = mediaCaption.length > CAPTION_LIMIT;
  const canSend = isConnected && selectedGroups.size > 0 && (message.trim() || hasMedia) && !msgOverLimit && !capOverLimit && (dispatchMode === "now" || Boolean(scheduledFor));

  async function dispatch() {
    if (!isConnected || selectedGroups.size === 0) return;
    setSendError("");
    if (msgOverLimit) {
      setSendError(`A mensagem excede o limite de ${MESSAGE_LIMIT.toLocaleString("pt-BR")} caracteres. Remova ${(message.length - MESSAGE_LIMIT).toLocaleString("pt-BR")} caractere(s).`);
      msgRef.current?.focus();
      return;
    }
    if (capOverLimit) {
      setSendError(`A legenda excede o limite de ${CAPTION_LIMIT.toLocaleString("pt-BR")} caracteres. Remova ${(mediaCaption.length - CAPTION_LIMIT).toLocaleString("pt-BR")} caractere(s).`);
      return;
    }
    if (!message.trim() && !hasMedia) {
      setSendError("Digite uma mensagem ou selecione uma mídia antes de disparar.");
      return;
    }
    if (dispatchMode === "scheduled" && !scheduledFor) {
      setSendError("Informe a data e hora do agendamento.");
      return;
    }
    setSending(true); setResults(null);
    try {
      const res = await fetch(dispatchMode === "scheduled" ? "/api/campaigns/manual-dispatch/scheduled" : "/api/campaigns/manual-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: selectedInstance,
          groupIds: Array.from(selectedGroups),
          message: message.trim() || (mediaCaption.trim() || ""),
          mediaType: hasMedia ? mediaTab : undefined,
          mediaUrl: hasMedia ? effectiveMedia : undefined,
          mediaCaption: hasMedia ? mediaCaption : undefined,
          fileName: mediaFile?.name,
          scheduledFor: dispatchMode === "scheduled" ? new Date(scheduledFor).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && dispatchMode === "scheduled") {
        setResults(null);
        alert(`Disparo agendado para ${new Date(data.scheduledFor).toLocaleString("pt-BR")}.`);
      } else if (res.ok) setResults(data.results || []);
      else alert(data.error || "Erro ao disparar");
    } finally { setSending(false); }
  }

  if (loadingInst) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
    </div>
  );

  return (
    <div className="max-w-6xl space-y-5">
      {/* Section tabs */}
      <div className="flex gap-2">
        {([
          { id: "compose",   label: "Compor Disparo",      icon: "✍️" },
          { id: "history",   label: "Histórico de Disparos", icon: "📋" },
          { id: "campaigns", label: "Campanhas Agendadas",  icon: "📊" },
        ] as const).map((s) => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={activeSection === s.id
              ? { backgroundColor: "var(--primary)", color: "#fff" }
              : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {activeSection === "compose" && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.4fr_320px] gap-5">

          {/* ─── COL 1: Instance + Groups ─── */}
          <div className="space-y-4">
            {/* Instance */}
            <div className="rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Instância</p>
              {instances.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma instância. Importe em Configurações → Provedores.</p>
              ) : instances.map((i) => (
                <label key={i.id} className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all"
                  style={{ border: "2px solid", borderColor: selectedInstance === i.id ? "var(--primary)" : "var(--border)", backgroundColor: selectedInstance === i.id ? "var(--primary-light)" : "transparent" }}>
                  <input type="radio" name="instance" value={i.id} checked={selectedInstance === i.id} onChange={() => setSelectedInstance(i.id)} className="sr-only" />
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: i.status === "connected" ? "var(--success)" : "var(--danger)" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{i.label || i.instanceName}</p>
                    <p className="text-xs" style={{ color: i.status === "connected" ? "var(--success)" : "var(--text-muted)" }}>
                      {i.status === "connected" ? "Conectado" : "Desconectado"}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {dispatchGroups.length > 0 && (
              <div className="rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Grupo de disparo</p>
                <select
                  value={selectedDispatchGroupId}
                  onChange={(e) => applyDispatchGroup(e.target.value)}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}
                >
                  <option value="">Selecionar grupos salvos...</option>
                  {dispatchGroups.map((dg) => (
                    <option key={dg.id} value={dg.id}>{dg.name} ({dg.items.length})</option>
                  ))}
                </select>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Aplica uma lista pronta de grupos ao disparo manual.
                </p>
              </div>
            )}

            {/* Groups */}
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
              <div className="p-3 space-y-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Grupos {selectedGroups.size > 0 && <span style={{ color: "var(--primary)" }}>({selectedGroups.size} sel.)</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    {/* Sort toggle */}
                    <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                      {([["selected", "★ Sel."], ["alpha", "A-Z"]] as const).map(([mode, label]) => (
                        <button key={mode} onClick={() => setGroupSort(mode)}
                          className="px-2 py-1 text-xs transition-colors"
                          style={groupSort === mode
                            ? { backgroundColor: "var(--primary)", color: "#fff" }
                            : { backgroundColor: "transparent", color: "var(--text-muted)" }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    {filteredGroups.length > 0 && (
                      <button onClick={toggleAll} className="text-xs" style={{ color: "var(--primary)" }}>
                        {selectedGroups.size === filteredGroups.length ? "Desmarcar" : "Todos"}
                      </button>
                    )}
                  </div>
                </div>
                <input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)}
                  placeholder="Buscar grupo..." className="w-full text-xs rounded-lg px-3 py-2 outline-none"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: "360px" }}>
                {loadingGroups ? (
                  <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} /></div>
                ) : filteredGroups.length === 0 ? (
                  <p className="p-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                    {groups.length === 0 ? "Sincronize grupos na aba Grupos" : "Nenhum grupo encontrado"}
                  </p>
                ) : filteredGroups.map((g, i) => {
                  const checked = selectedGroups.has(g.id);
                  const isFirstUnselected = groupSort === "selected" && !checked &&
                    (i === 0 || selectedGroups.has(filteredGroups[i - 1].id));
                  return (
                    <div key={g.id}>
                      {isFirstUnselected && selectedGroups.size > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1" style={{ borderBottom: "1px solid var(--border)", borderTop: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 80%, transparent)" }}>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Outros grupos</span>
                        </div>
                      )}
                    <label className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
                      style={{ borderBottom: i < filteredGroups.length - 1 ? "1px solid color-mix(in srgb, var(--border) 40%, transparent)" : "none", backgroundColor: checked ? "var(--primary-light)" : "transparent" }}>
                      <div className="w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: checked ? "var(--primary)" : "var(--border)", backgroundColor: checked ? "var(--primary)" : "transparent" }}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <input type="checkbox" checked={checked} onChange={() => toggleGroup(g.id)} className="sr-only" />
                      <GroupAvatar name={g.name} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{g.name}</p>
                        {g.participantCount > 0 && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{g.participantCount} part.</p>}
                      </div>
                    </label>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── COL 2: Composer ─── */}
          <div className="rounded-2xl p-4 space-y-3 xl:col-start-1 xl:row-start-2" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Contatos dos grupos</p>
              {contactGroups.length > 0 && <span className="text-xs" style={{ color: "var(--primary)" }}>{contactGroups.length} lista(s)</span>}
            </div>
            <button
              type="button"
              onClick={collectSelectedGroupContacts}
              disabled={collectingContacts || selectedGroups.size === 0}
              className="w-full text-xs font-semibold rounded-lg px-3 py-2 disabled:opacity-40"
              style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}
            >
              {collectingContacts ? "Coletando..." : "Coletar contatos do primeiro grupo selecionado"}
            </button>
            {collectMessage && <p className="text-xs" style={{ color: collectMessage.includes("coletado") ? "var(--success)" : "var(--danger)" }}>{collectMessage}</p>}
            {contactGroups.length > 0 && (
              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {contactGroups.slice(0, 6).map((cg) => (
                  <div key={cg.id} className="flex items-center gap-2 rounded-lg px-2 py-2" style={{ border: "1px solid var(--border)", backgroundColor: "var(--page-bg)" }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{cg.name}</p>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                        {cg._count?.items || 0} contatos{cg.sourceGroupName ? ` - ${cg.sourceGroupName}` : ""}
                      </p>
                    </div>
                    <a href={`/api/contact-groups/${cg.id}/export`} className="text-xs px-2 py-1 rounded-md" style={{ backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
                      CSV
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 xl:col-start-2 xl:row-start-1 xl:row-span-2">
            {/* Template selector */}
            {templates.length > 0 && (
              <div className="rounded-xl p-3 flex items-center gap-3" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
                <svg className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <select value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="flex-1 text-sm outline-none bg-transparent"
                  style={{ color: "var(--text-primary)" }}>
                  <option value="">Usar template...</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {selectedTemplate && (
                  <button onClick={() => setSelectedTemplate("")} className="text-xs" style={{ color: "var(--text-muted)" }}>✕</button>
                )}
              </div>
            )}

            {/* Text message */}
            <div className="rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Mensagem de texto</p>
              <FormattedTextArea
                value={message}
                onChange={(v) => { setMessage(v); if (sendError) setSendError(""); }}
                limit={MESSAGE_LIMIT}
                placeholder="Digite a mensagem... Use {{variavel}} para personalizar."
                minRows={10}
                showFormatting
                inputRef={msgRef}
              />
            </div>

            {/* Media section */}
            <div className="rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Mídia (opcional)</p>

              {/* Media type tabs */}
              <div className="flex gap-1 flex-wrap">
                {MEDIA_TABS.map((t) => (
                  <button key={t.id} onClick={() => { setMediaTab(t.id); clearMedia(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={mediaTab === t.id
                      ? { backgroundColor: "var(--primary)", color: "#fff" }
                      : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
                    <span>{t.icon}</span> {t.label}
                  </button>
                ))}
              </div>

              {mediaTab !== "none" && (
                <div className="space-y-3">
                  {/* Input mode toggle */}
                  <div className="flex gap-2">
                    {(["file", "url"] as const).map((m) => (
                      <button key={m} onClick={() => { setMediaInputMode(m); clearMedia(); }}
                        className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                        style={mediaInputMode === m
                          ? { borderColor: "var(--primary)", color: "var(--primary)", backgroundColor: "var(--primary-light)" }
                          : { borderColor: "var(--border)", color: "var(--text-muted)" }}>
                        {m === "file" ? "📁 Arquivo" : "🔗 URL"}
                      </button>
                    ))}
                  </div>

                  {mediaInputMode === "file" ? (
                    <div>
                      <input ref={fileRef} type="file"
                        accept={MEDIA_TABS.find((t) => t.id === mediaTab)?.accept || "*"}
                        onChange={handleFileSelect} className="hidden" id="media-file" />
                      <label htmlFor="media-file"
                        className="flex flex-col items-center justify-center gap-2 rounded-xl p-6 cursor-pointer border-2 border-dashed transition-colors"
                        style={{ borderColor: mediaFile ? "var(--primary)" : "var(--border)", backgroundColor: mediaFile ? "var(--primary-light)" : "var(--page-bg)" }}>
                        {mediaFile ? (
                          <>
                            <span className="text-2xl">{MEDIA_TABS.find((t) => t.id === mediaTab)?.icon}</span>
                            <span className="text-xs font-medium text-center truncate max-w-full" style={{ color: "var(--primary)" }}>{mediaFile.name}</span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>{(mediaFile.size / 1024).toFixed(0)} KB</span>
                          </>
                        ) : (
                          <>
                            <span className="text-2xl opacity-40">{MEDIA_TABS.find((t) => t.id === mediaTab)?.icon}</span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Clique para selecionar {mediaTab}</span>
                          </>
                        )}
                      </label>
                      {mediaFile && (
                        <button onClick={clearMedia} className="text-xs mt-1" style={{ color: "var(--danger)" }}>Remover arquivo</button>
                      )}
                    </div>
                  ) : (
                    <input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder={`URL do ${mediaTab} (https://...)`}
                      className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                      style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
                  )}

                  {/* Caption (not for audio) */}
                  {mediaTab !== "audio" && (
                    <div>
                      <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Legenda (opcional)</p>
                      <FormattedTextArea
                        value={mediaCaption}
                        onChange={(v) => { setMediaCaption(v); if (sendError) setSendError(""); }}
                        limit={CAPTION_LIMIT}
                        placeholder="Legenda da mídia..."
                        minRows={3}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pre-send error */}
            {sendError && (
              <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "color-mix(in srgb, var(--danger) 10%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)", color: "var(--danger)" }}>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span>{sendError}</span>
              </div>
            )}

            <div className="rounded-2xl p-4 space-y-3" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Quando enviar</p>
              <div className="grid grid-cols-2 gap-2">
                {([["now", "Enviar agora"], ["scheduled", "Agendar"]] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDispatchMode(mode)}
                    className="text-sm font-semibold rounded-lg px-3 py-2"
                    style={dispatchMode === mode
                      ? { backgroundColor: "var(--primary)", color: "#fff" }
                      : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {dispatchMode === "scheduled" && (
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full text-sm rounded-lg px-3 py-2 outline-none"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}
                />
              )}
            </div>

            {/* Send button */}
            <button onClick={dispatch} disabled={sending || !canSend}
              className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40"
              style={{ backgroundColor: "var(--primary)" }}>
              {sending ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {dispatchMode === "scheduled" ? "Agendando..." : `Disparando para ${selectedGroups.size} grupo${selectedGroups.size !== 1 ? "s" : ""}...`}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  {dispatchMode === "scheduled" ? "Agendar disparo" : "Disparar Agora"} {selectedGroups.size > 0 && `(${selectedGroups.size} grupo${selectedGroups.size !== 1 ? "s" : ""})`}
                </span>
              )}
            </button>

            {/* Results */}
            {results && <DispatchResults results={results} />}
          </div>

          {/* ─── COL 3: Phone Mockup ─── */}
          <div className="hidden xl:block xl:col-start-3 xl:row-start-1 xl:row-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Pré-visualização</p>
            <PhoneMockup
              message={message}
              mediaTab={mediaTab}
              mediaPreview={mediaBase64 || (mediaInputMode === "url" ? mediaUrl : "")}
              mediaCaption={mediaCaption}
              mediaFileName={mediaFile?.name}
              groupName={filteredGroups.find((g) => selectedGroups.has(g.id))?.name || "Grupo"}
            />
          </div>
        </div>
      )}

      {activeSection === "history" && (
        <DispatchHistory instances={instances} />
      )}

      {activeSection === "campaigns" && (
        <CampaignDispatchView campaigns={campaigns} onRefresh={loadCampaigns} />
      )}
    </div>
  );
}

// ─── GroupAvatar ────────────────────────────────────────────
const GROUP_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316",
  "#eab308","#22c55e","#10b981","#06b6d4","#3b82f6",
];

function groupColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

function GroupAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || name.charAt(0).toUpperCase();

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      backgroundColor: groupColor(name),
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: "#fff",
      letterSpacing: "-0.5px", userSelect: "none",
    }}>
      {initials}
    </div>
  );
}

// ─── FormattedTextArea ──────────────────────────────────────
function FormattedTextArea({
  value, onChange, limit, placeholder, minRows = 5, showFormatting = false,
  inputRef,
}: {
  value: string; onChange: (v: string) => void; limit: number;
  placeholder?: string; minRows?: number; showFormatting?: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const ref = (inputRef || localRef) as React.RefObject<HTMLTextAreaElement | null>;

  const over = value.length > limit;
  const normalPart = over ? value.slice(0, limit) : value;
  const overPart = over ? value.slice(limit) : "";
  const overCount = Math.max(0, value.length - limit);
  const pct = Math.min(100, (value.length / limit) * 100);

  function syncScroll() {
    if (ref.current && backdropRef.current) {
      backdropRef.current.scrollTop = ref.current.scrollTop;
      backdropRef.current.scrollLeft = ref.current.scrollLeft;
    }
  }

  function insertFormat(wrapper: string, label?: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const selected = value.slice(start, end);
    const insertion = wrapper + (selected || label || "") + wrapper;
    const newVal = value.slice(0, start) + insertion + value.slice(end);
    onChange(newVal);
    const cursorPos = selected ? start + wrapper.length + selected.length + wrapper.length : start + wrapper.length + (label?.length ?? 0);
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = selected ? start + wrapper.length : start + wrapper.length;
      ta.selectionEnd = selected ? start + wrapper.length + selected.length : cursorPos - wrapper.length;
    }, 0);
  }

  const FONT_SIZE = 13;
  const LINE_HEIGHT = 1.55;
  const PADDING = "10px 12px";
  const sharedStyle: React.CSSProperties = {
    fontFamily: "inherit",
    fontSize: `${FONT_SIZE}px`,
    lineHeight: LINE_HEIGHT,
    letterSpacing: "normal",
    tabSize: 2,
  };

  return (
    <div className="space-y-1.5">
      {showFormatting && (
        <div className="flex items-center gap-1">
          {[
            { wrap: "*",   display: <strong>B</strong>,            title: "Negrito  (*texto*)" },
            { wrap: "_",   display: <em>I</em>,                    title: "Itálico  (_texto_)" },
            { wrap: "~",   display: <s>S</s>,                      title: "Tachado  (~texto~)" },
            { wrap: "```", display: <span className="font-mono text-xs">{"</>"}</span>, title: "Código  (```texto```)" },
          ].map(({ wrap, display, title }) => (
            <button key={wrap} type="button" onClick={() => insertFormat(wrap)} title={title}
              className="w-8 h-7 flex items-center justify-center rounded border text-sm transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--page-bg)" }}>
              {display}
            </button>
          ))}
          <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
            *negrito* _itálico_ ~tachado~
          </span>
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden"
        style={{ border: `1.5px solid ${over ? "var(--danger)" : "var(--border)"}`, transition: "border-color 0.2s" }}>
        {/* Backdrop highlight layer */}
        <div
          ref={backdropRef}
          aria-hidden="true"
          style={{
            ...sharedStyle,
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            padding: PADDING,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowY: "auto",
            overflowX: "hidden",
            pointerEvents: "none",
            userSelect: "none",
            // Hide scrollbar on backdrop
            scrollbarWidth: "none",
          }}
        >
          {/* Normal part rendered transparent so only overflow is visible */}
          <span style={{ color: "transparent" }}>{normalPart}</span>
          {overPart && (
            <span style={{
              color: "rgb(239,68,68)",
              backgroundColor: "rgba(239,68,68,0.15)",
              borderRadius: "2px",
            }}>
              {overPart}
            </span>
          )}
          {/* Spacer to ensure scrollHeight matches */}
          <span style={{ display: "inline-block" }}> </span>
        </div>

        {/* Real textarea */}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => { onChange(e.target.value); syncScroll(); }}
          onScroll={syncScroll}
          placeholder={placeholder}
          style={{
            ...sharedStyle,
            display: "block",
            position: "relative",
            width: "100%",
            minHeight: `${minRows * FONT_SIZE * LINE_HEIGHT + 20}px`,
            padding: PADDING,
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            caretColor: "var(--text-primary)",
            resize: "vertical",
            outline: "none",
            border: "none",
            zIndex: 1,
          }}
        />
      </div>

      {/* Counter row */}
      <div className="flex items-center gap-2">
        {/* Progress bar */}
        <div className="flex-1 rounded-full overflow-hidden" style={{ height: "3px", backgroundColor: "var(--border)" }}>
          <div style={{
            height: "100%",
            width: `${pct}%`,
            backgroundColor: over ? "var(--danger)" : pct > 80 ? "var(--warning, #f59e0b)" : "var(--primary)",
            transition: "width 0.15s, background-color 0.2s",
            borderRadius: "9999px",
          }} />
        </div>
        <span className="text-xs tabular-nums flex-shrink-0"
          style={{ color: over ? "var(--danger)" : pct > 80 ? "var(--warning, #f59e0b)" : "var(--text-muted)" }}>
          {over
            ? <><strong>+{overCount.toLocaleString("pt-BR")}</strong> acima do limite</>
            : <>{value.length.toLocaleString("pt-BR")} / {limit.toLocaleString("pt-BR")}</>
          }
        </span>
      </div>
    </div>
  );
}

// ─── Phone Mockup ───────────────────────────────────────────
function PhoneMockup({ message, mediaTab, mediaPreview, mediaCaption, mediaFileName, groupName }: {
  message: string; mediaTab: MediaTab; mediaPreview: string; mediaCaption: string; mediaFileName?: string; groupName: string;
}) {
  const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex justify-center">
      {/* Phone frame */}
      <div className="relative" style={{ width: "280px" }}>
        {/* Phone shell */}
        <div className="rounded-[38px] overflow-hidden shadow-2xl" style={{
          background: "#1a1a2e",
          padding: "12px 6px",
          boxShadow: "0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 2px #333",
        }}>
          {/* Notch */}
          <div className="flex justify-center mb-2">
            <div className="w-20 h-5 rounded-full" style={{ backgroundColor: "#111" }} />
          </div>

          {/* Screen */}
          <div className="rounded-[28px] overflow-hidden" style={{ height: "520px", display: "flex", flexDirection: "column" }}>
            {/* WhatsApp header */}
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: "#075e54", flexShrink: 0 }}>
              <GroupAvatar name={groupName} size={28} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{groupName}</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>Você, 128 participantes</p>
              </div>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" style={{ color: "rgba(255,255,255,0.8)" }} fill="currentColor" viewBox="0 0 24 24"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/></svg>
                <svg className="w-4 h-4" style={{ color: "rgba(255,255,255,0.8)" }} fill="currentColor" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
              </div>
            </div>

            {/* Chat background */}
            <div className="flex-1 overflow-hidden flex flex-col justify-end p-3 gap-2"
              style={{
                backgroundColor: "#e5ddd5",
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9bbaa' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
              }}>
              {/* Previous message placeholder */}
              <div className="flex justify-start mb-1">
                <div className="rounded-lg px-2.5 py-1.5 max-w-[75%]" style={{ backgroundColor: "#fff", fontSize: "11px" }}>
                  <p style={{ color: "#25d366", fontWeight: 600, fontSize: "10px" }}>João Silva</p>
                  <p style={{ color: "#333" }}>Bom dia pessoal! 👋</p>
                  <p className="text-right" style={{ fontSize: "9px", color: "#999", marginTop: "2px" }}>09:45</p>
                </div>
              </div>

              {/* Your message bubble */}
              {(message || mediaTab !== "none") && (
                <div className="flex justify-end">
                  <div className="rounded-lg overflow-hidden max-w-[85%]" style={{ backgroundColor: "#dcf8c6", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>
                    {/* Media preview */}
                    {mediaTab === "image" && mediaPreview && (
                      <img src={mediaPreview} alt="preview" className="w-full max-h-40 object-cover" style={{ display: "block" }} />
                    )}
                    {mediaTab === "image" && !mediaPreview && (
                      <div className="w-full h-24 flex items-center justify-center" style={{ backgroundColor: "#b2dfb0" }}>
                        <span style={{ fontSize: "28px" }}>🖼️</span>
                      </div>
                    )}
                    {mediaTab === "video" && (
                      <div className="w-full h-24 flex items-center justify-center relative" style={{ backgroundColor: "#222" }}>
                        {mediaPreview ? (
                          <video src={mediaPreview} className="w-full h-full object-cover" />
                        ) : <span style={{ fontSize: "28px" }}>🎬</span>}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                          </div>
                        </div>
                      </div>
                    )}
                    {mediaTab === "audio" && (
                      <div className="flex items-center gap-2 px-3 py-2" style={{ minWidth: "180px" }}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#25d366" }}>
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                        </div>
                        <div className="flex-1 flex items-center gap-0.5 h-6">
                          {Array.from({ length: 24 }).map((_, i) => (
                            <div key={i} className="flex-1 rounded-full" style={{ backgroundColor: "#999", height: `${Math.random() * 80 + 20}%`, minHeight: "3px" }} />
                          ))}
                        </div>
                        <span style={{ fontSize: "10px", color: "#666" }}>0:00</span>
                      </div>
                    )}
                    {mediaTab === "document" && (
                      <div className="flex items-center gap-2 px-3 py-2" style={{ minWidth: "180px" }}>
                        <div className="w-8 h-10 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#e0403c" }}>
                          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate" style={{ fontSize: "11px", fontWeight: 600, color: "#333" }}>{mediaFileName || "documento.pdf"}</p>
                          <p style={{ fontSize: "10px", color: "#666" }}>Documento</p>
                        </div>
                      </div>
                    )}

                    {/* Text / caption */}
                    {(message || (mediaTab !== "none" && mediaCaption)) && (
                      <div className="px-2.5 pt-1.5 pb-1">
                        <p style={{ fontSize: "12px", color: "#333", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                          {mediaTab !== "none" && mediaCaption ? mediaCaption : message || ""}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-1 px-2 pb-1">
                      <span style={{ fontSize: "9px", color: "#666" }}>{now}</span>
                      <svg className="w-3 h-3" style={{ color: "#34b7f1" }} fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.9 4.5L9.4 13 6.1 9.7 4.7 11.1l4.7 4.7 9.9-9.9-1.4-1.4zM21.1 4.5l-9.9 9.9-1.4-1.4 1.4-1.4L21.1 4.5z" opacity=".5"/>
                        <path d="M17.9 4.5l1.4 1.4-9.9 9.9-4.7-4.7 1.4-1.4 3.3 3.3z"/>
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {!message && mediaTab === "none" && (
                <div className="flex justify-center">
                  <div className="px-3 py-1.5 rounded-lg text-center" style={{ backgroundColor: "rgba(255,255,255,0.7)", fontSize: "11px", color: "#666" }}>
                    A mensagem aparecerá aqui
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="flex items-center gap-2 px-2 py-2" style={{ backgroundColor: "#f0f0f0", flexShrink: 0 }}>
              <div className="flex-1 rounded-full px-3 py-1.5" style={{ backgroundColor: "#fff", fontSize: "11px", color: "#999" }}>
                Mensagem
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor: "#25d366" }}>
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
              </div>
            </div>
          </div>

          {/* Home indicator */}
          <div className="flex justify-center mt-2">
            <div className="w-24 h-1 rounded-full" style={{ backgroundColor: "#555" }} />
          </div>
        </div>

        <p className="text-center text-xs mt-3" style={{ color: "var(--text-muted)" }}>Pré-visualização — aparência pode variar</p>
      </div>
    </div>
  );
}

// ─── Dispatch Results ────────────────────────────────────────
function DispatchResults({ results }: { results: DispatchResult[] }) {
  const sent = results.filter((r) => r.status === "sent").length;
  const failed = results.filter((r) => r.status === "failed").length;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap" style={{ borderBottom: "1px solid var(--border)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Resultado</p>
        <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)" }}>
          ✓ {sent} enviado{sent !== 1 ? "s" : ""}
        </span>
        {failed > 0 && (
          <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--danger) 15%, transparent)", color: "var(--danger)" }}>
            ✗ {failed} falho{failed !== 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="divide-y max-h-60 overflow-y-auto" style={{ borderColor: "color-mix(in srgb, var(--border) 50%, transparent)" }}>
        {results.map((r) => (
          <div key={r.groupId} className="px-4 py-2.5 flex items-center gap-3">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: r.status === "sent" ? "var(--success)" : "var(--danger)" }} />
            <span className="text-sm flex-1 truncate" style={{ color: "var(--text-primary)" }}>{r.name}</span>
            <span className="text-xs" style={{ color: r.status === "sent" ? "var(--success)" : "var(--danger)" }}>
              {r.status === "sent" ? "Enviado" : r.error?.slice(0, 40) || "Falhou"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Dispatch History ────────────────────────────────────────
interface LogEntry {
  id: string;
  instanceId: string;
  message: string;
  mediaType: string | null;
  mediaCaption: string | null;
  hasMedia: boolean;
  groupCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: string;
  results: { groupId: string; name: string; status: string; error?: string }[];
  instance: { label: string | null; instanceName: string };
}

function DispatchHistory({ instances }: { instances: Instance[] }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterInstance, setFilterInstance] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");

  async function load(p = 1) {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (filterInstance) params.set("instanceId", filterInstance);
    if (filterStatus !== "all") params.set("status", filterStatus);
    if (search) params.set("search", search);
    const res = await fetch(`/api/campaigns/manual-dispatch?${params}`);
    if (res.ok) {
      const d = await res.json();
      setLogs(d.logs || []);
      setPages(d.pages || 1);
      setTotal(d.total || 0);
    }
    setLoading(false);
  }

  useEffect(() => { setPage(1); load(1); }, [filterInstance, filterStatus, search]);
  useEffect(() => { load(page); }, [page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
  }

  const statusBadge = (sent: number, failed: number, total: number) => {
    if (failed === 0) return { label: "Sucesso", color: "var(--success)", bg: "color-mix(in srgb, var(--success) 12%, transparent)" };
    if (sent === 0)   return { label: "Falhou",  color: "var(--danger)",  bg: "color-mix(in srgb, var(--danger) 12%, transparent)" };
    return { label: "Parcial", color: "var(--warning, #f59e0b)", bg: "color-mix(in srgb, #f59e0b 12%, transparent)" };
  };

  return (
    <div className="space-y-4" style={{ maxWidth: "900px" }}>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Instância</p>
          <select value={filterInstance} onChange={(e) => setFilterInstance(e.target.value)}
            className="text-sm px-3 py-2 rounded-lg border outline-none"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}>
            <option value="">Todas</option>
            {instances.map((i) => <option key={i.id} value={i.id}>{i.label || i.instanceName}</option>)}
          </select>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Status</p>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {([["all","Todos"],["sent","Sucesso"],["failed","Com falhas"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setFilterStatus(v)}
                className="px-3 py-2 text-xs transition-colors"
                style={filterStatus === v
                  ? { backgroundColor: "var(--primary)", color: "#fff" }
                  : { backgroundColor: "var(--card-bg)", color: "var(--text-muted)" }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por mensagem ou grupo..."
              className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border outline-none"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }} />
          </div>
          <button type="submit" className="px-4 py-2 text-sm rounded-lg text-white" style={{ backgroundColor: "var(--primary)" }}>Buscar</button>
          {search && <button type="button" onClick={() => { setSearch(""); setSearchInput(""); }} className="px-3 py-2 text-sm rounded-lg border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>✕</button>}
        </form>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <span>{total} disparo{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</span>
        {pages > 1 && <span>· página {page} de {pages}</span>}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ backgroundColor: "var(--primary-light)" }}>
              <svg className="w-7 h-7" style={{ color: "var(--primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="font-semibold" style={{ color: "var(--text-secondary)" }}>Nenhum disparo encontrado</p>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Os disparos manuais aparecerão aqui após o primeiro envio.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="grid text-xs font-semibold px-4 py-3 gap-3"
              style={{ gridTemplateColumns: "140px 1fr 110px 90px 32px", borderBottom: "1px solid var(--border)", color: "var(--text-muted)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
              <span>Data/hora</span><span>Mensagem</span><span>Instância</span><span>Grupos</span><span />
            </div>

            {logs.map((log) => {
              const badge = statusBadge(log.sentCount, log.failedCount, log.groupCount);
              const expanded = expandedId === log.id;
              const preview = log.message?.slice(0, 120) || (log.hasMedia ? `[${log.mediaType}]` : "—");
              return (
                <div key={log.id} style={{ borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)" }}>
                  {/* Row */}
                  <div className="grid items-center px-4 py-3 gap-3 cursor-pointer hover:bg-[color-mix(in_srgb,var(--primary)_4%,transparent)]"
                    style={{ gridTemplateColumns: "140px 1fr 110px 90px 32px" }}
                    onClick={() => setExpandedId(expanded ? null : log.id)}>
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                        {new Date(log.sentAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </p>
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {new Date(log.sentAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs truncate" style={{ color: "var(--text-primary)" }}>{preview}</p>
                      {log.hasMedia && (
                        <span className="text-xs px-1.5 py-0.5 rounded mt-0.5 inline-block" style={{ backgroundColor: "var(--primary-light)", color: "var(--primary)" }}>
                          {log.mediaType}
                        </span>
                      )}
                    </div>
                    <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                      {log.instance?.label || log.instance?.instanceName || "—"}
                    </p>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-center"
                        style={{ backgroundColor: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                        {log.sentCount}/{log.groupCount}
                      </span>
                    </div>
                    <svg className="w-4 h-4 transition-transform flex-shrink-0" style={{ color: "var(--text-muted)", transform: expanded ? "rotate(180deg)" : "none" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div className="px-4 pb-4 space-y-3" style={{ backgroundColor: "color-mix(in srgb, var(--page-bg) 50%, transparent)" }}>
                      {/* Message full */}
                      {log.message && (
                        <div className="rounded-xl p-3" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
                          <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>Mensagem enviada</p>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>{log.message}</p>
                          {log.hasMedia && log.mediaCaption && (
                            <p className="text-xs mt-2 italic" style={{ color: "var(--text-secondary)" }}>Legenda: {log.mediaCaption}</p>
                          )}
                        </div>
                      )}

                      {/* Per-group results */}
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-muted)" }}>
                          Resultado por grupo — {log.sentCount} enviado{log.sentCount !== 1 ? "s" : ""}, {log.failedCount} falho{log.failedCount !== 1 ? "s" : ""}
                        </p>
                        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                          {log.results.map((r, idx) => (
                            <div key={r.groupId} className="flex items-center gap-3 px-3 py-2.5"
                              style={{ borderBottom: idx < log.results.length - 1 ? "1px solid color-mix(in srgb, var(--border) 40%, transparent)" : "none", backgroundColor: "var(--card-bg)" }}>
                              <GroupAvatar name={r.name} size={24} />
                              <span className="flex-1 text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{r.name}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                                style={{
                                  color: r.status === "sent" ? "var(--success)" : "var(--danger)",
                                  backgroundColor: r.status === "sent" ? "color-mix(in srgb, var(--success) 12%, transparent)" : "color-mix(in srgb, var(--danger) 12%, transparent)",
                                }}>
                                {r.status === "sent" ? "✓ Enviado" : "✗ Falhou"}
                              </span>
                              {r.error && <span className="text-xs truncate max-w-[180px]" style={{ color: "var(--danger)" }} title={r.error}>{r.error.slice(0, 60)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 text-sm rounded-lg border disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--card-bg)" }}>
            ← Anterior
          </button>
          {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
            const p = page <= 4 ? i + 1 : page - 3 + i;
            if (p < 1 || p > pages) return null;
            return (
              <button key={p} onClick={() => setPage(p)}
                className="px-3 py-1.5 text-sm rounded-lg border"
                style={{ borderColor: p === page ? "var(--primary)" : "var(--border)", backgroundColor: p === page ? "var(--primary)" : "var(--card-bg)", color: p === page ? "#fff" : "var(--text-secondary)" }}>
                {p}
              </button>
            );
          })}
          <button onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page === pages}
            className="px-3 py-1.5 text-sm rounded-lg border disabled:opacity-40"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--card-bg)" }}>
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Campaign Dispatch View ──────────────────────────────────
function CampaignDispatchView({ campaigns, onRefresh }: { campaigns: Campaign[]; onRefresh: () => void }) {
  const [selectedId, setSelectedId] = useState(campaigns[0]?.id || "");
  const [dispatches, setDispatches] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const STATUS: Record<string, { label: string; color: string }> = {
    draft:     { label: "Rascunho",   color: "#6b7280" },
    scheduled: { label: "Agendada",   color: "#3b82f6" },
    running:   { label: "Executando", color: "#10b981" },
    paused:    { label: "Pausada",    color: "#f59e0b" },
    completed: { label: "Concluída",  color: "#8b5cf6" },
    failed:    { label: "Falhou",     color: "#ef4444" },
  };

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/campaigns/${selectedId}/analytics`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.dispatches) setDispatches(d.dispatches); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedId]);

  const filteredDispatches = statusFilter === "all" ? dispatches : dispatches.filter((d) => d.status === statusFilter);

  const campaign = campaigns.find((c) => c.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border outline-none"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--card-bg)" }}>
          {campaigns.length === 0
            ? <option value="">Nenhuma campanha</option>
            : campaigns.map((c) => <option key={c.id} value={c.id}>{c.name} ({STATUS[c.status]?.label || c.status})</option>)}
        </select>
        <button onClick={onRefresh} className="text-xs px-3 py-2 rounded-lg border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Atualizar
        </button>
        {campaign && (
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {[
              { label: "Enviados", val: campaign.sentCount, color: "var(--success)" },
              { label: "Falhos", val: campaign.failedCount, color: "var(--danger)" },
              { label: "Pendentes", val: campaign.pendingCount, color: "var(--warning)" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-lg font-bold" style={{ color: s.color }}>{s.val}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter */}
      {dispatches.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {["all", "sent", "pending", "failed", "processing"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className="text-xs px-3 py-1.5 rounded-full transition-colors"
              style={statusFilter === s
                ? { backgroundColor: "var(--primary)", color: "#fff" }
                : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
              {s === "all" ? "Todos" : s === "sent" ? "Enviados" : s === "pending" ? "Pendentes" : s === "failed" ? "Falhos" : "Processando"}
            </button>
          ))}
        </div>
      )}

      {/* Dispatch list */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}>
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
          </div>
        ) : filteredDispatches.length === 0 ? (
          <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {campaigns.length === 0 ? "Nenhuma campanha criada ainda" : "Nenhum disparo encontrado"}
          </div>
        ) : (
          <>
            <div className="grid text-xs font-semibold px-4 py-2.5" style={{ gridTemplateColumns: "1fr 120px 120px 100px", borderBottom: "1px solid var(--border)", color: "var(--text-muted)", backgroundColor: "color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
              <span>Grupo</span><span>Agendado</span><span>Enviado</span><span>Status</span>
            </div>
            <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: "color-mix(in srgb, var(--border) 40%, transparent)" }}>
              {filteredDispatches.map((d: Record<string, unknown>) => {
                const st = String(d.status || "");
                const dotColor = st === "sent" ? "var(--success)" : st === "failed" ? "var(--danger)" : st === "processing" ? "var(--warning)" : "var(--border)";
                const stLabel = st === "sent" ? "Enviado" : st === "failed" ? "Falhou" : st === "pending" ? "Pendente" : st === "processing" ? "Enviando" : st;
                return (
                  <div key={String(d.id)} className="grid items-center px-4 py-3 text-sm" style={{ gridTemplateColumns: "1fr 120px 120px 100px" }}>
                    <span className="truncate font-medium" style={{ color: "var(--text-primary)" }}>
                      {String((d.group as Record<string, unknown>)?.name || d.groupId || "")}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {d.scheduledFor ? new Date(String(d.scheduledFor)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {d.sentAt ? new Date(String(d.sentAt)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor }} />
                      <span style={{ color: dotColor }}>{stLabel}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
