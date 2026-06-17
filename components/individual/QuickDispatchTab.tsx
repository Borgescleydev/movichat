"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveQuickMessage } from "@/lib/quick-resolve";

interface Instance {
  id: string;
  label: string | null;
  instanceName: string;
  status: string;
}

type MediaTab = "none" | "image" | "video" | "document" | "audio";

const MEDIA_TABS: { id: MediaTab; label: string; accept: string; icon: string }[] = [
  { id: "none",     label: "Sem mídia",  accept: "",                                                     icon: "✍️" },
  { id: "image",    label: "Imagem",     accept: "image/*",                                              icon: "🖼️" },
  { id: "video",    label: "Vídeo",      accept: "video/*",                                              icon: "🎬" },
  { id: "document", label: "Documento",  accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv", icon: "📄" },
  { id: "audio",    label: "Áudio",      accept: "audio/*",                                              icon: "🎵" },
];

// Mapeamento especial: coluna marcada como telefone.
const PHONE_MAP = "__phone__";
const IGNORE_MAP = "";

// Heurística para auto-detectar a coluna de telefone pelo cabeçalho.
const PHONE_HEADER_HINTS = ["phone", "telefone", "tel", "whats", "celular", "numero", "número", "fone", "mobile"];

interface ParsedTable {
  headers: string[];      // nomes de coluna exibidos (cabeçalho ou "Coluna N")
  rows: string[][];       // linhas de dados (sem o cabeçalho)
  colCount: number;
}

/** Detecta o delimitador mais provável na primeira linha não vazia. */
function detectDelimiter(text: string): "," | ";" | "\t" {
  const firstLine = text.split(/\r?\n/).find(l => l.trim().length > 0) || "";
  const counts: Record<string, number> = {
    "\t": (firstLine.match(/\t/g) || []).length,
    ";": (firstLine.match(/;/g) || []).length,
    ",": (firstLine.match(/,/g) || []).length,
  };
  let best: "," | ";" | "\t" = ",";
  let max = -1;
  (["\t", ";", ","] as const).forEach(d => {
    if (counts[d] > max) { max = counts[d]; best = d; }
  });
  return best;
}

/** Parser tolerante a aspas e quebras de linha dentro de campos com aspas. */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        pushField();
      } else if (ch === "\n") {
        pushRow();
      } else if (ch === "\r") {
        // ignora; o \n seguinte fecha a linha
      } else {
        field += ch;
      }
    }
  }
  // último campo/linha pendente
  if (field.length > 0 || row.length > 0) pushRow();
  // remove linhas totalmente vazias
  return rows.filter(r => r.some(c => c.trim().length > 0));
}

/** Sanitiza um cabeçalho para um nome de variável \w. */
function sanitizeVarName(raw: string, fallbackIdx: number): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || `coluna_${fallbackIdx + 1}`;
}

function looksLikePhoneHeader(header: string): boolean {
  const h = header.toLowerCase();
  return PHONE_HEADER_HINTS.some(hint => h.includes(hint));
}

export default function QuickDispatchTab() {
  // ── Dados de entrada ──
  const [rawText, setRawText] = useState("");
  const [hasHeader, setHasHeader] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  // ── Mapeamento de colunas (index -> IGNORE_MAP | PHONE_MAP | varname) ──
  const [columnMap, setColumnMap] = useState<string[]>([]);
  const [mapStructureKey, setMapStructureKey] = useState("");

  // ── Editor de mensagem ──
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // ── Mídia ──
  const [mediaTab, setMediaTab] = useState<MediaTab>("none");
  const [mediaInputMode, setMediaInputMode] = useState<"file" | "url">("url");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaBase64, setMediaBase64] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState("");
  const mediaFileRef = useRef<HTMLInputElement>(null);

  // ── Cadência / agendamento ──
  const [cadenceMin, setCadenceMin] = useState(30);
  const [cadenceMax, setCadenceMax] = useState(90);
  const [cadenceMaxPerHour, setCadenceMaxPerHour] = useState(40);
  const [scheduleMode, setScheduleMode] = useState<"now" | "schedule">("now");
  const [startAt, setStartAt] = useState("");

  // ── Instância ──
  const [instances, setInstances] = useState<Instance[]>([]);
  const [instanceId, setInstanceId] = useState("");

  // ── Envio ──
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ id: string; total: number; scheduled: number; skipped: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/providers").then(async r => {
      if (!r.ok) return;
      const providers = await r.json();
      const all: Instance[] = [];
      for (const p of providers) {
        for (const inst of p.instances || []) all.push(inst);
      }
      setInstances(all);
    }).catch(() => {});
  }, []);

  // ── Parsing reativo do texto colado/arquivo ──
  const parsed: ParsedTable | null = useMemo(() => {
    if (!rawText.trim()) return null;
    try {
      const delimiter = detectDelimiter(rawText);
      const matrix = parseDelimited(rawText, delimiter);
      if (matrix.length === 0) return null;
      const colCount = matrix.reduce((max, r) => Math.max(max, r.length), 0);
      // normaliza largura das linhas
      const norm = matrix.map(r => {
        const copy = [...r];
        while (copy.length < colCount) copy.push("");
        return copy;
      });
      let headers: string[];
      let rows: string[][];
      if (hasHeader) {
        headers = norm[0].map((h, i) => h.trim() || `Coluna ${i + 1}`);
        rows = norm.slice(1);
      } else {
        headers = Array.from({ length: colCount }, (_, i) => `Coluna ${i + 1}`);
        rows = norm;
      }
      return { headers, rows, colCount };
    } catch {
      return null;
    }
  }, [rawText, hasHeader]);

  // Erro de parse derivado em render: há texto mas não há tabela útil.
  const parseError: string | null =
    rawText.trim() && (!parsed || parsed.rows.length === 0)
      ? (parsed && parsed.rows.length === 0
          ? "Nenhuma linha de dados encontrada. Se a primeira linha já é um destinatário, desligue \"primeira linha é cabeçalho\"."
          : "Não foi possível interpretar os dados. Verifique o delimitador (vírgula, ponto-e-vírgula ou tab).")
      : null;

  // Recalcula o mapeamento default quando a estrutura de colunas muda
  // (padrão recomendado de ajuste de estado em render, sem efeito).
  const structureKey = parsed ? `${parsed.colCount}::${parsed.headers.join("\u0001")}` : "";
  if (structureKey !== mapStructureKey) {
    setMapStructureKey(structureKey);
    if (!parsed) {
      setColumnMap([]);
    } else {
      const phoneIdx = parsed.headers.findIndex(looksLikePhoneHeader);
      setColumnMap(parsed.headers.map((h, i) => (i === phoneIdx ? PHONE_MAP : sanitizeVarName(h, i))));
    }
  }

  function setColMapping(idx: number, value: string) {
    setColumnMap(prev => {
      const next = [...prev];
      // garante telefone único: se escolher telefone, limpa outros telefones
      if (value === PHONE_MAP) {
        for (let i = 0; i < next.length; i++) if (next[i] === PHONE_MAP) next[i] = sanitizeVarName(parsed?.headers[i] || "", i);
      }
      next[idx] = value;
      return next;
    });
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setRawText((reader.result as string) || "");
      setHasHeader(true);
    };
    reader.onerror = () => setFileError("Falha ao ler o arquivo.");
    reader.readAsText(file);
  }

  function clearData() {
    setRawText("");
    setFileName(null);
    setFileError(null);
    setColumnMap([]);
    if (csvFileRef.current) csvFileRef.current.value = "";
  }

  // ── Variáveis (colunas mapeadas como var) ──
  const phoneColIndex = columnMap.findIndex(m => m === PHONE_MAP);
  const variableNames = useMemo(() => {
    const out: string[] = [];
    columnMap.forEach(m => {
      if (m !== PHONE_MAP && m !== IGNORE_MAP && m.trim() && !out.includes(m)) out.push(m);
    });
    return out;
  }, [columnMap]);

  // ── Monta recipients ──
  const recipients = useMemo(() => {
    if (!parsed || phoneColIndex < 0) return [] as { phone: string; vars: Record<string, string> }[];
    const out: { phone: string; vars: Record<string, string> }[] = [];
    for (const row of parsed.rows) {
      const phone = (row[phoneColIndex] || "").trim();
      if (!phone) continue;
      const vars: Record<string, string> = {};
      columnMap.forEach((m, i) => {
        if (m !== PHONE_MAP && m !== IGNORE_MAP && m.trim()) vars[m] = (row[i] || "").trim();
      });
      out.push({ phone, vars });
    }
    return out;
  }, [parsed, columnMap, phoneColIndex]);

  const skippedCount = parsed && phoneColIndex >= 0 ? parsed.rows.length - recipients.length : 0;

  // ── Inserção de chip no cursor ──
  function insertAtCursor(token: string) {
    const el = messageRef.current;
    if (!el) { setMessage(m => m + token); return; }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const next = message.slice(0, start) + token + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    });
  }

  // ── Preview ao vivo (1ª linha de destinatários) ──
  const previewText = useMemo(() => {
    if (!message.trim()) return "";
    const previewVars = recipients[0]?.vars || {};
    try {
      return resolveQuickMessage(message, previewVars);
    } catch {
      return message;
    }
  }, [message, recipients]);

  // ── Mídia ──
  function clearMedia() {
    setMediaFile(null);
    setMediaBase64("");
    setMediaUrl("");
    if (mediaFileRef.current) mediaFileRef.current.value = "";
  }

  function handleMediaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMediaFile(file);
    setMediaBase64("");
    const reader = new FileReader();
    reader.onload = () => setMediaBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ── Validações ──
  const selectedInstance = instances.find(i => i.id === instanceId);
  const instanceOffline = !!selectedInstance && selectedInstance.status !== "connected";
  const cadenceInvalid = cadenceMin > cadenceMax;
  const effectiveMediaUrl = mediaInputMode === "file" ? mediaBase64 : mediaUrl;
  const mediaIncomplete = mediaTab !== "none" && !effectiveMediaUrl;
  const scheduleMissing = scheduleMode === "schedule" && !startAt;

  const canSubmit =
    !sending &&
    !!instanceId &&
    !instanceOffline &&
    message.trim().length > 0 &&
    phoneColIndex >= 0 &&
    recipients.length > 0 &&
    !cadenceInvalid &&
    !mediaIncomplete &&
    !scheduleMissing;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSending(true);
    setSubmitError(null);
    setResult(null);
    try {
      const media = mediaTab !== "none" && effectiveMediaUrl
        ? {
            type: mediaTab,
            url: effectiveMediaUrl,
            caption: mediaTab !== "audio" && mediaCaption.trim() ? mediaCaption.trim() : undefined,
            fileName: mediaInputMode === "file" && mediaFile ? mediaFile.name : undefined,
          }
        : null;

      const payload = {
        name: name.trim() || undefined,
        instanceId,
        message,
        media,
        cadenceMinSeconds: cadenceMin,
        cadenceMaxSeconds: cadenceMax,
        cadenceMaxPerHour,
        startAt: scheduleMode === "schedule" && startAt ? new Date(startAt).toISOString() : new Date().toISOString(),
        recipients,
      };

      const res = await fetch("/api/individual/quick-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult(data as { id: string; total: number; scheduled: number; skipped: number });
      } else {
        setSubmitError((data.error as string) || `Erro ao disparar (HTTP ${res.status})`);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Erro inesperado ao disparar");
    } finally {
      setSending(false);
    }
  }

  function resetForNewDispatch() {
    setResult(null);
    setSubmitError(null);
    clearData();
    setMessage("");
    setName("");
    clearMedia();
    setMediaTab("none");
    setScheduleMode("now");
    setStartAt("");
  }

  // ── Tela de sucesso ──
  if (result) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)" }}>
            <svg className="w-8 h-8" style={{ color: "var(--success)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>Disparo registrado!</h3>
          <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>
            {scheduleMode === "schedule" ? "Seu disparo foi agendado com sucesso." : "Seu disparo foi enfileirado e começará em instantes."}
          </p>
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{result.total}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Total</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--success) 25%, transparent)" }}>
              <p className="text-2xl font-bold" style={{ color: "var(--success)" }}>{result.scheduled}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Agendados</p>
            </div>
            <div className="rounded-xl p-4" style={{ backgroundColor: result.skipped > 0 ? "color-mix(in srgb, var(--danger) 8%, transparent)" : "var(--page-bg)", border: `1px solid ${result.skipped > 0 ? "color-mix(in srgb, var(--danger) 25%, transparent)" : "var(--border)"}` }}>
              <p className="text-2xl font-bold" style={{ color: result.skipped > 0 ? "var(--danger)" : "var(--text-muted)" }}>{result.skipped}</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Descartados</p>
            </div>
          </div>
          <button onClick={resetForNewDispatch}
            className="text-sm font-medium px-6 py-2.5 rounded-xl text-white"
            style={{ backgroundColor: "var(--primary)" }}>
            Novo disparo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Intro */}
      <div className="rounded-xl p-4" style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--primary)" }}>⚡ Disparo Rápido (ad-hoc)</p>
        <p className="text-xs" style={{ color: "var(--primary)" }}>
          Cole ou envie uma planilha de destinatários, mapeie as colunas para variáveis, escreva sua mensagem com personalização e dispare — sem precisar cadastrar contatos.
        </p>
      </div>

      {/* ─── 1. Dados dos destinatários ─── */}
      <section className="rounded-xl p-5" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>1. Destinatários</h3>
          {rawText && (
            <button onClick={clearData} className="text-xs" style={{ color: "var(--danger)" }}>Limpar</button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <input ref={csvFileRef} type="file" accept=".csv,text/csv,text/plain" onChange={handleCsvFile} className="hidden" id="qd-csv-file" />
          <label htmlFor="qd-csv-file"
            className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border cursor-pointer"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            Enviar .csv
          </label>
          {fileName && <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{fileName}</span>}
          <label className="flex items-center gap-1.5 text-xs ml-auto cursor-pointer" style={{ color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} className="w-3.5 h-3.5 rounded" style={{ accentColor: "var(--primary)" }} />
            Primeira linha é cabeçalho
          </label>
        </div>

        <textarea
          value={rawText}
          onChange={e => { setRawText(e.target.value); setFileName(null); }}
          placeholder={"Cole aqui os dados (CSV, TSV ou linhas). Ex:\nnome,telefone,plano\nMaria,5511999998888,Premium\nJoão,5511988887777,Free"}
          rows={6}
          className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono resize-vertical"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}
        />

        {(parseError || fileError) && (
          <div className="mt-3 rounded-lg p-3 text-xs" style={{ backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", color: "var(--danger)" }}>
            {fileError || parseError}
          </div>
        )}

        {!rawText.trim() && (
          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            Aguardando dados. Cole o conteúdo ou envie um arquivo .csv para continuar.
          </p>
        )}

        {/* Mapeamento + prévia */}
        {parsed && parsed.rows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                Mapeie cada coluna ({parsed.rows.length} linha{parsed.rows.length !== 1 ? "s" : ""} detectada{parsed.rows.length !== 1 ? "s" : ""})
              </p>
              {phoneColIndex < 0 ? (
                <span className="text-xs font-medium" style={{ color: "var(--danger)" }}>⚠ Selecione exatamente 1 coluna como Telefone</span>
              ) : (
                <span className="text-xs font-medium" style={{ color: "var(--success)" }}>✓ Coluna de telefone definida</span>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--page-bg)" }}>
                    {parsed.headers.map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left align-top" style={{ borderBottom: "1px solid var(--border)", minWidth: 120 }}>
                        <p className="font-semibold mb-1.5 truncate" style={{ color: "var(--text-secondary)" }} title={h}>{h}</p>
                        <select
                          value={columnMap[i] ?? IGNORE_MAP}
                          onChange={e => setColMapping(i, e.target.value)}
                          className="w-full border rounded-md px-1.5 py-1 text-xs"
                          style={{
                            borderColor: columnMap[i] === PHONE_MAP ? "var(--primary)" : "var(--border)",
                            color: "var(--text-primary)",
                            backgroundColor: "var(--card-bg)",
                          }}
                        >
                          <option value={IGNORE_MAP}>— ignorar —</option>
                          <option value={PHONE_MAP}>📱 Telefone</option>
                          <option value={sanitizeVarName(h, i)}>{`{${sanitizeVarName(h, i)}}`}</option>
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 5).map((row, ri) => (
                    <tr key={ri}>
                      {parsed.headers.map((_, ci) => (
                        <td key={ci} className="px-2 py-1.5 truncate" style={{ borderBottom: ri < 4 ? "1px solid var(--border)" : "none", color: "var(--text-primary)", maxWidth: 200 }} title={row[ci]}>
                          {row[ci] || <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.rows.length > 5 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Mostrando 5 de {parsed.rows.length} linhas.</p>
            )}

            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span><strong style={{ color: "var(--success)" }}>{recipients.length}</strong> destinatário{recipients.length !== 1 ? "s" : ""} válido{recipients.length !== 1 ? "s" : ""}</span>
              {skippedCount > 0 && <span style={{ color: "var(--danger)" }}>{skippedCount} sem telefone (descartado{skippedCount !== 1 ? "s" : ""})</span>}
            </div>
          </div>
        )}
      </section>

      {/* ─── 2. Mensagem ─── */}
      <section className="rounded-xl p-5" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>2. Mensagem</h3>

        <div className="mb-3">
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Nome do disparo (opcional)</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Promoção relâmpago"
            className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
        </div>

        {/* Chips de variáveis */}
        <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: "var(--primary-light)", border: "1px solid color-mix(in srgb, var(--primary) 20%, transparent)" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--primary)" }}>VARIÁVEIS — CLIQUE PARA INSERIR</p>
          <div className="flex flex-wrap gap-1.5">
            {variableNames.length === 0 && (
              <span className="text-xs" style={{ color: "var(--primary)" }}>Mapeie colunas como variáveis acima para gerar chips.</span>
            )}
            {variableNames.map(v => (
              <button key={v} type="button" onClick={() => insertAtCursor(`{${v}}`)}
                className="text-xs px-2 py-1 rounded-full font-mono transition-transform active:scale-95"
                style={{ backgroundColor: "var(--card-bg)", color: "var(--primary)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" }}>
                {`{${v}}`}
              </button>
            ))}
            {/* Built-ins */}
            {(["date", "time"] as const).map(b => (
              <button key={b} type="button" onClick={() => insertAtCursor(`{${b}}`)}
                className="text-xs px-2 py-1 rounded-full font-mono transition-transform active:scale-95"
                style={{ backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
                {`{${b}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Bloco SPIN */}
        <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)" }}>
          <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>VARIAÇÕES DE TEXTO (SPIN)</p>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
            Use <code style={{ color: "var(--primary)" }}>{"{opção1|opção2|opção3}"}</code> e cada destinatário recebe <strong>uma variação aleatória</strong>. Ótimo para evitar mensagens idênticas.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {["{Oi|Olá|Ei}", "{Tudo bem?|Como vai?|Beleza?}", "{Aproveite|Não perca|Garanta já}"].map(ex => (
              <button key={ex} type="button" onClick={() => insertAtCursor(ex)}
                className="text-xs px-2 py-1 rounded-full font-mono transition-transform active:scale-95"
                style={{ backgroundColor: "var(--card-bg)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <textarea
          ref={messageRef}
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={"{Oi|Olá} {nome}! 👋\n\nTemos uma novidade no seu plano {plano}..."}
          rows={6}
          className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-vertical"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{message.length} caracteres</span>
        </div>

        {/* Preview ao vivo */}
        <div className="mt-3">
          <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>
            PRÉVIA AO VIVO {recipients.length > 0 ? "(1º destinatário)" : "(dados de exemplo)"}
          </p>
          <div className="rounded-xl p-4 text-sm whitespace-pre-wrap" style={{ backgroundColor: "var(--page-bg)", border: "1px solid var(--border)", color: "var(--text-primary)", minHeight: 64 }}>
            {message.trim()
              ? previewText
              : <span style={{ color: "var(--text-muted)" }}>Digite uma mensagem para ver a prévia.</span>}
          </div>
        </div>
      </section>

      {/* ─── 3. Mídia ─── */}
      <section className="rounded-xl p-5" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>3. Mídia (opcional)</h3>
        <div className="flex gap-1 flex-wrap mb-3">
          {MEDIA_TABS.map(t => (
            <button key={t.id} type="button"
              onClick={() => { setMediaTab(t.id); clearMedia(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={mediaTab === t.id ? { backgroundColor: "var(--primary)", color: "#fff" } : { backgroundColor: "var(--border)", color: "var(--text-secondary)" }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {mediaTab !== "none" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["file", "url"] as const).map(m => (
                <button key={m} type="button"
                  onClick={() => { setMediaInputMode(m); clearMedia(); }}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
                  style={mediaInputMode === m ? { borderColor: "var(--primary)", color: "var(--primary)", backgroundColor: "var(--primary-light)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}>
                  {m === "file" ? "📁 Arquivo" : "🔗 URL"}
                </button>
              ))}
            </div>

            {mediaInputMode === "file" ? (
              <div>
                <input ref={mediaFileRef} type="file"
                  accept={MEDIA_TABS.find(t => t.id === mediaTab)?.accept || "*"}
                  onChange={handleMediaFile} className="hidden" id="qd-media-file" />
                <label htmlFor="qd-media-file"
                  className="flex flex-col items-center justify-center gap-2 rounded-xl p-5 cursor-pointer border-2 border-dashed transition-colors"
                  style={{ borderColor: mediaFile ? "var(--primary)" : "var(--border)", backgroundColor: mediaFile ? "var(--primary-light)" : "var(--page-bg)" }}>
                  {mediaFile ? (
                    <>
                      <span className="text-2xl">{MEDIA_TABS.find(t => t.id === mediaTab)?.icon}</span>
                      <span className="text-xs font-medium text-center truncate max-w-full" style={{ color: "var(--primary)" }}>{mediaFile.name}</span>
                      {!mediaBase64 && <span className="text-xs" style={{ color: "var(--text-muted)" }}>Carregando...</span>}
                    </>
                  ) : (
                    <>
                      <span className="text-2xl opacity-40">{MEDIA_TABS.find(t => t.id === mediaTab)?.icon}</span>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>Clique para selecionar {mediaTab}</span>
                    </>
                  )}
                </label>
              </div>
            ) : (
              <input value={mediaUrl} onChange={e => setMediaUrl(e.target.value)}
                placeholder={`URL do ${mediaTab} (https://...)`}
                className="w-full text-sm rounded-lg px-3 py-2.5 outline-none"
                style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
            )}

            {mediaTab !== "audio" && (
              <div>
                <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Legenda (opcional)</p>
                <textarea value={mediaCaption} onChange={e => setMediaCaption(e.target.value)}
                  placeholder="Legenda da mídia..." rows={2}
                  className="w-full text-sm rounded-xl px-3 py-2.5 resize-none outline-none"
                  style={{ border: "1px solid var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── 4. Cadência e agendamento ─── */}
      <section className="rounded-xl p-5" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
        <h3 className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>4. Cadência e disparo</h3>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>Intervalo aleatório entre envios para evitar bloqueios. Mínimo recomendado: 30s.</p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Mín. (seg)</label>
            <input type="number" min={5} max={3600} value={cadenceMin} onChange={e => setCadenceMin(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm text-center"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Máx. (seg)</label>
            <input type="number" min={5} max={3600} value={cadenceMax} onChange={e => setCadenceMax(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm text-center"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Máx/hora</label>
            <input type="number" min={1} max={500} value={cadenceMaxPerHour} onChange={e => setCadenceMaxPerHour(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm text-center"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
          </div>
        </div>
        {cadenceInvalid && (
          <p className="text-xs mb-3" style={{ color: "var(--danger)" }}>O intervalo mínimo não pode ser maior que o máximo.</p>
        )}

        {/* Instância */}
        <div className="mb-4">
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Instância WhatsApp *</label>
          <select value={instanceId} onChange={e => setInstanceId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }}>
            <option value="">Selecione uma instância</option>
            {instances.map(i => (
              <option key={i.id} value={i.id}>
                {i.label || i.instanceName} — {i.status === "connected" ? "✓ Conectada" : "⚠ Offline"}
              </option>
            ))}
          </select>
          {instanceOffline && (
            <p className="text-xs mt-1.5" style={{ color: "var(--danger)" }}>Esta instância está offline. Conecte-a antes de disparar.</p>
          )}
        </div>

        {/* Agora vs agendar */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {([
            { v: "now" as const, label: "Disparar agora", icon: "⚡", desc: "Começa imediatamente" },
            { v: "schedule" as const, label: "Agendar", icon: "📅", desc: "Escolher data e hora" },
          ]).map(opt => (
            <button key={opt.v} type="button" onClick={() => setScheduleMode(opt.v)}
              className="flex items-start gap-2 px-3 py-2.5 rounded-xl border-2 text-left transition-all"
              style={scheduleMode === opt.v
                ? { borderColor: "var(--primary)", backgroundColor: "var(--primary-light)" }
                : { borderColor: "var(--border)", backgroundColor: "transparent" }}>
              <span className="text-lg leading-none mt-0.5">{opt.icon}</span>
              <div>
                <p className="text-xs font-semibold" style={{ color: scheduleMode === opt.v ? "var(--primary)" : "var(--text-primary)" }}>{opt.label}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>

        {scheduleMode === "schedule" && (
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>Data e hora *</label>
            <input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)", backgroundColor: "var(--page-bg)" }} />
            {scheduleMissing && <p className="text-xs mt-1.5" style={{ color: "var(--danger)" }}>Escolha a data e hora do agendamento.</p>}
          </div>
        )}
      </section>

      {/* ─── Resumo + ação ─── */}
      <section className="rounded-xl p-5 sticky bottom-0" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
        {submitError && (
          <div className="mb-3 rounded-lg p-3 text-xs" style={{ backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--danger) 25%, transparent)", color: "var(--danger)" }}>
            {submitError}
          </div>
        )}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            <p><strong style={{ color: "var(--text-primary)" }}>{recipients.length}</strong> destinatário{recipients.length !== 1 ? "s" : ""} · cadência {cadenceMin}–{cadenceMax}s · {scheduleMode === "now" ? "envio imediato" : "agendado"}</p>
            {mediaTab !== "none" && <p className="mt-0.5" style={{ color: "var(--text-muted)" }}>Com mídia: {MEDIA_TABS.find(t => t.id === mediaTab)?.label}</p>}
          </div>
          <button onClick={handleSubmit} disabled={!canSubmit}
            className="flex items-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-xl text-white disabled:opacity-40"
            style={{ backgroundColor: "var(--primary)" }}>
            {sending ? (
              <>
                <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: "#fff", borderTopColor: "transparent" }} />
                Disparando...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                {scheduleMode === "now" ? "Disparar agora" : "Agendar disparo"}
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
