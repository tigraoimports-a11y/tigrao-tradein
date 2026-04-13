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

  // Extrair whatsapp config do campo labels
  const labels = (data?.labels && typeof data.labels === "object") ? data.labels as Record<string, unknown> : {};
  const result = { ...data };
  if (labels._whatsapp_principal) result.whatsapp_principal = labels._whatsapp_principal;
  if (labels._whatsapp_formularios) result.whatsapp_formularios = labels._whatsapp_formularios;
  if (labels._whatsapp_formularios_seminovos) result.whatsapp_formularios_seminovos = labels._whatsapp_formularios_seminovos;
  if (labels._whatsapp_vendedores) result.whatsapp_vendedores = labels._whatsapp_vendedores;

  return NextResponse.json({ data: result });
}

export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");
  const body = await req.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.seminovos !== undefined) updates.seminovos = body.seminovos;
  if (body.origens !== undefined) updates.origens = body.origens;

  // Salvar whatsapp config dentro do campo labels (JSONB) pra não depender de colunas novas
  if (body.whatsapp_principal !== undefined || body.whatsapp_formularios !== undefined || body.whatsapp_formularios_seminovos !== undefined || body.whatsapp_vendedores !== undefined || body.labels !== undefined) {
    const { data: current } = await supabase.from("tradein_config").select("labels").limit(1).single();
    const currentLabels = (current?.labels && typeof current.labels === "object") ? current.labels as Record<string, unknown> : {};
    const newLabels = { ...currentLabels };
    if (body.labels !== undefined) Object.assign(newLabels, body.labels);
    if (body.whatsapp_principal !== undefined) newLabels._whatsapp_principal = body.whatsapp_principal;
    if (body.whatsapp_formularios !== undefined) newLabels._whatsapp_formularios = body.whatsapp_formularios;
    if (body.whatsapp_formularios_seminovos !== undefined) newLabels._whatsapp_formularios_seminovos = body.whatsapp_formularios_seminovos;
    if (body.whatsapp_vendedores !== undefined) newLabels._whatsapp_vendedores = body.whatsapp_vendedores;
    updates.labels = newLabels;
  }

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
