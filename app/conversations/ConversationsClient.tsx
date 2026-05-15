"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// ConversationsClient.tsx
// Chatwoot / WhatsApp Web-inspired 4-column layout:
//   [Instances 72px] | [Conversation list 300px] | [Chat flex] | [Info panel 300px]
// ═══════════════════════════════════════════════════════════════════════════════

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  Suspense,
  useDeferredValue,
} from "react";
import { useSearchParams } from "next/navigation";

// ─── CSS keyframes injected once ─────────────────────────────────────────────
const GLOBAL_STYLES = `
  @keyframes slideInRight {
    from { transform: translateX(110%); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }
  @keyframes pulse-red {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }
`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Instance {
  id: string;
  label: string | null;
  instanceName: string;
  status: string;
  conversationsEnabled: boolean;
}
interface Column { id: string; name: string; color: string; }
interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  instanceId: string | null;
  unreadCount: number;
  createdAt?: string;
  messages: { id: string; body: string; fromMe: boolean; timestamp: string }[];
  column: { id: string; name: string; color: string };
  instance: { id: string; label: string | null; instanceName: string; status?: string } | null;
}
interface Message {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: string;
  status: string;
  mediaUrl?: string;
  mediaType?: string;
  _mediaLoading?: boolean;
}
interface Toast { id: string; contactId: string; contactName: string; phone: string; }
type SseStatus = "connected" | "reconnecting" | "disconnected";
type FilterStatus = "all" | "unread" | "read";
type SortMode = "recent" | "oldest" | "az";

// ─── Avatar helpers ───────────────────────────────────────────────────────────
const AV_COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316",
  "#22c55e","#10b981","#06b6d4","#3b82f6","#eab308",
];
function avColor(n: string): string {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}
function avInitials(name: string): string {
  return (
    name.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join("") || name.charAt(0).toUpperCase()
  );
}

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      backgroundColor: avColor(name), display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.38, fontWeight: 700,
      color: "#fff", letterSpacing: "-0.5px", userSelect: "none",
    }}>
      {avInitials(name)}
    </div>
  );
}

function InstanceAvatar({ label, instanceName, size = 36 }: { label: string | null; instanceName: string; size?: number }) {
  const name = label || instanceName;
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
      backgroundColor: avColor(name), display: "flex", alignItems: "center",
      justifyContent: "center", fontSize: size * 0.36, fontWeight: 700,
      color: "#fff", letterSpacing: "-0.5px", userSelect: "none",
    }}>
      {avInitials(name)}
    </div>
  );
}

// ─── Utility helpers ──────────────────────────────────────────────────────────
function fileMediaType(file: File): "image" | "video" | "audio" | "document" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "document";
}
function mediaIcon(type: string): string {
  return type === "image" ? "🖼️" : type === "video" ? "🎬" : type === "audio" ? "🎵" : "📄";
}

/** Human-readable relative timestamp in pt-BR */
function relTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** Day separator label for the message thread */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "HOJE";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "ONTEM";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }).toUpperCase();
}

/** True when this message starts a new visual group (different sender or >5 min gap) */
function isNewGroup(msg: Message, prev: Message | undefined): boolean {
  if (!prev) return true;
  if (msg.fromMe !== prev.fromMe) return true;
  return new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime() > 5 * 60 * 1000;
}

// ─── SVG icons (inline, no external deps) ────────────────────────────────────
const IconGrid = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
  </svg>
);
const IconSearch = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <circle cx="11" cy="11" r="8"/><path strokeLinecap="round" d="M21 21l-4.35-4.35"/>
  </svg>
);
const IconPlus = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" d="M12 5v14M5 12h14"/>
  </svg>
);
const IconSync = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
  </svg>
);
const IconInfo = () => (
  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 16v-4M12 8h.01"/>
  </svg>
);
const IconDownload = () => (
  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
  </svg>
);
const IconClose = () => (
  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
  </svg>
);
const IconPaperclip = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
  </svg>
);
const IconMic = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
  </svg>
);
const IconSend = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
  </svg>
);
const IconDoubleCheck = ({ color }: { color: string }) => (
  <svg width="14" height="14" fill={color} viewBox="0 0 24 24">
    <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/>
  </svg>
);
const IconCheck = ({ color }: { color: string }) => (
  <svg width="14" height="14" fill={color} viewBox="0 0 24 24">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
  </svg>
);
const IconChevronRight = () => (
  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6"/>
  </svg>
);
const IconEdit = () => (
  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
  </svg>
);
const IconWA = () => (
  <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN INNER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function ConversationsInner() {
  const searchParams = useSearchParams();

  // ── Core data ──────────────────────────────────────────────────────────────
  const [instances,  setInstances]  = useState<Instance[]>([]);
  const [columns,    setColumns]    = useState<Column[]>([]);
  const [contacts,   setContacts]   = useState<Contact[]>([]);
  const [messages,   setMessages]   = useState<Message[]>([]);

  // ── Selection / navigation ─────────────────────────────────────────────────
  const [selectedId,   setSelectedId]   = useState<string | null>(searchParams.get("contact"));
  const [activeInstId, setActiveInstId] = useState<string>("all"); // "all" or instance id

  // ── Loading / status ───────────────────────────────────────────────────────
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [sending,         setSending]         = useState(false);
  const [fetching,        setFetching]        = useState(false);
  const [syncing,         setSyncing]         = useState<string | null>(null);
  const [syncMsg,         setSyncMsg]         = useState<Record<string, string>>({});
  const [sseStatus,       setSseStatus]       = useState<SseStatus>("disconnected");

  // ── Conversation list filters ──────────────────────────────────────────────
  const [search,        setSearch]        = useState("");
  const [filterStatus,  setFilterStatus]  = useState<FilterStatus>("all");
  const [sortMode,      setSortMode]      = useState<SortMode>("recent");
  const [showSortMenu,  setShowSortMenu]  = useState(false);
  const deferredSearch = useDeferredValue(search);

  // ── Chat input ─────────────────────────────────────────────────────────────
  const [newMsg,       setNewMsg]       = useState("");
  const [sendWarning,  setSendWarning]  = useState("");
  const [dropActive,   setDropActive]   = useState(false);
  const [pendingFile,  setPendingFile]  = useState<{ file: File; base64: string } | null>(null);

  // ── Audio recording ────────────────────────────────────────────────────────
  const [recording,   setRecording]   = useState(false);
  const [recSeconds,  setRecSeconds]  = useState(0);
  const mediaRecRef   = useRef<MediaRecorder | null>(null);
  const recChunksRef  = useRef<Blob[]>([]);
  const recTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Contact info panel (right side) ───────────────────────────────────────
  const [showInfoPanel,  setShowInfoPanel]  = useState(false);
  const [editName,       setEditName]       = useState("");
  const [editEmail,      setEditEmail]      = useState("");
  const [editNotes,      setEditNotes]      = useState("");
  const [editColumnId,   setEditColumnId]   = useState("");
  const [contactDirty,   setContactDirty]   = useState(false);
  const [savingContact,  setSavingContact]  = useState(false);

  // ── Nova Conversa modal ────────────────────────────────────────────────────
  const [showNewChat,      setShowNewChat]      = useState(false);
  const [newChatQuery,     setNewChatQuery]     = useState("");
  const [newChatResults,   setNewChatResults]   = useState<Contact[]>([]);
  const [newChatLoading,   setNewChatLoading]   = useState(false);
  const [newChatStarting,  setNewChatStarting]  = useState(false);

  // ── Toasts ─────────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const msgEndRef       = useRef<HTMLDivElement>(null);
  const msgListRef      = useRef<HTMLDivElement>(null);
  const textareaRef     = useRef<HTMLTextAreaElement>(null);
  const fileRef         = useRef<HTMLInputElement>(null);
  const newChatInputRef = useRef<HTMLInputElement>(null);
  const msgPollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxPollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef  = useRef<EventSource | null>(null);
  const userScrolledRef = useRef(false);
  const sseLastTimestamp = useRef(new Date().toISOString());

  // Stable refs to avoid stale closures in SSE/poll callbacks
  const loadContactsRef = useRef<(silent?: boolean) => Promise<void>>(null!);
  const loadMessagesRef = useRef<(id: string, silent?: boolean) => Promise<void>>(null!);
  const selectedIdRef   = useRef<string | null>(null);
  const contactsRef     = useRef<Contact[]>([]);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Data loading
  // ═══════════════════════════════════════════════════════════════════════════

  /** Build query string for conversations list */
  const buildParams = useCallback(() => {
    const p = new URLSearchParams({ sort: sortMode, filter: filterStatus });
    if (activeInstId !== "all") p.set("instanceId", activeInstId);
    if (deferredSearch) p.set("search", deferredSearch);
    return p.toString();
  }, [activeInstId, filterStatus, sortMode, deferredSearch]);

  const loadContacts = useCallback(async (silent = false) => {
    if (!silent) setLoadingContacts(true);
    try {
      const res = await fetch(`/api/conversations?${buildParams()}`);
      if (res.ok) {
        const data: Contact[] = await res.json();
        setContacts(data);
        contactsRef.current = data;
      }
    } finally {
      if (!silent) setLoadingContacts(false);
    }
  }, [buildParams]);

  loadContactsRef.current = loadContacts;
  contactsRef.current     = contacts;

  const loadMessages = useCallback(async (contactId: string, silent = false) => {
    try {
      const res = await fetch(`/api/messages?contactId=${contactId}`);
      if (res.ok) {
        const data: Message[] = await res.json();
        setMessages(data);
        if (!silent) {
          userScrolledRef.current = false;
          setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      }
    } catch { /* network error */ }
  }, []);

  loadMessagesRef.current = loadMessages;
  selectedIdRef.current   = selectedId;

  // Initial static data
  useEffect(() => {
    fetch("/api/providers").then(r => r.ok ? r.json() : []).then((ps: { instances: Instance[] }[]) => {
      setInstances(ps.flatMap(p => p.instances || []));
    });
    fetch("/api/pipeline").then(r => r.ok ? r.json() : []).then((cols: Column[]) => setColumns(cols));
  }, []);

  // Reload contacts when filters change
  useEffect(() => { loadContacts(); }, [activeInstId, filterStatus, sortMode, deferredSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Contacts polling fallback (every 10s)
  useEffect(() => {
    ctxPollRef.current = setInterval(() => loadContactsRef.current(true), 10000);
    return () => { if (ctxPollRef.current) clearInterval(ctxPollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load media for a specific message lazily
  const loadMediaForMessage = useCallback(async (msgId: string) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _mediaLoading: true } : m));
    try {
      const res = await fetch(`/api/messages/${msgId}/media`);
      if (res.ok) {
        const { mediaUrl } = await res.json() as { mediaUrl: string };
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, mediaUrl, _mediaLoading: false } : m));
      } else {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _mediaLoading: false } : m));
      }
    } catch {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, _mediaLoading: false } : m));
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: SSE with auto-reconnect and ?since= support
  // ═══════════════════════════════════════════════════════════════════════════

  /** Show a toast for a received message (when conversation is not open) */
  function showToast(contactId: string) {
    const contact = contactsRef.current.find(c => c.id === contactId);
    const toastId = `t-${Date.now()}-${Math.random()}`;
    setToasts(prev => [
      ...prev.filter(t => t.contactId !== contactId), // deduplicate per contact
      { id: toastId, contactId, contactName: contact?.name || "Novo contato", phone: contact?.phone || "" },
    ].slice(-4)); // max 4 visible
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== toastId)), 6000);
  }

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    const es = new EventSource(`/api/conversations/events?since=${encodeURIComponent(sseLastTimestamp.current)}`);
    eventSourceRef.current = es;
    setSseStatus("connected");

    es.onopen = () => setSseStatus("connected");

    es.onerror = () => {
      setSseStatus("reconnecting");
      es.close();
      setTimeout(() => connectSSE(), 3000);
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as {
          type: string; since?: string; contactId?: string; fromMe?: boolean;
        };
        // Track last-seen timestamp for reconnects
        if (data.since) sseLastTimestamp.current = data.since;
        if (data.type === "message" && data.contactId) {
          loadContactsRef.current(true);
          const curId = selectedIdRef.current;
          if (curId && data.contactId === curId) {
            loadMessagesRef.current(curId, true);
          } else if (!data.fromMe) {
            showToast(data.contactId);
          }
        }
      } catch { /* ignore parse errors */ }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    connectSSE();
    return () => eventSourceRef.current?.close();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Message loading + polling + scroll
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (msgPollRef.current) clearInterval(msgPollRef.current);
    if (!selectedId) { setMessages([]); return; }
    loadMessages(selectedId);
    msgPollRef.current = setInterval(() => loadMessagesRef.current(selectedId, true), 5000);
    return () => { if (msgPollRef.current) clearInterval(msgPollRef.current); };
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll when new messages arrive — but not if user scrolled up
  useEffect(() => {
    if (!userScrolledRef.current) {
      msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  function handleMsgScroll() {
    const el = msgListRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledRef.current = !atBottom;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Contact selection
  // ═══════════════════════════════════════════════════════════════════════════

  function selectContact(id: string) {
    setSelectedId(id);
    userScrolledRef.current = false;
    fetch(`/api/conversations/${id}/read`, { method: "POST" }).then(() => {
      setContacts(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
    }).catch(() => {/* ignore */});
    // Populate the info panel fields
    const c = contacts.find(x => x.id === id);
    if (c) {
      setEditName(c.name);
      setEditEmail(c.email || "");
      setEditNotes(c.notes || "");
      setEditColumnId(c.column?.id || "");
      setContactDirty(false);
    }
  }

  const selectedContact = contacts.find(c => c.id === selectedId) ?? null;
  const enabledInstances = instances.filter(i => i.conversationsEnabled);
  const totalUnread = contacts.reduce((s, c) => s + c.unreadCount, 0);

  function instanceUnread(instId: string) {
    return contacts.filter(c => c.instanceId === instId).reduce((s, c) => s + c.unreadCount, 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Contact info panel save
  // ═══════════════════════════════════════════════════════════════════════════

  async function saveContactInfo() {
    if (!selectedContact) return;
    setSavingContact(true);
    try {
      await fetch(`/api/contacts/${selectedContact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, email: editEmail, notes: editNotes, columnId: editColumnId }),
      });
      await loadContacts(true);
      setContactDirty(false);
    } finally {
      setSavingContact(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Send message
  // ═══════════════════════════════════════════════════════════════════════════

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!newMsg.trim() && !pendingFile) || !selectedId) return;
    setSending(true);
    const text = newMsg.trim();
    setNewMsg("");
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
    const file = pendingFile;
    setPendingFile(null);
    const opt: Message = {
      id: "tmp-" + Date.now(),
      body: file ? (text || `${mediaIcon(fileMediaType(file.file))} ${file.file.name}`) : text,
      fromMe: true, timestamp: new Date().toISOString(), status: "sending",
    };
    setMessages(prev => [...prev, opt]);
    userScrolledRef.current = false;

    const body: Record<string, unknown> = { contactId: selectedId };
    if (file) {
      body.mediaType = fileMediaType(file.file);
      body.mediaData = file.base64;
      body.fileName = file.file.name;
      if (text) body.mediaCaption = text;
    } else {
      body.body = text;
    }
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json() as { warning?: string; error?: string };
    if (res.ok || res.status === 207) {
      loadMessages(selectedId, true);
      loadContacts(true);
      if (data.warning) { setSendWarning(data.warning); setTimeout(() => setSendWarning(""), 6000); }
    } else {
      setMessages(prev => prev.filter(m => m.id !== opt.id));
      setSendWarning(data.error || "Erro ao enviar");
      setTimeout(() => setSendWarning(""), 6000);
    }
    setSending(false);
  }

  // ─ File handling ──────────────────────────────────────────────────────────
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDropActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }
  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) readFile(file);
    e.target.value = "";
  }
  function readFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => setPendingFile({ file, base64: reader.result as string });
    reader.readAsDataURL(file);
  }

  // ─ Textarea auto-resize ───────────────────────────────────────────────────
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setNewMsg(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px"; // max ~4 rows
  }

  // ─ Audio recording ────────────────────────────────────────────────────────
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType =
        MediaRecorder.isTypeSupported("audio/ogg; codecs=opus") ? "audio/ogg; codecs=opus" :
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" :
        "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType });
      recChunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) recChunksRef.current.push(ev.data); };
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
  function stopRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    mediaRecRef.current?.stop();
    mediaRecRef.current = null;
    setRecording(false); setRecSeconds(0);
  }
  function cancelRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    if (mediaRecRef.current) {
      mediaRecRef.current.ondataavailable = null;
      mediaRecRef.current.onstop = null;
      mediaRecRef.current.stop();
      mediaRecRef.current = null;
    }
    recChunksRef.current = [];
    setRecording(false); setRecSeconds(0);
  }

  // ─ Sync & history ────────────────────────────────────────────────────────
  async function syncConversations(instanceId: string) {
    setSyncing(instanceId);
    const res = await fetch("/api/conversations/sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceId }),
    });
    const data = await res.json() as { synced?: number; error?: string };
    setSyncMsg(prev => ({ ...prev, [instanceId]: res.ok ? `✓ ${data.synced} conversas` : `✗ ${data.error}` }));
    if (res.ok) loadContacts();
    setSyncing(null);
  }

  async function fetchHistory(contactId: string) {
    setFetching(true);
    const res = await fetch("/api/messages/fetch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, count: 80 }),
    });
    const data = await res.json() as { error?: string };
    if (res.ok) { await loadMessages(contactId); }
    else { setSendWarning(data.error || "Erro ao buscar histórico"); setTimeout(() => setSendWarning(""), 6000); }
    setFetching(false);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Nova Conversa modal
  // ═══════════════════════════════════════════════════════════════════════════

  function openNewChat() {
    setNewChatQuery(""); setNewChatResults([]); setShowNewChat(true);
    setTimeout(() => newChatInputRef.current?.focus(), 50);
  }
  function closeNewChat() { setShowNewChat(false); setNewChatQuery(""); setNewChatResults([]); }

  const searchNewChatContacts = useCallback(async (q: string) => {
    if (!q.trim()) { setNewChatResults([]); return; }
    setNewChatLoading(true);
    try {
      const res = await fetch(`/api/contacts?search=${encodeURIComponent(q.trim())}`);
      if (res.ok) setNewChatResults((await res.json() as Contact[]).slice(0, 8));
    } finally { setNewChatLoading(false); }
  }, []);

  useEffect(() => {
    if (!showNewChat) return;
    const t = setTimeout(() => searchNewChatContacts(newChatQuery), 300);
    return () => clearTimeout(t);
  }, [newChatQuery, showNewChat, searchNewChatContacts]);

  async function openExistingContact(contact: Contact) {
    closeNewChat();
    if (activeInstId !== "all" && contact.instanceId !== activeInstId) setActiveInstId("all");
    selectContact(contact.id);
    await loadMessages(contact.id);
  }

  async function startNewConversation() {
    const rawPhone = newChatQuery.replace(/\D/g, "");
    if (rawPhone.length < 8) return;
    const instanceId = activeInstId !== "all"
      ? activeInstId
      : (enabledInstances.find(i => i.status === "connected")?.id ?? null);
    setNewChatStarting(true);
    try {
      // Check if contact already exists
      const checkRes = await fetch(`/api/contacts?search=${encodeURIComponent(rawPhone)}`);
      if (checkRes.ok) {
        const list = await checkRes.json() as Contact[];
        const exact = list.find(c => c.phone === rawPhone);
        if (exact) { await openExistingContact(exact); return; }
      }
      // Create new contact
      const res = await fetch("/api/contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `+${rawPhone}`, phone: rawPhone, ...(instanceId ? { instanceId } : {}) }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setSendWarning(d.error || "Erro ao criar contato");
        setTimeout(() => setSendWarning(""), 5000);
        return;
      }
      const newContact = await res.json() as Contact;
      closeNewChat();
      await loadContacts();
      setSelectedId(newContact.id);
      setMessages([]);
    } finally {
      setNewChatStarting(false);
    }
  }

  const rawPhoneQuery = newChatQuery.replace(/\D/g, "");
  const isPhoneLike   = rawPhoneQuery.length >= 8;
  const exactMatch    = newChatResults.find(c => c.phone === rawPhoneQuery);

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: Render helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /** Pill badge for pipeline column */
  function ColumnPill({ col }: { col: { name: string; color: string } }) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center",
        padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
        backgroundColor: col.color + "22", color: col.color,
      }}>
        {col.name}
      </span>
    );
  }

  /** Instance badge */
  function InstanceBadge({ inst }: { inst: { label: string | null; instanceName: string } }) {
    const name = inst.label || inst.instanceName;
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600,
        backgroundColor: "var(--primary-light)", color: "var(--primary)",
      }}>
        {name}
      </span>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION: RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", backgroundColor: "var(--page-bg)" }}>
      <style>{GLOBAL_STYLES}</style>

      {/* ═══════════════════════════════════════════════════════════════════
          COL 1 — INSTANCE SIDEBAR (72px)
          Narrow icon-based sidebar. Each instance = circular avatar.
          Active instance gets a primary-colored left border.
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        width: 72, flexShrink: 0, display: "flex", flexDirection: "column",
        alignItems: "center", paddingTop: 8, paddingBottom: 8, gap: 4,
        borderRight: "1px solid var(--sidebar-border, var(--border))",
        backgroundColor: "var(--sidebar-bg, var(--card-bg))",
        overflowY: "auto",
      }}>
        {/* "All" entry — grid icon */}
        <div style={{ position: "relative", width: "100%" }}>
          {/* Active left border indicator */}
          {activeInstId === "all" && (
            <div style={{
              position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
              width: 3, height: 32, borderRadius: "0 3px 3px 0",
              backgroundColor: "var(--primary)",
            }}/>
          )}
          <button
            onClick={() => { setActiveInstId("all"); setSelectedId(null); setSearch(""); }}
            title="Todas as instâncias"
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
              paddingTop: 6, paddingBottom: 6, border: "none", background: "transparent", cursor: "pointer",
              position: "relative",
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center",
              backgroundColor: activeInstId === "all" ? "var(--primary)" : "var(--border)",
              color: activeInstId === "all" ? "#fff" : "var(--text-muted)",
              transition: "all .2s",
              outline: activeInstId === "all" ? "2px solid var(--primary)" : "none",
              outlineOffset: 2,
            }}>
              <IconGrid/>
            </div>
            {totalUnread > 0 && (
              <div style={{
                position: "absolute", top: 2, right: 6,
                width: 16, height: 16, borderRadius: "50%",
                backgroundColor: "var(--primary)", color: "#fff",
                fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                border: "2px solid var(--sidebar-bg, var(--card-bg))",
              }}>
                {totalUnread > 9 ? "9+" : totalUnread}
              </div>
            )}
          </button>
        </div>

        {/* Divider */}
        {enabledInstances.length > 0 && (
          <div style={{ width: 32, borderTop: "1px solid var(--border)", margin: "2px 0" }}/>
        )}

        {/* Per-instance avatars */}
        {enabledInstances.map(inst => {
          const isActive = activeInstId === inst.id;
          const connected = inst.status === "connected";
          const unread = instanceUnread(inst.id);
          return (
            <div key={inst.id} style={{ position: "relative", width: "100%" }}>
              {isActive && (
                <div style={{
                  position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                  width: 3, height: 32, borderRadius: "0 3px 3px 0",
                  backgroundColor: "var(--primary)",
                }}/>
              )}
              <button
                onClick={() => { setActiveInstId(inst.id); setSelectedId(null); setSearch(""); }}
                title={inst.label || inst.instanceName}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                  paddingTop: 6, paddingBottom: 6, border: "none", background: "transparent", cursor: "pointer",
                  position: "relative",
                }}
              >
                <div style={{ position: "relative" }}>
                  <div style={{
                    borderRadius: "50%", overflow: "hidden",
                    outline: isActive ? "2px solid var(--primary)" : "none",
                    outlineOffset: 2,
                    transition: "outline .15s",
                  }}>
                    <InstanceAvatar label={inst.label} instanceName={inst.instanceName} size={40}/>
                  </div>
                  {/* Status dot */}
                  <div style={{
                    position: "absolute", bottom: -1, right: -1,
                    width: 11, height: 11, borderRadius: "50%",
                    backgroundColor: connected ? "var(--success, #22c55e)" : "var(--text-muted)",
                    border: "2px solid var(--sidebar-bg, var(--card-bg))",
                  }}/>
                </div>
                {unread > 0 && (
                  <div style={{
                    position: "absolute", top: 2, right: 6,
                    width: 16, height: 16, borderRadius: "50%",
                    backgroundColor: "var(--primary)", color: "#fff",
                    fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                    border: "2px solid var(--sidebar-bg, var(--card-bg))",
                  }}>
                    {unread > 9 ? "9+" : unread}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          COL 2 — CONVERSATION LIST (300px)
          Search bar, filter tabs, sorted list of contacts.
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{
        width: 300, flexShrink: 0, display: "flex", flexDirection: "column",
        borderRight: "1px solid var(--border)",
        backgroundColor: "var(--card-bg)",
      }}>
        {/* Header */}
        <div style={{ padding: "12px 16px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
                {activeInstId === "all"
                  ? "Conversas"
                  : (enabledInstances.find(i => i.id === activeInstId)?.label ||
                     enabledInstances.find(i => i.id === activeInstId)?.instanceName ||
                     "Conversas")}
              </span>
              {/* SSE status dot */}
              <div
                title={sseStatus === "connected" ? "Tempo real ativo" : "Reconectando..."}
                style={{
                  width: 8, height: 8, borderRadius: "50%",
                  backgroundColor:
                    sseStatus === "connected"    ? "var(--success, #22c55e)" :
                    sseStatus === "reconnecting" ? "#f59e0b" : "var(--text-muted)",
                  transition: "background-color .4s",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {/* Nova Conversa */}
              <button onClick={openNewChat} title="Nova conversa" style={{
                width: 28, height: 28, borderRadius: 8, border: "none",
                backgroundColor: "var(--primary-light)", color: "var(--primary)",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}>
                <IconPlus/>
              </button>
              {/* Sync — only when specific instance selected */}
              {activeInstId !== "all" && (
                <button
                  onClick={() => syncConversations(activeInstId)}
                  disabled={!!syncing || enabledInstances.find(i => i.id === activeInstId)?.status !== "connected"}
                  title="Sincronizar conversas"
                  style={{
                    width: 28, height: 28, borderRadius: 8, border: "none",
                    backgroundColor: "var(--primary-light)", color: "var(--primary)",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    opacity: (syncing || enabledInstances.find(i => i.id === activeInstId)?.status !== "connected") ? 0.4 : 1,
                  }}
                >
                  {syncing === activeInstId
                    ? <div style={{ width: 12, height: 12, border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                    : <IconSync/>}
                </button>
              )}
            </div>
          </div>

          {/* Search */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
              <IconSearch/>
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              style={{
                width: "100%", boxSizing: "border-box",
                fontSize: 13, paddingLeft: 32, paddingRight: search ? 28 : 10,
                paddingTop: 7, paddingBottom: 7, borderRadius: 10,
                border: "1px solid var(--border)", outline: "none",
                color: "var(--text-primary)", backgroundColor: "var(--page-bg)",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{
                position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                border: "none", background: "none", cursor: "pointer",
                color: "var(--text-muted)", display: "flex", alignItems: "center",
              }}>
                <IconClose/>
              </button>
            )}
          </div>

          {/* Filter pill tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {([["all", "Todos"], ["unread", "Não lidas"], ["read", "Lidas"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilterStatus(v)}
                style={{
                  flex: 1, padding: "5px 0", fontSize: 12, fontWeight: 600, borderRadius: 20, cursor: "pointer",
                  border: filterStatus === v ? "1px solid var(--primary)" : "1px solid var(--border)",
                  backgroundColor: filterStatus === v ? "var(--primary)" : "transparent",
                  color: filterStatus === v ? "#fff" : "var(--text-muted)",
                  transition: "all .15s",
                }}
              >
                {l}
              </button>
            ))}
            {/* Sort button */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowSortMenu(v => !v)}
                title="Ordenar"
                style={{
                  width: 30, height: 30, borderRadius: 20, cursor: "pointer",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13,
                }}
              >
                ↕
              </button>
              {showSortMenu && (
                <div style={{
                  position: "absolute", right: 0, top: 34, zIndex: 30,
                  backgroundColor: "var(--card-bg)", border: "1px solid var(--border)",
                  borderRadius: 10, boxShadow: "0 4px 16px rgba(0,0,0,.12)",
                  minWidth: 140, overflow: "hidden",
                }}>
                  {([["recent", "Mais recentes"], ["oldest", "Mais antigas"], ["az", "A → Z"]] as const).map(([v, l]) => (
                    <button
                      key={v}
                      onClick={() => { setSortMode(v); setShowSortMenu(false); }}
                      style={{
                        width: "100%", padding: "9px 14px", textAlign: "left",
                        fontSize: 13, border: "none", cursor: "pointer",
                        backgroundColor: sortMode === v ? "var(--primary-light)" : "transparent",
                        color: sortMode === v ? "var(--primary)" : "var(--text-primary)",
                        fontWeight: sortMode === v ? 700 : 400,
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sync message */}
          {activeInstId !== "all" && syncMsg[activeInstId] && (
            <p style={{ fontSize: 11, marginBottom: 6, color: syncMsg[activeInstId].startsWith("✓") ? "var(--success, #22c55e)" : "var(--danger, #ef4444)" }}>
              {syncMsg[activeInstId]}
            </p>
          )}
        </div>

        {/* Contact list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingContacts ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: 40 }}>
              <div style={{ width: 22, height: 22, border: "3px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
            </div>
          ) : contacts.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: 16, margin: "0 auto 10px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--primary-light)" }}>
                <svg width="22" height="22" fill="var(--primary)" viewBox="0 0 24 24">
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                </svg>
              </div>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Nenhuma conversa</p>
              {activeInstId !== "all" && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Clique em sincronizar para importar</p>
              )}
            </div>
          ) : contacts.map(contact => {
            const lastMsg = contact.messages?.[0];
            const isSel   = selectedId === contact.id;
            const hasUnread = contact.unreadCount > 0;
            return (
              <button
                key={contact.id}
                onClick={() => selectContact(contact.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", textAlign: "left", border: "none", cursor: "pointer",
                  backgroundColor: isSel ? "var(--primary-light)" : "transparent",
                  borderLeft: isSel ? "3px solid var(--primary)" : "3px solid transparent",
                  borderBottom: "1px solid color-mix(in srgb, var(--border) 40%, transparent)",
                  transition: "background-color .12s",
                  boxSizing: "border-box",
                }}
              >
                {/* Avatar with unread badge */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar name={contact.name} size={40}/>
                  {hasUnread && (
                    <div style={{
                      position: "absolute", top: -2, right: -2,
                      width: 17, height: 17, borderRadius: "50%",
                      backgroundColor: "var(--primary)", color: "#fff",
                      fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
                      border: "2px solid var(--card-bg)",
                    }}>
                      {contact.unreadCount > 9 ? "9+" : contact.unreadCount}
                    </div>
                  )}
                </div>
                {/* Text content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Row 1: name + timestamp */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: hasUnread ? 700 : 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                      {contact.name}
                    </span>
                    {lastMsg && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                        {relTime(lastMsg.timestamp)}
                      </span>
                    )}
                  </div>
                  {/* Row 2: last message preview */}
                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                    {lastMsg?.fromMe && (
                      <span style={{ color: "var(--primary)", flexShrink: 0 }}>
                        <IconChevronRight/>
                      </span>
                    )}
                    <span style={{
                      fontSize: 12, color: hasUnread ? "var(--text-primary)" : "var(--text-secondary)",
                      fontWeight: hasUnread ? 600 : 400,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {lastMsg?.body || contact.phone}
                    </span>
                  </div>
                  {/* Row 3: badges */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                    <ColumnPill col={contact.column}/>
                    {contact.instance && activeInstId === "all" && (
                      <InstanceBadge inst={contact.instance}/>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          COL 3 — CHAT AREA (flex)
          Header, message thread with grouping/separators, input area.
      ══════════════════════════════════════════════════════════════════ */}
      {selectedContact ? (
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative" }}
          onDragOver={e => { e.preventDefault(); setDropActive(true); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropActive(false); }}
          onDrop={handleDrop}
        >
          {/* Drag-and-drop overlay */}
          {dropActive && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 50,
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "color-mix(in srgb, var(--primary) 12%, transparent)",
              border: "3px dashed var(--primary)", borderRadius: 2, pointerEvents: "none",
            }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>📎</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: "var(--primary)" }}>Solte para enviar</p>
              </div>
            </div>
          )}

          {/* ── Chat header ───────────────────────────────────────────── */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12, padding: "10px 18px",
            borderBottom: "1px solid var(--border)", backgroundColor: "var(--card-bg)", flexShrink: 0,
          }}>
            <Avatar name={selectedContact.name} size={40}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{selectedContact.name}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{selectedContact.phone}</p>
            </div>
            {/* Badges */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {selectedContact.instance && <InstanceBadge inst={selectedContact.instance}/>}
              <ColumnPill col={selectedContact.column}/>
            </div>
            {/* Action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
              {/* Fetch history */}
              {selectedContact.instance && (
                <button
                  onClick={() => fetchHistory(selectedContact.id)}
                  disabled={fetching}
                  title="Buscar histórico do provedor"
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
                    backgroundColor: "transparent", color: "var(--text-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                    opacity: fetching ? 0.4 : 1,
                  }}
                >
                  {fetching
                    ? <div style={{ width: 12, height: 12, border: "2px solid var(--text-muted)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                    : <IconDownload/>}
                </button>
              )}
              {/* Search in conversation — placeholder */}
              <button
                title="Buscar na conversa (em breve)"
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
                  backgroundColor: "transparent", color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
              >
                <IconSearch/>
              </button>
              {/* Info panel toggle */}
              <button
                onClick={() => setShowInfoPanel(v => !v)}
                title="Informações do contato"
                style={{
                  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)",
                  backgroundColor: showInfoPanel ? "var(--primary-light)" : "transparent",
                  color: showInfoPanel ? "var(--primary)" : "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
              >
                <IconInfo/>
              </button>
            </div>
          </div>

          {/* ── Message thread ────────────────────────────────────────── */}
          <div
            ref={msgListRef}
            onScroll={handleMsgScroll}
            style={{
              flex: 1, overflowY: "auto", padding: "16px 20px",
              backgroundColor: "var(--page-bg)", display: "flex", flexDirection: "column", gap: 0,
            }}
          >
            {messages.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhuma mensagem ainda</p>
              </div>
            ) : (() => {
              // Build render list with day-separator insertions
              const items: React.ReactNode[] = [];
              let lastDay = "";
              messages.forEach((msg, idx) => {
                const day = new Date(msg.timestamp).toDateString();
                if (day !== lastDay) {
                  lastDay = day;
                  items.push(
                    <div key={`day-${msg.timestamp}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", margin: "12px 0 8px" }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
                        backgroundColor: "color-mix(in srgb, var(--border) 70%, transparent)",
                        padding: "3px 12px", borderRadius: 99,
                      }}>
                        {dayLabel(msg.timestamp)}
                      </span>
                    </div>
                  );
                }
                const prev = messages[idx - 1];
                const newGrp = isNewGroup(msg, prev);
                const isMe = msg.fromMe;
                const hasMed = !!msg.mediaType;
                const mediaReady = hasMed && !!msg.mediaUrl;
                const mediaSrc = mediaReady ? msg.mediaUrl! : "";
                // Gap between groups
                const topMargin = newGrp ? (idx > 0 ? 10 : 0) : 2;

                items.push(
                  <div key={msg.id} style={{
                    display: "flex",
                    flexDirection: isMe ? "row-reverse" : "row",
                    alignItems: "flex-end",
                    gap: 6,
                    marginTop: topMargin,
                    opacity: msg.status === "sending" ? 0.6 : 1,
                  }}>
                    {/* Received: contact avatar — only on first of group */}
                    {!isMe && (
                      <div style={{ width: 28, flexShrink: 0 }}>
                        {newGrp && <Avatar name={selectedContact.name} size={28}/>}
                      </div>
                    )}

                    {/* Bubble */}
                    <div style={{
                      maxWidth: "65%", borderRadius: 16,
                      borderBottomRightRadius: isMe ? (newGrp ? 4 : 16) : 16,
                      borderBottomLeftRadius: !isMe ? (newGrp ? 4 : 16) : 16,
                      backgroundColor: isMe ? "var(--primary)" : "var(--card-bg)",
                      color: isMe ? "#fff" : "var(--text-primary)",
                      border: !isMe ? "1px solid var(--border)" : "none",
                      boxShadow: "0 1px 2px rgba(0,0,0,.06)",
                      overflow: "hidden",
                    }}>
                      {/* Media content */}
                      {hasMed && !mediaReady && (
                        <div style={{ padding: "10px 14px 4px", display: "flex", alignItems: "center", gap: 8 }}>
                          {msg._mediaLoading ? (
                            <div style={{ width: 14, height: 14, border: `2px solid ${isMe ? "rgba(255,255,255,.5)" : "var(--primary)"}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                          ) : (
                            <button onClick={() => loadMediaForMessage(msg.id)} style={{
                              display: "flex", alignItems: "center", gap: 6, fontSize: 12,
                              background: "none", border: "none", cursor: "pointer",
                              color: isMe ? "rgba(255,255,255,.85)" : "var(--primary)", textDecoration: "underline",
                            }}>
                              <span>{mediaIcon(msg.mediaType || "document")}</span>
                              <span>Carregar mídia</span>
                            </button>
                          )}
                        </div>
                      )}
                      {hasMed && mediaReady && msg.mediaType === "image" && (
                        <a href={mediaSrc} target="_blank" rel="noreferrer">
                          <img src={mediaSrc} alt="imagem" style={{ width: "100%", maxHeight: 260, objectFit: "cover", display: "block", cursor: "zoom-in" }}/>
                        </a>
                      )}
                      {hasMed && mediaReady && msg.mediaType === "video" && (
                        <video src={mediaSrc} controls style={{ width: "100%", maxHeight: 260, display: "block", backgroundColor: "#000" }}/>
                      )}
                      {hasMed && mediaReady && msg.mediaType === "audio" && (
                        <div style={{ padding: "10px 14px 4px" }}>
                          <audio src={mediaSrc} controls style={{ width: "100%", height: 36 }}/>
                        </div>
                      )}
                      {hasMed && mediaReady && msg.mediaType === "document" && (
                        <div style={{ padding: "10px 14px 4px", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 20 }}>📄</span>
                          <a href={mediaSrc} download={msg.body || "documento"} target="_blank" rel="noreferrer"
                            style={{ fontSize: 12, textDecoration: "underline", color: isMe ? "rgba(255,255,255,.9)" : "var(--primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {msg.body || "Baixar documento"}
                          </a>
                        </div>
                      )}

                      {/* Text body */}
                      <div style={{ padding: "8px 12px 6px" }}>
                        {msg.body && (
                          <p style={{ fontSize: 13, margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}>
                            {msg.body}
                          </p>
                        )}
                        {/* Timestamp + status */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 3 }}>
                          <span style={{ fontSize: 10, color: isMe ? "rgba(255,255,255,.6)" : "var(--text-muted)" }}>
                            {new Date(msg.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {isMe && msg.status !== "sending" && (
                            msg.status === "sent"
                              ? <IconCheck color="rgba(255,255,255,.65)"/>
                              : <IconDoubleCheck color={msg.status === "read" ? "#60a5fa" : "rgba(255,255,255,.75)"}/>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
              return items;
            })()}
            <div ref={msgEndRef}/>
          </div>

          {/* ── File preview bar ───────────────────────────────────────── */}
          {pendingFile && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "8px 16px",
              borderTop: "1px solid var(--border)", backgroundColor: "var(--primary-light)", flexShrink: 0,
            }}>
              <span style={{ fontSize: 20 }}>{mediaIcon(fileMediaType(pendingFile.file))}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pendingFile.file.name}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                  {(pendingFile.file.size / 1024).toFixed(0)} KB
                </p>
              </div>
              {fileMediaType(pendingFile.file) === "image" && (
                <img src={pendingFile.base64} alt="" style={{ height: 48, width: 48, objectFit: "cover", borderRadius: 6 }}/>
              )}
              <button onClick={() => setPendingFile(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--danger, #ef4444)", fontSize: 16, display: "flex", alignItems: "center" }}>
                <IconClose/>
              </button>
            </div>
          )}

          {/* ── Warning bar ────────────────────────────────────────────── */}
          {sendWarning && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
              backgroundColor: "color-mix(in srgb, #f59e0b 12%, transparent)",
              borderTop: "1px solid color-mix(in srgb, #f59e0b 25%, transparent)",
              color: "#b45309", fontSize: 12, flexShrink: 0,
            }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
              {sendWarning}
            </div>
          )}

          {/* ── Input area ─────────────────────────────────────────────── */}
          <form
            onSubmit={sendMessage}
            style={{
              display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 14px",
              borderTop: "1px solid var(--border)", backgroundColor: "var(--card-bg)", flexShrink: 0,
            }}
          >
            {recording ? (
              /* ── Recording UI ─────────────────────────────────────── */
              <>
                <button type="button" onClick={cancelRecording} title="Cancelar" style={{
                  width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer",
                  backgroundColor: "color-mix(in srgb, #ef4444 15%, transparent)", color: "#ef4444",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <IconClose/>
                </button>
                <div style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 14px", borderRadius: 24,
                  backgroundColor: "color-mix(in srgb, #ef4444 8%, transparent)",
                  border: "1px solid #ef4444",
                }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#ef4444", animation: "pulse-red 1.2s ease-in-out infinite", flexShrink: 0 }}/>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#ef4444" }}>
                    {String(Math.floor(recSeconds / 60)).padStart(2, "0")}:{String(recSeconds % 60).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Gravando...</span>
                </div>
                <button type="button" onClick={stopRecording} title="Parar e enviar" style={{
                  width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                  backgroundColor: "#ef4444", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                </button>
              </>
            ) : (
              /* ── Normal input UI ───────────────────────────────────── */
              <>
                {/* Hidden file input */}
                <input
                  ref={fileRef} type="file" style={{ display: "none" }}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv"
                  onChange={handleFileInput}
                />
                {/* Paperclip */}
                <button type="button" onClick={() => fileRef.current?.click()} title="Anexar arquivo" style={{
                  width: 38, height: 38, borderRadius: "50%", border: "none", cursor: "pointer",
                  backgroundColor: "var(--border)", color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  transition: "background-color .15s",
                }}>
                  <IconPaperclip/>
                </button>

                {/* Multiline textarea (auto-resize) */}
                <textarea
                  ref={textareaRef}
                  value={newMsg}
                  onChange={handleTextChange}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(e as unknown as React.FormEvent); }
                  }}
                  placeholder={pendingFile ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                  disabled={sending}
                  rows={1}
                  style={{
                    flex: 1, fontSize: 13, padding: "9px 14px", borderRadius: 20, outline: "none",
                    border: "1px solid var(--border)", color: "var(--text-primary)",
                    backgroundColor: "var(--page-bg)", resize: "none", overflowY: "auto",
                    lineHeight: 1.45, fontFamily: "inherit", maxHeight: 96,
                  }}
                />

                {/* Send / mic */}
                {newMsg.trim() || pendingFile ? (
                  <button type="submit" disabled={sending} title="Enviar" style={{
                    width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                    backgroundColor: "var(--primary)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    opacity: sending ? 0.5 : 1, transition: "opacity .15s",
                  }}>
                    <IconSend/>
                  </button>
                ) : (
                  <button type="button" onClick={startRecording} title="Gravar áudio" style={{
                    width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                    backgroundColor: "var(--primary)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <IconMic/>
                  </button>
                )}
              </>
            )}
          </form>
        </div>
      ) : (
        /* No contact selected */
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--page-bg)" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{
              width: 64, height: 64, borderRadius: 24, margin: "0 auto 14px",
              display: "flex", alignItems: "center", justifyContent: "center",
              backgroundColor: "var(--primary-light)",
            }}>
              <svg width="30" height="30" fill="var(--primary)" viewBox="0 0 24 24">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)", margin: "0 0 4px" }}>Selecione uma conversa</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              {instances.length === 0 ? "Configure uma instância em Configurações" : "Escolha um contato ao lado"}
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          COL 4 — CONTACT INFO PANEL (300px, toggleable)
          Editable contact fields, pipeline column selector, instance info.
      ══════════════════════════════════════════════════════════════════ */}
      {showInfoPanel && selectedContact && (
        <div style={{
          width: 300, flexShrink: 0, display: "flex", flexDirection: "column",
          borderLeft: "1px solid var(--border)", backgroundColor: "var(--card-bg)",
          overflowY: "auto",
        }}>
          {/* Panel header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>Informações</span>
            <button onClick={() => setShowInfoPanel(false)} style={{
              width: 26, height: 26, borderRadius: 6, border: "none",
              backgroundColor: "var(--border)", color: "var(--text-muted)",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
              <IconClose/>
            </button>
          </div>

          {/* Avatar + name */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 16px 12px", flexShrink: 0 }}>
            <Avatar name={selectedContact.name} size={60}/>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: "10px 0 2px", textAlign: "center" }}>
              {selectedContact.name}
            </p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{selectedContact.phone}</p>
          </div>

          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Editable: Name */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <IconEdit/> Nome
              </label>
              <input
                value={editName}
                onChange={e => { setEditName(e.target.value); setContactDirty(true); }}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 13, padding: "7px 10px",
                  borderRadius: 8, border: "1px solid var(--border)", outline: "none",
                  color: "var(--text-primary)", backgroundColor: "var(--page-bg)",
                }}
              />
            </div>

            {/* Editable: Email */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>
                E-mail
              </label>
              <input
                type="email"
                value={editEmail}
                onChange={e => { setEditEmail(e.target.value); setContactDirty(true); }}
                placeholder="email@exemplo.com"
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 13, padding: "7px 10px",
                  borderRadius: 8, border: "1px solid var(--border)", outline: "none",
                  color: "var(--text-primary)", backgroundColor: "var(--page-bg)",
                }}
              />
            </div>

            {/* Editable: Notes */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>
                Notas
              </label>
              <textarea
                value={editNotes}
                onChange={e => { setEditNotes(e.target.value); setContactDirty(true); }}
                placeholder="Adicione notas sobre este contato..."
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box", fontSize: 13, padding: "7px 10px",
                  borderRadius: 8, border: "1px solid var(--border)", outline: "none",
                  color: "var(--text-primary)", backgroundColor: "var(--page-bg)",
                  resize: "vertical", fontFamily: "inherit",
                }}
              />
            </div>

            {/* Pipeline column selector */}
            {columns.length > 0 && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, display: "block" }}>
                  Etapa do pipeline
                </label>
                <select
                  value={editColumnId}
                  onChange={e => { setEditColumnId(e.target.value); setContactDirty(true); }}
                  style={{
                    width: "100%", boxSizing: "border-box", fontSize: 13, padding: "7px 10px",
                    borderRadius: 8, border: "1px solid var(--border)", outline: "none",
                    color: "var(--text-primary)", backgroundColor: "var(--page-bg)", cursor: "pointer",
                  }}
                >
                  {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}

            {/* Save button */}
            {contactDirty && (
              <button
                onClick={saveContactInfo}
                disabled={savingContact}
                style={{
                  width: "100%", padding: "9px 0", borderRadius: 10, border: "none",
                  backgroundColor: "var(--primary)", color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: "pointer",
                  opacity: savingContact ? 0.6 : 1, transition: "opacity .15s",
                }}
              >
                {savingContact ? "Salvando..." : "Salvar alterações"}
              </button>
            )}

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }}/>

            {/* Instância vinculada */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                Instância vinculada
              </p>
              {selectedContact.instance ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <InstanceAvatar label={selectedContact.instance.label} instanceName={selectedContact.instance.instanceName} size={32}/>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                      {selectedContact.instance.label || selectedContact.instance.instanceName}
                    </p>
                    <p style={{ fontSize: 11, color: selectedContact.instance.status === "connected" ? "var(--success, #22c55e)" : "var(--text-muted)", margin: 0 }}>
                      {selectedContact.instance.status === "connected" ? "Conectado" : "Desconectado"}
                    </p>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem instância vinculada</p>
              )}
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--border)", margin: "4px 0" }}/>

            {/* Stats */}
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                Informações
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {selectedContact.createdAt && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--text-muted)" }}>Criado em</span>
                    <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                      {new Date(selectedContact.createdAt).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>Mensagens</span>
                  <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{messages.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TOAST NOTIFICATIONS — bottom-right
          Slide in from right, auto-dismiss 6s, max 4 visible.
      ══════════════════════════════════════════════════════════════════ */}
      {toasts.length > 0 && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 100,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {toasts.map(toast => (
            <div
              key={toast.id}
              onClick={() => {
                setToasts(prev => prev.filter(t => t.id !== toast.id));
                selectContact(toast.contactId);
                if (activeInstId !== "all") setActiveInstId("all");
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 14,
                backgroundColor: "var(--card-bg)", border: "1px solid var(--border)",
                boxShadow: "0 4px 20px rgba(0,0,0,.15)",
                maxWidth: 300, cursor: "pointer",
                animation: "slideInRight .3s ease",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                backgroundColor: "var(--primary)", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <IconWA/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {toast.contactName}
                </p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Nova mensagem</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); setToasts(prev => prev.filter(t => t.id !== toast.id)); }}
                style={{
                  width: 20, height: 20, borderRadius: 4, border: "none", background: "none",
                  cursor: "pointer", color: "var(--text-muted)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <IconClose/>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL — NOVA CONVERSA
          Search contacts or type phone number to start a new conversation.
      ══════════════════════════════════════════════════════════════════ */}
      {showNewChat && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeNewChat(); }}
          onKeyDown={e => e.key === "Escape" && closeNewChat()}
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            display: "flex", alignItems: "flex-start", justifyContent: "center",
            paddingTop: 80, paddingLeft: 16, paddingRight: 16,
            backgroundColor: "rgba(0,0,0,.45)",
          }}
        >
          <div style={{
            width: "100%", maxWidth: 440, borderRadius: 18,
            backgroundColor: "var(--card-bg)", border: "1px solid var(--border)",
            boxShadow: "0 8px 40px rgba(0,0,0,.2)", overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 18px", borderBottom: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Nova Conversa</span>
              <button onClick={closeNewChat} style={{
                width: 28, height: 28, borderRadius: 8, border: "none",
                backgroundColor: "var(--border)", color: "var(--text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              }}>
                <IconClose/>
              </button>
            </div>

            {/* Search input */}
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }}>
                  <IconSearch/>
                </div>
                <input
                  ref={newChatInputRef}
                  value={newChatQuery}
                  onChange={e => setNewChatQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Escape") closeNewChat();
                    if (e.key === "Enter" && isPhoneLike && !exactMatch) startNewConversation();
                  }}
                  placeholder="Nome ou número de telefone..."
                  style={{
                    width: "100%", boxSizing: "border-box",
                    fontSize: 14, paddingLeft: 36, paddingRight: 16,
                    paddingTop: 10, paddingBottom: 10, borderRadius: 12,
                    border: "1px solid var(--border)", outline: "none",
                    color: "var(--text-primary)", backgroundColor: "var(--page-bg)",
                  }}
                />
                {newChatLoading && (
                  <div style={{
                    position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                    width: 14, height: 14, border: "2px solid var(--primary)", borderTopColor: "transparent",
                    borderRadius: "50%", animation: "spin 0.8s linear infinite",
                  }}/>
                )}
              </div>
              {activeInstId !== "all" && (
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, marginBottom: 0 }}>
                  Instância: <span style={{ color: "var(--primary)", fontWeight: 600 }}>
                    {enabledInstances.find(i => i.id === activeInstId)?.label ||
                     enabledInstances.find(i => i.id === activeInstId)?.instanceName || activeInstId}
                  </span>
                </p>
              )}
            </div>

            {/* Results */}
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {/* Existing contacts */}
              {newChatResults.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 18px 4px" }}>
                    Contatos existentes
                  </p>
                  {newChatResults.map(c => (
                    <button key={c.id} onClick={() => openExistingContact(c)} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 18px", border: "none", textAlign: "left", cursor: "pointer",
                      backgroundColor: "transparent", transition: "background-color .12s",
                    }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--page-bg)")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <Avatar name={c.name} size={38}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{c.phone}</p>
                      </div>
                      {c.unreadCount > 0 && (
                        <span style={{
                          padding: "2px 7px", borderRadius: 99, fontSize: 11, fontWeight: 700,
                          backgroundColor: "var(--primary)", color: "#fff",
                        }}>
                          {c.unreadCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* New number option */}
              {isPhoneLike && !exactMatch && (
                <div>
                  {newChatResults.length > 0 && (
                    <div style={{ margin: "4px 18px", borderTop: "1px solid var(--border)" }}/>
                  )}
                  <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 18px 4px" }}>
                    Iniciar nova conversa
                  </p>
                  <button
                    onClick={startNewConversation}
                    disabled={newChatStarting}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 18px", border: "none", textAlign: "left", cursor: "pointer",
                      backgroundColor: "transparent", opacity: newChatStarting ? 0.6 : 1,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--page-bg)")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <div style={{ width: 38, height: 38, borderRadius: "50%", backgroundColor: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {newChatStarting
                        ? <div style={{ width: 16, height: 16, border: "2px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
                        : <IconPlus/>}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", margin: 0 }}>
                        {newChatStarting ? "Criando contato..." : `Conversar com +${rawPhoneQuery}`}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                        {newChatStarting ? "Aguarde..." : "Criar novo contato e abrir conversa"}
                      </p>
                    </div>
                  </button>
                </div>
              )}

              {/* Empty state */}
              {!newChatLoading && newChatQuery.trim() && newChatResults.length === 0 && !isPhoneLike && (
                <div style={{ padding: "32px 18px", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 4px" }}>Nenhum contato encontrado.</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>Digite o número do telefone para iniciar uma nova conversa.</p>
                </div>
              )}

              {/* Idle state */}
              {!newChatQuery.trim() && (
                <div style={{ padding: "32px 18px", textAlign: "center" }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                    Digite um nome para buscar contatos existentes,<br/>ou um número de telefone para nova conversa.
                  </p>
                </div>
              )}
            </div>

            {/* Footer hint */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderTop: "1px solid var(--border)" }}>
              <kbd style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "monospace" }}>Enter</kbd>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>para iniciar</span>
              <span style={{ color: "var(--border)", margin: "0 4px" }}>·</span>
              <kbd style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "monospace" }}>Esc</kbd>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>para fechar</span>
            </div>
          </div>
        </div>
      )}

      {/* Spin keyframe — injected inline */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT — wrapped in Suspense (required for useSearchParams)
// ─────────────────────────────────────────────────────────────────────────────
export default function ConversationsClient() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ width: 32, height: 32, border: "4px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}/>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <ConversationsInner/>
    </Suspense>
  );
}
