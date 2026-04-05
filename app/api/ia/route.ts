import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function coletarContexto() {
  // Busca dados do negócio para contexto
  const [estoque, vendas, pendencias, config] = await Promise.all([
    supabase
      .from("estoque")
      .select("produto, categoria, cor, storage, qnt, preco, custo, serial, imei, fornecedor, estoque_minimo, tab")
      .order("produto"),
    supabase
      .from("vendas")
      .select("produto, cor, storage, valor, forma, banco, data_venda, vendedor, origem, tipo")
      .gte("data_venda", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("data_venda", { ascending: false })
      .limit(200),
    supabase
      .from("estoque")
      .select("produto, categoria, cor, storage, qnt, preco, custo, serial, imei, cliente, tab")
      .eq("tab", "pendencias"),
    supabase
      .from("tradein_config")
      .select("chave, valor")
      .limit(20),
  ]);

  const estoqueData = estoque.data || [];
  const vendasData = vendas.data || [];
  const pendenciasData = pendencias.data || [];

  // Agrupar estoque por modelo
  const estoqueAgrupado: Record<string, { qnt: number; preco?: number; custo?: number; min?: number }> = {};
  for (const item of estoqueData) {
    if (item.tab === "pendencias") continue;
    const key = `${item.produto} ${item.storage || ""} ${item.cor || ""}`.trim();
    if (!estoqueAgrupado[key]) estoqueAgrupado[key] = { qnt: 0 };
    estoqueAgrupado[key].qnt += item.qnt || 0;
    if (item.preco) estoqueAgrupado[key].preco = item.preco;
    if (item.custo) estoqueAgrupado[key].custo = item.custo;
    if (item.estoque_minimo) estoqueAgrupado[key].min = item.estoque_minimo;
  }

  // Estatísticas de vendas
  const totalVendas = vendasData.length;
  const receitaTotal = vendasData.reduce((s, v) => s + (v.valor || 0), 0);

  // Detectar possíveis duplicatas (mesmo produto, custo diferente)
  const duplicatas: string[] = [];
  const porProduto: Record<string, number[]> = {};
  for (const item of estoqueData) {
    if (!item.custo || item.tab === "pendencias") continue;
    const key = `${item.produto} ${item.storage || ""} ${item.cor || ""}`.trim();
    if (!porProduto[key]) porProduto[key] = [];
    if (!porProduto[key].includes(item.custo)) porProduto[key].push(item.custo);
  }
  for (const [k, custos] of Object.entries(porProduto)) {
    if (custos.length > 1) duplicatas.push(`${k}: custos divergentes ${custos.map(c => `R$${c}`).join(" vs ")}`);
  }

  // Produtos zerados (sem estoque mínimo configurado)
  const zerados = Object.entries(estoqueAgrupado)
    .filter(([, v]) => v.qnt === 0)
    .map(([k]) => k)
    .slice(0, 20);

  // Produtos abaixo do mínimo
  const abaixoMin = Object.entries(estoqueAgrupado)
    .filter(([, v]) => v.min && v.min > 0 && v.qnt < v.min)
    .map(([k, v]) => `${k}: tem ${v.qnt}, mínimo ${v.min}`)
    .slice(0, 20);

  return {
    estoqueResumo: estoqueAgrupado,
    totalItens: estoqueData.filter(i => i.tab !== "pendencias").length,
    totalPendencias: pendenciasData.length,
    totalVendas30d: totalVendas,
    receitaTotal30d: receitaTotal,
    duplicatasCusto: duplicatas.slice(0, 10),
    produtosZerados: zerados,
    produtosAbaixoMinimo: abaixoMin,
  };
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
      contexto = `
Você é o assistente de IA da TigrãoImports, uma loja de eletrônicos Apple no Rio de Janeiro.
Você tem acesso aos dados do sistema e ajuda o dono (André) e a equipe com análises de estoque, vendas e operações.

DADOS ATUAIS DO SISTEMA:
- Total de itens em estoque: ${dados.totalItens}
- Produtos nas Pendências (trade-in): ${dados.totalPendencias}
- Vendas nos últimos 30 dias: ${dados.totalVendas30d} vendas | Receita: R$ ${dados.receitaTotal30d.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}

PRODUTOS COM CUSTO DIVERGENTE (possíveis duplicatas ou erro de cadastro):
${dados.duplicatasCusto.length ? dados.duplicatasCusto.join("\n") : "Nenhum detectado ✅"}

PRODUTOS ZERADOS (sem estoque):
${dados.produtosZerados.length ? dados.produtosZerados.join(", ") : "Nenhum ✅"}

PRODUTOS ABAIXO DO MÍNIMO:
${dados.produtosAbaixoMinimo.length ? dados.produtosAbaixoMinimo.join("\n") : "Nenhum ✅"}

ESTOQUE ATUAL (agrupado por modelo):
${Object.entries(dados.estoqueResumo)
  .filter(([, v]) => v.qnt > 0)
  .slice(0, 50)
  .map(([k, v]) => `• ${k}: ${v.qnt} un | R$${v.preco?.toLocaleString("pt-BR") || "—"} | custo R$${v.custo?.toLocaleString("pt-BR") || "—"}`)
  .join("\n")}

Responda em português brasileiro de forma clara e direta. Use emojis quando apropriado.
Seja objetivo e prático — André precisa de respostas rápidas e acionáveis.
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
