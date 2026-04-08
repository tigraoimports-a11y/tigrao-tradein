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

  if (!q || q.length < 2) return NextResponse.json({ operacoes: [], contatos: [], estoque: [], vendas: [] });

  const searchTerm = `%${q}%`;

  // ── 1. Buscar no estoque (produtos com serial/IMEI) ──
  const { data: estoqueResults } = await supabase
    .from("estoque")
    .select("id, produto, categoria, cor, qnt, custo_unitario, status, tipo, fornecedor, data_compra, data_entrada, observacao, bateria, serial_no, imei, origem, garantia, troca_id")
    .or(`produto.ilike.${searchTerm},fornecedor.ilike.${searchTerm},cliente.ilike.${searchTerm},cor.ilike.${searchTerm},serial_no.ilike.${searchTerm},imei.ilike.${searchTerm}`)
    .order("data_entrada", { ascending: false })
    .limit(30);

  // ── 2. Buscar nas vendas (inclui fornecedor para entradas/recompras) ──
  const { data: vendasResults } = await supabase
    .from("vendas")
    .select("id, produto, cliente, fornecedor, preco_vendido, custo, data, forma, banco, status_pagamento, tipo, origem, serial_no, imei, cpf, email")
    .or(`produto.ilike.${searchTerm},cliente.ilike.${searchTerm},serial_no.ilike.${searchTerm},imei.ilike.${searchTerm},fornecedor.ilike.${searchTerm}`)
    .neq("status_pagamento", "CANCELADO")
    .order("data", { ascending: false })
    .limit(includeHistory ? 100 : 30);

  // ── 3. Montar contatos (clientes únicos das vendas) ──
  const contatosMap = new Map<string, { nome: string; cpf: string | null; email: string | null; tipo: string; origem: string; total_compras: number }>();
  for (const v of vendasResults ?? []) {
    const name = (v.cliente || "").trim().toUpperCase();
    if (!name) continue;
    if (!contatosMap.has(name)) {
      contatosMap.set(name, {
        nome: name,
        cpf: v.cpf && v.cpf !== "N/A" && v.cpf !== "000.000.000-00" ? v.cpf : null,
        email: v.email && v.email !== "N/A" ? v.email : null,
        tipo: v.tipo || "VENDA",
        origem: v.origem || "",
        total_compras: 1,
      });
    } else {
      const c = contatosMap.get(name)!;
      c.total_compras++;
      if (!c.cpf && v.cpf && v.cpf !== "N/A" && v.cpf !== "000.000.000-00") c.cpf = v.cpf;
      if (!c.email && v.email && v.email !== "N/A") c.email = v.email;
      if (v.origem === "ATACADO" || v.tipo === "ATACADO") c.origem = "ATACADO";
    }
  }
  // Filtrar contatos que realmente combinam com a busca (por nome)
  const contatos = [...contatosMap.values()].filter(c => c.nome.includes(q.toUpperCase())).slice(0, 15);

  const qUpper = q.toUpperCase();

  // ── 4. Montar operações (vendas agrupadas por cliente+data) ──
  const opMap = new Map<string, {
    contato: string; data: string; tipo: "Saída" | "Entrada"; total_itens: number; valor_total: number; created_at: string;
  }>();
  for (const v of vendasResults ?? []) {
    const isTradein =
      v.fornecedor && v.fornecedor.toUpperCase().includes(qUpper) &&
      !(v.cliente || "").toUpperCase().includes(qUpper) &&
      !(v.produto || "").toUpperCase().includes(qUpper) &&
      !(v.serial_no || "").toUpperCase().includes(qUpper) &&
      !(v.imei || "").toUpperCase().includes(qUpper);

    if (isTradein) {
      // Agrupar como Entrada do fornecedor (trade-in recebido)
      const key = `TRADEIN|${v.data}|${(v.fornecedor || "").toUpperCase()}`;
      if (!opMap.has(key)) {
        opMap.set(key, { contato: v.fornecedor || "?", data: v.data, tipo: "Entrada", total_itens: 0, valor_total: 0, created_at: v.data });
      }
      const op = opMap.get(key)!;
      op.total_itens++;
      op.valor_total += Number(v.custo || 0);
    } else {
      // Venda normal — agrupar por cliente+data
      const key = `${v.data}|${(v.cliente || "").toUpperCase()}`;
      if (!opMap.has(key)) {
        opMap.set(key, { contato: v.cliente || "?", data: v.data, tipo: "Saída", total_itens: 0, valor_total: 0, created_at: v.data });
      }
      const op = opMap.get(key)!;
      op.total_itens++;
      op.valor_total += Number(v.preco_vendido || 0);
    }
  }
  // Também agrupar entradas do estoque por fornecedor+data
  for (const e of estoqueResults ?? []) {
    const dataRef = e.data_entrada || e.data_compra;
    if (!dataRef || !e.fornecedor) continue;
    const key = `E|${dataRef}|${(e.fornecedor || "").toUpperCase()}`;
    if (!opMap.has(key)) {
      opMap.set(key, { contato: e.fornecedor || "?", data: dataRef, tipo: "Saída", total_itens: 0, valor_total: 0, created_at: dataRef });
    }
    const op = opMap.get(key)!;
    // Mark as Entrada
    (op as any).tipo = "Entrada";
    op.total_itens++;
    op.valor_total += Number(e.custo_unitario || 0);
  }
  // Trocas (operações OP-T) — buscar por produto/serial/imei/fornecedor
  const { data: trocasSearch } = await supabase
    .from("trocas")
    .select("id, data, motivo, fornecedor, produto_saida_nome, produto_saida_serial, produto_saida_imei, produto_entrada_nome, produto_entrada_serial, produto_entrada_imei, diferenca_valor, created_at")
    .or(`produto_saida_nome.ilike.${searchTerm},produto_entrada_nome.ilike.${searchTerm},produto_saida_serial.ilike.${searchTerm},produto_entrada_serial.ilike.${searchTerm},produto_saida_imei.ilike.${searchTerm},produto_entrada_imei.ilike.${searchTerm},fornecedor.ilike.${searchTerm}`)
    .order("created_at", { ascending: false })
    .limit(15);
  const trocasOps = (trocasSearch ?? []).map((t) => {
    const ts = new Date(t.created_at).getTime();
    return {
      codigo: `OP-T${ts}000`,
      contato: t.fornecedor || "—",
      data: t.data,
      tipo: "Troca" as const,
      total_itens: 2,
      valor_total: Number(t.diferenca_valor) || 0,
      created_at: t.created_at,
      status: "Concluída",
    };
  });

  const operacoes = [...opMap.values()]
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 15)
    .map((op, i) => ({
      codigo: `OP-${String(op.tipo) === "Entrada" ? "E" : "S"}${new Date(op.data).getTime()}${String(i).padStart(3, "0")}`,
      ...op,
      status: "Concluída",
    }))
    .concat(trocasOps as any)
    .sort((a: any, b: any) => (b.data || "").localeCompare(a.data || ""));

  // ── 4.5 Buscar trocas vinculadas aos itens de estoque ──
  const trocaIds = [...new Set((estoqueResults ?? []).map(e => e.troca_id).filter(Boolean))] as string[];
  const trocasMap = new Map<string, { id: string; data: string; motivo: string; produto_saida_nome: string; produto_saida_serial: string | null; produto_saida_imei: string | null; produto_saida_cor: string | null; fornecedor: string | null; observacao: string | null; created_at: string; codigo: string }>();
  if (trocaIds.length > 0) {
    const { data: trocasInfo } = await supabase.from("trocas").select("id, data, motivo, produto_saida_nome, produto_saida_serial, produto_saida_imei, produto_saida_cor, fornecedor, observacao, created_at").in("id", trocaIds);
    for (const t of trocasInfo ?? []) {
      const ts = new Date(t.created_at).getTime();
      trocasMap.set(t.id, { ...t, codigo: `OP-T${ts}000` });
    }
  }

  // ── 5. Montar resultados de estoque ──
  const estoque = (estoqueResults ?? []).map(e => ({
    id: e.id,
    produto: e.produto,
    status: e.status,
    cor: e.cor,
    custo: e.custo_unitario,
    fornecedor: e.fornecedor,
    serial_no: e.serial_no,
    imei: e.imei,
    data_entrada: e.data_entrada || e.data_compra,
    categoria: e.categoria,
    tipo_produto: e.tipo,
    observacao: e.observacao,
    bateria: e.bateria,
    qnt: e.qnt,
    origem: e.origem,
    garantia: e.garantia,
    troca_id: e.troca_id,
    troca_info: e.troca_id ? trocasMap.get(e.troca_id) || null : null,
  }));

  // ── 6. Montar resultados de vendas ──
  const vendas = (vendasResults ?? []).slice(0, includeHistory ? 50 : 20).map(v => {
    // Detecta se o match foi pelo fornecedor (entrada/recompra) e não pelo cliente
    const matchedByFornecedor =
      v.fornecedor && v.fornecedor.toUpperCase().includes(qUpper) &&
      !(v.cliente || "").toUpperCase().includes(qUpper) &&
      !(v.produto || "").toUpperCase().includes(qUpper) &&
      !(v.serial_no || "").toUpperCase().includes(qUpper) &&
      !(v.imei || "").toUpperCase().includes(qUpper);
    return {
      id: v.id,
      produto: v.produto,
      status: v.status_pagamento || "FINALIZADO",
      custo: v.custo,
      cliente: v.cliente,
      fornecedor: v.fornecedor,
      preco_vendido: v.preco_vendido,
      lucro: v.preco_vendido && v.custo ? v.preco_vendido - v.custo : undefined,
      data: v.data,
      forma: v.forma,
      banco: v.banco,
      tipo_venda: v.tipo,
      origem: v.origem,
      serial_no: v.serial_no,
      imei: v.imei,
      is_entrada: matchedByFornecedor,
    };
  });

  return NextResponse.json({ operacoes, contatos, estoque, vendas });
}
