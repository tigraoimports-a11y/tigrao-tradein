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

    // Return configs for a specific model
    if (modeloId) {
      const { data, error } = await supabase
        .from("catalogo_modelo_configs")
        .select("*")
        .eq("modelo_id", modeloId);
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

type Resource = "categorias" | "modelos" | "spec_tipos" | "spec_valores" | "modelo_configs";

const TABLE_MAP: Record<Exclude<Resource, "modelo_configs">, string> = {
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

    const table = TABLE_MAP[resource as Exclude<Resource, "modelo_configs">];
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

    const table = TABLE_MAP[resource];
    if (!table) {
      return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
    }
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const supabase = getSupabase();
    const { data: row, error } = await supabase.from(table).update(data).eq("id", id).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ data: row });
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

    const table = TABLE_MAP[resource];
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
