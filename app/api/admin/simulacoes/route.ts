import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

export async function DELETE(request: Request) {
  const pw = request.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { error } = await supabase
    .from("simulacoes")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usuario = (() => { const r = request.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Removeu simulacao", `ID: ${id}`, "simulacoes", id).catch(() => {});

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const pw = request.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, ...patch } = await request.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { supabase } = await import("@/lib/supabase");

  const allowed: Record<string, unknown> = {};
  const editableFields = [
    "modelo_usado", "storage_usado", "cor_usado", "avaliacao_usado", "condicao_linhas",
    "modelo_usado2", "storage_usado2", "cor_usado2", "avaliacao_usado2", "condicao_linhas2",
    "diferenca", "preco_novo", "vendedor", "forma_pagamento",
    "nome", "whatsapp",
  ];
  for (const k of editableFields) {
    if (k in patch) allowed[k] = patch[k];
  }

  const { error } = await supabase.from("simulacoes").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = request.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Editou simulacao", `ID: ${id}`, "simulacoes", id).catch(() => {});

  return NextResponse.json({ ok: true });
}
