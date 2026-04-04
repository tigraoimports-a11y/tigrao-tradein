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

    // Special handler: seed modelo configs with EXACT data from old system (meumobi)
    if (resource === "seed_modelo_configs") {
      const { data: modelos } = await supabase.from("catalogo_modelos").select("id, nome, categoria_key");
      if (!modelos) return NextResponse.json({ error: "No models found" }, { status: 400 });

      // Data extracted from tigrao.meumobi.dev/models (old system)
      const IPHONE_ORIGENS_SELECTED = [
        "BR- Chip Físico + E-sim", "LZ (CL/PY/UY)- Chip Físico + E-sim", "VC (CAN)- E-sim",
        "BZ (BR)- Chip Físico + E-sim", "BE (BR)- Chip Físico + E-sim", "CH- Chip Físico",
        "E (MEX)- Chip Físico + E-sim", "HN (IN)- Chip Físico + E-sim", "J (JPA)- E-sim",
        "LL (EUA)- E-sim", "N (UK)- E-sim",
      ];
      const IPHONE_ORIGENS_EXTENDED = [...IPHONE_ORIGENS_SELECTED, "ZP (HK/MO)- E-sim"];
      const IPHONE_ORIGENS_WITH_AA = ["AA (EAU)- E-sim", ...IPHONE_ORIGENS_SELECTED];

      type ModelConfig = Record<string, Record<string, string[]>>;
      const MODEL_CONFIGS: ModelConfig = {
        // ── iPhones (11-14 Pro) ──
        "iPhone 11": { capacidade: ["64GB","128GB","256GB"], cores: ["Black","Green","Purple","Red","White","Yellow"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 11 Pro": { capacidade: ["64GB","256GB","512GB"], cores: ["Gold","Midnight Green","Silver","Space Gray"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 11 Pro Max": { capacidade: ["64GB","256GB","512GB"], cores: ["Gold","Midnight Green","Silver","Space Gray"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 12": { capacidade: ["64GB","128GB","256GB"], cores: ["Black","Blue","Green","Purple","Red","White"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 12 Pro": { capacidade: ["128GB","256GB","512GB"], cores: ["Gold","Graphite","Pacific Blue","Silver"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 12 Pro Max": { capacidade: ["128GB","256GB","512GB"], cores: ["Gold","Graphite","Pacific Blue","Silver"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 13": { capacidade: ["128GB","256GB","512GB"], cores: ["Blue","Green","Midnight","Pink","Red","Starlight"], origem: IPHONE_ORIGENS_WITH_AA },
        "iPhone 13 Pro": { capacidade: ["128GB","256GB","512GB","1TB"], cores: ["Alpine Green","Gold","Graphite","Sierra Blue","Silver"], origem: IPHONE_ORIGENS_WITH_AA },
        "iPhone 13 Pro Max": { capacidade: ["128GB","256GB","512GB","1TB"], cores: ["Alpine Green","Gold","Graphite","Sierra Blue","Silver"], origem: IPHONE_ORIGENS_WITH_AA },
        "iPhone 14": { capacidade: ["128GB","256GB","512GB"], cores: ["Blue","Midnight","Purple","Red","Starlight","Yellow"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 14 Plus": { capacidade: ["128GB","256GB","512GB"], cores: ["Blue","Midnight","Purple","Red","Starlight","Yellow"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 14 Pro": { capacidade: ["128GB","256GB","512GB","1TB"], cores: ["Deep Purple","Gold","Silver","Space Black"], origem: IPHONE_ORIGENS_SELECTED },
        // ── iPhones (14 Pro Max - 17 Pro Max) ──
        "iPhone 14 Pro Max": { capacidade: ["128GB","256GB","512GB","1TB"], cores: ["Deep Purple","Gold","Silver","Space Black"], origem: IPHONE_ORIGENS_EXTENDED },
        "iPhone 15": { capacidade: ["128GB","256GB","512GB"], cores: ["Black","Blue","Green","Pink","Yellow"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 15 Plus": { capacidade: ["128GB","256GB","512GB"], cores: ["Black","Blue","Green","Pink","Yellow"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 15 Pro": { capacidade: ["128GB","256GB","512GB","1TB"], cores: ["Black Titanium","Blue Titanium","Natural Titanium","White Titanium"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 15 Pro Max": { capacidade: ["256GB","512GB","1TB"], cores: ["Black Titanium","Blue Titanium","Natural Titanium","White Titanium"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 16": { capacidade: ["128GB","256GB","512GB"], cores: ["Black","Pink","Teal","Ultramarine","White"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 16 Plus": { capacidade: ["128GB","256GB","512GB"], cores: ["Black","Pink","Teal","Ultramarine","White"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 16 Pro": { capacidade: ["128GB","256GB","512GB","1TB"], cores: ["Black Titanium","Desert Titanium","Natural Titanium","White Titanium"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 16 Pro Max": { capacidade: ["256GB","512GB","1TB"], cores: ["Black Titanium","Desert Titanium","Natural Titanium","White Titanium"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 17": { capacidade: ["256GB","512GB"], cores: ["Black","Lavender","Haze Blue","Sage","White"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 17 Air": { capacidade: ["256GB","512GB","1TB"], cores: ["Cloud White","Light Gold","Sky Blue","Space Black"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 17 Pro": { capacidade: ["256GB","512GB","1TB"], cores: ["Cosmic Orange","Deep Blue","Silver"], origem: IPHONE_ORIGENS_SELECTED },
        "iPhone 17 Pro Max": { capacidade: ["256GB","512GB","1TB","2TB"], cores: ["Cosmic Orange","Deep Blue","Silver"], origem: IPHONE_ORIGENS_SELECTED },
        // ── MacBook Air ──
        "MacBook Air M4": { chips_air: ["(10C CPU/8C GPU)","(10C CPU/10C GPU)"], telas: ['13"','15"'], cores: ["Midnight","Silver","Sky Blue","Starlight"], ram: ["16GB","24GB","32GB"], ssd: ["256GB","512GB","1TB"] },
        "MacBook Air M5": { chips_air: ["(10C CPU/8C GPU)","(10C CPU/10C GPU)"], telas: ['13"','15"'], cores: ["Midnight","Silver","Sky Blue","Starlight"], ram: ["16GB","24GB"], ssd: ["512GB","1TB"] },
        // ── MacBook Neo ──
        "MacBook Neo": { cores: ["Blush","Citrus","Indigo","Silver"], ram: ["8GB"], ssd: ["256GB","512GB"] },
        // ── MacBook Pro ──
        "MacBook Pro M4": { chips_pro_max: ["(10C CPU/10C GPU)"], telas: ['14"'], cores: ["Silver","Space Black"], ram: ["16GB","24GB","32GB","48GB"], ssd: ["512GB","1TB"] },
        "MacBook Pro M4 Pro": { chips_pro_max: ["(12C CPU/16C GPU)","(14C CPU/20C GPU)"], telas: ['14"','16"'], cores: ["Silver","Space Black"], ram: ["24GB","48GB"], ssd: ["512GB","1TB"] },
        "MacBook Pro M5": { chips_pro_max: ["(10C CPU/10C GPU)"], telas: ['14"'], cores: ["Silver","Space Black"], ram: ["16GB","24GB"], ssd: ["512GB","1TB"] },
        // ── Mac Mini ──
        "MacMini M4": { chips_air: ["(10C CPU/10C GPU)"], ram: ["16GB","24GB","32GB","48GB","64GB"], ssd: ["256GB","512GB","1TB"] },
        "MacMini M4 Pro": { chips_pro_max: ["(12C CPU/16C GPU)","(14C CPU/20C GPU)"], ram: ["24GB","48GB","64GB"], ssd: ["512GB","1TB"] },
        // ── Mac Studio ──
        "MacStudio": { chips_max: ["M4 Max (14C CPU /32C GPU)"], ram: ["36GB"], ssd: ["512GB"] },
        // ── iMac ──
        "iMac": { chips_air: ["(8C CPU/8C GPU)","(10C CPU/10C GPU)"], ram: ["16GB","24GB"], ssd: ["256GB","512GB"], cores: ["Silver"] },
        // ── Apple Watch ──
        "Apple Watch Series 11": { tamanho_aw: ["42mm","46mm"], cores_aw: ["Jet Black","Rose Gold","Silver","Space Gray"], tamanho_pulseira: ["M/L","S/M"], conectividade_aw: ["GPS","GPS + CEL"], pulseiras: ["Pulseira Esportiva Azul","Pulseira esportiva roxo-névoa","Pulseira Esportiva Estelar","Pulseira Esportiva Preta","Pulseira loop Alpina azul-clara","Pulseira loop Alpina índigo","Pulseira loop Alpina preta","Pulseira loop esportiva azul-âncora","Pulseira loop esportiva cinza-escura","Pulseira loop Trail azul/azul-brilhante","Pulseira loop Trail azul/preta","Pulseira loop Trail preta/carvão","Pulseira natural estilo milanês","Pulseira Ocean Preta","Pulseira Ocean Azul","Pulseira preta estilo milanês"] },
        "Apple Watch Series 10": { tamanho_aw: ["42mm","46mm"], cores_aw: ["Gold","Jet Black","Natural","Rose Gold","Silver","Slate"], tamanho_pulseira: ["M/L","S/M"], conectividade_aw: ["GPS","GPS + CEL"] },
        "Apple Watch SE (3rd generation)": { tamanho_aw: ["40mm","44mm"], cores_aw: ["Midnight","Starlight"], tamanho_pulseira: ["M/L","S/M"], conectividade_aw: ["GPS","GPS + CEL"] },
        "Apple Watch SE (2rd generation)": { tamanho_aw: ["40mm","44mm"], cores_aw: ["Midnight","Silver","Starlight"], tamanho_pulseira: ["M/L","S/M"], conectividade_aw: ["GPS","GPS + CEL"] },
        "Apple Watch Ultra 3": { tamanho_aw: ["49mm"], cores_aw: ["Black Titanium","Natural Titanium"], tamanho_pulseira: ["M/L","One Size","S/M"], conectividade_aw: ["GPS + CEL"], pulseiras: ["Pulseira loop Alpina verde","Pulseira natural estilo milanês","Pulseira Ocean Preta","Puseira Ocean Verde-Neón","Pulseira Ocean Azul","Pulseira preta estilo milanês"] },
        "Apple Watch Ultra 2": { tamanho_aw: ["49mm"], cores_aw: ["Black Titanium","Natural Titanium"], tamanho_pulseira: ["M/L","One Size","S/M"], conectividade_aw: ["GPS + CEL"], pulseiras: ["Pulseira loop Alpina verde","Pulseira natural estilo milanês","Pulseira Ocean Preta","Puseira Ocean Verde-Neón","Pulseira Ocean Azul","Pulseira preta estilo milanês"] },
      };

      let seeded = 0;
      for (const modelo of modelos) {
        const modelConfigs = MODEL_CONFIGS[modelo.nome];
        if (!modelConfigs) continue;

        const configs: { tipo_chave: string; valor: string }[] = [];
        for (const [tipo_chave, valores] of Object.entries(modelConfigs)) {
          for (const valor of valores) {
            configs.push({ tipo_chave, valor });
          }
        }

        if (configs.length > 0) {
          await supabase.from("catalogo_modelo_configs").delete().eq("modelo_id", modelo.id);
          const rows = configs.map(c => ({ modelo_id: modelo.id, tipo_chave: c.tipo_chave, valor: c.valor }));
          const { error: insError } = await supabase.from("catalogo_modelo_configs").insert(rows);
          if (insError) console.error(`Seed error for ${modelo.nome}:`, insError.message);
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
