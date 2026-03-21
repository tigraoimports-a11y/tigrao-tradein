"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

/* ── Types (matching /api/loja?format=grouped) ── */

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
  destaque?: boolean;
  ordem?: number;
}

interface LojaConfig {
  banner_titulo: string;
  banner_subtitulo: string;
  banner_image_url: string | null;
  accent_color: string;
  whatsapp_numero: string;
  manutencao?: boolean;
}

interface LojaResponse {
  produtos: ProdutoLoja[];
  categorias: string[];
  config?: LojaConfig;
}

/* ── Category config ── */

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  IPHONES: { label: "iPhone", emoji: "📱" },
  MACBOOK: { label: "MacBook", emoji: "💻" },
  MAC_MINI: { label: "Mac Mini", emoji: "🖥️" },
  IPADS: { label: "iPad", emoji: "📲" },
  APPLE_WATCH: { label: "Apple Watch", emoji: "⌚" },
  AIRPODS: { label: "AirPods", emoji: "🎧" },
  ACESSORIOS: { label: "Acessorios", emoji: "🔌" },
  IMAC: { label: "iMac", emoji: "🖥️" },
};

/* ── Helpers ── */

function formatBRL(value: number): string {
  if (!value) return "Consulte";
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function productSlug(produto: ProdutoLoja): string {
  return produto.nome
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function getMinPreco(produto: ProdutoLoja): number {
  const precos = produto.storages.map((s) => s.preco).filter((p) => p > 0);
  return precos.length > 0 ? Math.min(...precos) : 0;
}

function hasStock(produto: ProdutoLoja): boolean {
  return produto.storages.some((s) => s.em_estoque);
}

function getCategoryEmoji(categoria: string): string {
  return CATEGORY_META[categoria]?.emoji || "📦";
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
  const [categorias, setCategorias] = useState<string[]>([]);
  const [config, setConfig] = useState<LojaConfig>({
    banner_titulo: "Produtos Apple Originais",
    banner_subtitulo: "Nota fiscal no seu nome | Lacrados | 1 ano garantia Apple",
    banner_image_url: null,
    accent_color: "#E8740E",
    whatsapp_numero: "5521999999999",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeCategory, setActiveCategory] = useState("TODOS");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

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
          p.storages.some((s) => s.storage.toLowerCase().includes(q))
      );
    }
    return list;
  }, [produtos, activeCategory, searchQuery]);

  /* ── Category tabs ── */
  const categoryTabs = useMemo(() => {
    const tabs = [{ key: "TODOS", label: "Todos", emoji: "🛍️" }];
    for (const cat of categorias) {
      const meta = CATEGORY_META[cat];
      if (meta) tabs.push({ key: cat, label: meta.label, emoji: meta.emoji });
    }
    return tabs;
  }, [categorias]);

  /* ── Modo Manutenção ── */
  if (!loading && config.manutencao) {
    return (
      <div className="min-h-dvh bg-[#F5F5F7] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-8xl mb-6">🔧</div>
          <h1 className="text-2xl font-bold text-[#1D1D1F] mb-3">Estamos realizando melhorias</h1>
          <p className="text-[#86868B] text-base mb-8">
            Nosso site está em manutenção para ficar ainda melhor. Voltaremos em breve!
          </p>
          <div className="flex flex-col gap-3">
            <a
              href={whatsappUrl}
              target="_blank"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#25D366] text-white font-semibold hover:bg-[#20BD5A] transition-colors"
            >
              💬 Fale conosco no WhatsApp
            </a>
            <Link
              href="/troca"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#D06A0D] transition-colors"
            >
              🔄 Simulador de Troca
            </Link>
          </div>
          <p className="text-xs text-[#C7C7CC] mt-8">TigrãoImports — Barra da Tijuca, RJ 🐯</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-white">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#E8E8ED]">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🐯</span>
            <span className="text-[17px] font-bold text-[#1D1D1F] tracking-tight">
              TigraoImports
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 rounded-full hover:bg-[#F5F5F7] transition-colors text-[#86868B]"
              aria-label="Buscar"
            >
              <SearchIcon />
            </button>
            <Link
              href="/troca"
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#F5F5F7] text-[13px] font-medium text-[#1D1D1F] hover:bg-[#E8E8ED] transition-colors"
            >
              🔄 Simular Troca
            </Link>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full hover:bg-[#F5F5F7] transition-colors"
              aria-label="WhatsApp"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          </div>
        </div>

        {/* Search bar */}
        {showSearch && (
          <div className="px-4 pb-3 animate-fadeIn">
            <div className="max-w-[1280px] mx-auto">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-[#86868B]" />
                <input
                  type="text"
                  placeholder="Buscar produtos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#F5F5F7] text-[15px] text-[#1D1D1F] placeholder:text-[#86868B] outline-none focus:ring-2 focus:ring-[#E8740E]/30 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#1D1D1F] text-sm font-medium"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#1D1D1F] to-[#0A0A0A] text-white">
        <div className="max-w-[1280px] mx-auto px-4 py-12 sm:py-16 text-center relative z-10">
          <h1 className="text-[28px] sm:text-[36px] font-bold tracking-tight leading-tight">
            {config.banner_titulo}
          </h1>
          <p className="mt-3 text-[15px] sm:text-[17px] text-white/70 max-w-lg mx-auto">
            {config.banner_subtitulo}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/troca"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E8740E] text-white text-[14px] font-semibold hover:bg-[#D06A0D] transition-colors"
            >
              🔄 Simular Troca
            </Link>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 text-white text-[14px] font-semibold hover:bg-white/20 transition-colors"
            >
              💬 Fale Conosco
            </a>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-[#E8740E]/10 blur-[100px] -translate-y-1/2 translate-x-1/2" />
      </section>

      {/* ── Categories ── */}
      <nav className="border-b border-[#E8E8ED] bg-white sticky top-14 z-40">
        <div className="max-w-[1280px] mx-auto">
          <div className="flex overflow-x-auto gap-1 px-4 py-3" style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}>
            {categoryTabs.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium whitespace-nowrap transition-all shrink-0 ${
                  activeCategory === cat.key
                    ? "bg-[#1D1D1F] text-white shadow-sm"
                    : "bg-[#F5F5F7] text-[#6E6E73] hover:bg-[#E8E8ED]"
                }`}
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
          <h2 className="text-[20px] sm:text-[24px] font-bold text-[#1D1D1F] mb-4">
            Destaques
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {destaques.map((produto) => (
              <ProductCard key={`destaque-${produto.id}`} produto={produto} />
            ))}
          </div>
        </section>
      )}

      {/* ── Products Grid ── */}
      <main className="max-w-[1280px] mx-auto px-4 py-8">
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-[3px] border-[#E8E8ED] border-t-[#E8740E] rounded-full animate-spin" />
            <p className="mt-4 text-[15px] text-[#86868B]">Carregando produtos...</p>
          </div>
        )}

        {error && !loading && (
          <div className="text-center py-20">
            <p className="text-[48px]">😿</p>
            <p className="mt-4 text-[17px] text-[#1D1D1F] font-medium">
              Erro ao carregar produtos
            </p>
            <p className="mt-1 text-[15px] text-[#86868B]">
              Tente novamente em alguns instantes
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-5 py-2 rounded-full bg-[#E8740E] text-white text-[14px] font-medium hover:bg-[#D06A0D] transition-colors"
            >
              Recarregar
            </button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-[48px]">🔍</p>
            <p className="mt-4 text-[17px] text-[#1D1D1F] font-medium">
              Nenhum produto encontrado
            </p>
            <p className="mt-1 text-[15px] text-[#86868B]">
              Tente outra categoria ou busca
            </p>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((produto) => (
              <ProductCard key={produto.id} produto={produto} />
            ))}
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="bg-[#F5F5F7] border-t border-[#E8E8ED]">
        <div className="max-w-[1280px] mx-auto px-4 py-10">
          {/* Trade-in CTA */}
          <div className="text-center mb-8 p-6 rounded-2xl bg-gradient-to-r from-[#E8740E]/10 to-[#F5A623]/10 border border-[#E8740E]/20">
            <p className="text-[17px] font-semibold text-[#1D1D1F]">
              Tem um iPhone usado? Simule sua troca!
            </p>
            <p className="mt-1 text-[14px] text-[#86868B]">
              Descubra quanto vale seu aparelho na troca por um novo
            </p>
            <Link
              href="/troca"
              className="inline-flex items-center gap-2 mt-4 px-6 py-2.5 rounded-full bg-[#E8740E] text-white text-[14px] font-semibold hover:bg-[#D06A0D] transition-colors"
            >
              🔄 Simular Troca
            </Link>
          </div>

          <div className="text-center space-y-3">
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl">🐯</span>
              <span className="text-[15px] font-bold text-[#1D1D1F]">TigraoImports</span>
            </div>
            <p className="text-[13px] text-[#86868B]">
              Barra da Tijuca, Rio de Janeiro
            </p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="https://instagram.com/tigraoimports"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[#E8740E] font-medium hover:underline"
              >
                @tigraoimports
              </a>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-[#25D366] font-medium hover:underline"
              >
                WhatsApp
              </a>
            </div>
            <p className="text-[13px] text-[#86868B]">
              📦 Frete gratis em pedidos acima de R$ 1.500
            </p>
            <p className="text-[12px] text-[#AEAEB2] mt-4">
              Produtos lacrados com garantia Apple e Nota Fiscal
            </p>
          </div>
        </div>
      </footer>

      {/* ── Mobile bottom bar ── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-[#E8E8ED] px-4 py-2 flex items-center justify-around">
        <Link href="/" className="flex flex-col items-center gap-0.5 text-[#E8740E]">
          <span className="text-[20px]">🛍️</span>
          <span className="text-[10px] font-medium">Loja</span>
        </Link>
        <Link href="/troca" className="flex flex-col items-center gap-0.5 text-[#86868B]">
          <span className="text-[20px]">🔄</span>
          <span className="text-[10px] font-medium">Troca</span>
        </Link>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-0.5 text-[#86868B]"
        >
          <span className="text-[20px]">💬</span>
          <span className="text-[10px] font-medium">WhatsApp</span>
        </a>
      </div>
      <div className="sm:hidden h-16" />
    </div>
  );
}

/* ══════════════════════════════════════════════ */
/* ── Product Card                             ── */
/* ══════════════════════════════════════════════ */

function ProductCard({ produto }: { produto: ProdutoLoja }) {
  const minPreco = getMinPreco(produto);
  const parcela12 = minPreco > 0 ? Math.round((minPreco * 1.14) / 12) : 0;
  const slug = productSlug(produto);
  const inStock = hasStock(produto);
  const storageLabels = produto.storages
    .filter((s) => s.storage)
    .map((s) => s.storage);

  return (
    <Link
      href={`/produto/${slug}`}
      className="group block bg-white rounded-2xl border border-[#E8E8ED] overflow-hidden hover:shadow-lg hover:border-[#D2D2D7] transition-all duration-200"
    >
      {/* Image / placeholder */}
      <div className="relative aspect-square bg-gradient-to-br from-[#F5F5F7] to-[#E8E8ED] flex items-center justify-center overflow-hidden">
        {produto.imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={produto.imagem}
            alt={produto.nome}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <span className="text-[56px] sm:text-[64px] opacity-80 group-hover:scale-110 transition-transform duration-200">
            {getCategoryEmoji(produto.categoria)}
          </span>
        )}

        <div className="absolute top-2 right-2">
          {inStock ? (
            <span className="px-2 py-0.5 rounded-full bg-[#34C759]/10 text-[#34C759] text-[10px] font-semibold">
              Em estoque
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-[#FF3B30]/10 text-[#FF3B30] text-[10px] font-semibold">
              Esgotado
            </span>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 sm:p-4">
        <h3 className="text-[14px] sm:text-[15px] font-semibold text-[#1D1D1F] leading-tight line-clamp-2">
          {produto.nome}
        </h3>

        {storageLabels.length > 1 && (
          <p className="mt-1 text-[11px] text-[#86868B]">
            {storageLabels.join(" | ")}
          </p>
        )}

        {storageLabels.length === 1 && (
          <p className="mt-1 text-[11px] text-[#86868B]">
            {storageLabels[0]}
          </p>
        )}

        <div className="mt-2">
          {minPreco > 0 ? (
            <>
              {storageLabels.length > 1 && (
                <p className="text-[11px] text-[#86868B]">a partir de</p>
              )}
              <p className="text-[17px] sm:text-[19px] font-bold text-[#1D1D1F]">
                {formatBRL(minPreco)}
              </p>
              <p className="text-[12px] text-[#6E6E73]">
                ou 12x de {formatBRL(parcela12)}
              </p>
            </>
          ) : (
            <p className="text-[15px] font-semibold text-[#E8740E]">
              Consulte o preco
            </p>
          )}
        </div>

        <div className="mt-3">
          <span
            className={`block w-full text-center py-2 rounded-xl text-[13px] font-semibold transition-colors ${
              inStock
                ? "bg-[#34C759] text-white group-hover:bg-[#2DB84E]"
                : "bg-[#E8E8ED] text-[#86868B]"
            }`}
          >
            {inStock ? "Comprar" : "Consultar"}
          </span>
        </div>
      </div>
    </Link>
  );
}
