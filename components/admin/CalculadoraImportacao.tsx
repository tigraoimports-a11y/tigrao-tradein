"use client";

import { useState, useEffect } from "react";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Mesmas taxas do gerador de orçamento
const TAXAS_PARCELA: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
  7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
  13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
  19: 20, 20: 21, 21: 22,
};
function getTaxa(n: number) { return TAXAS_PARCELA[n] ?? 0; }
const fmtBRL = (v: number) => `R$ ${Math.ceil(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

// Catálogo de produtos com peso pré-cadastrado (kg) — peso com caixa completa
const PRODUTOS_PESO: { cat: string; nome: string; peso: number }[] = [
  // MacBooks (caixa completa ~3kg)
  { cat: "MacBook", nome: "MacBook Pro M5 14\"", peso: 3.0 },
  { cat: "MacBook", nome: "MacBook Pro M4 Pro 14\"", peso: 3.0 },
  { cat: "MacBook", nome: "MacBook Air M4 15\"", peso: 3.0 },
  { cat: "MacBook", nome: "MacBook Air M5 13\"", peso: 3.0 },
  // iPads (caixa completa ~1kg)
  { cat: "iPad", nome: "iPad A16", peso: 1.0 },
  { cat: "iPad", nome: "iPad Air M3 11\"", peso: 1.0 },
  { cat: "iPad", nome: "iPad Air M3 13\"", peso: 1.0 },
  { cat: "iPad", nome: "iPad Pro M5 11\"", peso: 1.0 },
  { cat: "iPad", nome: "iPad Pro M5 13\"", peso: 1.0 },
  // Mac Mini
  { cat: "Mac", nome: "Mac Mini M4", peso: 1.06 },
  { cat: "Mac", nome: "Mac Mini M4 Pro", peso: 2.0 },
];

interface CalcResult {
  p: number;
  w: number;
  fx: number;
  markup: number;
  fretePeso: number;
  subtotal: number;
  totalUsd: number;
  totalBrl: number;
}

export default function CalculadoraImportacao() {
  const [preco, setPreco] = useState("");
  const [peso, setPeso] = useState("");
  const [cotacao, setCotacao] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [showProdutos, setShowProdutos] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  const [produtoSelecionado, setProdutoSelecionado] = useState("");

  // Gerador de orçamento
  const [precoVenda, setPrecoVenda] = useState("");
  const [parcelasSel, setParcelasSel] = useState<number[]>([12, 18, 21]);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (preco && peso && cotacao) {
      const p = parseFloat(preco);
      const w = parseFloat(peso);
      const fx = parseFloat(cotacao);
      if (p > 0 && w >= 0 && fx > 0) {
        const markup = p * 1.1;
        const fretePeso = w * 30;
        const subtotal = markup + fretePeso;
        const totalUsd = subtotal * 1.12;
        const totalBrl = totalUsd * fx;
        setResult({ markup, fretePeso, subtotal, totalUsd, totalBrl, p, w, fx });
      } else {
        setResult(null);
      }
    } else {
      setResult(null);
    }
  }, [preco, peso, cotacao]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#1D1D1F]">Calculadora de Importação</h2>
        <p className="text-sm text-[#86868B] mt-1">
          Calcule o custo final de importação de produtos Apple dos EUA para o Brasil.
        </p>
      </div>

      {/* Formula card */}
      <div className="rounded-2xl border border-[#E5E5EA] bg-[#F5F5F7] px-5 py-4">
        <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-2">
          Fórmula
        </div>
        <code className="text-sm text-[#1D1D1F] font-mono">
          (Preço × 1,10 + Peso × $30) × 1,12 × Câmbio
        </code>
      </div>

      {/* Seletor de Produto */}
      <div className="relative">
        <button
          onClick={() => setShowProdutos(!showProdutos)}
          className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[#D2D2D7] bg-white hover:border-[#E8740E] transition-colors"
        >
          <span className={`text-sm font-semibold ${produtoSelecionado ? "text-[#1D1D1F]" : "text-[#C7C7CC]"}`}>
            {produtoSelecionado || "Selecionar produto (preenche peso automaticamente)"}
          </span>
          <span className="text-[#86868B]">{showProdutos ? "▲" : "▼"}</span>
        </button>

        {showProdutos && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-[#D2D2D7] rounded-xl shadow-xl max-h-[400px] overflow-hidden">
            <div className="p-2 border-b border-[#E5E5EA] sticky top-0 bg-white">
              <input
                type="text"
                value={buscaProduto}
                onChange={(e) => setBuscaProduto(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm outline-none focus:border-[#E8740E]"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-[340px]">
              {(() => {
                const filtrados = PRODUTOS_PESO.filter(p =>
                  p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) ||
                  p.cat.toLowerCase().includes(buscaProduto.toLowerCase())
                );
                let lastCat = "";
                return filtrados.map((p, i) => {
                  const showCat = p.cat !== lastCat;
                  lastCat = p.cat;
                  return (
                    <div key={i}>
                      {showCat && (
                        <div className="px-3 py-1.5 text-[10px] font-bold text-[#86868B] uppercase tracking-wider bg-[#F5F5F7] sticky top-0">
                          {p.cat}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setPeso(String(p.peso));
                          setProdutoSelecionado(p.nome);
                          setShowProdutos(false);
                          setBuscaProduto("");
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-[#F5F5F7] transition-colors flex justify-between items-center"
                      >
                        <span className="font-medium text-[#1D1D1F]">{p.nome}</span>
                        <span className="text-xs text-[#86868B] font-mono">{p.peso} kg</span>
                      </button>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InputField
          label="Preço Apple US"
          prefix="US$"
          value={preco}
          onChange={setPreco}
          placeholder="1000"
        />
        <InputField
          label="Peso do produto"
          suffix="kg"
          value={peso}
          onChange={(v) => { setPeso(v); setProdutoSelecionado(""); }}
          placeholder="3.0"
        />
        <InputField
          label="Cotação do dólar"
          prefix="R$"
          value={cotacao}
          onChange={setCotacao}
          placeholder="5.75"
        />
      </div>

      {/* Results */}
      {result && (
        <>
        <div className="rounded-2xl border border-[#E5E5EA] bg-white overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-4">
              Detalhamento
            </div>

            <Row label="Preço Apple US" value={formatUSD(result.p)} />
            <Row label="+ Markup 10%" value={formatUSD(result.p * 0.1)} sub />
            <Row label={`+ Frete (${result.w}kg × $30)`} value={formatUSD(result.fretePeso)} sub />

            <div className="h-px bg-[#E5E5EA] my-3" />

            <Row label="Subtotal" value={formatUSD(result.subtotal)} />
            <Row label="+ Envio BR 12%" value={formatUSD(result.subtotal * 0.12)} sub />

            <div className="h-px bg-[#E5E5EA] my-3" />

            <Row label="Total em dólar" value={formatUSD(result.totalUsd)} bold />
            <Row label={`Câmbio (R$ ${result.fx.toFixed(2)})`} value="" sub />
          </div>

          {/* Final price */}
          <div className="mt-2 px-5 py-5 bg-gradient-to-r from-[#E8740E] to-[#D06A0D] text-center">
            <div className="text-[10px] font-semibold text-white/80 uppercase tracking-wider mb-1">
              Custo Final
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {formatBRL(result.totalBrl)}
            </div>
          </div>
        </div>

        {/* ── Gerador de Orçamento ── */}
        <div className="rounded-2xl border border-[#E5E5EA] bg-white overflow-hidden">
          <div className="px-5 pt-5 pb-4 space-y-4">
            <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider">
              Gerar Orçamento para Cliente
            </div>

            {/* Preço de venda */}
            <div>
              <label className="block text-xs font-semibold text-[#86868B] mb-1.5">Preço que quero vender (R$)</label>
              <div className="flex items-center rounded-xl border border-[#D2D2D7] bg-white overflow-hidden focus-within:border-[#E8740E] transition-colors">
                <span className="pl-3 text-sm text-[#86868B] font-medium">R$</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={precoVenda}
                  onChange={e => { setPrecoVenda(e.target.value); setCopiado(false); }}
                  placeholder="Ex: 11500"
                  className="flex-1 px-3 py-3 bg-transparent text-[#1D1D1F] text-base font-semibold outline-none placeholder:text-[#C7C7CC]"
                />
              </div>
            </div>

            {/* Seletor de parcelas */}
            <div>
              <label className="block text-xs font-semibold text-[#86868B] mb-2">Parcelas no texto</label>
              <div className="flex flex-wrap gap-2">
                {[6, 9, 10, 12, 15, 18, 21].map(n => {
                  const sel = parcelasSel.includes(n);
                  return (
                    <button
                      key={n}
                      onClick={() => { setParcelasSel(prev => sel ? prev.filter(x => x !== n) : [...prev, n].sort((a,b)=>a-b)); setCopiado(false); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${sel ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED]"}`}
                    >
                      {n}x
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Texto gerado */}
          {parseFloat(precoVenda) > 0 && (() => {
            const pix = parseFloat(precoVenda);
            const nome = produtoSelecionado || "PRODUTO";
            const sorted = [...parcelasSel].sort((a, b) => a - b);
            const linhas: string[] = [
              `📦 *${nome.toUpperCase()}*`,
              ``,
              `📦 Novo / Lacrado`,
              `✅ 1 ano de garantia`,
              `📄 Nota fiscal em seu nome`,
              ``,
              `🕐 Produto sob encomenda`,
              `📦 Prazo de entrega: varia conforme disponibilidade`,
              ``,
            ];
            if (sorted.length > 0) {
              linhas.push(`💳 Parcelado no cartão:`);
              for (const n of sorted) {
                const vp = Math.ceil(pix * (1 + getTaxa(n) / 100) / n);
                linhas.push(`     • ${n}x de ${fmtBRL(vp)}`);
              }
            }
            linhas.push(`💰 Ou ${fmtBRL(pix)} à vista no PIX`);
            linhas.push(``);
            linhas.push(`⏰ Orçamento válido por 24 horas. Após esse período refaça o orçamento.`);
            const texto = linhas.join("\n");

            return (
              <div>
                <div className="px-5 pb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider">Texto pronto</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 3000); }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors ${copiado ? "bg-green-500 text-white" : "bg-[#E8740E] text-white hover:bg-[#D06A0D]"}`}
                  >
                    {copiado ? "✅ Copiado!" : "📋 Copiar"}
                  </button>
                </div>
                <div className="mx-5 mb-5 p-4 bg-[#1A1A1A] rounded-xl">
                  <pre className="text-[11px] text-[#E5E5E5] font-mono whitespace-pre-wrap leading-relaxed">{texto}</pre>
                </div>
              </div>
            );
          })()}
        </div>
        </>
      )}
    </div>
  );
}

function InputField({
  label,
  prefix,
  suffix,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#86868B] mb-1.5">{label}</label>
      <div className="flex items-center rounded-xl border border-[#D2D2D7] bg-white overflow-hidden focus-within:border-[#E8740E] transition-colors">
        {prefix && (
          <span className="pl-3 text-sm text-[#86868B] font-medium">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-3 bg-transparent text-[#1D1D1F] text-base font-semibold outline-none placeholder:text-[#C7C7CC] w-full"
        />
        {suffix && (
          <span className="pr-3 text-sm text-[#86868B] font-medium">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, sub, bold }: { label: string; value: string; sub?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className={`text-sm ${sub ? "text-[#86868B]" : bold ? "text-[#1D1D1F] font-bold" : "text-[#3C3C43]"}`}>
        {label}
      </span>
      <span className={`text-sm font-mono ${sub ? "text-[#86868B]" : bold ? "text-[#1D1D1F] font-bold" : "text-[#1D1D1F] font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
