import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "no-store, no-cache, must-revalidate" };

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET: lista todos os horários
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const { data, error } = await supabase
    .from("horarios_config")
    .select("*")
    .order("tipo")
    .order("dia_semana")
    .order("horario");
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  return NextResponse.json({ data: data || [] }, { headers: noCache });
}

// POST: adicionar novo horário
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { tipo, dia_semana, horario } = body;
  if (!tipo || !dia_semana || !horario) return NextResponse.json({ error: "tipo, dia_semana e horario obrigatórios" }, { status: 400 });
  const { error } = await supabase
    .from("horarios_config")
    .upsert({ tipo, dia_semana, horario: horario.slice(0, 5), ativo: true }, { onConflict: "tipo,dia_semana,horario" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH: toggle ativo
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { id, ativo } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const { error } = await supabase.from("horarios_config").update({ ativo }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE: remover horário
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  const { error } = await supabase.from("horarios_config").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
