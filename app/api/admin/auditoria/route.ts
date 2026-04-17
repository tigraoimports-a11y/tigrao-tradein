import { NextResponse } from "next/server";
import { getTaxaAsync, calcularLiquido } from "@/lib/taxas";

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

/**
 * GET /api/admin/auditoria?mes=2026-04
 *
 * Agrega dados financeiros do mes para a tela de auditoria:
 *  - Patrimonio base (patrimonio_mensal)
 *  - Vendas (faturamento, custo, lucro)
 *  - Gastos por categoria
 *  - Saldos bancarios diarios
 *  - Estoque atual por categoria
 *  - Recebiveis pendentes
 *  - Reajustes
 *
 * Formula: Patrimonio Esperado = Base + Lucro - Gastos_Operacionais - Distribuicao + Reajustes
 * Patrimonio Atual = Saldos_em_Conta + Valor_Estoque + Recebiveis
 */
export async function GET(request: Request) {
  if (!auth(request))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");

  const url = new URL(request.url);
  const mes =
    url.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const primeiroDia = `${mes}-01`;
  const [ano, mesNum] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, mesNum, 0).toISOString().slice(0, 10);

  // ---------- Consultas em paralelo ----------

  const [
    patRes,
    vendasRes,
    gastosRes,
    saldosRes,
    ultimoSaldoRes,
    estoqueRes,
    fiadoRes,
    reajRes,
  ] = await Promise.all([
    // 1. Patrimonio base do mes
    supabase
      .from("patrimonio_mensal")
      .select("*")
      .eq("mes", mes)
      .single(),

    // 2. Vendas do mes
    supabase
      .from("vendas")
      .select(
        "preco_vendido, custo, lucro, is_brinde, status_pagamento, forma, banco, banco_pix, bandeira, qnt_parcelas, valor_comprovante, entrada_pix, entrada_especie, credito_lojista_usado, data"
      )
      .gte("data", primeiroDia)
      .lte("data", ultimoDia),

    // 3. Gastos do mes
    supabase
      .from("gastos")
      .select("categoria, valor, tipo, is_dep_esp, banco, data")
      .gte("data", primeiroDia)
      .lte("data", ultimoDia),

    // 4. Saldos diarios do mes
    supabase
      .from("saldos_bancarios")
      .select("*")
      .gte("data", primeiroDia)
      .lte("data", ultimoDia)
      .order("data", { ascending: true }),

    // 5. Ultimo saldo registrado (pra saber os saldos atuais)
    supabase
      .from("saldos_bancarios")
      .select("*")
      .order("data", { ascending: false })
      .limit(1)
      .single(),

    // 6. Estoque atual (EM ESTOQUE)
    supabase
      .from("estoque")
      .select("categoria, custo_unitario, qnt, produto, status")
      .eq("status", "EM ESTOQUE"),

    // 7. Recebiveis (fiado_parcelas nao recebidas)
    supabase
      .from("vendas")
      .select("fiado_parcelas")
      .not("fiado_parcelas", "is", null),

    // 8. Reajustes do mes
    supabase
      .from("reajustes")
      .select("valor, banco, data")
      .gte("data", primeiroDia)
      .lte("data", ultimoDia),
  ]);

  // ---------- Processar vendas ----------

  const vendasRaw = vendasRes.data || [];
  const vendasValidas = vendasRaw.filter(
    (v) => v.status_pagamento !== "CANCELADO" && !v.is_brinde
  );
  const faturamento = vendasValidas.reduce(
    (s, v) => s + (Number(v.preco_vendido) || 0),
    0
  );
  const custoVendas = vendasValidas.reduce(
    (s, v) => s + (Number(v.custo) || 0),
    0
  );
  const lucroVendas = vendasValidas.reduce(
    (s, v) => s + (Number(v.lucro) || 0),
    0
  );

  // Vendas por dia (pra cruzar com saldos)
  // liquido = valor que efetivamente caiu em caixa/conta (descontadas taxas de cartao,
  // e excluindo credito de lojista e valor de troca, que nao sao dinheiro que entra).
  const vendasPorDia: Record<string, { faturamento: number; custo: number; lucro: number; qtd: number; liquido: number }> = {};

  // Recebido BRUTO por dia/banco/forma — pra tela de conferencia o operador
  // comparar com o extrato dos bancos. Valores sao o que o cliente pagou
  // (sem descontar taxa da maquininha).
  interface RecebidoBruto {
    itau_pix: number;
    itau_credito: number;
    infinite_pix: number;
    infinite_credito: number;
    infinite_debito: number;
    mp_credito: number;
    mp_pix: number;
    especie: number;
  }
  const zeroBruto = (): RecebidoBruto => ({
    itau_pix: 0, itau_credito: 0,
    infinite_pix: 0, infinite_credito: 0, infinite_debito: 0,
    mp_credito: 0, mp_pix: 0,
    especie: 0,
  });
  const recebidoPorDia: Record<string, RecebidoBruto> = {};

  // Pre-calcula taxa de cada venda (paraleliza as chamadas async)
  const taxaPorVenda = await Promise.all(
    vendasValidas.map(async (v) => {
      const compVal = Number(v.valor_comprovante) || 0;
      if (compVal <= 0) return 0;
      try {
        return await getTaxaAsync(
          String(v.banco || ""),
          v.bandeira ? String(v.bandeira) : null,
          Number(v.qnt_parcelas) || null,
          String(v.forma || "")
        );
      } catch { return 0; }
    })
  );

  for (let i = 0; i < vendasValidas.length; i++) {
    const v = vendasValidas[i];
    const d = v.data;
    if (!vendasPorDia[d]) vendasPorDia[d] = { faturamento: 0, custo: 0, lucro: 0, qtd: 0, liquido: 0 };

    const preco = Number(v.preco_vendido) || 0;
    const compVal = Number(v.valor_comprovante) || 0;
    const entradaPix = Number(v.entrada_pix) || 0;
    const entradaEspecie = Number(v.entrada_especie) || 0;
    const credito = Number(v.credito_lojista_usado) || 0;
    const taxa = taxaPorVenda[i];

    // Parte em cartao descontada a taxa da maquininha
    const liqCartao = compVal > 0 ? calcularLiquido(compVal, taxa) : 0;
    // Soma de tudo que entrou em caixa (cartao liquido + PIX + dinheiro)
    let liquidoVenda = liqCartao + entradaPix + entradaEspecie;
    // Se nao tem cartao nem entrada, e forma e PIX/DINHEIRO: o resto do preco que
    // nao foi credito de lojista cai em caixa.
    if (liquidoVenda === 0 && (v.forma === "PIX" || v.forma === "DINHEIRO")) {
      liquidoVenda = Math.max(0, preco - credito);
    }

    vendasPorDia[d].faturamento += preco;
    vendasPorDia[d].custo += Number(v.custo) || 0;
    vendasPorDia[d].lucro += Number(v.lucro) || 0;
    vendasPorDia[d].qtd += 1;
    vendasPorDia[d].liquido += liquidoVenda;

    // ---- Agregar BRUTO por banco/forma pra conferencia ----
    if (!recebidoPorDia[d]) recebidoPorDia[d] = zeroBruto();
    const r = recebidoPorDia[d];
    const banco = String(v.banco || "").toUpperCase();
    const forma = String(v.forma || "").toUpperCase();
    const qntParc = Number(v.qnt_parcelas) || 0;

    // Parte principal (valor_comprovante)
    if (compVal > 0) {
      if (forma === "PIX") {
        // PIX puro, banco guarda onde caiu
        if (banco === "ITAU") r.itau_pix += compVal;
        else if (banco === "INFINITE") r.infinite_pix += compVal;
        else if (banco === "MERCADO_PAGO") r.mp_pix += compVal;
      } else if (forma === "DINHEIRO") {
        r.especie += compVal;
      } else if (forma === "DEBITO") {
        if (banco === "INFINITE") r.infinite_debito += compVal;
        else if (banco === "ITAU") r.itau_credito += compVal; // itau nao tem separacao debito
      } else {
        // CARTAO / LINK — considera credito
        if (banco === "ITAU") r.itau_credito += compVal;
        else if (banco === "INFINITE") {
          // Infinite debito sem parcelas
          if (qntParc === 0 || qntParc === 1) r.infinite_credito += compVal;
          else r.infinite_credito += compVal;
        }
        else if (banco === "MERCADO_PAGO") r.mp_credito += compVal;
      }
    } else if (forma === "PIX") {
      // PIX total = preco (sem credito lojista)
      const valPix = Math.max(0, preco - credito);
      if (banco === "ITAU") r.itau_pix += valPix;
      else if (banco === "INFINITE") r.infinite_pix += valPix;
      else if (banco === "MERCADO_PAGO") r.mp_pix += valPix;
    } else if (forma === "DINHEIRO") {
      r.especie += Math.max(0, preco - credito);
    }

    // Entradas adicionais (pix/especie)
    const bancoPix = String(v.banco_pix || "").toUpperCase();
    if (entradaPix > 0) {
      if (bancoPix === "ITAU") r.itau_pix += entradaPix;
      else if (bancoPix === "INFINITE") r.infinite_pix += entradaPix;
      else if (bancoPix === "MERCADO_PAGO") r.mp_pix += entradaPix;
      else r.itau_pix += entradaPix; // fallback
    }
    if (entradaEspecie > 0) r.especie += entradaEspecie;
  }

  // ---------- Processar gastos ----------

  const gastosRaw = gastosRes.data || [];
  // Gastos operacionais = SAIDA que nao seja deposito de especie
  const gastosSaida = gastosRaw.filter(
    (g) => g.tipo === "SAIDA" && !g.is_dep_esp
  );
  const totalGastos = gastosSaida.reduce(
    (s, g) => s + (Number(g.valor) || 0),
    0
  );

  // Separar: gastos com fornecedor (compra de mercadoria) vs operacionais
  const gastosFornecedor = gastosSaida
    .filter((g) => g.categoria === "FORNECEDOR")
    .reduce((s, g) => s + (Number(g.valor) || 0), 0);
  const gastosOperacionais = totalGastos - gastosFornecedor;

  // Agrupar por categoria
  const gastosMap: Record<string, number> = {};
  for (const g of gastosSaida) {
    const cat = g.categoria || "OUTROS";
    gastosMap[cat] = (gastosMap[cat] || 0) + Number(g.valor || 0);
  }
  const gastosPorCategoria = Object.entries(gastosMap)
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);

  // Gastos por dia
  const gastosPorDia: Record<string, number> = {};
  for (const g of gastosSaida) {
    gastosPorDia[g.data] = (gastosPorDia[g.data] || 0) + (Number(g.valor) || 0);
  }

  // ---------- Processar saldos ----------

  const saldosDiarios = saldosRes.data || [];
  const ultimoSaldo = ultimoSaldoRes.data;
  const saldoAtualItau = Number(ultimoSaldo?.esp_itau) || 0;
  const saldoAtualInf = Number(ultimoSaldo?.esp_inf) || 0;
  const saldoAtualMp = Number(ultimoSaldo?.esp_mp) || 0;
  const saldoAtualEsp = Number(ultimoSaldo?.esp_especie) || 0;
  const totalSaldos =
    saldoAtualItau + saldoAtualInf + saldoAtualMp + saldoAtualEsp;

  // ---------- Processar estoque ----------

  const estoqueAtivo = estoqueRes.data || [];
  const valorEstoque = estoqueAtivo.reduce(
    (s, e) => s + (Number(e.custo_unitario) || 0) * (Number(e.qnt) || 1),
    0
  );
  const qtdEstoque = estoqueAtivo.reduce(
    (s, e) => s + (Number(e.qnt) || 1),
    0
  );

  // Agrupar por categoria
  const estCatMap: Record<string, { qtd: number; valor: number }> = {};
  for (const e of estoqueAtivo) {
    const cat = e.categoria || "OUTROS";
    if (!estCatMap[cat]) estCatMap[cat] = { qtd: 0, valor: 0 };
    const q = Number(e.qnt) || 1;
    estCatMap[cat].qtd += q;
    estCatMap[cat].valor += (Number(e.custo_unitario) || 0) * q;
  }
  const estoquePorCategoria = Object.entries(estCatMap)
    .map(([categoria, { qtd, valor }]) => ({ categoria, qtd, valor }))
    .sort((a, b) => b.valor - a.valor);

  // ---------- Recebiveis pendentes ----------

  let recebiveisPendentes = 0;
  for (const v of fiadoRes.data || []) {
    const parcelas = v.fiado_parcelas;
    if (Array.isArray(parcelas)) {
      for (const p of parcelas) {
        if (!p.recebido) recebiveisPendentes += Number(p.valor) || 0;
      }
    }
  }

  // ---------- Reajustes ----------

  const totalReajustes = (reajRes.data || []).reduce(
    (s, r) => s + (Number(r.valor) || 0),
    0
  );

  // ---------- Calcular patrimonio ----------

  const pat = patRes.data;
  const patrimonioBase = pat ? Number(pat.patrimonio_base) || 0 : 0;
  const estoqueBase = pat ? Number(pat.estoque_base) || 0 : 0;
  const saldosBase = pat ? Number(pat.saldos_base) || 0 : 0;
  const distribuicao = pat ? Number(pat.distribuicao_lucro) || 0 : 0;

  // Patrimonio esperado:
  // Base + Lucro das vendas - Gastos operacionais - Distribuicao + Reajustes
  // Nota: compra de fornecedor NAO reduz patrimonio (converte dinheiro em estoque)
  const patrimonioEsperado =
    patrimonioBase + lucroVendas - gastosOperacionais - distribuicao + totalReajustes;

  // Patrimonio atual = saldos em conta + estoque (custo) + recebiveis
  const patrimonioAtual = totalSaldos + valorEstoque + recebiveisPendentes;

  // Diferenca
  const diferenca = patrimonioAtual - patrimonioEsperado;

  // ---------- Montar dias do mes com vendas + gastos ----------

  const diasDoMes: Array<{
    data: string;
    vendas_faturamento: number;
    vendas_custo: number;
    vendas_lucro: number;
    vendas_liquido: number;
    vendas_qtd: number;
    recebido: RecebidoBruto;
    gastos: number;
    saldo_itau_base: number;
    saldo_inf_base: number;
    saldo_mp_base: number;
    saldo_esp_base: number;
    saldo_itau: number;
    saldo_inf: number;
    saldo_mp: number;
    saldo_esp: number;
    tem_saldo: boolean;
  }> = [];

  const hoje = new Date().toISOString().slice(0, 10);
  const ultimoDiaMostrar = hoje < ultimoDia ? hoje : ultimoDia;

  for (
    let d = new Date(primeiroDia);
    d.toISOString().slice(0, 10) <= ultimoDiaMostrar;
    d.setDate(d.getDate() + 1)
  ) {
    const iso = d.toISOString().slice(0, 10);
    const saldo = saldosDiarios.find((s) => s.data === iso);
    const vd = vendasPorDia[iso] || { faturamento: 0, custo: 0, lucro: 0, qtd: 0, liquido: 0 };
    const rb = recebidoPorDia[iso] || zeroBruto();
    diasDoMes.push({
      data: iso,
      vendas_faturamento: vd.faturamento,
      vendas_custo: vd.custo,
      vendas_lucro: vd.lucro,
      vendas_liquido: vd.liquido,
      vendas_qtd: vd.qtd,
      recebido: rb,
      gastos: gastosPorDia[iso] || 0,
      saldo_itau_base: Number(saldo?.itau_base) || 0,
      saldo_inf_base: Number(saldo?.inf_base) || 0,
      saldo_mp_base: Number(saldo?.mp_base) || 0,
      saldo_esp_base: Number(saldo?.esp_especie_base) || 0,
      saldo_itau: Number(saldo?.esp_itau) || 0,
      saldo_inf: Number(saldo?.esp_inf) || 0,
      saldo_mp: Number(saldo?.esp_mp) || 0,
      saldo_esp: Number(saldo?.esp_especie) || 0,
      tem_saldo: !!saldo,
    });
  }

  return NextResponse.json({
    mes,
    patrimonio: pat
      ? {
          patrimonio_base: patrimonioBase,
          estoque_base: estoqueBase,
          saldos_base: saldosBase,
          distribuicao_lucro: distribuicao,
          observacao: pat.observacao || null,
        }
      : null,
    vendas: {
      total: vendasValidas.length,
      faturamento,
      custo: custoVendas,
      lucro: lucroVendas,
    },
    gastos: {
      total: totalGastos,
      operacionais: gastosOperacionais,
      fornecedor: gastosFornecedor,
      por_categoria: gastosPorCategoria,
    },
    reajustes: totalReajustes,
    calculo: {
      patrimonio_esperado: patrimonioEsperado,
      patrimonio_atual: patrimonioAtual,
      diferenca,
    },
    saldo_atual: {
      itau: saldoAtualItau,
      infinite: saldoAtualInf,
      mercado_pago: saldoAtualMp,
      especie: saldoAtualEsp,
      total: totalSaldos,
    },
    estoque: {
      valor_atual: valorEstoque,
      qtd_atual: qtdEstoque,
      por_categoria: estoquePorCategoria,
      estoque_base: estoqueBase,
      gastos_fornecedor: gastosFornecedor,
      custo_vendas: custoVendas,
      estoque_esperado: estoqueBase + gastosFornecedor - custoVendas,
      diferenca_estoque: valorEstoque - (estoqueBase + gastosFornecedor - custoVendas),
    },
    recebiveis_pendentes: recebiveisPendentes,
    dias: diasDoMes,
  });
}
