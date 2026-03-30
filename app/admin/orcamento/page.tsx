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

  // Form
  const [catSel, setCatSel] = useState("");
  const [prodSel, setProdSel] = useState("");
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
        const res = await fetch("/api/admin/precos", { headers: { "x-admin-password": password } });
        if (res.ok) {
          const json = await res.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setProdutos((json.data ?? []).filter((p: any) => p.status === "ativo" && p.preco_pix > 0).map((p: any) => ({
            ...p,
            nome: `${p.modelo}${p.armazenamento ? " " + p.armazenamento : ""}`,
          })));
        }
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [password]);

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

  const gerarOrcamento = () => {
    if (!produtoSelecionado && carrinho.length === 0) return;

    // Se tem carrinho com múltiplos produtos, usar total do carrinho
    const itensOrcamento = carrinho.length > 0 ? carrinho : produtoSelecionado ? [{ id: produtoSelecionado.id, nome: produtoSelecionado.nome, preco: produtoSelecionado.preco_pix, categoria: produtoSelecionado.categoria }] : [];
    const totalBruto = itensOrcamento.reduce((s, p) => s + p.preco, 0);
    const trocaVal = parseFloat(trocaValor) || 0;
    const precoPix = totalBruto - trocaVal;
    const entradaVal = parseFloat(entrada) || 0;
    const restante = precoPix - entradaVal;

    const catEmojis: Record<string, string> = { IPHONE: "📱", IPAD: "📱", MACBOOK: "💻", MAC_MINI: "🖥️", APPLE_WATCH: "⌚", AIRPODS: "🎧", ACESSORIOS: "🔌" };

    if (restante <= 0) {
      const linhasSimples = itensOrcamento.map(p => `${catEmojis[p.categoria] || "📦"} *${p.nome}*`);
      const texto = [
        ...linhasSimples,
        ``,
        `📦 Novo / Lacrado`,
        `✅ 1 ano de garantia`,
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
    linhas.push(
      `📦 Novo / Lacrado`,
      `✅ 1 ano de garantia`,
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
    if (produtoSelecionado || carrinho.length > 0) gerarOrcamento();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodSel, entrada, parcelasSel, carrinho, trocaProduto, trocaValor]);

  const cardCls = `rounded-2xl border p-5 shadow-sm ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`;
  const inputCls = `w-full px-3 py-2.5 rounded-xl border text-sm ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-bold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className={`text-xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Calculadora de Orçamento</h1>
      <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Gera texto pronto pra enviar pro cliente no WhatsApp</p>

      <div className={cardCls}>
        <div className="space-y-4">
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

          {produtoSelecionado && (
            <>
              {/* Preço PIX + botão adicionar */}
              <div className="flex items-center gap-3">
                <div className={`flex-1 px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                  <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Preço PIX</p>
                  <p className={`text-2xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                    R$ {produtoSelecionado.preco_pix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <button onClick={() => {
                  if (!carrinho.find(c => c.id === produtoSelecionado.id)) {
                    setCarrinho(prev => [...prev, { id: produtoSelecionado.id, nome: produtoSelecionado.nome, preco: produtoSelecionado.preco_pix, categoria: produtoSelecionado.categoria }]);
                  }
                }} className="px-4 py-3 rounded-xl text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors whitespace-nowrap">
                  + Adicionar
                </button>
              </div>

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
      {produtoSelecionado && (
        <div className={cardCls}>
          <p className={`text-sm font-bold mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Tabela de parcelas (clique pra adicionar/remover)</p>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
            {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21].map(n => {
              const precoPix = produtoSelecionado.preco_pix;
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
