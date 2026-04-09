import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Mapa device_type → categoria_key(s) do catálogo
const DEVICE_TO_CATALOG: Record<string, string[]> = {
  iphone: ["IPHONES"],
  ipad: ["IPADS"],
  macbook: ["MACBOOK_AIR", "MACBOOK_PRO", "MACBOOK_NEO"],
  watch: ["APPLE_WATCH"],
};

// Endpoint público — retorna cores cadastradas por modelo de qualquer categoria.
// Usado pelo formulário de troca para mostrar cores disponíveis.
// ?device_type=iphone|ipad|macbook|watch
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceType = searchParams.get("device_type") || "iphone";
  const catalogKeys = DEVICE_TO_CATALOG[deviceType] || ["IPHONES"];

  try {
    const supabase = getSupabase();

    const { data: modelos, error: e1 } = await supabase
      .from("catalogo_modelos")
      .select("id, nome")
      .in("categoria_key", catalogKeys)
      .eq("ativo", true);

    if (e1 || !modelos || modelos.length === 0) {
      // Fallback: tenta puxar cores do estoque
      return NextResponse.json({ modelos: await fallbackEstoqueCores(supabase, deviceType) });
    }

    const modeloIds = modelos.map((m) => m.id);

    // Cores podem estar em tipo_chave "cores" ou "cores_aw" (Apple Watch)
    const tipoChaves = deviceType === "watch" ? ["cores_aw", "cores"] : ["cores"];
    const { data: configs } = await supabase
      .from("catalogo_modelo_configs")
      .select("modelo_id, valor")
      .in("modelo_id", modeloIds)
      .in("tipo_chave", tipoChaves);

    const idToNome: Record<string, string> = {};
    for (const m of modelos) idToNome[m.id] = m.nome;

    const result: Record<string, string[]> = {};
    for (const c of configs ?? []) {
      const nome = idToNome[c.modelo_id];
      if (!nome) continue;
      if (!result[nome]) result[nome] = [];
      if (!result[nome].includes(c.valor)) result[nome].push(c.valor);
    }

    // Se não achou cores no catálogo, tenta fallback do estoque
    if (Object.keys(result).length === 0) {
      return NextResponse.json({ modelos: await fallbackEstoqueCores(supabase, deviceType) });
    }

    return NextResponse.json({ modelos: result });
  } catch (err) {
    return NextResponse.json({ modelos: {}, error: String(err) }, { status: 200 });
  }
}

// Fallback: busca cores únicas do estoque quando catálogo não tem configs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fallbackEstoqueCores(supabase: any, deviceType: string): Promise<Record<string, string[]>> {
  const prefixMap: Record<string, string> = { iphone: "IPHONE", ipad: "IPAD", macbook: "MAC", watch: "APPLE_WATCH" };
  const catPrefix = prefixMap[deviceType];
  if (!catPrefix) return {};

  const { data } = await supabase
    .from("estoque")
    .select("produto, cor")
    .ilike("categoria", `${catPrefix}%`)
    .not("cor", "is", null)
    .gt("qnt", 0);

  if (!data) return {};
  const result: Record<string, string[]> = {};
  for (const item of data) {
    // Agrupa por modelo base (sem cor no nome)
    const modelo = (item.produto || "").replace(/\s+(PRETO|BRANCO|PRATA|DOURADO|AZUL|VERDE|ROSA|ROXO|CINZA|ESTELAR|MEIA-NOITE|MIDNIGHT|GOLD|SILVER|BLACK|WHITE|BLUE|GREEN|PINK|RED|STARLIGHT|SPACE GRAY|GRAPHITE|NATURAL TITANIUM|BLACK TITANIUM|DESERT TITANIUM|BLUE TITANIUM|DEEP BLUE|TEAL|ULTRAMARINE|LAVENDER|SAGE|PURPLE)\s*$/i, "").trim();
    if (!result[modelo]) result[modelo] = [];
    const cor = (item.cor || "").trim();
    if (cor && !result[modelo].includes(cor)) result[modelo].push(cor);
  }
  return result;
}
