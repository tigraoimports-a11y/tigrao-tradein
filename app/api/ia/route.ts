import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// Tabelas que a IA tem permissão de consultar (read-only).
const ALLOWED_TABLES: Record<string, string> = {
  estoque: "Estoque atual: cada linha é uma unidade física. Tipo pode ser NULL (estoque normal), 'PENDENCIA' (trade-in aguardando), 'A_CAMINHO' (em trânsito), 'SEMINOVO', 'ATACADO'. Colunas comuns: produto, categoria, cor, storage, qnt, preco_sugerido, custo_unitario, serial, imei, fornecedor, estoque_minimo, status, cliente, data_compra, created_at.",
  vendas: "Histórico de vendas. Colunas: data (date), produto, cor, storage, preco_vendido, custo, vendedor, cliente, cpf, forma (PIX/CARTAO/FIADO/ESPECIE/...), banco, parcelas, status_pagamento (NULL/CANCELADO/PAGO), origem, troca_produto, troca_valor.",
  gastos: "Despesas da loja. Colunas: data, descricao, valor, categoria, banco, tipo.",
  saldos_bancarios: "Saldo atual de cada conta bancária.",
  trocas: "Trade-ins/trocas finalizadas (separadas das pendências do estoque).",
  tradein_leads: "Leads gerados pela calculadora de trade-in (interessados que preencheram o formulário).",
  simulacoes: "Simulações de trade-in feitas no site público.",
  entregas: "Status de entregas/envios.",
  encomendas: "Encomendas de clientes (produtos sob demanda).",
  fornecedores: "Cadastro de fornecedores.",
  catalogo_modelos: "Catálogo de modelos cadastrados (Apple lineup).",
  catalogo_categorias: "Categorias do catálogo.",
  precos: "Tabela de preços de venda configurados.",
  reajustes: "Histórico de reajustes de preço.",
  patrimonio_mensal: "Snapshot mensal de patrimônio.",
  taxas_config: "Configuração de taxas de máquinas/cartão.",
  taxas_repasse: "Taxas de repasse das maquininhas.",
  tradein_config: "Configurações do módulo de trade-in.",
  tradein_perguntas: "Perguntas do questionário de avaliação do usado.",
  avaliacao_usados: "Tabela de avaliação/preço dos usados aceitos no trade-in.",
  movimentacoes_estoque: "Log de movimentações do estoque.",
  estoque_log: "Log adicional de eventos do estoque.",
  notificacoes_estoque: "Notificações relacionadas a estoque.",
  comprovantes: "Comprovantes anexados a vendas/pagamentos.",
  activity_log: "Log de atividades dos usuários no painel.",
  loja_produtos: "Produtos publicados na loja online.",
  loja_categorias: "Categorias da loja online.",
  loja_variacoes: "Variações dos produtos da loja.",
  produto_views: "Views/visualizações dos produtos na loja.",
  cotacao_listas: "Listas de cotação criadas.",
  cotacao_itens: "Itens das listas de cotação.",
  cotacao_precos: "Preços nas cotações.",
  descontos_condicao: "Descontos por condição.",
  produtos_individuais: "Produtos individuais cadastrados.",
};

// Tabelas em que a IA pode FAZER ESCRITAS (UPDATE/INSERT). Subset estrito.
// DELETE não é permitido em nenhuma tabela.
const WRITABLE_TABLES = new Set<string>([
  "estoque",
  "catalogo_modelos",
  "catalogo_categorias",
  "catalogo_categoria_specs",
  "catalogo_modelo_configs",
  "catalogo_spec_tipos",
  "catalogo_spec_valores",
  "fornecedores",
  "loja_produtos",
  "loja_categorias",
  "loja_variacoes",
  "precos",
  "modelos_excluidos",
]);

const SYSTEM_PROMPT = `Você é o assistente de IA da TigrãoImports, uma loja de eletrônicos Apple no Rio de Janeiro. Você ajuda o dono (André) e a equipe (Bianca, Laynne, Nicolas, Paloma) a entender o que está acontecendo na operação.

Você tem acesso ao banco de dados real do sistema através de ferramentas. SEMPRE use as ferramentas para responder — nunca invente números ou dados.

ESTRATÉGIA DE USO DAS FERRAMENTAS DE LEITURA:
1. Comece chamando 'list_tables' se ainda não souber quais tabelas existem.
2. Use 'describe_table' quando precisar saber as colunas de uma tabela específica antes de filtrar/ordenar.
3. Use 'query_table' pra rodar a consulta. Limite sempre — pra perguntas amplas comece com limit baixo (50-100) e refine.
4. Você pode chamar várias ferramentas em sequência. Combine dados de tabelas diferentes quando necessário.
5. Hoje é ${new Date().toISOString().slice(0, 10)}. Quando o usuário disser "últimos 30 dias", calcule a data inicial.

FERRAMENTAS DE ESCRITA (update_rows, insert_row):
Você PODE alterar dados no banco, mas SOMENTE em tabelas de produto/estoque (estoque, catalogo_*, fornecedores, loja_*, precos). DELETE não é permitido — nunca tente apagar.

PROTOCOLO OBRIGATÓRIO de escrita (NÃO PULE NENHUM PASSO):
1. Quando o usuário pedir uma alteração, PRIMEIRO use query_table pra MOSTRAR exatamente quais linhas serão afetadas e seus valores atuais.
2. Em seguida, em uma mensagem de TEXTO (sem chamar tool), descreva claramente: a tabela, os filtros, os campos que vão mudar, o valor antigo e o novo, e quantas linhas serão afetadas. Termine perguntando "Posso aplicar essa alteração?".
3. AGUARDE a próxima mensagem do usuário. Só execute update_rows / insert_row se a resposta dele for uma confirmação clara ("sim", "pode", "manda", "confirma", "ok").
4. Ao chamar a ferramenta de escrita, sempre passe confirmed=true. A ferramenta recusa se confirmed for false.
5. Se o usuário disser não ou der instrução diferente, NÃO execute. Reformule e peça nova confirmação.
6. Nunca faça uma escrita sem ter mostrado o preview e recebido confirmação explícita na mesma conversa.

REGRAS DE NEGÓCIO IMPORTANTES:
- A ORIGEM do aparelho NÃO importa pra contagem de estoque. Aparelhos com sufixos como "LL" (EUA), "J" / "JPA" (Japão), "HN" / "IN" (Índia), "BR", "ZP" (Hong Kong), etc são FISICAMENTE IDÊNTICOS — só muda a região fiscal. Sempre que listar/agrupar produtos, REMOVA esses sufixos do nome e SOME as quantidades.
  Exemplo: "iPhone 17 256GB Mist Blue J" + "iPhone 17 256GB Mist Blue LL" = "iPhone 17 256GB Mist Blue" com a soma das duas.
- "(JPA)", "(EUA)", "(IN)", "(JAPÃO)" e variantes idem — descarta.
- Cor sempre conta: Black ≠ Mist Blue. Storage sempre conta: 256GB ≠ 512GB.
- Quando o usuário pede "quantos X temos", traga o agrupado já somado, não a lista bruta.

FORMATAÇÃO DA RESPOSTA:
- Português brasileiro, conversacional, direto.
- NÃO use tabelas markdown (nada de | --- |). Use listas com hífen.
- NÃO use cabeçalhos ## ou ###. Parágrafos curtos.
- Negrito (**) só pra destacar 1-2 números/itens realmente importantes na resposta toda. Não negrite cada item de lista.
- Não liste itens com quantidade 0 a menos que o usuário tenha pedido especificamente "esgotados". Foque no que existe.
- No máximo 1 emoji por resposta, e só se fizer sentido.
- Vá direto ao ponto. Sem preâmbulo ("Aqui vai", "Contando todos") nem "posso ajudar com mais alguma coisa".
- Cite os números reais que vieram do banco.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_tables",
    description: "Lista todas as tabelas do sistema que você pode consultar, com uma breve descrição de cada uma. Chame isso primeiro se não souber qual tabela usar.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "describe_table",
    description: "Retorna as colunas (e seus tipos inferidos) de uma tabela. Útil antes de filtrar ou ordenar para confirmar nomes exatos.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string", description: "Nome exato da tabela" },
      },
      required: ["table"],
    },
  },
  {
    name: "update_rows",
    description: "Atualiza uma ou mais linhas em uma tabela de produto/estoque. Requer confirmação prévia do usuário no chat. DELETE não é suportado.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string", description: "Tabela alvo (deve ser uma writable: estoque, catalogo_*, fornecedores, loja_*, precos)" },
        filters: {
          type: "array",
          description: "Filtros que selecionam as linhas a atualizar. OBRIGATÓRIO ter pelo menos 1 filtro pra evitar UPDATE em massa acidental.",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"] },
              value: {},
            },
            required: ["column", "op", "value"],
          },
        },
        updates: {
          type: "object",
          description: "Objeto {coluna: novoValor} com os campos que serão atualizados.",
        },
        confirmed: { type: "boolean", description: "Deve ser true. A ferramenta recusa se for false. Só passe true depois de ter recebido confirmação explícita do usuário no chat." },
      },
      required: ["table", "filters", "updates", "confirmed"],
    },
  },
  {
    name: "insert_row",
    description: "Insere uma nova linha numa tabela de produto/estoque. Requer confirmação prévia do usuário no chat.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string", description: "Tabela alvo (writable)" },
        values: { type: "object", description: "Objeto {coluna: valor} com os campos da nova linha." },
        confirmed: { type: "boolean", description: "Deve ser true. A ferramenta recusa se for false." },
      },
      required: ["table", "values", "confirmed"],
    },
  },
  {
    name: "query_table",
    description: "Executa um SELECT em uma tabela. Suporta filtros, ordenação, contagem e limite. Use isso para responder perguntas com dados reais.",
    input_schema: {
      type: "object" as const,
      properties: {
        table: { type: "string", description: "Nome da tabela (uma das listadas em list_tables)" },
        columns: {
          type: "string",
          description: "Colunas separadas por vírgula. Use '*' pra todas. Default: '*'",
        },
        filters: {
          type: "array",
          description: "Lista de filtros AND. Cada filtro: {column, op, value}. Operadores: eq, neq, gt, gte, lt, lte, like, ilike, in, is. Para 'in', value deve ser um array. Para 'is', value pode ser null/true/false.",
          items: {
            type: "object",
            properties: {
              column: { type: "string" },
              op: { type: "string", enum: ["eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "in", "is"] },
              value: {},
            },
            required: ["column", "op", "value"],
          },
        },
        order_by: { type: "string", description: "Coluna para ordenar (opcional)" },
        ascending: { type: "boolean", description: "true=asc, false=desc. Default false." },
        limit: { type: "number", description: "Máximo de linhas (1-1000). Default 100." },
        count_only: { type: "boolean", description: "Se true, retorna só a contagem total (sem trazer linhas). Default false." },
      },
      required: ["table"],
    },
  },
];

interface Filter {
  column: string;
  op: string;
  value: unknown;
}

interface QueryArgs {
  table: string;
  columns?: string;
  filters?: Filter[];
  order_by?: string;
  ascending?: boolean;
  limit?: number;
  count_only?: boolean;
}

async function runTool(name: string, input: Record<string, unknown>, supabase: SupabaseClient): Promise<unknown> {
  if (name === "list_tables") {
    return Object.entries(ALLOWED_TABLES).map(([table, descricao]) => ({ table, descricao }));
  }

  if (name === "describe_table") {
    const table = String(input.table || "");
    if (!ALLOWED_TABLES[table]) return { error: `Tabela '${table}' não permitida ou não existe. Use list_tables.` };
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { columns: [], aviso: "tabela vazia" };
    const sample = data[0];
    const columns = Object.entries(sample).map(([col, val]) => ({
      column: col,
      tipo_inferido: val === null ? "null" : typeof val,
      exemplo: val,
    }));
    return { columns };
  }

  if (name === "update_rows") {
    const args = input as { table: string; filters?: Filter[]; updates?: Record<string, unknown>; confirmed?: boolean };
    if (!WRITABLE_TABLES.has(args.table)) {
      return { error: `Tabela '${args.table}' não é editável. Writable: ${Array.from(WRITABLE_TABLES).join(", ")}` };
    }
    if (!args.confirmed) {
      return { error: "Operação recusada: confirmed=false. Você precisa pedir confirmação explícita ao usuário no chat antes de chamar com confirmed=true." };
    }
    if (!args.filters || args.filters.length === 0) {
      return { error: "Operação recusada: nenhum filtro fornecido. UPDATE em massa não é permitido — informe pelo menos 1 filtro." };
    }
    if (!args.updates || Object.keys(args.updates).length === 0) {
      return { error: "Nenhum campo informado em 'updates'." };
    }
    let q = supabase.from(args.table).update(args.updates).select();
    for (const f of args.filters) q = applyFilter(q, f);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return { ok: true, atualizadas: data?.length ?? 0, linhas: data };
  }

  if (name === "insert_row") {
    const args = input as { table: string; values?: Record<string, unknown>; confirmed?: boolean };
    if (!WRITABLE_TABLES.has(args.table)) {
      return { error: `Tabela '${args.table}' não é editável.` };
    }
    if (!args.confirmed) {
      return { error: "Operação recusada: confirmed=false. Peça confirmação ao usuário primeiro." };
    }
    if (!args.values || Object.keys(args.values).length === 0) {
      return { error: "Nenhum campo informado em 'values'." };
    }
    const { data, error } = await supabase.from(args.table).insert(args.values).select();
    if (error) return { error: error.message };
    return { ok: true, inserida: data?.[0] };
  }

  if (name === "query_table") {
    const args = input as unknown as QueryArgs;
    if (!ALLOWED_TABLES[args.table]) return { error: `Tabela '${args.table}' não permitida. Use list_tables.` };

    if (args.count_only) {
      let q = supabase.from(args.table).select("*", { count: "exact", head: true });
      for (const f of args.filters || []) {
        q = applyFilter(q, f);
      }
      const { count, error } = await q;
      if (error) return { error: error.message };
      return { count };
    }

    const cols = args.columns || "*";
    let q = supabase.from(args.table).select(cols);
    for (const f of args.filters || []) {
      q = applyFilter(q, f);
    }
    if (args.order_by) {
      q = q.order(args.order_by, { ascending: args.ascending ?? false, nullsFirst: false });
    }
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 1000);
    q = q.limit(limit);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return { rows: data, total_returned: data?.length ?? 0, limit };
  }

  return { error: `Tool desconhecida: ${name}` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilter(q: any, f: Filter): any {
  const { column, op, value } = f;
  switch (op) {
    case "eq": return q.eq(column, value);
    case "neq": return q.neq(column, value);
    case "gt": return q.gt(column, value);
    case "gte": return q.gte(column, value);
    case "lt": return q.lt(column, value);
    case "lte": return q.lte(column, value);
    case "like": return q.like(column, String(value));
    case "ilike": return q.ilike(column, String(value));
    case "in": return q.in(column, Array.isArray(value) ? value : [value]);
    case "is": return q.is(column, value as null | boolean);
    default: return q;
  }
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { mensagem, historico = [] } = body;

    const supabase = getSupabase();

    const messages: Anthropic.MessageParam[] = [
      ...historico.map((h: { role: string; content: string }) => ({
        role: h.role as "user" | "assistant",
        content: h.content,
      })),
      { role: "user", content: mensagem },
    ];

    // Loop agêntico: Claude pode chamar tools várias vezes antes de responder.
    const MAX_ITER = 25;
    let iter = 0;
    let response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    while (response.stop_reason === "tool_use" && iter < MAX_ITER) {
      iter++;
      console.log(`[IA] iter=${iter} stop=${response.stop_reason} input_tokens=${response.usage?.input_tokens} output_tokens=${response.usage?.output_tokens}`);
      const toolUses = response.content.filter(b => b.type === "tool_use");
      console.log(`[IA] tools chamadas: ${toolUses.map(t => t.type === "tool_use" ? t.name : "").join(", ")}`);
      const toolResults = await Promise.all(
        toolUses.map(async tu => {
          if (tu.type !== "tool_use") return null;
          try {
            const result = await runTool(tu.name, tu.input as Record<string, unknown>, supabase);
            return {
              type: "tool_result" as const,
              tool_use_id: tu.id,
              content: JSON.stringify(result).slice(0, 100000),
            };
          } catch (e) {
            return {
              type: "tool_result" as const,
              tool_use_id: tu.id,
              content: `Erro: ${e instanceof Error ? e.message : String(e)}`,
              is_error: true,
            };
          }
        })
      );

      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: toolResults.filter((t): t is NonNullable<typeof t> => t !== null),
      });

      response = await client.messages.create({
        model: "claude-opus-4-6",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });
    }

    const resposta = response.content
      .filter(b => b.type === "text")
      .map(b => (b.type === "text" ? b.text : ""))
      .join("\n");

    return NextResponse.json({ resposta });
  } catch (error) {
    console.error("Erro na IA:", error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "Erro ao processar", detalhe: msg }, { status: 500 });
  }
}
