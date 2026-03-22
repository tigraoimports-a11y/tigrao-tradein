/* ── Theme System — TigrãoImports Trade-In Calculator ── */

export interface TemaTradeIn {
  nome: string;
  descricao: string;
  preview: string;
  // Page
  pageBg: string;
  // Text
  text: string;
  textMuted: string;
  textDim: string;
  // Cards & inputs
  cardBg: string;
  cardBorder: string;
  inputBg: string;
  // Accent (primary action)
  accent: string;
  accentHover: string;
  accentLight: string; // selected bg
  accentText: string;  // text when selected
  // Buttons unselected
  btnBg: string;
  btnBorder: string;
  btnText: string;
  btnHover: string;
  // Success / Error
  success: string;
  successLight: string;
  error: string;
  errorLight: string;
  // CTA
  ctaBg: string;
  ctaHover: string;
  ctaText: string;
}

export const TEMAS_TRADEIN: Record<string, TemaTradeIn> = {
  tigrao: {
    nome: "Tigrão Dark",
    descricao: "Laranja tigre com fundo escuro — padrao",
    preview: "🐯",
    pageBg: "#0A0A0A",
    text: "#F5F5F5",
    textMuted: "#888888",
    textDim: "#555555",
    cardBg: "#141414",
    cardBorder: "#2A2A2A",
    inputBg: "#0A0A0A",
    accent: "#E8740E",
    accentHover: "#F5A623",
    accentLight: "#1E1208",
    accentText: "#E8740E",
    btnBg: "#141414",
    btnBorder: "#2A2A2A",
    btnText: "#F5F5F5",
    btnHover: "#1A1A1A",
    success: "#2ECC71",
    successLight: "rgba(46,204,113,0.12)",
    error: "#E74C3C",
    errorLight: "rgba(231,76,60,0.12)",
    ctaBg: "#2ECC71",
    ctaHover: "#27AE60",
    ctaText: "#FFFFFF",
  },
  clean: {
    nome: "Clean Branco",
    descricao: "Fundo branco com detalhes pretos — minimalista",
    preview: "⚪",
    pageBg: "#FFFFFF",
    text: "#1D1D1F",
    textMuted: "#86868B",
    textDim: "#AEAEB2",
    cardBg: "#F5F5F7",
    cardBorder: "#E5E5EA",
    inputBg: "#FFFFFF",
    accent: "#1D1D1F",
    accentHover: "#3A3A3C",
    accentLight: "#F5F5F7",
    accentText: "#1D1D1F",
    btnBg: "#F5F5F7",
    btnBorder: "#E5E5EA",
    btnText: "#1D1D1F",
    btnHover: "#E8E8ED",
    success: "#34C759",
    successLight: "rgba(52,199,89,0.08)",
    error: "#FF3B30",
    errorLight: "rgba(255,59,48,0.08)",
    ctaBg: "#1D1D1F",
    ctaHover: "#3A3A3C",
    ctaText: "#FFFFFF",
  },
  apple: {
    nome: "Apple Blue",
    descricao: "Azul Apple — estilo loja oficial",
    preview: "🍎",
    pageBg: "#FFFFFF",
    text: "#1D1D1F",
    textMuted: "#86868B",
    textDim: "#AEAEB2",
    cardBg: "#F5F5F7",
    cardBorder: "#D2D2D7",
    inputBg: "#FFFFFF",
    accent: "#0071E3",
    accentHover: "#0077ED",
    accentLight: "#EDF4FF",
    accentText: "#0071E3",
    btnBg: "#F5F5F7",
    btnBorder: "#D2D2D7",
    btnText: "#1D1D1F",
    btnHover: "#E8E8ED",
    success: "#34C759",
    successLight: "rgba(52,199,89,0.08)",
    error: "#FF3B30",
    errorLight: "rgba(255,59,48,0.08)",
    ctaBg: "#34C759",
    ctaHover: "#2DB84D",
    ctaText: "#FFFFFF",
  },
  neon: {
    nome: "Neon Tech",
    descricao: "Verde neon futurista — visual gamer",
    preview: "💚",
    pageBg: "#0D0D0D",
    text: "#E0E0E0",
    textMuted: "#777777",
    textDim: "#444444",
    cardBg: "#1A1A1A",
    cardBorder: "#2D2D2D",
    inputBg: "#0D0D0D",
    accent: "#00FF88",
    accentHover: "#00CC6A",
    accentLight: "#0D2618",
    accentText: "#00FF88",
    btnBg: "#1A1A1A",
    btnBorder: "#2D2D2D",
    btnText: "#E0E0E0",
    btnHover: "#222222",
    success: "#00FF88",
    successLight: "rgba(0,255,136,0.1)",
    error: "#FF4444",
    errorLight: "rgba(255,68,68,0.1)",
    ctaBg: "#00FF88",
    ctaHover: "#00CC6A",
    ctaText: "#0D0D0D",
  },
  luxury: {
    nome: "Luxury Gold",
    descricao: "Dourado com preto — premium exclusivo",
    preview: "✨",
    pageBg: "#0C0C0C",
    text: "#F0E6D3",
    textMuted: "#8B7D6B",
    textDim: "#5A5040",
    cardBg: "#161616",
    cardBorder: "#2A2418",
    inputBg: "#0C0C0C",
    accent: "#C9A84C",
    accentHover: "#D4B65E",
    accentLight: "#1A1608",
    accentText: "#C9A84C",
    btnBg: "#161616",
    btnBorder: "#2A2418",
    btnText: "#F0E6D3",
    btnHover: "#1E1E1A",
    success: "#C9A84C",
    successLight: "rgba(201,168,76,0.1)",
    error: "#E74C3C",
    errorLight: "rgba(231,76,60,0.1)",
    ctaBg: "#C9A84C",
    ctaHover: "#D4B65E",
    ctaText: "#0C0C0C",
  },
  ocean: {
    nome: "Ocean Blue",
    descricao: "Azul oceano em fundo escuro — confiavel",
    preview: "🌊",
    pageBg: "#0A1628",
    text: "#E8EDF5",
    textMuted: "#7B8FA8",
    textDim: "#4A5D73",
    cardBg: "#0F1E35",
    cardBorder: "#1E3350",
    inputBg: "#0A1628",
    accent: "#3B82F6",
    accentHover: "#2563EB",
    accentLight: "#0F1E35",
    accentText: "#60A5FA",
    btnBg: "#0F1E35",
    btnBorder: "#1E3350",
    btnText: "#E8EDF5",
    btnHover: "#142844",
    success: "#34D399",
    successLight: "rgba(52,211,153,0.1)",
    error: "#F87171",
    errorLight: "rgba(248,113,113,0.1)",
    ctaBg: "#3B82F6",
    ctaHover: "#2563EB",
    ctaText: "#FFFFFF",
  },
};

export type TemaTradeInKey = keyof typeof TEMAS_TRADEIN;

export const TEMA_TRADEIN_KEYS: TemaTradeInKey[] = ["tigrao", "clean", "apple", "neon", "luxury", "ocean"];

export function getTemaTI(key: string | null | undefined): TemaTradeIn {
  if (key && key in TEMAS_TRADEIN) return TEMAS_TRADEIN[key as TemaTradeInKey];
  return TEMAS_TRADEIN.tigrao;
}

/** CSS custom properties for trade-in theme */
export function temaTICSSVars(t: TemaTradeIn): Record<string, string> {
  return {
    "--ti-page-bg": t.pageBg,
    "--ti-text": t.text,
    "--ti-muted": t.textMuted,
    "--ti-dim": t.textDim,
    "--ti-card-bg": t.cardBg,
    "--ti-card-border": t.cardBorder,
    "--ti-input-bg": t.inputBg,
    "--ti-accent": t.accent,
    "--ti-accent-hover": t.accentHover,
    "--ti-accent-light": t.accentLight,
    "--ti-accent-text": t.accentText,
    "--ti-btn-bg": t.btnBg,
    "--ti-btn-border": t.btnBorder,
    "--ti-btn-text": t.btnText,
    "--ti-btn-hover": t.btnHover,
    "--ti-success": t.success,
    "--ti-success-light": t.successLight,
    "--ti-error": t.error,
    "--ti-error-light": t.errorLight,
    "--ti-cta-bg": t.ctaBg,
    "--ti-cta-hover": t.ctaHover,
    "--ti-cta-text": t.ctaText,
  };
}
