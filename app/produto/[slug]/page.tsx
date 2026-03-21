"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getTema, temaCSSVars } from "@/lib/temas";

/* ── Types ── */

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
  tema?: string;
}

/* ── Category emoji ── */

const CATEGORY_EMOJI: Record<string, string> = {
  IPHONES: "📱",
  MACBOOK: "💻",
  MAC_MINI: "🖥️",
  IPADS: "📲",
  APPLE_WATCH: "⌚",
  AIRPODS: "🎧",
  ACESSORIOS: "🔌",
  IMAC: "🖥️",
};

const CATEGORY_LABEL: Record<string, string> = {
  IPHONES: "iPhones",
  MACBOOK: "MacBooks",
  MAC_MINI: "Mac Mini",
  IPADS: "iPads",
  APPLE_WATCH: "Apple Watch",
  AIRPODS: "AirPods",
  ACESSORIOS: "Acessorios",
  IMAC: "iMac",
};

/* ── Helpers ── */

function formatBRL(value: number): string {
  if (!value) return "Consulte";
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function formatBRLDecimal(value: number): string {
  if (!value) return "Consulte";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function productSlug(nome: string): string {
  return nome
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/* ══════════════════════════════════════════════ */
/* ── Product Detail Page                      ── */
/* ══════════════════════════════════════════════ */

export default function ProdutoPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [produtos, setProdutos] = useState<ProdutoLoja[]>([]);
  const [config, setConfig] = useState<LojaConfig>({
    banner_titulo: "Produtos Apple Originais",
    banner_subtitulo: "",
    banner_image_url: null,
    accent_color: "#E8740E",
    whatsapp_numero: "5521999999999",
    tema: "tigrao",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [selectedStorage, setSelectedStorage] = useState<string | null>(null);
  const [selectedCor, setSelectedCor] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState(1);

  const tema = useMemo(() => getTema(config.tema), [config.tema]);
  const cssVars = useMemo(() => temaCSSVars(tema), [tema]);
  const whatsappNumber = config.whatsapp_numero || "5521999999999";

  /* ── Fetch all products and find current one ── */
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/loja?format=grouped");
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        setProdutos(data.produtos ?? []);
        if (data.config) setConfig(data.config);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* ── Find product by slug ── */
  const produto = useMemo(() => {
    return produtos.find((p) => productSlug(p.nome) === slug) || null;
  }, [produtos, slug]);

  /* ── Auto-select first storage when product loads ── */
  useEffect(() => {
    if (produto && produto.storages.length > 0 && !selectedStorage) {
      setSelectedStorage(produto.storages[0].storage);
    }
  }, [produto, selectedStorage]);

  /* ── Current storage variant ── */
  const currentVariant = useMemo(() => {
    if (!produto || selectedStorage === null) return null;
    return produto.storages.find((s) => s.storage === selectedStorage) || null;
  }, [produto, selectedStorage]);

  /* ── Auto-select first color when variant changes ── */
  useEffect(() => {
    if (currentVariant && currentVariant.cores.length > 0) {
      if (!selectedCor || !currentVariant.cores.includes(selectedCor)) {
        setSelectedCor(currentVariant.cores[0]);
      }
    } else {
      setSelectedCor(null);
    }
  }, [currentVariant, selectedCor]);

  /* ── Prices ── */
  const preco = currentVariant?.preco ?? 0;
  const total12 = preco * 1.14;
  const parcela12 = Math.round(total12 / 12);
  const total18 = preco * 1.20;
  const parcela18 = Math.round(total18 / 18);

  /* ── WhatsApp ── */
  const handleWhatsApp = useCallback(() => {
    if (!produto) return;

    const storageText = selectedStorage ? ` ${selectedStorage}` : "";
    const corText = selectedCor ? ` ${selectedCor}` : "";
    const precoText = preco > 0 ? `\n💰 ${formatBRL(preco)} a vista` : "";
    const qtyText = quantidade > 1 ? `\n📦 Quantidade: ${quantidade}` : "";

    const message = `Ola! 😊 Vi no site e quero comprar:\n\n📱 ${produto.nome}${storageText}${corText}${precoText}${qtyText}\n\nAguardo retorno!`;

    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  }, [produto, selectedStorage, selectedCor, preco, quantidade, whatsappNumber]);

  /* ── Loading / Error ── */
  if (loading) {
    return (
      <div style={{ backgroundColor: tema.bg, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-[3px] rounded-full animate-spin" style={{ borderColor: tema.cardBorder, borderTopColor: tema.accent }} />
          <p className="mt-4 text-[15px]" style={{ color: tema.textMuted }}>Carregando produto...</p>
        </div>
      </div>
    );
  }

  if (error || !produto) {
    return (
      <div style={{ backgroundColor: tema.bg, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh flex items-center justify-center">
        <div className="text-center px-4">
          <p className="text-[48px]">😿</p>
          <p className="mt-4 text-[17px] font-medium">
            Produto nao encontrado
          </p>
          <p className="mt-1 text-[15px]" style={{ color: tema.textMuted }}>
            O produto pode ter sido removido ou o link esta incorreto
          </p>
          <Link
            href="/"
            style={{ backgroundColor: tema.accent }}
            className="inline-block mt-6 px-6 py-2.5 rounded-full text-white text-[14px] font-semibold transition-colors"
          >
            Voltar para a loja
          </Link>
        </div>
      </div>
    );
  }

  const emoji = CATEGORY_EMOJI[produto.categoria] || "📦";
  const categoryLabel = CATEGORY_LABEL[produto.categoria] || produto.categoria;
  const inStock = currentVariant?.em_estoque ?? false;

  return (
    <div style={{ backgroundColor: tema.bg, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh">
      {/* ── Header ── */}
      <header style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sticky top-0 z-50 backdrop-blur-xl border-b">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🐯</span>
            <span className="text-[17px] font-bold tracking-tight">
              TigraoImports
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/troca"
              style={{ backgroundColor: tema.bgSecondary, color: tema.text }}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors"
            >
              🔄 Simular Troca
            </Link>
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-full transition-colors"
              aria-label="WhatsApp"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 py-6">
        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-1.5 text-[13px] mb-6" style={{ color: tema.textMuted }}>
          <Link href="/" className="transition-colors" style={{ color: tema.textMuted }}>
            Home
          </Link>
          <span>/</span>
          <Link
            href={`/?cat=${produto.categoria}`}
            className="transition-colors"
            style={{ color: tema.textMuted }}
          >
            {categoryLabel}
          </Link>
          <span>/</span>
          <span className="font-medium truncate" style={{ color: tema.text }}>
            {produto.nome}
          </span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* ── Left: Product Image ── */}
          <div className="aspect-square rounded-3xl flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(to bottom right, ${tema.bgSecondary}, ${tema.cardBorder})` }}>
            {produto.imagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={produto.imagem}
                alt={produto.nome}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[120px] sm:text-[160px] opacity-80">
                {emoji}
              </span>
            )}
          </div>

          {/* ── Right: Product Info ── */}
          <div className="flex flex-col">
            {/* Name */}
            <h1 className="text-[24px] sm:text-[28px] font-bold leading-tight">
              {produto.nome}
            </h1>

            {/* Price */}
            <div className="mt-4">
              {preco > 0 ? (
                <>
                  <p className="text-[28px] sm:text-[32px] font-bold">
                    {formatBRL(preco)} <span className="text-[16px] font-normal" style={{ color: tema.textMuted }}>a vista</span>
                  </p>
                  <p className="mt-1 text-[15px]" style={{ color: tema.textMuted }}>
                    ou {formatBRLDecimal(total12)} em ate 12x de {formatBRL(parcela12)}
                  </p>
                  {parcela18 > 0 && (
                    <p className="text-[13px]" style={{ color: tema.textMuted }}>
                      ou 18x de {formatBRL(parcela18)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[20px] font-semibold" style={{ color: tema.accent }}>
                  Consulte o preco via WhatsApp
                </p>
              )}
            </div>

            {/* Description */}
            {produto.descricao && produto.descricao !== "Novo | Lacrado | 1 ano de garantia Apple | Nota Fiscal" && (
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: tema.textMuted }}>
                {produto.descricao}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { icon: "📦", text: "Novo" },
                { icon: "🔒", text: "Lacrado" },
                { icon: "🛡️", text: "1 ano de garantia" },
                { icon: "🧾", text: "Nota Fiscal" },
              ].map((tag) => (
                <span
                  key={tag.text}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium"
                  style={{ backgroundColor: tema.bgSecondary, color: tema.textMuted }}
                >
                  {tag.icon} {tag.text}
                </span>
              ))}
            </div>

            {/* Storage selector */}
            {produto.storages.length > 1 && (
              <div className="mt-6">
                <p className="text-[13px] font-semibold mb-2">
                  Armazenamento
                </p>
                <div className="flex flex-wrap gap-2">
                  {produto.storages.map((s) => (
                    <button
                      key={s.storage}
                      onClick={() => {
                        setSelectedStorage(s.storage);
                        setQuantidade(1);
                      }}
                      style={
                        selectedStorage === s.storage
                          ? { borderColor: tema.accent, backgroundColor: tema.accentLight, color: tema.accent }
                          : { borderColor: tema.cardBorder, backgroundColor: tema.cardBg, color: tema.text }
                      }
                      className="px-4 py-2.5 rounded-xl text-[14px] font-medium border transition-all min-w-[80px]"
                    >
                      <span className="block">{s.storage || "Unico"}</span>
                      {s.preco > 0 && (
                        <span className="block text-[11px] mt-0.5" style={{ color: tema.textMuted }}>
                          {formatBRL(s.preco)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Color selector */}
            {currentVariant && currentVariant.cores.length > 0 && (
              <div className="mt-5">
                <p className="text-[13px] font-semibold mb-2">
                  Cor{selectedCor ? `: ${selectedCor}` : ""}
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentVariant.cores.map((cor) => (
                    <button
                      key={cor}
                      onClick={() => setSelectedCor(cor)}
                      title={cor}
                      style={
                        selectedCor === cor
                          ? { borderColor: tema.accent, backgroundColor: tema.accentLight, color: tema.accent }
                          : { borderColor: tema.cardBorder, backgroundColor: tema.cardBg, color: tema.text }
                      }
                      className="px-4 py-2 rounded-xl text-[13px] font-medium border transition-all"
                    >
                      {cor}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mt-5">
              <p className="text-[13px] font-semibold mb-2">
                Quantidade
              </p>
              <div className="inline-flex items-center border rounded-xl overflow-hidden" style={{ borderColor: tema.cardBorder }}>
                <button
                  onClick={() => setQuantidade(Math.max(1, quantidade - 1))}
                  className="w-11 h-11 flex items-center justify-center text-[18px] transition-colors"
                  disabled={quantidade <= 1}
                >
                  -
                </button>
                <span className="w-12 h-11 flex items-center justify-center text-[15px] font-medium border-x" style={{ borderColor: tema.cardBorder }}>
                  {quantidade}
                </span>
                <button
                  onClick={() => setQuantidade(quantidade + 1)}
                  className="w-11 h-11 flex items-center justify-center text-[18px] transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Stock badge */}
            <div className="mt-4">
              {inStock ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#34C759]/10 text-[#34C759] text-[13px] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#34C759]" />
                  Em estoque
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF9500]/10 text-[#FF9500] text-[13px] font-medium">
                  <span className="w-2 h-2 rounded-full bg-[#FF9500]" />
                  Sob encomenda
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div className="mt-6 space-y-3">
              <button
                onClick={handleWhatsApp}
                style={{ backgroundColor: tema.btnComprar }}
                className="w-full py-3.5 rounded-2xl text-white text-[16px] font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                Quero esse! 💬
              </button>

              <Link
                href="/troca"
                style={{ borderColor: tema.accent, color: tema.accent }}
                className="w-full py-3 rounded-2xl border text-[14px] font-semibold transition-colors flex items-center justify-center gap-2"
              >
                🔄 Simular troca com meu usado
              </Link>

              <Link
                href="/"
                style={{ borderColor: tema.cardBorder, color: tema.textMuted }}
                className="w-full py-3 rounded-2xl border text-[14px] font-medium transition-colors flex items-center justify-center gap-2"
              >
                ← Voltar para a loja
              </Link>
            </div>
          </div>
        </div>

        {/* ── Additional Info ── */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: "🚚", title: "Entrega rapida", desc: "Frete gratis acima de R$ 1.500" },
            { icon: "🔒", title: "Compra segura", desc: "Produto lacrado de fabrica" },
            { icon: "🛡️", title: "Garantia Apple", desc: "1 ano de garantia oficial" },
          ].map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 p-4 rounded-2xl"
              style={{ backgroundColor: tema.bgSecondary }}
            >
              <span className="text-[24px]">{item.icon}</span>
              <div>
                <p className="text-[14px] font-semibold">
                  {item.title}
                </p>
                <p className="text-[13px]" style={{ color: tema.textMuted }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: tema.bgSecondary, borderColor: tema.cardBorder }} className="border-t mt-12">
        <div className="max-w-[1280px] mx-auto px-4 py-8 text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xl">🐯</span>
            <span className="text-[15px] font-bold">TigraoImports</span>
          </div>
          <p className="text-[13px]" style={{ color: tema.textMuted }}>
            Barra da Tijuca, Rio de Janeiro
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="https://instagram.com/tigraoimports"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: tema.accent }}
              className="text-[13px] font-medium hover:underline"
            >
              @tigraoimports
            </a>
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] text-[#25D366] font-medium hover:underline"
            >
              WhatsApp
            </a>
          </div>
          <p className="text-[12px]" style={{ color: tema.textMuted, opacity: 0.6 }}>
            Produtos lacrados com garantia Apple e Nota Fiscal
          </p>
        </div>
      </footer>

      {/* ── Mobile sticky buy bar ── */}
      <div style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sm:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {preco > 0 ? (
              <>
                <p className="text-[17px] font-bold truncate">
                  {formatBRL(preco)}
                </p>
                <p className="text-[11px]" style={{ color: tema.textMuted }}>
                  ou 12x de {formatBRL(parcela12)}
                </p>
              </>
            ) : (
              <p className="text-[15px] font-semibold" style={{ color: tema.accent }}>Consulte</p>
            )}
          </div>
          <button
            onClick={handleWhatsApp}
            style={{ backgroundColor: tema.btnComprar }}
            className="px-6 py-3 rounded-2xl text-white text-[15px] font-semibold active:scale-[0.98] transition-all shrink-0"
          >
            Comprar
          </button>
        </div>
      </div>
      <div className="sm:hidden h-20" />
    </div>
  );
}
