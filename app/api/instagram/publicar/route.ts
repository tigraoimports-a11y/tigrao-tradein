import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicarPostNoInstagram } from "@/lib/instagram/publicar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// POST: publica um post imediatamente no Instagram.
// Body: { postId: string }
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { postId } = body || {};
  if (!postId) return NextResponse.json({ error: "postId obrigatório" }, { status: 400 });

  try {
    const result = await publicarPostNoInstagram(postId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    try {
      const supabase = getSupabase();
      await supabase
        .from("instagram_posts")
        .update({ erro: `Publicação: ${errMsg}`, updated_at: new Date().toISOString() })
        .eq("id", postId);
    } catch {
      // best-effort.
    }
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
