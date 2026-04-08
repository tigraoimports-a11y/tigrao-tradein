"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { useSearchParams } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminShell";
import { corParaPT } from "@/lib/cor-pt";

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

interface Estorno {
  id: string;
  data: string;
  hora: string | null;
  valor: number;
  banco: string;
  descricao: string | null;
  observacao: string | null;
  venda_id: string | null;
  contato_tipo: string | null;
}

function EstornosSection({ contatoNome, apiHeaders, dm }: { contatoNome: string; apiHeaders: () => HeadersInit; dm: boolean }) {
  const [estornos, setEstornos] = useState<Estorno[]>([]);
  const [loading, setLoading] = useState(false);
  const mSec = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const mP = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const mS = dm ? "text-[#98989D]" : "text-[#86868B]";

  useEffect(() => {
    if (!contatoNome) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/gastos?categoria=ESTORNO&contato_nome=${encodeURIComponent(contatoNome)}`, { headers: apiHeaders() })
      .then(r => r.json())
      .then(j => { if (!cancelled) setEstornos(j.data || []); })
      .catch(() => { if (!cancelled) setEstornos([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contatoNome, apiHeaders]);

  if (!loading && estornos.length === 0) return null;

  const total = estornos.reduce((s, e) => s + Number(e.valor || 0), 0);

  return (
    <div className={`mx-5 mt-3 p-4 rounded-xl border ${mSec}`}>
      <div className="flex items-center justify-between mb-3">
        <p className={`text-xs font-bold ${mP}`}>↩️ Estornos ({estornos.length})</p>
        <span className="text-sm font-bold text-red-500">{fmt(total)}</span>
      </div>
      {loading ? (
        <p className={`text-xs text-center py-2 ${mS}`}>Carregando…</p>
      ) : (
        <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
          {estornos.map(e => (
            <div key={e.id} className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs ${dm ? "bg-[#1C1C1E]" : "bg-white"}`}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className={`shrink-0 ${mS}`}>{fmtDate(e.data)}</span>
                <span className={`font-medium truncate ${mP}`}>{e.descricao || e.observacao || "—"}</span>
                {e.venda_id && <span className="text-purple-500 font-mono shrink-0 text-[10px]">venda {e.venda_id.slice(0, 8)}…</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-2">
                <span className={mS}>{e.banco?.replace("_", " ")}</span>
                <span className="font-bold text-red-500 w-20 text-right">{fmt(Number(e.valor))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const toggleDate = (key: string) => setExpandedDates(prev => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
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

  // Crédito de lojistas
  const [saldosLojistas, setSaldosLojistas] = useState<Record<string, number>>({});
  type CreditoLog = { id: string; tipo: string; valor: number; saldo_antes: number; saldo_depois: number; motivo: string | null; usuario: string | null; created_at: string };
  const [creditoModal, setCreditoModal] = useState<null | { cliente: Cliente; saldo: number; log: CreditoLog[] }>(null);
  const [creditoForm, setCreditoForm] = useState({ tipo: "CREDITO" as "CREDITO" | "DEBITO" | "AJUSTE", valor: "", motivo: "" });
  const [savingCredito, setSavingCredito] = useState(false);

  const normalizeNome = (n: string | null | undefined) =>
    (n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

  const lojistaKey = (c: { cpf: string | null; cnpj: string | null; nome: string }) => {
    const d = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
    if (d(c.cpf)) return `cpf:${d(c.cpf)}`;
    if (d(c.cnpj)) return `cnpj:${d(c.cnpj)}`;
    return `nome:${normalizeNome(c.nome)}`;
  };

  const fetchSaldosLojistas = useCallback(async () => {
    if (!password) return;
    try {
      const res = await fetch(`/api/admin/lojistas-credito?_t=${Date.now()}`, { headers: apiHeaders(), cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        console.log("[lojistas-credito] API retornou", json._count, "rows:", json.lojistas?.map((l: { cliente_key: string; saldo: number }) => ({ key: l.cliente_key, saldo: l.saldo })));
        // STRICT: indexa APENAS pelo cliente_key canônico. Nada de fallback por nome/cpf/cnpj soltos
        // (isso antes causava colisões se rows antigas tivessem cliente_key vazio/genérico).
        const map: Record<string, number> = {};
        for (const l of json.lojistas || []) {
          if (!l.cliente_key) continue;
          map[l.cliente_key] = Number(l.saldo || 0);
        }
        setSaldosLojistas(map);
      }
    } catch (err) { console.error(err); }
  }, [password, apiHeaders]);

  useEffect(() => { if (tab === "lojistas") fetchSaldosLojistas(); }, [tab, fetchSaldosLojistas]);

  const openCreditoModal = async (c: Cliente) => {
    try {
      const params = new URLSearchParams();
      if (c.cpf) params.set("cpf", c.cpf);
      if (c.cnpj) params.set("cnpj", c.cnpj);
      if (!c.cpf && !c.cnpj) params.set("nome", c.nome);
      const res = await fetch(`/api/admin/lojistas-credito?${params}`, { headers: apiHeaders() });
      const json = await res.json();
      setCreditoModal({ cliente: c, saldo: Number(json.saldo || 0), log: json.log || [] });
      setCreditoForm({ tipo: "CREDITO", valor: "", motivo: "" });
    } catch (err) { console.error(err); }
  };

  const salvarCredito = async () => {
    if (!creditoModal) return;
    const valor = parseFloat(creditoForm.valor);
    if (!valor || valor <= 0) { alert("Valor inválido"); return; }
    setSavingCredito(true);
    try {
      const res = await fetch("/api/admin/lojistas-credito", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: { nome: creditoModal.cliente.nome, cpf: creditoModal.cliente.cpf, cnpj: creditoModal.cliente.cnpj },
          tipo: creditoForm.tipo,
          valor,
          motivo: creditoForm.motivo || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error || "Erro"); return; }
      await fetchSaldosLojistas();
      await openCreditoModal(creditoModal.cliente); // refresh modal data
      setCreditoForm({ tipo: "CREDITO", valor: "", motivo: "" });
    } finally { setSavingCredito(false); }
  };

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const prevTabRef = React.useRef(tab);
  const fetchClientes = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    // Só limpa state quando a tab MUDA (evita flicker a cada autorefetch de 20s)
    if (prevTabRef.current !== tab) {
      setClientes([]);
      setFornecedores([]);
      setNotas([]);
      setTotals({ total: 0, total_gasto: 0, total_compras: 0, total_investido: 0, total_em_estoque: 0, total_produtos: 0 });
      prevTabRef.current = tab;
    }
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
  useAutoRefetch(fetchClientes);

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

                  {/* Historico de compras agrupado por data */}
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${mS} mb-2`}>
                      Historico de compras ({f.compras.length} itens)
                    </p>
                    {f.compras.length === 0 ? (
                      <p className={`text-sm ${mM} py-4 text-center`}>Nenhuma compra registrada ainda</p>
                    ) : (() => {
                      // Agrupa por data
                      const groups = new Map<string, typeof f.compras>();
                      for (const c of f.compras) {
                        const k = c.data || "—";
                        if (!groups.has(k)) groups.set(k, []);
                        groups.get(k)!.push(c);
                      }
                      const sorted = Array.from(groups.entries()).sort((a, b) => (b[0] || "").localeCompare(a[0] || ""));
                      const semSerialTotal = f.compras.filter(c => !c.serial_no).length;
                      return (
                        <>
                          {semSerialTotal > 0 && (
                            <p className="text-[11px] text-amber-600 mb-2">
                              ⚠️ {semSerialTotal} {semSerialTotal === 1 ? "item está" : "itens estão"} sem número de série
                            </p>
                          )}
                          <div className="space-y-1 max-h-[500px] overflow-y-auto">
                            {sorted.map(([data, itens]) => {
                              const key = `${f.id || f.nome}:${data}`;
                              const isOpen = expandedDates.has(key);
                              const totalQnt = itens.reduce((s, c) => s + (c.qnt || 1), 0);
                              const totalValor = itens.reduce((s, c) => s + (c.custo_unitario || 0) * (c.qnt || 1), 0);
                              const semSerial = itens.filter(c => !c.serial_no).length;
                              const statusCount: Record<string, number> = {};
                              itens.forEach(c => { const s = c.status || "—"; statusCount[s] = (statusCount[s] || 0) + (c.qnt || 1); });
                              return (
                                <div key={key} className={`rounded-lg ${dm ? "bg-[#2C2C2E]" : "bg-[#F9F9FB]"}`}>
                                  <button
                                    onClick={() => toggleDate(key)}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:opacity-80 transition-opacity`}
                                  >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                      <span className={`shrink-0 ${mM}`}>{isOpen ? "▼" : "▶"}</span>
                                      <span className={`font-semibold ${mP}`}>{fmtDate(data)}</span>
                                      <span className={mS}>{totalQnt} {totalQnt === 1 ? "item" : "itens"}</span>
                                      {semSerial > 0 && (
                                        <span className="text-amber-600 text-[10px]">⚠ {semSerial} sem SN</span>
                                      )}
                                      <div className="flex items-center gap-1">
                                        {Object.entries(statusCount).map(([st, qt]) => (
                                          <span key={st} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                            st === "EM ESTOQUE" ? "bg-green-500/10 text-green-600" :
                                            st === "ESGOTADO" ? "bg-red-500/10 text-red-500" :
                                            st === "VENDIDO" ? "bg-blue-500/10 text-blue-500" :
                                            st === "A CAMINHO" ? "bg-purple-500/10 text-purple-500" :
                                            `${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#F2F2F7] text-[#86868B]"}`
                                          }`}>{qt} {st}</span>
                                        ))}
                                      </div>
                                    </div>
                                    <span className="font-bold text-red-500 w-28 text-right shrink-0">{fmt(totalValor)}</span>
                                  </button>
                                  {isOpen && (
                                    <div className={`border-t ${dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"} px-3 py-2 space-y-1`}>
                                      {itens.map((c, i) => (
                                        <div key={i} className="flex items-center justify-between text-[11px] py-1">
                                          <div className="flex items-center gap-2 flex-1 min-w-0">
                                            <span className={`font-medium truncate ${mP}`}>{c.produto}</span>
                                            {c.cor && <span className={`shrink-0 ${mS}`}>{corParaPT(c.cor)}</span>}
                                            {c.serial_no
                                              ? <span className="text-purple-500 font-mono shrink-0">SN: {c.serial_no}</span>
                                              : <span className="text-amber-600 shrink-0">⚠ sem SN</span>}
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0 ml-2">
                                            <span className={mM}>{c.qnt}x</span>
                                            <span className="font-bold text-red-500 w-20 text-right">{fmt(c.custo_unitario * c.qnt)}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                <EstornosSection contatoNome={f.nome} apiHeaders={apiHeaders} dm={dm} />
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

      {tab === "lojistas" && (
        <div className="flex justify-end">
          <button
            onClick={async () => {
              if (!confirm("Zerar os saldos de crédito de TODOS os lojistas? Isso apaga o histórico e zera a tabela lojistas_credito. Não pode ser desfeito.")) return;
              const res = await fetch(`/api/admin/lojistas-credito?all=1`, { method: "DELETE", headers: apiHeaders() });
              const j = await res.json();
              if (!res.ok) { alert(j.error || "Erro"); return; }
              await fetchSaldosLojistas();
              alert("Todos os saldos foram zerados.");
            }}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700">
            Zerar todos os saldos de crédito
          </button>
        </div>
      )}

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
                {["Cliente", tab === "lojistas" ? "CNPJ" : "CPF", "Compras", "Total Gasto", ...(tab === "lojistas" ? ["Saldo Crédito", ""] : []), "Ultima Compra", "Cliente Desde", "Local"].map((h, i) => (
                  <th key={`${h}-${i}`} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => { const colSpan = tab === "lojistas" ? 9 : 7; return loading ? (
                <tr><td colSpan={colSpan} className={`px-4 py-12 text-center ${mM}`}>Carregando...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={colSpan} className={`px-4 py-12 text-center ${mM}`}>
                  {search ? `Nenhum resultado para "${search}"` : "Nenhum cliente encontrado"}
                </td></tr>
              ) : null; })()}
              {!loading && sorted.map((c) => (
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
                    {tab === "lojistas" && (<>
                      <td className="px-4 py-3">
                        {(() => {
                          const s = saldosLojistas[lojistaKey(c)] || 0;
                          return <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold ${s > 0 ? "bg-blue-100 text-blue-700" : `${dm ? "bg-[#2C2C2E] text-[#86868B]" : "bg-[#F5F5F7] text-[#86868B]"}`}`}>{fmt(s)}</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openCreditoModal(c)} className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D]">Gerenciar crédito</button>
                      </td>
                    </>)}
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
                      <td colSpan={tab === "lojistas" ? 9 : 7} className={`px-6 py-4 ${dm ? "bg-[#1A1A1C]" : "bg-[#FAFAFA]"}`}>
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

      {/* Modal de Crédito do Lojista */}
      {creditoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setCreditoModal(null)}>
          <div className={`w-full max-w-lg rounded-2xl shadow-2xl ${dm ? "bg-[#1C1C1E]" : "bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between">
              <div>
                <p className={`text-xs uppercase tracking-wider ${mS}`}>Crédito do lojista</p>
                <h3 className={`text-base font-bold ${mP}`}>{creditoModal.cliente.nome}</h3>
              </div>
              <button onClick={() => setCreditoModal(null)} className={`text-2xl ${mS} hover:text-red-500`}>×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className={`p-4 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                <p className={`text-xs uppercase tracking-wider ${mS}`}>Saldo disponível</p>
                <p className="text-3xl font-bold text-blue-600 mt-1">{fmt(creditoModal.saldo)}</p>
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  {(["CREDITO", "DEBITO", "AJUSTE"] as const).map(t => (
                    <button key={t} onClick={() => setCreditoForm(f => ({ ...f, tipo: t }))}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold ${creditoForm.tipo === t ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}`}>
                      {t === "CREDITO" ? "+ Adicionar" : t === "DEBITO" ? "− Debitar" : "= Ajustar"}
                    </button>
                  ))}
                </div>
                <input type="number" value={creditoForm.valor} onChange={(e) => setCreditoForm(f => ({ ...f, valor: e.target.value }))}
                  placeholder="Valor R$" className={`w-full px-3 py-2 rounded-lg border text-sm ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`} />
                <input type="text" value={creditoForm.motivo} onChange={(e) => setCreditoForm(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Motivo (opcional)" className={`w-full px-3 py-2 rounded-lg border text-sm ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`} />
                <button onClick={salvarCredito} disabled={savingCredito}
                  className="w-full py-2.5 rounded-lg bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] disabled:opacity-50">
                  {savingCredito ? "Salvando..." : "Salvar movimentação"}
                </button>
                {creditoModal.saldo > 0 && (
                  <button
                    onClick={async () => {
                      if (!creditoModal) return;
                      if (!confirm(`Apagar o saldo de crédito de ${creditoModal.cliente.nome}? (R$ ${creditoModal.saldo.toLocaleString("pt-BR")})`)) return;
                      const params = new URLSearchParams();
                      if (creditoModal.cliente.cpf) params.set("cpf", creditoModal.cliente.cpf);
                      if (creditoModal.cliente.cnpj) params.set("cnpj", creditoModal.cliente.cnpj);
                      if (!creditoModal.cliente.cpf && !creditoModal.cliente.cnpj) params.set("nome", creditoModal.cliente.nome);
                      const res = await fetch(`/api/admin/lojistas-credito?${params}`, { method: "DELETE", headers: apiHeaders() });
                      const j = await res.json();
                      if (!res.ok) { alert(j.error || "Erro"); return; }
                      await fetchSaldosLojistas();
                      setCreditoModal(null);
                    }}
                    className="w-full py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700">
                    Apagar saldo deste lojista
                  </button>
                )}
              </div>
              <div>
                <p className={`text-[10px] uppercase tracking-wider font-bold ${mS} mb-2`}>Extrato ({creditoModal.log.length})</p>
                <div className="max-h-[300px] overflow-y-auto space-y-1.5">
                  {creditoModal.log.length === 0 && <p className={`text-xs text-center ${mM} py-4`}>Sem movimentações</p>}
                  {creditoModal.log.map(l => (
                    <div key={l.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#2C2C2E]" : "bg-[#F9F9FB]"}`}>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold ${mP}`}>
                          <span className={l.tipo === "CREDITO" ? "text-green-600" : l.tipo === "DEBITO" ? "text-red-600" : "text-blue-600"}>
                            {l.tipo === "CREDITO" ? "+" : l.tipo === "DEBITO" ? "−" : "="} {fmt(Number(l.valor))}
                          </span>
                          <span className={`ml-2 text-[10px] ${mS}`}>Saldo: {fmt(Number(l.saldo_depois))}</span>
                        </p>
                        {l.motivo && <p className={`text-[10px] truncate ${mM}`}>{l.motivo}</p>}
                      </div>
                      <div className={`text-[10px] ${mM} text-right shrink-0`}>
                        <p>{new Date(l.created_at).toLocaleDateString("pt-BR")}</p>
                        <p>{l.usuario}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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

              <EstornosSection contatoNome={c.nome} apiHeaders={apiHeaders} dm={dm} />

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
