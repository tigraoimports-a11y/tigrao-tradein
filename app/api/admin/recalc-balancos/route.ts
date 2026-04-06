import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * Recalcula o balanço (custo_unitario) de todos os produtos EM ESTOQUE.
 *
 * Regra: agrupa por (categoria + nome do produto SEM a cor) e calcula
 * a média ponderada de custo_compra pesada por qnt. Atualiza custo_unitario
 * de todas as linhas do grupo. NÃO toca em custo_compra.
 *
 * Isso funciona para todas as categorias porque buildProdutoName sempre
 * coloca a cor no final do nome:
 *   - iPhone:  IPHONE 17 PRO 256GB DEEP BLUE → IPHONE 17 PRO 256GB
 *   - MacBook: MACBOOK AIR M3 13" 16GB 512GB MIDNIGHT → MACBOOK AIR M3 13" 16GB 512GB
 *   - iPad:    IPAD PRO 11" M4 256GB WIFI SILVER → IPAD PRO 11" M4 256GB WIFI
 *   - Watch:   APPLE WATCH S10 46MM GPS MIDNIGHT → APPLE WATCH S10 46MM GPS
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Buscar todos os itens EM ESTOQUE com custo_compra válido
  const { data: items, error } = await supabase
    .from("estoque")
    .select("id, categoria, produto, cor, qnt, custo_compra, custo_unitario")
    .eq("status", "EM ESTOQUE")
    .gt("qnt", 0)
    .range(0, 49999);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, groups: 0, updated: 0 });
  }

  // Função: remove a cor do final do nome do produto (case-insensitive).
  function stripCor(produto: string, cor: string | null): string {
    const p = (produto || "").toUpperCase().trim();
    if (!cor) return p;
    const c = cor.toUpperCase().trim();
    if (!c) return p;
    // Remove " COR" do final (com espaços antes)
    const re = new RegExp(`\\s+${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
    return p.replace(re, "").trim();
  }

  // Agrupar por categoria + model_key
  type Row = { id: string; categoria: string; produto: string; cor: string | null; qnt: number; custo_compra: number; custo_unitario: number };
  const groups = new Map<string, Row[]>();
  for (const raw of items as unknown as Row[]) {
    const cc = Number(raw.custo_compra || 0);
    if (cc <= 0) continue; // sem custo_compra válido — ignora pro cálculo
    const key = `${raw.categoria || ""}|${stripCor(raw.produto, raw.cor)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(raw);
  }

  // Calcular média ponderada e atualizar quem precisar
  let updated = 0;
  const updatesByBalanco = new Map<number, string[]>();

  for (const [, rows] of groups) {
    let totalCusto = 0;
    let totalQnt = 0;
    for (const r of rows) {
      const q = Number(r.qnt || 0);
      const c = Number(r.custo_compra || 0);
      totalCusto += q * c;
      totalQnt += q;
    }
    if (totalQnt <= 0) continue;
    const balanco = Math.round((totalCusto / totalQnt) * 100) / 100;

    // Só atualiza quem tem valor diferente
    const idsToUpdate = rows
      .filter(r => Number(r.custo_unitario || 0) !== balanco)
      .map(r => r.id);
    if (idsToUpdate.length === 0) continue;

    if (!updatesByBalanco.has(balanco)) updatesByBalanco.set(balanco, []);
    updatesByBalanco.get(balanco)!.push(...idsToUpdate);
    updated += idsToUpdate.length;
  }

  // Aplicar updates agrupados por valor (menos round-trips)
  for (const [balanco, ids] of updatesByBalanco) {
    // Chunked update (evita payload muito grande)
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { error: ue } = await supabase
        .from("estoque")
        .update({ custo_unitario: balanco, updated_at: new Date().toISOString() })
        .in("id", chunk);
      if (ue) return NextResponse.json({ error: ue.message, updatedSoFar: updated }, { status: 500 });
    }
  }

  await logActivity(
    getUsuario(req),
    "Recalculou balanços",
    `${groups.size} grupos, ${updated} produtos atualizados`,
    "estoque"
  );

  return NextResponse.json({ ok: true, groups: groups.size, updated });
}
