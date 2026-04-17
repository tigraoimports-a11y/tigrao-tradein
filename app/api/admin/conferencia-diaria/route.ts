import { NextResponse } from "next/server";

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

function getUser(request: Request) {
  const r = request.headers.get("x-admin-user") || "Sistema";
  try { return decodeURIComponent(r); } catch { return r; }
}

/**
 * GET /api/admin/conferencia-diaria?mes=2026-04
 * Retorna todas as linhas de conferencia manual para o mes.
 *
 * POST /api/admin/conferencia-diaria
 * Body: { data, itau_pix, itau_credito, infinite_pix, infinite_credito,
 *         infinite_debito, mp_credito, mp_pix, especie, observacao? }
 * Upsert (uma linha por data).
 */
export async function GET(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase } = await import("@/lib/supabase");
  const url = new URL(request.url);
  const mes = url.searchParams.get("mes") || new Date().toISOString().slice(0, 7); // YYYY-MM
  const inicio = `${mes}-01`;
  const [ano, mm] = mes.split("-").map(Number);
  const ultimoDia = new Date(ano, mm, 0).getDate();
  const fim = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("conferencia_diaria")
    .select("*")
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { data } = body || {};
  if (!data || typeof data !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ error: "data invalida (YYYY-MM-DD)" }, { status: 400 });
  }

  const num = (v: unknown): number => {
    const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : Number(v);
    return isFinite(n) ? n : 0;
  };

  const payload = {
    data,
    itau_pix: num(body.itau_pix),
    itau_credito: num(body.itau_credito),
    infinite_pix: num(body.infinite_pix),
    infinite_credito: num(body.infinite_credito),
    infinite_debito: num(body.infinite_debito),
    mp_credito: num(body.mp_credito),
    mp_pix: num(body.mp_pix),
    especie: num(body.especie),
    observacao: body.observacao || null,
    preenchido_por: getUser(request),
    updated_at: new Date().toISOString(),
  };

  const { supabase } = await import("@/lib/supabase");
  const { data: saved, error } = await supabase
    .from("conferencia_diaria")
    .upsert(payload, { onConflict: "data" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: saved });
}
