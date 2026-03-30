import { NextResponse } from "next/server";

export async function GET() {
  const { supabase } = await import("@/lib/supabase");

  const { data } = await supabase
    .from("estoque")
    .select("produto, categoria, cor, qnt, custo_unitario, preco_venda")
    .eq("status", "EM ESTOQUE")
    .gt("qnt", 0)
    .neq("tipo", "PENDENCIA")
    .neq("tipo", "SEMINOVO")
    .order("categoria")
    .order("produto");

  // Agrupar por categoria
  const cats: Record<string, { produto: string; cor: string | null; preco: number | null }[]> = {};
  for (const item of (data || [])) {
    const cat = item.categoria || "OUTROS";
    if (!cats[cat]) cats[cat] = [];
    const nome = item.cor ? `${item.produto} - ${item.cor}` : item.produto;
    // Evitar duplicatas
    if (!cats[cat].find(p => p.produto === nome)) {
      cats[cat].push({ produto: nome, cor: item.cor, preco: item.preco_venda || null });
    }
  }

  return NextResponse.json({ categorias: cats });
}
