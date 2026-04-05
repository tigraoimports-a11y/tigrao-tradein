"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminShell";

interface VendaResumo {
  id: string;
  data: string;
  produto: string;
  preco_vendido: number;
  forma: string;
  banco: string;
  serial_no: string | null;
  imei: string | null;
}

interface Cliente {
  nome: string;
  cpf: string | null;
  cnpj: string | null;
  email: string | null;
  pessoa: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  total_compras: number;
  total_gasto: number;
  ultima_compra: string;
  ultimo_produto: string;
  cliente_desde: string;
  is_lojista: boolean;
  vendas: VendaResumo[];
}

interface FornecedorCompra {
  produto: string;
  cor: string | null;
  qnt: number;
  custo_unitario: number;
  data: string;
  categoria: string;
  status: string;
  serial_no: string | null;
}

interface Fornecedor {
  id: string;
  nome: string;
  contato: string | null;
  observacao: string | null;
  created_at: string;
  total_produtos: number;
  total_investido: number;
  total_em_estoque: number;
  primeira_compra: string;
  ultima_compra: string;
  categorias: string[];
  compras: FornecedorCompra[];
}

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtDate = (d: string) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function ClientesPage() {
  const { password, darkMode: dm, apiHeaders } = useAdmin();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"clientes" | "lojistas" | "fornecedores" | "notas">(() => {
    const t = searchParams.get("tab");
    if (t === "fornecedores" || t === "lojistas" || t === "notas") return t;
    return "clientes";
  });
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("q") || "");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [notas, setNotas] = useState<{ id: string; data: string; cliente: string; produto: string; preco_vendido: number; nota_fiscal_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailClient, setDetailClient] = useState<Cliente | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ nome: "", cpf: "", email: "", bairro: "", cidade: "", uf: "", cep: "", endereco: "" });
  const [savingClient, setSavingClient] = useState(false);
  const [totals, setTotals] = useState({ total: 0, total_gasto: 0, total_compras: 0, total_investido: 0, total_em_estoque: 0, total_produtos: 0 });
  const [sortBy, setSortBy] = useState<"gasto" | "compras" | "nome" | "recente">("gasto");
  const [fornSort, setFornSort] = useState<"investido" | "produtos" | "nome" | "recente">("investido");
  const [detailForn, setDetailForn] = useState<Fornecedor | null>(null);
  const [fornForm, setFornForm] = useState({ nome: "", contato: "", observacao: "" });
  const [fornMsg, setFornMsg] = useState("");
  const [savingForn, setSavingForn] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchClientes = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/admin/clientes?${params}`, { headers: apiHeaders() });
      if (res.ok) {
        const json = await res.json();
        if (tab === "notas") {
          setNotas(json.notas ?? []);
          setTotals(t => ({ ...t, total: json.total ?? 0 }));
        } else if (tab === "fornecedores") {
          setFornecedores(json.fornecedores ?? []);
          setTotals(t => ({ ...t, total: json.total, total_investido: json.total_investido, total_produtos: json.total_produtos, total_em_estoque: json.total_em_estoque }));
        } else {
          setClientes(json.clientes ?? []);
          setTotals(t => ({ ...t, total: json.total, total_gasto: json.total_gasto, total_compras: json.total_compras }));
        }
      }
    } catch (err) { console.error("Fetch error:", err); }
    setLoading(false);
  }, [password, tab, debouncedSearch, apiHeaders]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const handleCadastrarForn = async () => {
    if (!fornForm.nome.trim()) { setFornMsg("Nome obrigatório"); return; }
    setSavingForn(true);
    try {
      const res = await fetch("/api/fornecedores", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(fornForm),
      });
      const json = await res.json();
      if (json.ok) {
        setFornMsg("Fornecedor cadastrado!");
        setFornForm({ nome: "", contato: "", observacao: "" });
        fetchClientes();
      } else {
        setFornMsg("Erro: " + (json.error || "Falha"));
      }
    } catch { setFornMsg("Erro de conexão"); }
    setSavingForn(false);
    setTimeout(() => setFornMsg(""), 3000);
  };

  const handleDeleteForn = async (f: Fornecedor) => {
    if (!confirm(`Excluir fornecedor "${f.nome}"?`)) return;
    try {
      const res = await fetch("/api/fornecedores", {
        method: "DELETE",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id }),
      });
      const json = await res.json();
      if (json.ok) {
        setFornecedores(prev => prev.filter(x => x.id !== f.id));
        if (detailForn?.id === f.id) setDetailForn(null);
      }
    } catch { /* ignore */ }
  };

  // Sort clientes
  const sorted = [...clientes].sort((a, b) => {
    switch (sortBy) {
      case "gasto": return b.total_gasto - a.total_gasto;
      case "compras": return b.total_compras - a.total_compras;
      case "nome": return a.nome.localeCompare(b.nome);
      case "recente": return b.ultima_compra.localeCompare(a.ultima_compra);
      default: return 0;
    }
  });

  // Sort fornecedores
  const sortedForn = [...fornecedores].sort((a, b) => {
    switch (fornSort) {
      case "investido": return b.total_investido - a.total_investido;
      case "produtos": return b.total_produtos - a.total_produtos;
      case "nome": return a.nome.localeCompare(b.nome);
      case "recente": return b.ultima_compra.localeCompare(a.ultima_compra);
      default: return 0;
    }
  });

  const mP = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const mS = dm ? "text-[#98989D]" : "text-[#86868B]";
  const mM = dm ? "text-[#636366]" : "text-[#86868B]";
  const cardCls = `${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-4 shadow-sm`;
  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder-[#636366]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F] placeholder-[#86868B]"}`;
  const tableCls = `${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`;
  const thCls = `px-4 py-3 text-left font-medium text-xs uppercase tracking-wider whitespace-nowrap ${mS}`;
  const rowCls = `border-b cursor-pointer transition-colors ${dm ? "border-[#2C2C2E] hover:bg-[#2C2C2E]" : "border-[#F5F5F7] hover:bg-[#FAFAFA]"}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-bold ${mP}`}>Cadastros</h1>
        <p className={`text-sm ${mS}`}>Base de cadastros com historico de compras</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: "clientes" as const, label: "Clientes" },
          { key: "lojistas" as const, label: "Lojistas" },
          { key: "fornecedores" as const, label: "Fornecedores" },
          { key: "notas" as const, label: "Notas Fiscais" },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setExpandedId(null); }}
            className={`px-5 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t.key ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder={tab === "fornecedores" ? "Pesquisar fornecedor..." : "Pesquisar por nome, CPF ou numero de serie..."}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#E8740E]">✕</button>
        )}
      </div>

      {/* ============= FORNECEDORES TAB ============= */}
      {tab === "fornecedores" ? (<>
        {/* Cadastrar fornecedor */}
        <div className={`${cardCls} space-y-4`}>
          <h2 className={`text-[15px] font-bold ${mP}`}>Cadastrar Fornecedor</h2>
          {fornMsg && <p className={`text-xs px-3 py-2 rounded-lg ${fornMsg.includes("Erro") ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-600"}`}>{fornMsg}</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-wider mb-1 ${mS}`}>Nome *</p>
              <input value={fornForm.nome} onChange={(e) => setFornForm(f => ({ ...f, nome: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleCadastrarForn()}
                placeholder="Ex: DISTRIBUIDORA APPLE SP" className={inputCls} />
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-wider mb-1 ${mS}`}>Contato (WhatsApp/Tel)</p>
              <input value={fornForm.contato} onChange={(e) => setFornForm(f => ({ ...f, contato: e.target.value }))}
                placeholder="Ex: 21 99999-9999" className={inputCls} />
            </div>
            <div>
              <p className={`text-[10px] uppercase tracking-wider mb-1 ${mS}`}>Observacao</p>
              <input value={fornForm.observacao} onChange={(e) => setFornForm(f => ({ ...f, observacao: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && handleCadastrarForn()}
                placeholder="Notas, prazo entrega, etc." className={inputCls} />
            </div>
          </div>
          <button onClick={handleCadastrarForn} disabled={savingForn}
            className="px-5 py-2.5 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {savingForn ? "Salvando..." : "Cadastrar"}
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className={cardCls}>
            <p className={`text-xs uppercase tracking-wider ${mS}`}>Fornecedores</p>
            <p className={`text-2xl font-bold ${mP}`}>{totals.total}</p>
          </div>
          <div className={cardCls}>
            <p className={`text-xs uppercase tracking-wider ${mS}`}>Produtos Comprados</p>
            <p className="text-2xl font-bold text-[#E8740E]">{totals.total_produtos}</p>
          </div>
          <div className={cardCls}>
            <p className={`text-xs uppercase tracking-wider ${mS}`}>Total Investido</p>
            <p className="text-2xl font-bold text-red-500">{fmt(totals.total_investido)}</p>
          </div>
          <div className={cardCls}>
            <p className={`text-xs uppercase tracking-wider ${mS}`}>Em Estoque</p>
            <p className="text-2xl font-bold text-green-600">{totals.total_em_estoque} un.</p>
          </div>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className={`text-xs ${mS}`}>Ordenar:</span>
          {([
            { key: "investido", label: "Maior investimento" },
            { key: "produtos", label: "Mais produtos" },
            { key: "recente", label: "Mais recente" },
            { key: "nome", label: "Nome" },
          ] as const).map((o) => (
            <button key={o.key} onClick={() => setFornSort(o.key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${fornSort === o.key ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} hover:text-[#E8740E]`}`}>
              {o.label}
            </button>
          ))}
        </div>

        {/* Fornecedores Cards */}
        {loading ? (
          <div className={`${cardCls} py-12 text-center ${mM}`}>Carregando...</div>
        ) : sortedForn.length === 0 ? (
          <div className={`${cardCls} py-12 text-center ${mM}`}>{search ? `Nenhum resultado para "${search}"` : "Nenhum fornecedor cadastrado"}</div>
        ) : (
          <div className="grid gap-3">
            {sortedForn.map((f) => (
              <div key={f.id} onClick={() => setDetailForn(f)}
                className={`${cardCls} cursor-pointer hover:border-[#E8740E] transition-colors`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${dm ? "bg-[#2C2C2E] text-[#E8740E]" : "bg-[#FFF3E8] text-[#E8740E]"}`}>
                      {f.nome.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-bold ${mP} truncate`}>{f.nome}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        {f.contato && <span className={`text-xs ${mS}`}>{f.contato}</span>}
                        {f.observacao && <span className={`text-xs ${mM} truncate max-w-[200px]`}>{f.observacao}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 ml-4">
                    <div className="text-right hidden sm:block">
                      <p className={`text-[10px] uppercase ${mS}`}>Produtos</p>
                      <p className="text-sm font-bold text-[#E8740E]">{f.total_produtos}</p>
                    </div>
                    <div className="text-right hidden sm:block">
                      <p className={`text-[10px] uppercase ${mS}`}>Investido</p>
                      <p className="text-sm font-bold text-red-500">{fmt(f.total_investido)}</p>
                    </div>
                    <div className="text-right hidden md:block">
                      <p className={`text-[10px] uppercase ${mS}`}>Em Estoque</p>
                      <p className={`text-sm font-bold ${f.total_em_estoque > 0 ? "text-green-600" : mM}`}>{f.total_em_estoque} un.</p>
                    </div>
                    <div className="text-right hidden md:block">
                      <p className={`text-[10px] uppercase ${mS}`}>Ultima Compra</p>
                      <p className={`text-xs ${mS}`}>{fmtDate(f.ultima_compra)}</p>
                    </div>
                    <span className={`text-lg ${mM}`}>›</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && sortedForn.length > 0 && (
          <p className={`text-xs text-center ${mM}`}>{sortedForn.length} fornecedores cadastrados</p>
        )}

        {/* Modal de Detalhes do Fornecedor */}
        {detailForn && (() => {
          const f = detailForn;
          const mBg = dm ? "bg-[#1C1C1E]" : "bg-white";
          const mSec = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
          // Resumo por categoria
          const byCat: Record<string, { qnt: number; custo: number }> = {};
          f.compras.forEach(c => {
            const cat = c.categoria || "OUTROS";
            if (!byCat[cat]) byCat[cat] = { qnt: 0, custo: 0 };
            byCat[cat].qnt += c.qnt;
            byCat[cat].custo += c.custo_unitario * c.qnt;
          });
          const catEntries = Object.entries(byCat).sort(([,a],[,b]) => b.custo - a.custo);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setDetailForn(null)} onKeyDown={(e) => { if (e.key === "Escape") setDetailForn(null); }} tabIndex={-1} ref={(el) => el?.focus()}>
              <div className={`w-full max-w-3xl mx-4 ${mBg} rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className={`flex items-center justify-between px-6 py-4 border-b ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold ${dm ? "bg-[#2C2C2E] text-[#E8740E]" : "bg-[#FFF3E8] text-[#E8740E]"}`}>
                      {f.nome.charAt(0)}
                    </div>
                    <div>
                      <h3 className={`text-lg font-bold ${mP}`}>{f.nome}</h3>
                      {f.contato && <p className={`text-xs ${mS}`}>{f.contato}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteForn(f); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${dm ? "border-[#3A3A3C] text-red-400 hover:bg-red-500/10" : "border-[#E8E8ED] text-red-500 hover:bg-red-50"}`}>
                      Excluir
                    </button>
                    <button onClick={() => setDetailForn(null)}
                      className={`w-8 h-8 flex items-center justify-center rounded-full ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F0F0F5]"} ${mS} hover:text-[#E8740E] text-lg`}>✕</button>
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Info do cadastro */}
                  {f.observacao && (
                    <div className={`px-4 py-3 rounded-xl border ${mSec}`}>
                      <p className={`text-[10px] uppercase tracking-wider ${mS} mb-1`}>Observacao</p>
                      <p className={`text-sm ${mP}`}>{f.observacao}</p>
                    </div>
                  )}

                  {/* Summary cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className={`px-4 py-3 rounded-xl border ${mSec}`}>
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Total Produtos</p>
                      <p className={`text-xl font-bold text-[#E8740E]`}>{f.total_produtos}</p>
                    </div>
                    <div className={`px-4 py-3 rounded-xl border ${mSec}`}>
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Investido</p>
                      <p className="text-xl font-bold text-red-500">{fmt(f.total_investido)}</p>
                    </div>
                    <div className={`px-4 py-3 rounded-xl border ${mSec}`}>
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Em Estoque</p>
                      <p className={`text-xl font-bold ${f.total_em_estoque > 0 ? "text-green-600" : mM}`}>{f.total_em_estoque} un.</p>
                    </div>
                    <div className={`px-4 py-3 rounded-xl border ${mSec}`}>
                      <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Fornecedor desde</p>
                      <p className={`text-sm font-bold ${mP}`}>{fmtDate(f.primeira_compra || f.created_at?.split("T")[0])}</p>
                    </div>
                  </div>

                  {/* Resumo por categoria */}
                  {catEntries.length > 0 && (
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-wider ${mS} mb-2`}>Por Categoria</p>
                      <div className="flex flex-wrap gap-2">
                        {catEntries.map(([cat, info]) => (
                          <div key={cat} className={`px-3 py-2 rounded-xl border ${mSec}`}>
                            <p className={`text-[10px] uppercase tracking-wider ${mS}`}>{cat}</p>
                            <p className={`text-[13px] font-bold ${mP}`}>{info.qnt} un. · {fmt(info.custo)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Historico de compras */}
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${mS} mb-2`}>
                      Historico de compras ({f.compras.length} itens)
                    </p>
                    {f.compras.length === 0 ? (
                      <p className={`text-sm ${mM} py-4 text-center`}>Nenhuma compra registrada ainda</p>
                    ) : (
                      <div className="space-y-1 max-h-[400px] overflow-y-auto">
                        {f.compras.map((c, i) => (
                          <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#2C2C2E]" : "bg-[#F9F9FB]"}`}>
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <span className={mM}>{fmtDate(c.data)}</span>
                              <span className={`font-medium truncate ${mP}`}>{c.produto}</span>
                              {c.cor && <span className={`shrink-0 ${mS}`}>{c.cor}</span>}
                              {c.serial_no && <span className="text-purple-500 font-mono shrink-0">SN: {c.serial_no}</span>}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-2">
                              <span className={mM}>{c.qnt}x</span>
                              <span className="font-bold text-red-500 w-24 text-right">{fmt(c.custo_unitario * c.qnt)}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                c.status === "EM ESTOQUE" ? "bg-green-500/10 text-green-600" :
                                c.status === "ESGOTADO" ? "bg-red-500/10 text-red-500" :
                                c.status === "A CAMINHO" ? "bg-blue-500/10 text-blue-500" :
                                `${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#F2F2F7] text-[#86868B]"}`
                              }`}>{c.status || "—"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </>) : tab === "notas" ? (

      /* ============= NOTAS FISCAIS TAB ============= */
        <div className={tableCls}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                  {["Data", "Cliente", "Produto", "Valor", "Nota Fiscal"].map((h) => (
                    <th key={h} className={thCls}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className={`px-4 py-12 text-center ${mM}`}>Carregando...</td></tr>
                ) : notas.length === 0 ? (
                  <tr><td colSpan={5} className={`px-4 py-12 text-center ${mM}`}>Nenhuma nota fiscal registrada</td></tr>
                ) : notas.map((n) => (
                  <tr key={n.id} className={`border-b transition-colors ${dm ? "border-[#2C2C2E] hover:bg-[#2C2C2E]" : "border-[#F5F5F7] hover:bg-[#FAFAFA]"}`}>
                    <td className={`px-4 py-3 ${mS}`}>{fmtDate(n.data)}</td>
                    <td className={`px-4 py-3 font-semibold ${mP}`}>{n.cliente}</td>
                    <td className={`px-4 py-3 ${mP}`}>{n.produto}</td>
                    <td className="px-4 py-3 font-bold text-green-600">{fmt(n.preco_vendido)}</td>
                    <td className="px-4 py-3">
                      <a href={n.nota_fiscal_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#E8740E]/10 text-[#E8740E] text-xs font-semibold hover:bg-[#E8740E]/20 transition-colors">
                        Ver PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      ) : (<>

      {/* ============= CLIENTES / LOJISTAS TAB ============= */}
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wider ${mS}`}>{tab === "lojistas" ? "Total Lojistas" : "Total Clientes"}</p>
          <p className={`text-2xl font-bold ${mP}`}>{totals.total}</p>
        </div>
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wider ${mS}`}>Total Compras</p>
          <p className="text-2xl font-bold text-[#E8740E]">{totals.total_compras}</p>
        </div>
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wider ${mS}`}>Faturamento</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totals.total_gasto)}</p>
        </div>
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wider ${mS}`}>Ticket Medio</p>
          <p className="text-2xl font-bold text-[#E8740E]">{totals.total_compras > 0 ? fmt(totals.total_gasto / totals.total_compras) : "R$ 0"}</p>
        </div>
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2">
        <span className={`text-xs ${mS}`}>Ordenar:</span>
        {([
          { key: "gasto", label: "Maior gasto" },
          { key: "compras", label: "Mais compras" },
          { key: "recente", label: "Mais recente" },
          { key: "nome", label: "Nome" },
        ] as const).map((o) => (
          <button
            key={o.key}
            onClick={() => setSortBy(o.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${sortBy === o.key ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} hover:text-[#E8740E]`}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={tableCls}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                {["Cliente", tab === "lojistas" ? "CNPJ" : "CPF", "Compras", "Total Gasto", "Ultima Compra", "Cliente Desde", "Local"].map((h) => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className={`px-4 py-12 text-center ${mM}`}>Carregando...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={7} className={`px-4 py-12 text-center ${mM}`}>
                  {search ? `Nenhum resultado para "${search}"` : "Nenhum cliente encontrado"}
                </td></tr>
              ) : sorted.map((c) => (
                <React.Fragment key={c.nome}>
                  <tr
                    onClick={() => setDetailClient(c)}
                    className={`${rowCls} ${expandedId === c.nome ? (dm ? "bg-[#2C2C2E]" : "bg-[#FFF8F0]") : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{expandedId === c.nome ? "▼" : "▶"}</span>
                        <div>
                          <p className={`font-semibold ${mP}`}>{c.nome}</p>
                          {c.email && <p className={`text-xs ${mM}`}>{c.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-xs font-mono ${mS}`}>{(tab === "lojistas" ? c.cnpj : c.cpf) || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-lg bg-[#E8740E]/10 text-[#E8740E] text-xs font-bold">{c.total_compras}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-green-600">{fmt(c.total_gasto)}</td>
                    <td className="px-4 py-3">
                      <p className={`text-xs ${mP}`}>{fmtDate(c.ultima_compra)}</p>
                      <p className={`text-xs truncate max-w-[150px] ${mM}`}>{c.ultimo_produto}</p>
                    </td>
                    <td className={`px-4 py-3 text-xs ${mS}`}>{fmtDate(c.cliente_desde)}</td>
                    <td className={`px-4 py-3 text-xs ${mS}`}>
                      {c.bairro ? `${c.bairro}${c.cidade ? `, ${c.cidade}` : ""}` : c.cidade || "—"}
                    </td>
                  </tr>

                  {/* Expanded: lista de compras */}
                  {expandedId === c.nome && (
                    <tr>
                      <td colSpan={7} className={`px-6 py-4 ${dm ? "bg-[#1A1A1C]" : "bg-[#FAFAFA]"}`}>
                        <div className="space-y-3">
                          <div className="flex flex-wrap gap-4 text-xs">
                            {c.cpf && <span className={mS}>CPF: <strong className={mP}>{c.cpf}</strong></span>}
                            {c.cnpj && <span className={mS}>CNPJ: <strong className={mP}>{c.cnpj}</strong></span>}
                            {c.email && <span className={mS}>Email: <strong className={mP}>{c.email}</strong></span>}
                            {c.bairro && <span className={mS}>Bairro: <strong className={mP}>{c.bairro}</strong></span>}
                            {c.cidade && <span className={mS}>Cidade: <strong className={mP}>{c.cidade}{c.uf ? ` - ${c.uf}` : ""}</strong></span>}
                          </div>

                          <p className={`text-xs font-bold uppercase tracking-wider ${mS}`}>
                            Historico de compras ({c.vendas.length})
                          </p>
                          <div className="space-y-1">
                            {c.vendas.map((v) => (
                              <div key={v.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#2C2C2E]" : "bg-white"}`}>
                                <div className="flex items-center gap-3">
                                  <span className={mM}>{fmtDate(v.data)}</span>
                                  <span className={`font-medium ${mP}`}>{v.produto}</span>
                                  {v.serial_no && <span className={`font-mono ${mM}`}>SN: {v.serial_no}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={mM}>{v.forma} · {v.banco}</span>
                                  <span className="font-bold text-green-600">{fmt(v.preco_vendido)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && sorted.length > 0 && (
        <p className={`text-xs text-center ${mM}`}>
          Mostrando {sorted.length} {tab === "lojistas" ? "lojistas" : "clientes"}
        </p>
      )}
      </>)}

      {/* Modal de Detalhes do Cliente */}
      {detailClient && (() => {
        const c = detailClient;
        const mBg = dm ? "bg-[#1C1C1E]" : "bg-white";
        const mSec = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
        const mInput = `w-full px-3 py-2 rounded-lg border text-sm ${dm ? "bg-[#3A3A3C] border-[#4A4A4C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:outline-none focus:border-[#E8740E]`;

        const openEdit = () => {
          setEditForm({
            nome: c.nome || "", cpf: c.cpf || "", email: c.email || "",
            bairro: c.bairro || "", cidade: c.cidade || "", uf: c.uf || "",
            cep: "", endereco: "",
          });
          setEditing(true);
        };

        const saveEdit = async () => {
          setSavingClient(true);
          for (const v of c.vendas) {
            const updates: Record<string, string | null> = {};
            if (editForm.nome && editForm.nome !== c.nome) updates.cliente = editForm.nome.toUpperCase();
            if (editForm.cpf !== (c.cpf || "")) updates.cpf = editForm.cpf || null;
            if (editForm.email !== (c.email || "")) updates.email = editForm.email || null;
            if (editForm.bairro !== (c.bairro || "")) updates.bairro = editForm.bairro || null;
            if (editForm.cidade !== (c.cidade || "")) updates.cidade = editForm.cidade || null;
            if (editForm.uf !== (c.uf || "")) updates.uf = editForm.uf || null;
            if (Object.keys(updates).length > 0) {
              await fetch("/api/estoque", {
                method: "PATCH",
                headers: { ...apiHeaders(), "Content-Type": "application/json" },
                body: JSON.stringify({ table: "vendas", id: v.id, ...updates }),
              }).catch(() => {});
              await fetch(`https://fohhlehrqtwruzxjzrql.supabase.co/rest/v1/vendas?id=eq.${v.id}`, {
                method: "PATCH",
                headers: {
                  "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvaGhsZWhycXR3cnV6eGp6cnFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1OTI1MiwiZXhwIjoyMDg5NDM1MjUyfQ.l0655fvNwRljhyDZl8ODW5H2HS3PH7rZb1Kjx5TJXvg",
                  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvaGhsZWhycXR3cnV6eGp6cnFsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1OTI1MiwiZXhwIjoyMDg5NDM1MjUyfQ.l0655fvNwRljhyDZl8ODW5H2HS3PH7rZb1Kjx5TJXvg",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(updates),
              }).catch(() => {});
            }
          }
          setSavingClient(false);
          setEditing(false);
          setDetailClient(null);
          fetchClientes();
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setDetailClient(null); setEditing(false); }} onKeyDown={(e) => { if (e.key === "Escape") { setDetailClient(null); setEditing(false); } }} tabIndex={-1} ref={(el) => el?.focus()}>
            <div className={`w-full max-w-2xl mx-4 ${mBg} rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
              <div className={`flex items-center justify-between px-6 py-4 border-b ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
                <div>
                  <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Editar Contato</p>
                  <h3 className={`text-lg font-bold ${mP}`}>{c.nome}</h3>
                </div>
                <div className="flex items-center gap-2">
                  {!editing && (
                    <button onClick={openEdit} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E]/10 text-[#E8740E] hover:bg-[#E8740E]/20">Editar</button>
                  )}
                  <button onClick={() => { setDetailClient(null); setEditing(false); }} className={`w-8 h-8 flex items-center justify-center rounded-full ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F0F0F5]"} ${mS} hover:text-[#E8740E] text-lg`}>✕</button>
                </div>
              </div>

              <div className={`mx-5 mt-4 p-4 rounded-xl border ${mSec}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Nome do Contato</p>
                    {editing ? <input value={editForm.nome} onChange={(e) => setEditForm(f => ({ ...f, nome: e.target.value }))} className={mInput} />
                    : <p className={`text-[15px] font-bold ${mP}`}>{c.nome}</p>}
                  </div>
                  <div className="text-right">
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Tipo</p>
                    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${c.is_lojista ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                      {c.is_lojista ? "Atacado" : "Cliente"}
                    </span>
                  </div>
                </div>
              </div>

              <div className={`mx-5 mt-3 p-4 rounded-xl border ${mSec}`}>
                <p className={`text-xs font-bold ${mP} mb-3`}>Informacoes de Contato</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Documento</p>
                    {editing ? <input value={editForm.cpf} onChange={(e) => setEditForm(f => ({ ...f, cpf: e.target.value }))} className={mInput} placeholder="CPF ou CNPJ" />
                    : <p className={`text-[13px] font-mono ${mP} mt-0.5`}>{c.cpf || "—"}</p>}
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Email</p>
                    {editing ? <input value={editForm.email} onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))} className={mInput} placeholder="email@exemplo.com" />
                    : <p className={`text-[13px] ${mP} mt-0.5`}>{c.email || "—"}</p>}
                  </div>
                </div>
              </div>

              <div className={`mx-5 mt-3 p-4 rounded-xl border ${mSec}`}>
                <p className={`text-xs font-bold ${mP} mb-3`}>Endereco</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Estado</p>
                    {editing ? <input value={editForm.uf} onChange={(e) => setEditForm(f => ({ ...f, uf: e.target.value }))} className={mInput} placeholder="UF" />
                    : <p className={`text-[13px] ${mP} mt-0.5`}>{c.uf || "—"}</p>}
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Cidade</p>
                    {editing ? <input value={editForm.cidade} onChange={(e) => setEditForm(f => ({ ...f, cidade: e.target.value }))} className={mInput} placeholder="Cidade" />
                    : <p className={`text-[13px] ${mP} mt-0.5`}>{c.cidade || "—"}</p>}
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Bairro</p>
                    {editing ? <input value={editForm.bairro} onChange={(e) => setEditForm(f => ({ ...f, bairro: e.target.value }))} className={mInput} placeholder="Bairro" />
                    : <p className={`text-[13px] ${mP} mt-0.5`}>{c.bairro || "—"}</p>}
                  </div>
                </div>
              </div>

              <div className={`mx-5 mt-3 p-4 rounded-xl border ${mSec}`}>
                <p className={`text-xs font-bold ${mP} mb-3`}>Resumo Financeiro</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Total Compras</p>
                    <p className="text-[14px] font-bold text-[#E8740E] mt-0.5">{c.total_compras}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Total Gasto</p>
                    <p className="text-[14px] font-bold text-green-600 mt-0.5">{fmt(c.total_gasto)}</p>
                  </div>
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Cliente Desde</p>
                    <p className={`text-[13px] ${mP} mt-0.5`}>{fmtDate(c.cliente_desde)}</p>
                  </div>
                </div>
              </div>

              {editing && (
                <div className="mx-5 mt-3 flex gap-2">
                  <button onClick={saveEdit} disabled={savingClient} className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] disabled:opacity-50">
                    {savingClient ? "Salvando..." : "Salvar Alteracoes"}
                  </button>
                  <button onClick={() => setEditing(false)} className={`px-4 py-3 rounded-xl border text-sm font-semibold ${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#D2D2D7] text-[#86868B]"}`}>Cancelar</button>
                </div>
              )}

              <div className={`mx-5 mt-3 p-4 rounded-xl border ${mSec}`}>
                <p className={`text-xs font-bold ${mP} mb-3`}>Ultimas Operacoes ({c.vendas.length})</p>
                {c.vendas.length === 0 ? (
                  <p className={`text-sm text-center py-4 ${mS}`}>Nenhuma operacao encontrada</p>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {c.vendas.map((v) => (
                      <div key={v.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs ${dm ? "bg-[#1C1C1E] hover:bg-[#252525]" : "bg-white hover:bg-[#F5F5F7]"} transition-colors`}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className={`shrink-0 ${mS}`}>{fmtDate(v.data)}</span>
                          <span className={`font-medium truncate ${mP}`}>{v.produto}</span>
                          {v.serial_no && <span className="text-purple-500 font-mono shrink-0">SN: {v.serial_no}</span>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-2">
                          <span className={mS}>{v.forma} · {v.banco}</span>
                          <span className="font-bold text-green-600 w-20 text-right">{fmt(v.preco_vendido)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mx-5 mt-4 mb-5">
                <button onClick={() => { setDetailClient(null); setEditing(false); }} className={`w-full py-3 rounded-xl text-sm font-semibold ${dm ? "bg-[#3A3A3C] text-[#F5F5F7] hover:bg-[#4A4A4C]" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"} transition-colors`}>
                  Fechar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
