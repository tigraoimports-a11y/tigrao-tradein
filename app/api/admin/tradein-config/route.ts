import { NextRequest, NextResponse } from "next/server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");
  const { data, error } = await supabase
    .from("tradein_config")
    .select("*")
    .limit(1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");
  const body = await req.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.seminovos !== undefined) updates.seminovos = body.seminovos;
  if (body.labels !== undefined) updates.labels = body.labels;
  if (body.origens !== undefined) updates.origens = body.origens;
  if (body.whatsapp_principal !== undefined) updates.whatsapp_principal = body.whatsapp_principal;
  if (body.whatsapp_vendedores !== undefined) updates.whatsapp_vendedores = body.whatsapp_vendedores;

  // Get the single config row id
  const { data: existing } = await supabase
    .from("tradein_config")
    .select("id")
    .limit(1)
    .single();

  if (!existing) {
    // Insert if no row exists
    const { data, error } = await supabase
      .from("tradein_config")
      .insert({ ...updates })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  const { data, error } = await supabase
    .from("tradein_config")
    .update(updates)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
