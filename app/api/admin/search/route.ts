import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const includeHistory = searchParams.get("history") === "true";

  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const searchTerm = `%${q}%`;

  // Buscar em produtos_individuais (seriais/IMEI ficam aqui)
  const { data: prodIndividuais } = await supabase
    .from("produtos_individuais")
    .select("id, serial_no, imei, produto, categoria, cor, custo_unitario, status, fornecedor, estoque_id, venda_id, data_entrada")
    .or(`serial_no.ilike.${searchTerm},imei.ilike.${searchTerm},produto.ilike.${searchTerm}`)
    .order("data_entrada", { ascending: false })
    .limit(20);

  // Buscar no estoque (sem serial_no/imei que não existem aqui)
  const { data: estoqueResults } = await supabase
    .from("estoque")
    .select("id, produto, categoria, cor, qnt, custo_unitario, status, tipo, fornecedor, data_compra, data_entrada, observacao, bateria")
    .or(`produto.ilike.${searchTerm},fornecedor.ilike.${searchTerm},cor.ilike.${searchTerm}`)
    .order("data_entrada", { ascending: false })
    .limit(30);

  // Buscar nas vendas
  const { data: vendasResults } = await supabase
    .from("vendas")
    .select("id, produto, cliente, preco_vendido, custo, data, forma, banco, status_pagamento, tipo, origem, bandeira, qnt_parcelas, entrada_pix, entrada_especie, produto_na_troca, banco_pix")
    .or(`produto.ilike.${searchTerm},cliente.ilike.${searchTerm}`)
    .order("data", { ascending: false })
    .limit(includeHistory ? 50 : 20);

  // Montar resultados
  const results = [];

  // Produtos individuais (seriais/IMEI)
  for (const pi of prodIndividuais ?? []) {
    results.push({
      tipo: "produto_individual" as const,
      id: pi.id,
      produto: pi.produto,
      status: pi.status,
      cor: pi.cor,
      custo: pi.custo_unitario,
      fornecedor: pi.fornecedor,
      imei: pi.imei,
      serial_no: pi.serial_no,
      data_entrada: pi.data_entrada,
      categoria: pi.categoria,
      estoque_id: pi.estoque_id,
      venda_id: pi.venda_id,
    });
  }

  for (const e of estoqueResults ?? []) {
    results.push({
      tipo: "estoque" as const,
      id: e.id,
      produto: e.produto,
      status: e.status,
      cor: e.cor,
      custo: e.custo_unitario,
      fornecedor: e.fornecedor,
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
      tipo: "venda" as const,
      id: v.id,
      produto: v.produto,
      status: v.status_pagamento || "FINALIZADO",
      custo: v.custo,
      cliente: v.cliente,
      preco_vendido: v.preco_vendido,
      lucro: v.preco_vendido && v.custo ? v.preco_vendido - v.custo : undefined,
      margem: v.preco_vendido && v.custo && v.preco_vendido > 0
        ? ((v.preco_vendido - v.custo) / v.preco_vendido * 100)
        : undefined,
      data: v.data,
      forma: v.forma,
      banco: v.banco,
      tipo_venda: v.tipo,
      origem: v.origem,
      bandeira: v.bandeira,
      parcelas: v.qnt_parcelas,
      entrada_pix: v.entrada_pix,
      entrada_especie: v.entrada_especie,
      produto_na_troca: v.produto_na_troca,
    });
  }

  return NextResponse.json({ results });
}
