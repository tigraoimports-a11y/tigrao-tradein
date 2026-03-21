// app/api/admin/exportar/route.ts — Exporta dados do mês em Excel para o contador
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes"); // Formato: YYYY-MM

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: "Parâmetro 'mes' obrigatório no formato YYYY-MM" }, { status: 400 });
  }

  const dataInicio = `${mes}-01`;
  // Calcular último dia do mês corretamente
  const [year, month] = mes.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate(); // dia 0 do próximo mês = último dia deste mês
  const dataFim = `${mes}-${String(lastDay).padStart(2, "0")}`;

  try {
    // Fetch vendas e gastos do mês em paralelo
    const [{ data: vendas, error: errVendas }, { data: gastos, error: errGastos }] = await Promise.all([
      supabase
        .from("vendas")
        .select("data, cliente, produto, preco_vendido, custo, lucro, margem_pct, forma, banco, origem, status_pagamento, tipo, qnt_parcelas, bandeira")
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data", { ascending: true }),
      supabase
        .from("gastos")
        .select("data, descricao, valor, categoria, banco, tipo")
        .gte("data", dataInicio)
        .lte("data", dataFim)
        .order("data", { ascending: true }),
    ]);

    if (errVendas) throw new Error(`Erro ao buscar vendas: ${errVendas.message}`);
    if (errGastos) throw new Error(`Erro ao buscar gastos: ${errGastos.message}`);

    const vendasRows = (vendas ?? []).map(v => ({
      Data: formatDateBR(v.data),
      Cliente: v.cliente || "",
      Produto: v.produto || "",
      "Preço Venda": Number(v.preco_vendido || 0),
      Custo: Number(v.custo || 0),
      Lucro: Number(v.lucro || 0),
      "Margem%": Number(v.margem_pct || 0),
      "Forma Pgto": formatForma(v.forma, v.qnt_parcelas, v.bandeira),
      Banco: formatBanco(v.banco),
      Origem: v.origem || "",
      Status: v.status_pagamento || "FINALIZADO",
    }));

    const gastosRows = (gastos ?? []).map(g => ({
      Data: formatDateBR(g.data),
      Descrição: g.descricao || "",
      Valor: Number(g.valor || 0),
      Categoria: g.categoria || "",
      "Forma Pgto": g.banco ? formatBanco(g.banco) : "",
    }));

    // Calcular resumo
    const totalVendasQty = vendasRows.length;
    const totalVendasValor = vendasRows.reduce((s, v) => s + v["Preço Venda"], 0);
    const totalCusto = vendasRows.reduce((s, v) => s + v.Custo, 0);
    const totalLucro = vendasRows.reduce((s, v) => s + v.Lucro, 0);
    const totalGastos = gastosRows.reduce((s, g) => s + g.Valor, 0);
    const lucroLiquido = totalLucro - totalGastos;
    const margemMedia = totalVendasQty > 0
      ? vendasRows.reduce((s, v) => s + v["Margem%"], 0) / totalVendasQty
      : 0;

    // Top 5 produtos vendidos
    const porProduto: Record<string, { qty: number; fat: number; lucro: number }> = {};
    for (const v of vendasRows) {
      const p = v.Produto || "Desconhecido";
      if (!porProduto[p]) porProduto[p] = { qty: 0, fat: 0, lucro: 0 };
      porProduto[p].qty++;
      porProduto[p].fat += v["Preço Venda"];
      porProduto[p].lucro += v.Lucro;
    }
    const top5 = Object.entries(porProduto)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5);

    const resumoRows = [
      { Indicador: "Total de Vendas (qtd)", Valor: totalVendasQty },
      { Indicador: "Faturamento Total", Valor: totalVendasValor },
      { Indicador: "Custo Total", Valor: totalCusto },
      { Indicador: "Lucro Bruto", Valor: totalLucro },
      { Indicador: "Total Gastos", Valor: totalGastos },
      { Indicador: "Lucro Líquido (Vendas - Gastos)", Valor: lucroLiquido },
      { Indicador: "Margem Média (%)", Valor: Math.round(margemMedia * 10) / 10 },
      { Indicador: "", Valor: "" },
      { Indicador: "TOP 5 PRODUTOS VENDIDOS", Valor: "" },
      ...top5.map(([nome, info], i) => ({
        Indicador: `${i + 1}. ${nome}`,
        Valor: `${info.qty}x — Fat: R$ ${Math.round(info.fat).toLocaleString("pt-BR")} — Lucro: R$ ${Math.round(info.lucro).toLocaleString("pt-BR")}`,
      })),
    ];

    // Montar workbook
    const wb = XLSX.utils.book_new();

    // Sheet 1: Vendas
    const wsVendas = XLSX.utils.json_to_sheet(vendasRows);
    setColumnWidths(wsVendas, [12, 25, 35, 15, 15, 15, 10, 20, 15, 15, 15]);
    XLSX.utils.book_append_sheet(wb, wsVendas, "Vendas");

    // Sheet 2: Gastos
    const wsGastos = XLSX.utils.json_to_sheet(gastosRows);
    setColumnWidths(wsGastos, [12, 40, 15, 20, 15]);
    XLSX.utils.book_append_sheet(wb, wsGastos, "Gastos");

    // Sheet 3: Resumo
    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    setColumnWidths(wsResumo, [35, 50]);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    // Gerar buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const mesLabel = mes.replace("-", "");
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tigrao-${mesLabel}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Helpers

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatBanco(banco: string): string {
  const map: Record<string, string> = {
    ITAU: "Itaú",
    INFINITE: "InfinitePay",
    MERCADO_PAGO: "Mercado Pago",
    ESPECIE: "Espécie",
  };
  return map[banco] || banco || "";
}

function formatForma(forma: string, parcelas: number | null, bandeira: string | null): string {
  if (!forma) return "";
  if (forma === "PIX") return "PIX";
  if (forma === "DINHEIRO" || forma === "ESPECIE") return "Dinheiro";
  if (forma === "CARTAO") {
    const parc = parcelas && parcelas > 1 ? `${parcelas}x` : "1x";
    const band = bandeira ? ` ${bandeira}` : "";
    return `Cartão ${parc}${band}`;
  }
  return forma;
}

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map(w => ({ wch: w }));
}
