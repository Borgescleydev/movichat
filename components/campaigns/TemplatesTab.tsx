"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Template {
  id: string;
  name: string;
  body: string;
  variables: string;
  mediaType: string | null;
  mediaUrl: string | null;
  mediaCaption: string | null;
  createdAt: string;
  updatedAt: string;
}

type MediaTab = "none" | "image" | "video" | "document" | "audio";

const MESSAGE_LIMIT = 4096;
const CAPTION_LIMIT = 1024;

const MEDIA_TABS: { id: MediaTab; label: string; accept: string; icon: string }[] = [
  { id: "none",     label: "Sem mídia",  accept: "",                                                    icon: "✍️" },
  { id: "image",    label: "Imagem",     accept: "image/*",                                             icon: "🖼️" },
  { id: "video",    label: "Vídeo",      accept: "video/*",                                             icon: "🎬" },
  { id: "document", label: "Documento",  accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv", icon: "📄" },
  { id: "audio",    label: "Áudio",      accept: "audio/*",                                             icon: "🎵" },
];

const MEDIA_ICONS: Record<string, string> = { image: "🖼", video: "🎬", audio: "🎵", document: "📎" };

function extractVars(body: string): string[] {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

// ─── GroupAvatar ──────────────────────────────────────────────
const GRP_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f43f5e","#f97316","#eab308","#22c55e","#10b981","#06b6d4","#3b82f6"];
function grpColor(name: string) { let h=0; for(let i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))>>>0; return GRP_COLORS[h%GRP_COLORS.length]; }
function GroupAvatar({ name, size = 32 }: { name: string; size?: number }) {
  const ini = name.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g,"").split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("") || name.charAt(0).toUpperCase();
  return <div style={{ width:size,height:size,borderRadius:"50%",flexShrink:0,backgroundColor:grpColor(name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.38,fontWeight:700,color:"#fff",letterSpacing:"-0.5px",userSelect:"none" }}>{ini}</div>;
}

// ─── FormattedTextArea ────────────────────────────────────────
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
  const sharedStyle: React.CSSProperties = { fontFamily: "inherit", fontSize: `${FONT_SIZE}px`, lineHeight: LINE_HEIGHT, letterSpacing: "normal", tabSize: 2 };

  return (
    <div className="space-y-1.5">
      {showFormatting && (
        <div className="flex items-center gap-1">
          {[
            { wrap: "*",   display: <strong>B</strong>,                                       title: "Negrito  (*texto*)" },
            { wrap: "_",   display: <em>I</em>,                                               title: "Itálico  (_texto_)" },
            { wrap: "~",   display: <s>S</s>,                                                 title: "Tachado  (~texto~)" },
            { wrap: "```", display: <span className="font-mono text-xs">{"</>"}</span>, title: "Código  (```texto```)" },
          ].map(({ wrap, display, title }) => (
            <button key={wrap} type="button" onClick={() => insertFormat(wrap)} title={title}
              className="w-8 h-7 flex items-center justify-center rounded border text-sm transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", backgroundColor: "var(--page-bg)" }}>
              {display}
            </button>
          ))}
          <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>*negrito* _itálico_ ~tachado~</span>
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden"
        style={{ border: `1.5px solid ${over ? "var(--danger)" : "var(--border)"}`, transition: "border-color 0.2s" }}>
        <div ref={backdropRef} aria-hidden="true"
          style={{ ...sharedStyle, position:"absolute", top:0, left:0, right:0, bottom:0, padding:PADDING, whiteSpace:"pre-wrap", wordBreak:"break-word", overflowY:"auto", overflowX:"hidden", pointerEvents:"none", userSelect:"none", scrollbarWidth:"none" }}>
          <span style={{ color:"transparent" }}>{normalPart}</span>
          {overPart && <span style={{ color:"rgb(239,68,68)", backgroundColor:"rgba(239,68,68,0.15)", borderRadius:"2px" }}>{overPart}</span>}
          <span style={{ display:"inline-block" }}> </span>
        </div>
        <textarea ref={ref} value={value}
          onChange={(e) => { onChange(e.target.value); syncScroll(); }}
          onScroll={syncScroll}
          placeholder={placeholder}
          style={{ ...sharedStyle, display:"block", position:"relative", width:"100%", minHeight:`${minRows*FONT_SIZE*LINE_HEIGHT+20}px`, padding:PADDING, backgroundColor:"transparent", color:"var(--text-primary)", caretColor:"var(--text-primary)", resize:"vertical", outline:"none", border:"none", zIndex:1 }}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 rounded-full overflow-hidden" style={{ height:"3px", backgroundColor:"var(--border)" }}>
          <div style={{ height:"100%", width:`${pct}%`, backgroundColor: over ? "var(--danger)" : pct > 80 ? "var(--warning, #f59e0b)" : "var(--primary)", transition:"width 0.15s, background-color 0.2s", borderRadius:"9999px" }} />
        </div>
        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: over ? "var(--danger)" : pct > 80 ? "var(--warning, #f59e0b)" : "var(--text-muted)" }}>
          {over ? <><strong>+{overCount.toLocaleString("pt-BR")}</strong> acima do limite</> : <>{value.length.toLocaleString("pt-BR")} / {limit.toLocaleString("pt-BR")}</>}
        </span>
      </div>
    </div>
  );
}

// ─── Phone Mockup ─────────────────────────────────────────────
function PhoneMockup({ message, mediaTab, mediaPreview, mediaCaption, mediaFileName, groupName }: {
  message: string; mediaTab: MediaTab; mediaPreview: string; mediaCaption: string; mediaFileName?: string; groupName: string;
}) {
  const now = new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width:"260px" }}>
        <div className="rounded-[38px] overflow-hidden shadow-2xl" style={{ background:"#1a1a2e", padding:"12px 6px", boxShadow:"0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 2px #333" }}>
          <div className="flex justify-center mb-2"><div className="w-20 h-5 rounded-full" style={{ backgroundColor:"#111" }} /></div>
          <div className="rounded-[28px] overflow-hidden" style={{ height:"480px", display:"flex", flexDirection:"column" }}>
            {/* WA header */}
            <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor:"#075e54", flexShrink:0 }}>
              <GroupAvatar name={groupName} size={26} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{groupName}</p>
                <p className="text-xs" style={{ color:"rgba(255,255,255,0.7)" }}>128 participantes</p>
              </div>
            </div>
            {/* Chat bg */}
            <div className="flex-1 overflow-hidden flex flex-col justify-end p-3 gap-2"
              style={{ backgroundColor:"#e5ddd5", backgroundImage:"url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c9bbaa' fill-opacity='0.3'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
              <div className="flex justify-start mb-1">
                <div className="rounded-lg px-2.5 py-1.5 max-w-[75%]" style={{ backgroundColor:"#fff", fontSize:"11px" }}>
                  <p style={{ color:"#25d366", fontWeight:600, fontSize:"10px" }}>João</p>
                  <p style={{ color:"#333" }}>Bom dia! 👋</p>
                  <p className="text-right" style={{ fontSize:"9px", color:"#999", marginTop:"2px" }}>09:45</p>
                </div>
              </div>
              {(message || mediaTab !== "none") ? (
                <div className="flex justify-end">
                  <div className="rounded-lg overflow-hidden max-w-[85%]" style={{ backgroundColor:"#dcf8c6", boxShadow:"0 1px 2px rgba(0,0,0,0.15)" }}>
                    {mediaTab === "image" && mediaPreview && <img src={mediaPreview} alt="preview" className="w-full max-h-36 object-cover" style={{ display:"block" }} />}
                    {mediaTab === "image" && !mediaPreview && <div className="w-full h-20 flex items-center justify-center" style={{ backgroundColor:"#b2dfb0" }}><span style={{ fontSize:"24px" }}>🖼️</span></div>}
                    {mediaTab === "video" && (
                      <div className="w-full h-20 flex items-center justify-center relative" style={{ backgroundColor:"#222" }}>
                        {mediaPreview ? <video src={mediaPreview} className="w-full h-full object-cover" /> : <span style={{ fontSize:"24px" }}>🎬</span>}
                        <div className="absolute inset-0 flex items-center justify-center"><div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ backgroundColor:"rgba(0,0,0,0.5)" }}><svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
                      </div>
                    )}
                    {mediaTab === "audio" && (
                      <div className="flex items-center gap-2 px-3 py-2" style={{ minWidth:"160px" }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor:"#25d366" }}><svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg></div>
                        <div className="flex-1 flex items-center gap-0.5 h-5">{Array.from({length:20}).map((_,i)=><div key={i} className="flex-1 rounded-full" style={{ backgroundColor:"#999", height:`${Math.random()*80+20}%`, minHeight:"2px" }} />)}</div>
                        <span style={{ fontSize:"9px", color:"#666" }}>0:00</span>
                      </div>
                    )}
                    {mediaTab === "document" && (
                      <div className="flex items-center gap-2 px-3 py-2" style={{ minWidth:"160px" }}>
                        <div className="w-7 h-9 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor:"#e0403c" }}><svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg></div>
                        <div className="flex-1 min-w-0"><p className="truncate" style={{ fontSize:"10px", fontWeight:600, color:"#333" }}>{mediaFileName || "documento.pdf"}</p><p style={{ fontSize:"9px", color:"#666" }}>Documento</p></div>
                      </div>
                    )}
                    {(message || (mediaTab !== "none" && mediaCaption)) && (
                      <div className="px-2.5 pt-1.5 pb-1"><p style={{ fontSize:"11px", color:"#333", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{mediaTab !== "none" && mediaCaption ? mediaCaption : message}</p></div>
                    )}
                    <div className="flex items-center justify-end gap-1 px-2 pb-1">
                      <span style={{ fontSize:"9px", color:"#666" }}>{now}</span>
                      <svg className="w-2.5 h-2.5" style={{ color:"#34b7f1" }} fill="currentColor" viewBox="0 0 24 24"><path d="M17.9 4.5L9.4 13 6.1 9.7 4.7 11.1l4.7 4.7 9.9-9.9-1.4-1.4zM21.1 4.5l-9.9 9.9-1.4-1.4 1.4-1.4L21.1 4.5z" opacity=".5"/><path d="M17.9 4.5l1.4 1.4-9.9 9.9-4.7-4.7 1.4-1.4 3.3 3.3z"/></svg>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center"><div className="px-3 py-1.5 rounded-lg text-center" style={{ backgroundColor:"rgba(255,255,255,0.7)", fontSize:"10px", color:"#666" }}>A mensagem aparecerá aqui</div></div>
              )}
            </div>
            {/* Input bar */}
            <div className="flex items-center gap-2 px-2 py-2" style={{ backgroundColor:"#f0f0f0", flexShrink:0 }}>
              <div className="flex-1 rounded-full px-3 py-1.5" style={{ backgroundColor:"#fff", fontSize:"10px", color:"#999" }}>Mensagem</div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor:"#25d366" }}><svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg></div>
            </div>
          </div>
          <div className="flex justify-center mt-2"><div className="w-20 h-1 rounded-full" style={{ backgroundColor:"#555" }} /></div>
        </div>
        <p className="text-center text-xs mt-2" style={{ color:"var(--text-muted)" }}>Pré-visualização</p>
      </div>
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────
interface FormState {
  name: string;
  body: string;
  mediaTab: MediaTab;
  mediaUrl: string;
  mediaCaption: string;
  mediaInputMode: "file" | "url";
  mediaFile: File | null;
  mediaBase64: string;
}

const EMPTY_FORM: FormState = { name:"", body:"", mediaTab:"none", mediaUrl:"", mediaCaption:"", mediaInputMode:"url", mediaFile:null, mediaBase64:"" };

// ─── Main ─────────────────────────────────────────────────────
export default function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/campaigns/templates");
    if (res.ok) setTemplates(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  async function openEdit(t: Template) {
    setEditing(t);
    // A listagem não traz mais mediaUrl (base64 pesado); busca o registro completo sob demanda.
    let mediaUrl = "";
    try {
      const res = await fetch(`/api/campaigns/templates/${t.id}`);
      if (res.ok) {
        const full = await res.json();
        mediaUrl = full.mediaUrl || "";
      }
    } catch {
      mediaUrl = "";
    }
    setForm({
      name: t.name,
      body: t.body,
      mediaTab: (t.mediaType as MediaTab) || "none",
      mediaUrl,
      mediaCaption: t.mediaCaption || "",
      mediaInputMode: "url",
      mediaFile: null,
      mediaBase64: "",
    });
    setShowForm(true);
  }

  function clearMedia() {
    setForm(f => ({ ...f, mediaFile:null, mediaBase64:"", mediaUrl:"" }));
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, mediaFile:file, mediaBase64:"" }));
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, mediaBase64: reader.result as string }));
    reader.readAsDataURL(file);
  }

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const effectiveUrl = form.mediaInputMode === "file" ? form.mediaBase64 : form.mediaUrl;
      const payload = {
        name: form.name,
        body: form.body,
        mediaType: form.mediaTab !== "none" ? form.mediaTab : null,
        mediaUrl: form.mediaTab !== "none" && effectiveUrl ? effectiveUrl : null,
        mediaCaption: form.mediaTab !== "none" && form.mediaTab !== "audio" && form.mediaCaption ? form.mediaCaption : null,
      };
      const res = editing
        ? await fetch(`/api/campaigns/templates/${editing.id}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) })
        : await fetch("/api/campaigns/templates", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
      if (res.ok) { setShowForm(false); loadTemplates(); }
      else { const data = await res.json(); alert(data.error || "Erro ao salvar"); }
    } finally { setSaving(false); }
  }

  async function deleteTemplate(id: string) {
    const res = await fetch(`/api/campaigns/templates/${id}`, { method:"DELETE" });
    if (res.ok) { setDeleteConfirm(null); loadTemplates(); }
    else { const data = await res.json(); alert(data.error || "Erro ao excluir"); setDeleteConfirm(null); }
  }

  const liveVars = extractVars(form.body);
  const previewGroup = liveVars.includes("group_name") ? "Nome do Grupo" : "Grupo Exemplo";
  const effectiveMedia = form.mediaInputMode === "file" ? form.mediaBase64 : form.mediaUrl;

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor:"var(--primary)", borderTopColor:"transparent" }} />
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm" style={{ color:"var(--text-secondary)" }}>{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
        <button onClick={openCreate}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg text-white"
          style={{ backgroundColor:"var(--primary)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Novo Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl p-16 text-center border-2 border-dashed" style={{ borderColor:"var(--border)", color:"var(--text-muted)" }}>
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor:"var(--primary-light)" }}>
            <svg className="w-7 h-7" style={{ color:"var(--primary)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="font-semibold text-base" style={{ color:"var(--text-secondary)" }}>Nenhum template criado</p>
          <p className="text-sm mt-1">Crie templates reutilizáveis com variáveis e mídia</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => {
            const vars = JSON.parse(t.variables || "[]") as string[];
            return (
              <div key={t.id} className="rounded-xl p-4" style={{ border:"1px solid var(--border)", backgroundColor:"var(--card-bg)" }}>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ backgroundColor:"var(--primary-light)" }}>
                    {t.mediaType ? MEDIA_ICONS[t.mediaType] : "💬"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-sm" style={{ color:"var(--text-primary)" }}>{t.name}</h3>
                      {t.mediaType && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor:"var(--primary-light)", color:"var(--primary)" }}>
                          {MEDIA_TABS.find(m=>m.id===t.mediaType)?.label}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mb-2 line-clamp-2" style={{ color:"var(--text-secondary)" }}>{t.body}</p>
                    {vars.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {vars.map(v => (
                          <code key={v} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor:"var(--border)", color:"var(--text-secondary)" }}>{`{{${v}}}`}</code>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded-lg" style={{ color:"var(--text-secondary)" }}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {deleteConfirm === t.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteTemplate(t.id)} className="text-xs px-2 py-1 rounded text-white" style={{ backgroundColor:"var(--danger)" }}>Excluir</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded" style={{ color:"var(--text-muted)" }}>Cancelar</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(t.id)} className="p-1.5 rounded-lg" style={{ color:"var(--danger)" }}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Template Form Modal ─────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full shadow-2xl overflow-hidden" style={{ maxWidth:"960px", maxHeight:"92vh", display:"flex", flexDirection:"column", backgroundColor:"var(--card-bg)" }}>

            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom:"1px solid var(--border)" }}>
              <h3 className="text-base font-semibold" style={{ color:"var(--text-primary)" }}>
                {editing ? "Editar Template" : "Novo Template"}
              </h3>
              <button onClick={() => setShowForm(false)} style={{ color:"var(--text-muted)" }}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Body — 2 columns */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-0 h-full">

                {/* ── Left: form ── */}
                <form id="tpl-form" onSubmit={saveTemplate} className="p-6 space-y-5 overflow-y-auto" style={{ borderRight:"1px solid var(--border)" }}>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>Nome do Template</label>
                    <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}
                      placeholder="Ex: Black Friday 2024"
                      className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2"
                      style={{ borderColor:"var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }} required />
                  </div>

                  {/* Body */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color:"var(--text-primary)" }}>Mensagem</label>
                    <p className="text-xs mb-2" style={{ color:"var(--text-muted)" }}>
                      Use <code className="px-1 rounded" style={{ backgroundColor:"var(--border)" }}>{"{{variavel}}"}</code> para variáveis dinâmicas.{" "}
                      <code className="px-1 rounded" style={{ backgroundColor:"var(--primary-light)", color:"var(--primary)" }}>{"{{group_name}}"}</code> é preenchido automaticamente.
                    </p>
                    <FormattedTextArea
                      value={form.body}
                      onChange={v => setForm({...form, body:v})}
                      limit={MESSAGE_LIMIT}
                      placeholder={"Olá {{group_name}}! 🎉\n\nTemos uma promoção especial para vocês..."}
                      minRows={8}
                      showFormatting
                      inputRef={msgRef}
                    />
                    {liveVars.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-xs" style={{ color:"var(--text-muted)" }}>Variáveis:</span>
                        {liveVars.map(v => (
                          <code key={v} className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: v==="group_name" ? "var(--primary-light)" : "var(--border)", color: v==="group_name" ? "var(--primary)" : "var(--text-secondary)" }}>
                            {`{{${v}}}`}{v==="group_name" && " ✓ auto"}
                          </code>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Media */}
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color:"var(--text-primary)" }}>Mídia (opcional)</label>

                    {/* Type tabs */}
                    <div className="flex gap-1 flex-wrap mb-3">
                      {MEDIA_TABS.map(t => (
                        <button key={t.id} type="button"
                          onClick={() => { setForm(f=>({...f, mediaTab:t.id})); clearMedia(); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                          style={form.mediaTab===t.id ? { backgroundColor:"var(--primary)", color:"#fff" } : { backgroundColor:"var(--border)", color:"var(--text-secondary)" }}>
                          <span>{t.icon}</span>{t.label}
                        </button>
                      ))}
                    </div>

                    {form.mediaTab !== "none" && (
                      <div className="space-y-3">
                        {/* Input mode toggle */}
                        <div className="flex gap-2">
                          {(["file","url"] as const).map(m => (
                            <button key={m} type="button"
                              onClick={() => { setForm(f=>({...f, mediaInputMode:m})); clearMedia(); }}
                              className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                              style={form.mediaInputMode===m ? { borderColor:"var(--primary)", color:"var(--primary)", backgroundColor:"var(--primary-light)" } : { borderColor:"var(--border)", color:"var(--text-muted)" }}>
                              {m==="file" ? "📁 Arquivo" : "🔗 URL"}
                            </button>
                          ))}
                        </div>

                        {form.mediaInputMode === "file" ? (
                          <div>
                            <input ref={fileRef} type="file"
                              accept={MEDIA_TABS.find(t=>t.id===form.mediaTab)?.accept || "*"}
                              onChange={handleFileSelect} className="hidden" id="tpl-media-file" />
                            <label htmlFor="tpl-media-file"
                              className="flex flex-col items-center justify-center gap-2 rounded-xl p-5 cursor-pointer border-2 border-dashed transition-colors"
                              style={{ borderColor: form.mediaFile ? "var(--primary)" : "var(--border)", backgroundColor: form.mediaFile ? "var(--primary-light)" : "var(--page-bg)" }}>
                              {form.mediaFile ? (
                                <>
                                  <span className="text-2xl">{MEDIA_TABS.find(t=>t.id===form.mediaTab)?.icon}</span>
                                  <span className="text-xs font-medium text-center truncate max-w-full" style={{ color:"var(--primary)" }}>{form.mediaFile.name}</span>
                                  <span className="text-xs" style={{ color:"var(--text-muted)" }}>{(form.mediaFile.size/1024).toFixed(0)} KB</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-2xl opacity-40">{MEDIA_TABS.find(t=>t.id===form.mediaTab)?.icon}</span>
                                  <span className="text-xs" style={{ color:"var(--text-muted)" }}>Clique para selecionar {form.mediaTab}</span>
                                </>
                              )}
                            </label>
                            {form.mediaFile && <button type="button" onClick={clearMedia} className="text-xs mt-1" style={{ color:"var(--danger)" }}>Remover arquivo</button>}
                          </div>
                        ) : (
                          <input value={form.mediaUrl} onChange={e=>setForm(f=>({...f,mediaUrl:e.target.value}))}
                            placeholder={`URL do ${form.mediaTab} (https://...)`}
                            className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                            style={{ border:"1px solid var(--border)", color:"var(--text-primary)", backgroundColor:"var(--page-bg)" }} />
                        )}

                        {/* Caption */}
                        {form.mediaTab !== "audio" && (
                          <div>
                            <p className="text-xs mb-1.5" style={{ color:"var(--text-muted)" }}>Legenda (opcional)</p>
                            <FormattedTextArea
                              value={form.mediaCaption}
                              onChange={v => setForm(f=>({...f, mediaCaption:v}))}
                              limit={CAPTION_LIMIT}
                              placeholder="Legenda da mídia..."
                              minRows={3}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-3 pt-1">
                    <button type="submit" disabled={saving}
                      className="flex-1 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-60"
                      style={{ backgroundColor:"var(--primary)" }}>
                      {saving ? "Salvando..." : editing ? "Salvar Alterações" : "Criar Template"}
                    </button>
                    <button type="button" onClick={() => setShowForm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm border"
                      style={{ borderColor:"var(--border)", color:"var(--text-secondary)" }}>
                      Cancelar
                    </button>
                  </div>
                </form>

                {/* ── Right: preview ── */}
                <div className="hidden lg:block p-5 overflow-y-auto" style={{ backgroundColor:"color-mix(in srgb, var(--page-bg) 60%, transparent)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-4 text-center" style={{ color:"var(--text-muted)" }}>Pré-visualização</p>
                  <PhoneMockup
                    message={form.body}
                    mediaTab={form.mediaTab}
                    mediaPreview={effectiveMedia}
                    mediaCaption={form.mediaCaption}
                    mediaFileName={form.mediaFile?.name}
                    groupName={previewGroup}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
