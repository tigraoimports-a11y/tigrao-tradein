import { NextRequest, NextResponse } from "next/server";

const auth = (req: NextRequest) => {
  const pw = req.headers.get("x-admin-password");
  return process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD;
};

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase } = await import("@/lib/supabase");

  const mes = new URL(req.url).searchParams.get("mes");

  if (mes) {
    const { data } = await supabase.from("patrimonio_mensal").select("*").eq("mes", mes).single();
    return NextResponse.json({ data });
  }

  // Retorna todos
  const { data } = await supabase.from("patrimonio_mensal").select("*").order("mes", { ascending: false });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase } = await import("@/lib/supabase");

  const body = await req.json();
  const { mes, patrimonio_base, estoque_base, saldos_base, distribuicao_lucro, observacao } = body;
  if (!mes) return NextResponse.json({ error: "mes required" }, { status: 400 });

  // Upsert
  const { data: existing } = await supabase.from("patrimonio_mensal").select("id").eq("mes", mes).single();

  if (existing) {
    const { data, error } = await supabase.from("patrimonio_mensal").update({
      ...(patrimonio_base !== undefined && { patrimonio_base }),
      ...(estoque_base !== undefined && { estoque_base }),
      ...(saldos_base !== undefined && { saldos_base }),
      ...(distribuicao_lucro !== undefined && { distribuicao_lucro }),
      ...(observacao !== undefined && { observacao }),
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  const { data, error } = await supabase.from("patrimonio_mensal").insert({
    mes,
    patrimonio_base: patrimonio_base || 0,
    estoque_base: estoque_base || 0,
    saldos_base: saldos_base || 0,
    distribuicao_lucro: distribuicao_lucro || 0,
    observacao: observacao || null,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
