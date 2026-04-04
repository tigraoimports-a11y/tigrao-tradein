import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import {
  IPHONE_CORES_POR_MODELO, IPHONE_STORAGES_POR_MODELO, IPHONE_ORIGENS,
  MACBOOK_CHIPS, MACBOOK_RAMS, MACBOOK_STORAGES, MACBOOK_TELAS_AIR, MACBOOK_TELAS_PRO, MACBOOK_TELAS_NEO, MACBOOK_CORES,
  MAC_MINI_CHIPS, MAC_MINI_RAMS, MAC_MINI_STORAGES,
  IPAD_CHIPS, IPAD_TELAS, IPAD_STORAGES, IPAD_CORES,
  WATCH_TAMANHOS, WATCH_PULSEIRAS, WATCH_BAND_MODELS, WATCH_CORES,
  AIRPODS_MODELOS,
} from "@/lib/produto-specs";

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

type Resource = "categorias" | "modelos" | "spec_tipos" | "spec_valores" | "modelo_configs" | "categoria_specs_config" | "seed_modelo_configs";
type SimpleResource = Exclude<Resource, "modelo_configs" | "categoria_specs_config" | "seed_modelo_configs">;

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

    // Special handler: seed all modelo configs from produto-specs.ts data
    if (resource === "seed_modelo_configs") {
      // Get all models from DB
      const { data: modelos } = await supabase.from("catalogo_modelos").select("id, nome, categoria_key");
      if (!modelos) return NextResponse.json({ error: "No models found" }, { status: 400 });

      let seeded = 0;
      for (const modelo of modelos) {
        const configs: { tipo_chave: string; valor: string }[] = [];
        const catKey = modelo.categoria_key;
        const nome = modelo.nome;

        // iPhone configs
        if (catKey === "IPHONES") {
          // Match model name to IPHONE_CORES_POR_MODELO key
          const modelKey = nome.replace(/^iPhone\s*/i, "").toUpperCase();
          const cores = IPHONE_CORES_POR_MODELO[modelKey];
          if (cores) cores.forEach(c => configs.push({ tipo_chave: "cores", valor: c }));
          const storages = IPHONE_STORAGES_POR_MODELO[modelKey];
          if (storages) storages.forEach(s => configs.push({ tipo_chave: "capacidade", valor: s }));
          // All iPhones get all origins
          IPHONE_ORIGENS.forEach(o => configs.push({ tipo_chave: "origem", valor: o }));
        }

        // MacBook Air configs
        if (catKey === "MACBOOK_AIR") {
          const airChips = MACBOOK_CHIPS.filter(c => !c.includes("PRO") && !c.includes("MAX"));
          airChips.forEach(c => configs.push({ tipo_chave: "chips_air", valor: c }));
          MACBOOK_TELAS_AIR.forEach(t => configs.push({ tipo_chave: "telas", valor: t }));
          MACBOOK_CORES.forEach(c => configs.push({ tipo_chave: "cores", valor: c }));
          MACBOOK_RAMS.filter(r => ["8GB", "16GB", "24GB"].includes(r)).forEach(r => configs.push({ tipo_chave: "ram", valor: r }));
          MACBOOK_STORAGES.filter(s => ["256GB", "512GB", "1TB", "2TB"].includes(s)).forEach(s => configs.push({ tipo_chave: "ssd", valor: s }));
        }

        // MacBook Pro configs
        if (catKey === "MACBOOK_PRO") {
          const proChips = MACBOOK_CHIPS.filter(c => c.includes("PRO") || c.includes("MAX"));
          proChips.forEach(c => configs.push({ tipo_chave: "chips_pro_max", valor: c }));
          MACBOOK_TELAS_PRO.forEach(t => configs.push({ tipo_chave: "telas", valor: t }));
          MACBOOK_CORES.forEach(c => configs.push({ tipo_chave: "cores", valor: c }));
          MACBOOK_RAMS.forEach(r => configs.push({ tipo_chave: "ram", valor: r }));
          MACBOOK_STORAGES.forEach(s => configs.push({ tipo_chave: "ssd", valor: s }));
        }

        // MacBook Neo configs
        if (catKey === "MACBOOK_NEO") {
          const neoChips = MACBOOK_CHIPS.filter(c => c.startsWith("A18") || c === "M4");
          neoChips.forEach(c => configs.push({ tipo_chave: "chips_air", valor: c }));
          MACBOOK_TELAS_NEO.forEach(t => configs.push({ tipo_chave: "telas", valor: t }));
          MACBOOK_CORES.forEach(c => configs.push({ tipo_chave: "cores", valor: c }));
          MACBOOK_RAMS.filter(r => ["8GB", "16GB", "24GB"].includes(r)).forEach(r => configs.push({ tipo_chave: "ram", valor: r }));
          MACBOOK_STORAGES.filter(s => ["256GB", "512GB", "1TB"].includes(s)).forEach(s => configs.push({ tipo_chave: "ssd", valor: s }));
        }

        // Mac Mini configs
        if (catKey === "MAC_MINI") {
          const airChips = MAC_MINI_CHIPS.filter(c => !c.includes("PRO"));
          airChips.forEach(c => configs.push({ tipo_chave: "chips_air", valor: c }));
          const proChips = MAC_MINI_CHIPS.filter(c => c.includes("PRO"));
          proChips.forEach(c => configs.push({ tipo_chave: "chips_pro_max", valor: c }));
          MAC_MINI_RAMS.forEach(r => configs.push({ tipo_chave: "ram", valor: r }));
          MAC_MINI_STORAGES.forEach(s => configs.push({ tipo_chave: "ssd", valor: s }));
        }

        // Mac Studio configs
        if (catKey === "MAC_STUDIO") {
          const maxChips = MACBOOK_CHIPS.filter(c => c.includes("MAX") || c.includes("ULTRA"));
          if (maxChips.length === 0) {
            ["M4 MAX", "M4 ULTRA", "M5 MAX", "M5 ULTRA"].forEach(c => configs.push({ tipo_chave: "chips_max", valor: c }));
          } else {
            maxChips.forEach(c => configs.push({ tipo_chave: "chips_max", valor: c }));
          }
          MACBOOK_RAMS.filter(r => parseInt(r) >= 32).forEach(r => configs.push({ tipo_chave: "ram", valor: r }));
          MACBOOK_STORAGES.forEach(s => configs.push({ tipo_chave: "ssd", valor: s }));
        }

        // iMac configs
        if (catKey === "IMAC") {
          const imacChips = MACBOOK_CHIPS.filter(c => !c.includes("PRO") && !c.includes("MAX") && c.startsWith("M"));
          imacChips.forEach(c => configs.push({ tipo_chave: "chips_air", valor: c }));
          MACBOOK_RAMS.filter(r => ["8GB", "16GB", "24GB", "32GB"].includes(r)).forEach(r => configs.push({ tipo_chave: "ram", valor: r }));
          MACBOOK_STORAGES.filter(s => ["256GB", "512GB", "1TB", "2TB"].includes(s)).forEach(s => configs.push({ tipo_chave: "ssd", valor: s }));
          // iMac cores (same as MacBook)
          MACBOOK_CORES.forEach(c => configs.push({ tipo_chave: "cores", valor: c }));
        }

        // iPad configs
        if (catKey === "IPADS") {
          IPAD_CHIPS.forEach(c => configs.push({ tipo_chave: "chips_air", valor: c }));
          IPAD_TELAS.forEach(t => configs.push({ tipo_chave: "telas", valor: t }));
          IPAD_STORAGES.forEach(s => configs.push({ tipo_chave: "capacidade", valor: s }));
          IPAD_CORES.forEach(c => configs.push({ tipo_chave: "cores", valor: c }));
          ["WIFI", "WIFI+CELL"].forEach(c => configs.push({ tipo_chave: "conectividade", valor: c }));
        }

        // Apple Watch configs
        if (catKey === "APPLE_WATCH") {
          WATCH_TAMANHOS.forEach(t => configs.push({ tipo_chave: "tamanho_aw", valor: t }));
          WATCH_CORES.forEach(c => configs.push({ tipo_chave: "cores_aw", valor: c }));
          WATCH_PULSEIRAS.forEach(p => configs.push({ tipo_chave: "tamanho_pulseira", valor: p }));
          WATCH_BAND_MODELS.forEach(b => configs.push({ tipo_chave: "pulseiras", valor: b }));
          ["GPS", "GPS + CEL"].forEach(c => configs.push({ tipo_chave: "conectividade_aw", valor: c }));
        }

        // AirPods configs
        if (catKey === "AIRPODS") {
          AIRPODS_MODELOS.forEach(m => configs.push({ tipo_chave: "descricao_airpods", valor: m }));
        }

        if (configs.length > 0) {
          // Delete existing configs
          await supabase.from("catalogo_modelo_configs").delete().eq("modelo_id", modelo.id);
          // Insert new configs
          const rows = configs.map(c => ({ modelo_id: modelo.id, tipo_chave: c.tipo_chave, valor: c.valor }));
          const { error: insError } = await supabase.from("catalogo_modelo_configs").insert(rows);
          if (insError) console.error(`Seed error for ${nome}:`, insError.message);
          else seeded++;
        }
      }

      return NextResponse.json({ ok: true, seeded, total: modelos.length });
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
