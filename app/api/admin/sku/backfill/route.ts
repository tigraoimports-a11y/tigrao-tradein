// app/api/admin/sku/backfill/route.ts
// Endpoint admin pra rodar o backfill de SKU canônico.
//
// Uso:
//   GET  ?dry=1       → relatório sem escrever
//   POST              → executa de verdade
//   POST ?force=1     → sobrescreve SKUs já existentes
//
// Tabelas processadas: estoque, loja_variacoes, avaliacao_usados.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { gerarSku, type ProdutoInput } from "@/lib/sku";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2 minutos pra processar tudo

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

function detectarCategoria(modelo: string): string {
  const up = (modelo || "").toUpperCase();
  if (/IPHONE/.test(up)) return "IPHONES";
  if (/IPAD/.test(up)) return "IPADS";
  if (/MAC.*MINI/.test(up)) return "MAC_MINI";
  if (/MACBOOK/.test(up)) return "MACBOOK";
  if (/WATCH/.test(up)) return "APPLE_WATCH";
  if (/AIRPODS/.test(up)) return "AIRPODS";
  return "OUTROS";
}

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

  return results;
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
