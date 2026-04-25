// lib/loja-estoque-match.ts
// Liga loja_variacoes (mostruário público) ao estoque real pra esconder esgotados.
//
// Duas estrategias de match, usadas em cascata:
//
//   1) JOIN por SKU canonico (preferencial, precisao 100%):
//      Se a variacao tem sku E existe alguma row de estoque com o mesmo sku,
//      usa lookup exato. Zero falsos positivos/negativos.
//
//   2) Fallback fuzzy (legado, pra rows sem SKU):
//      chave = getModeloBase(produto, categoria) + "::" + corParaPT(cor)
//      Permissivo: se nao achar match nenhum, deixa visivel (beneficio da
//      duvida). So esconde quando confirmou existir SKU zerado.
//
// Transicao: conforme backfill popular SKUs, o (1) vira caminho principal
// e o (2) so roda em rows orfas. Quando atingir 100% cobertura, podemos
// remover o fuzzy.

import { getModeloBase } from "./produto-display";
import { corParaPT } from "./cor-pt";

export interface EstoqueRow {
  produto: string;
  categoria: string;
  qnt: number | null;
  status: string | null;
  cor: string | null;
  observacao?: string | null;
  sku?: string | null;
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

// ─── Path preferencial: JOIN por SKU canonico ─────────────────────

/**
 * Indices por SKU. Separados em dois porque a semantica e diferente:
 *   - disponivel: soma qnt quando status="EM ESTOQUE" e qnt>0 (pra saber se "tem")
 *   - presentes: qualquer row (mesmo ESGOTADO) pra saber se o SKU existe no sistema
 */
export function buildEstoqueIndexBySku(rows: EstoqueRow[]): {
  disponivel: Map<string, EstoqueAgg>;
  presentes: Set<string>;
} {
  const disponivel = new Map<string, EstoqueAgg>();
  const presentes = new Set<string>();
  for (const row of rows) {
    if (!row.sku) continue;
    presentes.add(row.sku);
    const qnt = Number(row.qnt || 0);
    const isEmEstoque = (row.status || "").toUpperCase() === "EM ESTOQUE" && qnt > 0;
    if (isEmEstoque) {
      const existing = disponivel.get(row.sku) || { totalEmEstoque: 0 };
      existing.totalEmEstoque += qnt;
      disponivel.set(row.sku, existing);
    }
  }
  return { disponivel, presentes };
}

/**
 * Decide esgotado usando SKU canonico. Retorna null quando o lookup nao
 * pode ser feito (variacao sem SKU) — nesse caso o caller deve cair no
 * fallback fuzzy checkVariacaoEsgotada.
 *
 * Mesma semantica do fuzzy: so esconde se confirmou que SKU existe.
 */
export function checkVariacaoEsgotadaBySku(
  variacaoSku: string | null | undefined,
  disponivel: Map<string, EstoqueAgg>,
  presentes: Set<string>,
): { esgotado: boolean; matchedBySku: true } | null {
  if (!variacaoSku) return null;
  const agg = disponivel.get(variacaoSku);
  const temEstoque = (agg?.totalEmEstoque || 0) > 0;
  if (temEstoque) return { esgotado: false, matchedBySku: true };
  const confirmou = presentes.has(variacaoSku);
  return { esgotado: confirmou, matchedBySku: true };
}
