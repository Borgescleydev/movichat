"use client";

import { useEffect, useRef, useState, useCallback, Suspense, useDeferredValue } from "react";
import { useSearchParams } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────
interface Instance { id: string; label: string | null; instanceName: string; status: string; conversationsEnabled: boolean; }
interface Column   { id: string; name: string; color: string; }
interface Contact  {
  id: string; name: string; phone: string; instanceId: string | null; unreadCount: number;
  messages: { id: string; body: string; fromMe: boolean; timestamp: string }[];
  column: { id: string; name: string; color: string };
  instance: { id: string; label: string | null; instanceName: string } | null;
}
interface Message  { id: string; body: string; fromMe: boolean; timestamp: string; status: string; mediaUrl?: string; mediaType?: string; _mediaLoading?: boolean; }
interface Filters  { sort: string; status: string; columnId: string; }

// ─── Avatar ──────────────────────────────────────────────────
const AV_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#22c55e","#10b981","#06b6d4","#3b82f6","#eab308"];
function avColor(n: string) { let h=0; for(let i=0;i<n.length;i++) h=(h*31+n.charCodeAt(i))>>>0; return AV_COLORS[h%AV_COLORS.length]; }
function Avatar({ name, size=40 }: { name: string; size?: number }) {
  const ini = name.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("") || name.charAt(0).toUpperCase();
  return <div style={{ width:size,height:size,borderRadius:"50%",flexShrink:0,backgroundColor:avColor(name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",userSelect:"none" }}>{ini}</div>;
}

function fileMediaType(file: File): "image"|"video"|"audio"|"document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}
function mediaIcon(type: string) {
  return type==="image"?"🖼️":type==="video"?"🎬":type==="audio"?"🎵":"📄";
}

// ─── Instance initials avatar ─────────────────────────────────
function InstanceAvatar({ label, instanceName, size=36 }: { label: string|null; instanceName: string; size?: number }) {
  const name = label || instanceName;
  const ini = name.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("") || name.charAt(0).toUpperCase();
  return (
    <div style={{ width:size,height:size,borderRadius:10,flexShrink:0,backgroundColor:avColor(name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.36,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",userSelect:"none" }}>
      {ini}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────
function ConversationsInner() {
  const searchParams = useSearchParams();

  const [instances, setInstances]   = useState<Instance[]>([]);
  const [columns,   setColumns]     = useState<Column[]>([]);
  const [contacts,  setContacts]    = useState<Contact[]>([]);
  const [messages,  setMessages]    = useState<Message[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("contact"));
  const [activeTab, setActiveTab]   = useState("all");

  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sending, setSending]   = useState(false);

  const [search, setSearch]         = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters]       = useState<Filters>({ sort:"recent", status:"all", columnId:"" });
  const deferredSearch = useDeferredValue(search);

  const [newMsg, setNewMsg]         = useState("");
  const [sendWarning, setSendWarning] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ file: File; base64: string } | null>(null);

  const [recording, setRecording]   = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const mediaRecRef  = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  const [syncing, setSyncing]       = useState<string | null>(null);
  const [syncMsg, setSyncMsg]       = useState<Record<string,string>>({});

  const msgEndRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);
  const msgPollRef  = useRef<ReturnType<typeof setInterval>|null>(null);
  const ctxPollRef  = useRef<ReturnType<typeof setInterval>|null>(null);
  const eventSourceRef = useRef<EventSource|null>(null);

  // ── Load static data ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/providers").then(r=>r.ok?r.json():[]).then((ps: {instances:Instance[]}[]) => {
      setInstances(ps.flatMap(p=>p.instances||[]));
    });
    fetch("/api/pipeline").then(r=>r.ok?r.json():[]).then((cols: Column[]) => setColumns(cols));
  }, []);

  // ── Build query params ────────────────────────────────────────
  const buildParams = useCallback((tab=activeTab, f=filters, q=deferredSearch) => {
    const p = new URLSearchParams({ sort: f.sort, filter: f.status });
    if (tab !== "all") p.set("instanceId", tab);
    if (f.columnId) p.set("columnId", f.columnId);
    if (q) p.set("search", q);
    return p.toString();
  }, [activeTab, filters, deferredSearch]);

  // ── Load contacts ─────────────────────────────────────────────
  const loadContacts = useCallback(async (silent=false) => {
    if (!silent) setLoadingContacts(true);
    const res = await fetch(`/api/conversations?${buildParams()}`);
    if (res.ok) setContacts(await res.json());
    if (!silent) setLoadingContacts(false);
  }, [buildParams]);

  useEffect(() => { loadContacts(); }, [activeTab, filters, deferredSearch]);

  useEffect(() => {
    if (ctxPollRef.current) clearInterval(ctxPollRef.current);
    ctxPollRef.current = setInterval(() => loadContacts(true), 8000);
    return () => { if (ctxPollRef.current) clearInterval(ctxPollRef.current); };
  }, [loadContacts]);

  // ── SSE ──────────────────────────────────────────────────────
  useEffect(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    const es = new EventSource("/api/conversations/events");
    eventSourceRef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "message") {
          loadContacts(true);
          if (selectedId && data.contactId === selectedId) loadMessages(selectedId, true);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [selectedId]);

  // ── Load messages ─────────────────────────────────────────────
  const loadMessages = useCallback(async (contactId: string, silent=false) => {
    const res = await fetch(`/api/messages?contactId=${contactId}`);
    if (res.ok) {
      const data = await res.json();
      setMessages(data);
      if (!silent) setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior:"smooth" }), 50);
    }
  }, []);

  const loadMediaForMessage = useCallback(async (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _mediaLoading: true } : m));
    try {
      const res = await fetch(`/api/messages/${msgId}/media`);
      if (res.ok) {
        const { mediaUrl } = await res.json();
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, mediaUrl, _mediaLoading: false } : m));
      } else {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _mediaLoading: false } : m));
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _mediaLoading: false } : m));
    }
  }, []);

  useEffect(() => {
    if (msgPollRef.current) clearInterval(msgPollRef.current);
    if (!selectedId) return;
    loadMessages(selectedId);
    msgPollRef.current = setInterval(() => loadMessages(selectedId, true), 5000);
    return () => { if (msgPollRef.current) clearInterval(msgPollRef.current); };
  }, [selectedId]);

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  function selectContact(id: string) {
    setSelectedId(id);
    fetch(`/api/conversations/${id}/read`, { method:"POST" }).then(() => {
      setContacts(prev => prev.map(c => c.id===id ? { ...c, unreadCount:0 } : c));
    });
  }

  // ── Send message ──────────────────────────────────────────────
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!newMsg.trim() && !pendingFile) || !selectedId) return;
    setSending(true);
    const text = newMsg.trim();
    setNewMsg("");
    const file = pendingFile;
    setPendingFile(null);
    const opt: Message = { id:"tmp-"+Date.now(), body: file ? (text || `${mediaIcon(fileMediaType(file.file))} ${file.file.name}`) : text, fromMe:true, timestamp:new Date().toISOString(), status:"sending" };
    setMessages(prev=>[...prev, opt]);
    const body: Record<string,unknown> = { contactId: selectedId };
    if (file) { body.mediaType = fileMediaType(file.file); body.mediaData = file.base64; body.fileName = file.file.name; if (text) body.mediaCaption = text; }
    else body.body = text;
    const res = await fetch("/api/messages", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok || res.status===207) {
      loadMessages(selectedId, true);
      loadContacts(true);
      if (data.warning) { setSendWarning(data.warning); setTimeout(()=>setSendWarning(""),6000); }
    } else {
      setMessages(prev=>prev.filter(m=>m.id!==opt.id));
      setSendWarning(data.error||"Erro ao enviar");
      setTimeout(()=>setSendWarning(""),6000);
    }
    setSending(false);
  }

  function handleDrop(e: React.DragEvent) { e.preventDefault(); setDropActive(false); const file = e.dataTransfer.files?.[0]; if (!file) return; readFile(file); }
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) { const file = e.target.files?.[0]; if (!file) return; readFile(file); e.target.value = ""; }
  function readFile(file: File) { const reader = new FileReader(); reader.onload = () => setPendingFile({ file, base64: reader.result as string }); reader.readAsDataURL(file); }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/ogg; codecs=opus") ? "audio/ogg; codecs=opus" : MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      recChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recChunksRef.current, { type: mimeType });
        const reader = new FileReader();
        reader.onload = () => setPendingFile({ file: new File([blob], "audio.ogg", { type: mimeType }), base64: reader.result as string });
        reader.readAsDataURL(blob);
        recChunksRef.current = [];
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true); setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    } catch {
      setSendWarning("Microfone não disponível ou permissão negada");
      setTimeout(() => setSendWarning(""), 4000);
    }
  }
  function stopRecording() { if (recTimerRef.current) clearInterval(recTimerRef.current); mediaRecRef.current?.stop(); mediaRecRef.current = null; setRecording(false); setRecSeconds(0); }
  function cancelRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (mediaRecRef.current) { mediaRecRef.current.ondataavailable = null; mediaRecRef.current.onstop = null; mediaRecRef.current.stop(); mediaRecRef.current = null; }
    recChunksRef.current = [];
    setRecording(false); setRecSeconds(0);
  }

  async function syncConversations(instanceId: string) {
    setSyncing(instanceId);
    const res = await fetch("/api/conversations/sync", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ instanceId }) });
    const data = await res.json();
    setSyncMsg(prev=>({ ...prev, [instanceId]: res.ok ? `✓ ${data.synced} conversas` : `✗ ${data.error}` }));
    if (res.ok) loadContacts();
    setSyncing(null);
  }

  const selectedContact = contacts.find(c=>c.id===selectedId);
  const enabledInstances = instances.filter(i=>i.conversationsEnabled);
  const totalUnread = contacts.reduce((s,c)=>s+c.unreadCount,0);

  // Per-instance unread (from all contacts, not just filtered)
  function instanceUnread(instId: string) {
    return contacts.filter(c=>c.instanceId===instId).reduce((s,c)=>s+c.unreadCount,0);
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor:"var(--page-bg)" }}>

      {/* ═══════════════════════════════════════════════════════
          COL 1 — INSTANCE LIST
      ═══════════════════════════════════════════════════════ */}
      <div className="flex flex-col" style={{ width:220, flexShrink:0, borderRight:"1px solid var(--border)", backgroundColor:"var(--card-bg)" }}>
        {/* Header */}
        <div className="px-4 py-4" style={{ borderBottom:"1px solid var(--border)" }}>
          <p className="text-xs font-semibold tracking-wider uppercase" style={{ color:"var(--text-muted)" }}>Instâncias</p>
        </div>

        {/* Instance list */}
        <div className="flex-1 overflow-y-auto py-2">
          {/* "Todas" entry */}
          <button
            onClick={() => { setActiveTab("all"); setSelectedId(null); setSearch(""); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left"
            style={{
              backgroundColor: activeTab === "all" ? "var(--primary-light)" : "transparent",
              borderLeft: activeTab === "all" ? "3px solid var(--primary)" : "3px solid transparent",
            }}
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: activeTab === "all" ? "var(--primary)" : "var(--border)" }}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 6h16M4 10h16M4 14h10"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10" fill="none" stroke="currentColor"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: activeTab === "all" ? "var(--primary)" : "var(--text-primary)" }}>
                Todas
              </p>
              {totalUnread > 0 && (
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>{totalUnread} não lida{totalUnread !== 1 ? "s" : ""}</p>
              )}
            </div>
            {totalUnread > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ backgroundColor:"var(--primary)", minWidth:20, textAlign:"center" }}>
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </button>

          {/* Divider */}
          {enabledInstances.length > 0 && (
            <div className="mx-3 my-1" style={{ borderTop:"1px solid var(--border)" }} />
          )}

          {enabledInstances.map(inst => {
            const isActive = activeTab === inst.id;
            const connected = inst.status === "connected";
            const unread = instanceUnread(inst.id);
            return (
              <button
                key={inst.id}
                onClick={() => { setActiveTab(inst.id); setSelectedId(null); setSearch(""); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left group"
                style={{
                  backgroundColor: isActive ? "var(--primary-light)" : "transparent",
                  borderLeft: isActive ? "3px solid var(--primary)" : "3px solid transparent",
                }}
              >
                <div className="relative flex-shrink-0">
                  <InstanceAvatar label={inst.label} instanceName={inst.instanceName} size={36} />
                  {/* Status dot */}
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                    style={{
                      backgroundColor: connected ? "var(--success)" : "var(--text-muted)",
                      borderColor: "var(--card-bg)",
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: isActive ? "var(--primary)" : "var(--text-primary)" }}>
                    {inst.label || inst.instanceName}
                  </p>
                  <p className="text-xs truncate" style={{ color: connected ? "var(--success)" : "var(--text-muted)" }}>
                    {connected ? "Conectado" : "Desconectado"}
                  </p>
                </div>
                {unread > 0 && (
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0" style={{ backgroundColor:"var(--primary)", minWidth:20, textAlign:"center" }}>
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </button>
            );
          })}

          {enabledInstances.length === 0 && (
            <div className="px-4 py-6 text-center">
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>Nenhuma instância com conversas habilitadas</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          COL 2 — CONVERSATION LIST
      ═══════════════════════════════════════════════════════ */}
      <div className="flex flex-col" style={{ width:300, flexShrink:0, borderRight:"1px solid var(--border)", backgroundColor:"var(--card-bg)" }}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3" style={{ borderBottom:"1px solid var(--border)", flexShrink:0 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold" style={{ color:"var(--text-primary)" }}>
                {activeTab === "all"
                  ? "Todas as conversas"
                  : (enabledInstances.find(i=>i.id===activeTab)?.label || enabledInstances.find(i=>i.id===activeTab)?.instanceName || "Conversas")}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={()=>setShowFilters(v=>!v)} title="Filtros"
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ backgroundColor: showFilters ? "var(--primary-light)" : "transparent", color: showFilters ? "var(--primary)" : "var(--text-muted)" }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
              {activeTab !== "all" && (
                <button
                  onClick={() => syncConversations(activeTab)}
                  disabled={!!syncing || enabledInstances.find(i=>i.id===activeTab)?.status !== "connected"}
                  className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                  style={{ backgroundColor:"var(--primary-light)", color:"var(--primary)" }}
                  title="Sincronizar conversas"
                >
                  {syncing === activeTab
                    ? <div className="w-3 h-3 border-2 rounded-full animate-spin" style={{ borderColor:"var(--primary)",borderTopColor:"transparent" }} />
                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color:"var(--text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar..." className="w-full text-xs pl-8 pr-3 py-2 rounded-lg outline-none"
              style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }} />
          </div>

          {/* Sync msg */}
          {activeTab !== "all" && syncMsg[activeTab] && (
            <p className="text-xs mt-2" style={{ color: syncMsg[activeTab].startsWith("✓") ? "var(--success)" : "var(--danger)" }}>{syncMsg[activeTab]}</p>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="px-4 py-3 space-y-3 text-sm" style={{ borderBottom:"1px solid var(--border)", backgroundColor:"color-mix(in srgb, var(--page-bg) 70%, transparent)", flexShrink:0 }}>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color:"var(--text-muted)" }}>Status</p>
              <div className="flex gap-1">
                {([["all","Todas"],["unread","Não lidas"],["read","Lidas"]] as const).map(([v,l])=>(
                  <button key={v} onClick={()=>setFilters(f=>({...f,status:v}))}
                    className="flex-1 py-1.5 text-xs rounded-lg border transition-colors"
                    style={filters.status===v?{borderColor:"var(--primary)",backgroundColor:"var(--primary-light)",color:"var(--primary)"}:{borderColor:"var(--border)",color:"var(--text-muted)"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold mb-1.5" style={{ color:"var(--text-muted)" }}>Ordenar por</p>
              <div className="grid grid-cols-2 gap-1">
                {([["recent","Mais recentes"],["oldest","Mais antigas"],["az","A → Z"],["za","Z → A"]] as const).map(([v,l])=>(
                  <button key={v} onClick={()=>setFilters(f=>({...f,sort:v}))}
                    className="py-1.5 text-xs rounded-lg border transition-colors"
                    style={filters.sort===v?{borderColor:"var(--primary)",backgroundColor:"var(--primary-light)",color:"var(--primary)"}:{borderColor:"var(--border)",color:"var(--text-muted)"}}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {columns.length > 0 && (
              <div>
                <p className="text-xs font-semibold mb-1.5" style={{ color:"var(--text-muted)" }}>Etapa do pipeline</p>
                <select value={filters.columnId} onChange={e=>setFilters(f=>({...f,columnId:e.target.value}))}
                  className="w-full text-xs px-2 py-1.5 rounded-lg border outline-none"
                  style={{ borderColor:"var(--border)", color:"var(--text-primary)", backgroundColor:"var(--card-bg)" }}>
                  <option value="">Todas as etapas</option>
                  {columns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <button onClick={()=>setFilters({sort:"recent",status:"all",columnId:""})}
              className="w-full text-xs py-1.5 rounded-lg border transition-colors"
              style={{ borderColor:"var(--border)", color:"var(--text-muted)" }}>
              Limpar filtros
            </button>
          </div>
        )}

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {loadingContacts ? (
            <div className="flex justify-center py-10">
              <div className="w-5 h-5 border-4 rounded-full animate-spin" style={{ borderColor:"var(--primary)",borderTopColor:"transparent" }}/>
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-10 text-center px-4 space-y-2">
              <div className="w-10 h-10 rounded-2xl mx-auto flex items-center justify-center" style={{ backgroundColor:"var(--primary-light)" }}>
                <svg className="w-5 h-5" style={{ color:"var(--primary)" }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
              <p className="text-xs font-medium" style={{ color:"var(--text-secondary)" }}>
                {filters.status !== "all" || filters.columnId || deferredSearch ? "Nenhuma conversa encontrada" : "Nenhuma conversa"}
              </p>
              {activeTab !== "all" && !deferredSearch && (
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>Clique em sincronizar para importar</p>
              )}
            </div>
          ) : contacts.map(contact => {
            const lastMsg = contact.messages?.[0];
            const isSel = selectedId === contact.id;
            const hasUnread = contact.unreadCount > 0;
            return (
              <button key={contact.id} onClick={() => selectContact(contact.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                style={{
                  borderBottom:"1px solid color-mix(in srgb, var(--border) 40%, transparent)",
                  backgroundColor: isSel ? "var(--primary-light)" : "transparent",
                  borderLeft: isSel ? "3px solid var(--primary)" : "3px solid transparent",
                }}>
                <div className="relative flex-shrink-0">
                  <Avatar name={contact.name} size={38}/>
                  {hasUnread && (
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full text-white flex items-center justify-center border border-white"
                      style={{ backgroundColor:"var(--primary)", fontSize:9, fontWeight:700 }}>
                      {contact.unreadCount > 9 ? "9+" : contact.unreadCount}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-sm truncate" style={{ color:"var(--text-primary)", fontWeight: hasUnread ? 700 : 500 }}>{contact.name}</p>
                    {lastMsg && <span className="text-xs flex-shrink-0" style={{ color:"var(--text-muted)" }}>{new Date(lastMsg.timestamp).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</span>}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {lastMsg?.fromMe && <svg className="w-3 h-3 flex-shrink-0" style={{ color:"var(--primary)" }} fill="currentColor" viewBox="0 0 24 24"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>}
                    <p className="text-xs truncate" style={{ color: hasUnread ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: hasUnread ? 600 : 400 }}>
                      {lastMsg?.body || contact.phone}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor:"color-mix(in srgb,"+contact.column.color+" 15%,transparent)", color:contact.column.color, fontSize:10 }}>
                      {contact.column.name}
                    </span>
                    {contact.instance && activeTab === "all" && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor:"var(--border)", color:"var(--text-muted)", fontSize:10 }}>
                        {contact.instance.label || contact.instance.instanceName}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          COL 3 — CHAT
      ═══════════════════════════════════════════════════════ */}
      {selectedContact ? (
        <div className="flex-1 flex flex-col min-w-0"
          onDragOver={e=>{e.preventDefault();setDropActive(true);}}
          onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDropActive(false);}}
          onDrop={handleDrop}>

          {dropActive && (
            <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none" style={{ backgroundColor:"color-mix(in srgb,var(--primary) 15%,transparent)", border:"3px dashed var(--primary)" }}>
              <div className="text-center">
                <p className="text-2xl mb-2">📎</p>
                <p className="font-semibold text-lg" style={{ color:"var(--primary)" }}>Solte para enviar</p>
              </div>
            </div>
          )}

          {/* Chat header */}
          <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom:"1px solid var(--border)", backgroundColor:"var(--card-bg)", flexShrink:0 }}>
            <Avatar name={selectedContact.name} size={38}/>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>{selectedContact.name}</p>
              <p className="text-xs" style={{ color:"var(--text-muted)" }}>{selectedContact.phone}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              {selectedContact.instance && (
                <span className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor:"var(--primary-light)", color:"var(--primary)" }}>
                  {selectedContact.instance.label || selectedContact.instance.instanceName}
                </span>
              )}
              <span className="text-xs px-2.5 py-1 rounded-full text-white" style={{ backgroundColor:selectedContact.column.color }}>
                {selectedContact.column.name}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ backgroundColor:"var(--page-bg)" }}>
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color:"var(--text-muted)" }}>Nenhuma mensagem ainda</p>
              </div>
            ) : messages.map(msg => {
              const isMe = msg.fromMe;
              const hasMed = !!msg.mediaType;
              const mediaReady = hasMed && !!msg.mediaUrl;
              const mediaSrc = mediaReady ? msg.mediaUrl! : "";
              return (
                <div key={msg.id} className={`flex ${isMe?"justify-end":"justify-start"}`}>
                  {!isMe && <div className="flex-shrink-0 mr-2 mt-auto"><Avatar name={selectedContact.name} size={24}/></div>}
                  <div className="max-w-xs lg:max-w-md xl:max-w-lg rounded-2xl text-sm shadow-sm overflow-hidden"
                    style={{ backgroundColor:isMe?"var(--primary)":"var(--card-bg)", color:isMe?"#fff":"var(--text-primary)", borderBottomRightRadius:isMe?"4px":undefined, borderBottomLeftRadius:!isMe?"4px":undefined, border:!isMe?"1px solid var(--border)":"none", opacity:msg.status==="sending"?0.6:1 }}>
                    {hasMed && !mediaReady && (
                      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                        {msg._mediaLoading
                          ? <div className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0" style={{ borderColor:isMe?"rgba(255,255,255,0.5)":"var(--primary)",borderTopColor:"transparent" }}/>
                          : <button type="button" onClick={()=>loadMediaForMessage(msg.id)} className="flex items-center gap-2 text-xs underline opacity-80">
                              <span>{msg.mediaType==="image"?"🖼️":msg.mediaType==="video"?"🎬":msg.mediaType==="audio"?"🎵":"📄"}</span>
                              <span>Carregar mídia</span>
                            </button>}
                      </div>
                    )}
                    {hasMed && mediaReady && msg.mediaType==="image" && <a href={mediaSrc} target="_blank" rel="noreferrer"><img src={mediaSrc} alt="imagem" className="w-full max-h-64 object-cover block" style={{ cursor:"zoom-in" }}/></a>}
                    {hasMed && mediaReady && msg.mediaType==="video" && <video src={mediaSrc} controls className="w-full max-h-64 block" style={{ backgroundColor:"#000" }}/>}
                    {hasMed && mediaReady && msg.mediaType==="audio" && <div className="px-3 pt-3"><audio src={mediaSrc} controls style={{ width:"100%", height:36 }}/></div>}
                    {hasMed && mediaReady && msg.mediaType==="document" && (
                      <div className="px-4 pt-3 flex items-center gap-2">
                        <span className="text-lg">📄</span>
                        <a href={mediaSrc} download={msg.body||"documento"} target="_blank" rel="noreferrer" className="text-xs underline truncate" style={{ color:isMe?"rgba(255,255,255,0.9)":"var(--primary)" }}>{msg.body||"Baixar documento"}</a>
                      </div>
                    )}
                    <div className="px-4 py-2.5">
                      {!(hasMed && ["🖼️ Imagem","🎬 Vídeo","🎵 Áudio","📄 Documento"].includes(msg.body)) && (
                        <p style={{ whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{msg.body}</p>
                      )}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-xs" style={{ color:isMe?"rgba(255,255,255,0.65)":"var(--text-muted)" }}>
                          {new Date(msg.timestamp).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}
                        </span>
                        {isMe && msg.status !== "sending" && (
                          <svg className="w-3.5 h-3.5" style={{ color:msg.status==="sent"?"rgba(255,255,255,0.65)":"rgba(255,255,255,0.9)" }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={msgEndRef}/>
          </div>

          {pendingFile && (
            <div className="px-4 py-2 flex items-center gap-3" style={{ borderTop:"1px solid var(--border)", backgroundColor:"var(--primary-light)" }}>
              <span className="text-xl">{mediaIcon(fileMediaType(pendingFile.file))}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate" style={{ color:"var(--primary)" }}>{pendingFile.file.name}</p>
                <p className="text-xs" style={{ color:"var(--text-muted)" }}>{(pendingFile.file.size/1024).toFixed(0)} KB</p>
              </div>
              {fileMediaType(pendingFile.file)==="image" && <img src={pendingFile.base64} alt="" className="h-12 w-12 object-cover rounded"/>}
              <button onClick={()=>setPendingFile(null)} className="text-lg" style={{ color:"var(--danger)" }}>✕</button>
            </div>
          )}

          {sendWarning && (
            <div className="px-4 py-2 text-xs flex items-center gap-2" style={{ backgroundColor:"color-mix(in srgb,#f59e0b 12%,transparent)", color:"#b45309", borderTop:"1px solid color-mix(in srgb,#f59e0b 25%,transparent)" }}>
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
              {sendWarning}
            </div>
          )}

          <form onSubmit={sendMessage} className="flex items-center gap-2 px-4 py-3"
            style={{ borderTop:"1px solid var(--border)", backgroundColor:"var(--card-bg)", flexShrink:0 }}>
            {recording ? (
              <>
                <button type="button" onClick={cancelRecording} title="Cancelar"
                  className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ backgroundColor:"color-mix(in srgb,#ef4444 15%,transparent)", color:"#ef4444" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-full" style={{ backgroundColor:"color-mix(in srgb,#ef4444 10%,transparent)", border:"1px solid #ef4444" }}>
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0"/>
                  <span className="text-sm font-medium" style={{ color:"#ef4444" }}>{String(Math.floor(recSeconds/60)).padStart(2,"0")}:{String(recSeconds%60).padStart(2,"0")}</span>
                  <span className="text-xs" style={{ color:"var(--text-muted)" }}>Gravando...</span>
                </div>
                <button type="button" onClick={stopRecording} title="Parar e enviar" className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor:"#ef4444" }}>
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                </button>
              </>
            ) : (
              <>
                <input ref={fileRef} type="file" className="hidden" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv" onChange={handleFileInput}/>
                <button type="button" onClick={()=>fileRef.current?.click()} title="Anexar arquivo"
                  className="w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 transition-colors"
                  style={{ backgroundColor:"var(--border)", color:"var(--text-muted)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                </button>
                <input ref={inputRef} value={newMsg} onChange={e=>setNewMsg(e.target.value)}
                  placeholder={pendingFile ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                  disabled={sending} className="flex-1 text-sm px-4 py-2.5 rounded-full outline-none"
                  style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }}/>
                {newMsg.trim() || pendingFile ? (
                  <button type="submit" disabled={sending}
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40"
                    style={{ backgroundColor:"var(--primary)" }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                  </button>
                ) : (
                  <button type="button" onClick={startRecording} title="Gravar áudio"
                    className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ backgroundColor:"var(--primary)" }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
                  </button>
                )}
              </>
            )}
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center" style={{ backgroundColor:"var(--page-bg)" }}>
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center" style={{ backgroundColor:"var(--primary-light)" }}>
              <svg className="w-8 h-8" style={{ color:"var(--primary)" }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
            <div>
              <p className="font-semibold text-base" style={{ color:"var(--text-secondary)" }}>Selecione uma conversa</p>
              <p className="text-sm mt-1" style={{ color:"var(--text-muted)" }}>
                {instances.length === 0 ? "Configure uma instância em Configurações" : "Escolha um contato ao lado"}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConversationsClient() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor:"var(--primary)",borderTopColor:"transparent" }}/></div>}>
      <ConversationsInner />
    </Suspense>
  );
}
