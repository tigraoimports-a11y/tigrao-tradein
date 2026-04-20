"use client";

import { useState, useEffect, useCallback } from "react";

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

interface ProdutoPeso {
  cat: string;
  nome: string;
  peso: number;
  // Configuracoes (storage/RAM/chip) e cores opcionais — admin preenche via
  // aba Editar produtos. Se vazio, calculadora nao mostra os seletores.
  configs?: string[];
  cores?: string[];
}

// Fallback caso a API falhe ou o seed ainda nao tenha rodado.
// Admin edita a lista via aba "Editar produtos" e salva no app_settings
// (key: calc_importacao_produtos).
const FALLBACK_PRODUTOS: ProdutoPeso[] = [
  { cat: "MacBook", nome: "MacBook Pro M5 14\"", peso: 3.0 },
  { cat: "MacBook", nome: "MacBook Pro M4 Pro 14\"", peso: 3.0 },
  { cat: "MacBook", nome: "MacBook Air M4 15\"", peso: 3.0 },
  { cat: "MacBook", nome: "MacBook Air M5 13\"", peso: 3.0 },
  { cat: "iPad", nome: "iPad A16", peso: 1.0 },
  { cat: "iPad", nome: "iPad Air M3 11\"", peso: 1.0 },
  { cat: "iPad", nome: "iPad Air M3 13\"", peso: 1.0 },
  { cat: "iPad", nome: "iPad Pro M5 11\"", peso: 1.0 },
  { cat: "iPad", nome: "iPad Pro M5 13\"", peso: 1.0 },
  { cat: "Mac", nome: "Mac Mini M4", peso: 1.06 },
  { cat: "Mac", nome: "Mac Mini M4 Pro", peso: 2.0 },
];

const SETTINGS_KEY = "calc_importacao_produtos";

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

type Tab = "calcular" | "editar";

export default function CalculadoraImportacao() {
  const [tab, setTab] = useState<Tab>("calcular");
  const [produtos, setProdutos] = useState<ProdutoPeso[]>(FALLBACK_PRODUTOS);
  const [loading, setLoading] = useState(true);

  const [preco, setPreco] = useState("");
  const [peso, setPeso] = useState("");
  const [cotacao, setCotacao] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [showProdutos, setShowProdutos] = useState(false);
  const [buscaProduto, setBuscaProduto] = useState("");
  // produtoBaseNome = nome do row do catalogo (sem config/cor) que foi
  // clicado. Usado pra buscar configs/cores disponiveis no array produtos.
  const [produtoBaseNome, setProdutoBaseNome] = useState("");
  const [configSelecionada, setConfigSelecionada] = useState("");
  const [corSelecionada, setCorSelecionada] = useState("");
  // produtoSelecionado = string composta (base + config + cor) mostrada na
  // pill e usada no texto do orcamento.
  const produtoBase = produtos.find(p => p.nome === produtoBaseNome) || null;
  const produtoSelecionado = produtoBaseNome
    ? [produtoBaseNome, configSelecionada, corSelecionada].filter(Boolean).join(" ")
    : "";

  // Gerador de orçamento
  const [precoVenda, setPrecoVenda] = useState("");
  const [parcelasSel, setParcelasSel] = useState<number[]>([12, 18, 21]);
  const [copiado, setCopiado] = useState(false);

  // Carrega a lista do app_settings. Usa localStorage.adminPassword pra auth
  // (mesmo padrao do resto do /admin).
  const carregarProdutos = useCallback(async () => {
    setLoading(true);
    try {
      const pw = typeof window !== "undefined" ? localStorage.getItem("adminPassword") || "" : "";
      const res = await fetch(`/api/admin/estoque-settings?key=${SETTINGS_KEY}`, {
        headers: { "x-admin-password": pw },
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.value) && json.value.length > 0) {
          setProdutos(json.value as ProdutoPeso[]);
        }
      }
    } catch { /* usa fallback */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

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
      {/* Header + abas */}
      <div>
        <h2 className="text-lg font-bold text-[#1D1D1F]">Calculadora de Importação</h2>
        <p className="text-sm text-[#86868B] mt-1">
          Calcule o custo final de importação de produtos Apple dos EUA para o Brasil.
        </p>
        <div className="mt-4 flex gap-2 border-b border-[#E5E5EA]">
          <button
            onClick={() => setTab("calcular")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
              tab === "calcular"
                ? "border-[#E8740E] text-[#E8740E]"
                : "border-transparent text-[#86868B] hover:text-[#1D1D1F]"
            }`}
          >
            Calcular
          </button>
          <button
            onClick={() => setTab("editar")}
            className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
              tab === "editar"
                ? "border-[#E8740E] text-[#E8740E]"
                : "border-transparent text-[#86868B] hover:text-[#1D1D1F]"
            }`}
          >
            Editar produtos{loading ? " …" : ` (${produtos.length})`}
          </button>
        </div>
      </div>

      {tab === "editar" ? (
        <EditorProdutos
          produtos={produtos}
          onSaved={(novaLista) => {
            setProdutos(novaLista);
            // Se o produto base selecionado na calculadora foi removido, limpa.
            if (produtoBaseNome && !novaLista.some(p => p.nome === produtoBaseNome)) {
              setProdutoBaseNome("");
              setConfigSelecionada("");
              setCorSelecionada("");
            }
          }}
        />
      ) : (
        <>
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

        {produtoBase && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#86868B] mb-1.5 uppercase tracking-wider">
                Configuração (opcional)
              </label>
              <input
                type="text"
                value={configSelecionada}
                onChange={(e) => setConfigSelecionada(e.target.value)}
                placeholder="Ex: 256GB, 512GB, M4 Pro..."
                className="w-full px-3 py-2.5 rounded-xl border border-[#D2D2D7] bg-white text-sm outline-none focus:border-[#E8740E]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#86868B] mb-1.5 uppercase tracking-wider">
                Cor (opcional)
              </label>
              <input
                type="text"
                value={corSelecionada}
                onChange={(e) => setCorSelecionada(e.target.value)}
                placeholder="Ex: Prata, Grafite, Preto..."
                className="w-full px-3 py-2.5 rounded-xl border border-[#D2D2D7] bg-white text-sm outline-none focus:border-[#E8740E]"
              />
            </div>
          </div>
        )}

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
                const filtrados = produtos.filter(p =>
                  p.nome.toLowerCase().includes(buscaProduto.toLowerCase()) ||
                  p.cat.toLowerCase().includes(buscaProduto.toLowerCase())
                );
                if (filtrados.length === 0) {
                  return (
                    <div className="px-4 py-6 text-center text-sm text-[#86868B]">
                      Nenhum produto. Adiciona na aba &quot;Editar produtos&quot;.
                    </div>
                  );
                }
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
                          setProdutoBaseNome(p.nome);
                          // Config e cor sao digitados livre na tela de Calcular — limpa ao trocar produto
                          setConfigSelecionada("");
                          setCorSelecionada("");
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
          onChange={(v) => {
            setPeso(v);
            // Se admin mexer no peso manualmente, desvincula do produto selecionado.
            setProdutoBaseNome("");
            setConfigSelecionada("");
            setCorSelecionada("");
          }}
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
        </>
      )}
    </div>
  );
}

function EditorProdutos({
  produtos,
  onSaved,
}: {
  produtos: ProdutoPeso[];
  onSaved: (novaLista: ProdutoPeso[]) => void;
}) {
  const [lista, setLista] = useState<ProdutoPeso[]>(produtos);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => { setLista(produtos); }, [produtos]);

  const dirty = JSON.stringify(lista) !== JSON.stringify(produtos);

  const atualizar = (i: number, campo: keyof ProdutoPeso, valor: string | number) => {
    setLista(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: valor } : p));
  };

  // Helper pra campos array (configs, cores): admin digita "256GB, 512GB, 1TB"
  // e salva como ["256GB", "512GB", "1TB"]. Vazio/espacos ignorados.
  const atualizarArray = (i: number, campo: "configs" | "cores", csv: string) => {
    const arr = csv.split(",").map(s => s.trim()).filter(Boolean);
    setLista(prev => prev.map((p, idx) => idx === i ? { ...p, [campo]: arr.length > 0 ? arr : undefined } : p));
  };

  const adicionar = () => {
    setLista(prev => [...prev, { cat: "MacBook", nome: "", peso: 1.0 }]);
  };

  const remover = (i: number) => {
    if (!confirm(`Remover "${lista[i].nome || "(sem nome)"}"?`)) return;
    setLista(prev => prev.filter((_, idx) => idx !== i));
  };

  const salvar = async () => {
    // Valida: todos precisam de nome, peso > 0
    const invalidos = lista.filter(p => !p.nome.trim() || !(p.peso > 0));
    if (invalidos.length > 0) {
      setMsg(`${invalidos.length} item(ns) com nome vazio ou peso invalido`);
      setTimeout(() => setMsg(""), 4000);
      return;
    }
    setSalvando(true);
    try {
      const pw = typeof window !== "undefined" ? localStorage.getItem("adminPassword") || "" : "";
      const res = await fetch("/api/admin/estoque-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": pw },
        body: JSON.stringify({ key: SETTINGS_KEY, value: lista }),
      });
      if (res.ok) {
        onSaved(lista);
        setMsg("Lista salva!");
      } else {
        const j = await res.json().catch(() => ({}));
        setMsg(`Erro ao salvar: ${j.error || res.status}`);
      }
    } catch (err) {
      setMsg(`Erro: ${String(err)}`);
    }
    setSalvando(false);
    setTimeout(() => setMsg(""), 4000);
  };

  // Categorias sugeridas
  const cats = [...new Set(lista.map(p => p.cat))].sort();
  const catsSugeridos = cats.length > 0 ? cats : ["MacBook", "iPad", "Mac", "iPhone", "Apple Watch"];

  return (
    <div className="rounded-2xl border border-[#E5E5EA] bg-white p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-[#1D1D1F]">Editar lista de produtos</h3>
          <p className="text-xs text-[#86868B] mt-0.5">
            Salva no banco (app_settings) — valido pra todos os operadores.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={adicionar}
            className="px-3 py-2 rounded-lg text-xs font-bold bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] transition-colors"
          >
            + Adicionar produto
          </button>
          <button
            onClick={salvar}
            disabled={!dirty || salvando}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              dirty && !salvando
                ? "bg-[#E8740E] text-white hover:bg-[#D06A0D]"
                : "bg-[#F5F5F7] text-[#C7C7CC] cursor-not-allowed"
            }`}
          >
            {salvando ? "Salvando..." : dirty ? "Salvar alteracoes" : "Salvo"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-xs ${msg.toLowerCase().includes("erro") || msg.toLowerCase().includes("invalido") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {msg}
        </div>
      )}

      <datalist id="calc-imp-cats">
        {catsSugeridos.map(c => <option key={c} value={c} />)}
      </datalist>

      <div className="overflow-x-auto">
        <p className="text-[11px] text-[#86868B] mb-2">
          💡 Configuracao e cor sao digitadas na tela de <strong>Calcular</strong>, produto por produto. Aqui e so lista de modelos com peso.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-bold text-[#86868B] uppercase tracking-wider border-b border-[#E5E5EA]">
              <th className="text-left py-2 pr-3 w-28">Categoria</th>
              <th className="text-left py-2 pr-3">Nome</th>
              <th className="text-left py-2 pr-3 w-20">Peso (kg)</th>
              <th className="text-right py-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((p, i) => (
              <tr key={i} className="border-b border-[#F5F5F7] last:border-0">
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    list="calc-imp-cats"
                    value={p.cat}
                    onChange={(e) => atualizar(i, "cat", e.target.value)}
                    placeholder="MacBook"
                    className="w-full px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-sm outline-none focus:border-[#E8740E]"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="text"
                    value={p.nome}
                    onChange={(e) => atualizar(i, "nome", e.target.value)}
                    placeholder='MacBook Pro M5 14"'
                    className="w-full px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-sm outline-none focus:border-[#E8740E]"
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={p.peso}
                    onChange={(e) => atualizar(i, "peso", parseFloat(e.target.value) || 0)}
                    placeholder="3.0"
                    className="w-full px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-sm outline-none focus:border-[#E8740E]"
                  />
                </td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => remover(i)}
                    className="px-2 py-1 rounded text-xs font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                    title="Remover"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {lista.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-[#86868B]">
                  Nenhum produto. Clica em <strong>+ Adicionar produto</strong>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
