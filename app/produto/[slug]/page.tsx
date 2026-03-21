"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getTema, temaCSSVars } from "@/lib/temas";

/* ── Types ── */

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

interface LojaConfig {
  banner_titulo: string;
  banner_subtitulo: string;
  banner_image_url: string | null;
  accent_color: string;
  whatsapp_numero: string;
  manutencao?: boolean;
  tema?: string;
}

/* ── Helpers ── */

function formatBRL(value: number): string {
  if (!value) return "Consulte";
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function formatBRLDecimal(value: number): string {
  if (!value) return "Consulte";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const [selectedVariacao, setSelectedVariacao] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState(1);

  const tema = useMemo(() => getTema(config.tema), [config.tema]);
  const cssVars = useMemo(() => temaCSSVars(tema), [tema]);
  // WhatsApp contact removed from showcase — display only

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
    return produtos.find((p) => p.slug === slug) || null;
  }, [produtos, slug]);

  /* ── Auto-select first variacao when product loads ── */
  useEffect(() => {
    if (produto && produto.variacoes.length > 0 && !selectedVariacao) {
      setSelectedVariacao(produto.variacoes[0].id);
    }
  }, [produto, selectedVariacao]);

  /* ── Current variacao ── */
  const currentVariacao = useMemo(() => {
    if (!produto || !selectedVariacao) return null;
    return produto.variacoes.find((v) => v.id === selectedVariacao) || null;
  }, [produto, selectedVariacao]);

  /* ── Grouped attributes for selectors ── */
  const attributeGroups = useMemo(() => {
    if (!produto) return {};
    const groups: Record<string, string[]> = {};
    for (const v of produto.variacoes) {
      for (const [key, value] of Object.entries(v.atributos || {})) {
        if (!groups[key]) groups[key] = [];
        if (!groups[key].includes(value)) groups[key].push(value);
      }
    }
    return groups;
  }, [produto]);

  /* ── Prices ── */
  const preco = currentVariacao ? Number(currentVariacao.preco) : 0;
  const total12 = preco * 1.13;
  const parcela12 = Math.round(total12 / 12);
  const total18 = preco * 1.20;
  const parcela18 = Math.round(total18 / 18);

  /* ── Current image (variacao image or product image) ── */
  const currentImage = currentVariacao?.imagem || produto?.imagem || null;

  // WhatsApp purchase flow removed — showcase is display only

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
          <p className="mt-4 text-[17px] font-medium">Produto nao encontrado</p>
          <p className="mt-1 text-[15px]" style={{ color: tema.textMuted }}>O produto pode ter sido removido ou o link esta incorreto</p>
          <Link href="/" style={{ backgroundColor: tema.accent }} className="inline-block mt-6 px-6 py-2.5 rounded-full text-white text-[14px] font-semibold transition-colors">Voltar para a loja</Link>
        </div>
      </div>
    );
  }

  const emoji = produto.categoriaEmoji || "📦";

  return (
    <div style={{ backgroundColor: tema.bg, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh">
      {/* ── Header ── */}
      <header style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sticky top-0 z-50 backdrop-blur-xl border-b">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🐯</span>
            <span className="text-[17px] font-bold tracking-tight">TigraoImports</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/troca" style={{ backgroundColor: tema.bgSecondary, color: tema.text }} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors">🔄 Simular Troca</Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 py-6">
        {/* ── Breadcrumb ── */}
        <nav className="flex items-center gap-1.5 text-[13px] mb-6" style={{ color: tema.textMuted }}>
          <Link href="/" className="transition-colors" style={{ color: tema.textMuted }}>Home</Link>
          <span>/</span>
          <Link href={`/?cat=${produto.categoria}`} className="transition-colors" style={{ color: tema.textMuted }}>{produto.categoriaLabel}</Link>
          <span>/</span>
          <span className="font-medium truncate" style={{ color: tema.text }}>{produto.nome}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* ── Left: Product Image ── */}
          <div className="aspect-square rounded-3xl flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(to bottom right, ${tema.bgSecondary}, ${tema.cardBorder})` }}>
            {currentImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentImage} alt={produto.nome} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[120px] sm:text-[160px] opacity-80">{emoji}</span>
            )}
          </div>

          {/* ── Right: Product Info ── */}
          <div className="flex flex-col">
            <h1 className="text-[24px] sm:text-[28px] font-bold leading-tight">{produto.nome}</h1>

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
                    <p className="text-[13px]" style={{ color: tema.textMuted }}>ou 18x de {formatBRL(parcela18)}</p>
                  )}
                </>
              ) : (
                <p className="text-[20px] font-semibold" style={{ color: tema.accent }}>Consulte o preco</p>
              )}
            </div>

            {/* Description */}
            {produto.descricao && produto.descricao !== "Novo | Lacrado | 1 ano de garantia Apple | Nota Fiscal" && (
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: tema.textMuted }}>{produto.descricao}</p>
            )}

            {/* Tags */}
            <div className="mt-4 flex flex-wrap gap-2">
              {produto.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ backgroundColor: tema.bgSecondary, color: tema.textMuted }}>
                  {tag}
                </span>
              ))}
            </div>

            {/* Variacao selector — group by attribute */}
            {Object.keys(attributeGroups).length > 0 && produto.variacoes.length > 1 && (
              <>
                {Object.entries(attributeGroups).map(([attrKey, values]) => (
                  <div key={attrKey} className="mt-5">
                    <p className="text-[13px] font-semibold mb-2 capitalize">{attrKey}</p>
                    <div className="flex flex-wrap gap-2">
                      {values.map((val) => {
                        // Find if current variacao has this attribute value
                        const isActive = currentVariacao?.atributos?.[attrKey] === val;
                        // Find a variacao with this attribute value
                        const matchVariacao = produto.variacoes.find((v) => v.atributos?.[attrKey] === val);

                        return (
                          <button
                            key={val}
                            onClick={() => {
                              if (matchVariacao) {
                                setSelectedVariacao(matchVariacao.id);
                                setQuantidade(1);
                              }
                            }}
                            style={isActive
                              ? { borderColor: tema.accent, backgroundColor: tema.accentLight, color: tema.accent }
                              : { borderColor: tema.cardBorder, backgroundColor: tema.cardBg, color: tema.text }
                            }
                            className="px-4 py-2.5 rounded-xl text-[14px] font-medium border transition-all min-w-[80px]"
                          >
                            <span className="block">{val}</span>
                            {matchVariacao && Number(matchVariacao.preco) > 0 && (
                              <span className="block text-[11px] mt-0.5" style={{ color: tema.textMuted }}>{formatBRL(Number(matchVariacao.preco))}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Single variacao or flat list */}
            {produto.variacoes.length > 1 && Object.keys(attributeGroups).length === 0 && (
              <div className="mt-5">
                <p className="text-[13px] font-semibold mb-2">Opcoes</p>
                <div className="flex flex-wrap gap-2">
                  {produto.variacoes.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => { setSelectedVariacao(v.id); setQuantidade(1); }}
                      style={selectedVariacao === v.id
                        ? { borderColor: tema.accent, backgroundColor: tema.accentLight, color: tema.accent }
                        : { borderColor: tema.cardBorder, backgroundColor: tema.cardBg, color: tema.text }
                      }
                      className="px-4 py-2.5 rounded-xl text-[14px] font-medium border transition-all"
                    >
                      <span className="block">{v.nome}</span>
                      {Number(v.preco) > 0 && <span className="block text-[11px] mt-0.5" style={{ color: tema.textMuted }}>{formatBRL(Number(v.preco))}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity */}
            <div className="mt-5">
              <p className="text-[13px] font-semibold mb-2">Quantidade</p>
              <div className="inline-flex items-center border rounded-xl overflow-hidden" style={{ borderColor: tema.cardBorder }}>
                <button onClick={() => setQuantidade(Math.max(1, quantidade - 1))} className="w-11 h-11 flex items-center justify-center text-[18px] transition-colors" disabled={quantidade <= 1}>-</button>
                <span className="w-12 h-11 flex items-center justify-center text-[15px] font-medium border-x" style={{ borderColor: tema.cardBorder }}>{quantidade}</span>
                <button onClick={() => setQuantidade(quantidade + 1)} className="w-11 h-11 flex items-center justify-center text-[18px] transition-colors">+</button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 space-y-3">
              <Link href="/troca" style={{ backgroundColor: tema.btnComprar }} className="w-full py-3.5 rounded-2xl text-white text-[16px] font-semibold active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                🔄 Simular troca com meu usado
              </Link>
              <Link href="/" style={{ borderColor: tema.cardBorder, color: tema.textMuted }} className="w-full py-3 rounded-2xl border text-[14px] font-medium transition-colors flex items-center justify-center gap-2">
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
            <div key={item.title} className="flex items-start gap-3 p-4 rounded-2xl" style={{ backgroundColor: tema.bgSecondary }}>
              <span className="text-[24px]">{item.icon}</span>
              <div>
                <p className="text-[14px] font-semibold">{item.title}</p>
                <p className="text-[13px]" style={{ color: tema.textMuted }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer style={{ backgroundColor: tema.bgSecondary, borderColor: tema.cardBorder }} className="border-t mt-12">
        <div className="max-w-[1280px] mx-auto px-4 py-8 text-center space-y-3">
          <div className="flex items-center justify-center gap-2"><span className="text-xl">🐯</span><span className="text-[15px] font-bold">TigraoImports</span></div>
          <p className="text-[13px]" style={{ color: tema.textMuted }}>Barra da Tijuca, Rio de Janeiro</p>
          <div className="flex items-center justify-center gap-4">
            <a href="https://instagram.com/tigraoimports" target="_blank" rel="noopener noreferrer" style={{ color: tema.accent }} className="text-[13px] font-medium hover:underline">@tigraoimports</a>
          </div>
          <p className="text-[12px]" style={{ color: tema.textMuted, opacity: 0.6 }}>Produtos lacrados com garantia Apple e Nota Fiscal</p>
        </div>
      </footer>

      {/* ── Mobile sticky buy bar ── */}
      <div style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sm:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {preco > 0 ? (
              <>
                <p className="text-[17px] font-bold truncate">{formatBRL(preco)}</p>
                <p className="text-[11px]" style={{ color: tema.textMuted }}>ou 12x de {formatBRL(parcela12)}</p>
              </>
            ) : (
              <p className="text-[15px] font-semibold" style={{ color: tema.accent }}>Consulte</p>
            )}
          </div>
          <Link href="/troca" style={{ backgroundColor: tema.btnComprar }} className="px-6 py-3 rounded-2xl text-white text-[15px] font-semibold active:scale-[0.98] transition-all shrink-0">Simular Troca</Link>
        </div>
      </div>
      <div className="sm:hidden h-20" />
    </div>
  );
}
