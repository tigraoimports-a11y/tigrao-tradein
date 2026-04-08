import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

// Endpoint público — retorna cores cadastradas por modelo de iPhone no catálogo.
// Usado pelo formulário de troca (/troca) para mostrar as cores disponíveis
// de cada modelo específico.
export async function GET() {
  try {
    const supabase = getSupabase();

    // 1) Todos os modelos de iPhone do catálogo
    const { data: modelos, error: e1 } = await supabase
      .from("catalogo_modelos")
      .select("id, nome")
      .eq("categoria_key", "IPHONES")
      .eq("ativo", true);

    if (e1 || !modelos) {
      return NextResponse.json({ modelos: {} });
    }

    const modeloIds = modelos.map((m) => m.id);
    if (modeloIds.length === 0) return NextResponse.json({ modelos: {} });

    // 2) Configs (cores) para esses modelos
    const { data: configs, error: e2 } = await supabase
      .from("catalogo_modelo_configs")
      .select("modelo_id, tipo_chave, valor")
      .in("modelo_id", modeloIds)
      .eq("tipo_chave", "cores");

    if (e2) return NextResponse.json({ modelos: {} });

    // 3) Monta mapa: nome_modelo → [cores]
    const idToNome: Record<string, string> = {};
    for (const m of modelos) idToNome[m.id] = m.nome;

    const result: Record<string, string[]> = {};
    for (const c of configs ?? []) {
      const nome = idToNome[c.modelo_id];
      if (!nome) continue;
      if (!result[nome]) result[nome] = [];
      if (!result[nome].includes(c.valor)) result[nome].push(c.valor);
    }

    return NextResponse.json({ modelos: result });
  } catch (err) {
    return NextResponse.json({ modelos: {}, error: String(err) }, { status: 200 });
  }
}
