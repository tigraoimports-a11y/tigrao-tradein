// app/api/reports/semanal/route.ts — Gera e envia PDF semanal por email + Telegram
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateWeeklyPDF, SemanaData, VendaSemana, GastoSemana, EstoqueItem } from "@/lib/pdf-report";
import { enviarRelatorioPDF } from "@/lib/email";
import { sendTelegramMessage, sendTelegramDocument } from "@/lib/telegram";
import { hojeISO, formatDateBR } from "@/lib/business-days";

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const REPORT_EMAIL = process.env.REPORT_EMAIL ?? "tigraoimports@gmail.com";

// Achar a segunda-feira anterior (início da semana)
function getSegundaAnterior(date: string): string {
  const d = new Date(date + "T12:00:00");
  const dayOfWeek = d.getDay(); // 0=Dom, 1=Seg, ...
  // Se for segunda, pegar a semana anterior
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - diff);
  // Essa é a segunda da semana atual, pegar a anterior
  d.setDate(d.getDate() - 7);
  return toISO(d);
}

function getDomingo(segunda: string): string {
  const d = new Date(segunda + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return toISO(d);
}

function getSegundaDaSemana(date: string): string {
  const d = new Date(date + "T12:00:00");
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getNumeroSemana(inicio: string, mesInicio: string): number {
  // Conta quantas semanas desde o início do mês
  const d = new Date(inicio + "T12:00:00");
  const m = new Date(mesInicio + "T12:00:00");
  const diff = Math.floor((d.getTime() - m.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return diff + 1;
}

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function fmtDelta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100%" : "0%";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// Compute enhanced stats for Telegram summary
function computeEnhancedStats(sem: SemanaData) {
  const v = sem.vendas;
  const g = sem.gastos;

  const fat = v.reduce((s, x) => s + Number(x.preco_vendido || 0), 0);
  const lucro = v.reduce((s, x) => s + Number(x.lucro || 0), 0);
  const margem = fat > 0 ? (lucro / fat) * 100 : 0;
  const ticket = v.length > 0 ? fat / v.length : 0;
  const gastos = g.filter(x => x.tipo === "SAIDA").reduce((s, x) => s + Number(x.valor || 0), 0);
  const lucroLiquido = lucro - gastos;

  // Top 3 mais vendidos (por quantidade)
  const porProdutoQty: Record<string, { qty: number; fat: number; lucro: number }> = {};
  for (const x of v) {
    const p = x.produto || "Desconhecido";
    if (!porProdutoQty[p]) porProdutoQty[p] = { qty: 0, fat: 0, lucro: 0 };
    porProdutoQty[p].qty++;
    porProdutoQty[p].fat += Number(x.preco_vendido || 0);
    porProdutoQty[p].lucro += Number(x.lucro || 0);
  }
  const top3Vendidos = Object.entries(porProdutoQty)
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 3);

  // Top 3 mais lucrativos (por lucro total)
  const top3Lucrativos = Object.entries(porProdutoQty)
    .sort((a, b) => b[1].lucro - a[1].lucro)
    .slice(0, 3);

  // Por categoria (inferida do produto — iPhones, iPads, etc.)
  const porCategoria: Record<string, { qty: number; fat: number; lucro: number }> = {};
  for (const x of v) {
    const prod = (x.produto || "").toUpperCase();
    let cat = "Outros";
    if (prod.includes("IPHONE")) cat = "iPhones";
    else if (prod.includes("IPAD")) cat = "iPads";
    else if (prod.includes("MACBOOK") || prod.includes("MAC")) cat = "MacBooks";
    else if (prod.includes("WATCH")) cat = "Apple Watch";
    else if (prod.includes("AIRPOD")) cat = "AirPods";

    if (!porCategoria[cat]) porCategoria[cat] = { qty: 0, fat: 0, lucro: 0 };
    porCategoria[cat].qty++;
    porCategoria[cat].fat += Number(x.preco_vendido || 0);
    porCategoria[cat].lucro += Number(x.lucro || 0);
  }

  return {
    vendas: v.length, fat, lucro, margem, ticket, gastos, lucroLiquido,
    top3Vendidos, top3Lucrativos, porCategoria,
  };
}

function buildTelegramSummary(
  semanaAtual: SemanaData,
  semanaAnterior: SemanaData,
  periodo: string,
): string {
  const atual = computeEnhancedStats(semanaAtual);
  const anterior = computeEnhancedStats(semanaAnterior);

  const lines: string[] = [
    `📊 <b>RELATÓRIO SEMANAL — TigrãoImports</b>`,
    `📅 ${periodo}`,
    ``,
    `📈 <b>Resumo da Semana:</b>`,
    `• Vendas: <b>${atual.vendas}</b> (${fmtDelta(atual.vendas, anterior.vendas)})`,
    `• Faturamento: <b>${fmtBRL(atual.fat)}</b> (${fmtDelta(atual.fat, anterior.fat)})`,
    `• Lucro bruto: <b>${fmtBRL(atual.lucro)}</b> (${fmtDelta(atual.lucro, anterior.lucro)})`,
    `• Margem média: <b>${fmtPct(atual.margem)}</b> (${fmtDelta(atual.margem, anterior.margem)})`,
    `• Ticket médio: <b>${fmtBRL(atual.ticket)}</b>`,
    `• Gastos: <b>${fmtBRL(atual.gastos)}</b>`,
    `• Lucro líquido: <b>${fmtBRL(atual.lucroLiquido)}</b>`,
  ];

  // Top 3 mais vendidos
  if (atual.top3Vendidos.length > 0) {
    lines.push(``, `🏆 <b>Top 3 Mais Vendidos:</b>`);
    atual.top3Vendidos.forEach(([nome, info], i) => {
      lines.push(`  ${i + 1}. ${nome} — ${info.qty}x (${fmtBRL(info.fat)})`);
    });
  }

  // Top 3 mais lucrativos
  if (atual.top3Lucrativos.length > 0) {
    lines.push(``, `💰 <b>Top 3 Mais Lucrativos:</b>`);
    atual.top3Lucrativos.forEach(([nome, info], i) => {
      lines.push(`  ${i + 1}. ${nome} — Lucro: ${fmtBRL(info.lucro)} (${info.qty}x)`);
    });
  }

  // Categorias
  const cats = Object.entries(atual.porCategoria).sort((a, b) => b[1].fat - a[1].fat);
  if (cats.length > 0) {
    lines.push(``, `📦 <b>Por Categoria:</b>`);
    for (const [cat, info] of cats) {
      lines.push(`  • ${cat}: ${info.qty}x — ${fmtBRL(info.fat)} (Lucro: ${fmtBRL(info.lucro)})`);
    }
  }

  // Comparativo semana anterior
  lines.push(``, `🔄 <b>vs Semana Anterior:</b>`);
  const deltaVendas = atual.vendas - anterior.vendas;
  const deltaFat = atual.fat - anterior.fat;
  const deltaLucro = atual.lucro - anterior.lucro;
  lines.push(`  • Vendas: ${deltaVendas >= 0 ? "+" : ""}${deltaVendas}`);
  lines.push(`  • Faturamento: ${deltaFat >= 0 ? "+" : ""}${fmtBRL(deltaFat)}`);
  lines.push(`  • Lucro: ${deltaLucro >= 0 ? "+" : ""}${fmtBRL(deltaLucro)}`);

  lines.push(``, `📎 PDF em anexo com gráficos completos.`);

  return lines.join("\n");
}

async function fetchSemanaData(inicio: string, fim: string, semanaNum: number, estoque: EstoqueItem[]): Promise<SemanaData> {
  const [{ data: vendas }, { data: gastos }] = await Promise.all([
    supabase
      .from("vendas")
      .select("data, cliente, produto, preco_vendido, custo, lucro, tipo, origem, forma, banco, qnt_parcelas, status_pagamento")
      .gte("data", inicio)
      .lte("data", fim)
      .neq("status_pagamento", "CANCELADO"),
    supabase
      .from("gastos")
      .select("data, valor, tipo, categoria, descricao, banco, is_dep_esp")
      .gte("data", inicio)
      .lte("data", fim)
      .or("is_dep_esp.is.null,is_dep_esp.eq.false"),
  ]);

  return {
    label: `SEMANA ${semanaNum}: ${formatDateBR(inicio)} a ${formatDateBR(fim)}`,
    inicio,
    fim,
    vendas: (vendas ?? []).map(v => ({
      ...v,
      preco_vendido: Number(v.preco_vendido || 0),
      custo: Number(v.custo || 0),
      lucro: Number(v.lucro || 0),
      parcelas: Number(v.qnt_parcelas || 0),
    })) as VendaSemana[],
    gastos: (gastos ?? []).map(g => ({
      ...g,
      valor: Number(g.valor || 0),
    })) as GastoSemana[],
    estoque,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceDate = searchParams.get("date"); // Para testes: ?date=2026-03-19
    const noEmail = searchParams.get("no_email") === "1"; // Para testes

    const hoje = forceDate || hojeISO();

    // Semana passada: segunda anterior até domingo
    const segundaPassada = getSegundaAnterior(hoje);
    const domingoPassado = getDomingo(segundaPassada);

    // Semana retrasada (para comparativo)
    const d = new Date(segundaPassada + "T12:00:00");
    d.setDate(d.getDate() - 7);
    const segundaRetrasada = toISO(d);
    const domingoRetrasado = getDomingo(segundaRetrasada);

    // Buscar estoque atual
    const { data: estoqueRaw } = await supabase
      .from("estoque")
      .select("produto, qnt, custo_unitario, categoria");
    const estoque: EstoqueItem[] = (estoqueRaw ?? []).map(e => ({
      produto: e.produto,
      quantidade: Number(e.qnt || 0),
      custo_unitario: Number(e.custo_unitario || 0),
      categoria: e.categoria || "",
    }));

    // Calcular número da semana no mês
    const mesInicio = segundaPassada.substring(0, 8) + "01";
    // Encontrar a primeira segunda do mês
    const primeiroDia = new Date(mesInicio + "T12:00:00");
    const primeiraSegunda = getSegundaDaSemana(toISO(primeiroDia));
    const semanaNum1 = getNumeroSemana(segundaRetrasada, primeiraSegunda);
    const semanaNum2 = getNumeroSemana(segundaPassada, primeiraSegunda);

    // Fetch data for both weeks
    const [semana1, semana2] = await Promise.all([
      fetchSemanaData(segundaRetrasada, domingoRetrasado, Math.max(semanaNum1, 1), estoque),
      fetchSemanaData(segundaPassada, domingoPassado, Math.max(semanaNum2, 1), estoque),
    ]);

    // Generate PDF
    const pdfBuffer = await generateWeeklyPDF({
      titulo: "TIGRAOIMPORTS",
      subtitulo: `Relatório Semanal`,
      semanas: [semana1, semana2],
      comparativo: true,
    });

    const periodo = `${formatDateBR(segundaPassada)} a ${formatDateBR(domingoPassado)}`;
    const filename = `tigrao_semanal_${segundaPassada}_a_${domingoPassado}.pdf`;

    if (!noEmail) {
      // Send email
      await enviarRelatorioPDF({
        to: REPORT_EMAIL,
        subject: `📊 Relatório Semanal TigrãoImports — ${periodo}`,
        body: `
          <h2>📊 Relatório Semanal — TigrãoImports</h2>
          <p>Período: <b>${periodo}</b></p>
          <p>PDF em anexo com gráficos e detalhamento completo.</p>
          <br>
          <p style="color: #999; font-size: 12px;">Gerado automaticamente pelo sistema TigrãoImports.</p>
        `,
        pdfBuffer,
        filename,
      });

      // Send PDF to Telegram + summary message
      if (TELEGRAM_CHAT_ID) {
        const summary = buildTelegramSummary(semana2, semana1, periodo);

        // Send PDF document first
        await sendTelegramDocument(
          pdfBuffer,
          filename,
          `📊 Relatório Semanal — ${periodo}`,
          TELEGRAM_CHAT_ID
        );

        // Then send detailed text summary
        await sendTelegramMessage(summary, TELEGRAM_CHAT_ID);
      }
    }

    // If no_email, return the PDF directly for preview
    if (noEmail) {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="tigrao_semanal.pdf"`,
        },
      });
    }

    // Enhanced response with stats
    const stats = computeEnhancedStats(semana2);
    const prevStats = computeEnhancedStats(semana1);

    return NextResponse.json({
      ok: true,
      periodo,
      vendasS1: semana1.vendas.length,
      vendasS2: semana2.vendas.length,
      stats: {
        vendas: stats.vendas,
        faturamento: stats.fat,
        lucro: stats.lucro,
        margem: stats.margem,
        gastos: stats.gastos,
        lucroLiquido: stats.lucroLiquido,
        top3Vendidos: stats.top3Vendidos.map(([nome, info]) => ({ nome, qty: info.qty, fat: info.fat })),
        top3Lucrativos: stats.top3Lucrativos.map(([nome, info]) => ({ nome, lucro: info.lucro, qty: info.qty })),
        categorias: Object.entries(stats.porCategoria).map(([cat, info]) => ({ cat, ...info })),
      },
      comparativo: {
        deltaVendas: fmtDelta(stats.vendas, prevStats.vendas),
        deltaFat: fmtDelta(stats.fat, prevStats.fat),
        deltaLucro: fmtDelta(stats.lucro, prevStats.lucro),
        deltaMargem: fmtDelta(stats.margem, prevStats.margem),
      },
    });
  } catch (err) {
    console.error("Report semanal error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
