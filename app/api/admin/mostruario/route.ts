import { NextRequest, NextResponse } from "next/server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET — lista todos os produtos (com campos mostruario) + config global
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");

  const [produtosRes, configRes] = await Promise.all([
    supabase
      .from("precos")
      .select("id, modelo, armazenamento, preco_pix, status, categoria, image_url, descricao, ordem, visivel, destaque")
      .order("ordem", { ascending: true, nullsFirst: false })
      .order("modelo")
      .order("armazenamento"),
    supabase
      .from("mostruario_config")
      .select("*")
      .limit(1)
      .single(),
  ]);

  if (produtosRes.error) return NextResponse.json({ error: produtosRes.error.message }, { status: 500 });

  // Config pode nao existir ainda — retornar defaults
  const config = configRes.data ?? {
    banner_titulo: "Produtos Apple Originais",
    banner_subtitulo: "Nota fiscal no seu nome | Lacrados | 1 ano garantia Apple",
    banner_image_url: null,
    accent_color: "#E8740E",
    whatsapp_numero: "5521999999999",
    tema: "tigrao",
  };

  return NextResponse.json({ produtos: produtosRes.data ?? [], config });
}

// POST — atualizar campo individual de um produto OU batch reorder
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { supabase } = await import("@/lib/supabase");

  // Batch reorder
  if (body.reorder && Array.isArray(body.reorder)) {
    const updates = body.reorder.map((item: { id: string; ordem: number }) =>
      supabase.from("precos").update({ ordem: item.ordem }).eq("id", item.id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Single field update
  const { id, field, value } = body;
  if (!id || !field) {
    return NextResponse.json({ error: "Missing id or field" }, { status: 400 });
  }

  const allowedFields = ["descricao", "ordem", "visivel", "destaque"];
  if (!allowedFields.includes(field)) {
    return NextResponse.json({ error: `Field '${field}' not allowed` }, { status: 400 });
  }

  const { error } = await supabase
    .from("precos")
    .update({ [field]: value })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PUT — atualizar config global do mostruario
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { supabase } = await import("@/lib/supabase");

  const allowedFields = ["banner_titulo", "banner_subtitulo", "banner_image_url", "accent_color", "whatsapp_numero", "tema"];
  const update: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Upsert: se nao existir, criar; se existir, atualizar
  // Usar id=1 como single row pattern
  const { error } = await supabase
    .from("mostruario_config")
    .upsert({ id: 1, ...update }, { onConflict: "id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
