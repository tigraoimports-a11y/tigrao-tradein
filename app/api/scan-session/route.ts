import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Usa activity_log como storage temporário de sessões:
//   acao='SCAN_SESSION'        → sessão criada (entidade=token, detalhes=expires_at ISO)
//   acao='SCAN_SESSION_RESULT' → iPhone enviou o serial (entidade=token, usuario=serial)

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// POST — cria nova sessão (requer senha admin)
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token =
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2) +
    Math.random().toString(36).slice(2);

  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await supabase.from("activity_log").insert({
    usuario: "scan-system",
    acao: "SCAN_SESSION",
    entidade: token,
    detalhes: expires_at,
    entidade_id: null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token });
}

// GET — desktop faz polling aguardando serial
export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  // Verificar se sessão existe e não expirou
  const { data: session } = await supabase
    .from("activity_log")
    .select("detalhes, created_at")
    .eq("acao", "SCAN_SESSION")
    .eq("entidade", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (session.detalhes && new Date(session.detalhes) < new Date())
    return NextResponse.json({ error: "expired" }, { status: 410 });

  // Verificar se iPhone já enviou o resultado
  const { data: result } = await supabase
    .from("activity_log")
    .select("usuario")
    .eq("acao", "SCAN_SESSION_RESULT")
    .eq("entidade", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ serial: result?.usuario ?? null });
}

// PUT — iPhone envia serial escaneado (sem autenticação — token é o segredo)
export async function PUT(req: NextRequest) {
  const { token, serial } = await req.json();
  if (!token || !serial)
    return NextResponse.json({ error: "token e serial obrigatórios" }, { status: 400 });

  // Verificar se sessão existe e não expirou
  const { data: session } = await supabase
    .from("activity_log")
    .select("detalhes")
    .eq("acao", "SCAN_SESSION")
    .eq("entidade", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return NextResponse.json({ error: "Sessão não encontrada" }, { status: 404 });
  if (session.detalhes && new Date(session.detalhes) < new Date())
    return NextResponse.json({ error: "expired" }, { status: 410 });

  const { error } = await supabase.from("activity_log").insert({
    usuario: String(serial).trim().toUpperCase(),
    acao: "SCAN_SESSION_RESULT",
    entidade: token,
    detalhes: null,
    entidade_id: null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — cleanup (opcional)
export async function DELETE(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (token) {
    await supabase.from("activity_log").delete()
      .eq("entidade", token)
      .in("acao", ["SCAN_SESSION", "SCAN_SESSION_RESULT"]);
  }
  return NextResponse.json({ ok: true });
}
