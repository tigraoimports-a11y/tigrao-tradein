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

  // === DASHBOARD FINANCEIRO ===

  {
    name: "resumo_financeiro",
    description:
      "Resumo financeiro completo num so request: lucro/faturamento/qtd vendas de HOJE, SEMANA, MES atual + projecao do fim do mes + comparacao com mes anterior. Use pra perguntas tipo 'como ta o negocio?', 'qual o lucro do dia/semana/mes?', 'quanto vou faturar esse mes?', 'estamos melhor que mes passado?'. Default: data de referencia = hoje.",
    inputSchema: {
      type: "object",
      properties: {
        data_referencia: {
          type: "string",
          description: "Data base pra calcular hoje/semana/mes. YYYY-MM-DD. Default: hoje.",
        },
      },
    },
    handler: async (args, supabase) => {
      const ref = args.data_referencia
        ? new Date(args.data_referencia + "T12:00:00")
        : new Date();
      const refIso = ref.toISOString().slice(0, 10);

      // Hoje
      const hojeStart = refIso;

      // Inicio da semana (segunda-feira)
      const dow = ref.getDay(); // 0=dom, 1=seg
      const diasParaSegunda = dow === 0 ? 6 : dow - 1;
      const semanaStart = new Date(ref);
      semanaStart.setDate(ref.getDate() - diasParaSegunda);
      const semanaIso = semanaStart.toISOString().slice(0, 10);

      // Inicio do mes
      const mesStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
      const mesIso = mesStart.toISOString().slice(0, 10);

      // Fim do mes (pra projecao)
      const mesEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      const diasNoMes = mesEnd.getDate();
      const diasPassados = ref.getDate();

      // Mes anterior (mesmo periodo: dia 1 ate dia atual)
      const mesAntStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
      const mesAntCorte = new Date(ref.getFullYear(), ref.getMonth() - 1, ref.getDate());
      const mesAntCheio = new Date(ref.getFullYear(), ref.getMonth(), 0);
      const mesAntStartIso = mesAntStart.toISOString().slice(0, 10);
      const mesAntCorteIso = mesAntCorte.toISOString().slice(0, 10);
      const mesAntCheioIso = mesAntCheio.toISOString().slice(0, 10);

      // 1 query pega tudo do mes atual + mes anterior inteiro
      const { data, error } = await supabase
        .from("vendas")
        .select("data, preco_vendido, lucro, status_pagamento")
        .gte("data", mesAntStartIso)
        .lte("data", refIso)
        .neq("status_pagamento", "CANCELADO")
        .limit(10000);
      if (error) throw new Error(error.message);
      const rows = data || [];

      // Helper pra agregar um sub-periodo
      const agregar = (desde: string, ate: string) => {
        const filt = rows.filter((v) => v.data >= desde && v.data <= ate);
        const fat = filt.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0);
        const lucro = filt.reduce((s, v) => s + (Number(v.lucro) || 0), 0);
        return { qtd: filt.length, fat, lucro };
      };

      const hoje = agregar(hojeStart, refIso);
      const semana = agregar(semanaIso, refIso);
      const mes = agregar(mesIso, refIso);
      const mesAntMesmoPeriodo = agregar(mesAntStartIso, mesAntCorteIso);
      const mesAntCompleto = agregar(mesAntStartIso, mesAntCheioIso);

      // Projecao linear: ritmo do mes atual extrapolado pros dias restantes
      const projFat = diasPassados > 0 ? (mes.fat / diasPassados) * diasNoMes : 0;
      const projLucro = diasPassados > 0 ? (mes.lucro / diasPassados) * diasNoMes : 0;
      const projQtd = diasPassados > 0 ? Math.round((mes.qtd / diasPassados) * diasNoMes) : 0;

      // Variacao vs mes anterior (mesmo periodo)
      const variar = (atual: number, anterior: number): string => {
        if (anterior === 0) return atual > 0 ? "+∞%" : "0%";
        const pct = ((atual - anterior) / anterior) * 100;
        const sinal = pct >= 0 ? "+" : "";
        return `${sinal}${pct.toFixed(1)}%`;
      };

      const nomeMesAt = ref.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      const nomeMesAnt = mesAntStart.toLocaleDateString("pt-BR", { month: "long" });

      return [
        `📊 RESUMO FINANCEIRO — referencia ${dataBR(refIso)}`,
        ``,
        `📅 HOJE (${dataBR(refIso)})`,
        `  Vendas: ${hoje.qtd} | Faturamento: ${brl(hoje.fat)} | Lucro: ${brl(hoje.lucro)}`,
        ``,
        `📆 SEMANA (${dataBR(semanaIso)} a ${dataBR(refIso)})`,
        `  Vendas: ${semana.qtd} | Faturamento: ${brl(semana.fat)} | Lucro: ${brl(semana.lucro)}`,
        ``,
        `🗓️  MES ATUAL — ${nomeMesAt} (dia ${diasPassados} de ${diasNoMes})`,
        `  Vendas: ${mes.qtd} | Faturamento: ${brl(mes.fat)} | Lucro: ${brl(mes.lucro)}`,
        ``,
        `🔮 PROJECAO FIM DO MES (ritmo atual extrapolado)`,
        `  Vendas: ~${projQtd} | Faturamento: ~${brl(projFat)} | Lucro: ~${brl(projLucro)}`,
        ``,
        `⚖️  VS ${nomeMesAnt.toUpperCase()} (mesmo periodo, dia 1 a ${diasPassados})`,
        `  Vendas: ${mesAntMesmoPeriodo.qtd} (${variar(mes.qtd, mesAntMesmoPeriodo.qtd)})`,
        `  Faturamento: ${brl(mesAntMesmoPeriodo.fat)} (${variar(mes.fat, mesAntMesmoPeriodo.fat)})`,
        `  Lucro: ${brl(mesAntMesmoPeriodo.lucro)} (${variar(mes.lucro, mesAntMesmoPeriodo.lucro)})`,
        ``,
        `📈 ${nomeMesAnt.toUpperCase()} COMPLETO (referencia)`,
        `  Vendas: ${mesAntCompleto.qtd} | Faturamento: ${brl(mesAntCompleto.fat)} | Lucro: ${brl(mesAntCompleto.lucro)}`,
      ].join("\n");
    },
  },

  {
    name: "comparar_periodos",
    description:
      "Compara faturamento, lucro e qtd vendas entre 2 periodos arbitrarios. Use pra 'esse mes vs mes passado', 'abril vs marco', 'essa semana vs semana passada', '2026 vs 2025'. Default A: ultimos 30 dias. Default B: 30 dias antes disso.",
    inputSchema: {
      type: "object",
      properties: {
        a_desde: { type: "string", description: "Periodo A inicio YYYY-MM-DD." },
        a_ate: { type: "string", description: "Periodo A fim YYYY-MM-DD." },
        b_desde: { type: "string", description: "Periodo B inicio YYYY-MM-DD." },
        b_ate: { type: "string", description: "Periodo B fim YYYY-MM-DD." },
        rotulo_a: { type: "string", description: "Nome do periodo A (ex 'Abril 2026'). Opcional." },
        rotulo_b: { type: "string", description: "Nome do periodo B (ex 'Marco 2026'). Opcional." },
      },
    },
    handler: async (args, supabase) => {
      const hoje = new Date().toISOString().slice(0, 10);
      const aAte = args.a_ate || hoje;
      const aDesde = args.a_desde || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const bAte = args.b_ate || new Date(new Date(aDesde).getTime() - 24 * 3600 * 1000).toISOString().slice(0, 10);
      const bDesde = args.b_desde || new Date(new Date(bAte).getTime() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      const labelA = args.rotulo_a || `${dataBR(aDesde)} a ${dataBR(aAte)}`;
      const labelB = args.rotulo_b || `${dataBR(bDesde)} a ${dataBR(bAte)}`;

      const minDesde = aDesde < bDesde ? aDesde : bDesde;
      const maxAte = aAte > bAte ? aAte : bAte;

      const { data, error } = await supabase
        .from("vendas")
        .select("data, preco_vendido, lucro, status_pagamento, produto, origem")
        .gte("data", minDesde)
        .lte("data", maxAte)
        .neq("status_pagamento", "CANCELADO")
        .limit(10000);
      if (error) throw new Error(error.message);
      const rows = data || [];

      const agregar = (desde: string, ate: string) => {
        const filt = rows.filter((v) => v.data >= desde && v.data <= ate);
        return {
          qtd: filt.length,
          fat: filt.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0),
          lucro: filt.reduce((s, v) => s + (Number(v.lucro) || 0), 0),
          ticketMedio: filt.length > 0 ? filt.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0) / filt.length : 0,
        };
      };

      const a = agregar(aDesde, aAte);
      const b = agregar(bDesde, bAte);

      const variar = (atual: number, anterior: number): string => {
        if (anterior === 0) return atual > 0 ? "+∞%" : "0%";
        const pct = ((atual - anterior) / anterior) * 100;
        const sinal = pct >= 0 ? "+" : "";
        return `${sinal}${pct.toFixed(1)}%`;
      };

      return [
        `📊 COMPARACAO`,
        ``,
        `🅰️  ${labelA}`,
        `  Vendas: ${a.qtd} | Faturamento: ${brl(a.fat)} | Lucro: ${brl(a.lucro)} | Ticket medio: ${brl(a.ticketMedio)}`,
        ``,
        `🅱️  ${labelB}`,
        `  Vendas: ${b.qtd} | Faturamento: ${brl(b.fat)} | Lucro: ${brl(b.lucro)} | Ticket medio: ${brl(b.ticketMedio)}`,
        ``,
        `📈 VARIACAO A vs B`,
        `  Vendas: ${variar(a.qtd, b.qtd)}`,
        `  Faturamento: ${variar(a.fat, b.fat)}`,
        `  Lucro: ${variar(a.lucro, b.lucro)}`,
        `  Ticket medio: ${variar(a.ticketMedio, b.ticketMedio)}`,
      ].join("\n");
    },
  },

  {
    name: "consultar_vendedor",
    description:
      "Performance por vendedor (Bianca, Nicolas, Andre, etc). Agrupa vendas por quem registrou. Use pra 'quanto Bianca vendeu?', 'quem mais vendeu esse mes?', 'ranking de vendedores', 'comissao do Nicolas'. Default: mes atual.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: dia 1 do mes atual." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
        vendedor: { type: "string", description: "Filtrar por nome do vendedor (busca parcial)." },
      },
    },
    handler: async (args, supabase) => {
      const hoje = new Date();
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
      const desde = args.desde || inicioMes;
      const ate = args.ate || hoje.toISOString().slice(0, 10);

      let query = supabase
        .from("vendas")
        .select("data, vendedor, preco_vendido, lucro, status_pagamento, produto")
        .gte("data", desde)
        .lte("data", ate)
        .neq("status_pagamento", "CANCELADO")
        .limit(10000);
      if (args.vendedor) query = query.ilike("vendedor", `%${args.vendedor}%`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Sem vendas no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;

      const porVendedor = new Map<string, { qtd: number; fat: number; lucro: number; produtos: Set<string> }>();
      for (const v of data) {
        const vend = v.vendedor || "(nao registrado)";
        const cur = porVendedor.get(vend) || { qtd: 0, fat: 0, lucro: 0, produtos: new Set<string>() };
        cur.qtd += 1;
        cur.fat += Number(v.preco_vendido) || 0;
        cur.lucro += Number(v.lucro) || 0;
        if (v.produto) cur.produtos.add(String(v.produto));
        porVendedor.set(vend, cur);
      }

      const ranking = Array.from(porVendedor.entries()).sort((a, b) => b[1].fat - a[1].fat);
      const totalFat = data.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0);

      const linhas = ranking.map(([vend, agg], i) => {
        const pct = totalFat > 0 ? ((agg.fat / totalFat) * 100).toFixed(1) : "0";
        const ticket = agg.qtd > 0 ? agg.fat / agg.qtd : 0;
        return `${i + 1}. ${vend} — ${agg.qtd} vendas | ${brl(agg.fat)} (${pct}%) | Lucro ${brl(agg.lucro)} | Ticket ${brl(ticket)}`;
      });

      return [
        `🏆 RANKING DE VENDEDORES — ${dataBR(desde)} a ${dataBR(ate)}`,
        `Total: ${data.length} vendas | ${brl(totalFat)}`,
        ``,
        ...linhas,
      ].join("\n");
    },
  },

  // === ESTOQUE / COMPRAS ===

  {
    name: "consultar_comprar_urgente",
    description:
      "Lista SKUs urgentes pra comprar do fornecedor. Cruza estoque atual com vendas/simulacoes/encomendas/avisos pra ranquear demanda reprimida. Use pra 'o que preciso comprar?', 'quais SKUs zerados?', 'reposicao'.",
    inputSchema: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Quantos retornar. Default: 20, max 50." },
      },
    },
    handler: async (args, supabase) => {
      const limite = Math.min(Number(args.limite) || 20, 50);
      const from30 = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const from30Date = from30.slice(0, 10);

      const [vRes, simRes, avRes, encRes, estRes] = await Promise.all([
        supabase.from("vendas").select("sku, produto").not("sku", "is", null).gte("data", from30Date).neq("status_pagamento", "CANCELADO"),
        supabase.from("simulacoes").select("sku").not("sku", "is", null).gte("created_at", from30),
        supabase.from("avisos_clientes").select("sku").not("sku", "is", null).eq("status", "ATIVO"),
        supabase.from("encomendas").select("sku").not("sku", "is", null).in("status", ["PENDENTE", "COMPRADO", "A CAMINHO"]),
        supabase.from("estoque").select("sku, qnt, status").not("sku", "is", null),
      ]);

      const v30 = new Map<string, number>();
      const nomePorSku = new Map<string, string>();
      for (const v of vRes.data || []) {
        const sku = v.sku as string;
        v30.set(sku, (v30.get(sku) || 0) + 1);
        if (v.produto && !nomePorSku.has(sku)) nomePorSku.set(sku, String(v.produto));
      }
      const sim30 = new Map<string, number>();
      for (const s of simRes.data || []) {
        const sku = s.sku as string;
        sim30.set(sku, (sim30.get(sku) || 0) + 1);
      }
      const avisos = new Map<string, number>();
      for (const a of avRes.data || []) {
        const sku = a.sku as string;
        avisos.set(sku, (avisos.get(sku) || 0) + 1);
      }
      const enc = new Map<string, number>();
      for (const e of encRes.data || []) {
        const sku = e.sku as string;
        enc.set(sku, (enc.get(sku) || 0) + 1);
      }
      const est = new Map<string, number>();
      for (const r of estRes.data || []) {
        const sku = r.sku as string;
        if (String(r.status || "").toUpperCase() === "EM ESTOQUE") {
          est.set(sku, (est.get(sku) || 0) + Number(r.qnt || 0));
        } else if (!est.has(sku)) {
          est.set(sku, 0);
        }
      }

      const todos = new Set<string>([...v30.keys(), ...sim30.keys(), ...avisos.keys(), ...enc.keys(), ...est.keys()]);
      const ranking: Array<{ sku: string; nome: string; score: number; estoque: number; v: number; s: number; a: number; e: number }> = [];
      for (const sku of todos) {
        const estoque = est.get(sku) || 0;
        const mult = estoque === 0 ? 1 : estoque < 2 ? 0.5 : 0;
        const score = Math.round(((avisos.get(sku) || 0) * 4 + (enc.get(sku) || 0) * 3 + (sim30.get(sku) || 0) * 2 + (v30.get(sku) || 0) * 2) * mult);
        if (score < 2) continue;
        ranking.push({
          sku,
          nome: nomePorSku.get(sku) || sku,
          score,
          estoque,
          v: v30.get(sku) || 0,
          s: sim30.get(sku) || 0,
          a: avisos.get(sku) || 0,
          e: enc.get(sku) || 0,
        });
      }
      ranking.sort((x, y) => y.score - x.score);

      if (ranking.length === 0) return "Nada urgente pra comprar — estoque cobre a demanda atual.";

      const linhas = ranking.slice(0, limite).map((r, i) =>
        `${i + 1}. [${r.score}] ${r.nome} (${r.sku}) — estoque: ${r.estoque} | vendas30d: ${r.v} | sim30d: ${r.s} | avisos: ${r.a} | encomendas: ${r.e}`
      );

      return [
        `🚨 COMPRAR URGENTE — top ${Math.min(limite, ranking.length)} de ${ranking.length}`,
        `Score = avisos×4 + encomendas×3 + simulacoes×2 + vendas×2 (zerado se estoque ≥ 2)`,
        ``,
        ...linhas,
      ].join("\n");
    },
  },

  {
    name: "consultar_giro_sku",
    description:
      "Velocidade de giro por SKU — quantos dias o produto fica parado em estoque antes de vender. Use pra 'o que ta parado?', 'produtos que mais demoram', 'qual SKU esta encalhado?'. Mostra os mais lentos (encalhados) e os mais rapidos (quentes).",
    inputSchema: {
      type: "object",
      properties: {
        limite: { type: "number", description: "Quantos por categoria. Default: 10." },
      },
    },
    handler: async (args, supabase) => {
      const limite = Math.min(Number(args.limite) || 10, 30);
      const from90 = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const hojeIso = new Date().toISOString().slice(0, 10);

      const { data: vendas } = await supabase
        .from("vendas")
        .select("sku, produto, estoque_id, data")
        .not("sku", "is", null)
        .not("estoque_id", "is", null)
        .gte("data", from90)
        .neq("status_pagamento", "CANCELADO");

      const ids = [...new Set((vendas || []).map((v) => v.estoque_id as string))];
      const estoqueVendido = ids.length > 0
        ? (await supabase.from("estoque").select("id, data_entrada").in("id", ids)).data || []
        : [];
      const entradaMap = new Map<string, string | null>(estoqueVendido.map((e) => [e.id, e.data_entrada]));

      const giroMap = new Map<string, { dias: number[]; nome: string }>();
      for (const v of vendas || []) {
        const sku = v.sku as string;
        const ent = entradaMap.get(v.estoque_id as string);
        if (!ent) continue;
        const dias = Math.round((new Date(v.data).getTime() - new Date(ent).getTime()) / 86400000);
        if (dias < 0) continue;
        const cur = giroMap.get(sku) || { dias: [], nome: String(v.produto || sku) };
        cur.dias.push(dias);
        giroMap.set(sku, cur);
      }

      const stats = Array.from(giroMap.entries())
        .filter(([, agg]) => agg.dias.length >= 2)
        .map(([sku, agg]) => {
          const media = agg.dias.reduce((a, b) => a + b, 0) / agg.dias.length;
          return { sku, nome: agg.nome, vendas: agg.dias.length, media: Math.round(media) };
        });

      // Estoque atual encalhado (item mais antigo por SKU)
      const { data: estAtual } = await supabase
        .from("estoque")
        .select("sku, produto, data_entrada")
        .not("sku", "is", null)
        .eq("status", "EM ESTOQUE")
        .gt("qnt", 0);
      const encalheMap = new Map<string, { dias: number; nome: string }>();
      for (const e of estAtual || []) {
        const sku = e.sku as string;
        if (!e.data_entrada) continue;
        const dias = Math.round((new Date(hojeIso).getTime() - new Date(e.data_entrada).getTime()) / 86400000);
        const cur = encalheMap.get(sku);
        if (!cur || dias > cur.dias) encalheMap.set(sku, { dias, nome: String(e.produto || sku) });
      }
      const encalhados = Array.from(encalheMap.entries())
        .map(([sku, v]) => ({ sku, ...v }))
        .sort((a, b) => b.dias - a.dias)
        .slice(0, limite);

      const lentos = stats.sort((a, b) => b.media - a.media).slice(0, limite);
      const rapidos = [...stats].sort((a, b) => a.media - b.media).slice(0, limite);

      return [
        `⏱️  GIRO DE SKU — ultimos 90 dias`,
        ``,
        `🐌 MAIS LENTOS (media de dias parados antes de vender)`,
        ...lentos.map((r, i) => `  ${i + 1}. ${r.nome} (${r.sku}) — ${r.media}d media (${r.vendas} vendas)`),
        ``,
        `🚀 MAIS RAPIDOS`,
        ...rapidos.map((r, i) => `  ${i + 1}. ${r.nome} (${r.sku}) — ${r.media}d media (${r.vendas} vendas)`),
        ``,
        `📦 ENCALHADOS HOJE (item mais antigo em estoque por SKU)`,
        ...encalhados.map((r, i) => `  ${i + 1}. ${r.nome} (${r.sku}) — ${r.dias}d parado`),
      ].join("\n");
    },
  },

  {
    name: "consultar_margem_sku",
    description:
      "Margem real por SKU (lucro vs faturamento). Use pra 'qual produto da mais margem?', 'piores margens', 'onde tenho mais lucro absoluto', 'posso dar desconto em X?'. Default: ultimos 30 dias.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 30 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
        limite: { type: "number", description: "Quantos por ranking. Default: 10." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 30);
      const limite = Math.min(Number(args.limite) || 10, 30);

      const { data, error } = await supabase
        .from("vendas")
        .select("sku, produto, preco_vendido, custo")
        .not("sku", "is", null)
        .gte("data", desde)
        .lte("data", ate)
        .neq("status_pagamento", "CANCELADO")
        .neq("status_pagamento", "ESTORNADO")
        .limit(10000);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Sem vendas no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;

      const map = new Map<string, { vendas: number; fat: number; custo: number; nome: string }>();
      for (const v of data) {
        const sku = v.sku as string;
        const preco = Number(v.preco_vendido) || 0;
        const custo = Number(v.custo) || 0;
        if (custo <= 0 && preco <= 0) continue;
        const cur = map.get(sku) || { vendas: 0, fat: 0, custo: 0, nome: String(v.produto || sku) };
        cur.vendas += 1;
        cur.fat += preco;
        cur.custo += custo;
        map.set(sku, cur);
      }

      const lista = Array.from(map.entries()).map(([sku, agg]) => {
        const lucro = agg.fat - agg.custo;
        const margemPct = agg.fat > 0 ? (lucro / agg.fat) * 100 : 0;
        return {
          sku, nome: agg.nome, vendas: agg.vendas, fat: agg.fat, lucro,
          margemPct, ticket: agg.vendas > 0 ? agg.fat / agg.vendas : 0,
        };
      });

      const topLucro = [...lista].sort((a, b) => b.lucro - a.lucro).slice(0, limite);
      const topPct = lista.filter((r) => r.vendas >= 2).sort((a, b) => b.margemPct - a.margemPct).slice(0, limite);
      const piorPct = lista.filter((r) => r.vendas >= 2).sort((a, b) => a.margemPct - b.margemPct).slice(0, limite);

      const fmt = (r: typeof lista[0]) =>
        `  ${r.nome} (${r.sku}) — ${r.vendas} vendas | margem ${r.margemPct.toFixed(1)}% | lucro ${brl(r.lucro)} | ticket ${brl(r.ticket)}`;

      return [
        `💰 MARGEM POR SKU — ${dataBR(desde)} a ${dataBR(ate)}`,
        ``,
        `🥇 TOP LUCRO ABSOLUTO`,
        ...topLucro.map((r, i) => `${i + 1}.${fmt(r)}`),
        ``,
        `📊 MAIOR MARGEM % (min 2 vendas)`,
        ...topPct.map((r, i) => `${i + 1}.${fmt(r)}`),
        ``,
        `⚠️  PIOR MARGEM % (min 2 vendas)`,
        ...piorPct.map((r, i) => `${i + 1}.${fmt(r)}`),
      ].join("\n");
    },
  },

  {
    name: "consultar_encomendas",
    description:
      "Lista encomendas (produtos pedidos por clientes que ainda nao chegaram). Status possiveis: PENDENTE, COMPRADO, A CAMINHO, ENTREGUE, CANCELADA. Default: so abertas (nao entregues/canceladas).",
    inputSchema: {
      type: "object",
      properties: {
        cliente: { type: "string", description: "Filtrar por cliente (busca parcial)." },
        status: { type: "string", description: "Ex: PENDENTE, COMPRADO, A CAMINHO, ENTREGUE, CANCELADA." },
        incluir_finalizadas: { type: "boolean", description: "Se true, traz tambem ENTREGUE e CANCELADA. Default: false." },
      },
    },
    handler: async (args, supabase) => {
      let query = supabase
        .from("encomendas")
        .select("data, cliente, telefone, produto, categoria, cor, valor_venda, custo, status, fornecedor")
        .order("data", { ascending: false })
        .limit(500);
      if (args.cliente) query = query.ilike("cliente", `%${args.cliente}%`);
      if (args.status) {
        query = query.eq("status", String(args.status).toUpperCase());
      } else if (!args.incluir_finalizadas) {
        query = query.in("status", ["PENDENTE", "COMPRADO", "A CAMINHO"]);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return "Nenhuma encomenda encontrada.";

      const totalValor = data.reduce((s, e) => s + (Number(e.valor_venda) || 0), 0);
      const totalCusto = data.reduce((s, e) => s + (Number(e.custo) || 0), 0);
      const margem = totalValor - totalCusto;

      const porStatus = new Map<string, number>();
      for (const e of data) porStatus.set(e.status || "?", (porStatus.get(e.status || "?") || 0) + 1);
      const statusLinhas = Array.from(porStatus.entries()).map(([s, q]) => `  ${s}: ${q}`);

      const linhas = data.slice(0, 50).map((e) =>
        `• ${dataBR(e.data)} | ${e.cliente || "?"} | ${e.produto || "?"} (${e.cor || "?"}) | ${brl(Number(e.valor_venda) || 0)} | ${e.status || "?"}${e.fornecedor ? ` | ${e.fornecedor}` : ""}`
      );

      return [
        `📦 ENCOMENDAS — ${data.length} no total`,
        `Valor de venda: ${brl(totalValor)} | Custo: ${brl(totalCusto)} | Margem: ${brl(margem)}`,
        ``,
        `Por status:`,
        ...statusLinhas,
        ``,
        ...linhas,
        data.length > 50 ? `\n(mostrando 50 de ${data.length})` : "",
      ].filter(Boolean).join("\n");
    },
  },

  {
    name: "consultar_produtos_funcionarios",
    description:
      "Produtos cedidos/vendidos pra funcionarios da loja (Bianca, Nicolas, etc). Use pra 'qual produto ta com qual funcionario?', 'quanto a Bianca deve pelo iPhone?', 'produtos cedidos ativos'. Status: CEDIDO, ACORDO_ATIVO, EM_USO, DESLIGADO_PENDENTE, DEVOLVIDO.",
    inputSchema: {
      type: "object",
      properties: {
        funcionario: { type: "string", description: "Filtrar por funcionario (busca parcial)." },
        status: { type: "string", description: "Ex: CEDIDO, ACORDO_ATIVO, DEVOLVIDO." },
      },
    },
    handler: async (args, supabase) => {
      let query = supabase
        .from("produtos_funcionarios")
        .select("funcionario, produto, categoria, cor, tipo_acordo, valor_total, valor_funcionario, valor_pago, status, data_saida")
        .order("data_saida", { ascending: false, nullsFirst: false })
        .limit(500);
      if (args.funcionario) query = query.ilike("funcionario", `%${args.funcionario}%`);
      if (args.status) query = query.eq("status", String(args.status).toUpperCase());

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return "Nenhum produto vinculado a funcionario encontrado.";

      const porFunc = new Map<string, { qtd: number; total: number; pago: number; funcDeve: number }>();
      for (const p of data) {
        const f = p.funcionario || "?";
        const cur = porFunc.get(f) || { qtd: 0, total: 0, pago: 0, funcDeve: 0 };
        cur.qtd += 1;
        cur.total += Number(p.valor_total) || 0;
        cur.pago += Number(p.valor_pago) || 0;
        cur.funcDeve += Math.max(0, (Number(p.valor_funcionario) || 0) - (Number(p.valor_pago) || 0));
        porFunc.set(f, cur);
      }

      const ranking = Array.from(porFunc.entries()).sort((a, b) => b[1].qtd - a[1].qtd);
      const linhasRanking = ranking.map(
        ([f, agg]) => `  ${f}: ${agg.qtd} produtos | total ${brl(agg.total)} | pago ${brl(agg.pago)} | resta ${brl(agg.funcDeve)}`
      );

      const linhas = data.slice(0, 30).map((p) =>
        `• ${p.funcionario || "?"} | ${p.produto || "?"} (${p.cor || "?"}) | ${p.tipo_acordo || "?"} | total ${brl(Number(p.valor_total) || 0)} | pago ${brl(Number(p.valor_pago) || 0)} | ${p.status || "?"}`
      );

      return [
        `👥 PRODUTOS COM FUNCIONARIOS — ${data.length} no total`,
        ``,
        `Por funcionario:`,
        ...linhasRanking,
        ``,
        ...linhas,
        data.length > 30 ? `\n(mostrando 30 de ${data.length})` : "",
      ].filter(Boolean).join("\n");
    },
  },

  // === OPERACIONAL ===

  {
    name: "consultar_entregas",
    description:
      "Lista entregas agendadas. Use pra 'quantas entregas pendentes?', 'entregas de hoje', 'entregas atrasadas', 'qual rota Zona Sul?'. Default: ultimos 7 dias + futuras pendentes.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 7 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: 30 dias a frente." },
        status: { type: "string", description: "Ex: PENDENTE, ENTREGUE, CANCELADA." },
        regiao: { type: "string", description: "Filtrar por regiao (Zona Sul, Zona Norte, etc)." },
      },
    },
    handler: async (args, supabase) => {
      const hoje = new Date();
      const desde = args.desde || new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const ate = args.ate || new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);

      let query = supabase
        .from("entregas")
        .select("data_entrega, horario, cliente, telefone, endereco, bairro, regiao, produto, status, entregador, vendedor, valor_total")
        .gte("data_entrega", desde)
        .lte("data_entrega", ate)
        .order("data_entrega", { ascending: true })
        .limit(500);
      if (args.status) query = query.eq("status", String(args.status).toUpperCase());
      if (args.regiao) query = query.ilike("regiao", `%${args.regiao}%`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Nenhuma entrega entre ${dataBR(desde)} e ${dataBR(ate)}.`;

      const hojeIso = hoje.toISOString().slice(0, 10);
      const pendentes = data.filter((e) => e.status === "PENDENTE");
      const atrasadas = pendentes.filter((e) => e.data_entrega && e.data_entrega < hojeIso);
      const hojePend = pendentes.filter((e) => e.data_entrega === hojeIso);
      const futuras = pendentes.filter((e) => e.data_entrega && e.data_entrega > hojeIso);

      const porRegiao = new Map<string, number>();
      for (const e of pendentes) {
        const r = e.regiao || "(sem regiao)";
        porRegiao.set(r, (porRegiao.get(r) || 0) + 1);
      }
      const regLinhas = Array.from(porRegiao.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([r, q]) => `  ${r}: ${q}`);

      const linhas = data.slice(0, 50).map((e) => {
        const atraso = e.status === "PENDENTE" && e.data_entrega && e.data_entrega < hojeIso ? " ⚠️ ATRASADA" : "";
        return `• ${dataBR(e.data_entrega)}${e.horario ? ` ${e.horario}` : ""} | ${e.cliente || "?"} | ${e.bairro || "?"} | ${e.produto || "?"} | ${e.status || "?"}${atraso}`;
      });

      return [
        `🚚 ENTREGAS — ${data.length} entre ${dataBR(desde)} e ${dataBR(ate)}`,
        `Pendentes: ${pendentes.length} (HOJE: ${hojePend.length} | atrasadas: ${atrasadas.length} | futuras: ${futuras.length})`,
        ``,
        regLinhas.length > 0 ? `Pendentes por regiao:` : "",
        ...regLinhas,
        ``,
        ...linhas,
        data.length > 50 ? `\n(mostrando 50 de ${data.length})` : "",
      ].filter(Boolean).join("\n");
    },
  },

  {
    name: "consultar_trocas",
    description:
      "Trocas/devolucoes registradas (produto saiu vs produto entrou). Use pra 'quantas trocas esse mes?', 'trocas por defeito', 'cliente devolveu o que?', 'diferenca de valor das trocas'. Default: ultimos 30 dias.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 30 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
        motivo: { type: "string", description: "Filtrar por motivo (DEFEITO, CLIENTE_DEVOLVEU, etc)." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 30);

      let query = supabase
        .from("trocas")
        .select("data, motivo, fornecedor, produto_saida_nome, produto_entrada_nome, diferenca_valor, observacao")
        .gte("data", desde)
        .lte("data", ate)
        .order("data", { ascending: false })
        .limit(500);
      if (args.motivo) query = query.ilike("motivo", `%${args.motivo}%`);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Nenhuma troca entre ${dataBR(desde)} e ${dataBR(ate)}.`;

      const totalDif = data.reduce((s, t) => s + (Number(t.diferenca_valor) || 0), 0);
      const porMotivo = new Map<string, number>();
      for (const t of data) porMotivo.set(t.motivo || "?", (porMotivo.get(t.motivo || "?") || 0) + 1);
      const motLinhas = Array.from(porMotivo.entries()).map(([m, q]) => `  ${m}: ${q}`);

      const linhas = data.slice(0, 50).map((t) =>
        `• ${dataBR(t.data)} | ${t.motivo || "?"} | saiu: ${t.produto_saida_nome || "?"} → entrou: ${t.produto_entrada_nome || "?"} | dif: ${brl(Number(t.diferenca_valor) || 0)}`
      );

      return [
        `🔄 TROCAS — ${data.length} entre ${dataBR(desde)} e ${dataBR(ate)}`,
        `Diferenca de valor (positivo = pagamos): ${brl(totalDif)}`,
        ``,
        `Por motivo:`,
        ...motLinhas,
        ``,
        ...linhas,
        data.length > 50 ? `\n(mostrando 50 de ${data.length})` : "",
      ].filter(Boolean).join("\n");
    },
  },

  // === ANALYTICS ===

  {
    name: "consultar_mapa_vendas",
    description:
      "Vendas agrupadas por cidade/bairro/UF. Use pra 'onde vendo mais?', 'vendas por estado', 'qual bairro tem mais cliente?', 'tem venda fora do RJ?'. Default: ultimos 90 dias.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 90 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
        agrupar_por: { type: "string", description: "'bairro', 'cidade' ou 'uf'. Default: cidade." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 90);
      const agruparPor = (args.agrupar_por || "cidade").toLowerCase();

      const { data, error } = await supabase
        .from("vendas")
        .select("bairro, cidade, uf, preco_vendido, lucro")
        .gte("data", desde)
        .lte("data", ate)
        .neq("status_pagamento", "CANCELADO")
        .limit(10000);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Sem vendas no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;

      const map = new Map<string, { qtd: number; fat: number; lucro: number }>();
      for (const v of data) {
        let key: string;
        if (agruparPor === "bairro") {
          const b = (v.bairro || "").trim() || "(sem bairro)";
          const c = (v.cidade || "").trim() || "?";
          key = `${b}, ${c}`;
        } else if (agruparPor === "uf") {
          key = (v.uf || "").trim() || "(sem UF)";
        } else {
          const c = (v.cidade || "").trim() || "(sem cidade)";
          const u = (v.uf || "").trim();
          key = u ? `${c}/${u}` : c;
        }
        const cur = map.get(key) || { qtd: 0, fat: 0, lucro: 0 };
        cur.qtd += 1;
        cur.fat += Number(v.preco_vendido) || 0;
        cur.lucro += Number(v.lucro) || 0;
        map.set(key, cur);
      }

      const ranking = Array.from(map.entries()).sort((a, b) => b[1].fat - a[1].fat);
      const totalFat = data.reduce((s, v) => s + (Number(v.preco_vendido) || 0), 0);

      const linhas = ranking.slice(0, 30).map(([loc, agg], i) => {
        const pct = totalFat > 0 ? ((agg.fat / totalFat) * 100).toFixed(1) : "0";
        return `${i + 1}. ${loc} — ${agg.qtd} vendas | ${brl(agg.fat)} (${pct}%) | lucro ${brl(agg.lucro)}`;
      });

      return [
        `🗺️  VENDAS POR ${agruparPor.toUpperCase()} — ${dataBR(desde)} a ${dataBR(ate)}`,
        `Total: ${data.length} vendas | ${brl(totalFat)}`,
        ``,
        ...linhas,
        ranking.length > 30 ? `\n(mostrando 30 de ${ranking.length})` : "",
      ].filter(Boolean).join("\n");
    },
  },

  {
    name: "consultar_sazonalidade",
    description:
      "Padrao de vendas por dia da semana e dia do mes. Use pra 'que dia vendo mais?', 'qual o pior dia?', 'segunda eh ruim?', 'vendo mais no fim do mes?'. Default: ultimos 90 dias.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 90 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 90);

      const { data, error } = await supabase
        .from("vendas")
        .select("data, preco_vendido, lucro")
        .gte("data", desde)
        .lte("data", ate)
        .neq("status_pagamento", "CANCELADO")
        .limit(10000);
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Sem vendas no periodo ${dataBR(desde)} a ${dataBR(ate)}.`;

      const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
      const porDow = new Array(7).fill(0).map(() => ({ qtd: 0, fat: 0 }));
      const porDomes = new Map<number, { qtd: number; fat: number }>();

      for (const v of data) {
        const d = new Date(v.data + "T12:00:00");
        const dow = d.getDay();
        const dom = d.getDate();
        const fat = Number(v.preco_vendido) || 0;
        porDow[dow].qtd += 1;
        porDow[dow].fat += fat;
        const cur = porDomes.get(dom) || { qtd: 0, fat: 0 };
        cur.qtd += 1;
        cur.fat += fat;
        porDomes.set(dom, cur);
      }

      const dowLinhas = porDow.map((agg, i) =>
        `  ${diasSemana[i]}: ${agg.qtd} vendas | ${brl(agg.fat)}`
      );

      // Quartis do mes (1-7, 8-14, 15-21, 22-31)
      const quartis = [
        { nome: "Inicio (1-7)", min: 1, max: 7 },
        { nome: "2a sem (8-14)", min: 8, max: 14 },
        { nome: "3a sem (15-21)", min: 15, max: 21 },
        { nome: "Fim (22-31)", min: 22, max: 31 },
      ];
      const qLinhas = quartis.map((q) => {
        let qtd = 0, fat = 0;
        for (let d = q.min; d <= q.max; d++) {
          const a = porDomes.get(d);
          if (a) { qtd += a.qtd; fat += a.fat; }
        }
        return `  ${q.nome}: ${qtd} vendas | ${brl(fat)}`;
      });

      // Melhor e pior dia da semana
      const dowOrdem = porDow.map((a, i) => ({ ...a, nome: diasSemana[i] })).sort((a, b) => b.fat - a.fat);
      const melhor = dowOrdem[0];
      const pior = dowOrdem[dowOrdem.length - 1];

      return [
        `📅 SAZONALIDADE — ${dataBR(desde)} a ${dataBR(ate)} (${data.length} vendas)`,
        ``,
        `🗓️  POR DIA DA SEMANA`,
        ...dowLinhas,
        ``,
        `🏆 Melhor: ${melhor.nome} (${brl(melhor.fat)}) | Pior: ${pior.nome} (${brl(pior.fat)})`,
        ``,
        `📆 POR PERIODO DO MES`,
        ...qLinhas,
      ].join("\n");
    },
  },

  {
    name: "consultar_simulacoes_detalhe",
    description:
      "Detalhes das simulacoes do trade-in (leads). Use pra 'simulacoes de hoje', 'leads sem responder', 'simulacao da Maria', 'simulacoes do vendedor X', 'leads quentes'. Default: ultimos 7 dias.",
    inputSchema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Data inicial YYYY-MM-DD. Default: 7 dias atras." },
        ate: { type: "string", description: "Data final YYYY-MM-DD. Default: hoje." },
        nome: { type: "string", description: "Filtrar por nome (busca parcial)." },
        vendedor: { type: "string", description: "Filtrar por vendedor responsavel." },
        status: { type: "string", description: "ABERTA, FECHADA, INVALIDA." },
        nao_respondidas: { type: "boolean", description: "Se true, so as que ainda nao foram respondidas no WhatsApp." },
      },
    },
    handler: async (args, supabase) => {
      const { desde, ate } = rangeDatas(args, 7);

      let query = supabase
        .from("simulacoes")
        .select("created_at, nome, whatsapp, modelo_novo, modelo_usado, diferenca, status, vendedor, respondido_wa, motivo_invalido")
        .gte("created_at", `${desde}T00:00:00`)
        .lte("created_at", `${ate}T23:59:59`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (args.nome) query = query.ilike("nome", `%${args.nome}%`);
      if (args.vendedor) query = query.ilike("vendedor", `%${args.vendedor}%`);
      if (args.status) query = query.eq("status", String(args.status).toUpperCase());
      if (args.nao_respondidas) query = query.or("respondido_wa.is.null,respondido_wa.eq.false");

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return `Nenhuma simulacao entre ${dataBR(desde)} e ${dataBR(ate)}.`;

      const naoResp = data.filter((s) => !s.respondido_wa).length;
      const fechadas = data.filter((s) => s.status === "FECHADA").length;
      const invalidas = data.filter((s) => s.status === "INVALIDA").length;
      const abertas = data.length - fechadas - invalidas;

      const linhas = data.slice(0, 40).map((s) => {
        const dt = s.created_at ? dataBR(s.created_at) : "?";
        const resp = s.respondido_wa ? "✅" : "📵";
        return `• ${dt} ${resp} | ${s.nome || "?"} | ${s.whatsapp || "?"} | ${s.modelo_novo || "?"} ← ${s.modelo_usado || "?"} | dif ${brl(Number(s.diferenca) || 0)} | ${s.status || "?"}${s.vendedor ? ` | ${s.vendedor}` : ""}`;
      });

      return [
        `📱 SIMULACOES — ${data.length} entre ${dataBR(desde)} e ${dataBR(ate)}`,
        `Abertas: ${abertas} | Fechadas: ${fechadas} | Invalidas: ${invalidas}`,
        `📵 Nao respondidas no WhatsApp: ${naoResp}`,
        ``,
        ...linhas,
        data.length > 40 ? `\n(mostrando 40 de ${data.length})` : "",
      ].filter(Boolean).join("\n");
    },
  },
];
