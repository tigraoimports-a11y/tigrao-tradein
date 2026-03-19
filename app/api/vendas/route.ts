import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase.from("vendas").select("*").order("data", { ascending: false });
  if (from) query = query.gte("data", from);
  if (to) query = query.lte("data", to);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Extrair dados do seminovo antes de inserir a venda
  const seminovoData = body._seminovo;
  delete body._seminovo;

  const { data, error } = await supabase.from("vendas").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se tem produto na troca, criar item como PENDENCIA
  // (cliente ainda tem o aparelho, devolve em 24h)
  if (seminovoData && seminovoData.produto) {
    await supabase.from("estoque").insert({
      produto: seminovoData.produto,
      categoria: "IPHONES",
      qnt: 1,
      custo_unitario: seminovoData.valor || 0,
      status: "PENDENTE",
      tipo: "PENDENCIA",
      cor: seminovoData.cor || null,
      observacao: seminovoData.observacao || null,
      bateria: seminovoData.bateria || null,
      cliente: body.cliente || null,
      data_compra: body.data || null,
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Bulk update: finalizar todas vendas de uma data
  if (body.action === "finalizar_dia") {
    const { data: dia } = body;
    if (!dia) return NextResponse.json({ error: "data required" }, { status: 400 });
    const { data: updated, error } = await supabase
      .from("vendas")
      .update({ status_pagamento: "FINALIZADO" })
      .eq("data", dia)
      .eq("status_pagamento", "AGUARDANDO")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, finalizadas: updated?.length || 0 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("vendas").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Buscar venda antes de deletar (para limpar seminovo se houver)
  const { data: venda } = await supabase.from("vendas").select("*").eq("id", id).single();

  const { error } = await supabase.from("vendas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se tinha produto na troca, remover o seminovo/pendencia do estoque
  if (venda && venda.produto_na_troca && venda.cliente) {
    await supabase.from("estoque")
      .delete()
      .eq("cliente", venda.cliente)
      .in("tipo", ["PENDENCIA", "SEMINOVO"]);
  }

  return NextResponse.json({ ok: true });
}
