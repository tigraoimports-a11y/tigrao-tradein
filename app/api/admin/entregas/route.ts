import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("entregas")
    .select("*")
    .order("data_entrega", { ascending: true })
    .order("horario", { ascending: true });

  if (from) query = query.gte("data_entrega", from);
  if (to) query = query.lte("data_entrega", to);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { cliente, telefone, endereco, bairro, data_entrega, horario, status, entregador, observacao, venda_id, produto, tipo, detalhes_upgrade, forma_pagamento, valor, vendedor, regiao } = body;

  if (!cliente || !data_entrega) {
    return NextResponse.json({ error: "Cliente e data_entrega obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("entregas")
    .insert({
      cliente,
      telefone: telefone || null,
      endereco: endereco || null,
      bairro: bairro || null,
      data_entrega,
      horario: horario || null,
      status: status || "PENDENTE",
      entregador: entregador || null,
      observacao: observacao || null,
      venda_id: venda_id || null,
      produto: produto || null,
      tipo: tipo || null,
      detalhes_upgrade: detalhes_upgrade || null,
      forma_pagamento: forma_pagamento || null,
      valor: valor != null ? valor : null,
      vendedor: vendedor || null,
      regiao: regiao || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Criou entrega", `Cliente: ${cliente}, Data: ${data_entrega}`, "entrega", data?.id).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  // Add updated_at
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("entregas")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Atualizou entrega", `Status: ${updates.status || "atualizado"}`, "entrega", id).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id } = body;

  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("entregas")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Removeu entrega", `ID: ${id}`, "entrega", id).catch(() => {});

  return NextResponse.json({ ok: true });
}
