// app/api/admin/vendas/backfill-cor/route.ts
// Backfill das colunas vendas.cor / vendas.categoria / vendas.observacao pra
// vendas existentes que tem estoque_id mas nao tem esses campos preenchidos.
//
// Motivo: o POST /api/vendas nao copiava cor/categoria/observacao do estoque
// antes do fix (24/04/2026). Muitas vendas historicas ficaram com cor=null,
// deixando o display sem conseguir mostrar a cor do produto na aba Em Andamento.
//
// Este endpoint corrige tudo de uma vez:
//   POST /api/admin/vendas/backfill-cor
//     → { ok, total, atualizadas, sem_estoque, sem_cor_no_estoque }
//
//   GET /api/admin/vendas/backfill-cor (dry run)
//     → { ok, preview: { total, atualizariam, sem_cor_no_estoque } }
//
// Idempotente — so preenche onde ta vazio, nao sobrescreve dados existentes.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

interface BackfillStats {
  total: number;           // vendas com estoque_id e cor/categoria/obs null
  atualizadas: number;     // conseguiram receber valor do estoque
  sem_estoque: number;     // estoque_id aponta pra item inexistente
  sem_cor_no_estoque: number; // estoque existe mas nao tem cor
  exemplos_sem_cor: Array<{ venda_id: string; produto: string | null }>;
}

async function rodarBackfill(dry: boolean): Promise<BackfillStats> {
  const stats: BackfillStats = {
    total: 0,
    atualizadas: 0,
    sem_estoque: 0,
    sem_cor_no_estoque: 0,
    exemplos_sem_cor: [],
  };

  // Busca vendas com estoque_id e pelo menos um dos 3 campos vazio
  const { data: vendas, error } = await supabase
    .from("vendas")
    .select("id, produto, estoque_id, cor, categoria, observacao")
    .not("estoque_id", "is", null);
  if (error) throw new Error(`query vendas: ${error.message}`);
  if (!vendas || vendas.length === 0) return stats;

  // Filtra pra so as que precisam de backfill (pelo menos um campo vazio)
  const candidatas = vendas.filter(
    (v) => !v.cor || !v.categoria || !v.observacao,
  );
  stats.total = candidatas.length;
  if (candidatas.length === 0) return stats;

  // Busca os estoques correspondentes em batch
  const estoqueIds = [...new Set(candidatas.map((v) => v.estoque_id!))];
  const { data: estoques } = await supabase
    .from("estoque")
    .select("id, cor, categoria, observacao")
    .in("id", estoqueIds);
  const porEstoque = new Map((estoques || []).map((e) => [e.id, e]));

  for (const v of candidatas) {
    const est = porEstoque.get(v.estoque_id!);
    if (!est) {
      stats.sem_estoque++;
      continue;
    }
    // Decide quais campos atualizar — so os vazios na venda + nao-vazios no estoque
    const updates: Record<string, string> = {};
    if (!v.cor && est.cor) updates.cor = est.cor;
    if (!v.categoria && est.categoria) updates.categoria = est.categoria;
    if (!v.observacao && est.observacao) updates.observacao = est.observacao;

    if (Object.keys(updates).length === 0) {
      if (!v.cor) {
        stats.sem_cor_no_estoque++;
        if (stats.exemplos_sem_cor.length < 5) {
          stats.exemplos_sem_cor.push({ venda_id: v.id, produto: v.produto });
        }
      }
      continue;
    }

    if (!dry) {
      const { error: upErr } = await supabase
        .from("vendas")
        .update(updates)
        .eq("id", v.id);
      if (upErr) {
        // Nao interrompe — loga e segue
        console.error(`[backfill-cor] erro em venda ${v.id}:`, upErr.message);
        continue;
      }
    }
    stats.atualizadas++;
  }

  return stats;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const stats = await rodarBackfill(true);
    return NextResponse.json({ ok: true, dry: true, preview: stats });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const stats = await rodarBackfill(false);
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
