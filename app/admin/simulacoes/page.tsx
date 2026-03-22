"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { useAdmin } from "@/components/admin/AdminShell";

const FunnelPanel = dynamic(() => import("@/app/admin/analytics/page"), { ssr: false });

interface SimulacaoRow {
  id: string;
  created_at: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  modelo_novo: string;
  storage_novo: string;
  preco_novo: number;
  modelo_usado: string;
  storage_usado: string;
  avaliacao_usado: number;
  diferenca: number;
  status: "GOSTEI" | "SAIR";
  forma_pagamento: string | null;
  condicao_linhas: string[] | null;
  contatado: boolean | null;
  vendedor: string | null;
}

const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR")}`;

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AdminPage() {
  const { password } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SimulacaoRow[] | null>(null);
  const [tab, setTab] = useState<"todos" | "GOSTEI" | "SAIR" | "PENDENTE">("todos");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [modalRow, setModalRow] = useState<SimulacaoRow | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<"todos" | "hoje" | "ontem" | "7dias" | "30dias" | "mes" | "personalizado">("todos");
  const [filterModelo, setFilterModelo] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [mainTab, setMainTab] = useState<"simulacoes" | "funil">("simulacoes");

  const fetchData = useCallback(async (pw: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": pw },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(password);
    setRefreshing(false);
  };

  useEffect(() => {
    if (password) fetchData(password);
  }, [password, fetchData]);

  // Unique models for filter dropdown — must be before any early return (Rules of Hooks)
  const uniqueModelos = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.map((d) => d.modelo_novo))].sort();
  }, [data]);

  if (loading && data === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#86868B]">Carregando...</p>
      </div>
    );
  }

  if (!data) return null;

  // --- STATS ---
  const total = data.length;
  const gostei = data.filter((d) => d.status === "GOSTEI").length;
  const saiu = data.filter((d) => d.status === "SAIR").length;
  const conversao = total > 0 ? Math.round((gostei / total) * 100) : 0;
  const ticketMedio = total > 0
    ? Math.round(data.reduce((acc, d) => acc + d.diferenca, 0) / total)
    : 0;
  const totalValor = data.reduce((acc, d) => acc + d.diferenca, 0);

  // Top modelos
  const modeloCount: Record<string, number> = {};
  data.forEach((d) => {
    const key = `${d.modelo_novo} ${d.storage_novo}`;
    modeloCount[key] = (modeloCount[key] || 0) + 1;
  });
  const topModelos = Object.entries(modeloCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);
  const maxModeloCount = topModelos[0]?.[1] ?? 1;

  const pendente = data.filter((d) => !d.contatado).length;

  // Filtered rows
  const filtered = data.filter((d) => {
    if (tab === "PENDENTE") return !d.contatado;
    if (tab !== "todos" && d.status !== tab) return false;

    if (search) {
      const s = search.toLowerCase();
      const match =
        d.nome?.toLowerCase().includes(s) ||
        d.whatsapp?.includes(s) ||
        d.modelo_novo?.toLowerCase().includes(s) ||
        d.modelo_usado?.toLowerCase().includes(s);
      if (!match) return false;
    }

    if (filterModelo && d.modelo_novo !== filterModelo) return false;

    const created = new Date(d.created_at);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (filterPeriod === "hoje") {
      if (created < today) return false;
    } else if (filterPeriod === "ontem") {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (created < yesterday || created >= today) return false;
    } else if (filterPeriod === "7dias") {
      if (created < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) return false;
    } else if (filterPeriod === "30dias") {
      if (created < new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)) return false;
    } else if (filterPeriod === "mes") {
      if (created < new Date(now.getFullYear(), now.getMonth(), 1)) return false;
    } else if (filterPeriod === "personalizado") {
      if (filterFrom && created < new Date(filterFrom + "T00:00:00")) return false;
      if (filterTo && created > new Date(filterTo + "T23:59:59")) return false;
    }

    return true;
  });

  const hasActiveFilter = filterPeriod !== "todos" || filterModelo !== "";

  const kpis = [
    { label: "Total simulações", value: total, color: "#E8740E", icon: "📊" },
    { label: "Fecharam pedido", value: gostei, color: "#2ECC71", icon: "✅" },
    { label: "Saíram sem fechar", value: saiu, color: "#E74C3C", icon: "🚪" },
    { label: "Conversão", value: `${conversao}%`, color: "#3498DB", icon: "📈" },
    { label: "Ticket médio PIX", value: fmt(ticketMedio), color: "#9B59B6", icon: "💵" },
    { label: "Valor em negociação", value: fmt(totalValor), color: "#F39C12", icon: "💰" },
  ];

  return (
    <div className="space-y-6">
      {/* Main tabs: Simulações / Funil */}
      <div className="flex gap-2 items-center">
        {(["simulacoes", "funil"] as const).map((t) => (
          <button key={t} onClick={() => setMainTab(t)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${mainTab === t ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
            {t === "simulacoes" ? "Simulações" : "Funil de Conversão"}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-50"
        >
          {refreshing ? "↻ Atualizando..." : "↻ Atualizar"}
        </button>
      </div>

      {/* Funil tab — rendered inline */}
      {mainTab === "funil" && <FunnelPanel />}

      {/* Simulações tab — existing content */}
      {mainTab === "simulacoes" && (<>
      {/* Refresh button - moved to tabs row */}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-[#D2D2D7] rounded-2xl p-4 shadow-sm"
          >
            <div className="text-2xl mb-2">{kpi.icon}</div>
            <p className="text-[#86868B] text-xs mb-1">{kpi.label}</p>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>
              {kpi.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Main table */}
        <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
          {/* Table header */}
          <div className="px-5 py-4 border-b border-[#D2D2D7] flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex gap-2 flex-wrap">
              {(["todos", "GOSTEI", "SAIR", "PENDENTE"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === t
                      ? t === "GOSTEI"
                        ? "bg-green-100 text-green-700"
                        : t === "SAIR"
                        ? "bg-red-100 text-red-600"
                        : t === "PENDENTE"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-orange-100 text-[#E8740E]"
                      : "text-[#86868B] hover:text-[#1D1D1F]"
                  }`}
                >
                  {t === "todos"
                    ? `Todos (${total})`
                    : t === "GOSTEI"
                    ? `Fecharam (${gostei})`
                    : t === "SAIR"
                    ? `Saíram (${saiu})`
                    : `Pendente (${pendente})`}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Buscar nome, WhatsApp, produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-[#F5F5F7] border border-[#D2D2D7] text-sm text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#E8740E] transition-colors w-full sm:w-64"
            />
          </div>

          {/* Filter bar */}
          <div className="px-5 py-3 border-b border-[#D2D2D7] bg-[#FAFAFA] flex flex-wrap gap-3 items-center">
            <div className="flex gap-1.5 flex-wrap items-center">
              <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider mr-1">Período:</span>
              {(["todos", "hoje", "ontem", "7dias", "30dias", "mes", "personalizado"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPeriod(p)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    filterPeriod === p
                      ? "bg-[#E8740E] text-white"
                      : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"
                  }`}
                >
                  {p === "todos" ? "Tudo" : p === "hoje" ? "Hoje" : p === "ontem" ? "Ontem" : p === "7dias" ? "7 dias" : p === "30dias" ? "30 dias" : p === "mes" ? "Este mês" : "Personalizado"}
                </button>
              ))}
            </div>

            {filterPeriod === "personalizado" && (
              <div className="flex gap-2 items-center flex-wrap">
                <span className="text-[11px] text-[#86868B]">De:</span>
                <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="px-2 py-1 rounded-lg border border-[#D2D2D7] bg-white text-xs text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] transition-colors" />
                <span className="text-[11px] text-[#86868B]">até:</span>
                <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="px-2 py-1 rounded-lg border border-[#D2D2D7] bg-white text-xs text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] transition-colors" />
              </div>
            )}

            <div className="flex gap-1.5 items-center">
              <span className="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">Modelo:</span>
              <select value={filterModelo} onChange={(e) => setFilterModelo(e.target.value)} className="px-2 py-1 rounded-lg border border-[#D2D2D7] bg-white text-xs text-[#1D1D1F] focus:outline-none focus:border-[#E8740E] transition-colors">
                <option value="">Todos</option>
                {uniqueModelos.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>

            {hasActiveFilter && (
              <button onClick={() => { setFilterPeriod("todos"); setFilterModelo(""); setFilterFrom(""); setFilterTo(""); }} className="px-2.5 py-1 rounded-lg text-xs text-[#E74C3C] border border-[#E74C3C]/30 hover:bg-red-50 transition-colors ml-auto">
                Limpar filtros
              </button>
            )}

            {selected.size > 0 && (
              <button
                disabled={bulkDeleting}
                onClick={async () => {
                  if (!confirm(`Excluir ${selected.size} simulação(ões) selecionada(s)?`)) return;
                  setBulkDeleting(true);
                  await Promise.all([...selected].map((id) =>
                    fetch("/api/admin/simulacoes", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json", "x-admin-password": password },
                      body: JSON.stringify({ id }),
                    })
                  ));
                  setData((prev) => prev ? prev.filter((r) => !selected.has(r.id)) : prev);
                  setSelected(new Set());
                  setBulkDeleting(false);
                }}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 ml-auto"
              >
                {bulkDeleting ? "Excluindo..." : `Excluir ${selected.size} selecionado${selected.size !== 1 ? "s" : ""}`}
              </button>
            )}

            <span className={`text-[11px] text-[#86868B] ${selected.size > 0 ? "" : "ml-auto"}`}>
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelected(new Set(filtered.map((r) => r.id)));
                        else setSelected(new Set());
                      }}
                      className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                    />
                  </th>
                  {["Contato", "Data", "Nome", "WhatsApp", "Vendedor", "Produto novo", "Aparelho na troca", "Avaliação", "Diferença PIX", "Pagamento", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-[#86868B]">Nenhuma simulação encontrada</td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id} onClick={() => setModalRow(row)} className={`border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors cursor-pointer ${selected.has(row.id) ? "bg-orange-50" : ""}`}>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(row.id);
                            else next.delete(row.id);
                            setSelected(next);
                          }}
                          className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1 items-start">
                          <button
                            onClick={() => {
                              setData((prev) => prev ? prev.map((r) => r.id === row.id ? { ...r, contatado: true } : r) : prev);
                              fetch("/api/admin/contatar", {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "x-admin-password": password },
                                body: JSON.stringify({ id: row.id }),
                              });
                              const num = row.whatsapp.replace(/\D/g, "");
                              const full = num.startsWith("55") ? num : `55${num}`;
                              const condicoes = row.condicao_linhas?.join("\n") ?? "";
                              const msg = [
                                `Ola ${row.nome}!`,
                                ``,
                                `Vi que voce fez uma simulacao de trade-in aqui na TigraoimportsImports`,
                                ``,
                                `Produto novo: ${row.modelo_novo} ${row.storage_novo} (R$ ${row.preco_novo.toLocaleString("pt-BR")})`,
                                `Seu aparelho: ${row.modelo_usado} ${row.storage_usado}`,
                                ...(condicoes ? [condicoes] : []),
                                `Avaliacao: R$ ${row.avaliacao_usado.toLocaleString("pt-BR")}`,
                                `Diferenca no PIX: R$ ${row.diferenca.toLocaleString("pt-BR")}`,
                                ``,
                                `Posso te fazer uma proposta especial?`,
                              ].join("\n");
                              window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, "_blank");
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
                          >
                            WhatsApp
                          </button>
                          {row.contatado && (
                            <span className="text-[10px] text-green-600 font-medium">Contatado</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#86868B] whitespace-nowrap text-xs">{fmtDate(row.created_at)}</td>
                      <td className="px-4 py-3 text-[#1D1D1F] font-medium whitespace-nowrap">{row.nome}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <a href={(() => { const n = row.whatsapp.replace(/\D/g, ""); return `https://wa.me/${n.startsWith("55") ? n : `55${n}`}`; })()} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline whitespace-nowrap">{row.whatsapp}</a>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.vendedor ? (
                          <span className="px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">{row.vendedor}</span>
                        ) : (
                          <span className="text-[#86868B] text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#1D1D1F] whitespace-nowrap">
                        {row.modelo_novo} {row.storage_novo}
                        <span className="text-[#86868B] ml-1 text-xs">({fmt(row.preco_novo)})</span>
                      </td>
                      <td className="px-4 py-3 text-[#6E6E73] whitespace-nowrap">{row.modelo_usado} {row.storage_usado}</td>
                      <td className="px-4 py-3 text-green-600 font-medium whitespace-nowrap">{fmt(row.avaliacao_usado)}</td>
                      <td className="px-4 py-3 text-[#E8740E] font-bold whitespace-nowrap">{fmt(row.diferenca)}</td>
                      <td className="px-4 py-3 text-[#6E6E73] text-xs max-w-[160px] truncate">{row.forma_pagamento || "—"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${row.status === "GOSTEI" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                          {row.status === "GOSTEI" ? "Fechou" : "Saiu"}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          disabled={deleting === row.id}
                          onClick={async () => {
                            if (!confirm(`Excluir simulação de ${row.nome}?`)) return;
                            setDeleting(row.id);
                            await fetch("/api/admin/simulacoes", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json", "x-admin-password": password },
                              body: JSON.stringify({ id: row.id }),
                            });
                            setData((prev) => prev ? prev.filter((r) => r.id !== row.id) : prev);
                            setDeleting(null);
                          }}
                          className="p-1.5 rounded-lg text-[#86868B] hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="Excluir"
                        >
                          {deleting === row.id ? "..." : "X"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Top modelos */}
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-4">Modelos mais buscados</h3>
            <div className="space-y-3">
              {topModelos.length === 0 ? (
                <p className="text-[#86868B] text-sm">Nenhum dado ainda</p>
              ) : (
                topModelos.map(([modelo, count]) => (
                  <div key={modelo}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-[#1D1D1F] truncate flex-1">{modelo}</span>
                      <span className="text-[#E8740E] font-bold ml-2">{count}</span>
                    </div>
                    <div className="h-1.5 bg-[#E8E8ED] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#E8740E] to-[#F5A623] rounded-full transition-all" style={{ width: `${(count / maxModeloCount) * 100}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Por vendedor */}
          {(() => {
            const vendedorCount: Record<string, { total: number; gostei: number }> = {};
            data.forEach((d) => {
              const v = d.vendedor || "direto";
              if (!vendedorCount[v]) vendedorCount[v] = { total: 0, gostei: 0 };
              vendedorCount[v].total++;
              if (d.status === "GOSTEI") vendedorCount[v].gostei++;
            });
            const entries = Object.entries(vendedorCount).sort((a, b) => b[1].total - a[1].total);
            if (entries.length === 0) return null;
            return (
              <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-4">Por Origem / Vendedor</h3>
                <div className="space-y-2">
                  {entries.map(([v, s]) => (
                    <div key={v} className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 capitalize">{v}</span>
                      <div className="text-right">
                        <span className="text-[#1D1D1F] font-bold text-sm">{s.total}</span>
                        <span className="text-green-600 text-xs ml-2">({s.gostei})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Últimas 24h */}
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-4">Ultimas 24 horas</h3>
            {(() => {
              const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
              const recentes = data.filter((d) => new Date(d.created_at) > ontem);
              const recGostei = recentes.filter((d) => d.status === "GOSTEI").length;
              const recSair = recentes.filter((d) => d.status === "SAIR").length;
              return (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#86868B] text-sm">Simulacoes</span>
                    <span className="text-[#1D1D1F] font-bold">{recentes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#86868B] text-sm">Fecharam</span>
                    <span className="text-green-600 font-bold">{recGostei}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#86868B] text-sm">Sairam</span>
                    <span className="text-red-500 font-bold">{recSair}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {modalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setModalRow(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => setModalRow(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E8E8ED] flex items-center justify-center text-[#86868B] hover:text-[#1D1D1F] transition-colors text-sm font-bold"
            >
              X
            </button>

            <div className="p-6 space-y-5">
              {/* Header */}
              <div>
                <h2 className="text-lg font-bold text-[#1D1D1F] pr-8">Detalhes da Simulacao</h2>
                <p className="text-xs text-[#86868B] mt-1">{fmtDate(modalRow.created_at)}</p>
              </div>

              {/* Status badge */}
              <div>
                <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${modalRow.status === "GOSTEI" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                  {modalRow.status === "GOSTEI" ? "Fechou pedido" : "Saiu sem fechar"}
                </span>
                {modalRow.vendedor && (
                  <span className="ml-2 px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700">{modalRow.vendedor}</span>
                )}
              </div>

              {/* Customer info */}
              <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Cliente</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-[#86868B]">Nome:</span>
                    <p className="text-[#1D1D1F] font-medium">{modalRow.nome}</p>
                  </div>
                  <div>
                    <span className="text-[#86868B]">WhatsApp:</span>
                    <p className="text-[#1D1D1F] font-medium">{modalRow.whatsapp}</p>
                  </div>
                  {modalRow.instagram && (
                    <div className="col-span-2">
                      <span className="text-[#86868B]">Instagram:</span>
                      <p className="text-[#1D1D1F] font-medium">{modalRow.instagram}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* New product */}
              <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Produto Novo</h3>
                <p className="text-[#1D1D1F] font-medium text-sm">{modalRow.modelo_novo} {modalRow.storage_novo}</p>
                <p className="text-[#E8740E] font-bold text-sm">{fmt(modalRow.preco_novo)}</p>
              </div>

              {/* Used device */}
              <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Aparelho na Troca</h3>
                <p className="text-[#1D1D1F] font-medium text-sm">{modalRow.modelo_usado} {modalRow.storage_usado}</p>
                {modalRow.condicao_linhas && modalRow.condicao_linhas.length > 0 && (
                  <div className="text-xs text-[#6E6E73] space-y-0.5">
                    {modalRow.condicao_linhas.map((linha, i) => (
                      <p key={i}>{linha}</p>
                    ))}
                  </div>
                )}
                <p className="text-green-600 font-bold text-sm">Avaliacao: {fmt(modalRow.avaliacao_usado)}</p>
              </div>

              {/* Financial summary */}
              <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-2">
                <h3 className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Resumo Financeiro</h3>
                <div className="flex justify-between text-sm">
                  <span className="text-[#86868B]">Diferenca PIX:</span>
                  <span className="text-[#E8740E] font-bold">{fmt(modalRow.diferenca)}</span>
                </div>
                {modalRow.forma_pagamento && (
                  <div className="flex justify-between text-sm">
                    <span className="text-[#86868B]">Forma de pagamento:</span>
                    <span className="text-[#1D1D1F] font-medium">{modalRow.forma_pagamento}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    const num = modalRow.whatsapp.replace(/\D/g, "");
                    const full = num.startsWith("55") ? num : `55${num}`;
                    const msg = `Ola ${modalRow.nome}! Vi que voce fez uma simulacao de troca no nosso site. O ${modalRow.modelo_novo} ${modalRow.storage_novo} esta disponivel! Seu ${modalRow.modelo_usado} foi avaliado em ${fmt(modalRow.avaliacao_usado)}. Gostaria de continuar?`;
                    window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-semibold transition-colors text-center"
                >
                  Chamar no WhatsApp
                </button>
                <button
                  onClick={() => {
                    const params = new URLSearchParams({
                      recover: "true",
                      modelo_usado: modalRow.modelo_usado,
                      storage_usado: modalRow.storage_usado,
                      modelo_novo: modalRow.modelo_novo,
                      storage_novo: modalRow.storage_novo,
                    });
                    window.open(`/troca?${params.toString()}`, "_blank");
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#E8740E] hover:bg-[#D06A0C] text-white text-sm font-semibold transition-colors text-center"
                >
                  Recuperar Carrinho
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}
