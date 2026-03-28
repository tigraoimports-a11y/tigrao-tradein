// ============================================
// Lógica de Relatórios — TigrãoImports
// ============================================

import { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardParcial, ReportNoite, ReportManha, Venda } from "./admin-types";
import { proximoDiaUtil, hojeISO } from "./business-days";
import { getTaxa, calcularLiquido } from "./taxas";
import { recalcularSaldoDia } from "./saldos";

function sumByBanco(vendas: Venda[], banco: string): number {
  return vendas
    .filter((v) => v.banco === banco)
    .reduce((s, v) => s + Number(v.preco_vendido), 0);
}

function sumByBancoField(rows: { valor: number; banco: string | null }[], banco: string): number {
  return rows
    .filter((r) => r.banco === banco)
    .reduce((s, r) => s + Number(r.valor), 0);
}

/**
 * Gera o relatório parcial (dashboard) para uma data.
 */
export async function gerarParcial(
  supabase: SupabaseClient,
  dataISO: string
): Promise<DashboardParcial> {
  const { data: vendas } = await supabase
    .from("vendas")
    .select("*")
    .eq("data", dataISO)
    .order("created_at", { ascending: false });

  const rows = (vendas ?? []) as Venda[];
  const totalVendas = rows.length;
  const receitaBruta = rows.reduce((s, v) => s + Number(v.preco_vendido), 0);
  const lucroTotal = rows.reduce((s, v) => s + Number(v.lucro), 0);
  const ticketMedio = totalVendas > 0 ? receitaBruta / totalVendas : 0;
  const margemMedia = totalVendas > 0
    ? rows.reduce((s, v) => s + Number(v.margem_pct), 0) / totalVendas
    : 0;

  const porOrigem: DashboardParcial["porOrigem"] = {};
  const porTipo: DashboardParcial["porTipo"] = {};

  for (const v of rows) {
    if (!porOrigem[v.origem]) porOrigem[v.origem] = { qty: 0, receita: 0, lucro: 0 };
    porOrigem[v.origem].qty++;
    porOrigem[v.origem].receita += Number(v.preco_vendido);
    porOrigem[v.origem].lucro += Number(v.lucro);

    if (!porTipo[v.tipo]) porTipo[v.tipo] = { qty: 0, receita: 0, lucro: 0 };
    porTipo[v.tipo].qty++;
    porTipo[v.tipo].receita += Number(v.preco_vendido);
    porTipo[v.tipo].lucro += Number(v.lucro);
  }

  return {
    data: dataISO,
    totalVendas,
    receitaBruta,
    lucroTotal,
    ticketMedio,
    margemMedia,
    porOrigem,
    porTipo,
    vendasDoDia: rows,
  };
}

/**
 * Gera o relatório /noite — Fechamento do Dia.
 */
export async function gerarNoite(
  supabase: SupabaseClient,
  dataISO: string
): Promise<ReportNoite> {
  // 1. Ler saldos base da manhã
  const { data: saldoRow } = await supabase
    .from("saldos_bancarios")
    .select("*")
    .eq("data", dataISO)
    .single();

  let itau_base = Number(saldoRow?.itau_base ?? 0);
  let inf_base = Number(saldoRow?.inf_base ?? 0);
  let mp_base = Number(saldoRow?.mp_base ?? 0);
  let esp_especie_base = Number(saldoRow?.esp_especie_base ?? saldoRow?.esp_especie ?? 0);

  // Se não tem saldo para hoje ou bases são todas zero, carregar fechamento anterior
  if (!saldoRow || (itau_base === 0 && inf_base === 0 && mp_base === 0 && esp_especie_base === 0)) {
    const { data: prevSaldo } = await supabase
      .from("saldos_bancarios")
      .select("esp_itau, esp_inf, esp_mp, esp_especie")
      .lt("data", dataISO)
      .order("data", { ascending: false })
      .limit(1)
      .single();

    if (prevSaldo) {
      itau_base = Number(prevSaldo.esp_itau ?? 0);
      inf_base = Number(prevSaldo.esp_inf ?? 0);
      mp_base = Number(prevSaldo.esp_mp ?? 0);
      esp_especie_base = Number(prevSaldo.esp_especie ?? 0);
    }
  }

  // 2. Vendas D+0 de hoje (PIX, dinheiro, débito)
  const { data: vendasHoje } = await supabase
    .from("vendas")
    .select("*")
    .eq("data", dataISO)
    .eq("recebimento", "D+0");

  const d0 = (vendasHoje ?? []) as Venda[];
  let pix_itau = sumByBanco(d0, "ITAU");
  let pix_inf = sumByBanco(d0, "INFINITE");
  let pix_mp = sumByBanco(d0, "MERCADO_PAGO");
  let pix_esp = sumByBanco(d0, "ESPECIE");

  // 2b. Entradas PIX/espécie de vendas D+1 de hoje (PIX entra no D+0, cartão no D+1)
  const { data: vendasD1Hoje } = await supabase
    .from("vendas")
    .select("*")
    .eq("data", dataISO)
    .eq("recebimento", "D+1");

  for (const v of (vendasD1Hoje ?? []) as Venda[]) {
    const pixVal = Number(v.entrada_pix || 0);
    const espVal = Number(v.entrada_especie || 0);
    const bancoPix = v.banco_pix || v.banco || "";
    if (pixVal > 0) {
      if (bancoPix === "ITAU") pix_itau += pixVal;
      else if (bancoPix === "INFINITE") pix_inf += pixVal;
      else if (bancoPix === "MERCADO_PAGO") pix_mp += pixVal;
    }
    if (espVal > 0) pix_esp += espVal;
  }

  // 3. Créditos D+1 de dias anteriores que creditam hoje
  const hoje = new Date(dataISO + "T12:00:00");
  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const seteDiasISO = `${seteDiasAtras.getFullYear()}-${String(seteDiasAtras.getMonth() + 1).padStart(2, "0")}-${String(seteDiasAtras.getDate()).padStart(2, "0")}`;

  const { data: vendasD1 } = await supabase
    .from("vendas")
    .select("*")
    .eq("recebimento", "D+1")
    .gte("data", seteDiasISO)
    .lt("data", dataISO);

  const d1rows = (vendasD1 ?? []) as Venda[];
  let d1_itau = 0, d1_inf = 0, d1_mp = 0;
  const comprovantesContadosNoite = new Set<string>();

  for (const v of d1rows) {
    const dataReceb = proximoDiaUtil(new Date(v.data + "T12:00:00"));
    const recebISO = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, "0")}-${String(dataReceb.getDate()).padStart(2, "0")}`;
    if (recebISO === dataISO) {
      const comprovante = Number(v.valor_comprovante || 0);
      if (comprovante > 0) {
        // Deduplicar por ID da venda (cada registro = 1 produto/1 comprovante)
        // Não deduplicar por valor — produtos iguais podem ter mesmo comprovante
        const chave = v.id || `${v.banco}_${v.cliente}_${comprovante}_${v.data}_${v.produto}`;
        if (comprovantesContadosNoite.has(chave)) continue;
        comprovantesContadosNoite.add(chave);
        const taxa = getTaxa(v.banco || "", v.bandeira || "", Number(v.qnt_parcelas || 1), v.forma || "");
        const val = calcularLiquido(comprovante, taxa);
        if (v.banco === "ITAU") d1_itau += val;
        else if (v.banco === "INFINITE") d1_inf += val;
        else if (v.banco === "MERCADO_PAGO") d1_mp += val;
      } else {
        // Fallback: preco_vendido - partes que já entraram no D+0
        const val = Number(v.preco_vendido) - Number(v.entrada_pix || 0) - Number(v.entrada_especie || 0) - Number(v.produto_na_troca || 0);
        if (val > 0) {
          if (v.banco === "ITAU") d1_itau += val;
          else if (v.banco === "INFINITE") d1_inf += val;
          else if (v.banco === "MERCADO_PAGO") d1_mp += val;
        }
      }
    }
  }

  // 4. Reajustes de hoje
  const { data: reajustes } = await supabase
    .from("reajustes")
    .select("*")
    .eq("data", dataISO);

  const reajRows = (reajustes ?? []) as { valor: number; banco: string | null }[];
  const reaj_itau = sumByBancoField(reajRows, "ITAU");
  const reaj_inf = sumByBancoField(reajRows, "INFINITE");
  const reaj_mp = sumByBancoField(reajRows, "MERCADO_PAGO");
  const reaj_esp = sumByBancoField(reajRows, "ESPECIE");

  // 5. Gastos do dia
  const { data: gastos } = await supabase
    .from("gastos")
    .select("*")
    .eq("data", dataISO)
    .eq("tipo", "SAIDA");

  const gastoRows = (gastos ?? []) as { valor: number; banco: string | null }[];
  const saiu_itau = sumByBancoField(gastoRows, "ITAU");
  const saiu_inf = sumByBancoField(gastoRows, "INFINITE");
  const saiu_mp = sumByBancoField(gastoRows, "MERCADO_PAGO");
  const saiu_esp = sumByBancoField(gastoRows, "ESPECIE");

  // 5b. Entrada em espécie de vendas (ex: parte em dinheiro + parte cartão)
  const { data: todasVendasHoje } = await supabase
    .from("vendas")
    .select("entrada_especie")
    .eq("data", dataISO)
    .neq("status_pagamento", "CANCELADO");
  const entradaEspecieHoje = (todasVendasHoje ?? []).reduce((s, v) => s + Number(v.entrada_especie || 0), 0);

  // 6. Saldo final — usar valores manuais (/saldos) se flag manual=true
  const isManual = saldoRow?.manual === true;

  let esp_itau: number, esp_inf: number, esp_mp: number, esp_especie: number;

  if (isManual) {
    // Saldos foram informados manualmente via /saldos — usar como estão
    esp_itau = Number(saldoRow.esp_itau);
    esp_inf = Number(saldoRow.esp_inf);
    esp_mp = Number(saldoRow.esp_mp);
    esp_especie = Number(saldoRow.esp_especie ?? 0);
  } else {
    // Calcular a partir do saldo base + movimentações
    esp_itau = itau_base + pix_itau + d1_itau + reaj_itau - saiu_itau;
    esp_inf = inf_base + pix_inf + d1_inf + reaj_inf - saiu_inf;
    esp_mp = mp_base + pix_mp + d1_mp + reaj_mp - saiu_mp;
    esp_especie = esp_especie_base + pix_esp + entradaEspecieHoje + reaj_esp - saiu_esp;

    // Salvar no banco (via função centralizada)
    await recalcularSaldoDia(supabase, dataISO);
  }

  // Totais do dia
  const { data: todasVendas } = await supabase
    .from("vendas")
    .select("preco_vendido, lucro, custo, origem, tipo, margem_pct")
    .eq("data", dataISO);

  const all = (todasVendas ?? []) as { preco_vendido: number; lucro: number; custo: number; origem: string; tipo: string; margem_pct: number }[];
  const totalVendas = all.length;
  const faturamento = all.reduce((s, v) => s + Number(v.preco_vendido), 0);
  const custoTotal = all.reduce((s, v) => s + Number(v.custo), 0);
  const lucroTotal = all.reduce((s, v) => s + Number(v.lucro), 0);
  const margemMedia = totalVendas > 0 ? all.reduce((s, v) => s + Number(v.margem_pct), 0) / totalVendas : 0;

  // Por origem
  const porOrigem: Record<string, { qty: number; receita: number }> = {};
  const porTipo: Record<string, { qty: number; receita: number }> = {};
  for (const v of all) {
    const o = v.origem || "NAO_INFORMARAM";
    if (!porOrigem[o]) porOrigem[o] = { qty: 0, receita: 0 };
    porOrigem[o].qty++;
    porOrigem[o].receita += Number(v.preco_vendido);
    const t = v.tipo || "VENDA";
    if (!porTipo[t]) porTipo[t] = { qty: 0, receita: 0 };
    porTipo[t].qty++;
    porTipo[t].receita += Number(v.preco_vendido);
  }
  const upgradesHoje = (porTipo["UPGRADE"]?.qty || 0);

  // Gastos detalhados
  const { data: gastosAll } = await supabase
    .from("gastos")
    .select("categoria, descricao, valor, banco")
    .eq("data", dataISO)
    .eq("tipo", "SAIDA");

  const gastosDetalhados = ((gastosAll ?? []) as { categoria: string; descricao: string; valor: number; banco: string }[]);
  const totalGastos = gastosDetalhados.reduce((s, g) => s + Number(g.valor), 0);

  // Pagamentos a fornecedores
  const pagFornecedores = gastosDetalhados.filter(g => g.categoria === "FORNECEDOR");
  const totalPagFornecedores = pagFornecedores.reduce((s, g) => s + Number(g.valor), 0);

  // Valor em estoque
  const { data: estoqueData } = await supabase
    .from("estoque")
    .select("custo_unitario, qnt")
    .eq("status", "EM ESTOQUE");

  const valorEstoque = (estoqueData ?? []).reduce((s, e) => s + Number(e.custo_unitario) * Number(e.qnt), 0);

  return {
    data: dataISO,
    itau_base, inf_base, mp_base,
    pix_itau, pix_inf, pix_mp, pix_esp,
    d1_itau, d1_inf, d1_mp,
    reaj_itau, reaj_inf, reaj_mp, reaj_esp,
    saiu_itau, saiu_inf, saiu_mp, saiu_esp,
    esp_itau, esp_inf, esp_mp, esp_especie,
    totalVendas, lucroTotal,
    faturamento, custoTotal, margemMedia,
    porOrigem, porTipo, upgradesHoje,
    gastosDetalhados, totalGastos,
    pagFornecedores, totalPagFornecedores,
    valorEstoque,
  };
}

/**
 * Gera o relatório /manha — Conferência Bancária.
 */
export async function gerarManha(
  supabase: SupabaseClient,
  dataISO: string
): Promise<ReportManha> {
  const hoje = new Date(dataISO + "T12:00:00");
  const ontem = new Date(hoje);
  ontem.setDate(ontem.getDate() - 1);
  const ontemISO = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, "0")}-${String(ontem.getDate()).padStart(2, "0")}`;

  // 1. Fechamento da noite anterior
  const { data: saldoOntem } = await supabase
    .from("saldos_bancarios")
    .select("*")
    .eq("data", ontemISO)
    .single();

  const esp_itau_ontem = Number(saldoOntem?.esp_itau ?? 0);
  const esp_inf_ontem = Number(saldoOntem?.esp_inf ?? 0);
  const esp_mp_ontem = Number(saldoOntem?.esp_mp ?? 0);
  const esp_especie_ontem = Number(saldoOntem?.esp_especie ?? 0);

  // 2. Créditos D+1 que entram hoje (lookback 4 dias para cobrir fim de semana)
  const quatroDiasAtras = new Date(hoje);
  quatroDiasAtras.setDate(quatroDiasAtras.getDate() - 4);
  const quatroDiasISO = `${quatroDiasAtras.getFullYear()}-${String(quatroDiasAtras.getMonth() + 1).padStart(2, "0")}-${String(quatroDiasAtras.getDate()).padStart(2, "0")}`;

  const { data: vendasD1 } = await supabase
    .from("vendas")
    .select("*")
    .eq("recebimento", "D+1")
    .gte("data", quatroDiasISO)
    .lt("data", dataISO);

  let creditos_itau = 0, creditos_inf = 0, creditos_mp = 0;
  const d1rows = (vendasD1 ?? []) as Venda[];
  // Deduplicar comprovantes: quando 1 pagamento cobre múltiplos produtos,
  // todas as vendas têm o mesmo valor_comprovante — contar apenas 1x
  const comprovantesContados = new Set<string>();

  for (const v of d1rows) {
    const dataReceb = proximoDiaUtil(new Date(v.data + "T12:00:00"));
    const recebISO = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, "0")}-${String(dataReceb.getDate()).padStart(2, "0")}`;
    if (recebISO === dataISO) {
      const comprovante = Number(v.valor_comprovante || 0);
      if (comprovante > 0) {
        // Deduplicar por ID da venda (cada registro = 1 produto/1 comprovante)
        // Não deduplicar por valor — produtos iguais podem ter mesmo comprovante
        const chave = v.id || `${v.banco}_${v.cliente}_${comprovante}_${v.data}_${v.produto}`;
        if (comprovantesContados.has(chave)) continue;
        comprovantesContados.add(chave);

        const taxa = getTaxa(v.banco || "", v.bandeira || "", Number(v.qnt_parcelas || 1), v.forma || "");
        const val = calcularLiquido(comprovante, taxa);
        if (v.banco === "ITAU") creditos_itau += val;
        else if (v.banco === "INFINITE") creditos_inf += val;
        else if (v.banco === "MERCADO_PAGO") creditos_mp += val;
      } else {
        // Fallback: preco_vendido - partes que já entraram no D+0 (PIX, espécie, troca)
        const val = Number(v.preco_vendido) - Number(v.entrada_pix || 0) - Number(v.entrada_especie || 0) - Number(v.produto_na_troca || 0);
        if (val > 0) {
          if (v.banco === "ITAU") creditos_itau += val;
          else if (v.banco === "INFINITE") creditos_inf += val;
          else if (v.banco === "MERCADO_PAGO") creditos_mp += val;
        }
      }
    }
  }

  // 3. Saldo esperado
  const saldo_itau = esp_itau_ontem + creditos_itau;
  const saldo_inf = esp_inf_ontem + creditos_inf;
  const saldo_mp = esp_mp_ontem + creditos_mp;
  const saldo_especie = esp_especie_ontem;

  // 4. Vendas do mês
  const inicioMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: vendasMes } = await supabase
    .from("vendas")
    .select("preco_vendido, lucro")
    .gte("data", inicioMes)
    .lte("data", dataISO);

  const mesRows = (vendasMes ?? []) as { preco_vendido: number; lucro: number }[];
  const faturamentoMes = mesRows.reduce((s, v) => s + Number(v.preco_vendido), 0);

  // 5. Fiado pendente
  const { data: fiadoData } = await supabase
    .from("vendas")
    .select("cliente, preco_vendido, data")
    .eq("recebimento", "FIADO")
    .neq("status_pagamento", "FINALIZADO");

  const fiadoPendente = (fiadoData ?? []).map((v: { cliente: string; preco_vendido: number; data: string }) => ({
    cliente: v.cliente, valor: Number(v.preco_vendido), data: v.data,
  }));
  const totalFiado = fiadoPendente.reduce((s, f) => s + f.valor, 0);

  // 6. Estoque
  const { data: estoqueEmEstoque } = await supabase
    .from("estoque")
    .select("custo_unitario, qnt")
    .eq("status", "EM ESTOQUE");
  const valorEstoque = (estoqueEmEstoque ?? []).reduce((s, e) => s + Number(e.custo_unitario) * Number(e.qnt), 0);

  const { data: estoqueACaminho } = await supabase
    .from("estoque")
    .select("custo_unitario, qnt")
    .eq("status", "A CAMINHO");
  const valorACaminho = (estoqueACaminho ?? []).reduce((s, e) => s + Number(e.custo_unitario) * Number(e.qnt), 0);

  const { data: estoquePendencias } = await supabase
    .from("estoque")
    .select("custo_unitario, qnt")
    .eq("status", "PENDENCIA");
  const valorPendencias = (estoquePendencias ?? []).reduce((s, e) => s + Number(e.custo_unitario) * Number(e.qnt), 0);

  const capitalProdutos = valorEstoque + valorACaminho + valorPendencias;

  // Saldo bancário total e patrimônio
  const saldoBancarioTotal = saldo_itau + saldo_inf + saldo_mp + saldo_especie;
  const patrimonioTotal = saldoBancarioTotal + capitalProdutos;

  // Fim de semana?
  const dayOfWeek = hoje.getDay(); // 0=Sun, 6=Sat
  const isFimDeSemana = dayOfWeek === 0 || dayOfWeek === 6;

  // Créditos pendentes (para próximo dia útil se fim de semana)
  let creditosPendentes_itau = 0, creditosPendentes_inf = 0, creditosPendentes_mp = 0;
  let dataPendentes = "";
  if (isFimDeSemana) {
    const proxDiaUtil = proximoDiaUtil(hoje);
    dataPendentes = `${String(proxDiaUtil.getDate()).padStart(2, "0")}/${String(proxDiaUtil.getMonth() + 1).padStart(2, "0")}`;
    // Pegar D+1 de hoje e ontem que vão pro próximo dia útil
    const proxDiaISO = `${proxDiaUtil.getFullYear()}-${String(proxDiaUtil.getMonth() + 1).padStart(2, "0")}-${String(proxDiaUtil.getDate()).padStart(2, "0")}`;
    const { data: vendasPendD1 } = await supabase
      .from("vendas")
      .select("*")
      .eq("recebimento", "D+1")
      .gte("data", quatroDiasISO)
      .lte("data", dataISO);

    for (const v of (vendasPendD1 ?? []) as Venda[]) {
      const dataReceb = proximoDiaUtil(new Date(v.data + "T12:00:00"));
      const recebISO = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, "0")}-${String(dataReceb.getDate()).padStart(2, "0")}`;
      if (recebISO === proxDiaISO) {
        const comprovante = Number(v.valor_comprovante || 0);
        if (comprovante > 0) {
          const taxa = getTaxa(v.banco || "", v.bandeira || "", Number(v.qnt_parcelas || 1), v.forma || "");
          const val = calcularLiquido(comprovante, taxa);
          if (v.banco === "ITAU") creditosPendentes_itau += val;
          else if (v.banco === "INFINITE") creditosPendentes_inf += val;
          else if (v.banco === "MERCADO_PAGO") creditosPendentes_mp += val;
        }
      }
    }
  }

  return {
    data: dataISO,
    esp_itau_ontem, esp_inf_ontem, esp_mp_ontem, esp_especie_ontem,
    creditos_itau, creditos_inf, creditos_mp,
    saldo_itau, saldo_inf, saldo_mp, saldo_especie,
    vendasMes: mesRows.length,
    lucroMes: mesRows.reduce((s, v) => s + Number(v.lucro), 0),
    faturamentoMes,
    fiadoPendente, totalFiado,
    valorEstoque, valorACaminho, valorPendencias, capitalProdutos,
    saldoBancarioTotal, patrimonioTotal,
    isFimDeSemana,
    creditosPendentes_itau, creditosPendentes_inf, creditosPendentes_mp, dataPendentes,
  };
}
