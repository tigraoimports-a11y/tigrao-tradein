import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET: Listar todos os valores de avaliação, descontos e excluídos
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [valores, descontos, excluidos] = await Promise.all([
    supabase.from("avaliacao_usados").select("*").order("modelo").order("armazenamento"),
    supabase.from("descontos_condicao").select("*").order("condicao").order("detalhe"),
    supabase.from("modelos_excluidos").select("*").order("modelo"),
  ]);

  return NextResponse.json({
    valores: valores.data ?? [],
    descontos: descontos.data ?? [],
    excluidos: excluidos.data ?? [],
  });
}

// POST: Upsert valor de avaliação
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "upsert_valor") {
    const { modelo, armazenamento, valor_base } = body;
    const { error } = await supabase.from("avaliacao_usados").upsert(
      { modelo, armazenamento, valor_base, updated_at: new Date().toISOString() },
      { onConflict: "modelo,armazenamento" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "upsert_desconto") {
    const { condicao, detalhe, desconto } = body;
    const { error } = await supabase.from("descontos_condicao").upsert(
      { condicao, detalhe, desconto, updated_at: new Date().toISOString() },
      { onConflict: "condicao,detalhe" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "add_excluido") {
    const { modelo } = body;
    const { error } = await supabase.from("modelos_excluidos").upsert(
      { modelo },
      { onConflict: "modelo" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_excluido") {
    const { modelo } = body;
    const { error } = await supabase.from("modelos_excluidos").delete().eq("modelo", modelo);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_valor") {
    const { id } = body;
    const { error } = await supabase.from("avaliacao_usados").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "import_defaults") {
    // Importar valores padrão do CLAUDE.md/fallback
    const defaults = body.valores as { modelo: string; armazenamento: string; valor_base: number }[];
    if (!defaults?.length) return NextResponse.json({ error: "valores required" }, { status: 400 });

    const { error } = await supabase.from("avaliacao_usados").upsert(
      defaults.map((d) => ({ ...d, updated_at: new Date().toISOString() })),
      { onConflict: "modelo,armazenamento" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, imported: defaults.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
