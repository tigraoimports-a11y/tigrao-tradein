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
  return req.headers.get("x-admin-user") || "sistema";
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

  let query = supabase.from("gastos").select("*").order("data", { ascending: false });
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
  const { data, error } = await supabase.from("gastos").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const valor = body.valor ? `R$ ${Number(body.valor).toLocaleString("pt-BR")}` : "";
  await logActivity(usuario, "Registrou gasto", `${body.descricao || "?"} ${valor}`, "gastos", data?.id);

  // Recalcular saldos do dia automaticamente
  if (body.data) recalcularSaldoDia(supabase, body.data).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "gastos.create", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();
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

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Buscar data antes de excluir para recalcular saldo
  const { data: gasto } = await supabase.from("gastos").select("data").eq("id", id).single();
  const gastoData = gasto?.data;

  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalcular saldos do dia automaticamente
  if (gastoData) recalcularSaldoDia(supabase, gastoData).catch(() => {});

  return NextResponse.json({ ok: true });
}
