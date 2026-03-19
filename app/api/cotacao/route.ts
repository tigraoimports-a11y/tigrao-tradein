import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Listar listas com itens e precos
  const { data: listas } = await supabase.from("cotacao_listas").select("*").order("created_at", { ascending: false }).limit(10);
  const { data: itens } = await supabase.from("cotacao_itens").select("*").order("created_at");
  const { data: precos } = await supabase.from("cotacao_precos").select("*").order("preco");

  return NextResponse.json({ listas: listas ?? [], itens: itens ?? [], precos: precos ?? [] });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "criar_lista") {
    const { data, error } = await supabase.from("cotacao_listas").insert({ nome: body.nome || "Lista do dia" }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "add_item") {
    const { lista_id, produto, quantidade } = body;
    const { data, error } = await supabase.from("cotacao_itens").insert({ lista_id, produto, quantidade: quantidade || 1 }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "add_preco") {
    const { item_id, fornecedor, preco, prazo, observacao } = body;
    const { data, error } = await supabase.from("cotacao_precos").insert({ item_id, fornecedor, preco, prazo, observacao }).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  if (action === "fechar_lista") {
    const { error } = await supabase.from("cotacao_listas").update({ status: "FECHADA" }).eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_item") {
    const { error } = await supabase.from("cotacao_itens").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_preco") {
    const { error } = await supabase.from("cotacao_precos").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_lista") {
    const { error } = await supabase.from("cotacao_listas").delete().eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
