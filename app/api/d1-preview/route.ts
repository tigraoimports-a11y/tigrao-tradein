import { NextRequest, NextResponse } from "next/server";
import { proximoDiaUtil } from "@/lib/business-days";
import { getTaxa, calcularLiquido } from "@/lib/taxas";

export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { supabase } = await import("@/lib/supabase");

  // Calcular próximo dia útil a partir de hoje
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const proxDiaUtil = proximoDiaUtil(hoje);
  const proxDiaUtilISO = `${proxDiaUtil.getFullYear()}-${String(proxDiaUtil.getMonth() + 1).padStart(2, "0")}-${String(proxDiaUtil.getDate()).padStart(2, "0")}`;

  // Buscar vendas D+1 dos últimos 7 dias (incluindo hoje)
  const seteDiasAtras = new Date(hoje);
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
  const seteDiasISO = `${seteDiasAtras.getFullYear()}-${String(seteDiasAtras.getMonth() + 1).padStart(2, "0")}-${String(seteDiasAtras.getDate()).padStart(2, "0")}`;

  const { data: vendasD1 } = await supabase
    .from("vendas")
    .select("id, data, banco, bandeira, qnt_parcelas, forma, valor_comprovante, preco_vendido, entrada_pix, entrada_especie, produto_na_troca, cliente, produto")
    .eq("recebimento", "D+1")
    .gte("data", seteDiasISO)
    .lte("data", hojeISO)
    .neq("status_pagamento", "CANCELADO");

  let d1_itau = 0, d1_inf = 0, d1_mp = 0;
  const contados = new Set<string>();

  for (const v of (vendasD1 ?? [])) {
    const dataReceb = proximoDiaUtil(new Date(v.data + "T12:00:00"));
    const recebISO = `${dataReceb.getFullYear()}-${String(dataReceb.getMonth() + 1).padStart(2, "0")}-${String(dataReceb.getDate()).padStart(2, "0")}`;

    if (recebISO !== proxDiaUtilISO) continue;

    const comprovante = Number(v.valor_comprovante || 0);
    if (comprovante > 0) {
      const chave = v.id || `${v.banco}_${v.cliente}_${comprovante}_${v.data}_${v.produto}`;
      if (contados.has(chave)) continue;
      contados.add(chave);
      const taxa = getTaxa(v.banco || "", v.bandeira || "", Number(v.qnt_parcelas || 1), v.forma || "");
      const val = calcularLiquido(comprovante, taxa);
      if (v.banco === "ITAU") d1_itau += val;
      else if (v.banco === "INFINITE") d1_inf += val;
      else if (v.banco === "MERCADO_PAGO") d1_mp += val;
    } else {
      const val = Number(v.preco_vendido || 0) - Number(v.entrada_pix || 0) - Number(v.entrada_especie || 0) - Number(v.produto_na_troca || 0);
      if (val > 0) {
        if (v.banco === "ITAU") d1_itau += val;
        else if (v.banco === "INFINITE") d1_inf += val;
        else if (v.banco === "MERCADO_PAGO") d1_mp += val;
      }
    }
  }

  return NextResponse.json({
    data: proxDiaUtilISO,
    d1_itau: Math.round(d1_itau * 100) / 100,
    d1_inf: Math.round(d1_inf * 100) / 100,
    d1_mp: Math.round(d1_mp * 100) / 100,
    total: Math.round((d1_itau + d1_inf + d1_mp) * 100) / 100,
  });
}
