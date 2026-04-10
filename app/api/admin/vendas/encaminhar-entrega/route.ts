import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}
function getUser(request: Request) {
  const r = request.headers.get("x-admin-user") || "Sistema";
  try { return decodeURIComponent(r); } catch { return r; }
}

// POST { venda_id, data_entrega, horario?, entregador?, observacao? }
// Lê a venda Em Andamento e cria uma entrega com todos os dados do cliente e produto.
export async function POST(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { venda_id, data_entrega, horario, entregador, observacao } = body || {};
  if (!venda_id || !data_entrega) {
    return NextResponse.json({ error: "venda_id e data_entrega obrigatórios" }, { status: 400 });
  }
  const { supabase } = await import("@/lib/supabase");

  // Buscar a venda
  const { data: venda, error: e1 } = await supabase
    .from("vendas")
    .select("*")
    .eq("id", venda_id)
    .single();
  if (e1 || !venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  // Verificar se já existe entrega pra essa venda
  const { data: existente } = await supabase
    .from("entregas")
    .select("id")
    .eq("venda_id", venda_id)
    .maybeSingle();
  if (existente) {
    return NextResponse.json({ error: "Esta venda já tem uma entrega vinculada." }, { status: 409 });
  }

  // Montar endereço a partir dos campos da venda
  const enderecoParts = [
    venda.endereco || "",
    venda.bairro ? `- ${venda.bairro}` : "",
    venda.cidade || "",
    venda.uf || "",
    venda.cep ? `CEP: ${venda.cep}` : "",
  ].filter(Boolean).join(" ");
  const enderecoFinal = enderecoParts.trim() || null;

  // Montar produto (incluir troca se houver)
  let produtoTxt = venda.produto || "";
  if (venda.cor) produtoTxt += ` ${venda.cor}`;

  // Montar forma de pagamento
  let formaPag = venda.forma || null;
  if (formaPag && venda.parcelas && venda.parcelas > 1) {
    formaPag = `${venda.parcelas}x ${formaPag}`;
  }
  if (venda.banco) {
    formaPag = formaPag ? `${formaPag} (${venda.banco})` : venda.banco;
  }

  // Montar observação com detalhes úteis pro motoboy
  const obsPartes: string[] = [];
  if (observacao) obsPartes.push(observacao);
  if (venda.troca_produto) {
    obsPartes.push(`TROCA: ${venda.troca_produto} (R$ ${Number(venda.produto_na_troca || 0).toLocaleString("pt-BR")})`);
  }
  if (venda.observacao) obsPartes.push(`Obs venda: ${venda.observacao}`);
  const obsFinal = obsPartes.join(" | ") || null;

  // Buscar telefone do cliente (pode estar na tabela clientes)
  let telefone: string | null = null;
  if (venda.cliente) {
    const { data: cliente } = await supabase
      .from("clientes")
      .select("telefone, whatsapp")
      .ilike("nome", venda.cliente)
      .limit(1)
      .maybeSingle();
    if (cliente) {
      telefone = cliente.whatsapp || cliente.telefone || null;
    }
  }

  const { data: entrega, error: e2 } = await supabase
    .from("entregas")
    .insert({
      venda_id,
      cliente: venda.cliente || "Sem nome",
      telefone,
      endereco: enderecoFinal,
      bairro: venda.bairro || null,
      regiao: venda.bairro || venda.cidade || null,
      data_entrega,
      horario: horario || null,
      status: "PENDENTE",
      entregador: entregador || null,
      observacao: obsFinal,
      produto: produtoTxt || null,
      tipo: (venda.troca_produto || Number(venda.produto_na_troca || 0) > 0) ? "TROCA" : null,
      forma_pagamento: formaPag,
      valor: Number(venda.preco_vendido || 0) || null,
      vendedor: venda.vendedor || null,
    })
    .select()
    .single();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  await logActivity(
    getUser(request),
    "Encaminhou venda para entrega",
    `${venda.cliente} — ${produtoTxt} → entrega ${entrega.id?.slice(0, 8)}`,
    "vendas",
    venda_id
  ).catch(() => {});

  return NextResponse.json({ ok: true, entrega });
}
