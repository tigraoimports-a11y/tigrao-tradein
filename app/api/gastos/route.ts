import { hojeBR } from "@/lib/date-utils";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { recalcularSaldoDia } from "@/lib/saldos";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function getRole(req: NextRequest): string {
  return req.headers.get("x-admin-role") || "admin";
}

function getPermissoes(req: NextRequest): string[] {
  try { return JSON.parse(req.headers.get("x-admin-permissoes") || "[]"); } catch { return []; }
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase.from("gastos").select("*").order("data", { ascending: false }).order("hora", { ascending: false });
  if (from) query = query.gte("data", from);
  if (to) query = query.lte("data", to);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "gastos.create", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();

  // Novo formato: { gastos: [...], produtos: [...] } para pedido fornecedor
  // Formato antigo: array de gastos ou objeto único (retrocompatível)
  const hasProdutos = body.gastos && Array.isArray(body.produtos);
  const gastoItems = hasProdutos
    ? (Array.isArray(body.gastos) ? body.gastos : [body.gastos])
    : (Array.isArray(body) ? body : [body]);

  // Se tem produtos, gerar pedido_fornecedor_id e injetar nos gastos
  let pedidoFornecedorId: string | null = null;
  if (hasProdutos && body.produtos.length > 0) {
    pedidoFornecedorId = crypto.randomUUID();
    for (const item of gastoItems) {
      item.pedido_fornecedor_id = pedidoFornecedorId;
    }
  }

  // Inserir gastos
  const { data, error } = await supabase.from("gastos").insert(gastoItems).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log de atividade do gasto
  const totalValor = gastoItems.reduce((s: number, i: { valor?: number }) => s + Number(i.valor || 0), 0);
  const desc = gastoItems[0]?.descricao || "?";
  const bancos = gastoItems.map((i: { banco?: string }) => i.banco).filter(Boolean).join(", ");
  await logActivity(usuario, "Registrou gasto", `${desc} R$ ${totalValor.toLocaleString("pt-BR")} (${bancos})`, "gastos", data?.[0]?.id);

  // Inserir produtos no estoque (se pedido fornecedor)
  if (pedidoFornecedorId && hasProdutos && body.produtos.length > 0) {
    const dataCompra = gastoItems[0]?.data || hojeBR();
    const estoqueItems = body.produtos.map((p: {
      produto: string;
      categoria: string;
      qnt: number;
      custo_unitario: number;
      cor?: string;
      fornecedor?: string;
      cliente_origem?: string;
      serial_no?: string;
      imei?: string;
      observacao?: string;
      condicao?: string;
      origem?: string | null;
    }) => ({
      produto: p.produto,
      categoria: p.categoria,
      qnt: p.qnt,
      custo_unitario: p.custo_unitario,
      custo_compra: p.custo_unitario,
      cor: p.cor || null,
      fornecedor: p.cliente_origem?.trim() || p.fornecedor || null,
      serial_no: p.serial_no ? p.serial_no.toUpperCase() : null,
      imei: p.imei ? p.imei.toUpperCase() : null,
      observacao: p.observacao || null,
      origem: p.origem || null,
      status: "A CAMINHO",
      tipo: "A_CAMINHO",
      data_compra: dataCompra,
      pedido_fornecedor_id: pedidoFornecedorId,
    }));

    const { error: estErr } = await supabase.from("estoque").insert(estoqueItems);
    if (estErr) {
      // Gasto já foi criado, logar erro mas não falhar
      console.error("Erro ao inserir produtos no estoque:", estErr.message);
      return NextResponse.json({ ok: true, data, estoqueError: estErr.message });
    }

    await logActivity(
      usuario,
      "Pedido fornecedor",
      `${body.produtos.length} produto(s) adicionados como A CAMINHO — ${desc}`,
      "estoque",
      pedidoFornecedorId
    );
  }

  // Recalcular saldos do dia automaticamente
  const dataISO = gastoItems[0]?.data;
  if (dataISO) recalcularSaldoDia(supabase, dataISO).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "gastos.create", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();

  // Se veio grupo_id, é edição de gasto dividido: apagar os antigos e inserir novos
  if (body.grupo_id && Array.isArray(body.items)) {
    const { error: delErr } = await supabase.from("gastos").delete().eq("grupo_id", body.grupo_id);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    const { data, error: insErr } = await supabase.from("gastos").insert(body.items).select();
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    const totalValor = body.items.reduce((s: number, i: { valor?: number }) => s + Number(i.valor || 0), 0);
    await logActivity(usuario, "Editou gasto", `${body.items[0]?.descricao || "?"} R$ ${totalValor.toLocaleString("pt-BR")}`, "gastos", body.grupo_id);

    const dataISO = body.items[0]?.data;
    if (dataISO) recalcularSaldoDia(supabase, dataISO).catch(() => {});

    return NextResponse.json({ ok: true, data });
  }

  // Edição simples (gasto único, sem grupo)
  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data, error } = await supabase.from("gastos").update(fields).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const valor = fields.valor ? `R$ ${Number(fields.valor).toLocaleString("pt-BR")}` : "";
  await logActivity(usuario, "Editou gasto", `${fields.descricao || "?"} ${valor}`, "gastos", id);

  // Recalcular saldos do dia automaticamente
  if (data?.data) recalcularSaldoDia(supabase, data.data).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, grupo_id, pedido_fornecedor_id } = await req.json();

  // Se tem pedido_fornecedor_id, excluir produtos A CAMINHO vinculados
  if (pedido_fornecedor_id) {
    await supabase
      .from("estoque")
      .delete()
      .eq("pedido_fornecedor_id", pedido_fornecedor_id)
      .eq("status", "A CAMINHO");
  }

  // Se tem grupo_id, excluir todos do grupo
  if (grupo_id) {
    const { data: grupoGastos } = await supabase.from("gastos").select("data").eq("grupo_id", grupo_id).limit(1).single();
    const gastoData = grupoGastos?.data;

    const { error } = await supabase.from("gastos").delete().eq("grupo_id", grupo_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (gastoData) recalcularSaldoDia(supabase, gastoData).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Buscar data antes de excluir para recalcular saldo
  const { data: gasto } = await supabase.from("gastos").select("data, pedido_fornecedor_id").eq("id", id).single();
  const gastoData = gasto?.data;

  // Se gasto individual tem pedido_fornecedor_id, limpar produtos A CAMINHO
  if (gasto?.pedido_fornecedor_id) {
    await supabase
      .from("estoque")
      .delete()
      .eq("pedido_fornecedor_id", gasto.pedido_fornecedor_id)
      .eq("status", "A CAMINHO");
  }

  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalcular saldos do dia automaticamente
  if (gastoData) recalcularSaldoDia(supabase, gastoData).catch(() => {});

  return NextResponse.json({ ok: true });
}
