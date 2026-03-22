import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("fornecedores")
    .select("*")
    .order("nome");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.nome?.trim()) return NextResponse.json({ error: "Nome obrigatorio" }, { status: 400 });

  const { data, error } = await supabase
    .from("fornecedores")
    .insert({
      nome: body.nome.trim().toUpperCase(),
      contato: body.contato?.trim() || null,
      observacao: body.observacao?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return NextResponse.json({ error: "Fornecedor ja cadastrado" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usuario = req.headers.get("x-admin-user") || "Sistema";
  logActivity(usuario, "Criou fornecedor", `Fornecedor: ${body.nome.trim().toUpperCase()}`, "fornecedores", data?.id).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("fornecedores").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = req.headers.get("x-admin-user") || "Sistema";
  logActivity(usuario, "Removeu fornecedor", `ID: ${id}`, "fornecedores", id).catch(() => {});

  return NextResponse.json({ ok: true });
}
