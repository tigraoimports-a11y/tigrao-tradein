// app/api/admin/sku/top-vendidos/route.ts
// Dashboard agregado por SKU canonico — mostra rapidamente quais produtos
// estao saindo mais (vendas), quais clientes mais querem (simulacoes), e o
// pipeline em aberto (encomendas pendentes).
//
// Uso:
//   GET ?range=7d|30d|90d|all  (default 30d)
//
// Cada bucket retorna top 20 SKUs ordenados por volume.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseSku } from "@/lib/sku";

export const dynamic = "force-dynamic";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getDateFrom(range: string): string | null {
  const now = Date.now();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : null;
  if (days === null) return null;
  return new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
}

interface SkuAggVenda {
  sku: string;
  total: number;
  valor_total: number;
  ticket_medio: number;
  modelo: string;
  seminovo: boolean;
}

interface SkuAggGenerico {
  sku: string;
  total: number;
  modelo: string;
  seminovo: boolean;
}

interface SkuAggEncomenda extends SkuAggGenerico {
  pendentes: number;
}

function modeloLegivelDoSku(sku: string): { modelo: string; seminovo: boolean } {
  const parsed = parseSku(sku);
  if (!parsed) return { modelo: sku, seminovo: false };
  // Modelo + primeira spec geralmente eh o suficiente pra display
  // (ex: "IPHONE-17-PRO" + "256GB")
  const modelo = [parsed.modelo, parsed.specs[0]].filter(Boolean).join(" ");
  return { modelo, seminovo: parsed.seminovo };
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const range = req.nextUrl.searchParams.get("range") || "30d";
  const dataFrom = getDateFrom(range);
  const limit = 20;

  try {
    // ─── Vendas: agrega volume + faturamento por SKU ────────────────
    let qVendas = supabase.from("vendas").select("sku, preco_vendido, data, status_pagamento").not("sku", "is", null);
    if (dataFrom) qVendas = qVendas.gte("data", dataFrom.slice(0, 10));
    const { data: vendasRows } = await qVendas;
    const vendasMap = new Map<string, { total: number; valor: number }>();
    for (const r of vendasRows || []) {
      const sku = r.sku as string;
      // Excluir vendas canceladas/estornadas do agregado
      const status = String(r.status_pagamento || "").toUpperCase();
      if (status === "CANCELADO" || status === "ESTORNADO") continue;
      const cur = vendasMap.get(sku) || { total: 0, valor: 0 };
      cur.total += 1;
      cur.valor += Number(r.preco_vendido || 0);
      vendasMap.set(sku, cur);
    }
    const vendas: SkuAggVenda[] = [...vendasMap.entries()]
      .map(([sku, v]) => {
        const { modelo, seminovo } = modeloLegivelDoSku(sku);
        return {
          sku,
          total: v.total,
          valor_total: v.valor,
          ticket_medio: v.total > 0 ? Math.round(v.valor / v.total) : 0,
          modelo,
          seminovo,
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    // ─── Simulacoes: agrega volume por SKU (interesse de compra) ────
    let qSim = supabase.from("simulacoes").select("sku, created_at").not("sku", "is", null);
    if (dataFrom) qSim = qSim.gte("created_at", dataFrom);
    const { data: simRows } = await qSim;
    const simMap = new Map<string, number>();
    for (const r of simRows || []) {
      const sku = r.sku as string;
      simMap.set(sku, (simMap.get(sku) || 0) + 1);
    }
    const simulacoes: SkuAggGenerico[] = [...simMap.entries()]
      .map(([sku, total]) => {
        const { modelo, seminovo } = modeloLegivelDoSku(sku);
        return { sku, total, modelo, seminovo };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);

    // ─── Encomendas: agrega volume + pendentes por SKU ──────────────
    let qEnc = supabase.from("encomendas").select("sku, status, created_at").not("sku", "is", null);
    if (dataFrom) qEnc = qEnc.gte("created_at", dataFrom);
    const { data: encRows } = await qEnc;
    const encMap = new Map<string, { total: number; pendentes: number }>();
    for (const r of encRows || []) {
      const sku = r.sku as string;
      const status = String(r.status || "").toUpperCase();
      const cur = encMap.get(sku) || { total: 0, pendentes: 0 };
      cur.total += 1;
      // Status "abertos" — ajuste conforme convencao das encomendas
      if (status === "PENDENTE" || status === "COMPRADO" || status === "A CAMINHO") {
        cur.pendentes += 1;
      }
      encMap.set(sku, cur);
    }
    const encomendas: SkuAggEncomenda[] = [...encMap.entries()]
      .map(([sku, v]) => {
        const { modelo, seminovo } = modeloLegivelDoSku(sku);
        return { sku, total: v.total, pendentes: v.pendentes, modelo, seminovo };
      })
      .sort((a, b) => b.pendentes - a.pendentes || b.total - a.total)
      .slice(0, limit);

    // ─── Estoque atual por SKU (pra cruzar com vendas) ──────────────
    const { data: estoqueRows } = await supabase
      .from("estoque")
      .select("sku, qnt, status")
      .not("sku", "is", null)
      .eq("status", "EM ESTOQUE");
    const estoqueMap = new Map<string, number>();
    for (const r of estoqueRows || []) {
      const sku = r.sku as string;
      estoqueMap.set(sku, (estoqueMap.get(sku) || 0) + Number(r.qnt || 0));
    }
    // Annotate vendas com qnt em estoque agora
    const vendasComEstoque = vendas.map((v) => ({
      ...v,
      em_estoque: estoqueMap.get(v.sku) || 0,
    }));

    return NextResponse.json({
      ok: true,
      range,
      vendas: vendasComEstoque,
      simulacoes,
      encomendas,
      meta: {
        vendas_unicas: vendasMap.size,
        simulacoes_unicas: simMap.size,
        encomendas_unicas: encMap.size,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
