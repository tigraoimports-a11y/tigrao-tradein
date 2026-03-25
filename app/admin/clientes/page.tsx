"use client";

import React, { useEffect, useState, useCallback } from "react";
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

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtDate = (d: string) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};

export default function ClientesPage() {
  const { password, darkMode: dm, apiHeaders } = useAdmin();
  const [tab, setTab] = useState<"clientes" | "lojistas" | "notas">("clientes");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [notas, setNotas] = useState<{ id: string; data: string; cliente: string; produto: string; preco_vendido: number; nota_fiscal_url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [totals, setTotals] = useState({ total: 0, total_gasto: 0, total_compras: 0 });
  const [sortBy, setSortBy] = useState<"gasto" | "compras" | "nome" | "recente">("gasto");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchClientes = useCallback(async () => {
    if (!password) return; // aguardar autenticação
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/admin/clientes?${params}`, {
        headers: apiHeaders(),
      });
      if (res.ok) {
        const json = await res.json();
        if (tab === "notas") {
          setNotas(json.notas ?? []);
          setTotals({ total: json.total ?? 0, total_gasto: 0, total_compras: 0 });
        } else {
          setClientes(json.clientes ?? []);
          setTotals({ total: json.total, total_gasto: json.total_gasto, total_compras: json.total_compras });
        }
      } else {
        console.error("Clientes API error:", res.status, await res.text().catch(() => ""));
      }
    } catch (err) { console.error("Clientes fetch error:", err); }
    setLoading(false);
  }, [password, tab, debouncedSearch, apiHeaders]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  // Sort
  const sorted = [...clientes].sort((a, b) => {
    switch (sortBy) {
      case "gasto": return b.total_gasto - a.total_gasto;
      case "compras": return b.total_compras - a.total_compras;
      case "nome": return a.nome.localeCompare(b.nome);
      case "recente": return b.ultima_compra.localeCompare(a.ultima_compra);
      default: return 0;
    }
  });

  const cardCls = `${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-4 shadow-sm`;
  const inputCls = `w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder-[#636366]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F] placeholder-[#86868B]"}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className={`text-2xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Clientes</h1>
        <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Base de clientes com historico de compras</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {([
          { key: "clientes" as const, label: "👤 Clientes" },
          { key: "lojistas" as const, label: "🏪 Lojistas" },
          { key: "notas" as const, label: "📄 Notas Fiscais" },
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
          placeholder="Pesquisar por nome, CPF ou numero de serie..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#86868B] hover:text-[#E8740E]">✕</button>
        )}
      </div>

      {/* Summary Cards */}
      {tab !== "notas" && <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
            {tab === "lojistas" ? "Total Lojistas" : "Total Clientes"}
          </p>
          <p className={`text-2xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{totals.total}</p>
        </div>
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Total Compras</p>
          <p className="text-2xl font-bold text-[#E8740E]">{totals.total_compras}</p>
        </div>
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Faturamento</p>
          <p className="text-2xl font-bold text-green-600">{fmt(totals.total_gasto)}</p>
        </div>
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Ticket Medio</p>
          <p className="text-2xl font-bold text-[#E8740E]">{totals.total_compras > 0 ? fmt(totals.total_gasto / totals.total_compras) : "R$ 0"}</p>
        </div>
      </div>}

      {/* Sort */}
      {tab !== "notas" && <div className="flex items-center gap-2">
        <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Ordenar:</span>
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
      </div>}

      {/* Notas Fiscais Tab */}
      {tab === "notas" ? (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                  {["Data", "Cliente", "Produto", "Valor", "Nota Fiscal"].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left font-medium text-xs uppercase tracking-wider whitespace-nowrap ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className={`px-4 py-12 text-center ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>Carregando...</td></tr>
                ) : notas.length === 0 ? (
                  <tr><td colSpan={5} className={`px-4 py-12 text-center ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>Nenhuma nota fiscal registrada</td></tr>
                ) : notas.map((n) => (
                  <tr key={n.id} className={`border-b transition-colors ${dm ? "border-[#2C2C2E] hover:bg-[#2C2C2E]" : "border-[#F5F5F7] hover:bg-[#FAFAFA]"}`}>
                    <td className={`px-4 py-3 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{fmtDate(n.data)}</td>
                    <td className={`px-4 py-3 font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{n.cliente}</td>
                    <td className={`px-4 py-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{n.produto}</td>
                    <td className="px-4 py-3 font-bold text-green-600">{fmt(n.preco_vendido)}</td>
                    <td className="px-4 py-3">
                      <a href={n.nota_fiscal_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-[#E8740E]/10 text-[#E8740E] text-xs font-semibold hover:bg-[#E8740E]/20 transition-colors">
                        📄 Ver PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (<>

      {/* Table */}
      <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                {["Cliente", tab === "lojistas" ? "CNPJ" : "CPF", "Compras", "Total Gasto", "Ultima Compra", "Cliente Desde", "Local"].map((h) => (
                  <th key={h} className={`px-4 py-3 text-left font-medium text-xs uppercase tracking-wider whitespace-nowrap ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className={`px-4 py-12 text-center ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>Carregando...</td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={7} className={`px-4 py-12 text-center ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>
                  {search ? `Nenhum resultado para "${search}"` : "Nenhum cliente encontrado"}
                </td></tr>
              ) : sorted.map((c) => (
                <React.Fragment key={c.nome}>
                  <tr
                    onClick={() => setExpandedId(expandedId === c.nome ? null : c.nome)}
                    className={`border-b cursor-pointer transition-colors ${dm ? "border-[#2C2C2E] hover:bg-[#2C2C2E]" : "border-[#F5F5F7] hover:bg-[#FAFAFA]"} ${expandedId === c.nome ? (dm ? "bg-[#2C2C2E]" : "bg-[#FFF8F0]") : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs">{expandedId === c.nome ? "▼" : "▶"}</span>
                        <div>
                          <p className={`font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{c.nome}</p>
                          {c.email && <p className={`text-xs ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>{c.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-xs font-mono ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{(tab === "lojistas" ? c.cnpj : c.cpf) || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-lg bg-[#E8740E]/10 text-[#E8740E] text-xs font-bold">{c.total_compras}</span>
                    </td>
                    <td className="px-4 py-3 font-bold text-green-600">{fmt(c.total_gasto)}</td>
                    <td className="px-4 py-3">
                      <p className={`text-xs ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{fmtDate(c.ultima_compra)}</p>
                      <p className={`text-xs truncate max-w-[150px] ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>{c.ultimo_produto}</p>
                    </td>
                    <td className={`px-4 py-3 text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{fmtDate(c.cliente_desde)}</td>
                    <td className={`px-4 py-3 text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                      {c.bairro ? `${c.bairro}${c.cidade ? `, ${c.cidade}` : ""}` : c.cidade || "—"}
                    </td>
                  </tr>

                  {/* Expanded: lista de compras */}
                  {expandedId === c.nome && (
                    <tr>
                      <td colSpan={7} className={`px-6 py-4 ${dm ? "bg-[#1A1A1C]" : "bg-[#FAFAFA]"}`}>
                        <div className="space-y-3">
                          {/* Info do cliente */}
                          <div className="flex flex-wrap gap-4 text-xs">
                            {c.cpf && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>CPF: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{c.cpf}</strong></span>}
                            {c.cnpj && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>CNPJ: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{c.cnpj}</strong></span>}
                            {c.email && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Email: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{c.email}</strong></span>}
                            {c.bairro && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Bairro: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{c.bairro}</strong></span>}
                            {c.cidade && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Cidade: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{c.cidade}{c.uf ? ` - ${c.uf}` : ""}</strong></span>}
                          </div>

                          {/* Historico de compras */}
                          <p className={`text-xs font-bold uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                            Historico de compras ({c.vendas.length})
                          </p>
                          <div className="space-y-1">
                            {c.vendas.map((v) => (
                              <div key={v.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#2C2C2E]" : "bg-white"}`}>
                                <div className="flex items-center gap-3">
                                  <span className={dm ? "text-[#636366]" : "text-[#86868B]"}>{fmtDate(v.data)}</span>
                                  <span className={`font-medium ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{v.produto}</span>
                                  {v.serial_no && <span className={`font-mono ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>SN: {v.serial_no}</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className={dm ? "text-[#636366]" : "text-[#86868B]"}>{v.forma} · {v.banco}</span>
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

      {/* Footer count */}
      {!loading && sorted.length > 0 && (
        <p className={`text-xs text-center ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>
          Mostrando {sorted.length} {tab === "lojistas" ? "lojistas" : "clientes"}
        </p>
      )}
      </>)}
    </div>
  );
}
