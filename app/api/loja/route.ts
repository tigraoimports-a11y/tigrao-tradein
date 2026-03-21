import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Types ──

interface StorageVariant {
  storage: string;
  preco: number;
  cores: string[];
  em_estoque: boolean;
}

interface ProdutoLoja {
  id: string;
  nome: string;
  categoria: string;
  storages: StorageVariant[];
  descricao: string;
  imagem: string | null;
}

// Backwards-compatible flat export (used by existing code)
export interface LojaProduct {
  id: string;
  modelo: string;
  armazenamento: string;
  categoria: string;
  precoPix: number;
  cores: string[];
  emEstoque: boolean;
  qtdEstoque: number;
}

// Categorias ordenadas para exibição
const CATEGORIAS_ORDEM = ["IPHONES", "MACBOOK", "MAC_MINI", "IPADS", "APPLE_WATCH", "AIRPODS", "ACESSORIOS"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");
  const format = searchParams.get("format"); // "grouped" para novo formato, default = flat (retrocompat)

  try {
    const { supabase } = await import("@/lib/supabase");

    // Buscar estoque: itens com qnt > 0, excluindo PENDENCIA, SEMINOVO e A_CAMINHO
    let estoqueQuery = supabase
      .from("estoque")
      .select("id, produto, categoria, cor, qnt, custo_unitario, tipo, status")
      .gt("qnt", 0)
      .not("tipo", "in", '("PENDENCIA","SEMINOVO","A_CAMINHO")')
      .order("categoria")
      .order("produto");

    if (categoria) {
      estoqueQuery = estoqueQuery.eq("categoria", categoria);
    }

    const { data: estoque, error: estoqueErr } = await estoqueQuery;
    if (estoqueErr) throw estoqueErr;

    // Buscar preços públicos da tabela precos
    const { data: precos, error: precosErr } = await supabase
      .from("precos")
      .select("modelo, armazenamento, preco_pix, status, categoria")
      .neq("status", "esgotado");
    if (precosErr) throw precosErr;

    // Indexar precos por (modelo normalizado | storage)
    const precosMap = new Map<string, number>();
    for (const p of precos ?? []) {
      const key = `${normalize(p.modelo)}|${p.armazenamento.toUpperCase()}`;
      precosMap.set(key, p.preco_pix);
    }

    // ── Novo formato agrupado ──
    if (format === "grouped") {
      return buildGroupedResponse(estoque ?? [], precosMap);
    }

    // ── Formato flat (retrocompatível) ──
    return buildFlatResponse(precos ?? [], estoque ?? []);
  } catch (error) {
    console.error("Erro ao buscar produtos da loja:", error);
    return NextResponse.json(
      format === "grouped"
        ? { produtos: [], categorias: [] }
        : FALLBACK,
      { headers: { "Cache-Control": "public, s-maxage=30" } }
    );
  }
}

// ── Novo formato: agrupado por produto ──

function buildGroupedResponse(
  estoque: { id: string; produto: string; categoria: string; cor: string | null; qnt: number; custo_unitario: number; tipo: string }[],
  precosMap: Map<string, number>,
) {
  // Agrupar por modelo (produto sem storage)
  const grupoMap = new Map<string, {
    categoria: string;
    firstId: string;
    storages: Map<string, { cores: Set<string>; qntTotal: number; preco: number }>;
  }>();

  for (const item of estoque) {
    const parsed = parseEstoqueProduto(item.produto);

    if (!parsed) {
      // Produto sem storage (AirPods, acessórios, etc.)
      const key = normalize(item.produto);
      if (!grupoMap.has(key)) {
        grupoMap.set(key, { categoria: item.categoria, firstId: item.id, storages: new Map() });
      }
      const grupo = grupoMap.get(key)!;
      if (!grupo.storages.has("")) {
        // Tentar achar preço — buscar várias combinações
        const preco = findPreco(precosMap, key, "");
        grupo.storages.set("", { cores: new Set(), qntTotal: 0, preco });
      }
      const sv = grupo.storages.get("")!;
      if (item.cor) sv.cores.add(item.cor);
      sv.qntTotal += item.qnt;
      continue;
    }

    const { modelo, storage } = parsed;
    const key = normalize(modelo);

    if (!grupoMap.has(key)) {
      grupoMap.set(key, { categoria: item.categoria, firstId: item.id, storages: new Map() });
    }
    const grupo = grupoMap.get(key)!;

    if (!grupo.storages.has(storage)) {
      const preco = findPreco(precosMap, key, storage);
      grupo.storages.set(storage, { cores: new Set(), qntTotal: 0, preco });
    }
    const sv = grupo.storages.get(storage)!;
    if (item.cor) sv.cores.add(item.cor);
    sv.qntTotal += item.qnt;
  }

  // Converter para array
  const produtos: ProdutoLoja[] = [];

  for (const [modeloNorm, grupo] of grupoMap) {
    const nome = formatNomeProduto(modeloNorm);

    const storages: StorageVariant[] = [];
    for (const [storage, data] of grupo.storages) {
      storages.push({
        storage,
        preco: data.preco,
        cores: [...data.cores].sort(),
        em_estoque: data.qntTotal > 0,
      });
    }
    storages.sort((a, b) => parseStorageSize(a.storage) - parseStorageSize(b.storage));

    produtos.push({
      id: grupo.firstId,
      nome,
      categoria: grupo.categoria,
      storages,
      descricao: "Novo | Lacrado | 1 ano de garantia Apple | Nota Fiscal",
      imagem: null,
    });
  }

  // Ordenar por categoria e nome
  produtos.sort((a, b) => {
    const catA = CATEGORIAS_ORDEM.indexOf(a.categoria);
    const catB = CATEGORIAS_ORDEM.indexOf(b.categoria);
    const orderA = catA === -1 ? 999 : catA;
    const orderB = catB === -1 ? 999 : catB;
    if (orderA !== orderB) return orderA - orderB;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  const categoriasPresentes = [...new Set(produtos.map((p) => p.categoria))];
  const categorias = CATEGORIAS_ORDEM.filter((c) => categoriasPresentes.includes(c));

  return NextResponse.json(
    { produtos, categorias },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}

// ── Formato flat (retrocompatível com código existente) ──

function buildFlatResponse(
  precos: { modelo: string; armazenamento: string; preco_pix: number; status: string; categoria: string | null }[],
  estoque: { produto: string; cor: string | null; qnt: number; status: string; categoria: string }[],
) {
  // Build map of estoque by produto name
  const estoqueMap = new Map<string, { cores: Set<string>; totalQnt: number }>();
  for (const item of estoque) {
    const key = item.produto;
    if (!estoqueMap.has(key)) {
      estoqueMap.set(key, { cores: new Set(), totalQnt: 0 });
    }
    const entry = estoqueMap.get(key)!;
    if (item.cor) entry.cores.add(item.cor);
    entry.totalQnt += Number(item.qnt || 0);
  }

  const products: LojaProduct[] = precos.map((p) => {
    const fullName = `${p.modelo} ${p.armazenamento}`;
    const estoqueInfo = estoqueMap.get(fullName) || estoqueMap.get(p.modelo);

    const id = `${p.modelo}-${p.armazenamento}`
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    return {
      id,
      modelo: p.modelo,
      armazenamento: p.armazenamento,
      categoria: p.categoria || inferCategoria(p.modelo),
      precoPix: p.preco_pix,
      cores: estoqueInfo ? Array.from(estoqueInfo.cores) : [],
      emEstoque: estoqueInfo ? estoqueInfo.totalQnt > 0 : true,
      qtdEstoque: estoqueInfo?.totalQnt ?? 0,
    };
  });

  return NextResponse.json(products, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}

// ── Helpers ──

function normalize(m: string): string {
  return m.toUpperCase().replace(/\s+/g, " ").trim();
}

function parseEstoqueProduto(produto: string): { modelo: string; storage: string } | null {
  const storageMatch = produto.match(/\s(\d+(?:GB|TB))$/i);
  if (!storageMatch) return null;
  const storage = storageMatch[1].toUpperCase();
  const modelo = produto.slice(0, storageMatch.index).trim();
  return { modelo, storage };
}

function findPreco(precosMap: Map<string, number>, modeloNorm: string, storage: string): number {
  // Tentar match direto
  const key = `${modeloNorm}|${storage}`;
  if (precosMap.has(key)) return precosMap.get(key)!;

  // Tentar sem storage (para produtos sem storage na tabela precos)
  const keyNoStorage = `${modeloNorm}|`;
  if (precosMap.has(keyNoStorage)) return precosMap.get(keyNoStorage)!;

  // Tentar com nome formatado (precos pode ter "iPhone 16 Pro" ao invés de "IPHONE 16 PRO")
  for (const [k, v] of precosMap) {
    const [pModelo, pStorage] = k.split("|");
    if (normalize(pModelo) === modeloNorm && pStorage === storage) return v;
  }

  return 0;
}

function formatNomeProduto(upper: string): string {
  const replacements: Record<string, string> = {
    IPHONE: "iPhone",
    IPAD: "iPad",
    MACBOOK: "MacBook",
    AIRPODS: "AirPods",
    APPLE: "Apple",
    MAC: "Mac",
    PRO: "Pro",
    MAX: "Max",
    PLUS: "Plus",
    MINI: "Mini",
    AIR: "Air",
    ULTRA: "Ultra",
    SE: "SE",
    ANC: "ANC",
    GPS: "GPS",
    "GPS+CELLULAR": "GPS + Cellular",
    "WIFI+CELLULAR": "WiFi + Cellular",
    WIFI: "WiFi",
    WATCH: "Watch",
    SERIES: "Series",
  };

  return upper
    .split(/\s+/)
    .map((word) => replacements[word] ?? word)
    .join(" ");
}

function parseStorageSize(s: string): number {
  if (!s) return 0;
  const num = parseInt(s);
  if (s.toUpperCase().includes("TB")) return num * 1024;
  return num;
}

function inferCategoria(modelo: string): string {
  const m = modelo.toLowerCase();
  if (m.includes("iphone")) return "IPHONES";
  if (m.includes("macbook")) return "MACBOOK";
  if (m.includes("mac mini") || m.includes("macmini")) return "MAC_MINI";
  if (m.includes("ipad")) return "IPADS";
  if (m.includes("airpods")) return "AIRPODS";
  if (m.includes("apple watch") || m.includes("watch")) return "APPLE_WATCH";
  return "ACESSORIOS";
}

const FALLBACK: LojaProduct[] = [
  { id: "iphone-16-pro-max-256gb", modelo: "iPhone 16 Pro Max", armazenamento: "256GB", categoria: "IPHONES", precoPix: 8897, cores: [], emEstoque: true, qtdEstoque: 0 },
  { id: "iphone-16-pro-max-512gb", modelo: "iPhone 16 Pro Max", armazenamento: "512GB", categoria: "IPHONES", precoPix: 10797, cores: [], emEstoque: true, qtdEstoque: 0 },
  { id: "iphone-16-pro-max-1tb", modelo: "iPhone 16 Pro Max", armazenamento: "1TB", categoria: "IPHONES", precoPix: 11997, cores: [], emEstoque: true, qtdEstoque: 0 },
  { id: "iphone-16-128gb", modelo: "iPhone 16", armazenamento: "128GB", categoria: "IPHONES", precoPix: 4697, cores: [], emEstoque: true, qtdEstoque: 0 },
  { id: "iphone-16-256gb", modelo: "iPhone 16", armazenamento: "256GB", categoria: "IPHONES", precoPix: 5797, cores: [], emEstoque: true, qtdEstoque: 0 },
];
