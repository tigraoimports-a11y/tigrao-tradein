// app/api/reports/mensal/route.ts — Gera e envia PDF mensal por email
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateWeeklyPDF, SemanaData, VendaSemana, GastoSemana, EstoqueItem } from "@/lib/pdf-report";
import { enviarRelatorioPDF } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { hojeISO, formatDateBR } from "@/lib/business-days";

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const REPORT_EMAIL = process.env.REPORT_EMAIL ?? "tigraoimports@gmail.com";

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getSegundaDaSemana(date: string): string {
  const d = new Date(date + "T12:00:00");
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - diff);
  return toISO(d);
}

function getDomingo(segunda: string): string {
  const d = new Date(segunda + "T12:00:00");
  d.setDate(d.getDate() + 6);
  return toISO(d);
}

// Retorna todas as semanas completas (seg-dom) dentro de um mês
function getSemanasDoMes(ano: number, mes: number): { inicio: string; fim: string }[] {
  const semanas: { inicio: string; fim: string }[] = [];

  // Primeiro dia do mês
  const primeiroDia = new Date(ano, mes - 1, 1, 12, 0, 0);
  // Último dia do mês
  const ultimoDia = new Date(ano, mes, 0, 12, 0, 0);

  // Encontrar primeira segunda-feira do mês (ou anterior)
  let seg = new Date(primeiroDia);
  const dow = seg.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  seg.setDate(seg.getDate() - diff); // volta pra segunda

  // Se a segunda ficou no mês anterior e o domingo correspondente não cobre nenhum dia do mês, pular
  const primeiroDom = new Date(seg);
  primeiroDom.setDate(primeiroDom.getDate() + 6);
  if (primeiroDom < primeiroDia) {
    seg.setDate(seg.getDate() + 7);
  }

  while (true) {
    const dom = new Date(seg);
    dom.setDate(dom.getDate() + 6);

    // Pelo menos parte da semana deve estar no mês
    if (seg > ultimoDia) break;

    semanas.push({
      inicio: toISO(seg),
      fim: toISO(dom),
    });

    seg.setDate(seg.getDate() + 7);
  }

  return semanas;
}

const MESES_PT = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const forceDate = searchParams.get("date");
    const noEmail = searchParams.get("no_email") === "1";

    const hoje = forceDate || hojeISO();

    // Mês anterior
    const d = new Date(hoje + "T12:00:00");
    d.setMonth(d.getMonth() - 1);
    const mesAnterior = d.getMonth() + 1;
    const anoAnterior = d.getFullYear();
    const nomeMes = MESES_PT[mesAnterior];

    // Semanas do mês anterior
    const semanasDefs = getSemanasDoMes(anoAnterior, mesAnterior);

    if (semanasDefs.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhuma semana encontrada" }, { status: 400 });
    }

    // Buscar estoque
    const { data: estoqueRaw } = await supabase
      .from("estoque")
      .select("produto, qnt, custo_unitario, categoria");
    const estoque: EstoqueItem[] = (estoqueRaw ?? []).map(e => ({
      produto: e.produto,
      quantidade: Number(e.qnt || 0),
      custo_unitario: Number(e.custo_unitario || 0),
      categoria: e.categoria || "",
    }));

    // Fetch data for each week
    const semanas: SemanaData[] = await Promise.all(
      semanasDefs.map(async (s, i) => {
        const [{ data: vendas }, { data: gastos }] = await Promise.all([
          supabase
            .from("vendas")
            .select("data, cliente, produto, preco_vendido, custo, lucro, tipo, origem, forma, banco, qnt_parcelas, status_pagamento")
            .gte("data", s.inicio)
            .lte("data", s.fim)
            .neq("status_pagamento", "CANCELADO"),
          supabase
            .from("gastos")
            .select("data, valor, tipo, categoria, descricao, banco")
            .gte("data", s.inicio)
            .lte("data", s.fim),
        ]);

        return {
          label: `SEMANA ${i + 1}: ${formatDateBR(s.inicio)} a ${formatDateBR(s.fim)}`,
          inicio: s.inicio,
          fim: s.fim,
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
      })
    );

    // Generate PDF
    const pdfBuffer = await generateWeeklyPDF({
      titulo: "TIGRAOIMPORTS",
      subtitulo: `${nomeMes} ${anoAnterior}`,
      semanas,
      comparativo: semanas.length >= 2,
    });

    const periodo = `${nomeMes} ${anoAnterior}`;

    if (!noEmail) {
      await enviarRelatorioPDF({
        to: REPORT_EMAIL,
        subject: `📊 Relatório Mensal TigrãoImports — ${periodo}`,
        body: `
          <h2>📊 Relatório Mensal — TigrãoImports</h2>
          <p>Mês: <b>${periodo}</b></p>
          <p>${semanas.length} semanas analisadas com gráficos e comparativos.</p>
          <p>PDF em anexo.</p>
          <br>
          <p style="color: #999; font-size: 12px;">Gerado automaticamente pelo sistema TigrãoImports.</p>
        `,
        pdfBuffer,
        filename: `tigrao_mensal_${anoAnterior}_${String(mesAnterior).padStart(2, "0")}.pdf`,
      });

      if (TELEGRAM_CHAT_ID) {
        const totalVendas = semanas.reduce((s, sem) => s + sem.vendas.length, 0);
        await sendTelegramMessage(
          `📊 <b>Relatório Mensal enviado!</b>\n\n` +
          `Mês: ${periodo}\n` +
          `${semanas.length} semanas | ${totalVendas} vendas\n` +
          `Enviado para: ${REPORT_EMAIL}`,
          TELEGRAM_CHAT_ID
        );
      }
    }

    if (noEmail) {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="tigrao_mensal_${anoAnterior}_${mesAnterior}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      periodo,
      semanas: semanas.length,
      totalVendas: semanas.reduce((s, sem) => s + sem.vendas.length, 0),
    });
  } catch (err) {
    console.error("Report mensal error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
