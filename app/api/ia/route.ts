import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function coletarContexto() {
  // Busca dados do negócio para contexto
  const [estoqueRes, vendasRes, pendenciasRes] = await Promise.all([
    supabase
      .from("estoque")
      .select("produto, categoria, cor, storage, qnt, preco_sugerido, custo_unitario, serial, imei, fornecedor, estoque_minimo, tipo, status")
      .not("tipo", "eq", "PENDENCIA")
      .not("tipo", "eq", "A_CAMINHO")
      .order("produto"),
    supabase
      .from("vendas")
      .select("produto, cor, forma, banco, data, preco_vendido, vendedor, origem, status_pagamento")
      .gte("data", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .neq("status_pagamento", "CANCELADO")
      .order("data", { ascending: false })
      .limit(300),
    supabase
      .from("estoque")
      .select("produto, categoria, cor, storage, qnt, preco_sugerido, custo_unitario, serial, imei, cliente, tipo, created_at")
      .eq("tipo", "PENDENCIA"),
  ]);

  const estoqueData = estoqueRes.data || [];
  const vendasData = vendasRes.data || [];
  const pendenciasData = pendenciasRes.data || [];

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
    const key = `${v.produto}${v.storage ? " " + v.storage : ""}`.trim();
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
    topProdutos10,
    vendasPorVendedor,
    divergenciasCusto: divergencias,
    produtosZerados: zerados,
    produtosAbaixoMinimo: abaixoMin,
  };

  function topProdutos10() { return topProdutos; }
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { mensagem, historico = [], modo } = body;

    let contexto = "";

    if (modo === "analise" || !historico.length) {
      // Primeira mensagem ou análise automática: busca dados completos
      const dados = await coletarContexto();
      const topProdutos = dados.topProdutos10();

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
      model: "claude-opus-4-5",
      max_tokens: 1500,
      system: contexto || `Você é o assistente de IA da TigrãoImports, loja Apple no Rio de Janeiro.
Ajude com dúvidas sobre estoque, vendas e operações. Responda em português brasileiro, de forma clara e objetiva.`,
      messages,
    });

    const resposta = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ resposta });
  } catch (error) {
    console.error("Erro na IA:", error);
    return NextResponse.json({ error: "Erro ao processar" }, { status: 500 });
  }
}
