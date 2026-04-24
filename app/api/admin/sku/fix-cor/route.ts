// app/api/admin/sku/fix-cor/route.ts
// Endpoint pontual pra corrigir SKUs existentes quando um sinonimo de cor
// novo e adicionado ao mapa COR_PT_TO_EN. Muito mais rapido que rodar
// backfill com force=1 (que regenera TUDO) — aqui so mexe nas rows que
// realmente contem a cor antiga.
//
// Caso motivador: PRATEADO/PRATEADA adicionados como sinonimos de SILVER
// (ver fix do Nicolas, Apple Watch). Rows antigas com ...-PRATEADO precisam
// virar ...-PRATA sem rodar backfill completo.
//
// Uso:
//   POST /api/admin/sku/fix-cor?de=PRATEADO&para=PRATA
//   POST /api/admin/sku/fix-cor?de=PRATEADO&para=PRATA&dry=1
//
// Tabelas afetadas: estoque, loja_variacoes, avaliacao_usados, vendas,
// encomendas, link_compras, simulacoes, avisos_clientes.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const TABELAS = [
  "estoque",
  "loja_variacoes",
  "avaliacao_usados",
  "vendas",
  "encomendas",
  "link_compras",
  "simulacoes",
  "avisos_clientes",
];

interface Stat {
  tabela: string;
  encontrados: number;
  atualizados: number;
  exemplos: Array<{ id: string; de: string; para: string }>;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const de = (req.nextUrl.searchParams.get("de") || "").trim().toUpperCase();
  const para = (req.nextUrl.searchParams.get("para") || "").trim().toUpperCase();
  const dry = req.nextUrl.searchParams.get("dry") === "1";

  if (!de || !para) {
    return NextResponse.json({ error: "params 'de' e 'para' obrigatorios (ex: ?de=PRATEADO&para=PRATA)" }, { status: 400 });
  }
  if (de === para) {
    return NextResponse.json({ error: "'de' e 'para' iguais — nada a fazer" }, { status: 400 });
  }

  const stats: Stat[] = [];

  for (const tabela of TABELAS) {
    const stat: Stat = { tabela, encontrados: 0, atualizados: 0, exemplos: [] };

    // Busca rows com SKU contendo -{DE} (cobre final do SKU e meio ex:
    // "...PRATEADO", "...PRATEADO-SEMINOVO"). Usa ilike pra case-insensitive.
    const { data: rows, error } = await supabase
      .from(tabela)
      .select("id, sku")
      .ilike("sku", `%-${de}%`);

    if (error) {
      // Algumas tabelas podem nao ter coluna sku ainda, ou coluna id com outro nome.
      // Registra mas nao derruba o endpoint.
      stats.push({ ...stat, atualizados: -1, exemplos: [{ id: "ERRO", de: error.message, para: "" }] });
      continue;
    }
    if (!rows) {
      stats.push(stat);
      continue;
    }

    // Filtra em JS pra garantir que substituicao e segura (evita match parcial tipo
    // "PRATEADOX" quando a regex do ilike casaria). Regex ancorada em delimitadores.
    const regex = new RegExp(`(^|-)${de}(?=$|-)`, "g");
    const updates: Array<{ id: string; sku: string }> = [];
    for (const row of rows) {
      if (!row.sku || typeof row.sku !== "string") continue;
      if (!regex.test(row.sku)) continue;
      // Reseta o lastIndex do regex global
      regex.lastIndex = 0;
      const novoSku = row.sku.replace(regex, (m, prefix) => `${prefix}${para}`);
      if (novoSku !== row.sku) {
        updates.push({ id: row.id, sku: novoSku });
        if (stat.exemplos.length < 5) {
          stat.exemplos.push({ id: row.id, de: row.sku, para: novoSku });
        }
      }
    }

    stat.encontrados = updates.length;

    if (!dry && updates.length > 0) {
      for (const u of updates) {
        const { error: updErr } = await supabase.from(tabela).update({ sku: u.sku }).eq("id", u.id);
        if (!updErr) stat.atualizados++;
      }
    }

    stats.push(stat);
  }

  const totalEncontrados = stats.reduce((s, x) => s + x.encontrados, 0);
  const totalAtualizados = stats.reduce((s, x) => s + Math.max(0, x.atualizados), 0);

  return NextResponse.json({
    ok: true,
    dry,
    de,
    para,
    total_encontrados: totalEncontrados,
    total_atualizados: totalAtualizados,
    stats,
  });
}
