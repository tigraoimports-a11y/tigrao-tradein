// lib/loja-estoque-match.ts
// Liga loja_variacoes (mostruário público) ao estoque real pra esconder esgotados.
//
// Matching é fuzzy mas determinístico:
//   chave = getModeloBase(produto, categoria) + "::" + corParaPT(cor) normalizada
//
// Permissivo: se não achar match nenhum pra uma variação, deixa ela visível
// (benefício da dúvida — não esconde quando a heurística falhou). Só esconde
// quando confirmou que existe o SKU no estoque mas está zerado/ESGOTADO.

import { getModeloBase } from "./produto-display";
import { corParaPT } from "./cor-pt";

export interface EstoqueRow {
  produto: string;
  categoria: string;
  qnt: number | null;
  status: string | null;
  cor: string | null;
  observacao?: string | null;
}

interface EstoqueAgg {
  totalEmEstoque: number;
}

// slug do loja_categorias → categoria do estoque
const CAT_MAP: Record<string, string> = {
  iphones: "IPHONES",
  macbooks: "MACBOOK",
  ipads: "IPADS",
  airpods: "AIRPODS",
  "apple-watch": "APPLE_WATCH",
  "mac-mini": "MAC_MINI",
  acessorios: "ACESSORIOS",
};

export function lojaCatToEstoqueCat(slug: string): string {
  return CAT_MAP[slug] || slug.toUpperCase();
}

function norm(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function keyModeloCor(modeloBase: string, cor: string | null | undefined): string {
  const corPT = cor ? corParaPT(cor) : "";
  return `${norm(modeloBase)}::${norm(corPT)}`;
}

/**
 * Monta índice do estoque agrupado por (modeloBase + cor normalizada).
 * Chave: "iphone 17 pro 256gb::titanio natural"
 * Valor: { totalEmEstoque }
 *
 * Só conta linhas com status "EM ESTOQUE" e qnt > 0.
 */
export function buildEstoqueIndex(rows: EstoqueRow[]): Map<string, EstoqueAgg> {
  const index = new Map<string, EstoqueAgg>();
  for (const row of rows) {
    const modeloBase = getModeloBase(row.produto || "", row.categoria || "", row.observacao);
    const key = keyModeloCor(modeloBase, row.cor);
    const existing = index.get(key) || { totalEmEstoque: 0 };

    const qnt = Number(row.qnt || 0);
    const isEmEstoque = (row.status || "").toUpperCase() === "EM ESTOQUE" && qnt > 0;
    if (isEmEstoque) existing.totalEmEstoque += qnt;

    index.set(key, existing);
  }
  return index;
}

/**
 * Também precisa de um índice "qualquer linha desse SKU existe?" — pra saber
 * se confirmou que o produto existe no estoque mas está zerado, versus se
 * simplesmente não temos esse SKU cadastrado (match falhou).
 */
export function buildEstoqueKeysPresentes(rows: EstoqueRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const modeloBase = getModeloBase(row.produto || "", row.categoria || "", row.observacao);
    keys.add(keyModeloCor(modeloBase, row.cor));
  }
  return keys;
}

export interface VariacaoCheck {
  produtoNome: string;
  categoriaSlug: string;
  storage?: string;
  cor?: string;
}

/**
 * Decide se deve esconder uma variação do mostruário.
 *
 * Retorna:
 *   - esgotado=true → esconder (confirmou que SKU existe no estoque e está zerado)
 *   - esgotado=false → mostrar (tem em estoque OU não confirmou que o SKU existe)
 */
export function checkVariacaoEsgotada(
  v: VariacaoCheck,
  indexDisponivel: Map<string, EstoqueAgg>,
  keysPresentes: Set<string>,
): { esgotado: boolean; modeloBase: string; key: string } {
  const estoqueCat = lojaCatToEstoqueCat(v.categoriaSlug);
  const produtoStr = [v.produtoNome, v.storage].filter(Boolean).join(" ");
  const modeloBase = getModeloBase(produtoStr, estoqueCat);
  const key = keyModeloCor(modeloBase, v.cor);

  const agg = indexDisponivel.get(key);
  const temEstoque = (agg?.totalEmEstoque || 0) > 0;
  if (temEstoque) return { esgotado: false, modeloBase, key };

  // Sem estoque disponível. Só considera esgotado se CONFIRMOU que o SKU
  // existe (alguma linha de estoque com essa chave, mesmo que zerada).
  const confirmouSKU = keysPresentes.has(key);
  return { esgotado: confirmouSKU, modeloBase, key };
}
