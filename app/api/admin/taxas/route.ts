import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// GET — fetch all taxas grouped by banco, or taxas_repasse if type=repasse
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const { supabase } = await import("@/lib/supabase");

  if (type === "repasse") {
    const { data, error } = await supabase
      .from("taxas_repasse")
      .select("*")
      .order("parcelas");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [] });
  }

  const { data, error } = await supabase
    .from("taxas_config")
    .select("*")
    .order("banco")
    .order("bandeira")
    .order("parcelas");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Group by banco
  const grouped: Record<string, typeof data> = {};
  for (const row of data ?? []) {
    if (!grouped[row.banco]) grouped[row.banco] = [];
    grouped[row.banco].push(row);
  }

  return NextResponse.json({ data: grouped });
}

// PATCH — update a specific taxa
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);

  const body = await req.json();
  const { banco, bandeira, parcelas, taxa_pct } = body;

  if (!banco || !bandeira || !parcelas || taxa_pct === undefined) {
    return NextResponse.json({ error: "Missing fields: banco, bandeira, parcelas, taxa_pct" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { error } = await supabase
    .from("taxas_config")
    .update({
      taxa_pct: Number(taxa_pct),
      updated_at: new Date().toISOString(),
      updated_by: usuario,
    })
    .eq("banco", banco)
    .eq("bandeira", bandeira)
    .eq("parcelas", parcelas);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    usuario,
    "Alterou taxa",
    `${banco} ${bandeira} ${parcelas} -> ${taxa_pct}%`,
    "taxas_config"
  );

  return NextResponse.json({ ok: true });
}

// PUT — bulk update multiple taxas at once (machine or repasse)
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);

  const body = await req.json();

  // Handle repasse updates
  if (body.type === "repasse") {
    const { updates } = body as { type: string; updates: { parcelas: string; taxa_pct: number }[] };

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: "Missing updates array" }, { status: 400 });
    }

    const { supabase } = await import("@/lib/supabase");

    let errorCount = 0;
    const now = new Date().toISOString();

    for (const u of updates) {
      const { error } = await supabase
        .from("taxas_repasse")
        .update({
          taxa_pct: Number(u.taxa_pct),
          updated_at: now,
          updated_by: usuario,
        })
        .eq("parcelas", u.parcelas);

      if (error) errorCount++;
    }

    await logActivity(
      usuario,
      "Alterou taxas de repasse",
      `${updates.length} taxas atualizadas (${errorCount} erros)`,
      "taxas_repasse"
    );

    return NextResponse.json({ ok: true, updated: updates.length - errorCount, errors: errorCount });
  }

  // Handle machine taxas updates (existing logic)
  const { updates } = body as { updates: { banco: string; bandeira: string; parcelas: string; taxa_pct: number }[] };

  if (!updates || !Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "Missing updates array" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  let errorCount = 0;
  const now = new Date().toISOString();

  for (const u of updates) {
    // Tentar update primeiro
    const { data: updated, error: updErr } = await supabase
      .from("taxas_config")
      .update({
        taxa_pct: Number(u.taxa_pct),
        updated_at: now,
        updated_by: usuario,
      })
      .eq("banco", u.banco)
      .eq("bandeira", u.bandeira)
      .eq("parcelas", u.parcelas)
      .select("id");

    if (updErr) { errorCount++; continue; }

    // Se não atualizou nenhuma row, inserir nova
    if (!updated || updated.length === 0) {
      const { error: insErr } = await supabase
        .from("taxas_config")
        .insert({
          banco: u.banco,
          bandeira: u.bandeira,
          parcelas: u.parcelas,
          taxa_pct: Number(u.taxa_pct),
          updated_at: now,
          updated_by: usuario,
        });
      if (insErr) errorCount++;
    }
  }

  await logActivity(
    usuario,
    "Alterou taxas em lote",
    `${updates.length} taxas atualizadas (${errorCount} erros)`,
    "taxas_config"
  );

  return NextResponse.json({ ok: true, updated: updates.length - errorCount, errors: errorCount });
}
