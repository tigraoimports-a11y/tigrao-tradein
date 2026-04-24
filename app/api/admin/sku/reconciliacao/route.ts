// app/api/admin/sku/reconciliacao/route.ts
// Detecta inconsistencias entre estoque e vendas usando SKU canonico como
// chave de cruzamento. Projetado pra auditoria semanal/mensal — responde
// "cade as coisas que nao batem?".
//
// 3 tipos de inconsistencia:
//
//   1. SKU_DIVERGENTE_PERSISTIDO:
//      Venda com estoque_id vinculado, mas vendas.sku ≠ estoque.sku.
//      Significa que o bloqueio falhou antes (pre-validacao) ou o admin
//      editou depois. Risco: produto errado foi separado pro cliente.
//
//   2. ESGOTADO_SEM_VENDA:
//      Item de estoque com status ESGOTADO/VENDIDO mas sem venda vinculada
//      (nenhuma venda com estoque_id apontando pra ele). Possivel sumico/
//      roubo/venda fora do sistema.
//
//   3. VENDA_SEM_ESTOQUE:
//      Venda registrada sem estoque_id (nao deduziu de nenhum item).
//      Possivel dupla-contagem — o estoque ainda pensa que tem.
//
// Uso:
//   GET /api/admin/sku/reconciliacao?from=YYYY-MM-DD
//   Default: ultimos 30 dias.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

interface Inconsistencia {
  tipo: "SKU_DIVERGENTE_PERSISTIDO" | "ESGOTADO_SEM_VENDA" | "VENDA_SEM_ESTOQUE";
  severidade: "alta" | "media" | "baixa";
  descricao: string;
  produto: string;
  detalhes: Record<string, string | number | null>;
  ids: { venda_id?: string; estoque_id?: string };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fromParam = req.nextUrl.searchParams.get("from");
  const fromDate = fromParam || daysAgoIso(30).slice(0, 10);

  try {
    const resultados: Inconsistencia[] = [];

    // ── 1. SKU divergente persistido ────────────────────────────────
    // Vendas com estoque_id + sku diferente do estoque.sku
    const { data: vendasComEstoque } = await supabase
      .from("vendas")
      .select("id, produto, sku, estoque_id, cliente, data, preco_vendido")
      .not("estoque_id", "is", null)
      .not("sku", "is", null)
      .gte("data", fromDate)
      .neq("status_pagamento", "CANCELADO");

    if (vendasComEstoque && vendasComEstoque.length > 0) {
      const estoqueIds = vendasComEstoque.map((v) => v.estoque_id!).filter(Boolean) as string[];
      const { data: itensEstoque } = await supabase
        .from("estoque")
        .select("id, sku, produto")
        .in("id", estoqueIds);
      const estoqueMap = new Map<string, { sku: string | null; produto: string }>(
        (itensEstoque || []).map((e) => [e.id, { sku: e.sku, produto: e.produto }]),
      );

      for (const v of vendasComEstoque) {
        const est = estoqueMap.get(v.estoque_id!);
        if (!est || !est.sku) continue; // se estoque nao tem SKU, pula
        if (est.sku !== v.sku) {
          resultados.push({
            tipo: "SKU_DIVERGENTE_PERSISTIDO",
            severidade: "alta",
            descricao: "Venda vinculada a item de estoque com SKU diferente",
            produto: v.produto || est.produto,
            detalhes: {
              venda_sku: v.sku,
              estoque_sku: est.sku,
              cliente: v.cliente || "?",
              data: v.data || "?",
              preco: Number(v.preco_vendido || 0),
            },
            ids: { venda_id: v.id, estoque_id: v.estoque_id! },
          });
        }
      }
    }

    // ── 2. Esgotado sem venda (produto sumiu) ──────────────────────
    // Itens de estoque com status=ESGOTADO no periodo mas sem venda vinculada.
    // So checa os ESGOTADOS recentemente (updated_at >= fromDate) pra evitar
    // lixo historico antigo.
    const { data: esgotados } = await supabase
      .from("estoque")
      .select("id, produto, sku, cor, serial_no, imei, custo_unitario, updated_at")
      .eq("status", "ESGOTADO")
      .gte("updated_at", fromDate);

    if (esgotados && esgotados.length > 0) {
      const esgotadoIds = esgotados.map((e) => e.id);
      const { data: vendasVinculadas } = await supabase
        .from("vendas")
        .select("estoque_id")
        .in("estoque_id", esgotadoIds);
      const vinculados = new Set((vendasVinculadas || []).map((v) => v.estoque_id));

      for (const e of esgotados) {
        if (vinculados.has(e.id)) continue;
        resultados.push({
          tipo: "ESGOTADO_SEM_VENDA",
          severidade: "alta",
          descricao: "Item marcado como ESGOTADO mas sem venda vinculada",
          produto: e.produto,
          detalhes: {
            sku: e.sku || "sem SKU",
            cor: e.cor,
            serial: e.serial_no,
            imei: e.imei,
            custo: Number(e.custo_unitario || 0),
            desde: e.updated_at ? e.updated_at.slice(0, 10) : "?",
          },
          ids: { estoque_id: e.id },
        });
      }
    }

    // ── 3. Venda sem estoque vinculado (nao deduziu estoque) ────────
    // So sinaliza vendas com SKU populado (senao nao tem baseline pra validar)
    // e que deveriam ter vinculacao (modelo conhecido com serial).
    const { data: vendasSemEstoque } = await supabase
      .from("vendas")
      .select("id, produto, sku, cliente, data, preco_vendido, serial_no, imei")
      .is("estoque_id", null)
      .not("sku", "is", null)
      .gte("data", fromDate)
      .neq("status_pagamento", "CANCELADO")
      .neq("status_pagamento", "FORMULARIO_PREENCHIDO"); // formulario preenchido ainda nao foi processado

    if (vendasSemEstoque && vendasSemEstoque.length > 0) {
      for (const v of vendasSemEstoque) {
        // Se tem serial ou imei, provavelmente e aparelho rastreavel que deveria
        // estar vinculado. Sem serial/imei (ex: AirPods unitarios), nao alerta.
        if (!v.serial_no && !v.imei) continue;
        resultados.push({
          tipo: "VENDA_SEM_ESTOQUE",
          severidade: "media",
          descricao: "Venda registrada sem vincular item do estoque",
          produto: v.produto,
          detalhes: {
            sku: v.sku,
            cliente: v.cliente || "?",
            data: v.data || "?",
            serial: v.serial_no,
            imei: v.imei,
            preco: Number(v.preco_vendido || 0),
          },
          ids: { venda_id: v.id },
        });
      }
    }

    // Resumo
    const resumo = {
      total: resultados.length,
      por_tipo: {
        SKU_DIVERGENTE_PERSISTIDO: resultados.filter((r) => r.tipo === "SKU_DIVERGENTE_PERSISTIDO").length,
        ESGOTADO_SEM_VENDA: resultados.filter((r) => r.tipo === "ESGOTADO_SEM_VENDA").length,
        VENDA_SEM_ESTOQUE: resultados.filter((r) => r.tipo === "VENDA_SEM_ESTOQUE").length,
      },
      por_severidade: {
        alta: resultados.filter((r) => r.severidade === "alta").length,
        media: resultados.filter((r) => r.severidade === "media").length,
        baixa: resultados.filter((r) => r.severidade === "baixa").length,
      },
      periodo: { from: fromDate, until: new Date().toISOString().slice(0, 10) },
    };

    return NextResponse.json({ ok: true, resumo, inconsistencias: resultados });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
