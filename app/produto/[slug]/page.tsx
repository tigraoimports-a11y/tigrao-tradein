"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getTema, temaCSSVars } from "@/lib/temas";
import { calculateQuote, getWhatsAppUrl } from "@/lib/calculations";

/* ── Types ── */

interface VariacaoLoja {
  id: string; nome: string; preco: number; preco_parcelado: number | null;
  atributos: Record<string, string>; imagem: string | null;
}

interface ProdutoLoja {
  id: string; nome: string; slug: string; categoria: string; categoriaLabel: string;
  categoriaEmoji?: string; descricao: string; descricao_curta?: string | null;
  imagem: string | null; destaque: boolean; tags: string[]; variacoes: VariacaoLoja[];
}

interface LojaConfig {
  banner_titulo: string; banner_subtitulo: string; banner_image_url: string | null;
  accent_color: string; manutencao?: boolean; tema?: string;
}

/* ── Helpers ── */

function formatBRL(value: number): string {
  if (!value) return "Consulte";
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

const WHATSAPP_VENDEDOR = "5521995618747";
const BARRA_LAT = -23.0003;
const BARRA_LNG = -43.3650;
const RAIO_EXPRESSA_KM = 70;

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

type EntregaTipo = "retirada" | "combinar" | "";

// Gera próximos 7 dias úteis para agendamento
function getProximosDiasUteis(n: number): { label: string; value: string }[] {
  const dias: { label: string; value: string }[] = [];
  const hoje = new Date();
  let d = new Date(hoje);
  d.setDate(d.getDate() + 1); // começa amanhã
  const fmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  while (dias.length < n) {
    const dow = d.getDay();
    if (dow !== 0) { // exclui domingo
      dias.push({ label: fmt.format(d), value: d.toISOString().split("T")[0] });
    }
    d = new Date(d); d.setDate(d.getDate() + 1);
  }
  return dias;
}

const HORARIOS_DISPONIVEIS = [
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30",
  "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00",
];

/* ══════════════════════════════════════════════ */
/* ── Product Detail Page                      ── */
/* ══════════════════════════════════════════════ */

export default function ProdutoPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [produtos, setProdutos] = useState<ProdutoLoja[]>([]);
  const [config, setConfig] = useState<LojaConfig>({
    banner_titulo: "Produtos Apple Originais", banner_subtitulo: "",
    banner_image_url: null, accent_color: "#E8740E", tema: "tigrao",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [selectedVariacao, setSelectedVariacao] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [avisarWhatsApp, setAvisarWhatsApp] = useState("");
  const [avisarEnviado, setAvisarEnviado] = useState(false);
  const [parcelaSel, setParcelaSel] = useState("pix");

  // Entrega
  const [entrega, setEntrega] = useState<EntregaTipo>("");
  const [dataRetirada, setDataRetirada] = useState("");
  const [horarioRetirada, setHorarioRetirada] = useState("");
  const [cep, setCep] = useState("");
  const [cepInfo, setCepInfo] = useState<{ bairro: string; cidade: string; uf: string; distancia: number } | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");
  const diasUteis = useMemo(() => getProximosDiasUteis(7), []);

  // Modal nome e origem
  const [showNomeModal, setShowNomeModal] = useState(false);
  const [nomeCliente, setNomeCliente] = useState("");
  const [origemCliente, setOrigemCliente] = useState("");
  const [pendingAction, setPendingAction] = useState<"pedido" | "duvida" | "">("");

  const ORIGENS = ["Anuncio", "Story", "Direct", "WhatsApp", "Indicacao", "Ja sou cliente"];

  const tema = useMemo(() => getTema(config.tema), [config.tema]);
  const cssVars = useMemo(() => temaCSSVars(tema), [tema]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/loja?format=grouped");
        if (!res.ok) throw new Error("API error");
        const data = await res.json();
        setProdutos(data.produtos ?? []);
        if (data.config) setConfig(data.config);
      } catch { setError(true); } finally { setLoading(false); }
    }
    load();
  }, []);

  const produto = useMemo(() => produtos.find((p) => p.slug === slug) || null, [produtos, slug]);

  // Registrar visualização
  useEffect(() => {
    if (produto) {
      const viewedKey = `tigrao_viewed_${produto.slug}`;
      if (!sessionStorage.getItem(viewedKey)) {
        sessionStorage.setItem(viewedKey, "1");
        fetch("/api/views", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ produto_slug: produto.slug, produto_nome: produto.nome }) }).catch(() => {});
      }
    }
  }, [produto]);

  useEffect(() => {
    if (produto && produto.variacoes.length > 0 && !selectedVariacao) {
      setSelectedVariacao(produto.variacoes[0].id);
    }
  }, [produto, selectedVariacao]);

  const currentVariacao = useMemo(() => {
    if (!produto || !selectedVariacao) return null;
    return produto.variacoes.find((v) => v.id === selectedVariacao) || null;
  }, [produto, selectedVariacao]);

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

  const preco = currentVariacao ? Number(currentVariacao.preco) : 0;
  const quote = useMemo(() => calculateQuote(0, preco), [preco]);
  const currentImage = currentVariacao?.imagem || produto?.imagem || null;

  // Galeria: coletar todas as imagens únicas (produto + variações)
  const allImages = useMemo(() => {
    if (!produto) return [];
    const imgs: string[] = [];
    if (produto.imagem) imgs.push(produto.imagem);
    produto.variacoes.forEach(v => { if (v.imagem && !imgs.includes(v.imagem)) imgs.push(v.imagem); });
    return imgs;
  }, [produto]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const activeGalleryImage = allImages.length > 0 ? allImages[galleryIndex] || allImages[0] : currentImage;

  // CEP lookup para combinar entrega
  async function consultarCEP() {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) { setCepError("CEP invalido (8 digitos)"); return; }
    setCepLoading(true); setCepError(""); setCepInfo(null);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await res.json();
      if (data.erro) { setCepError("CEP nao encontrado"); setCepLoading(false); return; }

      // Geocoding para calcular distância
      let dist = 999;
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?postalcode=${cleanCep}&country=BR&format=json&limit=1`, {
          headers: { "User-Agent": "TigraoImports/1.0" },
        });
        const geoData = await geoRes.json();
        if (geoData.length > 0) dist = Math.round(haversine(BARRA_LAT, BARRA_LNG, parseFloat(geoData[0].lat), parseFloat(geoData[0].lon)));
      } catch { /* fallback */ }

      setCepInfo({ bairro: data.bairro || "", cidade: data.localidade, uf: data.uf, distancia: dist });
    } catch { setCepError("Erro ao consultar CEP"); } finally { setCepLoading(false); }
  }

  // Build WhatsApp message
  function buildPedidoMsg(): string {
    const corAttr = currentVariacao?.atributos?.cor || "";
    const storageAttr = currentVariacao?.atributos?.armazenamento || currentVariacao?.atributos?.storage || "";
    const varInfo = currentVariacao?.nome || "";

    let pagamentoTexto = "PIX a vista";
    if (parcelaSel !== "pix") {
      const n = parseInt(parcelaSel);
      const inst = quote.installments.find(i => i.parcelas === n);
      if (inst) pagamentoTexto = `${n}x de ${formatBRL(inst.valorParcela)} no cartao (total: ${formatBRL(inst.total)})`;
    }

    let entregaTexto = "";
    if (entrega === "retirada") {
      const diaLabel = diasUteis.find(d => d.value === dataRetirada)?.label || dataRetirada;
      entregaTexto = `Retirar no escritorio (Barra da Tijuca) — ${diaLabel} as ${horarioRetirada}`;
    } else if (entrega === "combinar") {
      const localInfo = cepInfo ? `${cepInfo.bairro ? cepInfo.bairro + ", " : ""}${cepInfo.cidade}/${cepInfo.uf} (${cepInfo.distancia} km)` : "";
      entregaTexto = `Combinar entrega em shopping proximo — ${localInfo}`;
    }

    const pedidoId = `TG-${new Date().toISOString().slice(0,10).replace(/-/g, "")}-${String(Math.floor(Math.random()*900)+100)}`;
    const pixValor = formatBRL(preco * quantidade);
    const parceladoInfo = parcelaSel !== "pix" ? pagamentoTexto : "";

    return `Ola! Vi no site da TigraoImports e quero garantir meu pedido! 🐯

*👤 Nome:* ${nomeCliente}
${origemCliente ? `*📲 Como nos conheceu:* ${origemCliente}` : ""}

————————————————————
📋 *PEDIDO ${pedidoId} — TigraoImports*
————————————————————

📱 *Produto:* ${produto?.nome}
${corAttr ? `🎨 *Cor:* ${corAttr}` : ""}
${storageAttr ? `💾 *Armazenamento:* ${storageAttr}` : ""}
${quantidade > 1 ? `*Quantidade:* ${quantidade}` : ""}
🔒 Lacrado | Garantia Apple 1 ano | NF no nome

————————————————————

💰 *Preco PIX:* ${pixValor}
${parceladoInfo ? `💳 *Parcelado:* ${parceladoInfo}` : `💳 *Forma:* PIX a vista`}

📍 *Entrega:* ${entregaTexto}

————————————————————
⏱ _Valores validos por 24 horas_

Quero finalizar meu pedido!`.replace(/\n{3,}/g, "\n\n");
  }

  function buildDuvidaMsg(): string {
    const varInfo = currentVariacao?.nome || "";
    return `Ola! Quero tirar duvidas sobre um produto 🐯

*Produto:* ${produto?.nome}${varInfo ? ` (${varInfo})` : ""}
*Preco:* ${formatBRL(preco)}

Poderia me ajudar?`;
  }

  function handleAction(action: "pedido" | "duvida") {
    if (action === "pedido" && (!entrega || !parcelaSel)) return;
    setPendingAction(action);
    setShowNomeModal(true);
  }

  function confirmAction() {
    if (!nomeCliente.trim()) return;
    const msg = pendingAction === "pedido" ? buildPedidoMsg() : buildDuvidaMsg();
    const url = getWhatsAppUrl(WHATSAPP_VENDEDOR, msg);
    window.open(url, "_blank");
    setShowNomeModal(false);
    setPendingAction("");
  }

  /* ── Maintenance ── */
  if (!loading && config.manutencao) {
    return (
      <div style={{ backgroundColor: tema.bgSecondary, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="text-8xl mb-6">🔧</div>
          <h1 className="text-2xl font-bold mb-3">Estamos realizando melhorias</h1>
          <p style={{ color: tema.textMuted }} className="text-base mb-8">Nosso site esta em manutencao. Voltaremos em breve!</p>
          <Link href="/troca" style={{ backgroundColor: tema.accent }} className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold">🔄 Simulador de Troca</Link>
        </div>
      </div>
    );
  }

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
          <Link href="/" style={{ backgroundColor: tema.accent }} className="inline-block mt-6 px-6 py-2.5 rounded-full text-white text-[14px] font-semibold">Voltar para a loja</Link>
        </div>
      </div>
    );
  }

  const emoji = produto.categoriaEmoji || "📦";
  const retiradaCompleta = entrega === "retirada" ? (dataRetirada !== "" && horarioRetirada !== "") : true;
  const canOrder = preco > 0 && entrega !== "" && parcelaSel !== "" && retiradaCompleta;

  return (
    <div style={{ backgroundColor: tema.bg, color: tema.text, ...cssVars } as React.CSSProperties} className="min-h-dvh">
      {/* ── Header ── */}
      <header style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sticky top-0 z-50 backdrop-blur-xl border-b">
        <div className="max-w-[1280px] mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🐯</span>
            <span className="text-[17px] font-bold tracking-tight">TigraoImports</span>
          </Link>
          <Link href="/troca" style={{ backgroundColor: tema.bgSecondary, color: tema.text }} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium">🔄 Simular Troca</Link>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[13px] mb-6" style={{ color: tema.textMuted }}>
          <Link href="/" style={{ color: tema.textMuted }}>Home</Link><span>/</span>
          <Link href={`/?cat=${produto.categoria}`} style={{ color: tema.textMuted }}>{produto.categoriaLabel}</Link><span>/</span>
          <span className="font-medium truncate" style={{ color: tema.text }}>{produto.nome}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {/* Left: Image Gallery */}
          <div>
            <div className="aspect-square rounded-3xl flex items-center justify-center overflow-hidden" style={{ background: `linear-gradient(to bottom right, ${tema.bgSecondary}, ${tema.cardBorder})` }}>
              {activeGalleryImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={activeGalleryImage} alt={produto.nome} className="w-full h-full object-cover" />
              ) : (
                <span className="text-[120px] sm:text-[160px] opacity-80">{emoji}</span>
              )}
            </div>
            {/* Thumbnails */}
            {allImages.length > 1 && (
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                {allImages.map((img, i) => (
                  <button key={i} onClick={() => setGalleryIndex(i)}
                    className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all"
                    style={{ borderColor: galleryIndex === i ? tema.accent : tema.cardBorder }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Product Info + Checkout */}
          <div className="flex flex-col">
            <h1 className="text-[24px] sm:text-[28px] font-bold leading-tight">{produto.nome}</h1>

            {/* Price */}
            <div className="mt-4">
              {preco > 0 ? (
                <>
                  <p className="text-[28px] sm:text-[32px] font-bold" style={{ color: tema.accent }}>
                    {formatBRL(preco)} <span className="text-[16px] font-normal" style={{ color: tema.textMuted }}>no PIX</span>
                  </p>
                  <p className="mt-1 text-[14px]" style={{ color: tema.textMuted }}>
                    ou ate 21x de {formatBRL(quote.installments.find(i => i.parcelas === 21)?.valorParcela || 0)} no cartao
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[20px] font-semibold" style={{ color: tema.accent }}>Consulte o preco</p>
                  {!avisarEnviado ? (
                    <div className="mt-3 flex gap-2">
                      <input value={avisarWhatsApp} onChange={(e) => setAvisarWhatsApp(e.target.value)} placeholder="Seu WhatsApp"
                        className="flex-1 px-3 py-2 rounded-lg text-[13px] border" style={{ borderColor: tema.cardBorder, backgroundColor: tema.bg, color: tema.text }} />
                      <button onClick={async () => {
                        if (!avisarWhatsApp.trim()) return;
                        await fetch("/api/notificacoes", { method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ produto_slug: slug, produto_nome: produto?.nome, whatsapp: avisarWhatsApp }) });
                        setAvisarEnviado(true);
                      }} className="px-4 py-2 rounded-lg text-[12px] font-semibold text-white" style={{ backgroundColor: tema.accent }}>
                        Avise-me
                      </button>
                    </div>
                  ) : (
                    <p className="mt-2 text-[13px] text-green-600 font-medium">Pronto! Avisaremos quando disponivel.</p>
                  )}
                </>
              )}
            </div>

            {/* Tags */}
            <div className="mt-3 flex flex-wrap gap-2">
              {produto.tags.map((tag) => (
                <span key={tag} className="px-3 py-1.5 rounded-full text-[12px] font-medium" style={{ backgroundColor: tema.bgSecondary, color: tema.textMuted }}>{tag}</span>
              ))}
            </div>

            {/* Attribute selectors */}
            {Object.keys(attributeGroups).length > 0 && produto.variacoes.length > 1 && (
              <>
                {Object.entries(attributeGroups).map(([attrKey, values]) => (
                  <div key={attrKey} className="mt-5">
                    <p className="text-[13px] font-semibold mb-2 capitalize">{attrKey === "armazenamento" ? "Armazenamento" : attrKey === "cor" ? "Cor" : attrKey}</p>
                    <div className="flex flex-wrap gap-2">
                      {values.map((val) => {
                        const isActive = currentVariacao?.atributos?.[attrKey] === val;
                        const matchV = produto.variacoes.find((v) => v.atributos?.[attrKey] === val);
                        return (
                          <button key={val} onClick={() => { if (matchV) { setSelectedVariacao(matchV.id); setQuantidade(1); } }}
                            style={isActive ? { borderColor: tema.accent, backgroundColor: tema.accentLight, color: tema.accent } : { borderColor: tema.cardBorder, backgroundColor: tema.cardBg, color: tema.text }}
                            className="px-4 py-2.5 rounded-xl text-[14px] font-medium border transition-all min-w-[80px]">
                            <span className="block">{val}</span>
                            {matchV && Number(matchV.preco) > 0 && <span className="block text-[11px] mt-0.5" style={{ color: tema.textMuted }}>{formatBRL(Number(matchV.preco))}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Quantity */}
            <div className="mt-5">
              <p className="text-[13px] font-semibold mb-2">Quantidade</p>
              <div className="inline-flex items-center border rounded-xl overflow-hidden" style={{ borderColor: tema.cardBorder }}>
                <button onClick={() => setQuantidade(Math.max(1, quantidade - 1))} className="w-11 h-11 flex items-center justify-center text-[18px]" disabled={quantidade <= 1}>-</button>
                <span className="w-12 h-11 flex items-center justify-center text-[15px] font-medium border-x" style={{ borderColor: tema.cardBorder }}>{quantidade}</span>
                <button onClick={() => setQuantidade(quantidade + 1)} className="w-11 h-11 flex items-center justify-center text-[18px]">+</button>
              </div>
            </div>

            {/* ── Parcelamento ── */}
            {preco > 0 && (
              <div className="mt-5">
                <p className="text-[13px] font-semibold mb-2">Forma de pagamento</p>
                <select value={parcelaSel} onChange={(e) => setParcelaSel(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border appearance-none cursor-pointer"
                  style={{ borderColor: tema.cardBorder, backgroundColor: tema.cardBg, color: tema.text }}>
                  <option value="pix">PIX a vista — {formatBRL(preco)}</option>
                  {[3, 6, 10, 12, 18, 21].map((n) => {
                    const inst = quote.installments.find(i => i.parcelas === n);
                    return inst ? <option key={n} value={String(n)}>{n}x de {formatBRL(inst.valorParcela)} (total: {formatBRL(inst.total)})</option> : null;
                  })}
                </select>
              </div>
            )}

            {/* ── Entrega ── */}
            <div className="mt-5">
              <p className="text-[13px] font-semibold mb-2">Como deseja receber?</p>
              <div className="space-y-2">
                {/* Opção 1: Retirar no escritório */}
                <button onClick={() => setEntrega("retirada")}
                  style={entrega === "retirada" ? { borderColor: tema.accent, backgroundColor: tema.accentLight } : { borderColor: tema.cardBorder, backgroundColor: tema.cardBg }}
                  className="w-full text-left px-4 py-3 rounded-xl border transition-all">
                  <span className="text-[14px] font-medium" style={{ color: entrega === "retirada" ? tema.accent : tema.text }}>📍 Retirar no escritorio (Barra da Tijuca)</span>
                  <span className="block text-[12px] mt-0.5" style={{ color: tema.textMuted }}>Agende data e horario para retirada</span>
                </button>

                {/* Agendamento expandido */}
                {entrega === "retirada" && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: tema.accent, backgroundColor: tema.cardBg }}>
                    <div>
                      <label className="text-[12px] font-medium block mb-1" style={{ color: tema.textMuted }}>DATA</label>
                      <select value={dataRetirada} onChange={(e) => setDataRetirada(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg text-[14px] border focus:outline-none capitalize"
                        style={{ borderColor: tema.cardBorder, backgroundColor: tema.bg, color: tema.text }}>
                        <option value="">Selecione o dia...</option>
                        {diasUteis.map((d) => (
                          <option key={d.value} value={d.value} className="capitalize">{d.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[12px] font-medium block mb-1" style={{ color: tema.textMuted }}>HORARIO</label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {HORARIOS_DISPONIVEIS.map((h) => (
                          <button key={h} onClick={() => setHorarioRetirada(h)}
                            style={horarioRetirada === h ? { borderColor: tema.accent, backgroundColor: tema.accentLight, color: tema.accent } : { borderColor: tema.cardBorder, color: tema.text }}
                            className="px-2 py-2 rounded-lg border text-[13px] font-medium transition-all">
                            {h}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Opção 2: Combinar entrega em shopping */}
                <button onClick={() => { setEntrega("combinar"); setDataRetirada(""); setHorarioRetirada(""); }}
                  style={entrega === "combinar" ? { borderColor: tema.accent, backgroundColor: tema.accentLight } : { borderColor: tema.cardBorder, backgroundColor: tema.cardBg }}
                  className="w-full text-left px-4 py-3 rounded-xl border transition-all">
                  <span className="text-[14px] font-medium" style={{ color: entrega === "combinar" ? tema.accent : tema.text }}>🤝 Combinar entrega</span>
                  <span className="block text-[12px] mt-0.5" style={{ color: tema.textMuted }}>Encontro em shopping proximo a voce — combinaremos via WhatsApp</span>
                </button>

                {/* CEP expandido para combinar entrega */}
                {entrega === "combinar" && (
                  <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: tema.accent, backgroundColor: tema.cardBg }}>
                    <p className="text-[12px] font-medium" style={{ color: tema.textMuted }}>Informe seu CEP para verificarmos a regiao</p>
                    <div className="flex gap-2">
                      <input value={cep} onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="Digite seu CEP" onKeyDown={(e) => e.key === "Enter" && consultarCEP()}
                        className="flex-1 px-3 py-2.5 rounded-lg text-[14px] border focus:outline-none"
                        style={{ borderColor: tema.cardBorder, backgroundColor: tema.bg, color: tema.text }} />
                      <button onClick={consultarCEP} disabled={cepLoading}
                        className="px-4 py-2.5 rounded-lg text-[13px] font-semibold text-white"
                        style={{ backgroundColor: tema.accent }}>
                        {cepLoading ? "..." : "Consultar"}
                      </button>
                    </div>
                    {cepError && <p className="text-[12px] text-red-500">{cepError}</p>}
                    {cepInfo && (
                      <div className="rounded-lg p-3" style={{ backgroundColor: cepInfo.distancia <= RAIO_EXPRESSA_KM ? "#2ECC7115" : "#E8740E15" }}>
                        <p className="text-[13px] font-medium" style={{ color: tema.text }}>
                          📍 {cepInfo.bairro ? `${cepInfo.bairro}, ` : ""}{cepInfo.cidade}/{cepInfo.uf}
                        </p>
                        <p className="text-[12px] mt-1" style={{ color: tema.textMuted }}>
                          {cepInfo.distancia <= RAIO_EXPRESSA_KM
                            ? `✅ Dentro da area de entrega expressa (${cepInfo.distancia} km) — combinaremos um shopping proximo!`
                            : `📦 Fora da area expressa (${cepInfo.distancia} km) — podemos combinar envio`}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── 3 Action Buttons ── */}
            <div className="mt-6 space-y-3">
              <button onClick={() => handleAction("pedido")} disabled={!canOrder}
                style={{ backgroundColor: canOrder ? tema.btnComprar : tema.cardBorder }}
                className="w-full py-3.5 rounded-2xl text-white text-[16px] font-semibold active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                Concluir Pedido no WhatsApp
              </button>
              <button onClick={() => handleAction("duvida")}
                style={{ borderColor: tema.accent, color: tema.accent }}
                className="w-full py-3 rounded-2xl border text-[14px] font-medium transition-all active:scale-[0.98]">
                Tirar Duvidas no WhatsApp
              </button>
              <Link href="/troca"
                style={{ borderColor: tema.accent, color: tema.accent }}
                className="w-full py-3 rounded-2xl border text-[14px] font-medium transition-colors flex items-center justify-center gap-2">
                🔄 Simular troca com meu usado
              </Link>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: "🚚", title: "Entrega expressa", desc: "Em ate 2 horas no RJ" },
            { icon: "🔒", title: "Compra segura", desc: "Produto lacrado de fabrica" },
            { icon: "🛡️", title: "Garantia Apple", desc: "1 ano de garantia oficial" },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 p-4 rounded-2xl" style={{ backgroundColor: tema.bgSecondary }}>
              <span className="text-[24px]">{item.icon}</span>
              <div><p className="text-[14px] font-semibold">{item.title}</p><p className="text-[13px]" style={{ color: tema.textMuted }}>{item.desc}</p></div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer style={{ backgroundColor: tema.bgSecondary, borderColor: tema.cardBorder }} className="border-t mt-12">
        <div className="max-w-[1280px] mx-auto px-4 py-8 text-center space-y-3">
          <div className="flex items-center justify-center gap-2"><span className="text-xl">🐯</span><span className="text-[15px] font-bold">TigraoImports</span></div>
          <p className="text-[13px]" style={{ color: tema.textMuted }}>Barra da Tijuca, Rio de Janeiro</p>
          <a href="https://instagram.com/tigraoimports" target="_blank" rel="noopener noreferrer" style={{ color: tema.accent }} className="text-[13px] font-medium hover:underline">@tigraoimports</a>
          <p className="text-[12px]" style={{ color: tema.textMuted, opacity: 0.6 }}>Produtos lacrados com garantia Apple e Nota Fiscal</p>
        </div>
      </footer>

      {/* Mobile sticky bar */}
      <div style={{ backgroundColor: tema.headerBg, borderColor: tema.cardBorder }} className="sm:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl border-t px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            {preco > 0 ? (
              <><p className="text-[17px] font-bold truncate" style={{ color: tema.accent }}>{formatBRL(preco)}</p>
              <p className="text-[11px]" style={{ color: tema.textMuted }}>ou 21x de {formatBRL(quote.installments.find(i => i.parcelas === 21)?.valorParcela || 0)}</p></>
            ) : (
              <p className="text-[15px] font-semibold" style={{ color: tema.accent }}>Consulte</p>
            )}
          </div>
          <button onClick={() => handleAction("pedido")} disabled={!canOrder}
            style={{ backgroundColor: canOrder ? tema.btnComprar : tema.cardBorder }}
            className="px-5 py-3 rounded-2xl text-white text-[14px] font-semibold active:scale-[0.98] transition-all disabled:opacity-50 shrink-0">
            Concluir Pedido
          </button>
        </div>
      </div>
      <div className="sm:hidden h-20" />

      {/* ── Modal: Nome e Origem do Cliente ── */}
      {showNomeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowNomeModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-bold text-[#1D1D1F] mb-1">
              {pendingAction === "pedido" ? "Finalizar Pedido" : "Tirar Duvidas"}
            </h3>
            <p className="text-[13px] text-[#86868B] mb-4">Preencha para continuarmos no WhatsApp</p>
            <input value={nomeCliente} onChange={(e) => setNomeCliente(e.target.value)}
              placeholder="Nome e sobrenome" autoFocus
              className="w-full px-4 py-3 rounded-xl border border-[#D2D2D7] text-[15px] text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] mb-3" />
            <p className="text-[12px] font-semibold text-[#86868B] mb-2">COMO NOS CONHECEU?</p>
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {ORIGENS.map((o) => (
                <button key={o} onClick={() => setOrigemCliente(o)}
                  className="px-3 py-2 rounded-lg text-[12px] font-medium border transition-all"
                  style={origemCliente === o
                    ? { borderColor: "#E8740E", backgroundColor: "#FFF3E8", color: "#E8740E" }
                    : { borderColor: "#D2D2D7", color: "#86868B" }}>
                  {o}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowNomeModal(false)} className="flex-1 py-3 rounded-xl text-[14px] font-medium text-[#86868B] bg-[#F5F5F7]">Cancelar</button>
              <button onClick={confirmAction} disabled={!nomeCliente.trim()}
                className="flex-[2] py-3 rounded-xl text-[14px] font-semibold text-white bg-[#E8740E] disabled:opacity-50">
                Ir para WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
