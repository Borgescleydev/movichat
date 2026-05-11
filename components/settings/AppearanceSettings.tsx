"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, THEME_GROUPS, THEME_LABELS, PRESET_THEMES, themeToCSS } from "@/lib/theme";
import type { ThemeConfig } from "@/lib/theme";

export default function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/appearance")
      .then((r) => r.json())
      .then((d) => {
        setTheme({ ...DEFAULT_THEME, ...d.theme });
        setLoading(false);
      });
  }, []);

  function applyPreview(t: Partial<ThemeConfig>) {
    const merged = { ...theme, ...t };
    const css = themeToCSS(merged);
    let style = document.getElementById("theme-preview-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "theme-preview-style";
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  function handleChange(key: keyof ThemeConfig, value: string) {
    const updated = { ...theme, [key]: value };
    setTheme(updated);
    applyPreview(updated);
    setSaved(false);
  }

  function applyPreset(partial: Partial<ThemeConfig>) {
    const merged = { ...theme, ...partial };
    setTheme(merged);
    applyPreview(merged);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/settings/appearance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      // Apply permanently
      const style = document.getElementById("theme-preview-style");
      if (style) style.remove();
      const permStyle = document.getElementById("theme-style") || (() => {
        const s = document.createElement("style");
        s.id = "theme-style";
        document.head.appendChild(s);
        return s;
      })();
      permStyle.textContent = themeToCSS(theme);
    }
  }

  function resetToDefault() {
    setTheme(DEFAULT_THEME);
    applyPreview(DEFAULT_THEME);
    setSaved(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-4 rounded-full animate-spin" style={{ borderColor: "var(--primary)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Aparência</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Personalize as cores do sistema. As alterações são aplicadas instantaneamente.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={resetToDefault}
            className="text-sm px-4 py-2 rounded-lg border transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            Restaurar padrão
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-4 py-2 rounded-lg text-white font-medium transition-colors disabled:opacity-60 flex items-center gap-2"
            style={{ backgroundColor: saved ? "var(--success)" : "var(--primary)" }}
          >
            {saved ? (
              <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Salvo!</>
            ) : saving ? "Salvando..." : "Salvar Tema"}
          </button>
        </div>
      </div>

      {/* Presets */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Temas prontos</h3>
        <div className="flex flex-wrap gap-2">
          {PRESET_THEMES.map((preset) => (
            <button
              key={preset.name}
              onClick={() => applyPreset(preset.theme)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all hover:shadow-sm"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}
            >
              <span
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: preset.theme.primary || DEFAULT_THEME.primary }}
              />
              <span style={{ color: "var(--text-primary)" }}>{preset.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Preview mini */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Prévia</h3>
        <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          <div className="flex h-32">
            {/* Sidebar preview */}
            <div className="w-28 flex flex-col p-2 gap-1" style={{ backgroundColor: "var(--sidebar-bg)" }}>
              <div className="flex items-center gap-1.5 px-2 py-1 mb-1">
                <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: "var(--primary)" }} />
                <span className="text-white text-xs font-bold">MoviChat</span>
              </div>
              {["Dashboard", "Pipeline", "Contatos"].map((item, i) => (
                <div
                  key={item}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
                  style={
                    i === 0
                      ? { backgroundColor: "var(--primary)", color: "#fff" }
                      : { color: "var(--sidebar-text)" }
                  }
                >
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: i === 0 ? "#fff" : "var(--sidebar-text)", opacity: 0.6 }} />
                  {item}
                </div>
              ))}
            </div>

            {/* Content preview */}
            <div className="flex-1 p-3" style={{ backgroundColor: "var(--page-bg)" }}>
              <div className="flex gap-2 mb-2">
                {["Contatos", "Mensagens", "Pipeline"].map((t) => (
                  <div key={t} className="flex-1 rounded-lg p-2" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
                    <div className="w-8 h-2 rounded mb-1" style={{ backgroundColor: "var(--primary-light)" }} />
                    <div className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>--</div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  className="text-xs px-3 py-1 rounded-lg text-white font-medium"
                  style={{ backgroundColor: "var(--primary)" }}
                >
                  Botão
                </button>
                <span
                  className="text-xs px-2 py-1 rounded-full font-medium"
                  style={{ backgroundColor: "var(--primary-light)", color: "var(--primary-light-text)" }}
                >
                  Badge
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Color groups */}
      {THEME_GROUPS.map((group) => (
        <div key={group.label}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>{group.label}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.keys.map((key) => (
              <ColorRow
                key={key}
                label={THEME_LABELS[key]}
                value={theme[key]}
                onChange={(v) => handleChange(key, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)" }}
    >
      <div className="relative flex-shrink-0">
        <div
          className="w-8 h-8 rounded-lg border-2 cursor-pointer shadow-sm"
          style={{ backgroundColor: value, borderColor: "var(--border)" }}
        />
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          title={label}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{label}</p>
        <input
          type="text"
          value={value}
          onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value); }}
          className="text-xs font-mono w-full mt-0.5 bg-transparent outline-none"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    </div>
  );
}
