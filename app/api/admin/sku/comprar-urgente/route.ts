// app/api/admin/sku/comprar-urgente/route.ts
// Ranking de SKUs que o Andre precisa comprar do fornecedor, baseado em dados
// reais do negocio. Regra de prioridade:
//
//   estoque_agora = 0
//   score = avisos * 4 + encomendas_pendentes * 3 + simulacoes_30d * 2 + vendas_30d * 2
//
// Ranqueado por score decrescente. Quanto maior, mais urgente comprar.
//
// Tambem calcula "sugestao de qnt a comprar" baseada na velocidade de
// venda historica (ultimos 60d) + demanda reprimida atual:
//
//   velocidade_semanal = vendas_60d / ~8.6 (semanas em 60d)
//   qnt_sugerida = max(
//     avisos + encomendas_pendentes,            // demanda confirmada
//     velocidade_semanal * 2,                   // cobre 2 semanas de vendas
//     simulacoes_30d * 0.15                     // 15% das simulacoes viram venda
//   )
//
// Uso:
//   GET /api/admin/sku/comprar-urgente
//   Query opcional: ?min_score=N (default 2) — filtra SKUs irrelevantes

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { skuToNomeCanonico } from "@/lib/sku-validator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

interface SkuUrgencia {
  sku: string;
  nome_canonico: string | null;
  score: number;
  em_estoque: number;
  vendas_30d: number;
  vendas_60d: number;
  simulacoes_30d: number;
  avisos_ativos: number;
  encomendas_pendentes: number;
  velocidade_semanal: number;
  qnt_sugerida: number;
  ultimo_custo: number | null;
  ultima_venda_data: string | null;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const minScore = Number(req.nextUrl.searchParams.get("min_score") || "2");
  const from30d = daysAgoIso(30);
  const from60d = daysAgoIso(60);

  try {
    // Coleta em paralelo todos os SKUs com sinal de demanda ou estoque
    const [vendas60dRes, simRes, avisosRes, encRes, estoqueRes] = await Promise.all([
      supabase
        .from("vendas")
        .select("sku, data, preco_vendido, custo")
        .not("sku", "is", null)
        .gte("data", from60d.slice(0, 10))
        .neq("status_pagamento", "CANCELADO"),
      supabase
        .from("simulacoes")
        .select("sku")
        .not("sku", "is", null)
        .gte("created_at", from30d),
      supabase
        .from("avisos_clientes")
        .select("sku")
        .not("sku", "is", null)
        .eq("status", "ATIVO"),
      supabase
        .from("encomendas")
        .select("sku")
        .not("sku", "is", null)
        .in("status", ["PENDENTE", "COMPRADO", "A CAMINHO"]),
      supabase
        .from("estoque")
        .select("sku, qnt, status, custo_compra, custo_unitario, data_entrada")
        .not("sku", "is", null),
    ]);

    // Mapas por SKU
    const vendas30Map = new Map<string, number>();
    const vendas60Map = new Map<string, number>();
    const ultimaVendaMap = new Map<string, string>();
    const from30Date = from30d.slice(0, 10);
    for (const v of vendas60dRes.data || []) {
      const sku = v.sku as string;
      vendas60Map.set(sku, (vendas60Map.get(sku) || 0) + 1);
      if (v.data >= from30Date) vendas30Map.set(sku, (vendas30Map.get(sku) || 0) + 1);
      const prev = ultimaVendaMap.get(sku);
      if (!prev || (v.data && v.data > prev)) ultimaVendaMap.set(sku, v.data);
    }

    const simMap = new Map<string, number>();
    for (const r of simRes.data || []) {
      const sku = r.sku as string;
      simMap.set(sku, (simMap.get(sku) || 0) + 1);
    }

    const avisosMap = new Map<string, number>();
    for (const r of avisosRes.data || []) {
      const sku = r.sku as string;
      avisosMap.set(sku, (avisosMap.get(sku) || 0) + 1);
    }

    const encMap = new Map<string, number>();
    for (const r of encRes.data || []) {
      const sku = r.sku as string;
      encMap.set(sku, (encMap.get(sku) || 0) + 1);
    }

    // Estoque: agrega qnt em EM ESTOQUE e pega ultimo custo conhecido
    const estoqueMap = new Map<string, { qnt: number; ultimoCusto: number | null; ultimaEntrada: string | null }>();
    for (const r of estoqueRes.data || []) {
      const sku = r.sku as string;
      const isEmEstoque = String(r.status || "").toUpperCase() === "EM ESTOQUE" && Number(r.qnt || 0) > 0;
      const cur = estoqueMap.get(sku) || { qnt: 0, ultimoCusto: null, ultimaEntrada: null };
      if (isEmEstoque) cur.qnt += Number(r.qnt || 0);
      const custo = Number(r.custo_compra || r.custo_unitario || 0);
      if (custo > 0) {
        // Pega o MAIS RECENTE (comparando por data_entrada)
        if (!cur.ultimaEntrada || (r.data_entrada && r.data_entrada > cur.ultimaEntrada)) {
          cur.ultimoCusto = custo;
          cur.ultimaEntrada = r.data_entrada || cur.ultimaEntrada;
        }
      }
      estoqueMap.set(sku, cur);
    }

    // Gera lista de todos os SKUs que aparecem em qualquer mapa
    const todosSkus = new Set<string>([
      ...vendas60Map.keys(),
      ...simMap.keys(),
      ...avisosMap.keys(),
      ...encMap.keys(),
      ...estoqueMap.keys(),
    ]);

    const resultados: SkuUrgencia[] = [];

    for (const sku of todosSkus) {
      const est = estoqueMap.get(sku) || { qnt: 0, ultimoCusto: null, ultimaEntrada: null };
      const vendas30 = vendas30Map.get(sku) || 0;
      const vendas60 = vendas60Map.get(sku) || 0;
      const sim = simMap.get(sku) || 0;
      const avisos = avisosMap.get(sku) || 0;
      const enc = encMap.get(sku) || 0;

      // Score: so pontua forte quando estoque = 0. Com estoque, score baixo
      // (o produto nao e urgencia imediata).
      const multiplicadorEstoque = est.qnt === 0 ? 1 : est.qnt < 2 ? 0.5 : 0;
      const score = Math.round(
        (avisos * 4 + enc * 3 + sim * 2 + vendas30 * 2) * multiplicadorEstoque,
      );

      if (score < minScore) continue;

      const velocidadeSemanal = Math.round((vendas60 / 8.6) * 10) / 10;
      const qntSugerida = Math.max(
        avisos + enc,
        Math.ceil(velocidadeSemanal * 2),
        Math.ceil(sim * 0.15),
        1,
      );

      resultados.push({
        sku,
        nome_canonico: skuToNomeCanonico(sku),
        score,
        em_estoque: est.qnt,
        vendas_30d: vendas30,
        vendas_60d: vendas60,
        simulacoes_30d: sim,
        avisos_ativos: avisos,
        encomendas_pendentes: enc,
        velocidade_semanal: velocidadeSemanal,
        qnt_sugerida: qntSugerida,
        ultimo_custo: est.ultimoCusto,
        ultima_venda_data: ultimaVendaMap.get(sku) || null,
      });
    }

    // Ordena por score desc
    resultados.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      ok: true,
      total: resultados.length,
      gerado_em: new Date().toISOString(),
      resultados: resultados.slice(0, 100),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
