"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { getTema, temaCSSVars } from "@/lib/temas";
import type { Tema } from "@/lib/temas";

/* ── Types (matching new /api/loja) ── */

interface VariacaoLoja {
  id: string;
  nome: string;
  preco: number;
  preco_parcelado: number | null;
  atributos: Record<string, string>;
  imagem: string | null;
}

interface ProdutoLoja {
  id: string;
  nome: string;
  slug: string;
  categoria: string;
  categoriaLabel: string;
  categoriaEmoji?: string;
  descricao: string;
  descricao_curta?: string | null;
  imagem: string | null;
  destaque: boolean;
  tags: string[];
  variacoes: VariacaoLoja[];
}

interface CategoriaLoja {
  slug: string;
  nome: string;
  emoji: string;
}

interface LojaConfig {
  banner_titulo: string;
  banner_subtitulo: string;
  banner_image_url: string | null;
  accent_color: string;
  whatsapp_numero: string;
  manutencao?: boolean;
  tema?: string;
}

interface LojaResponse {
  produtos: ProdutoLoja[];
  categorias: CategoriaLoja[];
  config?: LojaConfig;
}

/* ── Helpers ── */

function formatBRL(value: number): string {
  if (!value) return "Consulte";
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function getMinPreco(produto: ProdutoLoja): number {
  const precos = produto.variacoes.map((v) => v.preco).filter((p) => p > 0);
  return precos.length > 0 ? Math.min(...precos) : 0;
}

/* ── Search Icon SVG ── */

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.5 17.5L13.875 13.875M15.8333 9.16667C15.8333 12.8486 12.8486 15.8333 9.16667 15.8333C5.48477 15.8333 2.5 12.8486 2.5 9.16667C2.5 5.48477 5.48477 2.5 9.16667 2.5C12.8486 2.5 15.8333 5.48477 15.8333 9.16667Z" stroke="currentColor" strokeWidth="1.67" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

/* ══════════════════════════════════════════════ */
/* ── Main Page Component                     ── */
/* ══════════════════════════════════════════════ */

export default function LojaPage() {
  const [produtos, setProdutos] = useState<ProdutoLoja[]>([]);
  const [categorias, setCategorias] = useState<CategoriaLoja[]>([]);
  const [config, setConfig] = useState<LojaConfig>({
    banner_titulo: "Produtos Apple Originais",
    banner_subtitulo: "Nota fiscal no seu nome | Lacrados | 1 ano garantia Apple",
    banner_image_url: null,
    accent_color: "#E8740E",
    whatsapp_numero: "5521999999999",
    tema: "tigrao",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeCategory, setActiveCategory] = useState("TODOS");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const tema = useMemo(() => getTema(config.tema), [config.tema]);
  const cssVars = useMemo(() => temaCSSVars(tema), [tema]);

  const whatsappUrl = `https://wa.me/${config.whatsapp_numero}`;

  /* ── Destaques ── */
  const destaques = useMemo(() => {
    return produtos.filter((p) => p.destaque);
  }, [produtos]);

  /* ── Fetch products ── */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/loja?format=grouped");
        if (!res.ok) throw new Error("API error");
        const data: LojaResponse = await res.json();
        setProdutos(data.produtos ?? []);
        setCategorias(data.categorias ?? []);
        if (data.config) setConfig(data.config);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* ── Filter ── */
  const filtered = useMemo(() => {
    let list = produtos;
    if (activeCategory !== "TODOS") {
      list = list.filter((p) => p.categoria === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.nome.toLowerCase().includes(q) ||
          p.variacoes.some((v) => v.nome.toLowerCase().includes(q))
      );
    }
    return list;
  }, [produtos, activeCategory, searchQuery]);

  /* ── Category tabs ── */
  const categoryTabs = useMemo(() => {
    const tabs = [{ key: "TODOS", label: "Todos", emoji: "🛍️" }];
    for (const cat of categorias) {
      tabs.push({ key: cat.slug, label: cat.nome, emoji: cat.emoji });
    }
    return tabs;
  }, [categorias]);

  /* ── Modo Manutencao ── */
  if (!loading && config.manutencao) {
    return (
      <div style={{ backgroundColor: tema.bgSecondary, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-8xl mb-6">🔧</div>
          <h1 className="text-2xl font-bold mb-3">Estamos realizando melhorias</h1>
          <p style={{ color: tema.textMuted }} className="text-base mb-8">
            Nosso site esta em manutencao para ficar ainda melhor. Voltaremos em breve!
          </p>
          <div className="flex flex-col gap-3">
            <a href={whatsappUrl} target="_blank" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#25D366] text-white font-semibold hover:bg-[#20BD5A] transition-colors">
              💬 Fale conosco no WhatsApp
            </a>
            <Link href="/troca" style={{ backgroundColor: tema.accent }} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-colors">
              🔄 Simulador de Troca
            </Link>
          </div>
          <p style={{ color: tema.textMuted }} className="text-xs mt-8 opacity-60">TigraoImports — Barra da Tijuca, RJ 🐯</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: tema.bg, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh">
      {/* ── Header ── */}
      <header style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sticky top-0 z-50 backdrop-blur-xl border-b">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🐯</span>
            <span style={{ color: tema.text }} className="text-[17px] font-bold tracking-tight">TigraoImports</span>
          </Link>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowSearch(!showSearch)} style={{ color: tema.textMuted }} className="p-2 rounded-full transition-colors" aria-label="Buscar"><SearchIcon /></button>
            <Link href="/troca" style={{ backgroundColor: tema.bgSecondary, color: tema.text }} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors">🔄 Simular Troca</Link>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full transition-colors" aria-label="WhatsApp">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </a>
          </div>
        </div>
        {showSearch && (
          <div className="px-4 pb-3 animate-fadeIn">
            <div className="max-w-[1280px] mx-auto">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                <input type="text" placeholder="Buscar produtos..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus style={{ backgroundColor: tema.bgSecondary, color: tema.text }} className="w-full pl-10 pr-4 py-2.5 rounded-xl text-[15px] outline-none transition-all" />
                {searchQuery && <button onClick={() => setSearchQuery("")} style={{ color: tema.textMuted }} className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium">Limpar</button>}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(to bottom, ${tema.heroBg}, ${tema.heroBg})`, color: tema.heroText }}>
        <div className="max-w-[1280px] mx-auto px-4 py-12 sm:py-16 text-center relative z-10">
          <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight leading-tight">{config.banner_titulo}</h1>
          <p className="mt-3 text-[15px] sm:text-[17px] max-w-lg mx-auto" style={{ opacity: 0.7 }}>{config.banner_subtitulo}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/troca" style={{ backgroundColor: tema.accent }} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-[14px] font-semibold transition-colors">🔄 Simular Troca</Link>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white text-[14px] font-semibold hover:bg-white/20 transition-colors">💬 Fale Conosco</a>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" style={{ backgroundColor: tema.accent, opacity: 0.1 }} />
      </section>

      {/* ── Categories ── */}
      <nav style={{ borderColor: tema.cardBorder, backgroundColor: tema.bg }} className="border-b sticky top-14 z-40">
        <div className="max-w-[1280px] mx-auto">
          <div className="flex overflow-x-auto gap-1 px-4 py-3" style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
            {categoryTabs.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                style={activeCategory === cat.key ? { backgroundColor: tema.text, color: tema.bg } : { backgroundColor: tema.bgSecondary, color: tema.textMuted }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-all shrink-0"
              >
                <span className="text-[16px]">{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Destaques ── */}
      {!loading && !error && destaques.length > 0 && activeCategory === "TODOS" && !searchQuery && (
        <section className="max-w-[1280px] mx-auto px-4 pt-8 pb-2">
          <h2 className="text-[20px] sm:text-[24px] font-bold mb-4">Destaques</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {destaques.map((produto) => (
              <ProductCard key={`destaque-${produto.id}`} produto={produto} tema={tema} />
            ))}
          </div>
        </section>
      )}

      {/* ── Products Grid ── */}
      <main className="max-w-[1280px] mx-auto px-4 py-8">
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-[3px] rounded-full animate-spin" style={{ borderColor: tema.cardBorder, borderTopColor: tema.accent }} />
            <p className="mt-4 text-[15px]" style={{ color: tema.textMuted }}>Carregando produtos...</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-20">
            <p className="text-[48px]">😿</p>
            <p className="mt-4 text-[17px] font-medium">Erro ao carregar produtos</p>
            <p className="mt-1 text-[15px]" style={{ color: tema.textMuted }}>Tente novamente em alguns instantes</p>
            <button onClick={() => window.location.reload()} style={{ backgroundColor: tema.accent }} className="mt-4 px-5 py-2 rounded-full text-white text-[14px] font-medium transition-colors">Recarregar</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-[48px]">🔍</p>
            <p className="mt-4 text-[17px] font-medium">Nenhum produto encontrado</p>
            <p className="mt-1 text-[15px]" style={{ color: tema.textMuted }}>Tente outra categoria ou busca</p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((produto) => (
              <ProductCard key={produto.id} produto={produto} tema={tema} />
            ))}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: tema.bgSecondary, borderColor: tema.cardBorder }} className="border-t">
        <div className="max-w-[1280px] mx-auto px-4 py-10">
          <div className="text-center mb-8 p-6 rounded-2xl" style={{ background: `linear-gradient(to right, ${tema.accent}15, ${tema.accent}08)`, border: `1px solid ${tema.accent}30` }}>
            <p className="text-[17px] font-semibold">Tem um iPhone usado? Simule sua troca!</p>
            <p className="mt-1 text-[14px]" style={{ color: tema.textMuted }}>Descubra quanto vale seu aparelho na troca por um novo</p>
            <Link href="/troca" style={{ backgroundColor: tema.accent }} className="inline-flex items-center gap-2 mt-4 px-6 py-2.5 rounded-full text-white text-[14px] font-semibold transition-colors">🔄 Simular Troca</Link>
          </div>
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2"><span className="text-xl">🐯</span><span className="text-[15px] font-bold">TigraoImports</span></div>
            <p className="text-[13px]" style={{ color: tema.textMuted }}>Barra da Tijuca, Rio de Janeiro</p>
            <div className="flex items-center justify-center gap-4">
              <a href="https://instagram.com/tigraoimports" target="_blank" rel="noopener noreferrer" style={{ color: tema.accent }} className="text-[13px] font-medium hover:underline">@tigraoimports</a>
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#25D366] font-medium hover:underline">WhatsApp</a>
            </div>
            <p className="text-[13px]" style={{ color: tema.textMuted }}>📦 Frete gratis em pedidos acima de R$ 1.500</p>
            <p className="text-[12px] mt-4" style={{ color: tema.textMuted, opacity: 0.6 }}>Produtos lacrados com garantia Apple e Nota Fiscal</p>
          </div>
        </div>
      </footer>

      {/* ── Mobile bottom bar ── */}
      <div style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sm:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t px-4 py-2 flex items-center justify-around">
        <Link href="/" className="flex flex-col items-center gap-0.5" style={{ color: tema.accent }}><span className="text-[20px]">🛍️</span><span className="text-[10px] font-medium">Loja</span></Link>
        <Link href="/troca" className="flex flex-col items-center gap-0.5" style={{ color: tema.textMuted }}><span className="text-[20px]">🔄</span><span className="text-[10px] font-medium">Troca</span></Link>
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-0.5" style={{ color: tema.textMuted }}><span className="text-[20px]">💬</span><span className="text-[10px] font-medium">WhatsApp</span></a>
      </div>
      <div className="sm:hidden h-16" />
    </div>
  );
}

/* ══════════════════════════════════════════════ */
/* ── Product Card                             ── */
/* ══════════════════════════════════════════════ */

function ProductCard({ produto, tema }: { produto: ProdutoLoja; tema: Tema }) {
  const minPreco = getMinPreco(produto);
  const parcela12 = minPreco > 0 ? Math.round((minPreco * 1.13) / 12) : 0;
  const hasVariacoes = produto.variacoes.length > 0;

  // Get storage labels from variacoes
  const storageLabels = [...new Set(
    produto.variacoes
      .map((v) => v.atributos?.storage)
      .filter(Boolean) as string[]
  )];

  return (
    <Link
      href={`/produto/${produto.slug}`}
      className="group block rounded-2xl border overflow-hidden transition-all duration-200"
      style={{ backgroundColor: tema.cardBg, borderColor: tema.cardBorder }}
    >
      {/* Image / placeholder */}
      <div className="relative aspect-square flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(to bottom right, ${tema.bgSecondary}, ${tema.cardBorder})` }}>
        {produto.imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={produto.imagem} alt={produto.nome} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
        ) : (
          <span className="text-[56px] sm:text-[64px] opacity-80 group-hover:scale-110 transition-transform duration-200">
            {produto.categoriaEmoji || "📦"}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 sm:p-4">
        <h3 className="text-[14px] sm:text-[15px] font-semibold leading-tight line-clamp-2">{produto.nome}</h3>

        {storageLabels.length > 1 && (
          <p className="mt-1 text-[11px]" style={{ color: tema.textMuted }}>{storageLabels.join(" | ")}</p>
        )}
        {storageLabels.length === 1 && (
          <p className="mt-1 text-[11px]" style={{ color: tema.textMuted }}>{storageLabels[0]}</p>
        )}

        <div className="mt-2">
          {minPreco > 0 ? (
            <>
              {hasVariacoes && produto.variacoes.length > 1 && (
                <p className="text-[11px]" style={{ color: tema.textMuted }}>a partir de</p>
              )}
              <p className="text-[17px] sm:text-[19px] font-bold">{formatBRL(minPreco)}</p>
              <p className="text-[12px]" style={{ color: tema.textMuted }}>ou 12x de {formatBRL(parcela12)}</p>
            </>
          ) : (
            <p className="text-[15px] font-semibold" style={{ color: tema.accent }}>Consulte o preco</p>
          )}
        </div>

        <div className="mt-3">
          <span
            className="block w-full text-center py-2 rounded-xl text-[13px] font-semibold transition-colors"
            style={{ backgroundColor: tema.btnComprar, color: "#FFFFFF" }}
          >
            Comprar
          </span>
        </div>
      </div>
    </Link>
  );
}
