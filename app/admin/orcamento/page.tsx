"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

// Taxas Infinite VISA (usada como padrão para orçamento cliente)
const TAXAS_PARCELA: Record<number, number> = {
  1: 2.69, 2: 3.94, 3: 4.46, 4: 4.98, 5: 5.49, 6: 5.99,
  7: 6.51, 8: 6.99, 9: 7.51, 10: 7.99, 11: 8.49, 12: 8.99,
  18: 13.57, 21: 15.34,
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
  const [parcelas, setParcelas] = useState(12);
  const [textoGerado, setTextoGerado] = useState("");
  const [copiado, setCopiado] = useState(false);

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
    if (!produtoSelecionado) return;

    const precoPix = produtoSelecionado.preco_pix;
    const entradaVal = parseFloat(entrada) || 0;
    const restante = precoPix - entradaVal;

    if (restante <= 0) {
      // Só PIX, sem parcela
      const texto = [
        `📱 *${produtoSelecionado.nome}*`,
        `📦 Novo / Lacrado`,
        `✅ 1 ano de garantia`,
        `📄 Nota fiscal em seu nome`,
        ``,
        `💰 *R$ ${precoPix.toLocaleString("pt-BR")}* à vista no PIX`,
        ``,
        `⏰ Orçamento válido por 24 horas.`,
      ].join("\n");
      setTextoGerado(texto);
      return;
    }

    const taxa = getTaxaOrcamento(parcelas);
    const valorComTaxa = restante / (1 - taxa / 100);
    const valorParcela = Math.ceil(valorComTaxa / parcelas);

    const linhas = [
      `📱 *${produtoSelecionado.nome}*`,
      `📦 Novo / Lacrado`,
      `✅ 1 ano de garantia`,
      `📄 Nota fiscal em seu nome`,
      ``,
    ];

    if (entradaVal > 0) {
      linhas.push(`R$ ${entradaVal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} à vista no PIX de entrada`);
      linhas.push(`O restante parcelado ficaria ${parcelas}x R$ ${valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} no cartão`);
    } else {
      linhas.push(`💳 ${parcelas}x R$ ${valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} no cartão`);
      linhas.push(`💰 Ou R$ ${precoPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} à vista no PIX`);
    }

    linhas.push(``);
    linhas.push(`⏰ Orçamento válido por 24 horas.`);

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
    if (produtoSelecionado) gerarOrcamento();
  }, [prodSel, entrada, parcelas]);

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
              <button onClick={() => { setCatSel(""); setProdSel(""); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${!catSel ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                Todos
              </button>
              {categorias.map(c => (
                <button key={c} onClick={() => { setCatSel(c); setProdSel(""); }} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${catSel === c ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                  {CATEGORIAS_LABEL[c] || c}
                </button>
              ))}
            </div>
          </div>

          {/* Produto */}
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

          {produtoSelecionado && (
            <>
              {/* Preço PIX */}
              <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Preço PIX</p>
                <p className={`text-2xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                  R$ {produtoSelecionado.preco_pix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </p>
              </div>

              {/* Entrada + Parcelas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className={labelCls}>Entrada PIX (R$)</p>
                  <input type="text" inputMode="decimal" placeholder="0" value={entrada} onChange={e => setEntrada(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <p className={labelCls}>Parcelas</p>
                  <select value={parcelas} onChange={e => setParcelas(Number(e.target.value))} className={inputCls}>
                    {[1,2,3,4,5,6,7,8,9,10,11,12,18,21].map(n => {
                      const taxa = getTaxaOrcamento(n);
                      return <option key={n} value={n}>{n}x (taxa {taxa.toFixed(1)}%)</option>;
                    })}
                  </select>
                </div>
              </div>

              {/* Preview cálculo */}
              {parseFloat(entrada) > 0 && (
                <div className={`text-xs space-y-1 px-3 py-2 rounded-lg ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                  <p>Preço PIX: R$ {produtoSelecionado.preco_pix.toLocaleString("pt-BR")}</p>
                  <p>Entrada: -R$ {(parseFloat(entrada) || 0).toLocaleString("pt-BR")}</p>
                  <p>Restante: R$ {(produtoSelecionado.preco_pix - (parseFloat(entrada) || 0)).toLocaleString("pt-BR")}</p>
                  <p>Taxa {parcelas}x: {getTaxaOrcamento(parcelas).toFixed(2)}%</p>
                  <p className="font-bold">Parcela: R$ {Math.ceil((produtoSelecionado.preco_pix - (parseFloat(entrada) || 0)) / (1 - getTaxaOrcamento(parcelas) / 100) / parcelas).toLocaleString("pt-BR")}</p>
                </div>
              )}
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
          <p className={`text-sm font-bold mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Tabela de parcelas</p>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
            {[1,2,3,4,5,6,7,8,9,10,11,12,18,21].map(n => {
              const precoPix = produtoSelecionado.preco_pix;
              const entradaVal = parseFloat(entrada) || 0;
              const restante = precoPix - entradaVal;
              if (restante <= 0) return null;
              const taxa = getTaxaOrcamento(n);
              const valorComTaxa = restante / (1 - taxa / 100);
              const valorParcela = Math.ceil(valorComTaxa / n);
              return (
                <button key={n} onClick={() => setParcelas(n)}
                  className={`p-2 rounded-lg text-center transition-colors ${parcelas === n ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#F5F5F7] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"}`}>
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
