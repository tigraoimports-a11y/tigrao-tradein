import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noCache = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" };

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest) {
  return decodeURIComponent(req.headers.get("x-admin-user") || "sistema");
}
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const supabase = getSupabase();
  const { data, error } = await supabase.from("instagram_config").select("*").eq("id", 1).single();
  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  }
  return NextResponse.json({ data: data || { id: 1, foto_perfil_url: null, nome_display: "tigraoimports" } }, { headers: noCache });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const body = await req.json();
  const { foto_perfil_url, nome_display } = body;

  const upd: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() };
  if (foto_perfil_url !== undefined) upd.foto_perfil_url = foto_perfil_url;
  if (nome_display !== undefined) upd.nome_display = nome_display;

  const supabase = getSupabase();
  const { error } = await supabase.from("instagram_config").upsert(upd);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });

  await logActivity(usuario, "Config Instagram atualizada", JSON.stringify(upd), "instagram", "1");
  return NextResponse.json({ ok: true }, { headers: noCache });
}
