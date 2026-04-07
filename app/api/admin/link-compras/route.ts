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

// GET: lista histórico com filtros
// Query params: q (busca nome/telefone/cpf), tipo (COMPRA|TROCA), arquivado (0|1|all),
//               from, to, limit, offset
export async function GET(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase } = await import("@/lib/supabase");

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const tipo = url.searchParams.get("tipo") || "";
  const arquivado = url.searchParams.get("arquivado") || "0";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  let query = supabase
    .from("link_compras")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (arquivado === "0") query = query.eq("arquivado", false);
  else if (arquivado === "1") query = query.eq("arquivado", true);

  if (tipo === "COMPRA" || tipo === "TROCA") query = query.eq("tipo", tipo);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to + "T23:59:59");

  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `cliente_nome.ilike.${like},cliente_telefone.ilike.${like},cliente_cpf.ilike.${like},produto.ilike.${like},short_code.ilike.${like}`
    );
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}

// POST: criar registro — chamado pelo /gerar-link após gerar o short_code
export async function POST(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { supabase } = await import("@/lib/supabase");

  const payload = {
    short_code: body.short_code,
    url_curta: body.url_curta || null,
    tipo: body.tipo === "TROCA" ? "TROCA" : "COMPRA",
    cliente_nome: body.cliente_nome || null,
    cliente_telefone: body.cliente_telefone || null,
    cliente_cpf: body.cliente_cpf || null,
    cliente_email: body.cliente_email || null,
    produto: body.produto || "",
    produtos_extras: body.produtos_extras ? JSON.stringify(body.produtos_extras) : null,
    cor: body.cor || null,
    valor: Number(body.valor) || 0,
    forma_pagamento: body.forma_pagamento || null,
    parcelas: body.parcelas || null,
    entrada: Number(body.entrada) || 0,
    troca_produto: body.troca_produto || null,
    troca_valor: Number(body.troca_valor) || 0,
    troca_produto2: body.troca_produto2 || null,
    troca_valor2: Number(body.troca_valor2) || 0,
    vendedor: body.vendedor || null,
    simulacao_id: body.simulacao_id || null,
    observacao: body.observacao || null,
  };

  if (!payload.short_code || !payload.produto) {
    return NextResponse.json({ error: "short_code e produto são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase.from("link_compras").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logActivity(getUser(request), "Gerou link de compra", `${payload.tipo} — ${payload.produto}`, "link_compras", data.id).catch(() => {});
  return NextResponse.json({ ok: true, data });
}

// PATCH: arquivar / editar
export async function PATCH(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...patch } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { supabase } = await import("@/lib/supabase");

  const allowed: Record<string, unknown> = {};
  for (const k of ["arquivado", "status", "observacao", "cliente_nome", "cliente_telefone", "cliente_cpf", "cliente_email"]) {
    if (k in patch) allowed[k] = patch[k];
  }
  allowed.updated_at = new Date().toISOString();

  const { error } = await supabase.from("link_compras").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logActivity(getUser(request), "Atualizou link de compra", `ID ${id}`, "link_compras", id).catch(() => {});
  return NextResponse.json({ ok: true });
}

// DELETE: remover definitivamente (prefira PATCH arquivado=true)
export async function DELETE(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { supabase } = await import("@/lib/supabase");
  const { error } = await supabase.from("link_compras").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logActivity(getUser(request), "Removeu link de compra", `ID ${id}`, "link_compras", id).catch(() => {});
  return NextResponse.json({ ok: true });
}
