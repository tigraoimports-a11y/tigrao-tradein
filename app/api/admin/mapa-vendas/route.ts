// app/api/admin/mapa-vendas/route.ts — Sales geography analytics
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
  if (range === "month") {
    const now = new Date();
    dateFilter = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  } else if (range !== "all") {
    const days = parseInt(range, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    dateFilter = since.toISOString().split("T")[0];
  }

  try {
    let query = supabase
      .from("vendas")
      .select("id, data, cliente, preco_vendido, custo, lucro, bairro, cidade, uf")
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
      cliente: string;
      preco_vendido: number;
      custo: number;
      lucro: number;
      bairro: string | null;
      cidade: string | null;
      uf: string | null;
    }[];

    // --- Aggregate by bairro (top 20) ---
    const porBairro: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const b = (v.bairro || "").trim() || "Nao informado";
      if (!porBairro[b]) porBairro[b] = { qty: 0, receita: 0, lucro: 0 };
      porBairro[b].qty++;
      porBairro[b].receita += Number(v.preco_vendido || 0);
      porBairro[b].lucro += Number(v.lucro || 0);
    }

    const bairros = Object.entries(porBairro)
      .map(([nome, d]) => ({
        nome,
        qty: d.qty,
        receita: d.receita,
        lucro: d.lucro,
        ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 20);

    // --- Aggregate by cidade (top 10) ---
    const porCidade: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const c = (v.cidade || "").trim() || "Nao informado";
      if (!porCidade[c]) porCidade[c] = { qty: 0, receita: 0, lucro: 0 };
      porCidade[c].qty++;
      porCidade[c].receita += Number(v.preco_vendido || 0);
      porCidade[c].lucro += Number(v.lucro || 0);
    }

    const cidades = Object.entries(porCidade)
      .map(([nome, d]) => ({
        nome,
        qty: d.qty,
        receita: d.receita,
        lucro: d.lucro,
        ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // --- Aggregate by UF ---
    const porUF: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rows) {
      const u = (v.uf || "").trim().toUpperCase() || "N/A";
      if (!porUF[u]) porUF[u] = { qty: 0, receita: 0, lucro: 0 };
      porUF[u].qty++;
      porUF[u].receita += Number(v.preco_vendido || 0);
      porUF[u].lucro += Number(v.lucro || 0);
    }

    const estados = Object.entries(porUF)
      .map(([nome, d]) => ({
        nome,
        qty: d.qty,
        receita: d.receita,
        lucro: d.lucro,
        ticket: d.qty > 0 ? Math.round(d.receita / d.qty) : 0,
      }))
      .sort((a, b) => b.qty - a.qty);

    // --- Top clients by volume ---
    const porCliente: Record<string, { qty: number; total: number; lucro: number; lastDate: string }> = {};
    for (const v of rows) {
      const cli = (v.cliente || "").trim().toUpperCase();
      if (!cli) continue;
      if (!porCliente[cli]) porCliente[cli] = { qty: 0, total: 0, lucro: 0, lastDate: "" };
      porCliente[cli].qty++;
      porCliente[cli].total += Number(v.preco_vendido || 0);
      porCliente[cli].lucro += Number(v.lucro || 0);
      if (v.data > porCliente[cli].lastDate) porCliente[cli].lastDate = v.data;
    }

    const topClientes = Object.entries(porCliente)
      .map(([nome, d]) => ({
        nome,
        compras: d.qty,
        total: d.total,
        lucro: d.lucro,
        ultimaCompra: d.lastDate,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // --- Day of week analysis ---
    const diasSemana = [0, 0, 0, 0, 0, 0, 0];
    const receitaDia = [0, 0, 0, 0, 0, 0, 0];
    for (const v of rows) {
      if (!v.data) continue;
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

    // --- Totals ---
    const totalVendas = rows.length;
    const totalReceita = rows.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
    const totalLucro = rows.reduce((s, v) => s + Number(v.lucro || 0), 0);
    const ticketMedio = totalVendas > 0 ? Math.round(totalReceita / totalVendas) : 0;

    return NextResponse.json({
      totalVendas,
      totalReceita,
      totalLucro,
      ticketMedio,
      bairros,
      cidades,
      estados,
      topClientes,
      porDiaSemana,
    });
  } catch (err) {
    console.error("Erro mapa-vendas:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
