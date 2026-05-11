export interface ThemeConfig {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryLightText: string;
  sidebarBg: string;
  sidebarText: string;
  sidebarBorder: string;
  pageBg: string;
  cardBg: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  danger: string;
  dangerLight: string;
  warning: string;
  warningLight: string;
  info: string;
  infoLight: string;
  success: string;
  successLight: string;
}

export const DEFAULT_THEME: ThemeConfig = {
  primary: "#16a34a",
  primaryHover: "#15803d",
  primaryLight: "#dcfce7",
  primaryLightText: "#15803d",
  sidebarBg: "#111827",
  sidebarText: "#9ca3af",
  sidebarBorder: "#1f2937",
  pageBg: "#f9fafb",
  cardBg: "#ffffff",
  border: "#e5e7eb",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  textMuted: "#9ca3af",
  danger: "#ef4444",
  dangerLight: "#fee2e2",
  warning: "#f59e0b",
  warningLight: "#fef3c7",
  info: "#3b82f6",
  infoLight: "#dbeafe",
  success: "#22c55e",
  successLight: "#dcfce7",
};

export const THEME_LABELS: Record<keyof ThemeConfig, string> = {
  primary: "Cor principal (botões, ativo)",
  primaryHover: "Cor principal (hover)",
  primaryLight: "Cor principal clara (fundos)",
  primaryLightText: "Cor principal clara (texto)",
  sidebarBg: "Sidebar — fundo",
  sidebarText: "Sidebar — texto",
  sidebarBorder: "Sidebar — borda",
  pageBg: "Fundo das páginas",
  cardBg: "Fundo dos cards",
  border: "Bordas",
  textPrimary: "Texto principal",
  textSecondary: "Texto secundário",
  textMuted: "Texto suave",
  danger: "Perigo (erros)",
  dangerLight: "Perigo claro (fundo)",
  warning: "Aviso",
  warningLight: "Aviso claro (fundo)",
  info: "Informação",
  infoLight: "Informação claro (fundo)",
  success: "Sucesso",
  successLight: "Sucesso claro (fundo)",
};

export const THEME_GROUPS = [
  {
    label: "Cor Principal",
    keys: ["primary", "primaryHover", "primaryLight", "primaryLightText"] as (keyof ThemeConfig)[],
  },
  {
    label: "Sidebar",
    keys: ["sidebarBg", "sidebarText", "sidebarBorder"] as (keyof ThemeConfig)[],
  },
  {
    label: "Layout",
    keys: ["pageBg", "cardBg", "border"] as (keyof ThemeConfig)[],
  },
  {
    label: "Textos",
    keys: ["textPrimary", "textSecondary", "textMuted"] as (keyof ThemeConfig)[],
  },
  {
    label: "Status",
    keys: ["danger", "dangerLight", "warning", "warningLight", "info", "infoLight", "success", "successLight"] as (keyof ThemeConfig)[],
  },
];

export const PRESET_THEMES: { name: string; theme: Partial<ThemeConfig> }[] = [
  {
    name: "Verde (padrão)",
    theme: { primary: "#16a34a", primaryHover: "#15803d", primaryLight: "#dcfce7", primaryLightText: "#15803d", sidebarBg: "#111827" },
  },
  {
    name: "Azul",
    theme: { primary: "#2563eb", primaryHover: "#1d4ed8", primaryLight: "#dbeafe", primaryLightText: "#1d4ed8", sidebarBg: "#1e3a5f" },
  },
  {
    name: "Roxo",
    theme: { primary: "#7c3aed", primaryHover: "#6d28d9", primaryLight: "#ede9fe", primaryLightText: "#6d28d9", sidebarBg: "#1e1b4b" },
  },
  {
    name: "Laranja",
    theme: { primary: "#ea580c", primaryHover: "#c2410c", primaryLight: "#ffedd5", primaryLightText: "#c2410c", sidebarBg: "#1c1917" },
  },
  {
    name: "Escuro elegante",
    theme: { primary: "#10b981", primaryHover: "#059669", primaryLight: "#d1fae5", primaryLightText: "#059669", sidebarBg: "#0f172a", pageBg: "#f1f5f9" },
  },
];

export function themeToCSS(theme: Partial<ThemeConfig>): string {
  const merged = { ...DEFAULT_THEME, ...theme };
  return `:root {
  --primary: ${merged.primary};
  --primary-hover: ${merged.primaryHover};
  --primary-light: ${merged.primaryLight};
  --primary-light-text: ${merged.primaryLightText};
  --sidebar-bg: ${merged.sidebarBg};
  --sidebar-text: ${merged.sidebarText};
  --sidebar-border: ${merged.sidebarBorder};
  --page-bg: ${merged.pageBg};
  --card-bg: ${merged.cardBg};
  --border: ${merged.border};
  --text-primary: ${merged.textPrimary};
  --text-secondary: ${merged.textSecondary};
  --text-muted: ${merged.textMuted};
  --danger: ${merged.danger};
  --danger-light: ${merged.dangerLight};
  --warning: ${merged.warning};
  --warning-light: ${merged.warningLight};
  --info: ${merged.info};
  --info-light: ${merged.infoLight};
  --success: ${merged.success};
  --success-light: ${merged.successLight};
}`;
}
