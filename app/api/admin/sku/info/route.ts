// app/api/admin/sku/info/route.ts
// Agregador de tudo sobre um SKU canonico — usado pelo Cmd+K pra dar uma
// visao 360° do produto em 1 request so:
//
//   - Estoque atual (qnt + custo medio ponderado)
//   - Vendas ultimos 30/90d (qtd, ticket medio, margem)
//   - Simulacoes 30d (interesse de compra)
//   - Avisos clientes ativos (demanda reprimida)
//   - Encomendas em aberto (compra ja prometida ao cliente)
//   - Mostruario: SKU aparece? qual preco?
//
// Uso:
//   GET /api/admin/sku/info?sku=IPHONE-17-PRO-MAX-256GB-TITANIO-NATURAL
//   Retorna tudo que voce precisa saber pra precificar/decidir naquele momento.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { skuToNomeCanonico } from "@/lib/sku-validator";

export const dynamic = "force-dynamic";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

interface InfoEstoque {
  total_unidades: number;
  custo_medio: number;
  custo_minimo: number;
  custo_maximo: number;
  items: Array<{
    id: string;
    produto: string;
    cor: string | null;
    serial_no: string | null;
    imei: string | null;
    custo_compra: number;
    custo_unitario: number;
    fornecedor: string | null;
    data_entrada: string | null;
    status: string;
  }>;
}

interface InfoVendas {
  total_30d: number;
  total_90d: number;
  total_geral: number;
  ticket_medio_30d: number;
  faturamento_30d: number;
  margem_media: number;   // % lucro medio
  lucro_total_30d: number;
  ultima_venda_data: string | null;
  ultimas: Array<{
    id: string;
    data: string;
    cliente: string;
    preco_vendido: number;
    custo: number | null;
    lucro: number | null;
  }>;
}

interface SkuSimilar {
  sku: string;
  nome_canonico: string | null;
  em_estoque: number;
  custo_medio: number;
  similaridade: number; // 0-100, quanto maior mais parecido
  diferencas: string[]; // ex: ["storage diferente", "cor diferente"]
}

interface InfoSkuResponse {
  sku: string;
  nome_canonico: string | null;
  estoque: InfoEstoque;
  vendas: InfoVendas;
  simulacoes_30d: number;
  avisos_ativos: number;
  encomendas_pendentes: number;
  mostruario: {
    visivel: boolean;
    preco: number | null;
    preco_parcelado: number | null;
    produto_id: string | null;
    variacao_id: string | null;
  };
  similares: SkuSimilar[];
}

// Extrai prefixo comum do SKU pra busca de similares. Regras:
//   IPHONE-17-PRO-MAX-512GB-PRATA  →  prefixo = IPHONE-17-PRO-MAX
//   IPAD-PRO-M4-13-256GB-PRATA     →  prefixo = IPAD-PRO-M4
//   MACBOOK-AIR-M4-13-16GB-256GB   →  prefixo = MACBOOK-AIR-M4
//   WATCH-S11-42MM-GPS-PRATA       →  prefixo = WATCH-S11
// O prefixo captura modelo+variante+chip, deixando livre storage+cor+etc.
function extrairPrefixoFamilia(sku: string): string {
  const partes = sku.split("-");
  // IPHONE-17 / IPHONE-17-PRO / IPHONE-17-PRO-MAX
  if (partes[0] === "IPHONE") {
    if (partes.length >= 4 && (partes[2] === "PRO" || partes[2] === "PLUS" || partes[2] === "AIR") && partes[3] === "MAX") {
      return `${partes[0]}-${partes[1]}-${partes[2]}-${partes[3]}`;
    }
    if (partes.length >= 3 && (partes[2] === "PRO" || partes[2] === "PLUS" || partes[2] === "AIR" || partes[2] === "MINI")) {
      return `${partes[0]}-${partes[1]}-${partes[2]}`;
    }
    return `${partes[0]}-${partes[1]}`;
  }
  // IPAD / IPAD-PRO-M4 / IPAD-AIR-M3 / IPAD-MINI
  if (partes[0] === "IPAD") {
    if (partes.length >= 3 && (partes[1] === "PRO" || partes[1] === "AIR")) {
      return `${partes[0]}-${partes[1]}-${partes[2] || ""}`;
    }
    return partes.slice(0, 2).join("-");
  }
  // MACBOOK-AIR-M4 / MACBOOK-PRO-M4
  if (partes[0] === "MACBOOK") {
    return partes.slice(0, 3).join("-");
  }
  // MAC-MINI-M4
  if (partes[0] === "MAC" && partes[1] === "MINI") {
    return partes.slice(0, 3).join("-");
  }
  // WATCH-S11 / WATCH-ULTRA-2 / WATCH-SE
  if (partes[0] === "WATCH") {
    if (partes[1] === "ULTRA") return partes.slice(0, 3).join("-");
    return partes.slice(0, 2).join("-");
  }
  // AIRPODS-PRO-2 / AIRPODS-MAX / AIRPODS-4
  if (partes[0] === "AIRPODS") {
    return partes.slice(0, 2).join("-");
  }
  // Fallback: primeiros 2 segmentos
  return partes.slice(0, 2).join("-");
}

// Compara dois SKUs da mesma familia e devolve score 0-100 + diferencas
// legiveis. Quanto mais componentes batem, maior o score.
function calcularSimilaridade(skuA: string, skuB: string): { score: number; diferencas: string[] } {
  const partesA = skuA.split("-");
  const partesB = skuB.split("-");
  const diferencas: string[] = [];

  const storageA = partesA.find((p) => /^\d+(GB|TB)$/.test(p));
  const storageB = partesB.find((p) => /^\d+(GB|TB)$/.test(p));
  const sameStorage = storageA === storageB && storageA;

  // Cor = concat dos segmentos nao-classificados no final (heuristica simples)
  const isClassificavel = (p: string) =>
    /^\d+(GB|TB|MM)$/.test(p) || /^M\d+/.test(p) || ["GPS", "GPSCEL", "WIFI", "CELL", "SEMINOVO", "ANC"].includes(p);
  const corA = partesA.filter((p) => !isClassificavel(p)).slice(-2).join("-");
  const corB = partesB.filter((p) => !isClassificavel(p)).slice(-2).join("-");
  const sameCor = corA === corB && corA;

  const sameSeminovo = partesA.includes("SEMINOVO") === partesB.includes("SEMINOVO");

  let score = 50; // base: mesma familia
  if (sameStorage) score += 30;
  else diferencas.push("storage diferente");
  if (sameCor) score += 15;
  else diferencas.push("cor diferente");
  if (sameSeminovo) score += 5;
  else diferencas.push("condição diferente");

  return { score, diferencas };
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sku = (req.nextUrl.searchParams.get("sku") || "").trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku obrigatorio" }, { status: 400 });

  const from30d = daysAgoIso(30);
  const from90d = daysAgoIso(90);

  try {
    // Buscar tudo em paralelo pra ficar rapido
    const [estoqueRes, vendas30dRes, vendas90dRes, vendasGeralCount, simulacoesRes, avisosRes, encomendasRes, variacaoRes] = await Promise.all([
      // Estoque: todas as linhas com esse SKU (inclusive ESGOTADO pra historico)
      supabase
        .from("estoque")
        .select("id, produto, cor, serial_no, imei, custo_compra, custo_unitario, fornecedor, data_entrada, qnt, status")
        .eq("sku", sku),
      // Vendas ultimos 30d
      supabase
        .from("vendas")
        .select("id, data, cliente, preco_vendido, custo, lucro")
        .eq("sku", sku)
        .gte("data", from30d.slice(0, 10))
        .order("data", { ascending: false }),
      // Vendas ultimos 90d
      supabase
        .from("vendas")
        .select("id", { count: "exact", head: true })
        .eq("sku", sku)
        .gte("data", from90d.slice(0, 10)),
      // Vendas total geral (pra contexto historico)
      supabase
        .from("vendas")
        .select("id", { count: "exact", head: true })
        .eq("sku", sku),
      // Simulacoes ultimos 30d
      supabase
        .from("simulacoes")
        .select("id", { count: "exact", head: true })
        .eq("sku", sku)
        .gte("created_at", from30d),
      // Avisos ativos (nao notificados/removidos)
      supabase
        .from("avisos_clientes")
        .select("id", { count: "exact", head: true })
        .eq("sku", sku)
        .eq("status", "ATIVO"),
      // Encomendas em aberto (PENDENTE, COMPRADO, A CAMINHO)
      supabase
        .from("encomendas")
        .select("id", { count: "exact", head: true })
        .eq("sku", sku)
        .in("status", ["PENDENTE", "COMPRADO", "A CAMINHO"]),
      // Mostruario: variacao com esse SKU
      supabase
        .from("loja_variacoes")
        .select("id, produto_id, preco, preco_parcelado, visivel")
        .eq("sku", sku)
        .limit(1)
        .maybeSingle(),
    ]);

    // ── Estoque agregado ──
    const estoqueRows = estoqueRes.data || [];
    const emEstoque = estoqueRows.filter(
      (r) => String(r.status || "").toUpperCase() === "EM ESTOQUE" && Number(r.qnt || 0) > 0,
    );
    let totalUnidades = 0;
    let somaCustoPonderado = 0;
    let custoMin = Infinity;
    let custoMax = 0;
    for (const r of emEstoque) {
      const qnt = Number(r.qnt || 0);
      const custo = Number(r.custo_compra || r.custo_unitario || 0);
      totalUnidades += qnt;
      somaCustoPonderado += qnt * custo;
      if (custo > 0 && custo < custoMin) custoMin = custo;
      if (custo > custoMax) custoMax = custo;
    }
    const custoMedio = totalUnidades > 0 ? Math.round(somaCustoPonderado / totalUnidades) : 0;

    const estoque: InfoEstoque = {
      total_unidades: totalUnidades,
      custo_medio: custoMedio,
      custo_minimo: custoMin === Infinity ? 0 : Math.round(custoMin),
      custo_maximo: Math.round(custoMax),
      items: emEstoque.slice(0, 10).map((r) => ({
        id: r.id,
        produto: r.produto,
        cor: r.cor,
        serial_no: r.serial_no,
        imei: r.imei,
        custo_compra: Number(r.custo_compra || 0),
        custo_unitario: Number(r.custo_unitario || 0),
        fornecedor: r.fornecedor,
        data_entrada: r.data_entrada,
        status: r.status,
      })),
    };

    // ── Vendas agregadas ──
    const vendas30d = vendas30dRes.data || [];
    const totalVendas30 = vendas30d.length;
    const faturamento30 = vendas30d.reduce((s, v) => s + Number(v.preco_vendido || 0), 0);
    const lucroTotal30 = vendas30d.reduce((s, v) => s + Number(v.lucro || 0), 0);
    const ticketMedio = totalVendas30 > 0 ? Math.round(faturamento30 / totalVendas30) : 0;
    const margemMedia = faturamento30 > 0 ? Math.round((lucroTotal30 / faturamento30) * 1000) / 10 : 0;
    const ultimaVendaData = vendas30d[0]?.data || null;

    const vendas: InfoVendas = {
      total_30d: totalVendas30,
      total_90d: vendas90dRes.count || 0,
      total_geral: vendasGeralCount.count || 0,
      ticket_medio_30d: ticketMedio,
      faturamento_30d: Math.round(faturamento30),
      margem_media: margemMedia,
      lucro_total_30d: Math.round(lucroTotal30),
      ultima_venda_data: ultimaVendaData,
      ultimas: vendas30d.slice(0, 5).map((v) => ({
        id: v.id,
        data: v.data,
        cliente: v.cliente,
        preco_vendido: Number(v.preco_vendido || 0),
        custo: v.custo !== null && v.custo !== undefined ? Number(v.custo) : null,
        lucro: v.lucro !== null && v.lucro !== undefined ? Number(v.lucro) : null,
      })),
    };

    // ── Mostruario ──
    const varRow = variacaoRes.data;
    const mostruario = {
      visivel: !!varRow?.visivel,
      preco: varRow?.preco ? Number(varRow.preco) : null,
      preco_parcelado: varRow?.preco_parcelado ? Number(varRow.preco_parcelado) : null,
      produto_id: varRow?.produto_id || null,
      variacao_id: varRow?.id || null,
    };

    // ── Similares em estoque (sugestao de substituicao quando esgotado) ──
    // So busca se o SKU atual esta com pouco/zero estoque — senao nao tem
    // motivo pra mostrar alternativa. Ranqueia por similaridade + qnt.
    let similares: SkuSimilar[] = [];
    if (totalUnidades < 2) {
      const prefixo = extrairPrefixoFamilia(sku);
      const { data: similaresRaw } = await supabase
        .from("estoque")
        .select("sku, qnt, custo_compra, custo_unitario, status")
        .like("sku", `${prefixo}%`)
        .eq("status", "EM ESTOQUE")
        .gt("qnt", 0);

      // Agrega por SKU (varias unidades mesmo SKU viram 1 entrada com qnt total)
      const simMap = new Map<string, { qnt: number; custoSum: number; custoCount: number }>();
      for (const r of similaresRaw || []) {
        if (!r.sku || r.sku === sku) continue; // pula o proprio SKU
        const qnt = Number(r.qnt || 0);
        const custo = Number(r.custo_compra || r.custo_unitario || 0);
        const cur = simMap.get(r.sku) || { qnt: 0, custoSum: 0, custoCount: 0 };
        cur.qnt += qnt;
        if (custo > 0) {
          cur.custoSum += custo;
          cur.custoCount += 1;
        }
        simMap.set(r.sku, cur);
      }

      similares = [...simMap.entries()]
        .map(([skuSim, agg]) => {
          const { score, diferencas } = calcularSimilaridade(sku, skuSim);
          return {
            sku: skuSim,
            nome_canonico: skuToNomeCanonico(skuSim),
            em_estoque: agg.qnt,
            custo_medio: agg.custoCount > 0 ? Math.round(agg.custoSum / agg.custoCount) : 0,
            similaridade: score,
            diferencas,
          };
        })
        .sort((a, b) => b.similaridade - a.similaridade || b.em_estoque - a.em_estoque)
        .slice(0, 6);
    }

    const resp: InfoSkuResponse = {
      sku,
      nome_canonico: skuToNomeCanonico(sku),
      estoque,
      vendas,
      simulacoes_30d: simulacoesRes.count || 0,
      avisos_ativos: avisosRes.count || 0,
      encomendas_pendentes: encomendasRes.count || 0,
      mostruario,
      similares,
    };

    return NextResponse.json({ ok: true, data: resp });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
