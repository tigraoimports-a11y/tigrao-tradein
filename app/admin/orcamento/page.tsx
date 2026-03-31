"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

// Taxas para orçamento cliente (embutir no preço parcelado)
const TAXAS_PARCELA: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
  7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
  13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
  19: 20, 20: 21, 21: 22,
};

function getTaxaOrcamento(parcelas: number): number {
  if (TAXAS_PARCELA[parcelas] !== undefined) return TAXAS_PARCELA[parcelas];
  // Interpolar
  const keys = Object.keys(TAXAS_PARCELA).map(Number).sort((a, b) => a - b);
  let lo = keys[0], hi = keys[keys.length - 1];
  for (const k of keys) { if (k <= parcelas) lo = k; if (k >= parcelas) { hi = k; break; } }
  if (lo === hi) return TAXAS_PARCELA[lo];
  const ratio = (parcelas - lo) / (hi - lo);
  return TAXAS_PARCELA[lo] + (TAXAS_PARCELA[hi] - TAXAS_PARCELA[lo]) * ratio;
}

interface Produto {
  id: string;
  modelo: string;
  armazenamento: string;
  categoria: string;
  preco_pix: number;
  status: string;
  nome: string; // computed: modelo + armazenamento
}

const CATEGORIAS_LABEL: Record<string, string> = {
  IPHONE: "📱 iPhones",
  IPAD: "📱 iPads",
  MACBOOK: "💻 MacBooks",
  MAC_MINI: "🖥️ Mac Mini",
  APPLE_WATCH: "⌚ Apple Watch",
  AIRPODS: "🎧 AirPods",
  ACESSORIOS: "🔌 Acessórios",
};

export default function OrcamentoPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);

  // Seminovos do estoque
  interface SeminovoEstoque {
    id: string;
    produto: string;
    cor: string | null;
    bateria: number | null;
    observacao: string | null;
    custo_unitario: number;
    qnt: number;
    preco_sugerido: number | null;
  }
  const [seminovosEstoque, setSeminovosEstoque] = useState<SeminovoEstoque[]>([]);
  const [semiSel, setSemiSel] = useState<SeminovoEstoque | null>(null);

  // Form
  const [tipoOrc, setTipoOrc] = useState<"lacrado" | "seminovo">("lacrado");
  const [catSel, setCatSel] = useState("");
  const [prodSel, setProdSel] = useState("");
  const [semiPreco, setSemiPreco] = useState("");
  const [semiObs, setSemiObs] = useState("");
  const [entrada, setEntrada] = useState("");
  const [parcelasSel, setParcelasSel] = useState<number[]>([12]);
  const [textoGerado, setTextoGerado] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [carrinho, setCarrinho] = useState<{ id: string; nome: string; preco: number; categoria: string }[]>([]);
  const [trocaProduto, setTrocaProduto] = useState("");
  const [trocaValor, setTrocaValor] = useState("");

  useEffect(() => {
    if (!password) return;
    (async () => {
      setLoading(true);
      try {
        const [resPrecos, resEstoque] = await Promise.all([
          fetch("/api/admin/precos", { headers: { "x-admin-password": password } }),
          fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "admin") } }),
        ]);
        if (resPrecos.ok) {
          const json = await resPrecos.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setProdutos((json.data ?? []).filter((p: any) => p.status === "ativo" && p.preco_pix > 0).map((p: any) => ({
            ...p,
            nome: `${p.modelo}${p.armazenamento ? " " + p.armazenamento : ""}`,
          })));
        }
        if (resEstoque.ok) {
          const json = await resEstoque.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setSeminovosEstoque((json.data ?? []).filter((p: any) => p.tipo === "SEMINOVO" && p.status === "EM ESTOQUE" && p.qnt > 0));
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [password, user]);

  const categorias = useMemo(() => {
    const cats = [...new Set(produtos.map(p => p.categoria))].sort();
    return cats;
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    if (!catSel) return produtos;
    return produtos.filter(p => p.categoria === catSel);
  }, [produtos, catSel]);

  const produtoSelecionado = useMemo(() => {
    return produtos.find(p => p.id === prodSel);
  }, [produtos, prodSel]);

  // Categorias de seminovos (derivar do nome do produto)
  const getSemiCategoria = (produto: string): string => {
    const p = produto.toUpperCase();
    if (p.includes("IPHONE")) return "IPHONE";
    if (p.includes("IPAD")) return "IPAD";
    if (p.includes("MACBOOK") || p.includes("MAC MINI") || p.includes("IMAC")) return "MACBOOK";
    if (p.includes("WATCH")) return "APPLE_WATCH";
    if (p.includes("AIRPODS")) return "AIRPODS";
    return "OUTROS";
  };

  const [semiCat, setSemiCat] = useState("");
  const semiCategorias = useMemo(() => {
    const cats = [...new Set(seminovosEstoque.map(s => getSemiCategoria(s.produto)))].sort();
    return cats;
  }, [seminovosEstoque]);

  const seminovosFiltrados = useMemo(() => {
    if (!semiCat) return [];
    return seminovosEstoque.filter(s => getSemiCategoria(s.produto) === semiCat);
  }, [seminovosEstoque, semiCat]);

  // Limpar nome do seminovo: remover origem (LL, BE, BR), chip info (E-SIM, Chip Físico)
  const cleanSemiNome = (nome: string): string => {
    return nome
      .replace(/\s*(LL|BE|BR)\s*\([^)]*\)/gi, "")       // LL (EUA), BE (BR), BR (BR)
      .replace(/[-–]\s*E-?SIM/gi, "")                     // - E-SIM, -E-SIM
      .replace(/[-–]\s*CHIP\s+F[ÍI]SICO\s*\+?\s*E-?SIM/gi, "") // - CHIP FÍSICO + E-SIM
      .replace(/[-–]\s*CHIP\s+F[ÍI]SICO/gi, "")          // - CHIP FÍSICO
      .replace(/\s{2,}/g, " ")                             // double spaces
      .trim();
  };

  // Extrair info relevante do obs: garantia apple
  const cleanSemiDetails = (item: SeminovoEstoque): string => {
    const parts: string[] = [];
    if (item.cor) parts.push(item.cor);
    if (item.bateria) parts.push(`🔋${item.bateria}%`);
    // Extrair garantia do obs
    if (item.observacao) {
      const obsUp = item.observacao.toUpperCase();
      if (obsUp.includes("GARANTIA APPLE") || obsUp.includes("GARANTIA AGOSTO")) {
        const match = item.observacao.match(/GARANTIA\s+(?:APPLE\s+)?(\w+)/i);
        if (match) parts.push(`Garantia ${match[1]}`);
      }
      // Condição do aparelho
      if (obsUp.includes("MARCAS")) parts.push("Marcas de uso");
      if (obsUp.includes("ARRANHA")) parts.push("Arranhões");
      if (obsUp.includes("PERFEITO") || obsUp.includes("EXCELENTE")) parts.push("Excelente estado");
    }
    return parts.join(" · ");
  };

  // Produto virtual para seminovo (usado no mesmo fluxo)
  const semiNome = semiSel ? semiSel.produto : "";
  const semiProduto = tipoOrc === "seminovo" && semiSel && parseFloat(semiPreco) > 0
    ? { id: semiSel.id, nome: semiSel.produto.toUpperCase(), preco: parseFloat(semiPreco), categoria: "IPHONE" }
    : null;

  const gerarOrcamento = () => {
    if (tipoOrc === "seminovo") {
      if (!semiProduto && carrinho.length === 0) return;
    } else {
      if (!produtoSelecionado && carrinho.length === 0) return;
    }

    // Se tem carrinho com múltiplos produtos, usar total do carrinho
    const itensOrcamento = carrinho.length > 0 ? carrinho
      : tipoOrc === "seminovo" && semiProduto ? [semiProduto]
      : produtoSelecionado ? [{ id: produtoSelecionado.id, nome: produtoSelecionado.nome, preco: produtoSelecionado.preco_pix, categoria: produtoSelecionado.categoria }]
      : [];
    const totalBruto = itensOrcamento.reduce((s, p) => s + p.preco, 0);
    const trocaVal = parseFloat(trocaValor) || 0;
    const precoPix = totalBruto - trocaVal;
    const entradaVal = parseFloat(entrada) || 0;
    const restante = precoPix - entradaVal;

    const catEmojis: Record<string, string> = { IPHONE: "📱", IPAD: "📱", MACBOOK: "💻", MAC_MINI: "🖥️", APPLE_WATCH: "⌚", AIRPODS: "🎧", ACESSORIOS: "🔌" };

    if (restante <= 0) {
      const linhasSimples = itensOrcamento.map(p => `${catEmojis[p.categoria] || "📦"} *${p.nome}*`);
      const isSemi = tipoOrc === "seminovo";
      const texto = [
        ...linhasSimples,
        ``,
        isSemi ? `📱 Seminovo — Revisado` : `📦 Novo / Lacrado`,
        isSemi ? `✅ 3 meses de garantia` : `✅ 1 ano de garantia`,
        ...(isSemi && semiObs ? [`ℹ️ ${semiObs}`] : []),
        `📄 Nota fiscal em seu nome`,
        ``,
        `💰 *R$ ${precoPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}* à vista no PIX`,
        ``,
        `⏰ Orçamento válido por 24 horas. Após esse período refaça o orçamento.`,
      ].join("\n");
      setTextoGerado(texto);
      return;
    }

    const sorted = [...parcelasSel].sort((a, b) => a - b);

    const linhas: string[] = [];
    if (itensOrcamento.length > 1) {
      linhas.push(`*ORÇAMENTO -- TigraoImports*`, ``);
      for (const p of itensOrcamento) {
        linhas.push(`${catEmojis[p.categoria] || "📦"} *${p.nome}* — R$ ${p.preco.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
      }
      linhas.push(``, `💰 *Total: R$ ${precoPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}*`, ``);
    } else {
      const emoji = catEmojis[itensOrcamento[0]?.categoria] || "📦";
      linhas.push(`${emoji} *${itensOrcamento[0]?.nome}*`, ``);
    }
    const isSemi = tipoOrc === "seminovo";
    linhas.push(
      isSemi ? `📱 Seminovo — Revisado` : `📦 Novo / Lacrado`,
      isSemi ? `✅ 3 meses de garantia` : `✅ 1 ano de garantia`,
      ...(isSemi && semiObs ? [`ℹ️ ${semiObs}`] : []),
      `📄 Nota fiscal em seu nome`,
      ``,
    );

    if (trocaProduto && trocaVal > 0) {
      linhas.push(
        `🔄 *Seu aparelho na troca:*`,
        `${trocaProduto}`,
        `Avaliação: R$ ${trocaVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        ``,
        `*Com a troca do seu produto você pagará a diferença de:*`,
        ``,
      );
    }

    if (entradaVal > 0) {
      linhas.push(`💰 R$ ${entradaVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} à vista no PIX de entrada`);
      if (sorted.length === 1) {
        const taxa = getTaxaOrcamento(sorted[0]);
        const vp = Math.ceil(restante * (1 + taxa / 100) / sorted[0]);
        linhas.push(`💳 O restante parcelado ficaria ${sorted[0]}x R$ ${vp.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} no cartão`);
      } else {
        linhas.push(`💳 O restante parcelado ficaria:`);
        for (const n of sorted) {
          const taxa = getTaxaOrcamento(n);
          const vp = Math.ceil(restante * (1 + taxa / 100) / n);
          linhas.push(`     • ${n}x de R$ ${vp.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
        }
      }
    } else {
      if (sorted.length === 1) {
        const taxa = getTaxaOrcamento(sorted[0]);
        const vp = Math.ceil(precoPix * (1 + taxa / 100) / sorted[0]);
        linhas.push(`💳 ${sorted[0]}x R$ ${vp.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} no cartão`);
      } else {
        linhas.push(`💳 Parcelado no cartão:`);
        for (const n of sorted) {
          const taxa = getTaxaOrcamento(n);
          const vp = Math.ceil(precoPix * (1 + taxa / 100) / n);
          linhas.push(`     • ${n}x de R$ ${vp.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
        }
      }
      linhas.push(`💰 Ou R$ ${precoPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} à vista no PIX`);
    }

    linhas.push(``);
    linhas.push(`⏰ Orçamento válido por 24 horas. Após esse período refaça o orçamento.`);

    setTextoGerado(linhas.join("\n"));
    setCopiado(false);
  };

  const copiar = () => {
    navigator.clipboard.writeText(textoGerado);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 3000);
  };

  // Auto gerar quando muda qualquer campo
  useEffect(() => {
    if (produtoSelecionado || carrinho.length > 0 || semiProduto) gerarOrcamento();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodSel, entrada, parcelasSel, carrinho, trocaProduto, trocaValor, tipoOrc, semiSel, semiPreco, semiObs]);

  const cardCls = `rounded-2xl border p-5 shadow-sm ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`;
  const inputCls = `w-full px-3 py-2.5 rounded-xl border text-sm ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-bold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className={`text-xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Calculadora de Orçamento</h1>
      <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Gera texto pronto pra enviar pro cliente no WhatsApp</p>

      <div className={cardCls}>
        <div className="space-y-4">
          {/* Tipo: Lacrado / Seminovo */}
          <div>
            <p className={labelCls}>Tipo</p>
            <div className="flex gap-2">
              <button onClick={() => { setTipoOrc("lacrado"); setSemiSel(null); setSemiPreco(""); setSemiObs(""); setTextoGerado(""); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tipoOrc === "lacrado" ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                📦 Lacrado
              </button>
              <button onClick={() => { setTipoOrc("seminovo"); setProdSel(""); setCatSel(""); setSemiCat(""); setSemiSel(null); setSemiPreco(""); setTextoGerado(""); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tipoOrc === "seminovo" ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                📱 Seminovo
              </button>
            </div>
          </div>

          {/* ==== LACRADO ==== */}
          {tipoOrc === "lacrado" && (
          <>
          {/* Categoria */}
          <div>
            <p className={labelCls}>Categoria</p>
            <div className="flex flex-wrap gap-2">
              {categorias.map(c => (
                <button key={c} onClick={() => { setCatSel(catSel === c ? "" : c); setProdSel(""); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${catSel === c ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                  {CATEGORIAS_LABEL[c] || c}
                </button>
              ))}
            </div>
          </div>

          {/* Produto — só mostra após selecionar categoria */}
          {catSel && (
            <div>
              <p className={labelCls}>Produto</p>
              {loading ? (
                <p className="text-sm text-[#86868B]">Carregando...</p>
              ) : (
                <select value={prodSel} onChange={e => setProdSel(e.target.value)} className={inputCls}>
                  <option value="">— Selecionar produto —</option>
                  {produtosFiltrados.map(p => (
                    <option key={p.id} value={p.id}>{p.nome} — R$ {p.preco_pix.toLocaleString("pt-BR")}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          </>
          )}

          {/* ==== SEMINOVO ==== */}
          {tipoOrc === "seminovo" && (
          <div className="space-y-4 animate-fadeIn">
            {seminovosEstoque.length === 0 ? (
              <div className={`rounded-xl p-4 text-center ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Nenhum seminovo em estoque no momento.</p>
              </div>
            ) : (
              <>
              {/* Categoria */}
              <div>
                <p className={labelCls}>Categoria</p>
                <div className="flex flex-wrap gap-2">
                  {semiCategorias.map(c => (
                    <button key={c} onClick={() => { setSemiCat(semiCat === c ? "" : c); setSemiSel(null); setSemiPreco(""); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${semiCat === c ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                      {CATEGORIAS_LABEL[c] || c} ({seminovosEstoque.filter(s => getSemiCategoria(s.produto) === c).length})
                    </button>
                  ))}
                </div>
              </div>

              {/* Produto select */}
              {semiCat && (
              <div>
                <p className={labelCls}>Produto ({seminovosFiltrados.length} disponíveis)</p>
                <select value={semiSel?.id || ""} onChange={e => {
                  const item = seminovosFiltrados.find(s => s.id === e.target.value);
                  setSemiSel(item || null);
                  setSemiPreco(item?.preco_sugerido ? String(item.preco_sugerido) : "");
                  setSemiObs(item?.observacao || "");
                }} className={inputCls}>
                  <option value="">— Selecionar seminovo —</option>
                  {seminovosFiltrados.map(item => {
                    const nome = cleanSemiNome(item.produto);
                    const details = cleanSemiDetails(item);
                    return (
                      <option key={item.id} value={item.id}>
                        {nome}{details ? ` (${details})` : ""} — Custo R$ {item.custo_unitario?.toLocaleString("pt-BR") || "—"}{item.preco_sugerido ? ` → Sugerido R$ ${item.preco_sugerido.toLocaleString("pt-BR")}` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              )}

              {/* Detalhes + Preço */}
              {semiSel && (
                <>
                <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                  <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Selecionado</p>
                  <p className={`text-sm font-bold mt-0.5 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{cleanSemiNome(semiSel.produto)}</p>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs">
                    {semiSel.cor && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Cor: {semiSel.cor}</span>}
                    {semiSel.bateria && <span className="text-green-500">🔋 {semiSel.bateria}%</span>}
                    {cleanSemiDetails(semiSel) && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>{cleanSemiDetails(semiSel)}</span>}
                    <span className="text-[#E8740E] font-semibold">Custo: R$ {semiSel.custo_unitario?.toLocaleString("pt-BR")}</span>
                  </div>
                </div>
                <div>
                  <p className={labelCls}>Preco de venda PIX (R$)</p>
                  <input type="text" inputMode="numeric" placeholder="Ex: 6500" value={semiPreco} onChange={e => setSemiPreco(e.target.value.replace(/\D/g, ""))} className={inputCls} />
                  {semiPreco && semiSel.custo_unitario > 0 && (
                    <p className={`text-xs mt-1 font-semibold ${parseFloat(semiPreco) > semiSel.custo_unitario ? "text-green-500" : "text-red-500"}`}>
                      Lucro: R$ {(parseFloat(semiPreco) - semiSel.custo_unitario).toLocaleString("pt-BR")} ({((parseFloat(semiPreco) - semiSel.custo_unitario) / parseFloat(semiPreco) * 100).toFixed(1)}%)
                    </p>
                  )}
                </div>
                <div>
                  <p className={labelCls}>Observacao no orcamento (opcional)</p>
                  <input type="text" placeholder="Ex: Garantia Apple ate agosto, Grade A" value={semiObs} onChange={e => setSemiObs(e.target.value)} className={inputCls} />
                </div>
                </>
              )}
              </>
            )}
          </div>
          )}

          {(produtoSelecionado || semiProduto) && (
            <>
              {/* Preço PIX — só para lacrado (seminovo já mostra acima) */}
              {produtoSelecionado && tipoOrc === "lacrado" && (
              <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Preço PIX</p>
                <p className={`text-2xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                  R$ {produtoSelecionado.preco_pix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>
              )}

              {/* Carrinho */}
              {carrinho.length > 0 && (
                <div className={`rounded-xl p-3 space-y-2 ${dm ? "bg-[#2C2C2E] border border-[#3A3A3C]" : "bg-green-50 border border-green-200"}`}>
                  <p className={`text-xs font-bold uppercase tracking-wider ${dm ? "text-green-400" : "text-green-700"}`}>Produtos no orcamento ({carrinho.length})</p>
                  {carrinho.map((item, i) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{i + 1}. {item.nome}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-green-600">R$ {item.preco.toLocaleString("pt-BR")}</span>
                        <button onClick={() => setCarrinho(prev => prev.filter(c => c.id !== item.id))} className="text-red-400 hover:text-red-600 text-xs font-bold">✕</button>
                      </div>
                    </div>
                  ))}
                  <div className={`pt-2 border-t flex justify-between font-bold ${dm ? "border-[#3A3A3C] text-[#F5F5F7]" : "border-green-300 text-[#1D1D1F]"}`}>
                    <span>Total</span>
                    <span className="text-green-600">R$ {carrinho.reduce((s, c) => s + c.preco, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}

              {/* Botão adicionar mais produto */}
              <button onClick={() => {
                if (produtoSelecionado && !carrinho.find(c => c.id === produtoSelecionado.id)) {
                  setCarrinho(prev => [...prev, { id: produtoSelecionado.id, nome: produtoSelecionado.nome, preco: produtoSelecionado.preco_pix, categoria: produtoSelecionado.categoria }]);
                }
                setProdSel(""); setCatSel("");
              }} className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors border-2 border-dashed ${dm ? "border-[#3A3A3C] text-[#98989D] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"}`}>
                + Adicionar outro produto ao orcamento
              </button>

              {/* Troca */}
              <div className={`rounded-xl p-3 space-y-2 ${dm ? "bg-[#2C2C2E] border border-[#3A3A3C]" : "bg-blue-50 border border-blue-200"}`}>
                <p className={`text-xs font-bold uppercase tracking-wider ${dm ? "text-blue-400" : "text-blue-700"}`}>Produto na troca?</p>
                <input type="text" placeholder="Ex: iPhone 15 Pro Max 256GB" value={trocaProduto} onChange={e => setTrocaProduto(e.target.value)} className={inputCls} />
                {trocaProduto && (
                  <div>
                    <p className={labelCls}>Valor da avaliacao (R$)</p>
                    <input type="text" inputMode="decimal" placeholder="Ex: 3500" value={trocaValor} onChange={e => setTrocaValor(e.target.value)} className={inputCls} />
                  </div>
                )}
              </div>

              {/* Entrada */}
              <div>
                <p className={labelCls}>Entrada PIX (R$)</p>
                <input type="text" inputMode="decimal" placeholder="0" value={entrada} onChange={e => setEntrada(e.target.value)} className={inputCls} />
              </div>

              {/* Parcelas — multi-select */}
              <div>
                <p className={labelCls}>Parcelas (selecione uma ou mais)</p>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-2">
                  {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n => {
                    const selected = parcelasSel.includes(n);
                    return (
                      <button key={n} onClick={() => {
                        setParcelasSel(prev => selected ? prev.filter(x => x !== n) : [...prev, n]);
                      }} className={`py-2 rounded-lg text-xs font-bold transition-colors ${selected ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED]"}`}>
                        {n}x
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Texto gerado */}
      {textoGerado && (
        <div className={cardCls}>
          <div className="flex items-center justify-between mb-3">
            <p className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Texto pronto:</p>
            <button onClick={copiar} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${copiado ? "bg-green-500 text-white" : "bg-[#E8740E] text-white hover:bg-[#F5A623]"}`}>
              {copiado ? "✅ Copiado!" : "📋 Copiar"}
            </button>
          </div>
          <pre className={`whitespace-pre-wrap text-sm leading-relaxed p-4 rounded-xl ${dm ? "bg-[#2C2C2E] text-[#F5F5F7]" : "bg-[#F5F5F7] text-[#1D1D1F]"}`}>
            {textoGerado}
          </pre>
        </div>
      )}

      {/* Tabela rápida de parcelas */}
      {(produtoSelecionado || semiProduto) && (
        <div className={cardCls}>
          <p className={`text-sm font-bold mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Tabela de parcelas (clique pra adicionar/remover)</p>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
            {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n => {
              const precoPix = semiProduto ? semiProduto.preco : (produtoSelecionado?.preco_pix || 0);
              const entradaVal = parseFloat(entrada) || 0;
              const restante = precoPix - entradaVal;
              if (restante <= 0) return null;
              const taxa = getTaxaOrcamento(n);
              const valorComTaxa = restante * (1 + taxa / 100);
              const valorParcela = Math.ceil(valorComTaxa / n);
              const selected = parcelasSel.includes(n);
              return (
                <button key={n} onClick={() => setParcelasSel(prev => selected ? prev.filter(x => x !== n) : [...prev, n])}
                  className={`p-2 rounded-lg text-center transition-colors ${selected ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#F5F5F7] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"}`}>
                  <p className="text-xs font-bold">{n}x</p>
                  <p className="text-sm font-semibold">R$ {valorParcela.toLocaleString("pt-BR")}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
