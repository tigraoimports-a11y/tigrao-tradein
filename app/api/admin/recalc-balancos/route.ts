import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";
import { recalcBalancos } from "@/lib/recalc-balancos";
import { getModeloBase } from "@/lib/produto-display";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * POST: Recalcula o balanço (preco medio ponderado).
 *
 * Body opcional:
 * - { modelos: [{ categoria, modeloBase }] } — recalcula APENAS os modelos listados.
 *   Usado pra balanco manual de seminovos na tela /admin/usados.
 * - { includeSeminovos: true } — inclui SEMINOVOS na passada geral (nao e default).
 *
 * Sem body ou vazio: recalcula tudo EXCETO seminovos (comportamento padrao).
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let body: { modelos?: Array<{ categoria: string; modeloBase: string }>; includeSeminovos?: boolean } = {};
    try { body = await req.json(); } catch { /* no body = default */ }

    const opts: Parameters<typeof recalcBalancos>[0] = {};
    if (Array.isArray(body.modelos) && body.modelos.length > 0) {
      opts.onlyModelos = body.modelos;
      // Quando manual, permite incluir seminovos (padrão do manual)
      opts.excludeSeminovos = false;
    } else if (body.includeSeminovos) {
      opts.excludeSeminovos = false;
    }

    const { groups, updated } = await recalcBalancos(opts);

    const descricao = opts.onlyModelos
      ? `Manual: ${opts.onlyModelos.length} modelo(s), ${updated} produtos atualizados`
      : `Automatico: ${groups} grupos, ${updated} produtos atualizados`;

    await logActivity(
      getUsuario(req),
      "Recalculou balancos",
      descricao,
      "estoque"
    );

    return NextResponse.json({ ok: true, groups, updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * GET: Preview do balanço manual de seminovos.
 * Retorna lista de modelos em estoque com tipo=SEMINOVO, agrupados por
 * categoria + modelo base (getModeloBase), com quantidade, valor total
 * (custo_compra ponderado) e o balanço calculado (custo médio).
 * Usado pra UI de seleção antes de aplicar.
 */
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { supabase } = await import("@/lib/supabase");
    const { data: items, error } = await supabase
      .from("estoque")
      .select("id, categoria, produto, cor, tipo, qnt, custo_compra, custo_unitario")
      .eq("status", "EM ESTOQUE")
      .eq("tipo", "SEMINOVO")
      .gt("qnt", 0)
      .range(0, 49999);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Row = { id: string; categoria: string; produto: string; cor: string | null; tipo: string | null; qnt: number; custo_compra: number; custo_unitario: number };
    interface Grupo {
      categoria: string;
      modeloBase: string;
      qnt: number;
      custoTotal: number; // soma(qnt * custo_compra)
      custoAtual: number; // custo_unitario atual (de um dos itens)
      balancoCalculado: number; // custoTotal / qnt
      precisaAtualizar: boolean;
      qntItens: number; // quantos registros na tabela estoque fazem parte
    }
    const groups = new Map<string, Grupo>();
    for (const raw of (items || []) as unknown as Row[]) {
      const cc = Number(raw.custo_compra || 0);
      if (cc <= 0) continue;
      const modeloBase = getModeloBase(raw.produto, raw.categoria);
      const key = `${raw.categoria}|${modeloBase}`;
      const g = groups.get(key) || {
        categoria: raw.categoria,
        modeloBase,
        qnt: 0,
        custoTotal: 0,
        custoAtual: Number(raw.custo_unitario || 0),
        balancoCalculado: 0,
        precisaAtualizar: false,
        qntItens: 0,
      };
      const q = Number(raw.qnt || 0);
      g.qnt += q;
      g.custoTotal += q * cc;
      g.qntItens += 1;
      groups.set(key, g);
    }

    const result = [...groups.values()].map((g) => {
      g.balancoCalculado = g.qnt > 0 ? Math.round((g.custoTotal / g.qnt) * 100) / 100 : 0;
      g.precisaAtualizar = Math.abs(g.balancoCalculado - g.custoAtual) > 0.01;
      return g;
    }).sort((a, b) => a.modeloBase.localeCompare(b.modeloBase));

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
