// app/api/admin/analytics-vendas/route.ts — Advanced sales analytics aggregation
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

interface Venda {
  id: number;
  data: string;
  data_programada?: string | null;
  produto: string;
  preco_vendido: number;
  custo: number;
  lucro: number;
  margem_pct: number;
  origem: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  status_pagamento: string;
  is_brinde?: boolean;
}

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatMesLabel(year: number, month: number): string {
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${meses[month]} ${year}`;
}

function getWeekOfMonth(day: number): number {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

function safeDivide(a: number, b: number, fallback = 0): number {
  return b !== 0 ? a / b : fallback;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  // Support both "meses" and "range" (frontend sends "range=1m")
  const rangeParam = searchParams.get("range") || searchParams.get("meses") || "3";
  const meses = Math.min(Math.max(parseInt(rangeParam.replace(/[^0-9]/g, "")) || 3, 1), 24);

  // Use São Paulo timezone to avoid UTC date mismatches on Vercel
  const spNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hoje = spNow;
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth(); // 0-indexed
  const diaAtual = hoje.getDate();

  // Calculate start date: Always fetch at least 3 months for projection accuracy
  const mesesFetch = Math.max(meses, 3);
  const dataInicio = new Date(anoAtual, mesAtual - mesesFetch, 1);
  const dataInicioStr = dataInicio.toISOString().split("T")[0];
  const hojeStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}-${String(diaAtual).padStart(2, "0")}`;

  try {
    // Fetch all non-cancelled sales for the period
    // Supabase has a 1000-row default limit — paginate to get all rows
    const selectFields = "id, data, data_programada, produto, preco_vendido, custo, lucro, margem_pct, origem, bairro, cidade, uf, status_pagamento, is_brinde";
    let allRows: Venda[] = [];
    let offset = 0;
    const PAGE_SIZE = 1000;

    while (true) {
      const { data: page, error: pageError } = await supabase
        .from("vendas")
        .select(selectFields)
        .neq("status_pagamento", "CANCELADO")
        .neq("status_pagamento", "PROGRAMADA")
        .gte("data", dataInicioStr)
        .lte("data", hojeStr)
        .order("data", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
      if (!page || page.length === 0) break;
      allRows = allRows.concat(page as Venda[]);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    // Excluir brindes dos cálculos financeiros
    const rows = allRows.filter(v => !v.is_brinde);
    console.log(`[analytics-vendas] meses=${meses} dataInicio=${dataInicioStr} hoje=${hojeStr} totalRows=${rows.length} (excl. brindes)`);

    // ---------------------------------------------------------------
    // 1. COMPARATIVO MENSAL
    // ---------------------------------------------------------------
    const mesAtualStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}`;
    const mesAnteriorDate = new Date(anoAtual, mesAtual - 1, 1);
    const mesAnteriorStr = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, "0")}`;

    // Fair comparison: same day range
    const mesAtualInicio = `${mesAtualStr}-01`;
    const mesAtualFim = hojeStr;
    const mesAnteriorInicio = `${mesAnteriorStr}-01`;
    const diaComparacao = Math.min(diaAtual, new Date(mesAnteriorDate.getFullYear(), mesAnteriorDate.getMonth() + 1, 0).getDate());
    const mesAnteriorFim = `${mesAnteriorStr}-${String(diaComparacao).padStart(2, "0")}`;

    const de = (v: Venda) => (v as unknown as { data_programada?: string | null }).data_programada || v.data;
    const vendasMesAtual = rows.filter(v => de(v) >= mesAtualInicio && de(v) <= mesAtualFim);
    const vendasMesAnterior = rows.filter(v => de(v) >= mesAnteriorInicio && de(v) <= mesAnteriorFim);

    const agg = (arr: Venda[]) => ({
      vendas: arr.length,
      faturamento: arr.reduce((s, v) => s + Number(v.preco_vendido || 0), 0),
      lucro: arr.reduce((s, v) => s + Number(v.lucro || 0), 0),
    });

    const aggAtual = agg(vendasMesAtual);
    const aggAnterior = agg(vendasMesAnterior);

    const comparativo = {
      mesAtual: {
        label: formatMesLabel(anoAtual, mesAtual),
        vendas: aggAtual.vendas,
        faturamento: aggAtual.faturamento,
        lucro: aggAtual.lucro,
        ticketMedio: Math.round(safeDivide(aggAtual.faturamento, aggAtual.vendas)),
      },
      mesAnterior: {
        label: formatMesLabel(mesAnteriorDate.getFullYear(), mesAnteriorDate.getMonth()),
        vendas: aggAnterior.vendas,
        faturamento: aggAnterior.faturamento,
        lucro: aggAnterior.lucro,
        ticketMedio: Math.round(safeDivide(aggAnterior.faturamento, aggAnterior.vendas)),
      },
      variacao: {
        vendas: Math.round(safeDivide((aggAtual.vendas - aggAnterior.vendas) * 100, aggAnterior.vendas) * 10) / 10,
        faturamento: Math.round(safeDivide((aggAtual.faturamento - aggAnterior.faturamento) * 100, aggAnterior.faturamento) * 10) / 10,
        lucro: Math.round(safeDivide((aggAtual.lucro - aggAnterior.lucro) * 100, aggAnterior.lucro) * 10) / 10,
      },
    };

    // ---------------------------------------------------------------
    // 2. RANKING PRODUTOS (current month, top 10)
    // ---------------------------------------------------------------
    const produtoMap: Record<string, { qtd: number; receita: number; lucro: number }> = {};
    for (const v of vendasMesAtual) {
      const prod = v.produto || "N/A";
      if (!produtoMap[prod]) produtoMap[prod] = { qtd: 0, receita: 0, lucro: 0 };
      produtoMap[prod].qtd++;
      produtoMap[prod].receita += Number(v.preco_vendido || 0);
      produtoMap[prod].lucro += Number(v.lucro || 0);
    }

    const rankingProdutos = Object.entries(produtoMap)
      .map(([produto, d]) => ({ produto, qtd: d.qtd, receita: d.receita, lucro: d.lucro }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 10);

    // ---------------------------------------------------------------
    // 3. TICKET MEDIO DIARIO (current + previous month)
    // ---------------------------------------------------------------
    // Include full previous month for the chart
    const ultimoDiaMesAnterior = new Date(mesAnteriorDate.getFullYear(), mesAnteriorDate.getMonth() + 1, 0).getDate();
    const mesAnteriorFimCompleto = `${mesAnteriorStr}-${String(ultimoDiaMesAnterior).padStart(2, "0")}`;
    const vendasMesAnteriorCompleto = rows.filter(v => v.data >= mesAnteriorInicio && v.data <= mesAnteriorFimCompleto);

    const diaMap: Record<string, { total: number; count: number }> = {};
    for (const v of [...vendasMesAnteriorCompleto, ...vendasMesAtual]) {
      if (!diaMap[v.data]) diaMap[v.data] = { total: 0, count: 0 };
      diaMap[v.data].total += Number(v.preco_vendido || 0);
      diaMap[v.data].count++;
    }

    const ticketMedioDiario = Object.entries(diaMap)
      .map(([data, d]) => ({
        data,
        ticketMedio: Math.round(safeDivide(d.total, d.count)),
        vendas: d.count,
      }))
      .sort((a, b) => a.data.localeCompare(b.data));

    // ---------------------------------------------------------------
    // 4. MARGEM POR CANAL
    // ---------------------------------------------------------------
    const canalMap: Record<string, { vendas: number; receita: number; lucro: number }> = {};
    for (const v of vendasMesAtual) {
      const origem = v.origem || "OUTROS";
      if (!canalMap[origem]) canalMap[origem] = { vendas: 0, receita: 0, lucro: 0 };
      canalMap[origem].vendas++;
      canalMap[origem].receita += Number(v.preco_vendido || 0);
      canalMap[origem].lucro += Number(v.lucro || 0);
    }

    const margemPorCanal = Object.entries(canalMap)
      .map(([origem, d]) => ({
        origem,
        vendas: d.vendas,
        receita: d.receita,
        lucro: d.lucro,
        margem: Math.round(safeDivide(d.lucro * 100, d.receita) * 10) / 10,
      }))
      .sort((a, b) => b.receita - a.receita);

    // ---------------------------------------------------------------
    // 5. ORIGEM CLIENTES (pie chart)
    // ---------------------------------------------------------------
    const totalVendasMes = vendasMesAtual.length;
    const origemClientes = Object.entries(canalMap)
      .map(([origem, d]) => ({
        origem,
        qtd: d.vendas,
        percentual: Math.round(safeDivide(d.vendas * 100, totalVendasMes) * 10) / 10,
      }))
      .sort((a, b) => b.qtd - a.qtd);

    // ---------------------------------------------------------------
    // 6. VENDAS POR REGIAO
    // ---------------------------------------------------------------
    const bairroMap: Record<string, { qtd: number; receita: number }> = {};
    const cidadeMap: Record<string, { qtd: number; receita: number }> = {};
    const estadoMap: Record<string, { qtd: number }> = {};

    for (const v of vendasMesAtual) {
      const bairro = v.bairro || "N/I";
      const cidade = v.cidade || "N/I";
      const uf = v.uf || "N/I";

      if (!bairroMap[bairro]) bairroMap[bairro] = { qtd: 0, receita: 0 };
      bairroMap[bairro].qtd++;
      bairroMap[bairro].receita += Number(v.preco_vendido || 0);

      if (!cidadeMap[cidade]) cidadeMap[cidade] = { qtd: 0, receita: 0 };
      cidadeMap[cidade].qtd++;
      cidadeMap[cidade].receita += Number(v.preco_vendido || 0);

      if (!estadoMap[uf]) estadoMap[uf] = { qtd: 0 };
      estadoMap[uf].qtd++;
    }

    const vendasPorRegiao = {
      bairros: Object.entries(bairroMap)
        .map(([nome, d]) => ({ nome, qtd: d.qtd, receita: d.receita }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 15),
      cidades: Object.entries(cidadeMap)
        .map(([nome, d]) => ({ nome, qtd: d.qtd, receita: d.receita }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 15),
      estados: Object.entries(estadoMap)
        .map(([nome, d]) => ({ nome, qtd: d.qtd }))
        .sort((a, b) => b.qtd - a.qtd),
    };

    // ---------------------------------------------------------------
    // 7. PROJECAO DE LUCRO
    // ---------------------------------------------------------------
    // Get all sales from last 3 months (or N months) for averages
    const mesesParaMedia = Math.max(meses, 3);
    const dataInicioMedia = new Date(anoAtual, mesAtual - mesesParaMedia, 1);
    const dataInicioMediaStr = dataInicioMedia.toISOString().split("T")[0];
    const vendasParaMedia = rows.filter(v => v.data >= dataInicioMediaStr && v.data < mesAtualInicio);

    // Group by day-of-week
    const diaSemanaStats: Record<number, { totalLucro: number; totalVendas: number; dias: number }> = {};
    for (let d = 0; d < 7; d++) {
      diaSemanaStats[d] = { totalLucro: 0, totalVendas: 0, dias: 0 };
    }

    // Count distinct dates per day-of-week and accumulate
    const diasComVendas: Record<number, Set<string>> = {};
    for (let d = 0; d < 7; d++) diasComVendas[d] = new Set();

    for (const v of vendasParaMedia) {
      const date = new Date(v.data + "T12:00:00");
      const dow = date.getDay();
      diaSemanaStats[dow].totalLucro += Number(v.lucro || 0);
      diaSemanaStats[dow].totalVendas++;
      diasComVendas[dow].add(v.data);
    }

    // Find actual data range (first and last sale dates in historical period)
    const datasVendas = vendasParaMedia.map(v => v.data).sort();
    const primeiraVenda = datasVendas[0];
    const ultimaVenda = datasVendas[datasVendas.length - 1];

    // Count calendar days ONLY within the actual data range (first sale → end of last month)
    const diasCalendario: Record<number, Set<string>> = {};
    for (let d = 0; d < 7; d++) diasCalendario[d] = new Set();

    const mesAtualInicioDate = new Date(mesAtualInicio + "T00:00:00");
    if (primeiraVenda) {
      const cursor = new Date(primeiraVenda + "T00:00:00");
      while (cursor < mesAtualInicioDate) {
        const dow = cursor.getDay();
        const dateStr = cursor.toISOString().split("T")[0];
        diasCalendario[dow].add(dateStr);
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    for (let d = 0; d < 7; d++) {
      // Use calendar days within actual data range as denominator
      diaSemanaStats[d].dias = diasCalendario[d].size || 1;
    }

    const mediasPorDiaSemana = Array.from({ length: 7 }, (_, d) => {
      const stats = diaSemanaStats[d];
      return {
        dia: DIAS_SEMANA[d],
        mediaVendas: Math.round(safeDivide(stats.totalVendas, stats.dias) * 10) / 10,
        mediaLucro: Math.round(safeDivide(stats.totalLucro, stats.dias)),
      };
    });

    // Week-of-month multiplier: compare each week's average to global average
    const weekStats: Record<number, { totalLucro: number; dias: number }> = { 1: { totalLucro: 0, dias: 0 }, 2: { totalLucro: 0, dias: 0 }, 3: { totalLucro: 0, dias: 0 }, 4: { totalLucro: 0, dias: 0 } };
    const weekDaysVistos: Record<number, Set<string>> = { 1: new Set(), 2: new Set(), 3: new Set(), 4: new Set() };

    for (const v of vendasParaMedia) {
      const date = new Date(v.data + "T12:00:00");
      const week = getWeekOfMonth(date.getDate());
      weekStats[week].totalLucro += Number(v.lucro || 0);
      weekDaysVistos[week].add(v.data);
    }

    // Count calendar days per week-of-month ONLY within actual data range
    if (primeiraVenda) {
      const cursor2 = new Date(primeiraVenda + "T00:00:00");
      while (cursor2 < mesAtualInicioDate) {
        const week = getWeekOfMonth(cursor2.getDate());
        weekDaysVistos[week].add(cursor2.toISOString().split("T")[0]);
        cursor2.setDate(cursor2.getDate() + 1);
      }
    }

    for (let w = 1; w <= 4; w++) {
      weekStats[w].dias = weekDaysVistos[w].size || 1;
    }

    const weekAvgPerDay: Record<number, number> = {};
    let globalAvgPerDay = 0;
    let totalWeekDays = 0;
    for (let w = 1; w <= 4; w++) {
      weekAvgPerDay[w] = safeDivide(weekStats[w].totalLucro, weekStats[w].dias);
      globalAvgPerDay += weekStats[w].totalLucro;
      totalWeekDays += weekStats[w].dias;
    }
    globalAvgPerDay = safeDivide(globalAvgPerDay, totalWeekDays);

    const weekMultiplier: Record<number, number> = {};
    for (let w = 1; w <= 4; w++) {
      weekMultiplier[w] = globalAvgPerDay > 0 ? weekAvgPerDay[w] / globalAvgPerDay : 1;
    }

    // Accumulated profit this month
    const lucroAcumuladoMes = vendasMesAtual.reduce((s, v) => s + Number(v.lucro || 0), 0);
    const faturamentoAcumuladoMes = vendasMesAtual.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
    const vendasAcumuladasMes = vendasMesAtual.length;

    // ── PROJEÇÃO BASEADA NO MÊS ATUAL ──
    // Simple and accurate: use current month's daily average to project remaining days
    const mediaDiariaLucro = safeDivide(lucroAcumuladoMes, diaAtual);
    const mediaDiariaFaturamento = safeDivide(faturamentoAcumuladoMes, diaAtual);
    const mediaDiariaVendas = safeDivide(vendasAcumuladasMes, diaAtual);

    const ultimoDiaMesAtual = new Date(anoAtual, mesAtual + 1, 0).getDate();
    const diasRestantesCount = ultimoDiaMesAtual - diaAtual;

    const diasRestantes: { data: string; diaSemana: string; lucroProjetado: number }[] = [];
    let lucroProjetadoRestante = 0;

    for (let dia = diaAtual + 1; dia <= ultimoDiaMesAtual; dia++) {
      const date = new Date(anoAtual, mesAtual, dia);
      const dow = date.getDay();
      const dateStr = `${anoAtual}-${String(mesAtual + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;

      // Use current month's daily average as projection per day
      const lucroProjetado = Math.round(mediaDiariaLucro);

      diasRestantes.push({
        data: dateStr,
        diaSemana: DIAS_SEMANA[dow],
        lucroProjetado,
      });
      lucroProjetadoRestante += lucroProjetado;
    }

    // Total profit last month (full month)
    const lucroMesAnteriorTotal = vendasMesAnteriorCompleto.reduce((s, v) => s + Number(v.lucro || 0), 0);

    const projecao = {
      mediasPorDiaSemana,
      diasRestantes,
      lucroAcumuladoMes,
      lucroProjetadoFimMes: lucroAcumuladoMes + lucroProjetadoRestante,
      lucroMesAnteriorTotal,
    };

    // ---------------------------------------------------------------
    // 8. CORES MAIS VENDIDAS POR MODELO (current month)
    //    Agrupa modelo base (sem cor/origem) e conta qntas de cada cor.
    // ---------------------------------------------------------------
    const stripDetails = (nome: string) => nome
      .replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ|ZD|ZP|CH|AA|E|LZ|QL|N)\s*(\([^)]*\))?/gi, "")
      .replace(/[-–]?\s*(IP\s+)?-?\s*(CHIP\s+)?(F[ÍI]SICO\s*\+?\s*)?E-?SIM/gi, "")
      .replace(/-\s*E-?SIM/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    // Lista de cores conhecidas para detectar cor no fim do nome do produto
    const CORES_KNOWN = [
      "PRETO", "BRANCO", "PRATA", "DOURADO", "AZUL", "VERDE", "ROSA", "ROXO",
      "VERMELHO", "AMARELO", "ESTELAR", "MEIA-NOITE", "TEAL", "ULTRAMARINO",
      "LAVANDA", "SAGE", "MIDNIGHT", "LARANJA", "CINZA", "NATURAL", "GRAFITE",
      "TITANIO PRETO", "TITANIO BRANCO", "TITANIO NATURAL", "TITANIO AZUL",
      "TITANIO DESERTO", "DEEP PURPLE", "PACIFIC BLUE", "ALPINE GREEN",
      "SIERRA BLUE", "GRAPHITE", "JET BLACK",
      "LARANJA CÓSMICO", "LARANJA COSMICO", "AZUL PROFUNDO", "AZUL NÉVOA",
      "AZUL NEVOA", "AZUL CÉU", "AZUL CEU", "PRETO ESPACIAL", "CINZA ESPACIAL",
      "DOURADO CLARO", "CLOUD WHITE", "SKY BLUE", "SALVIA", "SÁLVIA",
      "PRETO BRILHANTE", "ÍNDIGO", "INDIGO", "BLUE TITANIUM", "BLACK TITANIUM",
      "WHITE TITANIUM", "NATURAL TITANIUM", "DESERT TITANIUM",
    ].sort((a, b) => b.length - a.length); // prefere match mais longo primeiro

    const extractModeloCor = (nome: string): { modelo: string; cor: string } => {
      const cleaned = stripDetails(nome);
      const up = cleaned.toUpperCase();
      // Tenta encontrar uma cor conhecida no fim do nome
      for (const cor of CORES_KNOWN) {
        const idx = up.lastIndexOf(cor);
        if (idx >= 0 && idx + cor.length >= up.length - 3) {
          // cor está no fim (tolerância de 3 chars para sufixos tipo "--sim")
          const modelo = cleaned.substring(0, idx).trim().replace(/\s*-\s*$/, "").trim();
          return { modelo, cor };
        }
      }
      return { modelo: cleaned, cor: "" };
    };

    // modelo -> { totalQnt, cores: { cor -> qnt } }
    const modeloCoresMap: Record<string, { totalQnt: number; cores: Record<string, number> }> = {};
    for (const v of vendasMesAtual) {
      const prod = v.produto || "";
      if (!prod) continue;
      const { modelo, cor } = extractModeloCor(prod);
      if (!modelo) continue;
      if (!modeloCoresMap[modelo]) modeloCoresMap[modelo] = { totalQnt: 0, cores: {} };
      modeloCoresMap[modelo].totalQnt++;
      const corKey = cor || "(sem cor)";
      modeloCoresMap[modelo].cores[corKey] = (modeloCoresMap[modelo].cores[corKey] || 0) + 1;
    }

    // Top 15 modelos com suas cores ordenadas
    const coresPorModelo = Object.entries(modeloCoresMap)
      .map(([modelo, d]) => ({
        modelo,
        totalQnt: d.totalQnt,
        cores: Object.entries(d.cores)
          .map(([cor, qnt]) => ({ cor, qnt, pct: Math.round((qnt / d.totalQnt) * 100) }))
          .sort((a, b) => b.qnt - a.qnt),
      }))
      .sort((a, b) => b.totalQnt - a.totalQnt)
      .slice(0, 15);

    // ---------------------------------------------------------------
    // RESPONSE
    // ---------------------------------------------------------------
    return NextResponse.json({
      comparativo,
      rankingProdutos,
      ticketMedioDiario,
      margemPorCanal,
      origemClientes,
      vendasPorRegiao,
      projecao,
      coresPorModelo,
    });
  } catch (err) {
    console.error("Erro analytics-vendas:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
