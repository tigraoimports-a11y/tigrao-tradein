import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { rateLimitSubmission } from "@/lib/rate-limit";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// POST: create short link (stores in activity_log with entidade="short_link")
// Protegido por rate limit (30/hora/IP) — evita spam do activity_log.
export async function POST(req: NextRequest) {
  const limited = rateLimitSubmission(req, "short-link");
  if (limited) return limited;

  const body = await req.json();
  const { data } = body;
  if (!data) return NextResponse.json({ error: "data required" }, { status: 400 });

  const code = generateCode();
  const { error } = await supabase.from("activity_log").insert({
    usuario: "link",
    acao: code,
    detalhes: JSON.stringify(data),
    entidade: "short_link",
    entidade_id: code,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code });
}

// PATCH: update short link data
// Protegido por rate limit (30/hora/IP) — evita spam do activity_log.
export async function PATCH(req: NextRequest) {
  const limited = rateLimitSubmission(req, "short-link");
  if (limited) return limited;

  const body = await req.json();
  const { code, data } = body;
  if (!code || !data) return NextResponse.json({ error: "code and data required" }, { status: 400 });

  const { error } = await supabase
    .from("activity_log")
    .update({ detalhes: JSON.stringify(data) })
    .eq("entidade", "short_link")
    .eq("acao", code);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// GET: resolve short link
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

  const { data, error } = await supabase
    .from("activity_log")
    .select("detalhes")
    .eq("entidade", "short_link")
    .eq("acao", code)
    .single();

  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    return NextResponse.json({ data: JSON.parse(data.detalhes) });
  } catch {
    return NextResponse.json({ error: "invalid data" }, { status: 500 });
  }
}
