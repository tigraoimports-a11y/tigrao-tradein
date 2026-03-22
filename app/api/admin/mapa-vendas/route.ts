// app/api/admin/mapa-vendas/route.ts — Sales heatmap analytics data
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "30";

  // Build date filter
  let dateFilter: string | null = null;
  if (range !== "all") {
    const days = parseInt(range, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    dateFilter = since.toISOString().split("T")[0];
  }

  try {
    let query = supabase
      .from("vendas")
      .select("id, data, created_at, cliente, local, preco_vendido, custo, lucro, origem, forma, produto")
      .neq("status_pagamento", "CANCELADO")
      .order("data", { ascending: false });

    if (dateFilter) {
      query = query.gte("data", dateFilter);
    }

    const { data: vendas, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (vendas ?? []) as {
      id: string;
      data: string;
      created_at: string;
      cliente: string;
      local: string | null;
      preco_vendido: number;
      custo: number;
      lucro: number;
      origem: string;
      forma: string;
      produto: string;
    }[];

    // 1. Group by local (delivery type)
    const porLocal: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const loc = v.local || "NAO INFORMADO";
      if (!porLocal[loc]) porLocal[loc] = { qty: 0, receita: 0, lucro: 0 };
      porLocal[loc].qty++;
      porLocal[loc].receita += Number(v.preco_vendido || 0);
      porLocal[loc].lucro += Number(v.lucro || 0);
    }

    const locais = Object.entries(porLocal)
      .map(([local, d]) => ({
        local,
        qty: d.qty,
        receita: d.receita,
        lucro: d.lucro,
        ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
      }))
      .sort((a, b) => b.receita - a.receita);

    // 2. Top clients by volume
    const porCliente: Record<string, { qty: number; total: number; lastDate: string }> = {};
    for (const v of rows) {
      const cli = (v.cliente || "").trim().toUpperCase();
      if (!cli) continue;
      if (!porCliente[cli]) porCliente[cli] = { qty: 0, total: 0, lastDate: "" };
      porCliente[cli].qty++;
      porCliente[cli].total += Number(v.preco_vendido || 0);
      if (v.data > porCliente[cli].lastDate) porCliente[cli].lastDate = v.data;
    }

    const topClientes = Object.entries(porCliente)
      .map(([nome, d]) => ({
        nome,
        compras: d.qty,
        total: d.total,
        ultimaCompra: d.lastDate,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // 3. Day of week analysis
    const diasSemana = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
    const receitaDia = [0, 0, 0, 0, 0, 0, 0];
    for (const v of rows) {
      if (!v.data) continue;
      // Parse YYYY-MM-DD as local date
      const [y, m, d] = v.data.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      diasSemana[dow]++;
      receitaDia[dow] += Number(v.preco_vendido || 0);
    }

    const NOMES_DIAS = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
    const porDiaSemana = NOMES_DIAS.map((nome, i) => ({
      dia: nome,
      vendas: diasSemana[i],
      receita: receitaDia[i],
    }));

    // 4. Totals
    const totalVendas = rows.length;
    const totalReceita = rows.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
    const totalLucro = rows.reduce((s, v) => s + Number(v.lucro || 0), 0);
    const ticketMedio = totalVendas > 0 ? Math.round(totalReceita / totalVendas) : 0;

    return NextResponse.json({
      totalVendas,
      totalReceita,
      totalLucro,
      ticketMedio,
      locais,
      topClientes,
      porDiaSemana,
    });
  } catch (err) {
    console.error("Erro mapa-vendas:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
