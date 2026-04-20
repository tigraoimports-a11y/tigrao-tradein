// Cron: publica posts de Instagram agendados quando chega a hora.
// Roda a cada 5 minutos (config no vercel.json).
// Busca posts com status=AGENDADO e agendado_para <= now(); publica um por vez.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { publicarPostNoInstagram } from "@/lib/instagram/publicar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  if (!authCron(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  const agora = new Date().toISOString();

  const { data: posts, error } = await supabase
    .from("instagram_posts")
    .select("id, tema, agendado_para")
    .eq("status", "AGENDADO")
    .lte("agendado_para", agora)
    .order("agendado_para", { ascending: true })
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!posts || posts.length === 0) {
    return NextResponse.json({ message: "Nenhum post agendado pronto.", count: 0 });
  }

  const resultados: Array<{ id: string; ok: boolean; erro?: string; instagram_post_id?: string }> = [];
  for (const p of posts) {
    try {
      const r = await publicarPostNoInstagram(p.id);
      resultados.push({ id: p.id, ok: true, instagram_post_id: r.instagram_post_id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resultados.push({ id: p.id, ok: false, erro: msg });
      // O proprio publicarPostNoInstagram ja grava o erro no post.
    }
  }

  const sucesso = resultados.filter((r) => r.ok).length;
  return NextResponse.json({
    message: `${sucesso}/${posts.length} posts publicados.`,
    count: posts.length,
    resultados,
  });
}
