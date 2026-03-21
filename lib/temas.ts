/* ── Theme System — TigrãoImports Mostruário ── */

export const TEMAS = {
  tigrao: {
    nome: "Tigrão Clássico",
    descricao: "Laranja vibrante — identidade TigrãoImports",
    preview: "🐯",
    bg: "#FFFFFF",
    bgSecondary: "#F5F5F7",
    text: "#1D1D1F",
    textMuted: "#86868B",
    accent: "#E8740E",
    accentHover: "#D06A0D",
    accentLight: "#FFF5EB",
    cardBg: "#FFFFFF",
    cardBorder: "#E8E8ED",
    heroBg: "#0A0A0A",
    heroText: "#FFFFFF",
    btnComprar: "#34C759",
    btnComprarHover: "#2DB84D",
    headerBg: "rgba(255,255,255,0.8)",
  },
  dark: {
    nome: "Dark Premium",
    descricao: "Preto elegante — visual Apple Store",
    preview: "🖤",
    bg: "#0A0A0A",
    bgSecondary: "#141414",
    text: "#F5F5F5",
    textMuted: "#888888",
    accent: "#E8740E",
    accentHover: "#F5A623",
    accentLight: "#1E1208",
    cardBg: "#141414",
    cardBorder: "#2A2A2A",
    heroBg: "#141414",
    heroText: "#F5F5F5",
    btnComprar: "#34C759",
    btnComprarHover: "#2DB84D",
    headerBg: "rgba(10,10,10,0.8)",
  },
  clean: {
    nome: "Clean Minimalista",
    descricao: "Branco puro — foco total nos produtos",
    preview: "⚪",
    bg: "#FFFFFF",
    bgSecondary: "#FAFAFA",
    text: "#111111",
    textMuted: "#999999",
    accent: "#111111",
    accentHover: "#333333",
    accentLight: "#F5F5F5",
    cardBg: "#FFFFFF",
    cardBorder: "#EEEEEE",
    heroBg: "#111111",
    heroText: "#FFFFFF",
    btnComprar: "#111111",
    btnComprarHover: "#333333",
    headerBg: "rgba(255,255,255,0.9)",
  },
  neon: {
    nome: "Neon Moderno",
    descricao: "Verde neon — visual tech futurista",
    preview: "💚",
    bg: "#0D0D0D",
    bgSecondary: "#1A1A1A",
    text: "#E0E0E0",
    textMuted: "#777777",
    accent: "#00FF88",
    accentHover: "#00CC6A",
    accentLight: "#0D2618",
    cardBg: "#1A1A1A",
    cardBorder: "#2D2D2D",
    heroBg: "#0D0D0D",
    heroText: "#FFFFFF",
    btnComprar: "#00FF88",
    btnComprarHover: "#00CC6A",
    headerBg: "rgba(13,13,13,0.9)",
  },
  luxury: {
    nome: "Luxury Gold",
    descricao: "Dourado com preto — premium exclusivo",
    preview: "✨",
    bg: "#0C0C0C",
    bgSecondary: "#161616",
    text: "#F0E6D3",
    textMuted: "#8B7D6B",
    accent: "#C9A84C",
    accentHover: "#D4B65E",
    accentLight: "#1A1608",
    cardBg: "#161616",
    cardBorder: "#2A2418",
    heroBg: "#0C0C0C",
    heroText: "#F0E6D3",
    btnComprar: "#C9A84C",
    btnComprarHover: "#D4B65E",
    headerBg: "rgba(12,12,12,0.9)",
  },
  ocean: {
    nome: "Ocean Blue",
    descricao: "Azul oceano — tranquilo e confiável",
    preview: "🌊",
    bg: "#F8FBFF",
    bgSecondary: "#EDF4FF",
    text: "#1A2744",
    textMuted: "#6B7D99",
    accent: "#0071E3",
    accentHover: "#0060C0",
    accentLight: "#E8F2FF",
    cardBg: "#FFFFFF",
    cardBorder: "#D4E3F5",
    heroBg: "#0A1628",
    heroText: "#FFFFFF",
    btnComprar: "#0071E3",
    btnComprarHover: "#0060C0",
    headerBg: "rgba(248,251,255,0.9)",
  },
} as const;

export type TemaKey = keyof typeof TEMAS;
export type Tema = (typeof TEMAS)[TemaKey];

export function getTema(key: string | null | undefined): Tema {
  if (key && key in TEMAS) return TEMAS[key as TemaKey];
  return TEMAS.tigrao;
}

export function getTemaKey(key: string | null | undefined): TemaKey {
  if (key && key in TEMAS) return key as TemaKey;
  return "tigrao";
}

/** All theme keys in display order */
export const TEMA_KEYS: TemaKey[] = ["tigrao", "dark", "clean", "neon", "luxury", "ocean"];

/** CSS custom properties object for a given theme — use as `style` on root div */
export function temaCSSVars(tema: Tema): Record<string, string> {
  return {
    "--t-bg": tema.bg,
    "--t-bg2": tema.bgSecondary,
    "--t-text": tema.text,
    "--t-muted": tema.textMuted,
    "--t-accent": tema.accent,
    "--t-accent-hover": tema.accentHover,
    "--t-accent-light": tema.accentLight,
    "--t-card-bg": tema.cardBg,
    "--t-card-border": tema.cardBorder,
    "--t-hero-bg": tema.heroBg,
    "--t-hero-text": tema.heroText,
    "--t-btn": tema.btnComprar,
    "--t-btn-hover": tema.btnComprarHover,
    "--t-header-bg": tema.headerBg,
  };
}
