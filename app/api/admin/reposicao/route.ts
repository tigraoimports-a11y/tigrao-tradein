import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { hojeISO } from "@/lib/business-days";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const GRUPO_ID = process.env.TELEGRAM_CHAT_ID ?? "";

export interface ReposicaoAlert {
  produto: string;
  categoria: string;
  cor: string | null;
  estoque_atual: number;
  vendas_30d: number;
  taxa_semanal: number;
  nivel: "REPOR URGENTE" | "ACABANDO";
}

/**
 * Calcula alertas de reposição baseados na velocidade de venda dos últimos 30 dias.
 */
export async function calcularReposicaoInteligente(): Promise<ReposicaoAlert[]> {
  const hoje = hojeISO();
  const d30 = new Date();
  d30.setDate(d30.getDate() - 30);
  const from30 = d30.toISOString().split("T")[0];

  // Buscar vendas dos últimos 30 dias (excluir canceladas)
  const { data: vendas } = await supabase
    .from("vendas")
    .select("produto")
    .gte("data", from30)
    .lte("data", hoje)
    .neq("status_pagamento", "CANCELADO");

  // Agrupar vendas por produto
  const vendasPorProduto: Record<string, number> = {};
  for (const v of vendas ?? []) {
    const nome = (v.produto || "").trim();
    if (!nome) continue;
    vendasPorProduto[nome] = (vendasPorProduto[nome] || 0) + 1;
  }

  // Buscar estoque atual (apenas NOVO, excluir A_CAMINHO e PENDENCIA)
  const { data: estoque } = await supabase
    .from("estoque")
    .select("produto, categoria, cor, qnt")
    .or("tipo.is.null,tipo.eq.NOVO")
    .order("produto");

  // Agrupar estoque por nome de produto (somar quantidades se houver cores diferentes)
  const estoquePorProduto: Record<string, { qnt: number; categoria: string; cor: string | null }> = {};
  for (const item of estoque ?? []) {
    const nome = (item.produto || "").trim();
    if (!nome) continue;
    if (!estoquePorProduto[nome]) {
      estoquePorProduto[nome] = { qnt: 0, categoria: item.categoria, cor: item.cor };
    }
    estoquePorProduto[nome].qnt += Number(item.qnt || 0);
  }

  const alerts: ReposicaoAlert[] = [];

  // Verificar cada produto que teve vendas
  for (const [produto, totalVendido] of Object.entries(vendasPorProduto)) {
    const taxaSemanal = totalVendido / 4.3; // 30 dias ~= 4.3 semanas
    const estoqueInfo = estoquePorProduto[produto];
    const estoqueAtual = estoqueInfo?.qnt ?? 0;

    if (estoqueAtual <= taxaSemanal) {
      alerts.push({
        produto,
        categoria: estoqueInfo?.categoria || "IPHONES",
        cor: estoqueInfo?.cor || null,
        estoque_atual: estoqueAtual,
        vendas_30d: totalVendido,
        taxa_semanal: Math.round(taxaSemanal * 10) / 10,
        nivel: "REPOR URGENTE",
      });
    } else if (estoqueAtual <= taxaSemanal * 2) {
      alerts.push({
        produto,
        categoria: estoqueInfo?.categoria || "IPHONES",
        cor: estoqueInfo?.cor || null,
        estoque_atual: estoqueAtual,
        vendas_30d: totalVendido,
        taxa_semanal: Math.round(taxaSemanal * 10) / 10,
        nivel: "ACABANDO",
      });
    }
  }

  // Também alertar produtos com estoque > 0 que não tiveram vendas mas estoque <= 1
  // (produtos parados com estoque crítico)
  for (const [produto, info] of Object.entries(estoquePorProduto)) {
    if (!vendasPorProduto[produto] && info.qnt === 0) {
      alerts.push({
        produto,
        categoria: info.categoria,
        cor: info.cor,
        estoque_atual: 0,
        vendas_30d: 0,
        taxa_semanal: 0,
        nivel: "REPOR URGENTE",
      });
    }
  }

  // Ordenar: URGENTE primeiro, depois ACABANDO
  alerts.sort((a, b) => {
    if (a.nivel !== b.nivel) return a.nivel === "REPOR URGENTE" ? -1 : 1;
    return a.produto.localeCompare(b.produto);
  });

  return alerts;
}

/**
 * Formata os alertas para mensagem Telegram HTML.
 */
export function formatReposicaoHTML(alerts: ReposicaoAlert[]): string {
  const urgentes = alerts.filter((a) => a.nivel === "REPOR URGENTE");
  const acabando = alerts.filter((a) => a.nivel === "ACABANDO");

  const lines = [`🔔 <b>ALERTA DE REPOSIÇÃO INTELIGENTE</b>`, ""];

  if (urgentes.length > 0) {
    lines.push(`🔴 <b>REPOR URGENTE:</b>`);
    for (const a of urgentes) {
      const rate = a.taxa_semanal > 0 ? `vende ${a.taxa_semanal}/sem` : "sem vendas";
      lines.push(`  • ${a.produto} — ${rate}, tem ${a.estoque_atual} un.`);
    }
    lines.push("");
  }

  if (acabando.length > 0) {
    lines.push(`🟡 <b>ACABANDO:</b>`);
    for (const a of acabando) {
      lines.push(`  • ${a.produto} — vende ${a.taxa_semanal}/sem, tem ${a.estoque_atual} un.`);
    }
    lines.push("");
  }

  if (urgentes.length === 0 && acabando.length === 0) {
    lines.push(`✅ Estoque saudável! Nenhum produto crítico baseado na velocidade de venda.`);
    lines.push("");
  }

  lines.push(`📊 Baseado nas vendas dos últimos 30 dias`);

  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const notify = searchParams.get("notify") === "true";

  const alerts = await calcularReposicaoInteligente();
  const message = formatReposicaoHTML(alerts);

  if (notify && GRUPO_ID) {
    await sendTelegramMessage(message, GRUPO_ID);
  }

  return NextResponse.json({
    data: alerts,
    total_urgente: alerts.filter((a) => a.nivel === "REPOR URGENTE").length,
    total_acabando: alerts.filter((a) => a.nivel === "ACABANDO").length,
    message: notify ? "Notificação enviada ao Telegram" : undefined,
  });
}
