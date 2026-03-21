// app/api/admin/relatorio-origens/route.ts — Ranking mensal de origens de venda
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { searchParams } = new URL(req.url);
  const hoje = new Date();
  const mesParam = searchParams.get("mes") || `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  // Validar formato YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(mesParam)) {
    return NextResponse.json({ error: "Formato inválido. Use YYYY-MM" }, { status: 400 });
  }

  const inicioMes = `${mesParam}-01`;
  const [year, month] = mesParam.split("-").map(Number);
  const ultimoDia = new Date(year, month, 0).getDate();
  const fimMes = `${mesParam}-${String(ultimoDia).padStart(2, "0")}`;

  // Mês anterior para comparativo
  const mesAnteriorDate = new Date(year, month - 2, 1);
  const mesAnterior = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, "0")}`;
  const inicioMesAnt = `${mesAnterior}-01`;
  const ultimoDiaAnt = new Date(mesAnteriorDate.getFullYear(), mesAnteriorDate.getMonth() + 1, 0).getDate();
  const fimMesAnt = `${mesAnterior}-${String(ultimoDiaAnt).padStart(2, "0")}`;

  try {
    // Buscar vendas do mês atual e anterior em paralelo
    const [{ data: vendasMes }, { data: vendasMesAnt }] = await Promise.all([
      supabase
        .from("vendas")
        .select("origem, preco_vendido, custo, lucro, margem_pct")
        .gte("data", inicioMes)
        .lte("data", fimMes)
        .neq("status_pagamento", "CANCELADO"),
      supabase
        .from("vendas")
        .select("origem, preco_vendido, custo, lucro, margem_pct")
        .gte("data", inicioMesAnt)
        .lte("data", fimMesAnt)
        .neq("status_pagamento", "CANCELADO"),
    ]);

    const rows = (vendasMes ?? []) as { origem: string; preco_vendido: number; custo: number; lucro: number; margem_pct: number }[];
    const rowsAnt = (vendasMesAnt ?? []) as { origem: string; preco_vendido: number; custo: number; lucro: number; margem_pct: number }[];

    // Agrupar por origem — mês atual
    const porOrigem: Record<string, { qty: number; receita: number; lucro: number; margemSum: number }> = {};
    let totalQty = 0;
    let totalReceita = 0;
    let totalLucro = 0;

    for (const v of rows) {
      const origem = v.origem || "OUTROS";
      if (!porOrigem[origem]) porOrigem[origem] = { qty: 0, receita: 0, lucro: 0, margemSum: 0 };
      porOrigem[origem].qty++;
      porOrigem[origem].receita += Number(v.preco_vendido || 0);
      porOrigem[origem].lucro += Number(v.lucro || 0);
      porOrigem[origem].margemSum += Number(v.margem_pct || 0);
      totalQty++;
      totalReceita += Number(v.preco_vendido || 0);
      totalLucro += Number(v.lucro || 0);
    }

    // Agrupar por origem — mês anterior
    const porOrigemAnt: Record<string, { qty: number; receita: number; lucro: number }> = {};
    for (const v of rowsAnt) {
      const origem = v.origem || "OUTROS";
      if (!porOrigemAnt[origem]) porOrigemAnt[origem] = { qty: 0, receita: 0, lucro: 0 };
      porOrigemAnt[origem].qty++;
      porOrigemAnt[origem].receita += Number(v.preco_vendido || 0);
      porOrigemAnt[origem].lucro += Number(v.lucro || 0);
    }

    // Construir ranking ordenado por receita
    const ranking = Object.entries(porOrigem)
      .map(([origem, dados]) => {
        const ant = porOrigemAnt[origem] || { qty: 0, receita: 0, lucro: 0 };
        const margem = dados.receita > 0 ? (dados.lucro / dados.receita) * 100 : 0;
        const ticket = dados.qty > 0 ? dados.receita / dados.qty : 0;
        const share = totalReceita > 0 ? (dados.receita / totalReceita) * 100 : 0;

        return {
          origem,
          qty: dados.qty,
          receita: dados.receita,
          lucro: dados.lucro,
          margem: Math.round(margem * 10) / 10,
          ticket: Math.round(ticket),
          share: Math.round(share * 10) / 10,
          // Comparativo
          deltaQty: dados.qty - ant.qty,
          deltaReceita: dados.receita - ant.receita,
          deltaLucro: dados.lucro - ant.lucro,
        };
      })
      .sort((a, b) => b.receita - a.receita);

    // Melhor margem e maior ticket
    const melhorMargem = ranking.length > 0
      ? ranking.reduce((best, cur) => cur.margem > best.margem ? cur : best, ranking[0])
      : null;
    const maiorTicket = ranking.length > 0
      ? ranking.reduce((best, cur) => cur.ticket > best.ticket ? cur : best, ranking[0])
      : null;

    return NextResponse.json({
      mes: mesParam,
      mesAnterior,
      totalQty,
      totalReceita,
      totalLucro,
      ranking,
      melhorMargem: melhorMargem ? { origem: melhorMargem.origem, margem: melhorMargem.margem } : null,
      maiorTicket: maiorTicket ? { origem: maiorTicket.origem, ticket: maiorTicket.ticket } : null,
    });
  } catch (err) {
    console.error("Erro relatorio-origens:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
