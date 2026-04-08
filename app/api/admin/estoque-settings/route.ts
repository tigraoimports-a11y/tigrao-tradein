import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

async function ensureTable(supabase: ReturnType<typeof getSupabase>) {
  // Try to create table if it doesn't exist using raw SQL via Supabase REST
  try {
    await supabase.rpc("exec_ddl", {
      sql: "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value JSONB, updated_at TIMESTAMPTZ DEFAULT NOW());"
    });
  } catch {
    // RPC may not exist — ignore, table might already exist
  }
}

// GET /api/admin/estoque-settings?key=card_title_overrides
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .single();

    if (error) {
      // Table might not exist yet — return empty gracefully
      return NextResponse.json({ value: null });
    }

    return NextResponse.json({ value: data?.value ?? null });
  } catch {
    return NextResponse.json({ value: null });
  }
}

// PUT /api/admin/estoque-settings
// body: { key: string, value: unknown }
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

    const supabase = getSupabase();
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
