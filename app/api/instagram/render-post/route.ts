import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { loadInterFonts } from "@/lib/instagram/fonts";
import {
  renderSlideJSX,
  SLIDE_W,
  SLIDE_H,
  type SlideData,
  type Config,
} from "@/lib/instagram/slide-layout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = "instagram-assets";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// POST: renderiza todos os slides de um post, faz upload do PNG pro Storage
// e salva os URLs em instagram_posts.imagens_urls.
// Body: { postId: string }
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { postId } = body || {};
  if (!postId) return NextResponse.json({ error: "postId obrigatório" }, { status: 400 });

  const supabase = getSupabase();

  const [{ data: post, error: postErr }, { data: config }] = await Promise.all([
    supabase.from("instagram_posts").select("*").eq("id", postId).single(),
    supabase.from("instagram_config").select("*").eq("id", 1).single(),
  ]);
  if (postErr || !post) {
    return NextResponse.json({ error: postErr?.message || "post não encontrado" }, { status: 404 });
  }
  if (!Array.isArray(post.slides_json) || post.slides_json.length === 0) {
    return NextResponse.json({ error: "post sem slides gerados" }, { status: 400 });
  }

  const slides: SlideData[] = post.slides_json as SlideData[];
  const cfg: Config = {
    foto_perfil_url: config?.foto_perfil_url ?? null,
    nome_display: config?.nome_display ?? "tigraoimports",
  };

  const fonts = await loadInterFonts();

  const urls: string[] = [];
  const ts = Date.now();

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const jsx = renderSlideJSX(slide, cfg, {
      index: i,
      total: slides.length,
      tipo: post.tipo,
      estilo: post.estilo || "PADRAO",
    });
    const img = new ImageResponse(jsx, {
      width: SLIDE_W,
      height: SLIDE_H,
      fonts,
    });
    const pngBuffer = Buffer.from(await img.arrayBuffer());

    const path = `render/${postId}/${ts}-${String(i + 1).padStart(2, "0")}.png`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, pngBuffer, { contentType: "image/png", upsert: true });
    if (upErr) {
      return NextResponse.json({ error: `falha ao subir slide ${i + 1}: ${upErr.message}` }, { status: 500 });
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    urls.push(pub.publicUrl);
  }

  // Remove PNGs antigos desse post (mantém só o render atual).
  try {
    const { data: listed } = await supabase.storage.from(BUCKET).list(`render/${postId}`, { limit: 1000 });
    if (listed) {
      const atuais = new Set(urls.map((u) => u.split("/").pop()));
      const obsoletos = listed
        .filter((f) => !atuais.has(f.name))
        .map((f) => `render/${postId}/${f.name}`);
      if (obsoletos.length > 0) {
        await supabase.storage.from(BUCKET).remove(obsoletos);
      }
    }
  } catch {
    // limpeza é best-effort.
  }

  const { error: updErr } = await supabase
    .from("instagram_posts")
    .update({ imagens_urls: urls, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, urls });
}
