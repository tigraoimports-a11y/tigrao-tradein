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

  // 1. Search produtos_individuais (where serial numbers actually live)
  const { data: prodIndividuais } = await supabase
    .from("produtos_individuais")
    .select("*")
    .or(`serial_no.ilike.${searchTerm},imei.ilike.${searchTerm}`)
    .order("data_entrada", { ascending: false })
    .limit(50);

  // 2. Also search estoque by product name / IMEI (some items have imei directly)
  const { data: estoqueResults } = await supabase
    .from("estoque")
    .select("id, produto, categoria, cor, qnt, custo_unitario, status, tipo, fornecedor, data_compra, data_entrada, observacao, bateria")
    .or(`produto.ilike.${searchTerm},fornecedor.ilike.${searchTerm}`)
    .order("data_entrada", { ascending: false })
    .limit(20);

  // 3. Search vendas by product name / client
  const { data: vendasResults } = await supabase
    .from("vendas")
    .select("id, produto, cliente, preco_vendido, custo, data, forma, banco, status_pagamento, tipo, fornecedor, qnt_parcelas, lucro")
    .or(`produto.ilike.${searchTerm},cliente.ilike.${searchTerm}`)
    .order("data", { ascending: false })
    .limit(20);

  // Build unified results
  const results = [];
  const addedEstoqueIds = new Set<string>();
  const addedVendaIds = new Set<string>();

  // Process produtos_individuais (primary source for serial/IMEI search)
  for (const pi of prodIndividuais ?? []) {
    let location = "em_estoque";
    if (pi.status === "VENDIDO") location = "vendido";
    else if (pi.status === "A_CAMINHO") location = "a_caminho";
    else if (pi.status === "DEVOLVIDO") location = "devolvido";

    // Look up related venda if exists
    let vendaInfo = null;
    if (pi.venda_id) {
      const { data: venda } = await supabase
        .from("vendas")
        .select("id, cliente, preco_vendido, data, forma, banco, status_pagamento, lucro")
        .eq("id", pi.venda_id)
        .single();
      if (venda) {
        vendaInfo = venda;
        addedVendaIds.add(venda.id);
      }
    }

    results.push({
      source: "produto_individual" as const,
      location,
      id: pi.id,
      produto: pi.produto,
      status: pi.status,
      cor: pi.cor,
      custo: pi.custo_unitario,
      fornecedor: pi.fornecedor,
      imei: pi.imei,
      serial_no: pi.serial_no,
      data_compra: pi.data_compra,
      data_entrada: pi.data_entrada,
      data_saida: pi.data_saida,
      categoria: pi.categoria,
      armazenamento: pi.armazenamento,
      observacao: pi.observacao,
      estoque_id: pi.estoque_id,
      venda_id: pi.venda_id,
      // Venda info if sold
      ...(vendaInfo ? {
        cliente: vendaInfo.cliente,
        preco_vendido: vendaInfo.preco_vendido,
        data_venda: vendaInfo.data,
        forma: vendaInfo.forma,
        banco: vendaInfo.banco,
        lucro: vendaInfo.lucro,
        status_pagamento: vendaInfo.status_pagamento,
      } : {}),
    });

    if (pi.estoque_id) addedEstoqueIds.add(pi.estoque_id);
  }

  // Add estoque results not already covered by produtos_individuais
  for (const e of estoqueResults ?? []) {
    if (addedEstoqueIds.has(e.id)) continue;
    let location = "em_estoque";
    if (e.status === "A CAMINHO") location = "a_caminho";
    else if (e.status === "ESGOTADO") location = "esgotado";
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
      data_compra: e.data_compra,
      data_entrada: e.data_entrada,
      categoria: e.categoria,
      tipo_produto: e.tipo,
      observacao: e.observacao,
      bateria: e.bateria,
      qnt: e.qnt,
    });
  }

  // Add vendas results not already covered
  for (const v of vendasResults ?? []) {
    if (addedVendaIds.has(v.id)) continue;
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
      fornecedor: v.fornecedor,
      parcelas: v.qnt_parcelas,
    });
  }

  return NextResponse.json({ results, total: results.length });
}
