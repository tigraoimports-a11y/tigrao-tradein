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

    // Montar rows de vendas (formato completo para dia e mês)
    const vendasRows = (vendas ?? []).map(v => {
      // Montar info de troca
      let trocaInfo = "";
      if (v.troca_produto) {
        trocaInfo = v.troca_produto;
        if (v.troca_cor) trocaInfo += ` ${v.troca_cor}`;
        if (v.troca_bateria) trocaInfo += ` | Bat: ${v.troca_bateria}%`;
        if (v.troca_obs) trocaInfo += ` | ${v.troca_obs}`;
      }
      let trocaInfo2 = "";
      if (v.troca_produto2) {
        trocaInfo2 = v.troca_produto2;
        if (v.troca_cor2) trocaInfo2 += ` ${v.troca_cor2}`;
        if (v.troca_bateria2) trocaInfo2 += ` | Bat: ${v.troca_bateria2}%`;
        if (v.troca_obs2) trocaInfo2 += ` | ${v.troca_obs2}`;
      }

      // Pagamento alternativo
      let pagAlt = "";
      if (v.banco_alt) {
        pagAlt = formatBanco(v.banco_alt);
        if (v.parc_alt) pagAlt += ` ${v.parc_alt}x`;
        if (v.band_alt) pagAlt += ` ${v.band_alt}`;
      }

      return {
        Data: formatDateBR(v.data),
        Cliente: v.cliente || "",
        CPF: v.cpf || "",
        "E-mail": v.email || "",
        Produto: v.produto || "",
        "Serial/IMEI": v.serial_no || v.imei || "",
        Tipo: v.tipo || "VENDA",
        "Preco Venda": num(v.preco_vendido),
        Custo: num(v.custo),
        Lucro: num(v.lucro),
        "Margem%": num(v.margem_pct),
        "Forma Pgto": formatForma(v.forma, v.qnt_parcelas, v.bandeira),
        Banco: formatBanco(v.banco),
        "Entrada PIX": num(v.entrada_pix),
        "Entrada Especie": num(v.entrada_especie),
        "Sinal Antecipado": num(v.sinal_antecipado),
        "Pgto Alternativo": pagAlt,
        "Valor Pgto Alt": num(v.comp_alt),
        "Troca 1": trocaInfo,
        "Valor Troca 1": num(v.produto_na_troca),
        "Troca 2": trocaInfo2,
        "Valor Troca 2": num(v.produto_na_troca2),
        Endereco: v.endereco || "",
        Bairro: v.bairro || "",
        CEP: v.cep || "",
        Cidade: v.cidade || "",
        UF: v.uf || "",
        Local: v.local || "",
        Origem: v.origem || "",
        Status: v.status_pagamento || "FINALIZADO",
        Obs: v.notas || "",
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

    const resumoRows = [
      { Indicador: "Total de Vendas (qtd)", Valor: totalVendasQty },
      { Indicador: "Faturamento Total", Valor: totalVendasValor },
      { Indicador: "Custo Total", Valor: totalCusto },
      { Indicador: "Lucro Bruto", Valor: totalLucro },
      { Indicador: "Total Gastos", Valor: totalGastos },
      { Indicador: "Lucro Liquido (Vendas - Gastos)", Valor: lucroLiquido },
      { Indicador: "Margem Media (%)", Valor: Math.round(margemMedia * 10) / 10 },
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
    setColumnWidths(wsVendas, [12, 25, 15, 25, 35, 18, 12, 15, 15, 12, 10, 20, 15, 12, 12, 12, 18, 12, 35, 12, 35, 12, 30, 20, 10, 15, 5, 12, 15, 12, 25]);
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
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

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
