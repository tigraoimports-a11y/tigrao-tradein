import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const noCache = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" };

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

const BUCKET = "instagram-assets";
const ALLOWED_KINDS = new Set(["perfil", "slide", "render"]);

// POST: upload de arquivo (foto de perfil, imagem de slide manual ou PNG renderizado).
// Body: multipart/form-data com campos "file" (Blob) e "kind" ("perfil" | "slide" | "render").
// Opcional: "postId" — organiza no bucket por post.
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });

  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") || "slide");
  const postId = form.get("postId") ? String(form.get("postId")) : null;

  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file obrigatório" }, { status: 400, headers: noCache });
  }
  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400, headers: noCache });
  }

  const type = file.type || "image/png";
  if (!["image/png", "image/jpeg", "image/webp"].includes(type)) {
    return NextResponse.json({ error: "tipo de arquivo não suportado" }, { status: 400, headers: noCache });
  }

  const ext = type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  let path: string;
  if (kind === "perfil") {
    path = `perfil/andre-${ts}.${ext}`;
  } else if (postId) {
    path = `${kind}/${postId}/${ts}-${rand}.${ext}`;
  } else {
    path = `${kind}/${ts}-${rand}.${ext}`;
  }

  const supabase = getSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: type,
    upsert: true,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  }
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ ok: true, url: pub.publicUrl, path }, { headers: noCache });
}

// DELETE: remove arquivo do bucket por path.
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path obrigatório" }, { status: 400, headers: noCache });
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  return NextResponse.json({ ok: true }, { headers: noCache });
}
