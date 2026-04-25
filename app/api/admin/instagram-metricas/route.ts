import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buscarMetricasInstagram } from "@/lib/instagram/metricas";

export const runtime = "nodejs";
export const maxDuration = 60;

// Item #25 — Sincroniza metricas dos posts publicados no Instagram.
//
// 2 modos:
//
// POST /api/admin/instagram-metricas
//   Body: { id: "uuid-do-post" }
//   → atualiza UM post especifico (botao "atualizar metricas" no detalhe)
//
// POST /api/admin/instagram-metricas
//   Body: { sync_all: true, days?: 30 }
//   → atualiza TODOS posts POSTADO nos ultimos N dias (default 30)
//   → util pra rodar diariamente via cron ou manual no admin
//
// Auth: x-admin-password === ADMIN_PASSWORD

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const supabase = getSupabase();

  // Modo batch: sincroniza todos posts POSTADO nos ultimos N dias
  if (body.sync_all) {
    const days = typeof body.days === "number" && body.days > 0 ? body.days : 30;
    const fromDate = new Date(Date.now() - days * 86400000).toISOString();

    const { data: posts, error } = await supabase
      .from("instagram_posts")
      .select("id, instagram_post_id")
      .eq("status", "POSTADO")
      .not("instagram_post_id", "is", null)
      .gte("postado_em", fromDate);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!posts || posts.length === 0) {
      return NextResponse.json({ ok: true, atualizados: 0, erros: 0, message: "Nenhum post POSTADO nos ultimos dias" });
    }

    let atualizados = 0;
    let erros = 0;
    const detalhes: Array<{ id: string; status: string; erro?: string }> = [];

    // Processa em serie pra nao explodir rate limit da Graph API.
    // 30 posts × 200ms = 6s, dentro do maxDuration=60.
    for (const p of posts) {
      const m = await buscarMetricasInstagram(p.instagram_post_id);
      if (m.status === "OK") {
        await supabase
          .from("instagram_posts")
          .update({
            metricas_likes: m.likes,
            metricas_comments: m.comments,
            metricas_reach: m.reach,
            metricas_saves: m.saves,
            metricas_shares: m.shares,
            metricas_views: m.views,
            metricas_atualizado_em: m.atualizadoEm,
          })
          .eq("id", p.id);
        atualizados++;
        detalhes.push({ id: p.id, status: "OK" });
      } else {
        erros++;
        detalhes.push({ id: p.id, status: "ERRO", erro: m.erro });
      }
    }

    return NextResponse.json({ ok: true, atualizados, erros, total: posts.length, detalhes });
  }

  // Modo single: atualiza UM post pelo id
  const id = body.id;
  if (!id) {
    return NextResponse.json({ error: "Passe { id } ou { sync_all: true }" }, { status: 400 });
  }

  const { data: post, error } = await supabase
    .from("instagram_posts")
    .select("id, instagram_post_id, status")
    .eq("id", id)
    .single();

  if (error || !post) {
    return NextResponse.json({ error: error?.message || "Post nao encontrado" }, { status: 404 });
  }

  if (!post.instagram_post_id) {
    return NextResponse.json({
      error: "Post ainda nao foi publicado no Instagram (sem instagram_post_id)",
    }, { status: 400 });
  }

  const m = await buscarMetricasInstagram(post.instagram_post_id);

  if (m.status === "OK") {
    await supabase
      .from("instagram_posts")
      .update({
        metricas_likes: m.likes,
        metricas_comments: m.comments,
        metricas_reach: m.reach,
        metricas_saves: m.saves,
        metricas_shares: m.shares,
        metricas_views: m.views,
        metricas_atualizado_em: m.atualizadoEm,
      })
      .eq("id", id);
  }

  return NextResponse.json({ ok: m.status === "OK", metricas: m });
}
