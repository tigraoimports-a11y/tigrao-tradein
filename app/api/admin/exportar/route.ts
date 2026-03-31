// app/api/admin/exportar/route.ts — Exporta vendas em Excel (por dia ou por mês)
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
  const dia = searchParams.get("dia"); // Formato: YYYY-MM-DD

  // Determinar range de datas
  let dataInicio: string;
  let dataFim: string;
  let fileLabel: string;
  let isDaily = false;

  if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    dataInicio = dia;
    dataFim = dia;
    fileLabel = dia.replace(/-/g, "");
    isDaily = true;
  } else if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    dataInicio = `${mes}-01`;
    const [year, month] = mes.split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    dataFim = `${mes}-${String(lastDay).padStart(2, "0")}`;
    fileLabel = mes.replace("-", "");
  } else {
    return NextResponse.json({ error: "Parâmetro 'mes' (YYYY-MM) ou 'dia' (YYYY-MM-DD) obrigatório" }, { status: 400 });
  }

  try {
    // Fetch vendas e gastos em paralelo
    const vendasQuery = supabase
      .from("vendas")
      .select("data, cliente, cpf, email, produto, preco_vendido, custo, lucro, margem_pct, forma, banco, origem, status_pagamento, tipo, qnt_parcelas, bandeira, local, serial_no, imei, produto_na_troca, produto_na_troca2, troca_produto, troca_cor, troca_bateria, troca_obs, troca_produto2, troca_cor2, troca_bateria2, troca_obs2, entrada_pix, entrada_especie, sinal_antecipado, banco_alt, parc_alt, band_alt, comp_alt, endereco, bairro, cidade, uf, cep, notas, grupo_id")
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: true });

    const gastosQuery = supabase
      .from("gastos")
      .select("data, descricao, valor, categoria, banco, tipo")
      .gte("data", dataInicio)
      .lte("data", dataFim)
      .order("data", { ascending: true });

    const [{ data: vendas, error: errVendas }, { data: gastos, error: errGastos }] = await Promise.all([
      vendasQuery,
      gastosQuery,
    ]);

    if (errVendas) throw new Error(`Erro ao buscar vendas: ${errVendas.message}`);
    if (errGastos) throw new Error(`Erro ao buscar gastos: ${errGastos.message}`);

    // Parsear valor de troca (pode ser string "R$ 1.200,00" ou número)
    const parseTroca = (val: unknown): number => {
      if (!val) return 0;
      if (typeof val === "number") return val;
      const s = String(val).replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    };

    // Montar info de troca (produto + detalhes)
    const buildTrocaDesc = (produto: string | null, cor: string | null, bat: string | null, obs: string | null): string => {
      if (!produto) return "";
      let desc = produto;
      if (cor) desc += ` ${cor}`;
      if (bat) desc += ` | Bat: ${bat}%`;
      if (obs) desc += ` | ${obs}`;
      return desc;
    };

    // Montar rows de vendas — organizado e limpo
    const vendasRows = (vendas ?? []).map(v => {
      const trocaVal1 = parseTroca(v.produto_na_troca);
      const trocaVal2 = parseTroca(v.produto_na_troca2);
      const trocaDesc1 = buildTrocaDesc(v.troca_produto, v.troca_cor, v.troca_bateria, v.troca_obs);
      const trocaDesc2 = buildTrocaDesc(v.troca_produto2, v.troca_cor2, v.troca_bateria2, v.troca_obs2);
      const temTraoca = trocaVal1 > 0 || trocaDesc1;

      return {
        // Dados principais
        Data: formatDateBR(v.data),
        Cliente: v.cliente || "",
        Produto: v.produto || "",
        Tipo: v.tipo || "VENDA",
        // Financeiro
        "Preco Venda": num(v.preco_vendido),
        Custo: num(v.custo),
        Lucro: num(v.lucro),
        "Margem%": num(v.margem_pct),
        // Pagamento
        "Forma Pgto": formatForma(v.forma, v.qnt_parcelas, v.bandeira),
        Banco: formatBanco(v.banco),
        // Troca
        "Troca 1": trocaDesc1,
        "Valor Troca 1": trocaVal1 || "",
        "Troca 2": trocaDesc2,
        "Valor Troca 2": trocaVal2 || "",
        // Cliente
        CPF: v.cpf || "",
        "E-mail": v.email || "",
        Endereco: v.endereco || "",
        Bairro: v.bairro || "",
        CEP: v.cep || "",
        // Venda
        Local: v.local || "",
        Origem: v.origem || "",
        Serial: v.serial_no || v.imei || "",
        Status: v.status_pagamento || "FINALIZADO",
      };
    });

    const gastosRows = (gastos ?? []).map(g => ({
      Data: formatDateBR(g.data),
      Descricao: g.descricao || "",
      Valor: num(g.valor),
      Categoria: g.categoria || "",
      "Forma Pgto": g.banco ? formatBanco(g.banco) : "",
    }));

    // Calcular resumo
    const totalVendasQty = vendasRows.length;
    const totalVendasValor = vendasRows.reduce((s, v) => s + (Number(v["Preco Venda"]) || 0), 0);
    const totalCusto = vendasRows.reduce((s, v) => s + (Number(v.Custo) || 0), 0);
    const totalLucro = vendasRows.reduce((s, v) => s + (Number(v.Lucro) || 0), 0);
    const totalGastos = gastosRows.reduce((s, g) => s + (Number(g.Valor) || 0), 0);
    const lucroLiquido = totalLucro - totalGastos;
    const margemMedia = totalVendasQty > 0
      ? vendasRows.reduce((s, v) => s + (Number(v["Margem%"]) || 0), 0) / totalVendasQty
      : 0;

    // Top 5 produtos
    const porProduto: Record<string, { qty: number; fat: number; lucro: number }> = {};
    for (const v of vendasRows) {
      const p = String(v.Produto || "Desconhecido");
      if (!porProduto[p]) porProduto[p] = { qty: 0, fat: 0, lucro: 0 };
      porProduto[p].qty++;
      porProduto[p].fat += Number(v["Preco Venda"]) || 0;
      porProduto[p].lucro += Number(v.Lucro) || 0;
    }
    const top5 = Object.entries(porProduto)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5);

    const fmtR = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
    const resumoRows = [
      { Indicador: "Total de Vendas (qtd)", Valor: String(totalVendasQty) },
      { Indicador: "Faturamento Total", Valor: fmtR(totalVendasValor) },
      { Indicador: "Custo Total", Valor: fmtR(totalCusto) },
      { Indicador: "Lucro Bruto", Valor: fmtR(totalLucro) },
      { Indicador: "Total Gastos", Valor: fmtR(totalGastos) },
      { Indicador: "Lucro Liquido (Vendas - Gastos)", Valor: fmtR(lucroLiquido) },
      { Indicador: "Margem Media (%)", Valor: `${(Math.round(margemMedia * 10) / 10)}%` },
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
    // Data, Cliente, Produto, Tipo, PrecoVenda, Custo, Lucro, Margem, FormaPgto, Banco, Troca1, ValTroca1, Troca2, ValTroca2, CPF, Email, Endereco, Bairro, CEP, Local, Origem, Serial, Status
    setColumnWidths(wsVendas, [11, 28, 38, 10, 13, 13, 12, 9, 22, 15, 30, 12, 30, 12, 16, 28, 35, 20, 11, 12, 14, 18, 12]);
    XLSX.utils.book_append_sheet(wb, wsVendas, "Vendas");

    // Sheet 2: Gastos
    if (gastosRows.length > 0) {
      const wsGastos = XLSX.utils.json_to_sheet(gastosRows);
      setColumnWidths(wsGastos, [12, 40, 15, 20, 15]);
      XLSX.utils.book_append_sheet(wb, wsGastos, "Gastos");
    }

    // Sheet 3: Resumo
    const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
    setColumnWidths(wsResumo, [35, 50]);
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo");

    // Gerar buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", bookSST: false });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="tigrao-${fileLabel}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("Export error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Helpers

function num(val: unknown): number {
  return Number(val || 0);
}

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatBanco(banco: string): string {
  const map: Record<string, string> = {
    ITAU: "Itau",
    INFINITE: "InfinitePay",
    MERCADO_PAGO: "Mercado Pago",
    ESPECIE: "Especie",
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
    return `Cartao ${parc}${band}`;
  }
  if (forma === "DEBITO") return "Debito";
  if (forma === "FIADO") return "Fiado";
  return forma;
}

function setColumnWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map(w => ({ wch: w }));
}
