/* ── Theme System — TigrãoImports Trade-In Calculator ── */

export interface TemaTradeIn {
  nome: string;
  descricao: string;
  preview: string;
  pageBg: string;
  text: string; textMuted: string; textDim: string;
  cardBg: string; cardBorder: string; inputBg: string;
  accent: string; accentHover: string; accentLight: string; accentText: string;
  btnBg: string; btnBorder: string; btnText: string; btnHover: string;
  success: string; successLight: string;
  error: string; errorLight: string;
  ctaBg: string; ctaHover: string; ctaText: string;
}

// Helper to generate dark theme
function darkTheme(name: string, desc: string, preview: string, accent: string, accentHover: string, opts?: Partial<TemaTradeIn>): TemaTradeIn {
  const pageBg = opts?.pageBg || "#0A0A0A";
  const cardBg = opts?.cardBg || "#141414";
  const cardBorder = opts?.cardBorder || "#2A2A2A";
  const text = opts?.text || "#F5F5F5";
  const textMuted = opts?.textMuted || "#888888";
  const success = opts?.success || "#2ECC71";
  const error = opts?.error || "#E74C3C";
  return {
    nome: name, descricao: desc, preview,
    pageBg, text, textMuted, textDim: opts?.textDim || "#555555",
    cardBg, cardBorder, inputBg: pageBg,
    accent, accentHover, accentLight: opts?.accentLight || `${accent}18`, accentText: opts?.accentText || accent,
    btnBg: cardBg, btnBorder: cardBorder, btnText: text, btnHover: opts?.btnHover || "#1A1A1A",
    success, successLight: opts?.successLight || `${success}1A`,
    error, errorLight: opts?.errorLight || `${error}1A`,
    ctaBg: opts?.ctaBg || success, ctaHover: opts?.ctaHover || "#27AE60", ctaText: opts?.ctaText || "#FFFFFF",
  };
}

// Helper to generate light theme
function lightTheme(name: string, desc: string, preview: string, accent: string, accentHover: string, opts?: Partial<TemaTradeIn>): TemaTradeIn {
  const pageBg = opts?.pageBg || "#FFFFFF";
  const cardBg = opts?.cardBg || "#F5F5F7";
  const cardBorder = opts?.cardBorder || "#E5E5EA";
  const text = opts?.text || "#1D1D1F";
  const textMuted = opts?.textMuted || "#86868B";
  const success = opts?.success || "#34C759";
  const error = opts?.error || "#FF3B30";
  return {
    nome: name, descricao: desc, preview,
    pageBg, text, textMuted, textDim: opts?.textDim || "#AEAEB2",
    cardBg, cardBorder, inputBg: pageBg,
    accent, accentHover, accentLight: opts?.accentLight || `${accent}12`, accentText: opts?.accentText || accent,
    btnBg: cardBg, btnBorder: cardBorder, btnText: text, btnHover: opts?.btnHover || "#E8E8ED",
    success, successLight: opts?.successLight || `${success}14`,
    error, errorLight: opts?.errorLight || `${error}14`,
    ctaBg: opts?.ctaBg || success, ctaHover: opts?.ctaHover || "#2DB84D", ctaText: opts?.ctaText || "#FFFFFF",
  };
}

export const TEMAS_TRADEIN: Record<string, TemaTradeIn> = {
  // ── Originais ──
  tigrao: darkTheme("Tigrão Dark", "Laranja tigre com fundo escuro — padrao", "🐯", "#E8740E", "#F5A623", {
    accentLight: "#1E1208", accentText: "#E8740E",
  }),
  clean: lightTheme("Clean Branco", "Fundo branco com detalhes pretos — minimalista", "⚪", "#1D1D1F", "#3A3A3C", {
    ctaBg: "#1D1D1F", ctaHover: "#3A3A3C",
  }),
  // Tema "tigrao-light": versao DIA da marca TigraoImports — fundo branco com
  // accent laranja (#E8740E) e CTA verde. Adicionado Abr/2026 como default
  // diurno pra alinhar identidade visual (antes usava "clean" que tinha accent
  // PRETO, escondendo a cor da marca durante o dia inteiro).
  "tigrao-light": lightTheme("Tigrão Light", "Fundo branco com laranja tigre — identidade da marca de dia", "🐯", "#E8740E", "#F5A623", {
    accentLight: "#FFF5EC", accentText: "#C45A00",
    ctaBg: "#22C55E", ctaHover: "#16A34A",
  }),
  apple: lightTheme("Apple Blue", "Azul Apple — estilo loja oficial", "🍎", "#0071E3", "#0077ED", {
    accentLight: "#EDF4FF",
  }),
  neon: darkTheme("Neon Tech", "Verde neon futurista — visual gamer", "💚", "#00FF88", "#00CC6A", {
    pageBg: "#0D0D0D", cardBg: "#1A1A1A", cardBorder: "#2D2D2D",
    text: "#E0E0E0", textMuted: "#777777", textDim: "#444444",
    accentLight: "#0D2618", btnHover: "#222222",
    success: "#00FF88", ctaBg: "#00FF88", ctaHover: "#00CC6A", ctaText: "#0D0D0D",
  }),
  luxury: darkTheme("Luxury Gold", "Dourado com preto — premium exclusivo", "✨", "#C9A84C", "#D4B65E", {
    pageBg: "#0C0C0C", cardBg: "#161616", cardBorder: "#2A2418",
    text: "#F0E6D3", textMuted: "#8B7D6B", textDim: "#5A5040",
    accentLight: "#1A1608", btnHover: "#1E1E1A",
    success: "#C9A84C", ctaBg: "#C9A84C", ctaHover: "#D4B65E", ctaText: "#0C0C0C",
  }),
  ocean: darkTheme("Ocean Blue", "Azul oceano em fundo escuro — confiavel", "🌊", "#3B82F6", "#2563EB", {
    pageBg: "#0A1628", cardBg: "#0F1E35", cardBorder: "#1E3350",
    text: "#E8EDF5", textMuted: "#7B8FA8", textDim: "#4A5D73",
    accentLight: "#0F1E35", accentText: "#60A5FA", btnHover: "#142844",
    success: "#34D399", ctaBg: "#3B82F6", ctaHover: "#2563EB",
  }),

  // ── Tendências 2026 ──
  capri: lightTheme("Capri Blue", "Azul Capri vibrante — tendência global 2026", "💎", "#0066CC", "#0055AA", {
    pageBg: "#FFFFFF", cardBg: "#F0F6FF", cardBorder: "#C8D9ED",
    text: "#0F1B2D", textMuted: "#5A6E85",
    accentLight: "#E5F0FF",
    ctaBg: "#0066CC", ctaHover: "#0055AA",
  }),
  cocoa: lightTheme("Cocoa Premium", "Marrom cacau sofisticado — tendência 2026", "🍫", "#6B3A2A", "#7D4635", {
    pageBg: "#FAF7F4", cardBg: "#F0EBE5", cardBorder: "#E0D5CA",
    text: "#2C1810", textMuted: "#7A6B5D", textDim: "#A09080",
    accentLight: "#F5EDE8",
    ctaBg: "#6B3A2A", ctaHover: "#7D4635",
  }),
  forest: lightTheme("Forest Green", "Verde floresta — design biofílico natural", "🌿", "#2D6A2D", "#3A7D3A", {
    pageBg: "#F5F8F5", cardBg: "#EBF1EB", cardBorder: "#C8DAC8",
    text: "#1A2E1A", textMuted: "#5C755C",
    accentLight: "#E5F0E5",
    ctaBg: "#2D6A2D", ctaHover: "#3A7D3A",
  }),
  rosegold: darkTheme("Rose Gold", "Rosa dourado — elegância feminina premium", "🌸", "#D4937A", "#E0A58E", {
    pageBg: "#0E0A0C", cardBg: "#1A1416", cardBorder: "#2E2428",
    text: "#F5E8ED", textMuted: "#9E8892", textDim: "#6E5A62",
    accentLight: "#1E1215", btnHover: "#221A1E",
    success: "#D4937A", ctaBg: "#D4937A", ctaHover: "#E0A58E", ctaText: "#0E0A0C",
  }),
  midnight: darkTheme("Midnight Navy", "Azul marinho noturno — sofisticado e sério", "🌙", "#4A90D9", "#5DA0E9", {
    pageBg: "#0B1120", cardBg: "#121B2E", cardBorder: "#1E2D48",
    text: "#E4E9F2", textMuted: "#7B8BA5", textDim: "#4A5A70",
    accentLight: "#14203A", btnHover: "#182640",
    ctaBg: "#4A90D9", ctaHover: "#5DA0E9",
  }),
  sunset: lightTheme("Sunset Warm", "Tons quentes de pôr do sol — acolhedor", "🌅", "#E85D3A", "#D44E2D", {
    pageBg: "#FFFBF7", cardBg: "#FFF3E8", cardBorder: "#F0D4C4",
    text: "#2D1B0E", textMuted: "#8B7060",
    accentLight: "#FFF0EB",
    ctaBg: "#E85D3A", ctaHover: "#D44E2D",
  }),
  arctic: lightTheme("Arctic Ice", "Branco gelo com azul claro — clean e fresco", "🧊", "#3AAFE8", "#2A9ED6", {
    pageBg: "#F5F9FC", cardBg: "#EAF2F8", cardBorder: "#D0E4F2",
    text: "#1C2938", textMuted: "#6B8299",
    accentLight: "#E8F5FC",
    ctaBg: "#3AAFE8", ctaHover: "#2A9ED6",
  }),
  carbon: darkTheme("Carbon Sport", "Cinza carbono esportivo — masculino e forte", "🏎️", "#E63946", "#FF4D5A", {
    pageBg: "#111111", cardBg: "#1A1A1A", cardBorder: "#2E2E2E",
    text: "#EAEAEA", textMuted: "#808080", textDim: "#505050",
    accentLight: "#1E0C0E", btnHover: "#222222",
    ctaBg: "#E63946", ctaHover: "#FF4D5A",
  }),
  emerald: darkTheme("Emerald Luxe", "Verde esmeralda com dourado — joalheria premium", "💎", "#50C878", "#63D68A", {
    pageBg: "#060D08", cardBg: "#0D1A10", cardBorder: "#1A3020",
    text: "#E8F0EA", textMuted: "#7A9B80", textDim: "#4A6B50",
    accentLight: "#0D2015", btnHover: "#122218",
    success: "#50C878", ctaBg: "#50C878", ctaHover: "#63D68A", ctaText: "#060D08",
  }),
  cherry: lightTheme("Cherry Red", "Vermelho cereja intenso — ousado e marcante", "🍒", "#C41E3A", "#A8192F", {
    pageBg: "#FFFAF9", cardBg: "#FFF0ED", cardBorder: "#F0C4BD",
    text: "#2D0F0A", textMuted: "#8B5A50",
    accentLight: "#FFE8E5",
    ctaBg: "#C41E3A", ctaHover: "#A8192F",
  }),
  lavender: lightTheme("Lavender Soft", "Lavanda suave — calmo e moderno", "💜", "#7C5CFC", "#6A48E8", {
    pageBg: "#FAF8FF", cardBg: "#F0ECFF", cardBorder: "#D8D0F0",
    text: "#1E1533", textMuted: "#7B6E99",
    accentLight: "#EDE8FF",
    ctaBg: "#7C5CFC", ctaHover: "#6A48E8",
  }),
  amazon: lightTheme("Marketplace", "Inspirado nos grandes marketplaces — direto e funcional", "📦", "#FF9900", "#E88B00", {
    pageBg: "#FFFFFF", cardBg: "#F3F3F3", cardBorder: "#D5D9D9",
    text: "#0F1111", textMuted: "#565959",
    accentLight: "#FFF5E0",
    ctaBg: "#FFD814", ctaHover: "#F7CA00", ctaText: "#0F1111",
  }),
};

export type TemaTradeInKey = keyof typeof TEMAS_TRADEIN;

export const TEMA_TRADEIN_KEYS: TemaTradeInKey[] = [
  "tigrao", "clean", "apple", "ocean", "luxury", "neon",
  "capri", "cocoa", "forest", "rosegold", "midnight", "sunset",
  "arctic", "carbon", "emerald", "cherry", "lavender", "amazon",
];

export function getTemaTI(key: string | null | undefined): TemaTradeIn {
  if (key && key in TEMAS_TRADEIN) return TEMAS_TRADEIN[key as TemaTradeInKey];
  return TEMAS_TRADEIN.tigrao;
}

/** CSS custom properties for trade-in theme */
export function temaTICSSVars(t: TemaTradeIn): Record<string, string> {
  return {
    "--ti-page-bg": t.pageBg, "--ti-text": t.text, "--ti-muted": t.textMuted, "--ti-dim": t.textDim,
    "--ti-card-bg": t.cardBg, "--ti-card-border": t.cardBorder, "--ti-input-bg": t.inputBg,
    "--ti-accent": t.accent, "--ti-accent-hover": t.accentHover, "--ti-accent-light": t.accentLight, "--ti-accent-text": t.accentText,
    "--ti-btn-bg": t.btnBg, "--ti-btn-border": t.btnBorder, "--ti-btn-text": t.btnText, "--ti-btn-hover": t.btnHover,
    "--ti-success": t.success, "--ti-success-light": t.successLight,
    "--ti-error": t.error, "--ti-error-light": t.errorLight,
    "--ti-cta-bg": t.ctaBg, "--ti-cta-hover": t.ctaHover, "--ti-cta-text": t.ctaText,
  };
}
