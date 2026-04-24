// app/api/admin/sku/backfill/route.ts
// Endpoint admin pra rodar o backfill de SKU canônico.
//
// Uso:
//   GET  ?dry=1       → relatório sem escrever
//   POST              → executa de verdade
//   POST ?force=1     → sobrescreve SKUs já existentes
//
// Tabelas processadas:
//   Fase 1: estoque, loja_variacoes, avaliacao_usados
//   Fase 3: vendas, encomendas, link_compras, simulacoes
//
// Pra vendas/encomendas, prefere copiar SKU do estoque vinculado quando
// existe. Senao gera do texto livre via lib/sku.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { gerarSku, detectarCategoriaPorTexto, type ProdutoInput } from "@/lib/sku";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutos pra processar tudo (vendas/links podem ter muitas rows)

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

interface BackfillStats {
  tabela: string;
  total: number;
  sucesso: number;
  falha: number;
  baixaConfianca: number;
  skusUnicos: number;
  topSkus: Array<{ sku: string; count: number }>;
  exemplosFalha: Array<{ id: string; produto: string; categoria: string }>;
}

// Wrapper pra continuar funcionando — agora reaproveita o helper compartilhado
const detectarCategoria = detectarCategoriaPorTexto;

async function processarTabela(
  tabela: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapper: (row: any) => ProdutoInput | null,
  opts: { dry: boolean; force: boolean },
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    tabela,
    total: 0,
    sucesso: 0,
    falha: 0,
    baixaConfianca: 0,
    skusUnicos: 0,
    topSkus: [],
    exemplosFalha: [],
  };

  let query = supabase.from(tabela).select("*");
  if (!opts.force) query = query.is("sku", null);

  const { data: rows, error } = await query;
  if (error) throw new Error(`${tabela}: ${error.message}`);
  if (!rows || rows.length === 0) return stats;

  stats.total = rows.length;
  const updates: Array<{ id: string; sku: string }> = [];
  const skuCount = new Map<string, number>();

  for (const row of rows) {
    const input = mapper(row);
    if (!input || !input.produto) {
      stats.falha++;
      if (stats.exemplosFalha.length < 5) {
        stats.exemplosFalha.push({ id: row.id, produto: input?.produto || "(vazio)", categoria: input?.categoria || "" });
      }
      continue;
    }
    const result = gerarSku(input);
    if (!result.sku) {
      stats.falha++;
      if (stats.exemplosFalha.length < 5) {
        stats.exemplosFalha.push({ id: row.id, produto: (input.produto || "").slice(0, 80), categoria: input.categoria });
      }
      continue;
    }
    stats.sucesso++;
    if (result.confianca < 100) stats.baixaConfianca++;
    skuCount.set(result.sku, (skuCount.get(result.sku) || 0) + 1);
    updates.push({ id: row.id, sku: result.sku });
  }

  stats.skusUnicos = skuCount.size;
  stats.topSkus = [...skuCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sku, count]) => ({ sku, count }));

  if (opts.dry) return stats;

  // Salva os updates em chunks pra não travar
  for (const u of updates) {
    await supabase.from(tabela).update({ sku: u.sku }).eq("id", u.id);
  }
  return stats;
}

async function rodarBackfill(opts: { dry: boolean; force: boolean }): Promise<BackfillStats[]> {
  const results: BackfillStats[] = [];

  results.push(await processarTabela("estoque", (row) => ({
    produto: row.produto,
    categoria: row.categoria,
    cor: row.cor,
    observacao: row.observacao,
    tipo: row.tipo,
  }), opts));

  // loja_variacoes: precisa juntar com loja_produtos pra pegar a categoria
  results.push(await (async () => {
    let query = supabase.from("loja_variacoes").select("*, loja_produtos(nome, categoria_id, loja_categorias:categoria_id(slug))");
    if (!opts.force) query = query.is("sku", null);
    const { data, error } = await query;
    if (error) throw error;

    const stats: BackfillStats = {
      tabela: "loja_variacoes",
      total: data?.length || 0,
      sucesso: 0, falha: 0, baixaConfianca: 0, skusUnicos: 0,
      topSkus: [], exemplosFalha: [],
    };
    if (!data) return stats;

    const skuCount = new Map<string, number>();
    const updates: Array<{ id: string; sku: string }> = [];

    for (const row of data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const produtoPai = (row as any).loja_produtos;
      const slugCat = produtoPai?.loja_categorias?.slug || "";
      // Mapeia slug do mostruario pra categoria do estoque
      const categoria =
        slugCat === "iphones" ? "IPHONES" :
        slugCat === "ipads" ? "IPADS" :
        slugCat === "macbooks" ? "MACBOOK" :
        slugCat === "mac-mini" ? "MAC_MINI" :
        slugCat === "apple-watch" ? "APPLE_WATCH" :
        slugCat === "airpods" ? "AIRPODS" :
        slugCat === "acessorios" ? "ACESSORIOS" : "OUTROS";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const attrs = (row as any).atributos || {};
      const produtoNome = `${produtoPai?.nome || ""} ${row.nome || ""}`.trim();

      const input: ProdutoInput = {
        produto: produtoNome,
        categoria,
        cor: attrs.cor,
        observacao: null,
        tipo: "NOVO",
      };
      const result = gerarSku(input);
      if (!result.sku) {
        stats.falha++;
        if (stats.exemplosFalha.length < 5) {
          stats.exemplosFalha.push({ id: row.id, produto: produtoNome.slice(0, 80), categoria });
        }
        continue;
      }
      stats.sucesso++;
      if (result.confianca < 100) stats.baixaConfianca++;
      skuCount.set(result.sku, (skuCount.get(result.sku) || 0) + 1);
      updates.push({ id: row.id, sku: result.sku });
    }

    stats.skusUnicos = skuCount.size;
    stats.topSkus = [...skuCount.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([sku, count]) => ({ sku, count }));

    if (!opts.dry) {
      for (const u of updates) {
        await supabase.from("loja_variacoes").update({ sku: u.sku }).eq("id", u.id);
      }
    }
    return stats;
  })());

  results.push(await processarTabela("avaliacao_usados", (row) => ({
    produto: `${row.modelo || ""} ${row.armazenamento || ""}`.trim(),
    categoria: detectarCategoria(row.modelo || ""),
    cor: null,
    observacao: null,
    tipo: "SEMINOVO",
  }), opts));

  // ─── Fase 3: tabelas transacionais ───────────────────────────────

  // vendas: prefere SKU do estoque vinculado quando existe; senao gera do texto.
  results.push(await processarTabelaComEstoqueLookup("vendas", (row) => ({
    produto: row.produto,
    categoria: row.categoria || detectarCategoria(row.produto || ""),
    cor: row.cor,
    observacao: null,
    tipo: "NOVO",
  }), opts));

  // encomendas: idem vendas. Tem coluna estoque_id quando vinculado.
  results.push(await processarTabelaComEstoqueLookup("encomendas", (row) => ({
    produto: row.produto,
    categoria: row.categoria || detectarCategoria(row.produto || ""),
    cor: row.cor,
    observacao: null,
    tipo: "NOVO",
  }), opts));

  // link_compras: nao tem estoque_id direto, sempre gera do texto.
  results.push(await processarTabela("link_compras", (row) => ({
    produto: row.produto,
    categoria: detectarCategoria(row.produto || ""),
    cor: row.cor,
    observacao: null,
    tipo: "NOVO",
  }), opts));

  // simulacoes: SKU representa o produto NOVO desejado (foco da troca).
  results.push(await processarTabela("simulacoes", (row) => ({
    produto: `${row.modelo_novo || ""} ${row.storage_novo || ""}`.trim(),
    categoria: detectarCategoria(row.modelo_novo || ""),
    cor: null,
    observacao: null,
    tipo: "NOVO",
  }), opts));

  return results;
}

// Variante de processarTabela pra vendas/encomendas: pra cada row com
// estoque_id, tenta copiar SKU do estoque (mais confiavel — ja passou pelo
// gerador validado). Se nao tem estoque_id ou estoque sem SKU, cai no mapper
// generico (gera do texto).
async function processarTabelaComEstoqueLookup(
  tabela: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mapper: (row: any) => ProdutoInput | null,
  opts: { dry: boolean; force: boolean },
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    tabela,
    total: 0, sucesso: 0, falha: 0, baixaConfianca: 0, skusUnicos: 0,
    topSkus: [], exemplosFalha: [],
  };

  let query = supabase.from(tabela).select("*");
  if (!opts.force) query = query.is("sku", null);
  const { data: rows, error } = await query;
  if (error) throw new Error(`${tabela}: ${error.message}`);
  if (!rows || rows.length === 0) return stats;

  stats.total = rows.length;

  // Coleta estoque_ids existentes pra um lookup batch
  const estoqueIds = [...new Set(
    rows.map((r) => (r as { estoque_id?: string | null }).estoque_id).filter(Boolean),
  )] as string[];
  const skuByEstoqueId = new Map<string, string>();
  if (estoqueIds.length > 0) {
    const { data: estItems } = await supabase
      .from("estoque")
      .select("id, sku")
      .in("id", estoqueIds);
    for (const e of estItems || []) {
      if (e.sku) skuByEstoqueId.set(e.id, e.sku);
    }
  }

  const updates: Array<{ id: string; sku: string }> = [];
  const skuCount = new Map<string, number>();

  for (const row of rows) {
    const estId = (row as { estoque_id?: string | null }).estoque_id;
    let sku: string | null = null;

    // Path 1: copia do estoque vinculado
    if (estId && skuByEstoqueId.has(estId)) {
      sku = skuByEstoqueId.get(estId)!;
      stats.sucesso++;
    } else {
      // Path 2: gera do texto via mapper
      const input = mapper(row);
      if (!input || !input.produto) {
        stats.falha++;
        if (stats.exemplosFalha.length < 5) {
          stats.exemplosFalha.push({ id: row.id, produto: input?.produto || "(vazio)", categoria: input?.categoria || "" });
        }
        continue;
      }
      const result = gerarSku(input);
      if (!result.sku) {
        stats.falha++;
        if (stats.exemplosFalha.length < 5) {
          stats.exemplosFalha.push({ id: row.id, produto: (input.produto || "").slice(0, 80), categoria: input.categoria });
        }
        continue;
      }
      sku = result.sku;
      stats.sucesso++;
      if (result.confianca < 100) stats.baixaConfianca++;
    }

    skuCount.set(sku, (skuCount.get(sku) || 0) + 1);
    updates.push({ id: row.id, sku });
  }

  stats.skusUnicos = skuCount.size;
  stats.topSkus = [...skuCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([sku, count]) => ({ sku, count }));

  if (opts.dry) return stats;
  for (const u of updates) {
    await supabase.from(tabela).update({ sku: u.sku }).eq("id", u.id);
  }
  return stats;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  try {
    const results = await rodarBackfill({ dry: true, force: dry ? false : false });
    return NextResponse.json({ ok: true, dry: true, results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const results = await rodarBackfill({ dry: false, force });
    return NextResponse.json({ ok: true, force, results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
