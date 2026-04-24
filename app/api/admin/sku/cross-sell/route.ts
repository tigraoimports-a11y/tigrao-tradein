// app/api/admin/sku/cross-sell/route.ts
// Cross-sell por SKU: "clientes que compraram X tambem levaram Y".
// Cruza vendas do mesmo grupo_id (multi-produto no mesmo checkout) E vendas
// do mesmo cliente no mesmo dia. Retorna top SKUs frequentemente comprados
// junto.
//
// Uso:
//   GET /api/admin/sku/cross-sell?sku=IPHONE-17-PRO-MAX-256GB
//
// Usado pelo SkuInfoModal pra sugestao na hora da venda ("oferecer combo").

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { skuToNomeCanonico } from "@/lib/sku-validator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

interface CrossSellItem {
  sku: string;
  nome_canonico: string | null;
  vendas_juntas: number;    // quantas vezes apareceu junto do SKU alvo
  pct: number;              // % das vendas do SKU alvo que tambem incluiram esse
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sku = (req.nextUrl.searchParams.get("sku") || "").trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku obrigatorio" }, { status: 400 });

  const from90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    // 1. Busca todas as vendas do SKU alvo (ultimos 90d, nao canceladas)
    const { data: vendasAlvo } = await supabase
      .from("vendas")
      .select("id, grupo_id, cliente, cpf, data")
      .eq("sku", sku)
      .gte("data", from90d)
      .neq("status_pagamento", "CANCELADO");

    if (!vendasAlvo || vendasAlvo.length === 0) {
      return NextResponse.json({ ok: true, sku, total_vendas: 0, cross_sell: [] });
    }

    const totalVendasAlvo = vendasAlvo.length;

    // 2. Colete chaves de "transacao" (grupo_id OU cliente+data) pra cada venda
    type Chave = { grupoId: string | null; cliente: string | null; data: string | null };
    const chaves: Chave[] = vendasAlvo.map((v) => ({
      grupoId: v.grupo_id || null,
      cliente: v.cliente || v.cpf || null,
      data: v.data || null,
    }));

    // 3. Busca outras vendas que compartilhem grupo_id OU cliente+data
    //    Usa OR query pra pegar tudo de uma vez.
    const grupoIds = chaves.map((c) => c.grupoId).filter(Boolean) as string[];

    const outras: Array<{ sku: string; grupo_id: string | null; cliente: string | null; cpf: string | null; data: string | null; id: string }> = [];

    // Por grupo_id (pega vendas multi-produto do mesmo checkout)
    if (grupoIds.length > 0) {
      const { data } = await supabase
        .from("vendas")
        .select("id, sku, grupo_id, cliente, cpf, data")
        .in("grupo_id", grupoIds)
        .neq("sku", sku)
        .not("sku", "is", null)
        .neq("status_pagamento", "CANCELADO");
      if (data) outras.push(...(data as typeof outras));
    }

    // Por cliente+data (pega vendas separadas mas no mesmo atendimento)
    // Usa CPF quando disponivel pra precisao; senao nome.
    const cpfs = [...new Set(chaves.map((c) => c.cliente).filter(Boolean))];
    if (cpfs.length > 0) {
      // Busca vendas do mesmo dia dos mesmos clientes
      for (const chave of chaves) {
        if (!chave.cliente || !chave.data) continue;
        const { data } = await supabase
          .from("vendas")
          .select("id, sku, grupo_id, cliente, cpf, data")
          .or(`cliente.eq.${chave.cliente},cpf.eq.${chave.cliente}`)
          .eq("data", chave.data)
          .neq("sku", sku)
          .not("sku", "is", null)
          .neq("status_pagamento", "CANCELADO");
        if (data) outras.push(...(data as typeof outras));
      }
    }

    // 4. Deduplica (mesma venda pode aparecer via grupo E cliente+data)
    const vistas = new Set<string>();
    const outrasDedup = outras.filter((o) => {
      if (vistas.has(o.id)) return false;
      vistas.add(o.id);
      return true;
    });

    // 5. Conta frequencia de cada SKU cross-sell
    const counts = new Map<string, number>();
    for (const o of outrasDedup) {
      if (!o.sku) continue;
      counts.set(o.sku, (counts.get(o.sku) || 0) + 1);
    }

    // 6. Ordena e devolve top 5
    const cross: CrossSellItem[] = [...counts.entries()]
      .map(([s, n]) => ({
        sku: s,
        nome_canonico: skuToNomeCanonico(s),
        vendas_juntas: n,
        pct: Math.round((n / totalVendasAlvo) * 100),
      }))
      .sort((a, b) => b.vendas_juntas - a.vendas_juntas)
      .slice(0, 5);

    return NextResponse.json({
      ok: true,
      sku,
      total_vendas: totalVendasAlvo,
      cross_sell: cross,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
