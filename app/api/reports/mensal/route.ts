// app/api/reports/mensal/route.ts — Gera e envia PDF mensal completo por email
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateMonthlyPDF, type VendaSemana, type GastoSemana } from "@/lib/pdf-report";
import { enviarRelatorioPDF } from "@/lib/email";
import { sendTelegramMessage } from "@/lib/telegram";
import { hojeISO } from "@/lib/business-days";

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";
const REPORT_EMAIL = process.env.REPORT_EMAIL ?? "tigraoimports@gmail.com";

const MESES_PT = [
  "", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const noEmail = searchParams.get("no_email") === "1";
    const mesParam = searchParams.get("mes"); // YYYY-MM (optional, defaults to last month)

    let ano: number, mes: number;
    if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
      [ano, mes] = mesParam.split("-").map(Number);
    } else {
      // Default: mês anterior
      const d = new Date(hojeISO() + "T12:00:00");
      d.setMonth(d.getMonth() - 1);
      mes = d.getMonth() + 1;
      ano = d.getFullYear();
    }

    const nomeMes = MESES_PT[mes];
    const dataInicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const lastDay = new Date(ano, mes, 0).getDate();
    const dataFim = `${ano}-${String(mes).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // Fetch vendas e gastos
    const [{ data: vendas }, { data: gastos }] = await Promise.all([
      supabase
        .from("vendas")
        .select("data, cliente, produto, preco_vendido, custo, lucro, tipo, origem, forma, banco, qnt_parcelas, status_pagamento, bairro, local, produto_na_troca")
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data"),
      supabase
        .from("gastos")
        .select("data, valor, tipo, categoria, descricao, banco")
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data"),
    ]);

    const vendasTyped: VendaSemana[] = (vendas ?? []).map(v => ({
      data: v.data,
      cliente: v.cliente || "",
      produto: v.produto || "",
      preco_vendido: Number(v.preco_vendido || 0),
      custo: Number(v.custo || 0),
      lucro: Number(v.lucro || 0),
      tipo: v.tipo || "VENDA",
      origem: v.origem || "",
      forma: v.forma || "",
      banco: v.banco || "",
      parcelas: Number(v.qnt_parcelas || 0),
      status_pagamento: v.status_pagamento || "",
    }));

    const gastosTyped: GastoSemana[] = (gastos ?? []).map(g => ({
      data: g.data,
      valor: Number(g.valor || 0),
      tipo: g.tipo || "",
      categoria: g.categoria || "",
      descricao: g.descricao || "",
      banco: g.banco || "",
    }));

    // Calcular retirada (gastos SALARIO com "RETIRADA" na descrição)
    const retirada = gastosTyped
      .filter(g => g.categoria === "SALARIO" && g.descricao?.toUpperCase().includes("RETIRADA"))
      .reduce((s, g) => s + g.valor, 0);

    // Buscar patrimônio do mês seguinte (início do próximo mês)
    const mesSeguinte = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
    const { data: patrimonioData } = await supabase
      .from("patrimonio_mensal")
      .select("estoque_base, saldos_base")
      .eq("mes", mesSeguinte)
      .single();

    // Buscar saldo base do primeiro dia do mês seguinte
    const primeiroDiaSeguinte = `${mesSeguinte}-01`;
    const { data: saldoData } = await supabase
      .from("saldos_bancarios")
      .select("itau_base, inf_base, mp_base, esp_especie_base")
      .eq("data", primeiroDiaSeguinte)
      .single();

    const patrimonio = saldoData ? {
      produtos: patrimonioData?.estoque_base || 0,
      itau: saldoData.itau_base || 0,
      infinite: saldoData.inf_base || 0,
      mp: saldoData.mp_base || 0,
      especie: saldoData.esp_especie_base || 0,
    } : undefined;

    // Generate PDF
    const pdfBuffer = await generateMonthlyPDF({
      mes: `${nomeMes} ${ano}`,
      vendas: vendasTyped,
      gastos: gastosTyped,
      patrimonio,
      retiradaLucro: retirada,
    });

    const periodo = `${nomeMes} ${ano}`;
    const totalVendas = vendasTyped.length;
    const totalLucro = vendasTyped.reduce((s, v) => s + v.lucro, 0);

    if (!noEmail) {
      await enviarRelatorioPDF({
        to: REPORT_EMAIL,
        subject: `📊 Relatório Mensal TigrãoImports — ${periodo}`,
        body: `
          <h2>📊 Relatório Mensal — TigrãoImports</h2>
          <p>Mês: <b>${periodo}</b></p>
          <p>${totalVendas} vendas | Lucro: R$ ${Math.round(totalLucro).toLocaleString("pt-BR")}</p>
          <p>PDF completo em anexo com top clientes, regiões, DRE e mais.</p>
          <br>
          <p style="color: #999; font-size: 12px;">Gerado automaticamente pelo sistema TigrãoImports.</p>
        `,
        pdfBuffer,
        filename: `tigrao_mensal_${ano}_${String(mes).padStart(2, "0")}.pdf`,
      });

      if (TELEGRAM_CHAT_ID) {
        await sendTelegramMessage(
          `📊 <b>Relatório Mensal enviado!</b>\n\n` +
          `Mês: ${periodo}\n` +
          `${totalVendas} vendas | Lucro: R$ ${Math.round(totalLucro).toLocaleString("pt-BR")}\n` +
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
          "Content-Disposition": `inline; filename="tigrao_mensal_${ano}_${mes}.pdf"`,
        },
      });
    }

    return NextResponse.json({ ok: true, periodo, totalVendas });
  } catch (err) {
    console.error("Report mensal error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
