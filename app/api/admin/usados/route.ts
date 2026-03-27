import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchUsedValues, fetchExcludedModels, fetchDiscountRules, fetchModelDiscounts } from "@/lib/sheets";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// PUT: Importar tudo do Google Sheets para o Supabase
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [usedValues, excludedModels, discountRules, modelDiscounts] = await Promise.all([
      fetchUsedValues(),
      fetchExcludedModels(),
      fetchDiscountRules(),
      fetchModelDiscounts(),
    ]);

    const now = new Date().toISOString();
    let importedValores = 0;
    let importedDescontos = 0;
    let importedExcluidos = 0;
    let importedDescontosModelo = 0;

    // 1. Valores Base
    if (usedValues.length > 0) {
      const rows = usedValues.map((v) => ({
        modelo: v.modelo,
        armazenamento: v.armazenamento,
        valor_base: v.valorBase,
        updated_at: now,
      }));
      const { error } = await supabase.from("avaliacao_usados").upsert(rows, { onConflict: "modelo,armazenamento" });
      if (!error) importedValores = rows.length;
    }

    // 2. Descontos Condição (gerais)
    if (discountRules.length > 0) {
      const rows = discountRules.map((d) => ({
        condicao: d.condicao,
        detalhe: d.detalhe,
        desconto: d.desconto,
        updated_at: now,
      }));
      const { error } = await supabase.from("descontos_condicao").upsert(rows, { onConflict: "condicao,detalhe" });
      if (!error) importedDescontos = rows.length;
    }

    // 3. Descontos por Modelo (nested Record: modelo -> condicao -> detalhe -> desconto)
    if (Object.keys(modelDiscounts).length > 0) {
      const rows: { condicao: string; detalhe: string; desconto: number; updated_at: string }[] = [];
      for (const [modelo, condicoes] of Object.entries(modelDiscounts)) {
        for (const [condicao, detalhes] of Object.entries(condicoes)) {
          for (const [detalhe, desconto] of Object.entries(detalhes)) {
            rows.push({
              condicao: `${modelo} - ${condicao}`,
              detalhe,
              desconto,
              updated_at: now,
            });
          }
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("descontos_condicao").upsert(rows, { onConflict: "condicao,detalhe" });
        if (!error) importedDescontosModelo = rows.length;
      }
    }

    // 4. Modelos Excluídos
    if (excludedModels.length > 0) {
      const rows = excludedModels.map((m) => ({ modelo: m }));
      const { error } = await supabase.from("modelos_excluidos").upsert(rows, { onConflict: "modelo" });
      if (!error) importedExcluidos = rows.length;
    }

    return NextResponse.json({
      ok: true,
      importedValores,
      importedDescontos,
      importedDescontosModelo,
      importedExcluidos,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
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

  if (action === "delete_desconto") {
    const { condicao, detalhe } = body;
    const { error } = await supabase.from("descontos_condicao").delete().eq("condicao", condicao).eq("detalhe", detalhe);
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
