import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function checkAuth(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

// GET /api/admin/catalogo
// Returns all catalog data, or configs for a specific modelo_id
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabase();
    const modeloId = req.nextUrl.searchParams.get("modelo_id");
    const allConfigs = req.nextUrl.searchParams.get("all_configs");

    // Return configs for a specific model
    // Return configs for a specific model, merging with category-level
    // fallback for any spec types that have no model-specific configs.
    if (modeloId) {
      const { data: modelConfigs, error } = await supabase
        .from("catalogo_modelo_configs")
        .select("*")
        .eq("modelo_id", modeloId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Find which spec types already have model-specific configs
      const configuredTypes = new Set((modelConfigs || []).map((c: { tipo_chave: string }) => c.tipo_chave));

      // Find the model's categoria_key to get category-level fallbacks
      const { data: modelo } = await supabase
        .from("catalogo_modelos")
        .select("categoria_key")
        .eq("id", modeloId)
        .maybeSingle();

      let fallbackConfigs: { tipo_chave: string; valor: string }[] = [];

      if (modelo?.categoria_key) {
        // Get which spec types this category uses
        const { data: catSpecs } = await supabase
          .from("catalogo_categoria_specs")
          .select("tipo_chave")
          .eq("categoria_key", modelo.categoria_key);

        if (catSpecs && catSpecs.length > 0) {
          // Find spec types that are NOT configured at model level
          const missingTypes = catSpecs
            .map(s => s.tipo_chave)
            .filter(t => !configuredTypes.has(t));

          if (missingTypes.length > 0) {
            // Get global values for the missing spec types
            const { data: specValues } = await supabase
              .from("catalogo_spec_valores")
              .select("tipo_chave, valor")
              .in("tipo_chave", missingTypes)
              .order("ordem");
            fallbackConfigs = specValues || [];
          }
        }
      }

      // Merge: model-specific configs + category-level fallback for missing types
      const merged = [...(modelConfigs || []), ...fallbackConfigs];
      return NextResponse.json({ configs: merged });
    }

    // Return ALL model configs (used by estoque page to know all valid colors per model)
    if (allConfigs) {
      const { data, error } = await supabase
        .from("catalogo_modelo_configs")
        .select("modelo_id,tipo_chave,valor");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ configs: data ?? [] });
    }

    const [
      { data: categorias, error: e1 },
      { data: modelos, error: e2 },
      { data: specTipos, error: e3 },
      { data: specValores, error: e4 },
      { data: categoriaSpecs, error: e5 },
    ] = await Promise.all([
      supabase.from("catalogo_categorias").select("*").order("ordem"),
      supabase.from("catalogo_modelos").select("*").order("ordem"),
      supabase.from("catalogo_spec_tipos").select("*").order("ordem"),
      supabase.from("catalogo_spec_valores").select("*").order("ordem"),
      supabase.from("catalogo_categoria_specs").select("*").order("ordem"),
    ]);

    const errors = [e1, e2, e3, e4, e5].filter(Boolean);
    if (errors.length > 0) {
      const tableNotFound = errors.some(
        (e) => e && (e.code === "42P01" || e.message?.includes("does not exist"))
      );
      if (tableNotFound) {
        return NextResponse.json({
          categorias: [],
          modelos: [],
          specTipos: [],
          specValores: [],
          categoriaSpecs: [],
          _tablesNotFound: true,
        });
      }
      return NextResponse.json({ error: errors[0]?.message }, { status: 500 });
    }

    return NextResponse.json({
      categorias: categorias ?? [],
      modelos: modelos ?? [],
      specTipos: specTipos ?? [],
      specValores: specValores ?? [],
      categoriaSpecs: categoriaSpecs ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/admin/catalogo  — create record
// PATCH /api/admin/catalogo — update record
// DELETE /api/admin/catalogo — delete record
// Body: { resource, ...fields }  (PATCH/DELETE also need `id`)

type Resource = "categorias" | "modelos" | "spec_tipos" | "spec_valores" | "modelo_configs" | "categoria_specs_config";
type SimpleResource = Exclude<Resource, "modelo_configs" | "categoria_specs_config">;

const TABLE_MAP: Record<SimpleResource, string> = {
  categorias: "catalogo_categorias",
  modelos: "catalogo_modelos",
  spec_tipos: "catalogo_spec_tipos",
  spec_valores: "catalogo_spec_valores",
};

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { resource, ...rest } = body as { resource: Resource; [key: string]: unknown };
    const supabase = getSupabase();

    // Special handler: save categoria specs (replace all for this categoria_key)
    if (resource === "categoria_specs_config") {
      const { categoria_key, specs } = rest as {
        categoria_key: string;
        specs: { tipo_chave: string; obrigatoria: boolean; ordem: number }[];
      };
      if (!categoria_key) return NextResponse.json({ error: "categoria_key required" }, { status: 400 });

      const { error: delError } = await supabase
        .from("catalogo_categoria_specs")
        .delete()
        .eq("categoria_key", categoria_key);
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

      if (specs && specs.length > 0) {
        const rows = specs.map((s) => ({ categoria_key, tipo_chave: s.tipo_chave, obrigatoria: s.obrigatoria, ordem: s.ordem }));
        const { error: insError } = await supabase.from("catalogo_categoria_specs").insert(rows);
        if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    // Special handler: save model configs (replace all for this modelo_id)
    if (resource === "modelo_configs") {
      const { modelo_id, configs } = rest as {
        modelo_id: string;
        configs: { tipo_chave: string; valor: string }[];
      };
      if (!modelo_id) return NextResponse.json({ error: "modelo_id required" }, { status: 400 });

      // Delete existing configs for this model
      const { error: delError } = await supabase
        .from("catalogo_modelo_configs")
        .delete()
        .eq("modelo_id", modelo_id);
      if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

      // Insert new configs
      if (configs && configs.length > 0) {
        const rows = configs.map((c) => ({ modelo_id, tipo_chave: c.tipo_chave, valor: c.valor }));
        const { error: insError } = await supabase.from("catalogo_modelo_configs").insert(rows);
        if (insError) return NextResponse.json({ error: insError.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true });
    }

    const table = TABLE_MAP[resource as SimpleResource];
    if (!table) {
      return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
    }

    const { data: row, error } = await supabase.from(table).insert(rest).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: row });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { resource, id, ...data } = body as { resource: Resource; id: string; [key: string]: unknown };

    const table = TABLE_MAP[resource as SimpleResource];
    if (!table) {
      return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = getSupabase();

    // Rename de modelo: propagar em estoque.produto / precos.modelo (best-effort por prefix)
    let nomeAntigo: string | null = null;
    if (resource === "modelos" && typeof data.nome === "string") {
      const { data: old } = await supabase.from("catalogo_modelos").select("nome").eq("id", id).maybeSingle();
      if (old?.nome && old.nome !== data.nome) nomeAntigo = old.nome;
    }

    const { data: row, error } = await supabase.from(table).update(data).eq("id", id).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Propagação: trocar ocorrências exatas do nome antigo pelo novo em outras tabelas.
    let propagated: Record<string, number> = {};
    if (nomeAntigo && typeof data.nome === "string") {
      const nomeNovo = data.nome;
      try {
        // estoque.produto — só linhas EXATAMENTE == nomeAntigo (substring match é arriscado demais)
        const { count: estExact } = await supabase
          .from("estoque")
          .update({ produto: nomeNovo, updated_at: new Date().toISOString() }, { count: "exact" })
          .eq("produto", nomeAntigo);
        propagated = { ...propagated, estoque_exato: Number(estExact || 0) };

        // precos.modelo — idem
        const { count: precExact } = await supabase
          .from("precos")
          .update({ modelo: nomeNovo }, { count: "exact" })
          .eq("modelo", nomeAntigo);
        propagated = { ...propagated, precos_exato: Number(precExact || 0) };
      } catch (e) {
        console.error("[catalogo PATCH] erro ao propagar rename:", e);
      }
    }

    return NextResponse.json({ data: row, propagated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { resource, id } = body as { resource: Resource; id: string };

    const table = TABLE_MAP[resource as SimpleResource];
    if (!table) {
      return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { error } = await supabase.from(table).delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
