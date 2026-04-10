import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Retorna cores cadastradas no catálogo por modelo (todas as categorias).
// Opcional: ?categoria=IPHONES|IPADS|MACBOOKS|APPLE_WATCH|AIRPODS|...
// Formato: { modelos: { "iPhone 15": ["Black", "Blue", ...], ... } }
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase();
    const url = new URL(req.url);
    const categoria = url.searchParams.get("categoria");

    let q = supabase
      .from("catalogo_modelos")
      .select("id, nome, categoria_key")
      .eq("ativo", true);
    if (categoria) q = q.eq("categoria_key", categoria);

    const { data: modelos, error: e1 } = await q;
    if (e1 || !modelos) return NextResponse.json({ modelos: {} });

    const modeloIds = modelos.map((m) => m.id);
    if (modeloIds.length === 0) return NextResponse.json({ modelos: {} });

    const { data: configs, error: e2 } = await supabase
      .from("catalogo_modelo_configs")
      .select("modelo_id, tipo_chave, valor")
      .in("modelo_id", modeloIds)
      .in("tipo_chave", ["cores", "cores_aw"]);
    if (e2) return NextResponse.json({ modelos: {} });

    const idToNome: Record<string, string> = {};
    const idToCat: Record<string, string> = {};
    for (const m of modelos) { idToNome[m.id] = m.nome; idToCat[m.id] = m.categoria_key || "OUTROS"; }

    const result: Record<string, string[]> = {};
    const categorias: Record<string, string> = {};
    for (const c of configs ?? []) {
      const nome = idToNome[c.modelo_id];
      if (!nome) continue;
      if (!result[nome]) result[nome] = [];
      if (!result[nome].includes(c.valor)) result[nome].push(c.valor);
      categorias[nome] = idToCat[c.modelo_id];
    }
    return NextResponse.json({ modelos: result, categorias });
  } catch (err) {
    return NextResponse.json({ modelos: {}, error: String(err) }, { status: 200 });
  }
}
