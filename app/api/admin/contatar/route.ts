import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

export async function PATCH(request: Request) {
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
    .update({ contatado: true })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const usuario = request.headers.get("x-admin-user") || "Sistema";
  logActivity(usuario, "Contatou simulacao", `Simulacao ID: ${id}`, "simulacoes", id).catch(() => {});

  return NextResponse.json({ ok: true });
}
