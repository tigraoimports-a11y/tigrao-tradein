// MCP tools — funcoes "read-only" expostas pro Claude/ChatGPT consumirem
// via /api/mcp. Cada tool tem um schema (JSON Schema) que descreve os args
// e um handler que faz a query no Supabase e devolve um texto formatado.
//
// Padrao do protocolo MCP: handler retorna `string` (vai pra
// `content: [{ type: "text", text }]` no tools/call response).
//
// Filosofia: cada tool retorna texto JA FORMATADO pra o LLM consumir
// diretamente — nao JSON cru. Mais token-efficient e ja vem em portugues.

import { SupabaseClient } from "@supabase/supabase-js";

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (args: any, supabase: SupabaseClient) => Promise<string>;
}

// --- Helpers ---

const brl = (n: number | string | null | undefined): string => {
  const num = typeof n === "string" ? parseFloat(n) : (n || 0);
  return `R$ ${(num || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const dataBR = (s: string | null | undefined): string => {
  if (!s) return "?";
  // Aceita "2026-04-25" ou "2026-04-25T..."
  const d = s.slice(0, 10);
  const parts = d.split("-");
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rangeDatas(args: any, defaultDias = 7): { desde: string; ate: string } {
  const hoje = new Date().toISOString().slice(0, 10);
  const desdeDefault = new Date(Date.now() - defaultDias * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  return {
    desde: args.desde || desdeDefault,
    ate: args.ate || hoje,
  };
}

// --- Tools ---

export const TOOLS: MCPTool[] = [
  {
    name: "consultar_vendas",
    description:
      "Lista vendas em um periodo com totais agregados. Use pra perguntas tipo 'quanto vendi esse mes?', 'vendas do cliente Joao', 'vendas pendentes', 'vendas que vieram de anuncio', 'qual serial/IMEI das vendas de hoje?'. Default: ultimos 7 dias. Inclui serial_no e imei dos produtos.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 7 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
        cliente: { type: "string", description: "Filtrar por nome do cliente (busca parcial)." },
        status_pagamento: { type: "string", description: "Ex: PAGO, PENDENTE, CANCELADO." },
        origem: {
          type: "string",
          description: "Filtrar por origem do cliente: ANUNCIO, RECOMPRA, INDICACAO, ATACADO, NAO_INFORMARAM.",
        },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 7);
      // Limit alto (5000) pra garantir totais corretos em queries de mes inteiro.
      // Em ~25 dias com volume tipico (100-200 vendas/mes), 5000 cobre ate ~2 anos.
      let query = supabase
        .from("vendas")
        .select("data, cliente, telefone, produto, preco_vendido, lucro, status_pagamento, forma, banco, origem, serial_no, imei")
        .gte("data", desde)
        .lte("data", ate)
        .order("data", { ascending: false })
        .limit(5000);
      if (args.cliente) query = query.ilike("cliente", `%${args.cliente}%`);
      if (args.status_pagamento) query = query.eq("status_pagamento", args.status_pagamento);
      if (args.origem) query = query.eq("origem", String(args.origem).toUpperCase());

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        return `Sem vendas no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;
      }

      // Agregados sobre TODAS as vendas (nao so as listadas)
      const total = data.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0);
      const totalLucro = data.reduce((s, v) => s + (Number(v.lucro) || 0), 0);

      // Quebra por status pra dar contexto (PAGO vs PENDENTE vs CANCELADO)
      const porStatus = new Map<string, { qtd: number; valor: number }>();
      for (const v of data) {
        const s = v.status_pagamento || "?";
        const cur = porStatus.get(s) || { qtd: 0, valor: 0 };
        cur.qtd += 1;
        cur.valor += Number(v.preco_vendido) || 0;
        porStatus.set(s, cur);
      }
      const statusLinhas = Array.from(porStatus.entries())
        .sort((a, b) => b[1].valor - a[1].valor)
        .map(([s, agg]) => `  ${s}: ${agg.qtd} (${brl(agg.valor)})`);

      // Lista detalhada (max 100 linhas pra nao explodir tokens)
      const MAX_LISTA = 100;
      const linhas = data.slice(0, MAX_LISTA).map((v) => {
        const partes = [
          dataBR(v.data),
          v.cliente || "?",
          v.produto || "?",
          brl(Number(v.preco_vendido) || 0),
          v.status_pagamento || "?",
        ];
        if (v.forma) partes.push(v.forma);
        // Inclui IMEI/serial se existir (importante pra rastreio de produto vendido)
        const id = v.imei || v.serial_no;
        if (id) partes.push(`SN/IMEI: ${id}`);
        return `• ${partes.join(" | ")}`;
      });

      const truncado = data.length > MAX_LISTA
        ? `\n(mostrando ${MAX_LISTA} de ${data.length} vendas — totais acima ja consideram TODAS)`
        : "";

      return [
        `${data.length} venda${data.length > 1 ? "s" : ""} de ${dataBR(desde)} a ${dataBR(ate)}`,
        `Faturamento ${brl(total)} | Lucro ${brl(totalLucro)}`,
        "",
        `Por status:`,
        ...statusLinhas,
        "",
        ...linhas,
        truncado,
      ].filter(Boolean).join("\n");
    },
  },

  {
    name: "consultar_estoque",
    description:
      "Busca produtos no estoque. Use pra 'quantos iPhone 14 tem em estoque?', 'cade o produto com IMEI X', 'estoque de MacBook'. Default: so disponivel, max 100.",
    inputSchema: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Texto pra buscar em modelo, IMEI ou serial. Ex: 'iPhone 14', '358...'.",
        },
        incluir_vendidos: {
          type: "boolean",
          description: "Se true, traz tambem itens ja vendidos. Default: false (so disponivel).",
        },
      },
    },
    handler: async (args, supabase) => {
      let query = supabase
        .from("estoque")
        .select("produto, categoria, imei, serial_no, cor, custo_unitario, fornecedor, status, data_compra")
        .order("data_compra", { ascending: false, nullsFirst: false })
        .limit(100);
      if (!args.incluir_vendidos) query = query.neq("status", "VENDIDO");
      if (args.busca) {
        const b = String(args.busca).trim();
        query = query.or(`produto.ilike.%${b}%,imei.ilike.%${b}%,serial_no.ilike.%${b}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        return args.busca
          ? `Nada encontrado no estoque pra "${args.busca}".`
          : "Estoque vazio (nada disponivel).";
      }

      const total = data.reduce((s, e) => s + (Number(e.custo_unitario) || 0), 0);
      const linhas = data.map((e) => {
        const id = e.imei || e.serial_no || "?";
        const idShort = id.length > 8 ? `...${id.slice(-6)}` : id;
        return `• ${e.produto || "?"} | ${e.cor || "?"} | ${idShort} | ${brl(Number(e.custo_unitario) || 0)} | ${e.status || "?"}`;
      });

      return [
        `${data.length} item${data.length > 1 ? "s" : ""} no estoque — custo total ${brl(total)}`,
        "",
        ...linhas,
      ].join("\n");
    },
  },

  {
    name: "consultar_cliente",
    description:
      "Busca cliente por nome, telefone ou CPF, e mostra suas compras. Use pra 'cliente Maria comprou o que?', 'historico do CPF X', 'cliente do telefone Y'.",
    inputSchema: {
      type: "object",
      properties: {
        busca: {
          type: "string",
          description: "Nome, telefone ou CPF (busca parcial em todos).",
        },
      },
      required: ["busca"],
    },
    handler: async (args, supabase) => {
      const b = String(args.busca || "").trim();
      if (!b) throw new Error("Parametro 'busca' obrigatorio");

      // Busca direto em vendas (vendas tem cliente, telefone, cpf — clientes e tabela menor)
      const cleanedDigits = b.replace(/\D/g, "");
      const filtros: string[] = [`cliente.ilike.%${b}%`, `telefone.ilike.%${cleanedDigits}%`];
      if (cleanedDigits.length >= 4) filtros.push(`cpf.ilike.%${cleanedDigits}%`);

      const { data, error } = await supabase
        .from("vendas")
        .select("data, cliente, telefone, cpf, produto, preco_vendido, status_pagamento")
        .or(filtros.join(","))
        .order("data", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Nenhum cliente/venda encontrada pra "${b}".`;

      const total = data.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0);
      const primeiraVenda = data[data.length - 1];
      const ultimaVenda = data[0];
      const nomesUnicos = Array.from(new Set(data.map((v) => v.cliente).filter(Boolean)));

      const linhas = data.slice(0, 20).map((v) =>
        `• ${dataBR(v.data)} | ${v.produto || "?"} | ${brl(Number(v.preco_vendido) || 0)} | ${v.status_pagamento || "?"}`
      );

      return [
        `Busca: "${b}"`,
        `Clientes encontrados: ${nomesUnicos.join(", ")}`,
        `Total: ${data.length} compras • ${brl(total)}`,
        `Primeira: ${dataBR(primeiraVenda.data)} • Ultima: ${dataBR(ultimaVenda.data)}`,
        "",
        ...linhas,
        data.length > 20 ? `\n(mostrando 20 de ${data.length})` : "",
      ].filter(Boolean).join("\n");
    },
  },

  {
    name: "consultar_saldos",
    description:
      "Saldos bancarios em uma data. Use pra 'quanto tenho no banco?', 'saldo do Itau hoje', 'saldos no fim de marco'. Default: hoje.",
    inputSchema: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description: "Data YYYY-MM-DD. Default: hoje (ou ultimo dia com saldo registrado).",
        },
      },
    },
    handler: async (args, supabase) => {
      const dataAlvo = args.data || new Date().toISOString().slice(0, 10);

      // Schema: 1 row por dia com colunas separadas pra cada banco
      // esp_X = saldo final ("espelho") do banco no fim do dia
      const { data: rows, error } = await supabase
        .from("saldos_bancarios")
        .select("data, esp_itau, esp_inf, esp_mp, esp_especie")
        .lte("data", dataAlvo)
        .order("data", { ascending: false })
        .limit(1);
      if (error) throw new Error(error.message);
      if (!rows || rows.length === 0) return `Sem saldos registrados ate ${dataBR(dataAlvo)}.`;

      const r = rows[0];
      const itau = Number(r.esp_itau) || 0;
      const inf = Number(r.esp_inf) || 0;
      const mp = Number(r.esp_mp) || 0;
      const especie = Number(r.esp_especie) || 0;
      const total = itau + inf + mp + especie;

      const aviso = r.data !== dataAlvo
        ? ` (ultima data com registro antes de ${dataBR(dataAlvo)})`
        : "";

      return [
        `Saldos em ${dataBR(r.data)}${aviso}`,
        "",
        `• Itau: ${brl(itau)}`,
        `• InfinitePay: ${brl(inf)}`,
        `• Mercado Pago: ${brl(mp)}`,
        `• Especie (caixa): ${brl(especie)}`,
        "",
        `TOTAL: ${brl(total)}`,
      ].join("\n");
    },
  },

  {
    name: "consultar_recebiveis",
    description:
      "Lista parcelas de fiado/pendentes. Use pra 'quem deve pra mim?', 'recebiveis vencidos', 'fiado do cliente X'. Default: so pendentes (nao recebidas).",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Filtrar por nome do cliente." },
        incluir_recebidas: {
          type: "boolean",
          description: "Se true, traz tambem parcelas ja recebidas. Default: false.",
        },
      },
    },
    handler: async (args, supabase) => {
      // fiado_parcelas e uma coluna JSONB em vendas: [{ valor, data, recebido }]
      // Limit alto pra agregar todo fiado em aberto (vendas com fiado costumam
      // ser raras, mas podem acumular ao longo de meses)
      let query = supabase
        .from("vendas")
        .select("id, cliente, telefone, fiado_parcelas")
        .not("fiado_parcelas", "is", null)
        .order("data", { ascending: false })
        .limit(2000);
      if (args.cliente) query = query.ilike("cliente", `%${args.cliente}%`);

      const { data: vendas, error } = await query;
      if (error) throw new Error(error.message);

      // Achata todas parcelas com info do cliente
      interface Parcela { valor: number; data: string; recebido: boolean }
      type ParcelaItem = { cliente: string; telefone: string | null; vencimento: string; valor: number; recebido: boolean };
      const parcelas: ParcelaItem[] = [];
      for (const v of vendas || []) {
        const lista = Array.isArray(v.fiado_parcelas) ? (v.fiado_parcelas as Parcela[]) : [];
        for (const p of lista) {
          if (!args.incluir_recebidas && p.recebido) continue;
          parcelas.push({
            cliente: v.cliente || "?",
            telefone: v.telefone || null,
            vencimento: p.data,
            valor: Number(p.valor) || 0,
            recebido: !!p.recebido,
          });
        }
      }

      if (parcelas.length === 0) {
        return args.incluir_recebidas ? "Sem parcelas registradas." : "Nenhuma parcela pendente.";
      }

      // Ordena por vencimento
      parcelas.sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || ""));

      const hoje = new Date().toISOString().slice(0, 10);
      const pendentes = parcelas.filter((p) => !p.recebido);
      const vencidas = pendentes.filter((p) => p.vencimento && p.vencimento < hoje);
      const total = parcelas.reduce((s, p) => s + p.valor, 0);
      const totalPendente = pendentes.reduce((s, p) => s + p.valor, 0);
      const totalVencido = vencidas.reduce((s, p) => s + p.valor, 0);

      const linhas = parcelas.slice(0, 40).map((p) => {
        const vencido = !p.recebido && p.vencimento && p.vencimento < hoje ? " ⚠️ VENCIDA" : "";
        return `• ${dataBR(p.vencimento)} | ${p.cliente} | ${brl(p.valor)} | ${p.recebido ? "✅ recebido" : "pendente"}${vencido}`;
      });

      return [
        `${parcelas.length} parcelas — total ${brl(total)}`,
        `Pendentes: ${pendentes.length} (${brl(totalPendente)})`,
        vencidas.length > 0 ? `⚠️ Vencidas: ${vencidas.length} (${brl(totalVencido)})` : "",
        "",
        ...linhas,
        parcelas.length > 40 ? `\n(mostrando 40 de ${parcelas.length})` : "",
      ].filter(Boolean).join("\n");
    },
  },

  {
    name: "consultar_top_skus",
    description:
      "Top produtos mais vendidos em um periodo (por quantidade e faturamento). Use pra 'quais os mais vendidos do mes?', 'iPhone que mais vendeu'.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 30 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
        limite: { type: "number", description: "Quantos retornar. Default: 10." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 30);
      const limite = Math.min(Number(args.limite) || 10, 50);

      const { data, error } = await supabase
        .from("vendas")
        .select("produto, preco_vendido, lucro")
        .gte("data", desde)
        .lte("data", ate)
        .not("produto", "is", null)
        .limit(5000);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Sem vendas no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;

      // Agrupa por produto
      const porProduto = new Map<string, { qtd: number; total: number; lucro: number }>();
      for (const v of data) {
        const p = String(v.produto).trim();
        const cur = porProduto.get(p) || { qtd: 0, total: 0, lucro: 0 };
        cur.qtd += 1;
        cur.total += Number(v.preco_vendido) || 0;
        cur.lucro += Number(v.lucro) || 0;
        porProduto.set(p, cur);
      }
      const ranking = Array.from(porProduto.entries())
        .sort((a, b) => b[1].qtd - a[1].qtd)
        .slice(0, limite);

      const linhas = ranking.map(
        ([produto, agg], i) => `${i + 1}. ${produto} — ${agg.qtd} unid • ${brl(agg.total)} (lucro ${brl(agg.lucro)})`
      );

      return [
        `Top ${ranking.length} mais vendidos de ${dataBR(desde)} a ${dataBR(ate)} (${data.length} vendas total)`,
        "",
        ...linhas,
      ].join("\n");
    },
  },

  {
    name: "consultar_funil_tradein",
    description:
      "Metricas do funil de trade-in (simulacoes feitas, conversao, drop-off por etapa). Use pra 'como ta o funil?', 'quantas simulacoes essa semana?', 'taxa de conversao do mes'.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 30 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 30);

      const { data, error } = await supabase
        .from("simulacoes")
        .select("status, modelo_novo, created_at")
        .gte("created_at", `${desde}T00:00:00`)
        .lte("created_at", `${ate}T23:59:59`)
        .limit(5000);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Sem simulacoes no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;

      const total = data.length;
      const gostei = data.filter((s) => s.status === "GOSTEI").length;
      const sair = data.filter((s) => s.status === "SAIR").length;
      const taxaConv = total > 0 ? ((gostei / total) * 100).toFixed(1) : "0";

      // Top modelos novos requisitados
      const porModelo = new Map<string, number>();
      for (const s of data) {
        if (!s.modelo_novo) continue;
        porModelo.set(s.modelo_novo, (porModelo.get(s.modelo_novo) || 0) + 1);
      }
      const topModelos = Array.from(porModelo.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([m, q]) => `  • ${m}: ${q}`);

      return [
        `Funil trade-in — ${dataBR(desde)} a ${dataBR(ate)}`,
        "",
        `Total simulacoes: ${total}`,
        `✅ Gostou da troca: ${gostei} (${taxaConv}%)`,
        `❌ Saiu sem trocar: ${sair}`,
        "",
        `Top modelos requisitados:`,
        ...topModelos,
      ].join("\n");
    },
  },

  {
    name: "consultar_por_origem",
    description:
      "Agrupa vendas por origem do cliente em um periodo. Use pra 'quantos clientes vieram de anuncio?', 'quanto faturei com indicacao?', 'breakdown de vendas por canal', 'recompra ou anuncio gera mais lucro?'. Origens possiveis: ANUNCIO, RECOMPRA, INDICACAO, ATACADO, NAO_INFORMARAM.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 30 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 30);

      const { data, error } = await supabase
        .from("vendas")
        .select("cliente, origem, preco_vendido, lucro, status_pagamento")
        .gte("data", desde)
        .lte("data", ate)
        .neq("status_pagamento", "CANCELADO")
        .limit(5000);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Sem vendas no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;

      // Agrupa por origem (clientes unicos + qtd vendas + faturamento + lucro)
      const porOrigem = new Map<string, { vendas: number; clientes: Set<string>; faturamento: number; lucro: number }>();
      for (const v of data) {
        const o = (v.origem || "NAO_INFORMARAM").toUpperCase();
        const cur = porOrigem.get(o) || { vendas: 0, clientes: new Set<string>(), faturamento: 0, lucro: 0 };
        cur.vendas += 1;
        if (v.cliente) cur.clientes.add(String(v.cliente).toLowerCase().trim());
        cur.faturamento += Number(v.preco_vendido) || 0;
        cur.lucro += Number(v.lucro) || 0;
        porOrigem.set(o, cur);
      }

      const ranking = Array.from(porOrigem.entries()).sort((a, b) => b[1].faturamento - a[1].faturamento);
      const totalVendas = data.length;
      const totalFat = data.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0);
      const totalLucro = data.reduce((s, v) => s + (Number(v.lucro) || 0), 0);

      const linhas = ranking.map(([origem, agg]) => {
        const pctFat = totalFat > 0 ? ((agg.faturamento / totalFat) * 100).toFixed(1) : "0";
        return `• ${origem}: ${agg.clientes.size} cliente(s), ${agg.vendas} venda(s) | Faturamento ${brl(agg.faturamento)} (${pctFat}%) | Lucro ${brl(agg.lucro)}`;
      });

      return [
        `Vendas por origem — ${dataBR(desde)} a ${dataBR(ate)}`,
        `Total: ${totalVendas} vendas | Faturamento ${brl(totalFat)} | Lucro ${brl(totalLucro)}`,
        "",
        ...linhas,
      ].join("\n");
    },
  },

  {
    name: "consultar_gastos",
    description:
      "Gastos por periodo, agrupados por categoria. Use pra 'quanto gastei esse mes?', 'gastos com fornecedor X', 'breakdown de despesas'.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 30 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
        categoria: { type: "string", description: "Filtrar por categoria especifica." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 30);
      // Limit alto (5000) pra agregar mes/trimestre inteiro corretamente.
      // Volume tipico de gastos: ~50-100/mes.
      let query = supabase
        .from("gastos")
        .select("data, categoria, descricao, valor, banco, contato_nome")
        .gte("data", desde)
        .lte("data", ate)
        .order("data", { ascending: false })
        .limit(5000);
      if (args.categoria) query = query.ilike("categoria", `%${args.categoria}%`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Sem gastos no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;

      const total = data.reduce((s, g) => s + (Number(g.valor) || 0), 0);

      // Agrupa por categoria
      const porCat = new Map<string, { qtd: number; total: number }>();
      for (const g of data) {
        const c = g.categoria || "(sem categoria)";
        const cur = porCat.get(c) || { qtd: 0, total: 0 };
        cur.qtd += 1;
        cur.total += Number(g.valor) || 0;
        porCat.set(c, cur);
      }
      const ranking = Array.from(porCat.entries()).sort((a, b) => b[1].total - a[1].total);
      const linhas = ranking.map(
        ([cat, agg]) => `• ${cat}: ${agg.qtd}x — ${brl(agg.total)}`
      );

      return [
        `Gastos de ${dataBR(desde)} a ${dataBR(ate)} — total ${brl(total)}`,
        "",
        `Por categoria:`,
        ...linhas,
      ].join("\n");
    },
  },
];
