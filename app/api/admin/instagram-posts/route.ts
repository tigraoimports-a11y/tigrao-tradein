import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
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

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const status = searchParams.get("status");

  if (id) {
    const { data, error } = await supabase.from("instagram_posts").select("*").eq("id", id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
    return NextResponse.json({ data }, { headers: noCache });
  }

  let q = supabase.from("instagram_posts").select("*").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  return NextResponse.json({ data: data || [] }, { headers: noCache });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const body = await req.json();
  const { tema, tipo = "DICA", numero_slides = 7, estilo = "PADRAO" } = body;

  if (!tema?.trim()) return NextResponse.json({ error: "tema obrigatório" }, { status: 400, headers: noCache });
  if (!["DICA", "COMPARATIVO", "NOTICIA", "ANALISE_PROFUNDA"].includes(tipo)) {
    return NextResponse.json({ error: "tipo inválido" }, { status: 400, headers: noCache });
  }
  if (!["PADRAO", "EMANUEL_PESSOA", "CARIOCA_DESCONTRAIDO", "STORYTELLING_PREMIUM", "COMPARATIVO_TECNICO", "VIRAL_POLEMICO", "EDUCATIVO_DIDATICO"].includes(estilo)) {
    return NextResponse.json({ error: "estilo inválido" }, { status: 400, headers: noCache });
  }
  const n = Number(numero_slides);
  if (!Number.isInteger(n) || n < 5 || n > 14) {
    return NextResponse.json({ error: "numero_slides deve estar entre 5 e 14" }, { status: 400, headers: noCache });
  }

  const { data, error } = await supabase
    .from("instagram_posts")
    .insert({ tema: tema.trim(), tipo, numero_slides: n, estilo, criado_por: usuario })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });

  await logActivity(usuario, "Post Instagram criado", `${tipo}/${estilo}: ${tema}`, "instagram", data.id);
  return NextResponse.json({ ok: true, data }, { headers: noCache });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const body = await req.json();
  const { id, ...campos } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400, headers: noCache });

  const editaveis = [
    "tema", "tipo", "numero_slides", "estilo", "status",
    "pesquisa_json", "slides_json", "legenda", "hashtags",
    "agendado_para", "erro",
  ] as const;

  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of editaveis) {
    if (campos[k] !== undefined) upd[k] = campos[k];
  }

  const { error } = await supabase.from("instagram_posts").update(upd).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  await logActivity(usuario, "Post Instagram atualizado", `id=${id}`, "instagram", id);
  return NextResponse.json({ ok: true }, { headers: noCache });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400, headers: noCache });

  const { error } = await supabase.from("instagram_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  await logActivity(usuario, "Post Instagram removido", `id=${id}`, "instagram", id);
  return NextResponse.json({ ok: true }, { headers: noCache });
}
