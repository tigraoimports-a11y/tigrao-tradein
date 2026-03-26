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

  // Suporta array (gasto dividido) ou objeto único (retrocompatível)
  const items = Array.isArray(body) ? body : [body];

  const { data, error } = await supabase.from("gastos").insert(items).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totalValor = items.reduce((s: number, i: { valor?: number }) => s + Number(i.valor || 0), 0);
  const desc = items[0]?.descricao || "?";
  const bancos = items.map((i: { banco?: string }) => i.banco).filter(Boolean).join(", ");
  await logActivity(usuario, "Registrou gasto", `${desc} R$ ${totalValor.toLocaleString("pt-BR")} (${bancos})`, "gastos", data?.[0]?.id);

  // Recalcular saldos do dia automaticamente
  const dataISO = items[0]?.data;
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

  const { id, grupo_id } = await req.json();

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
  const { data: gasto } = await supabase.from("gastos").select("data").eq("id", id).single();
  const gastoData = gasto?.data;

  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Recalcular saldos do dia automaticamente
  if (gastoData) recalcularSaldoDia(supabase, gastoData).catch(() => {});

  return NextResponse.json({ ok: true });
}
