import { COR_PT_TO_EN } from "./produto-specs";

// Tradução simplificada: cores em inglês do catálogo → PT base.
// Várias variantes em inglês colapsam pra mesma cor genérica em PT.
export const COR_EN_TO_PT_SIMPLES: Record<string, string> = {
  "Black": "Preto",
  "Black Titanium": "Titânio Preto",
  "Blue": "Azul",
  "Blue Titanium": "Titânio Azul",
  "Cloud White": "Branco",
  "Deep Purple": "Roxo",
  "Desert Titanium": "Titânio Deserto",
  "Gold": "Dourado",
  "Graphite": "Cinza",
  "Green": "Verde",
  "Indigo": "Azul",
  "Jet Black": "Preto",
  "Lavender": "Lavanda",
  "Midnight": "Preto",
  "Natural": "Natural",
  "Natural Titanium": "Titânio Natural",
  "Orange": "Laranja",
  "Pink": "Rosa",
  "Purple": "Roxo",
  "Red": "Vermelho",
  "Rose Gold": "Dourado",
  "Silver": "Prata",
  "Slate": "Cinza",
  "Space Black": "Preto",
  "Space Gray": "Cinza",
  "Starlight": "Estelar",
  "White": "Branco",
  "White Titanium": "Titânio Branco",
  "Yellow": "Amarelo",
};

export function corParaPT(corEN: string | null | undefined): string {
  if (!corEN) return "—";
  const trimmed = corEN.trim();
  if (!trimmed || trimmed === "—") return "—";
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
