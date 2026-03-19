// app/api/reports/semanal/route.ts — Gera e envia PDF semanal por email
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateWeeklyPDF, SemanaData, VendaSemana, GastoSemana, EstoqueItem } from "@/lib/pdf-report";
import { enviarRelatorioPDF } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
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

async function fetchSemanaData(inicio: string, fim: string, semanaNum: number, estoque: EstoqueItem[]): Promise<SemanaData> {
  const [{ data: vendas }, { data: gastos }] = await Promise.all([
    supabase
      .from("vendas")
      .select("data, cliente, produto, preco_vendido, custo, lucro, tipo, origem, forma, banco, parcelas, status_pagamento")
      .gte("data", inicio)
      .lte("data", fim)
      .neq("status_pagamento", "CANCELADO"),
    supabase
      .from("gastos")
      .select("data, valor, tipo, categoria, descricao, banco")
      .gte("data", inicio)
      .lte("data", fim),
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
      parcelas: Number(v.parcelas || 0),
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
      .select("produto, quantidade, custo_unitario, categoria");
    const estoque: EstoqueItem[] = (estoqueRaw ?? []).map(e => ({
      produto: e.produto,
      quantidade: Number(e.quantidade || 0),
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

    if (!noEmail) {
      // Send email
      await enviarRelatorioPDF({
        to: REPORT_EMAIL,
        subject: `📊 Relatório Semanal TigrãoImports — ${formatDateBR(segundaPassada)} a ${formatDateBR(domingoPassado)}`,
        body: `
          <h2>📊 Relatório Semanal — TigrãoImports</h2>
          <p>Período: <b>${formatDateBR(segundaPassada)} a ${formatDateBR(domingoPassado)}</b></p>
          <p>PDF em anexo com gráficos e detalhamento completo.</p>
          <br>
          <p style="color: #999; font-size: 12px;">Gerado automaticamente pelo sistema TigrãoImports.</p>
        `,
        pdfBuffer,
        filename: `tigrao_semanal_${segundaPassada}_a_${domingoPassado}.pdf`,
      });

      // Notify on Telegram
      if (TELEGRAM_CHAT_ID) {
        await sendTelegramMessage(
          `📊 <b>Relatório Semanal enviado!</b>\n\n` +
          `Período: ${formatDateBR(segundaPassada)} a ${formatDateBR(domingoPassado)}\n` +
          `Enviado para: ${REPORT_EMAIL}\n\n` +
          `Vendas S1: ${semana1.vendas.length} | S2: ${semana2.vendas.length}`,
          TELEGRAM_CHAT_ID
        );
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

    return NextResponse.json({
      ok: true,
      periodo: `${segundaPassada} a ${domingoPassado}`,
      vendasS1: semana1.vendas.length,
      vendasS2: semana2.vendas.length,
    });
  } catch (err) {
    console.error("Report semanal error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
