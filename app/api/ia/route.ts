import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function coletarContexto() {
  const supabase = getSupabase();
  // Busca dados do negócio para contexto
  const [estoqueRes, vendasRes] = await Promise.all([
    supabase
      .from("estoque")
      .select("*")
      .order("produto")
      .range(0, 49999),
    supabase
      .from("vendas")
      .select("*")
      .order("data", { ascending: false })
      .range(0, 49999),
  ]);

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const debugInfo: { estoqueRows: number; vendasRows: number; estoqueErr?: string; vendasErr?: string; envUrl: string; envKey: boolean } = {
    estoqueRows: estoqueRes.data?.length || 0,
    vendasRows: vendasRes.data?.length || 0,
    envUrl: url ? url.replace(/https?:\/\//, "").slice(0, 30) : "MISSING",
    envKey: hasKey,
  };
  if (estoqueRes.error) {
    console.error("[IA] erro estoque:", estoqueRes.error);
    debugInfo.estoqueErr = estoqueRes.error.message;
  }
  if (vendasRes.error) {
    console.error("[IA] erro vendas:", vendasRes.error);
    debugInfo.vendasErr = vendasRes.error.message;
  }

  const estoqueAll = estoqueRes.data || [];
  // Filtra em JS para não excluir linhas com tipo NULL (PostgREST .not/.neq descarta NULLs)
  const estoqueData = estoqueAll.filter(i => i.tipo !== "PENDENCIA" && i.tipo !== "A_CAMINHO");
  const pendenciasData = estoqueAll.filter(i => i.tipo === "PENDENCIA");
  // Vendas: filtra últimos 30 dias e cancelados em JS (mais robusto que .gte do PostgREST)
  const limite30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const vendasData = (vendasRes.data || []).filter(
    v => v.status_pagamento !== "CANCELADO" && v.data && String(v.data).slice(0, 10) >= limite30d
  );
  console.log(`[IA] estoque rows=${estoqueAll.length} vendas rows=${vendasRes.data?.length || 0} vendas30d=${vendasData.length}`);

  // Agrupar estoque por modelo
  const estoqueAgrupado: Record<string, { qnt: number; preco?: number; custo?: number; min?: number }> = {};
  for (const item of estoqueData) {
    const key = `${item.produto}${item.storage ? " " + item.storage : ""}${item.cor ? " " + item.cor : ""}`.trim();
    if (!estoqueAgrupado[key]) estoqueAgrupado[key] = { qnt: 0 };
    estoqueAgrupado[key].qnt += item.qnt || 0;
    if (item.preco_sugerido) estoqueAgrupado[key].preco = item.preco_sugerido;
    if (item.custo_unitario) estoqueAgrupado[key].custo = item.custo_unitario;
    if (item.estoque_minimo) estoqueAgrupado[key].min = item.estoque_minimo;
  }

  // Estatísticas de vendas
  const totalVendas = vendasData.length;
  const receitaTotal = vendasData.reduce((s, v) => s + (v.preco_vendido || 0), 0);

  // Vendas por produto (top 10)
  const vendasPorProduto: Record<string, number> = {};
  for (const v of vendasData) {
    const key = `${v.produto}`.trim();
    vendasPorProduto[key] = (vendasPorProduto[key] || 0) + 1;
  }
  const topProdutos = Object.entries(vendasPorProduto)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([k, v]) => `${k}: ${v} vendas`);

  // Vendas por vendedor
  const vendasPorVendedor: Record<string, number> = {};
  for (const v of vendasData) {
    const nome = v.vendedor || "Sem vendedor";
    vendasPorVendedor[nome] = (vendasPorVendedor[nome] || 0) + 1;
  }

  // Detectar custos divergentes (mesmo produto, custo diferente)
  const custoPorProduto: Record<string, Set<number>> = {};
  for (const item of estoqueData) {
    if (!item.custo_unitario) continue;
    const key = `${item.produto}${item.storage ? " " + item.storage : ""}${item.cor ? " " + item.cor : ""}`.trim();
    if (!custoPorProduto[key]) custoPorProduto[key] = new Set();
    custoPorProduto[key].add(item.custo_unitario);
  }
  const divergencias = Object.entries(custoPorProduto)
    .filter(([, custos]) => custos.size > 1)
    .map(([k, custos]) => `${k}: ${Array.from(custos).map(c => `R$${c.toLocaleString("pt-BR")}`).join(" vs ")}`)
    .slice(0, 10);

  // Produtos zerados
  const zerados = Object.entries(estoqueAgrupado)
    .filter(([, v]) => v.qnt === 0)
    .map(([k]) => k)
    .slice(0, 20);

  // Produtos abaixo do mínimo
  const abaixoMin = Object.entries(estoqueAgrupado)
    .filter(([, v]) => v.min && v.min > 0 && v.qnt < v.min)
    .map(([k, v]) => `${k}: tem ${v.qnt}, mínimo ${v.min}`)
    .slice(0, 20);

  // Pendências antigas (mais de 15 dias)
  const quinzeDiasAtras = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const pendenciasAntigas = pendenciasData
    .filter(p => p.created_at && p.created_at < quinzeDiasAtras)
    .map(p => `${p.produto}${p.storage ? " " + p.storage : ""} - cliente: ${p.cliente || "sem nome"}`)
    .slice(0, 10);

  return {
    estoqueAgrupado,
    totalItensEstoque: Object.values(estoqueAgrupado).reduce((s, v) => s + v.qnt, 0),
    totalModelosEstoque: Object.keys(estoqueAgrupado).length,
    totalPendencias: pendenciasData.length,
    pendenciasAntigas,
    totalVendas30d: totalVendas,
    receitaTotal30d: receitaTotal,
    topProdutos,
    vendasPorVendedor,
    divergenciasCusto: divergencias,
    produtosZerados: zerados,
    produtosAbaixoMinimo: abaixoMin,
    debugInfo,
  };
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { mensagem, historico = [], modo } = body;

    // SEMPRE busca contexto — antes só era buscado na primeira mensagem,
    // o que fazia a IA "esquecer" os dados a partir da segunda pergunta.
    let contexto = "";
    let debugInfo: { estoqueRows: number; vendasRows: number; estoqueErr?: string; vendasErr?: string; envUrl?: string; envKey?: boolean } | null = null;
    {
      const dados = await coletarContexto();
      const topProdutos = dados.topProdutos;
      debugInfo = dados.debugInfo;

      contexto = `Você é o assistente de IA da TigrãoImports, uma loja de eletrônicos Apple no Rio de Janeiro.
Você tem acesso aos dados reais do sistema e ajuda o dono (André) com análises de estoque, vendas e operações.
Responda em português brasileiro de forma clara e objetiva. Use emojis quando fizer sentido. Seja direto e prático.

=== DADOS DO SISTEMA (TEMPO REAL) ===

ESTOQUE:
- Total de unidades em estoque: ${dados.totalItensEstoque}
- Total de modelos diferentes: ${dados.totalModelosEstoque}
- Produtos nas Pendências (trade-in aguardando): ${dados.totalPendencias}
${dados.pendenciasAntigas.length ? `- Pendências com mais de 15 dias:\n  ${dados.pendenciasAntigas.join("\n  ")}` : "- Sem pendências antigas ✅"}

VENDAS (últimos 30 dias):
- Total de vendas: ${dados.totalVendas30d}
- Receita total: R$ ${dados.receitaTotal30d.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Top produtos mais vendidos:
  ${topProdutos.join("\n  ")}
- Vendas por vendedor:
  ${Object.entries(dados.vendasPorVendedor).sort(([,a],[,b]) => b-a).map(([k,v]) => `${k}: ${v} vendas`).join("\n  ")}

ALERTAS:
Custos divergentes (possível erro cadastro):
${dados.divergenciasCusto.length ? dados.divergenciasCusto.join("\n") : "Nenhum ✅"}

Produtos esgotados (qnt=0):
${dados.produtosZerados.length ? dados.produtosZerados.join(", ") : "Nenhum ✅"}

Produtos abaixo do estoque mínimo:
${dados.produtosAbaixoMinimo.length ? dados.produtosAbaixoMinimo.join("\n") : "Nenhum ✅"}

ESTOQUE ATUAL (modelos com quantidade):
${Object.entries(dados.estoqueAgrupado)
  .filter(([, v]) => v.qnt > 0)
  .sort(([, a], [, b]) => b.qnt - a.qnt)
  .slice(0, 60)
  .map(([k, v]) => `• ${k}: ${v.qnt} un | venda R$${v.preco?.toLocaleString("pt-BR") || "—"} | custo R$${v.custo?.toLocaleString("pt-BR") || "—"}`)
  .join("\n")}
`;
    }

    const messages: Anthropic.MessageParam[] = [
      ...historico.map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: mensagem },
    ];

    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 2500,
      system: contexto || `Você é o assistente de IA da TigrãoImports, loja Apple no Rio de Janeiro.
Ajude com dúvidas sobre estoque, vendas e operações. Responda em português brasileiro, de forma clara e objetiva.`,
      messages,
    });

    const resposta = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ resposta, debug: debugInfo });
  } catch (error) {
    console.error("Erro na IA:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Erro ao processar", detalhe: msg }, { status: 500 });
  }
}
