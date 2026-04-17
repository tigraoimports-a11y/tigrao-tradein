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
 * - { ids: string[] } — aplica balanco MANUAL apenas nessas unidades especificas
 *   (ids do estoque). Calcula o preco medio ponderado das unidades selecionadas
 *   e atualiza o custo_unitario de cada uma pro mesmo valor.
 *   Usado pra balanco manual na tela /admin/estoque > aba Seminovos — permite
 *   excluir unidades avariadas do calculo.
 * - { modelos: [{ categoria, modeloBase }] } — legacy, aplica em TODOS itens do
 *   grupo (modo agrupado).
 * - { includeSeminovos: true } — inclui SEMINOVOS na passada geral (nao e default).
 *
 * Sem body ou vazio: recalcula tudo EXCETO seminovos (comportamento padrao).
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    let body: {
      ids?: string[];
      modelos?: Array<{ categoria: string; modeloBase: string }>;
      includeSeminovos?: boolean;
    } = {};
    try { body = await req.json(); } catch { /* no body = default */ }

    // Modo por IDs especificos (novo, mais granular)
    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const { supabase } = await import("@/lib/supabase");
      const { data: itens, error } = await supabase
        .from("estoque")
        .select("id, qnt, custo_compra")
        .in("id", body.ids);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (!itens || itens.length === 0) return NextResponse.json({ error: "Nenhum item encontrado" }, { status: 404 });
      // Calcula media ponderada pelas quantidades
      let totalCusto = 0;
      let totalQnt = 0;
      for (const it of itens) {
        const q = Number(it.qnt || 0);
        const c = Number(it.custo_compra || 0);
        if (c <= 0 || q <= 0) continue;
        totalCusto += q * c;
        totalQnt += q;
      }
      if (totalQnt === 0) return NextResponse.json({ error: "Itens sem quantidade ou custo valido" }, { status: 400 });
      const novoCusto = Math.round((totalCusto / totalQnt) * 100) / 100;
      // Atualiza todos pros mesmo custo_unitario
      const { error: upErr } = await supabase
        .from("estoque")
        .update({ custo_unitario: novoCusto, updated_at: new Date().toISOString() })
        .in("id", body.ids);
      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

      await logActivity(
        getUsuario(req),
        "Balanco manual por unidades",
        `${body.ids.length} unidade(s) com novo custo R$ ${novoCusto.toLocaleString("pt-BR")}`,
        "estoque"
      );

      return NextResponse.json({ ok: true, updated: body.ids.length, novoCusto });
    }

    // Modo legacy por modelos
    const opts: Parameters<typeof recalcBalancos>[0] = {};
    if (Array.isArray(body.modelos) && body.modelos.length > 0) {
      opts.onlyModelos = body.modelos;
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

    type Row = {
      id: string;
      categoria: string;
      produto: string;
      cor: string | null;
      tipo: string | null;
      qnt: number;
      custo_compra: number;
      custo_unitario: number;
      serial_no?: string | null;
      imei?: string | null;
      observacao?: string | null;
      fornecedor?: string | null;
    };

    // Reselect com colunas extras pra mostrar na UI
    const { data: itemsDetalhados } = await supabase
      .from("estoque")
      .select("id, categoria, produto, cor, tipo, qnt, custo_compra, custo_unitario, serial_no, imei, observacao, fornecedor")
      .eq("status", "EM ESTOQUE")
      .eq("tipo", "SEMINOVO")
      .gt("qnt", 0)
      .range(0, 49999);

    interface Unidade {
      id: string;
      produto: string;
      cor: string | null;
      qnt: number;
      custo_compra: number;
      custo_unitario: number;
      serial_no: string | null;
      imei: string | null;
      observacao: string | null;
      fornecedor: string | null;
    }
    interface Grupo {
      categoria: string;
      modeloBase: string;
      qnt: number;
      custoTotal: number;
      custoAtual: number;
      balancoCalculado: number;
      precisaAtualizar: boolean;
      unidades: Unidade[];
    }
    const groups = new Map<string, Grupo>();
    for (const raw of (itemsDetalhados || []) as unknown as Row[]) {
      const cc = Number(raw.custo_compra || 0);
      // Nao pulamos mais unidades sem custo_compra — mostramos elas pro user ver.
      // Elas so nao entram no calculo de media ponderada (q/cc=0 nao altera).
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
        unidades: [] as Unidade[],
      };
      const q = Number(raw.qnt || 0);
      // So soma quando tem custo_compra valido (unidades sem custo ficam listadas mas nao contam).
      if (cc > 0) {
        g.qnt += q;
        g.custoTotal += q * cc;
      }
      g.unidades.push({
        id: raw.id,
        produto: raw.produto,
        cor: raw.cor ?? null,
        qnt: q,
        custo_compra: cc,
        custo_unitario: Number(raw.custo_unitario || 0),
        serial_no: raw.serial_no ?? null,
        imei: raw.imei ?? null,
        observacao: raw.observacao ?? null,
        fornecedor: raw.fornecedor ?? null,
      });
      groups.set(key, g);
    }

    const result = [...groups.values()].map((g) => {
      g.balancoCalculado = g.qnt > 0 ? Math.round((g.custoTotal / g.qnt) * 100) / 100 : 0;
      g.precisaAtualizar = Math.abs(g.balancoCalculado - g.custoAtual) > 0.01;
      // Ordena unidades por serial (ou custo se sem serial)
      g.unidades.sort((a, b) => (a.serial_no || "").localeCompare(b.serial_no || ""));
      return g;
    }).sort((a, b) => a.modeloBase.localeCompare(b.modeloBase));

    return NextResponse.json({ data: result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
