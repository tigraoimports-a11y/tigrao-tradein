// ============================================
// Recálculo automático de saldos bancários
// ============================================

import { SupabaseClient } from "@supabase/supabase-js";
import { proximoDiaUtil } from "./business-days";
import { getTaxa, calcularLiquido } from "./taxas";
import type { Venda } from "./admin-types";

function sumByBancoField(rows: { valor: number; banco: string | null }[], banco: string): number {
  return rows.filter((r) => r.banco === banco).reduce((s, r) => s + Number(r.valor), 0);
}

/**
 * Recalcula e grava os saldos bancários (esp_*) de um dia específico.
 * Chamado automaticamente após criar/editar/excluir gastos ou vendas.
 *
 * Lógica: base (manhã ou fechamento anterior) + PIX D+0 + D+1 + reajustes - gastos
 */
export async function recalcularSaldoDia(
  supabase: SupabaseClient,
  dataISO: string
): Promise<void> {
  // 1. Ler saldos base da manhã
  const { data: saldoRow } = await supabase
    .from("saldos_bancarios")
    .select("*")
    .eq("data", dataISO)
    .single();

  // Se manual, não recalcular
  if (saldoRow?.manual === true) return;

  let itau_base = Number(saldoRow?.itau_base ?? 0);
  let inf_base = Number(saldoRow?.inf_base ?? 0);
  let mp_base = Number(saldoRow?.mp_base ?? 0);
  let esp_especie_base = Number(saldoRow?.esp_especie ?? 0);

  // Se bases são todas zero, carregar fechamento do dia anterior
  if (!saldoRow || (itau_base === 0 && inf_base === 0 && mp_base === 0)) {
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

  // 2. Vendas D+0 (PIX, débito, dinheiro)
  const { data: vendasD0 } = await supabase
    .from("vendas")
    .select("*")
    .eq("data", dataISO)
    .eq("recebimento", "D+0");

  const d0 = (vendasD0 ?? []) as Venda[];
  let pix_itau = d0.filter((v) => v.banco === "ITAU").reduce((s, v) => s + Number(v.preco_vendido), 0);
  let pix_inf = d0.filter((v) => v.banco === "INFINITE").reduce((s, v) => s + Number(v.preco_vendido), 0);
  let pix_mp = d0.filter((v) => v.banco === "MERCADO_PAGO").reduce((s, v) => s + Number(v.preco_vendido), 0);
  let pix_esp = d0.filter((v) => v.banco === "ESPECIE").reduce((s, v) => s + Number(v.preco_vendido), 0);

  // 2b. Entradas PIX/espécie de vendas D+1 de hoje (PIX entra D+0, cartão D+1)
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

  // 3. Créditos D+1 que caem neste dia
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
  const seen = new Set<string>();

  for (const v of d1rows) {
    const dataReceb = proximoDiaUtil(new Date(v.data + "T12:00:00"));
    const recebISO = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, "0")}-${String(dataReceb.getDate()).padStart(2, "0")}`;
    if (recebISO === dataISO) {
      const comprovante = Number(v.valor_comprovante || 0);
      if (comprovante > 0) {
        const chave = v.id || `${v.banco}_${v.cliente}_${comprovante}_${v.data}_${v.produto}`;
        if (seen.has(chave)) continue;
        seen.add(chave);
        const taxa = getTaxa(v.banco || "", v.bandeira || "", Number(v.qnt_parcelas || 1), v.forma || "");
        const val = calcularLiquido(comprovante, taxa);
        if (v.banco === "ITAU") d1_itau += val;
        else if (v.banco === "INFINITE") d1_inf += val;
        else if (v.banco === "MERCADO_PAGO") d1_mp += val;
      } else {
        const val = Number(v.preco_vendido) - Number(v.entrada_pix || 0) - Number(v.entrada_especie || 0) - Number(v.produto_na_troca || 0);
        if (val > 0) {
          if (v.banco === "ITAU") d1_itau += val;
          else if (v.banco === "INFINITE") d1_inf += val;
          else if (v.banco === "MERCADO_PAGO") d1_mp += val;
        }
      }
    }
  }

  // 4. Reajustes
  const { data: reajustes } = await supabase
    .from("reajustes")
    .select("*")
    .eq("data", dataISO);

  const reajRows = (reajustes ?? []) as { valor: number; banco: string | null }[];
  const reaj_itau = sumByBancoField(reajRows, "ITAU");
  const reaj_inf = sumByBancoField(reajRows, "INFINITE");
  const reaj_mp = sumByBancoField(reajRows, "MERCADO_PAGO");
  const reaj_esp = sumByBancoField(reajRows, "ESPECIE");

  // 5. Gastos (saídas normais, excluindo depósitos de espécie)
  const { data: gastos } = await supabase
    .from("gastos")
    .select("*")
    .eq("data", dataISO)
    .eq("tipo", "SAIDA")
    .or("is_dep_esp.is.null,is_dep_esp.eq.false");

  const gastoRows = (gastos ?? []) as { valor: number; banco: string | null }[];
  const saiu_itau = sumByBancoField(gastoRows, "ITAU");
  const saiu_inf = sumByBancoField(gastoRows, "INFINITE");
  const saiu_mp = sumByBancoField(gastoRows, "MERCADO_PAGO");
  const saiu_esp = sumByBancoField(gastoRows, "ESPECIE");

  // 5a. Depósitos de espécie no banco (is_dep_esp = true)
  // banco indica DESTINO do depósito, dinheiro SAI do caixa espécie
  const { data: depositos } = await supabase
    .from("gastos")
    .select("*")
    .eq("data", dataISO)
    .eq("is_dep_esp", true);

  const depRows = (depositos ?? []) as { valor: number; banco: string | null }[];
  const dep_itau = sumByBancoField(depRows, "ITAU");
  const dep_inf = sumByBancoField(depRows, "INFINITE");
  const dep_mp = sumByBancoField(depRows, "MERCADO_PAGO");
  const dep_esp_total = depRows.reduce((s, r) => s + Number(r.valor), 0);

  // 5b. Entrada em espécie de vendas
  const { data: todasVendasHoje } = await supabase
    .from("vendas")
    .select("entrada_especie")
    .eq("data", dataISO)
    .neq("status_pagamento", "CANCELADO");
  const entradaEspecieHoje = (todasVendasHoje ?? []).reduce((s: number, v: { entrada_especie: number }) => s + Number(v.entrada_especie || 0), 0);

  // 6. Calcular saldos finais (depósitos: entram no banco, saem do caixa)
  const esp_itau = itau_base + pix_itau + d1_itau + reaj_itau - saiu_itau + dep_itau;
  const esp_inf = inf_base + pix_inf + d1_inf + reaj_inf - saiu_inf + dep_inf;
  const esp_mp = mp_base + pix_mp + d1_mp + reaj_mp - saiu_mp + dep_mp;
  const esp_especie = esp_especie_base + pix_esp + entradaEspecieHoje + reaj_esp - saiu_esp - dep_esp_total;

  // 7. Gravar
  await supabase.from("saldos_bancarios").upsert({
    data: dataISO,
    itau_base,
    inf_base,
    mp_base,
    esp_itau,
    esp_inf,
    esp_mp,
    esp_especie,
    manual: false,
  }, { onConflict: "data" });
}
