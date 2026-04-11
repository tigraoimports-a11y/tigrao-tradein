import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { gerarNoite } from "@/lib/reports";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dataParam = searchParams.get("data");
  const beforeParam = searchParams.get("before");

  // Buscar saldo mais recente ANTES de uma data (para carregar fechamento anterior)
  if (beforeParam) {
    const { data: prev } = await supabase
      .from("saldos_bancarios")
      .select("*")
      .lt("data", beforeParam)
      .order("data", { ascending: false })
      .limit(1);

    return NextResponse.json({ data: prev ?? [] });
  }

  if (dataParam) {
    const { data } = await supabase
      .from("saldos_bancarios")
      .select("*")
      .eq("data", dataParam)
      .single();

    if (data) return NextResponse.json({ data });

    // Fallback: mais recente anterior
    const { data: prev } = await supabase
      .from("saldos_bancarios")
      .select("*")
      .lt("data", dataParam)
      .order("data", { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ data: prev ?? null });
  }

  // Filtro por mês (ex: ?mes=2026-03) ou período (ex: ?from=2026-03-01&to=2026-03-31)
  const mesParam = searchParams.get("mes");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const limitParam = parseInt(searchParams.get("limit") || "0") || 0;

  if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
    const [y, m] = mesParam.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const from = `${mesParam}-01`;
    const to = `${mesParam}-${String(lastDay).padStart(2, "0")}`;
    const { data, error } = await supabase
      .from("saldos_bancarios")
      .select("*")
      .gte("data", from)
      .lte("data", to)
      .order("data", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  if (fromParam || toParam) {
    let query = supabase.from("saldos_bancarios").select("*").order("data", { ascending: false });
    if (fromParam) query = query.gte("data", fromParam);
    if (toParam) query = query.lte("data", toParam);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  // Default: últimos N dias (default 7, configurável via ?limit=30)
  const { data, error } = await supabase
    .from("saldos_bancarios")
    .select("*")
    .order("data", { ascending: false })
    .limit(limitParam > 0 ? Math.min(limitParam, 90) : 7);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST: Atualizar saldos base
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dataISO, itau_base, inf_base, mp_base, esp_especie, esp_especie_base } = await req.json();
  if (!dataISO) return NextResponse.json({ error: "data required" }, { status: 400 });

  // esp_especie_base é o campo correto; esp_especie é mantido por compatibilidade
  const baseEspecie = esp_especie_base ?? esp_especie ?? 0;

  const { error } = await supabase.from("saldos_bancarios").upsert(
    {
      data: dataISO,
      itau_base: itau_base ?? 0,
      inf_base: inf_base ?? 0,
      mp_base: mp_base ?? 0,
      esp_especie_base: baseEspecie,
    },
    { onConflict: "data" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Registrou saldos", `Data: ${dataISO}`, "saldos_bancarios").catch(() => {});

  return NextResponse.json({ ok: true });
}

// PUT: Executar fechamento /noite
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dataISO } = await req.json();
  if (!dataISO) return NextResponse.json({ error: "data required" }, { status: 400 });

  try {
    const report = await gerarNoite(supabase, dataISO);

    const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
    logActivity(usuario, "Executou fechamento noite", `Data: ${dataISO}`, "saldos_bancarios").catch(() => {});

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
