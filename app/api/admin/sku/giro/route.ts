// app/api/admin/sku/giro/route.ts
// Velocidade de giro por SKU — quantos dias em media cada produto fica parado
// no estoque antes de vender. Ajuda a identificar "encalhados" (candidatos a
// promocao) vs "quentes" (priorizar compra).
//
// Calculo:
//   giro_medio_dias = media(venda.data - estoque.data_entrada) por SKU
//   em_estoque_dias = media(hoje - estoque.data_entrada) dos items EM ESTOQUE
//   ratio = em_estoque_dias / giro_medio_dias  (alerta se >= 2, item parado demais)
//
// Uso:
//   GET /api/admin/sku/giro?min_vendas=2

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { skuToNomeCanonico } from "@/lib/sku-validator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

interface SkuGiro {
  sku: string;
  nome_canonico: string | null;
  vendas_90d: number;
  giro_medio_dias: number | null;
  giro_min_dias: number | null;
  giro_max_dias: number | null;
  em_estoque_qnt: number;
  em_estoque_dias_max: number | null; // item mais antigo em estoque
  alerta: "quente" | "normal" | "lento" | "encalhado" | null;
}

function diffDias(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return null;
  return Math.max(0, Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24)));
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const minVendas = Number(req.nextUrl.searchParams.get("min_vendas") || "1");

  try {
    const from90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const hojeIso = new Date().toISOString().slice(0, 10);

    // Vendas com estoque_id (so essas da pra medir giro real). Ultimos 90d.
    const { data: vendas } = await supabase
      .from("vendas")
      .select("sku, estoque_id, data")
      .not("sku", "is", null)
      .not("estoque_id", "is", null)
      .gte("data", from90d)
      .neq("status_pagamento", "CANCELADO");

    // Junta com data_entrada do estoque vinculado
    const estoqueIdsVendidos = [...new Set((vendas || []).map((v) => v.estoque_id as string))];
    const { data: estoqueVendido } = estoqueIdsVendidos.length > 0
      ? await supabase.from("estoque").select("id, data_entrada").in("id", estoqueIdsVendidos)
      : { data: [] };
    const entradaMap = new Map<string, string | null>(
      (estoqueVendido || []).map((e) => [e.id, e.data_entrada]),
    );

    // Agrega giro por SKU (historico de vendas)
    const giroMap = new Map<string, number[]>(); // sku → [dias1, dias2, ...]
    for (const v of vendas || []) {
      const sku = v.sku as string;
      const entrada = entradaMap.get(v.estoque_id as string);
      const dias = diffDias(entrada, v.data);
      if (dias === null) continue;
      const arr = giroMap.get(sku) || [];
      arr.push(dias);
      giroMap.set(sku, arr);
    }

    // Estoque atual (EM ESTOQUE) — pra calcular dias parado
    const { data: estoqueAtual } = await supabase
      .from("estoque")
      .select("sku, qnt, data_entrada")
      .not("sku", "is", null)
      .eq("status", "EM ESTOQUE")
      .gt("qnt", 0);
    const estoqueMap = new Map<string, { qnt: number; diasMax: number | null }>();
    for (const e of estoqueAtual || []) {
      const sku = e.sku as string;
      const dias = diffDias(e.data_entrada, hojeIso);
      const cur = estoqueMap.get(sku) || { qnt: 0, diasMax: null };
      cur.qnt += Number(e.qnt || 0);
      if (dias !== null && (cur.diasMax === null || dias > cur.diasMax)) cur.diasMax = dias;
      estoqueMap.set(sku, cur);
    }

    // Junta resultados
    const todosSkus = new Set<string>([...giroMap.keys(), ...estoqueMap.keys()]);
    const resultados: SkuGiro[] = [];

    for (const sku of todosSkus) {
      const dias = giroMap.get(sku) || [];
      const media = dias.length > 0 ? Math.round(dias.reduce((s, x) => s + x, 0) / dias.length) : null;
      const min = dias.length > 0 ? Math.min(...dias) : null;
      const max = dias.length > 0 ? Math.max(...dias) : null;
      const est = estoqueMap.get(sku) || { qnt: 0, diasMax: null };

      // Alerta: classifica velocidade
      let alerta: SkuGiro["alerta"] = null;
      if (media !== null && dias.length >= 2) {
        if (media <= 7) alerta = "quente";
        else if (media <= 30) alerta = "normal";
        else if (media <= 60) alerta = "lento";
        else alerta = "encalhado";
      }
      // Se item em estoque esta parado > 2× o giro medio, eleva pra encalhado
      if (est.diasMax !== null && media !== null && media > 0 && est.diasMax > media * 2 && est.diasMax >= 30) {
        alerta = "encalhado";
      }

      resultados.push({
        sku,
        nome_canonico: skuToNomeCanonico(sku),
        vendas_90d: dias.length,
        giro_medio_dias: media,
        giro_min_dias: min,
        giro_max_dias: max,
        em_estoque_qnt: est.qnt,
        em_estoque_dias_max: est.diasMax,
        alerta,
      });
    }

    // Filtra por min_vendas e ordena por giro (ascendente = mais rapido primeiro)
    const filtrados = resultados.filter(
      (r) => r.vendas_90d >= minVendas || r.em_estoque_qnt > 0,
    );
    filtrados.sort((a, b) => {
      // encalhados (com estoque) primeiro pra atencao
      if (a.alerta === "encalhado" && b.alerta !== "encalhado") return -1;
      if (b.alerta === "encalhado" && a.alerta !== "encalhado") return 1;
      // depois por giro ascendente (mais lento primeiro pra ver problemas)
      const ag = a.giro_medio_dias ?? 9999;
      const bg = b.giro_medio_dias ?? 9999;
      return bg - ag;
    });

    return NextResponse.json({
      ok: true,
      total: filtrados.length,
      resultados: filtrados.slice(0, 100),
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
