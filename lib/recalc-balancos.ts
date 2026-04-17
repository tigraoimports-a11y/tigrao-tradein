import { createClient } from "@supabase/supabase-js";
import { getModeloBase } from "./produto-display";

/**
 * Recalcula o balanço (custo_unitario = preço médio ponderado) de todos
 * os produtos EM ESTOQUE, agrupados por (categoria + modelo base via getModeloBase).
 *
 * Pode ser chamado internamente por qualquer route sem HTTP round-trip.
 *
 * Opcoes:
 * - excludeSeminovos: se true (default), NAO mexe em produtos com categoria SEMINOVOS.
 *   Balanco de seminovos e manual (via /admin/usados), pra evitar distorcao no
 *   controle financeiro quando chegam produtos de troca com custos diferentes.
 * - onlyModelos: se passado, recalcula APENAS os modelos listados (modelo base
 *   retornado por getModeloBase). Ignora outros. Use pra balanco manual seletivo.
 *
 * Retorna { groups, updated }.
 */
export async function recalcBalancos(opts?: {
  excludeSeminovos?: boolean;
  onlyModelos?: Array<{ categoria: string; modeloBase: string }>;
}): Promise<{ groups: number; updated: number }> {
  const excludeSeminovos = opts?.excludeSeminovos !== false; // default true
  const onlyModelos = opts?.onlyModelos;
  const onlySet = onlyModelos ? new Set(onlyModelos.map(m => `${m.categoria}|${m.modeloBase}`)) : null;

  const sb = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  );

  const { data: items, error } = await sb
    .from("estoque")
    .select("id, categoria, produto, cor, qnt, custo_compra, custo_unitario")
    .eq("status", "EM ESTOQUE")
    .gt("qnt", 0)
    .range(0, 49999);

  if (error || !items || items.length === 0) return { groups: 0, updated: 0 };

  type Row = { id: string; categoria: string; produto: string; cor: string | null; qnt: number; custo_compra: number; custo_unitario: number };
  const groups = new Map<string, Row[]>();
  for (const raw of items as unknown as Row[]) {
    const cc = Number(raw.custo_compra || 0);
    if (cc <= 0) continue;
    // Pular SEMINOVOS no balanco automatico (feito manual via /admin/usados)
    if (excludeSeminovos && String(raw.categoria || "").toUpperCase() === "SEMINOVOS") continue;
    // Usa getModeloBase para agrupar de forma consistente com o restante do sistema
    const modeloBase = getModeloBase(raw.produto, raw.categoria);
    const key = `${raw.categoria || ""}|${modeloBase}`;
    // Se filtro de modelos, so processa os selecionados
    if (onlySet && !onlySet.has(key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(raw);
  }

  let updated = 0;
  const updatesByBalanco = new Map<number, string[]>();

  for (const [, rows] of groups) {
    let totalCusto = 0;
    let totalQnt = 0;
    for (const r of rows) {
      totalCusto += Number(r.qnt || 0) * Number(r.custo_compra || 0);
      totalQnt += Number(r.qnt || 0);
    }
    if (totalQnt <= 0) continue;
    const balanco = Math.round((totalCusto / totalQnt) * 100) / 100;

    const idsToUpdate = rows
      .filter(r => Number(r.custo_unitario || 0) !== balanco)
      .map(r => r.id);
    if (idsToUpdate.length === 0) continue;

    if (!updatesByBalanco.has(balanco)) updatesByBalanco.set(balanco, []);
    updatesByBalanco.get(balanco)!.push(...idsToUpdate);
    updated += idsToUpdate.length;
  }

  for (const [balanco, ids] of updatesByBalanco) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await sb
        .from("estoque")
        .update({ custo_unitario: balanco, updated_at: new Date().toISOString() })
        .in("id", chunk);
    }
  }

  return { groups: groups.size, updated };
}
