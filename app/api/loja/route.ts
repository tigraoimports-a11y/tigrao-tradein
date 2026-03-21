import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ── Types ──

interface VariacaoRow {
  id: string;
  produto_id: string;
  nome: string;
  atributos: Record<string, string>;
  preco: number;
  preco_parcelado: number | null;
  imagem_url: string | null;
  visivel: boolean;
  ordem: number;
}

interface ProdutoRow {
  id: string;
  nome: string;
  slug: string;
  categoria_id: string;
  descricao: string | null;
  descricao_curta: string | null;
  imagem_url: string | null;
  tags: string[] | null;
  destaque: boolean;
  visivel: boolean;
  ordem: number;
}

interface CategoriaRow {
  id: string;
  nome: string;
  slug: string;
  emoji: string;
  ordem: number;
  visivel: boolean;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get("format");

  try {
    const { supabase } = await import("@/lib/supabase");

    // Fetch from new loja_* tables
    const [categoriasRes, produtosRes, variacoesRes, configRes] = await Promise.all([
      supabase
        .from("loja_categorias")
        .select("*")
        .eq("visivel", true)
        .order("ordem", { ascending: true }),
      supabase
        .from("loja_produtos")
        .select("*")
        .eq("visivel", true)
        .order("ordem", { ascending: true })
        .order("nome"),
      supabase
        .from("loja_variacoes")
        .select("*")
        .eq("visivel", true)
        .order("ordem", { ascending: true })
        .order("nome"),
      supabase
        .from("mostruario_config")
        .select("*")
        .limit(1)
        .single(),
    ]);

    const categorias = (categoriasRes.data ?? []) as CategoriaRow[];
    const produtosRaw = (produtosRes.data ?? []) as ProdutoRow[];
    const variacoes = (variacoesRes.data ?? []) as VariacaoRow[];

    // Build categoria lookup
    const categoriaMap = new Map<string, CategoriaRow>();
    for (const c of categorias) {
      categoriaMap.set(c.id, c);
    }

    // Group variacoes by produto_id
    const variacoesByProduto = new Map<string, VariacaoRow[]>();
    for (const v of variacoes) {
      const list = variacoesByProduto.get(v.produto_id) ?? [];
      list.push(v);
      variacoesByProduto.set(v.produto_id, list);
    }

    // Build produtos with variacoes
    const produtos = produtosRaw
      .filter((p) => {
        // Only include products whose category exists and is visible
        const cat = categoriaMap.get(p.categoria_id);
        return cat !== undefined;
      })
      .map((p) => {
        const cat = categoriaMap.get(p.categoria_id)!;
        const prodVariacoes = variacoesByProduto.get(p.id) ?? [];

        return {
          id: p.id,
          nome: p.nome,
          slug: p.slug,
          categoria: cat.slug,
          categoriaLabel: cat.nome,
          categoriaEmoji: cat.emoji,
          descricao: p.descricao || p.descricao_curta || "Novo | Lacrado | 1 ano de garantia Apple | Nota Fiscal",
          descricao_curta: p.descricao_curta,
          imagem: p.imagem_url,
          destaque: p.destaque,
          tags: p.tags ?? ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"],
          variacoes: prodVariacoes.map((v) => ({
            id: v.id,
            nome: v.nome,
            preco: Number(v.preco),
            preco_parcelado: v.preco_parcelado ? Number(v.preco_parcelado) : null,
            atributos: v.atributos ?? {},
            imagem: v.imagem_url,
          })),
        };
      });

    // Config defaults
    const rawConfig = configRes.data ?? {
      banner_titulo: "Produtos Apple Originais",
      banner_subtitulo: "Nota fiscal no seu nome | Lacrados | 1 ano garantia Apple",
      banner_image_url: null,
      accent_color: "#E8740E",
      whatsapp_numero: "5521999999999",
      manutencao: false,
      tema: "tigrao",
    };
    const config = { ...rawConfig, tema: (rawConfig as Record<string, unknown>).tema ?? "tigrao" };

    // ── Grouped format (new default) ──
    if (format === "grouped" || !format) {
      const categoriasOutput = categorias.map((c) => ({
        slug: c.slug,
        nome: c.nome,
        emoji: c.emoji,
      }));

      return NextResponse.json(
        { produtos, categorias: categoriasOutput, config },
        { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
      );
    }

    // ── Flat format (legacy backwards compat) — return empty ──
    return NextResponse.json([], {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Erro ao buscar produtos da loja:", error);
    return NextResponse.json(
      { produtos: [], categorias: [], config: {} },
      { headers: { "Cache-Control": "public, s-maxage=30" } }
    );
  }
}
