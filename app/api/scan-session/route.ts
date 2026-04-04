import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// POST — cria nova sessão (requer senha admin)
// Retorna { token }
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token =
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);

  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("scan_sessions")
    .insert({ token, serial: null, expires_at });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token });
}

// GET — desktop faz polling aguardando serial
// ?token=TOKEN  — sem autenticação (token é o segredo temporário)
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const { data, error } = await supabase
    .from("scan_sessions")
    .select("serial, expires_at")
    .eq("token", token)
    .single();

  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (new Date(data.expires_at) < new Date())
    return NextResponse.json({ error: "expired" }, { status: 410 });

  return NextResponse.json({ serial: data.serial ?? null });
}

// PUT — iPhone envia o serial escaneado
// Body: { token, serial }  — sem autenticação (token é o segredo temporário)
export async function PUT(req: NextRequest) {
  const { token, serial } = await req.json();
  if (!token || !serial)
    return NextResponse.json({ error: "token e serial obrigatórios" }, { status: 400 });

  const { error } = await supabase
    .from("scan_sessions")
    .update({ serial: String(serial).trim().toUpperCase() })
    .eq("token", token)
    .gt("expires_at", new Date().toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — limpa sessão após uso
export async function DELETE(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  await supabase.from("scan_sessions").delete().eq("token", token);
  return NextResponse.json({ ok: true });
}
