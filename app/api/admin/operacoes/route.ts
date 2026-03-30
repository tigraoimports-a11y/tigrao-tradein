import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const search = searchParams.get("search")?.trim();
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  // Buscar vendas (saídas) agrupadas por cliente+data
  let vendasQuery = supabase
    .from("vendas")
    .select("id, cliente, produto, data, preco_vendido, custo, serial_no, imei, tipo, created_at")
    .neq("status_pagamento", "CANCELADO")
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });

  if (search) {
    vendasQuery = vendasQuery.or(`cliente.ilike.%${search}%,produto.ilike.%${search}%`);
  }

  const { data: vendas } = await vendasQuery.limit(2000);

  // Buscar entradas do estoque (fornecedor + data)
  let estoqueQuery = supabase
    .from("estoque")
    .select("id, produto, categoria, fornecedor, data_compra, data_entrada, custo_unitario, serial_no, imei, cor, tipo, created_at")
    .order("data_compra", { ascending: false });

  if (search) {
    estoqueQuery = estoqueQuery.or(`fornecedor.ilike.%${search}%,produto.ilike.%${search}%`);
  }

  const { data: estoque } = await estoqueQuery.limit(2000);

  // Agrupar vendas por cliente+data = 1 operação de saída
  const saidaMap = new Map<string, {
    contato: string;
    data: string;
    itens: { id: string; produto: string; serial_no: string | null; imei: string | null; preco: number; custo: number; tipo_venda: string | null; cor: string | null }[];
    created_at: string;
  }>();

  for (const v of vendas ?? []) {
    const key = `${v.data}|${(v.cliente || "").toUpperCase()}`;
    if (!saidaMap.has(key)) {
      saidaMap.set(key, {
        contato: v.cliente || "?",
        data: v.data,
        itens: [],
        created_at: v.created_at,
      });
    }
    saidaMap.get(key)!.itens.push({
      id: v.id,
      produto: v.produto,
      serial_no: v.serial_no,
      imei: v.imei,
      preco: Number(v.preco_vendido || 0),
      custo: Number(v.custo || 0),
      tipo_venda: v.tipo,
      cor: null,
    });
  }

  // Agrupar estoque por fornecedor+data = 1 operação de entrada
  const entradaMap = new Map<string, {
    contato: string;
    data: string;
    itens: { id: string; produto: string; serial_no: string | null; imei: string | null; preco: number; custo: number; tipo_venda: string | null; cor: string | null }[];
    created_at: string;
  }>();

  for (const e of estoque ?? []) {
    const dataRef = e.data_entrada || e.data_compra;
    if (!dataRef || !e.fornecedor) continue;
    const key = `${dataRef}|${(e.fornecedor || "").toUpperCase()}`;
    if (!entradaMap.has(key)) {
      entradaMap.set(key, {
        contato: e.fornecedor || "?",
        data: dataRef,
        itens: [],
        created_at: e.created_at,
      });
    }
    entradaMap.get(key)!.itens.push({
      id: e.id,
      produto: e.produto,
      serial_no: e.serial_no,
      imei: e.imei,
      preco: Number(e.custo_unitario || 0),
      custo: Number(e.custo_unitario || 0),
      tipo_venda: e.tipo,
      cor: e.cor,
    });
  }

  // Montar lista de operações
  interface Operacao {
    codigo: string;
    data: string;
    tipo: "Entrada" | "Saída";
    contato: string;
    itens: { id: string; produto: string; serial_no: string | null; imei: string | null; preco: number; custo: number; tipo_venda: string | null; cor: string | null }[];
    total_itens: number;
    valor_total: number;
    status: string;
    created_at: string;
  }

  const operacoes: Operacao[] = [];

  if (tipo !== "entrada") {
    let idx = 0;
    for (const [, op] of saidaMap) {
      const ts = new Date(op.created_at).getTime();
      operacoes.push({
        codigo: `OP-S${ts}${String(idx++).padStart(3, "0")}`,
        data: op.data,
        tipo: "Saída",
        contato: op.contato,
        itens: op.itens,
        total_itens: op.itens.length,
        valor_total: op.itens.reduce((s, i) => s + i.preco, 0),
        status: "Concluida",
        created_at: op.created_at,
      });
    }
  }

  if (tipo !== "saida") {
    let idx = 0;
    for (const [, op] of entradaMap) {
      const ts = new Date(op.created_at).getTime();
      operacoes.push({
        codigo: `OP-E${ts}${String(idx++).padStart(3, "0")}`,
        data: op.data,
        tipo: "Entrada",
        contato: op.contato,
        itens: op.itens,
        total_itens: op.itens.length,
        valor_total: op.itens.reduce((s, i) => s + i.preco, 0),
        status: "Concluida",
        created_at: op.created_at,
      });
    }
  }

  // Ordenar por data desc
  operacoes.sort((a, b) => b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at));

  // Paginar
  const paginated = operacoes.slice(offset, offset + limit);

  return NextResponse.json({ operacoes: paginated, total: operacoes.length });
}
