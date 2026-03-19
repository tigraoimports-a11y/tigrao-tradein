// ============================================
// Lógica de Relatórios — TigrãoImports
// ============================================

import { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardParcial, ReportNoite, ReportManha, Venda } from "./admin-types";
import { proximoDiaUtil, hojeISO } from "./business-days";

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

  const itau_base = Number(saldoRow?.itau_base ?? 0);
  const inf_base = Number(saldoRow?.inf_base ?? 0);
  const mp_base = Number(saldoRow?.mp_base ?? 0);

  // 2. Vendas D+0 de hoje (PIX, dinheiro, débito)
  const { data: vendasHoje } = await supabase
    .from("vendas")
    .select("*")
    .eq("data", dataISO)
    .eq("recebimento", "D+0");

  const d0 = (vendasHoje ?? []) as Venda[];
  const pix_itau = sumByBanco(d0, "ITAU");
  const pix_inf = sumByBanco(d0, "INFINITE");
  const pix_mp = sumByBanco(d0, "MERCADO_PAGO");
  const pix_esp = sumByBanco(d0, "ESPECIE");

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

  for (const v of d1rows) {
    const dataReceb = proximoDiaUtil(new Date(v.data + "T12:00:00"));
    const recebISO = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, "0")}-${String(dataReceb.getDate()).padStart(2, "0")}`;
    if (recebISO === dataISO) {
      const val = Number(v.preco_vendido);
      if (v.banco === "ITAU") d1_itau += val;
      else if (v.banco === "INFINITE") d1_inf += val;
      else if (v.banco === "MERCADO_PAGO") d1_mp += val;
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

  // 6. Saldo final — usar valores reais informados via /saldos se existirem
  // Se esp_itau já foi preenchido (via /saldos manual), usar o valor real
  const hasManualSaldos = saldoRow?.esp_itau != null && Number(saldoRow.esp_itau) > 0;

  let esp_itau: number, esp_inf: number, esp_mp: number, esp_especie: number;

  if (hasManualSaldos) {
    // Saldos foram informados manualmente — usar como estão
    esp_itau = Number(saldoRow.esp_itau);
    esp_inf = Number(saldoRow.esp_inf);
    esp_mp = Number(saldoRow.esp_mp);
    esp_especie = Number(saldoRow.esp_especie ?? 0);
  } else {
    // Calcular a partir do saldo base + movimentações
    esp_itau = itau_base + pix_itau + d1_itau + reaj_itau - saiu_itau;
    esp_inf = inf_base + pix_inf + d1_inf + reaj_inf - saiu_inf;
    esp_mp = mp_base + pix_mp + d1_mp + reaj_mp - saiu_mp;
    esp_especie = Number(saldoRow?.esp_especie ?? 0) + pix_esp + reaj_esp - saiu_esp;

    // Salvar no banco
    await supabase.from("saldos_bancarios").upsert({
      data: dataISO,
      itau_base,
      inf_base,
      mp_base,
      esp_itau,
      esp_inf,
      esp_mp,
      esp_especie,
    }, { onConflict: "data" });
  }

  // Totais do dia
  const { data: todasVendas } = await supabase
    .from("vendas")
    .select("preco_vendido, lucro")
    .eq("data", dataISO);

  const all = (todasVendas ?? []) as { preco_vendido: number; lucro: number }[];
  const totalVendas = all.length;
  const lucroTotal = all.reduce((s, v) => s + Number(v.lucro), 0);

  return {
    data: dataISO,
    itau_base, inf_base, mp_base,
    pix_itau, pix_inf, pix_mp, pix_esp,
    d1_itau, d1_inf, d1_mp,
    reaj_itau, reaj_inf, reaj_mp, reaj_esp,
    saiu_itau, saiu_inf, saiu_mp, saiu_esp,
    esp_itau, esp_inf, esp_mp, esp_especie,
    totalVendas, lucroTotal,
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

  // 2. Créditos D+1 de ontem que entram hoje
  const { data: vendasD1 } = await supabase
    .from("vendas")
    .select("*")
    .eq("recebimento", "D+1")
    .eq("data", ontemISO);

  let creditos_itau = 0, creditos_inf = 0, creditos_mp = 0;
  const d1rows = (vendasD1 ?? []) as Venda[];

  for (const v of d1rows) {
    const dataReceb = proximoDiaUtil(new Date(v.data + "T12:00:00"));
    const recebISO = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, "0")}-${String(dataReceb.getDate()).padStart(2, "0")}`;
    if (recebISO === dataISO) {
      const val = Number(v.preco_vendido);
      if (v.banco === "ITAU") creditos_itau += val;
      else if (v.banco === "INFINITE") creditos_inf += val;
      else if (v.banco === "MERCADO_PAGO") creditos_mp += val;
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

  return {
    data: dataISO,
    esp_itau_ontem, esp_inf_ontem, esp_mp_ontem, esp_especie_ontem,
    creditos_itau, creditos_inf, creditos_mp,
    saldo_itau, saldo_inf, saldo_mp, saldo_especie,
    vendasMes: mesRows.length,
    lucroMes: mesRows.reduce((s, v) => s + Number(v.lucro), 0),
  };
}
