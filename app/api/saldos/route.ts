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

  // Últimos 7 dias
  const { data, error } = await supabase
    .from("saldos_bancarios")
    .select("*")
    .order("data", { ascending: false })
    .limit(7);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST: Atualizar saldos base
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: dataISO, itau_base, inf_base, mp_base, esp_especie } = await req.json();
  if (!dataISO) return NextResponse.json({ error: "data required" }, { status: 400 });

  const { error } = await supabase.from("saldos_bancarios").upsert(
    {
      data: dataISO,
      itau_base: itau_base ?? 0,
      inf_base: inf_base ?? 0,
      mp_base: mp_base ?? 0,
      esp_especie: esp_especie ?? 0,
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
