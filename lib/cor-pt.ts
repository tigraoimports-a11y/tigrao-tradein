import { COR_PT_TO_EN } from "./produto-specs";

// Tradução simplificada: cores em inglês do catálogo → PT base.
// Várias variantes em inglês colapsam pra mesma cor genérica em PT.
export const COR_EN_TO_PT_SIMPLES: Record<string, string> = {
  // Pretos
  "Black": "Preto",
  "Jet Black": "Preto",
  "Midnight": "Preto",
  "Space Black": "Preto",
  // Brancos
  "White": "Branco",
  "Cloud White": "Branco",
  // Azuis (todos colapsam)
  "Blue": "Azul",
  "Sky Blue": "Azul",
  "Mist Blue": "Azul",
  "Sierra Blue": "Azul",
  "Pacific Blue": "Azul",
  "Deep Blue": "Azul",
  "Indigo": "Azul",
  "Ultramarine": "Azul",
  // Verdes
  "Green": "Verde",
  "Alpine Green": "Verde",
  "Midnight Green": "Verde",
  "Sage": "Verde",
  "Teal": "Verde",
  // Cinzas / Prata
  "Silver": "Prata",
  "Graphite": "Cinza",
  "Slate": "Cinza",
  "Space Gray": "Cinza",
  // Dourados
  "Gold": "Dourado",
  "Light Gold": "Dourado",
  "Rose Gold": "Dourado",
  // Roxos
  "Purple": "Roxo",
  "Deep Purple": "Roxo",
  "Lavender": "Roxo",
  // Rosas
  "Pink": "Rosa",
  "Blush": "Rosa",
  // Laranjas
  "Orange": "Laranja",
  "Cosmic Orange": "Laranja",
  // Amarelos
  "Yellow": "Amarelo",
  "Citrus": "Amarelo",
  // Vermelhos
  "Red": "Vermelho",
  "(PRODUCT)RED": "Vermelho",
  // Estelar
  "Starlight": "Estelar",
  // Titânios
  "Black Titanium": "Titânio Preto",
  "Blue Titanium": "Titânio Azul",
  "Desert Titanium": "Titânio Deserto",
  "Natural Titanium": "Titânio Natural",
  "White Titanium": "Titânio Branco",
  "Natural": "Titânio Natural",
};

const CUSTOM_KEY = "custom_cor_pt_v1";
function getCustomOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(CUSTOM_KEY) || "{}"); } catch { return {}; }
}
export function setCorPTOverride(enCanonico: string, pt: string) {
  if (typeof window === "undefined") return;
  const map = getCustomOverrides();
  if (pt && pt.trim()) map[enCanonico.toLowerCase()] = pt.trim();
  else delete map[enCanonico.toLowerCase()];
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(map));
  try { window.dispatchEvent(new Event("cor-pt-updated")); } catch {}
}

export function corParaPT(corEN: string | null | undefined): string {
  if (!corEN) return "—";
  const trimmed = corEN.trim();
  if (!trimmed || trimmed === "—") return "—";
  // Override customizado (localStorage)
  const overrides = getCustomOverrides();
  const ovr = overrides[trimmed.toLowerCase()];
  if (ovr) return ovr;
  // Tenta match exato (case-insensitive) EN → PT simples
  for (const [en, pt] of Object.entries(COR_EN_TO_PT_SIMPLES)) {
    if (en.toLowerCase() === trimmed.toLowerCase()) return pt;
  }
  // Pode ter sido cadastrado já em PT (ex: "AZUL CÉU", "MEIA-NOITE").
  // Converte PT → EN e tenta de novo.
  const enFromPT = COR_PT_TO_EN[trimmed.toUpperCase()];
  if (enFromPT) {
    for (const [en, pt] of Object.entries(COR_EN_TO_PT_SIMPLES)) {
      if (en.toLowerCase() === enFromPT.toLowerCase()) return pt;
    }
  }
  // Fallback: retorna o original
  return trimmed;
}

/** Substitui qualquer cor em inglês conhecida dentro de um texto pela versão PT simplificada. */
export function normalizarCoresNoTexto(texto: string): string {
  if (!texto) return texto;
  let out = texto;
  // Ordena por tamanho desc para evitar match parcial (ex: "Rose Gold" antes de "Gold")
  const entries = Object.entries(COR_EN_TO_PT_SIMPLES).sort((a, b) => b[0].length - a[0].length);
  for (const [en, pt] of entries) {
    const re = new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, pt);
  }
  return out;
}

/** Retorna a cor em inglês canônico (ex: "Sky Blue", "Teal", "Lavender"). */
export function corParaEN(cor: string | null | undefined): string | null {
  if (!cor) return null;
  const trimmed = cor.trim();
  if (!trimmed || trimmed === "—") return null;
  // Já em EN canônico?
  for (const en of Object.keys(COR_EN_TO_PT_SIMPLES)) {
    if (en.toLowerCase() === trimmed.toLowerCase()) return en;
  }
  // PT → EN canônico
  const en = COR_PT_TO_EN[trimmed.toUpperCase()];
  if (en) {
    for (const k of Object.keys(COR_EN_TO_PT_SIMPLES)) {
      if (k.toLowerCase() === en.toLowerCase()) return k;
    }
    return en;
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}
