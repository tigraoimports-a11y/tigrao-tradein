import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim() || "";
  const tab = searchParams.get("tab") || "clientes"; // "clientes" or "lojistas"

  // Buscar todas vendas com dados do cliente
  let query = supabase
    .from("vendas")
    .select("*")
    .order("data", { ascending: false });

  // Filtrar por serial ou imei se parece código de produto
  if (search) {
    const clean = search.replace(/[\.\-\/\s]/g, "");
    // Se parece serial/imei (alfanumérico 8+ chars)
    if (/^[A-Z0-9]{8,}$/i.test(clean)) {
      query = query.or(`serial_no.ilike.%${clean}%,imei.ilike.%${clean}%,cpf.ilike.%${clean}%,cliente.ilike.%${search}%`);
    } else if (/^\d{3,}$/.test(clean)) {
      // Parece CPF
      query = query.ilike("cpf", `%${clean}%`);
    } else {
      query = query.ilike("cliente", `%${search}%`);
    }
  }

  const { data: rawVendas, error } = await query.limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filtrar canceladas no JS (evita problema com neq e NULL no Supabase)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vendas = (rawVendas ?? []).filter(
    (v: any) => v.status_pagamento !== "CANCELADO"
  );

  // Agrupar por cliente
  const clienteMap = new Map<string, {
    nome: string;
    cpf: string | null;
    cnpj: string | null;
    email: string | null;
    pessoa: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    total_compras: number;
    total_gasto: number;
    ultima_compra: string;
    ultimo_produto: string;
    cliente_desde: string;
    is_lojista: boolean;
    vendas: {
      id: string;
      data: string;
      produto: string;
      preco_vendido: number;
      forma: string;
      banco: string;
      serial_no: string | null;
      imei: string | null;
    }[];
  }>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const v of vendas as any[]) {
    const nome = (v.cliente || "").trim();
    if (!nome) continue;
    const key = nome.toUpperCase();

    const isAtacado = v.tipo === "ATACADO" || v.origem === "ATACADO";

    if (!clienteMap.has(key)) {
      clienteMap.set(key, {
        nome,
        cpf: v.cpf,
        cnpj: v.cnpj,
        email: v.email,
        pessoa: v.pessoa,
        bairro: v.bairro,
        cidade: v.cidade,
        uf: v.uf,
        total_compras: 0,
        total_gasto: 0,
        ultima_compra: v.data,
        ultimo_produto: v.produto,
        cliente_desde: v.data,
        is_lojista: isAtacado,
        vendas: [],
      });
    }

    const c = clienteMap.get(key)!;
    c.total_compras++;
    c.total_gasto += Number(v.preco_vendido || 0);
    if (v.data > c.ultima_compra) {
      c.ultima_compra = v.data;
      c.ultimo_produto = v.produto;
    }
    if (v.data < c.cliente_desde) c.cliente_desde = v.data;
    if (isAtacado) c.is_lojista = true;
    // Preencher dados pessoais mais recentes
    if (v.cpf && !c.cpf) c.cpf = v.cpf;
    if (v.cnpj && !c.cnpj) c.cnpj = v.cnpj;
    if (v.email && !c.email) c.email = v.email;
    if (v.bairro && !c.bairro) c.bairro = v.bairro;
    if (v.cidade && !c.cidade) c.cidade = v.cidade;
    if (v.uf && !c.uf) c.uf = v.uf;
    if (v.pessoa && !c.pessoa) c.pessoa = v.pessoa;

    c.vendas.push({
      id: v.id,
      data: v.data,
      produto: v.produto,
      preco_vendido: Number(v.preco_vendido || 0),
      forma: v.forma,
      banco: v.banco,
      serial_no: v.serial_no,
      imei: v.imei,
    });
  }

  // Tab "notas" — vendas com nota fiscal
  if (tab === "notas") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notasRaw = (rawVendas ?? []).filter((v: any) => v.nota_fiscal_url && v.status_pagamento !== "CANCELADO");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notas = notasRaw.map((v: any) => ({
      id: v.id,
      data: v.data,
      cliente: v.cliente,
      produto: v.produto,
      preco_vendido: Number(v.preco_vendido || 0),
      nota_fiscal_url: v.nota_fiscal_url,
    }));
    return NextResponse.json({ notas, total: notas.length });
  }

  // Filtrar por tab
  let clientes = Array.from(clienteMap.values());
  if (tab === "lojistas") {
    clientes = clientes.filter((c) => c.is_lojista);
  } else {
    clientes = clientes.filter((c) => !c.is_lojista);
  }

  // Ordenar por total gasto desc
  clientes.sort((a, b) => b.total_gasto - a.total_gasto);

  return NextResponse.json({
    clientes,
    total: clientes.length,
    total_gasto: clientes.reduce((s, c) => s + c.total_gasto, 0),
    total_compras: clientes.reduce((s, c) => s + c.total_compras, 0),
  });
}
