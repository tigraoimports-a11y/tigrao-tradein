import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const searchTerm = `%${q}%`;

  // Search estoque by serial_no and imei
  const { data: estoqueResults } = await supabase
    .from("estoque")
    .select("id, produto, categoria, cor, qnt, custo_unitario, status, tipo, fornecedor, imei, serial_no, data_compra, data_entrada, observacao, bateria")
    .or(`serial_no.ilike.${searchTerm},imei.ilike.${searchTerm}`)
    .order("data_entrada", { ascending: false })
    .limit(50);

  // Search vendas by serial_no and imei
  const { data: vendasResults } = await supabase
    .from("vendas")
    .select("id, produto, cliente, preco_vendido, custo, data, forma, banco, status_pagamento, tipo, serial_no, imei, fornecedor, qnt_parcelas, lucro")
    .or(`serial_no.ilike.${searchTerm},imei.ilike.${searchTerm}`)
    .order("data", { ascending: false })
    .limit(50);

  // Build unified results with timeline info
  const results = [];

  for (const e of estoqueResults ?? []) {
    let location = "em_estoque";
    if (e.status === "A CAMINHO") location = "a_caminho";
    else if (e.status === "VENDIDO") location = "vendido";
    else if (e.status === "PENDENTE") location = "pendente";

    results.push({
      source: "estoque" as const,
      location,
      id: e.id,
      produto: e.produto,
      status: e.status,
      cor: e.cor,
      custo: e.custo_unitario,
      fornecedor: e.fornecedor,
      imei: e.imei,
      serial_no: e.serial_no,
      data_compra: e.data_compra,
      data_entrada: e.data_entrada,
      categoria: e.categoria,
      tipo_produto: e.tipo,
      observacao: e.observacao,
      bateria: e.bateria,
      qnt: e.qnt,
    });
  }

  for (const v of vendasResults ?? []) {
    results.push({
      source: "venda" as const,
      location: "vendido",
      id: v.id,
      produto: v.produto,
      status: v.status_pagamento || "FINALIZADO",
      custo: v.custo,
      cliente: v.cliente,
      preco_vendido: v.preco_vendido,
      lucro: v.lucro ?? (v.preco_vendido && v.custo ? v.preco_vendido - v.custo : undefined),
      data: v.data,
      forma: v.forma,
      banco: v.banco,
      tipo_venda: v.tipo,
      serial_no: v.serial_no,
      imei: v.imei,
      fornecedor: v.fornecedor,
      parcelas: v.qnt_parcelas,
    });
  }

  return NextResponse.json({ results, total: results.length });
}
