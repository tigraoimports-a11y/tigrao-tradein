// app/api/admin/sku/margens/route.ts
// Ranking de margem real por SKU — cruza preco_vendido vs custo. Usado pra
// decidir foco de promocao/desconto ("posso dar desconto em X sem virar
// prejuizo?") e estrategia de mix de compra ("o que mais rende?").
//
// Uso:
//   GET /api/admin/sku/margens?range=7d|30d|90d|all (default 30d)
//
// Retorna dois rankings:
//   - Top absoluto: SKUs com maior lucro TOTAL em R$
//   - Top percentual: SKUs com maior margem % (minimo N vendas pra filtrar outliers)

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { skuToNomeCanonico } from "@/lib/sku-validator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function dateFrom(range: string): string | null {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  if (days === null) return null;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

interface SkuMargem {
  sku: string;
  nome_canonico: string | null;
  vendas: number;
  faturamento: number;
  custo_total: number;
  lucro_total: number;
  ticket_medio: number;
  custo_medio: number;
  margem_pct: number; // lucro / faturamento × 100
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = req.nextUrl.searchParams.get("range") || "30d";
  const minVendas = Number(req.nextUrl.searchParams.get("min_vendas") || "2");
  const from = dateFrom(range);

  try {
    let q = supabase
      .from("vendas")
      .select("sku, preco_vendido, custo, data, status_pagamento")
      .not("sku", "is", null)
      .neq("status_pagamento", "CANCELADO")
      .neq("status_pagamento", "ESTORNADO");
    if (from) q = q.gte("data", from);
    const { data: vendasRows, error } = await q;
    if (error) throw new Error(error.message);

    // Agrega por SKU
    const map = new Map<string, { vendas: number; fat: number; custo: number }>();
    for (const v of vendasRows || []) {
      const sku = v.sku as string;
      if (!sku) continue;
      const preco = Number(v.preco_vendido || 0);
      const custo = Number(v.custo || 0);
      // Ignora vendas com custo=0 (brindes/cortesia) na conta de margem — nao
      // sao significativas pra decisao.
      if (custo <= 0 && preco <= 0) continue;
      const cur = map.get(sku) || { vendas: 0, fat: 0, custo: 0 };
      cur.vendas += 1;
      cur.fat += preco;
      cur.custo += custo;
      map.set(sku, cur);
    }

    const resultados: SkuMargem[] = [...map.entries()].map(([sku, agg]) => {
      const lucro = agg.fat - agg.custo;
      const margem = agg.fat > 0 ? Math.round((lucro / agg.fat) * 1000) / 10 : 0;
      return {
        sku,
        nome_canonico: skuToNomeCanonico(sku),
        vendas: agg.vendas,
        faturamento: Math.round(agg.fat),
        custo_total: Math.round(agg.custo),
        lucro_total: Math.round(lucro),
        ticket_medio: agg.vendas > 0 ? Math.round(agg.fat / agg.vendas) : 0,
        custo_medio: agg.vendas > 0 ? Math.round(agg.custo / agg.vendas) : 0,
        margem_pct: margem,
      };
    });

    // Top absoluto: ordena por lucro_total desc
    const topAbsoluto = [...resultados].sort((a, b) => b.lucro_total - a.lucro_total).slice(0, 30);

    // Top percentual: filtra por min_vendas (evita ruido de outliers) e ordena por margem_pct
    const topPercentual = resultados
      .filter((r) => r.vendas >= minVendas)
      .sort((a, b) => b.margem_pct - a.margem_pct)
      .slice(0, 30);

    // Totais agregados do periodo (pra KPIs topo)
    const totalFat = resultados.reduce((s, r) => s + r.faturamento, 0);
    const totalCusto = resultados.reduce((s, r) => s + r.custo_total, 0);
    const totalLucro = totalFat - totalCusto;
    const margemGeral = totalFat > 0 ? Math.round((totalLucro / totalFat) * 1000) / 10 : 0;

    return NextResponse.json({
      ok: true,
      range,
      min_vendas: minVendas,
      totais: {
        skus_unicos: resultados.length,
        vendas: resultados.reduce((s, r) => s + r.vendas, 0),
        faturamento: totalFat,
        custo_total: totalCusto,
        lucro_total: totalLucro,
        margem_pct: margemGeral,
      },
      top_absoluto: topAbsoluto,
      top_percentual: topPercentual,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
