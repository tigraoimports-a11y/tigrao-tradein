// app/api/admin/sazonalidade/route.ts — Seasonality analytics
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

interface VendaRow {
  id: number;
  data: string;
  produto: string;
  preco_vendido: number;
  custo: number;
  lucro: number;
  created_at: string | null;
  origem: string | null;
  tipo: string | null;
}

const DIAS_SEMANA_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const DIAS_SEMANA_FULL = ["Domingo", "Segunda-feira", "Terca-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sabado"];

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const range = searchParams.get("range") || "3m";

  // Calculate date range
  const now = new Date();
  let fromDate: string | null = null;

  if (range === "1m") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    fromDate = d.toISOString().split("T")[0];
  } else if (range === "3m") {
    const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    fromDate = d.toISOString().split("T")[0];
  } else if (range === "6m") {
    const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    fromDate = d.toISOString().split("T")[0];
  } else if (range === "1y") {
    const d = new Date(now.getFullYear() - 1, now.getMonth(), 1);
    fromDate = d.toISOString().split("T")[0];
  }
  // "all" => fromDate stays null

  // Fetch vendas
  let query = supabase
    .from("vendas")
    .select("id, data, produto, preco_vendido, custo, lucro, created_at, origem, tipo, status_pagamento")
    .neq("status_pagamento", "CANCELADO")
    .neq("status_pagamento", "PROGRAMADA")
    .order("data", { ascending: true });

  if (fromDate) query = query.gte("data", fromDate);

  const { data: vendas, error } = await query.limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (vendas || []) as VendaRow[];

  // ─── Previous period for comparison ───
  let prevFromDate: string | null = null;
  let prevToDate: string | null = null;
  if (fromDate) {
    const from = new Date(fromDate + "T12:00:00");
    const diff = now.getTime() - from.getTime();
    const prevEnd = new Date(from.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    prevFromDate = prevStart.toISOString().split("T")[0];
    prevToDate = prevEnd.toISOString().split("T")[0];
  }

  let prevRows: VendaRow[] = [];
  if (prevFromDate && prevToDate) {
    const { data: prevVendas } = await supabase
      .from("vendas")
      .select("id, data, produto, preco_vendido, custo, lucro, created_at, origem, tipo")
      .gte("data", prevFromDate)
      .lte("data", prevToDate)
      .limit(5000);
    prevRows = (prevVendas || []) as VendaRow[];
  }

  // ─── 1. Vendas por Dia da Semana ───
  const porDiaSemana: { dia: string; diaFull: string; vendas: number; faturamento: number; faturamentoMedio: number }[] = [];
  const diaSemanaMap: Record<number, { vendas: number; faturamento: number }> = {};
  for (let i = 0; i < 7; i++) diaSemanaMap[i] = { vendas: 0, faturamento: 0 };

  for (const v of rows) {
    if (!v.data) continue;
    const d = new Date(v.data + "T12:00:00");
    const dow = d.getDay();
    diaSemanaMap[dow].vendas += 1;
    diaSemanaMap[dow].faturamento += Number(v.preco_vendido) || 0;
  }

  // Order: Seg(1), Ter(2), Qua(3), Qui(4), Sex(5), Sab(6), Dom(0)
  const diaOrder = [1, 2, 3, 4, 5, 6, 0];
  for (const dow of diaOrder) {
    const d = diaSemanaMap[dow];
    porDiaSemana.push({
      dia: DIAS_SEMANA_LABELS[dow],
      diaFull: DIAS_SEMANA_FULL[dow],
      vendas: d.vendas,
      faturamento: d.faturamento,
      faturamentoMedio: d.vendas > 0 ? Math.round(d.faturamento / d.vendas) : 0,
    });
  }

  // ─── 2. Vendas por Hora do Dia ───
  const porHora: { hora: string; vendas: number }[] = [];
  const horaMap: Record<number, number> = {};
  for (let h = 8; h <= 21; h++) horaMap[h] = 0;

  for (const v of rows) {
    if (!v.created_at) continue;
    const d = new Date(v.created_at);
    const h = d.getHours();
    if (h >= 8 && h <= 21) horaMap[h] += 1;
  }

  for (let h = 8; h <= 21; h++) {
    porHora.push({ hora: `${h}h`, vendas: horaMap[h] || 0 });
  }

  // ─── 2b. Heatmap Dia da Semana × Hora do Dia ───
  // Matrix [dow][hour] com qtd de vendas. Util pra ver picos especificos
  // (ex: "sexta as 19h vende muito mais que segunda as 14h").
  const diaHoraMap: Record<number, Record<number, number>> = {};
  for (const dow of [0, 1, 2, 3, 4, 5, 6]) {
    diaHoraMap[dow] = {};
    for (let h = 8; h <= 21; h++) diaHoraMap[dow][h] = 0;
  }
  for (const v of rows) {
    if (!v.created_at) continue;
    const d = new Date(v.created_at);
    const dow = d.getDay();
    const h = d.getHours();
    if (h < 8 || h > 21) continue;
    diaHoraMap[dow][h] += 1;
  }
  const diaHora: { dia: string; diaFull: string; horas: { hora: number; vendas: number }[] }[] = [];
  for (const dow of diaOrder) {
    const horas: { hora: number; vendas: number }[] = [];
    for (let h = 8; h <= 21; h++) {
      horas.push({ hora: h, vendas: diaHoraMap[dow][h] });
    }
    diaHora.push({
      dia: DIAS_SEMANA_LABELS[dow],
      diaFull: DIAS_SEMANA_FULL[dow],
      horas,
    });
  }

  // ─── 3. Top Produtos por Periodo ───
  const produtoMap: Record<string, { qtd: number; receita: number }> = {};
  for (const v of rows) {
    const p = v.produto || "N/A";
    if (!produtoMap[p]) produtoMap[p] = { qtd: 0, receita: 0 };
    produtoMap[p].qtd += 1;
    produtoMap[p].receita += Number(v.preco_vendido) || 0;
  }

  const prevProdutoMap: Record<string, number> = {};
  for (const v of prevRows) {
    const p = v.produto || "N/A";
    prevProdutoMap[p] = (prevProdutoMap[p] || 0) + 1;
  }

  const topProdutos = Object.entries(produtoMap)
    .map(([produto, { qtd, receita }]) => {
      const prevQtd = prevProdutoMap[produto] || 0;
      const trend = prevQtd > 0 ? ((qtd - prevQtd) / prevQtd) * 100 : (qtd > 0 ? 100 : 0);
      return { produto, qtd, receita, prevQtd, trend };
    })
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 15);

  // ─── 4. Faturamento por Semana ───
  const semanaMap: Record<string, { faturamento: number; vendas: number; label: string }> = {};
  for (const v of rows) {
    if (!v.data) continue;
    const d = new Date(v.data + "T12:00:00");
    // Get ISO week start (Monday)
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.getFullYear(), d.getMonth(), diff);
    const key = weekStart.toISOString().split("T")[0];
    const label = weekStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

    if (!semanaMap[key]) semanaMap[key] = { faturamento: 0, vendas: 0, label };
    semanaMap[key].faturamento += Number(v.preco_vendido) || 0;
    semanaMap[key].vendas += 1;
  }

  const faturamentoSemanal = Object.entries(semanaMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => ({
      semana: v.label,
      faturamento: v.faturamento,
      vendas: v.vendas,
    }));

  // ─── 5. Top Produtos por Mes ───
  const MESES_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const mesProdutoMap: Record<string, Record<string, { qtd: number; receita: number }>> = {};

  for (const v of rows) {
    if (!v.data) continue;
    const d = new Date(v.data + "T12:00:00");
    const mesNum = d.getMonth() + 1;
    const ano = d.getFullYear();
    const key = `${ano}-${String(mesNum).padStart(2, "0")}`;
    const produto = v.produto || "N/A";

    if (!mesProdutoMap[key]) mesProdutoMap[key] = {};
    if (!mesProdutoMap[key][produto]) mesProdutoMap[key][produto] = { qtd: 0, receita: 0 };
    mesProdutoMap[key][produto].qtd += 1;
    mesProdutoMap[key][produto].receita += Number(v.preco_vendido) || 0;
  }

  const produtosPorMes = Object.entries(mesProdutoMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, produtos]) => {
      const [anoStr, mesStr] = key.split("-");
      const ano = parseInt(anoStr);
      const mesNum = parseInt(mesStr);
      const mes = `${MESES_LABELS[mesNum - 1]}/${ano}`;
      const top5 = Object.entries(produtos)
        .map(([produto, { qtd, receita }]) => ({ produto, qtd, receita }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 5);
      return { mes, mesNum, ano, produtos: top5 };
    });

  // ─── 6. KPIs ───
  // Melhor dia da semana
  const melhorDia = porDiaSemana.reduce((best, d) => d.faturamento > best.faturamento ? d : best, porDiaSemana[0]);

  // Horario de pico
  const totalVendasComHora = porHora.reduce((s, h) => s + h.vendas, 0);
  let picoInicio = 0;
  let picoFim = 0;
  let picoVendas = 0;
  // Sliding window of 2 hours
  for (let i = 0; i < porHora.length - 1; i++) {
    const soma = porHora[i].vendas + (porHora[i + 1]?.vendas || 0);
    if (soma > picoVendas) {
      picoVendas = soma;
      picoInicio = 8 + i;
      picoFim = 8 + i + 2;
    }
  }
  const picoPct = totalVendasComHora > 0 ? Math.round((picoVendas / totalVendasComHora) * 100) : 0;

  // Produto mais vendido
  const topProduto = topProdutos[0] || null;

  // Margem media
  const totalReceita = rows.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0);
  const totalCusto = rows.reduce((s, v) => s + (Number(v.custo) || 0), 0);
  const margemMedia = totalReceita > 0 ? ((totalReceita - totalCusto) / totalReceita) * 100 : 0;

  return NextResponse.json({
    porDiaSemana,
    porHora,
    diaHora,
    topProdutos,
    faturamentoSemanal,
    produtosPorMes,
    kpis: {
      melhorDia: {
        dia: melhorDia?.diaFull || "N/A",
        faturamento: melhorDia?.faturamento || 0,
        faturamentoMedio: melhorDia?.faturamentoMedio || 0,
      },
      horarioPico: {
        inicio: picoInicio,
        fim: picoFim,
        pct: picoPct,
        vendas: picoVendas,
      },
      produtoMaisVendido: topProduto ? {
        nome: topProduto.produto,
        qtd: topProduto.qtd,
        receita: topProduto.receita,
      } : null,
      margemMedia: Math.round(margemMedia * 10) / 10,
      totalVendas: rows.length,
      totalFaturamento: totalReceita,
    },
  });
}
