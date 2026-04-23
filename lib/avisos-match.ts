// lib/avisos-match.ts
// Liga avisos_clientes (texto livre digitado pelo cliente, ex: "iPhone 17 Pro
// Max 512GB Preto") com estoque real disponivel.
//
// Estrategia: tenta detectar a categoria do desejado pela palavra-chave (iphone,
// ipad, macbook, etc), normaliza com getModeloBase em ambos os lados e compara
// chave canonica (modelo + storage). Cor nao exclui match — se o modelo+storage
// bate, mostra todas as cores disponiveis pro vendedor escolher.
//
// Fallback: se nao reconhecer categoria, usa matching por tokens (todas as
// palavras do desejado devem estar no estoque + nao pode ter modificadores
// extras tipo "max", "plus", "ultra" no estoque que nao estejam no desejado).

import { getModeloBase } from "./produto-display";

export interface EstoqueLinha {
  id: string;
  produto: string;
  cor: string | null;
  qnt: number | null;
  status: string | null;
  observacao?: string | null;
  categoria?: string | null;
}

function normalize(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Modificadores que diferenciam produtos similares — se aparece num lado mas
// nao no outro, sao produtos diferentes (Pro != Pro Max, Air != Pro, etc).
const MODIFICADORES = ["max", "plus", "air", "mini", "ultra", "pro", "se", "neo"];

function detectarCategoria(desejado: string): string | null {
  const t = normalize(desejado);
  if (/\bmac\s*mini\b/.test(t)) return "MAC_MINI";
  if (/\bmacbook\b/.test(t)) return "MACBOOK";
  if (/\biphone\b/.test(t)) return "IPHONES";
  if (/\bipad\b/.test(t)) return "IPADS";
  if (/\bwatch\b/.test(t)) return "APPLE_WATCH";
  if (/\bairpods?\b/.test(t)) return "AIRPODS";
  return null;
}

// Verifica se os modificadores do estoque sao um subset dos modificadores
// do desejado. Ex: desejado "iPhone 17 Pro" + estoque "iPhone 17 Pro Max" →
// estoque tem "max" extra → NAO match.
function modificadoresCompativeis(desejado: string, candidato: string): boolean {
  const dTok = new Set(normalize(desejado).split(/\s+/));
  const cTok = new Set(normalize(candidato).split(/\s+/));
  for (const m of MODIFICADORES) {
    if (cTok.has(m) && !dTok.has(m)) return false;
    if (dTok.has(m) && !cTok.has(m)) return false;
  }
  return true;
}

/**
 * Retorna as linhas de estoque que satisfazem o aviso:
 * - status = "EM ESTOQUE" e qnt > 0
 * - modelo+storage canonico bate (via getModeloBase) OU tokens batem com
 *   modificadores compativeis
 */
export function findEstoqueMatch(
  produtoDesejado: string,
  estoque: EstoqueLinha[],
): EstoqueLinha[] {
  if (!produtoDesejado || !produtoDesejado.trim()) return [];
  const desejadoNorm = normalize(produtoDesejado);
  const desejadoTokens = desejadoNorm.split(/\s+/).filter(t => t.length >= 2);
  if (desejadoTokens.length === 0) return [];

  const cat = detectarCategoria(produtoDesejado);
  // Se temos categoria, derivamos chave canonica do desejado
  const desejadoBase = cat ? normalize(getModeloBase(produtoDesejado, cat)) : null;

  return estoque.filter(row => {
    const qnt = Number(row.qnt || 0);
    if (qnt <= 0) return false;
    if ((row.status || "").toUpperCase() !== "EM ESTOQUE") return false;

    // Se temos categoria detectada e a do estoque bate, usa chave canonica
    if (desejadoBase && cat && (row.categoria || "").toUpperCase() === cat) {
      const candidatoBase = normalize(getModeloBase(row.produto || "", row.categoria || cat, row.observacao));
      if (candidatoBase === desejadoBase) return true;
      // Mesmo na mesma categoria, se base nao bate, nao e match
      return false;
    }

    // Fallback: matching por tokens com checagem de modificadores
    const candidato = normalize(`${row.produto} ${row.cor || ""}`);
    const todosTokensPresentes = desejadoTokens.every(t => candidato.includes(t));
    if (!todosTokensPresentes) return false;
    return modificadoresCompativeis(produtoDesejado, `${row.produto} ${row.cor || ""}`);
  });
}

export interface AvisoComEstoque {
  matches: EstoqueLinha[];
  disponivel_qnt: number;
}

export function annotateAvisoComEstoque(
  produtoDesejado: string,
  estoque: EstoqueLinha[],
): AvisoComEstoque {
  const matches = findEstoqueMatch(produtoDesejado, estoque);
  return {
    matches,
    disponivel_qnt: matches.reduce((s, m) => s + Number(m.qnt || 0), 0),
  };
}
