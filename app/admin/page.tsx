"use client";

import { useEffect, useState, useCallback } from "react";

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
  const [password, setPassword] = useState("");
  const [inputPw, setInputPw] = useState("");
  const [pwError, setPwError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SimulacaoRow[] | null>(null);
  const [tab, setTab] = useState<"todos" | "GOSTEI" | "SAIR">("todos");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("admin_pw");
    if (saved) setPassword(saved);
  }, []);

  const fetchData = useCallback(async (pw: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats", {
        headers: { "x-admin-password": pw },
      });
      if (res.status === 401) {
        setPwError(true);
        setLoading(false);
        return false;
      }
      const json = await res.json();
      setData(json.data ?? []);
      setLoading(false);
      return true;
    } catch {
      setLoading(false);
      return false;
    }
  }, []);

  const handleLogin = async () => {
    setPwError(false);
    const ok = await fetchData(inputPw);
    if (ok) {
      setPassword(inputPw);
      localStorage.setItem("admin_pw", inputPw);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData(password);
    setRefreshing(false);
  };

  useEffect(() => {
    if (password) fetchData(password);
  }, [password, fetchData]);

  // --- LOGIN SCREEN ---
  if (!password || data === null) {
    return (
      <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🐯</div>
            <h1 className="text-2xl font-bold text-[#1D1D1F]">TigrãoImports</h1>
            <p className="text-[#86868B] text-sm mt-1">Painel Administrativo</p>
          </div>
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 space-y-4 shadow-sm">
            <input
              type="password"
              placeholder="Senha de acesso"
              value={inputPw}
              onChange={(e) => setInputPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="w-full px-4 py-3 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#E8740E] transition-colors"
            />
            {pwError && (
              <p className="text-[#E74C3C] text-sm text-center">Senha incorreta</p>
            )}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </div>
        </div>
      </div>
    );
  }

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

  // Filtered rows
  const filtered = data.filter((d) => {
    if (tab !== "todos" && d.status !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        d.nome?.toLowerCase().includes(s) ||
        d.whatsapp?.includes(s) ||
        d.modelo_novo?.toLowerCase().includes(s) ||
        d.modelo_usado?.toLowerCase().includes(s)
      );
    }
    return true;
  });

  const kpis = [
    { label: "Total simulações", value: total, color: "#E8740E", icon: "📊" },
    { label: "Fecharam pedido", value: gostei, color: "#2ECC71", icon: "✅" },
    { label: "Saíram sem fechar", value: saiu, color: "#E74C3C", icon: "🚪" },
    { label: "Conversão", value: `${conversao}%`, color: "#3498DB", icon: "📈" },
    { label: "Ticket médio PIX", value: fmt(ticketMedio), color: "#9B59B6", icon: "💵" },
    { label: "Valor em negociação", value: fmt(totalValor), color: "#F39C12", icon: "💰" },
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F]">
      {/* Header */}
      <div className="bg-white border-b border-[#D2D2D7] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🐯</span>
          <div>
            <h1 className="text-lg font-bold text-[#1D1D1F]">TigrãoImports</h1>
            <p className="text-[#86868B] text-xs">Painel Administrativo</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-50"
          >
            {refreshing ? "↻ Atualizando..." : "↻ Atualizar"}
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("admin_pw");
              setPassword("");
              setData(null);
            }}
            className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E74C3C] hover:text-[#E74C3C] transition-colors"
          >
            Sair
          </button>
        </div>
      </div>

      <div className="p-6 max-w-[1400px] mx-auto space-y-6">
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
              <div className="flex gap-2">
                {(["todos", "GOSTEI", "SAIR"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      tab === t
                        ? t === "GOSTEI"
                          ? "bg-green-100 text-green-700"
                          : t === "SAIR"
                          ? "bg-red-100 text-red-600"
                          : "bg-orange-100 text-[#E8740E]"
                        : "text-[#86868B] hover:text-[#1D1D1F]"
                    }`}
                  >
                    {t === "todos" ? `Todos (${total})` : t === "GOSTEI" ? `Fecharam (${gostei})` : `Saíram (${saiu})`}
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

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                    {["Contato", "Data", "Nome", "WhatsApp", "Produto novo", "Aparelho na troca", "Avaliação", "Diferença PIX", "Pagamento", "Status"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-[#86868B]">
                        Nenhuma simulação encontrada
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors"
                      >
                        <td className="px-4 py-3 whitespace-nowrap">
                          <button
                            onClick={() => {
                              const num = row.whatsapp.replace(/\D/g, "");
                              const full = num.startsWith("55") ? num : `55${num}`;
                              const msg =
                                `Ol\u00E1 ${row.nome}! \u{1F60A} Vi que voc\u00EA fez uma simula\u00E7\u00E3o de trade-in no site da Tigr\u00E3oImports.\n\n` +
                                `\u{1F4F1} *Simula\u00E7\u00E3o:*\n` +
                                `\u{1F195} Novo: ${row.modelo_novo} ${row.storage_novo} (${fmt(row.preco_novo)})\n` +
                                `\u{1F504} Usado: ${row.modelo_usado} ${row.storage_usado} \u2014 Avaliado em ${fmt(row.avaliacao_usado)}\n` +
                                `\u{1F4B5} Diferen\u00E7a no PIX: ${fmt(row.diferenca)}\n` +
                                (row.forma_pagamento ? `\u{1F4B3} Pagamento escolhido: ${row.forma_pagamento}\n` : "") +
                                `\nPosso te fazer uma proposta especial? \u{1F42F}`;
                              window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, "_blank");
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white text-xs font-semibold transition-colors"
                          >
                            {"\u{1F4AC}"} WhatsApp
                          </button>
                        </td>
                        <td className="px-4 py-3 text-[#86868B] whitespace-nowrap text-xs">
                          {fmtDate(row.created_at)}
                        </td>
                        <td className="px-4 py-3 text-[#1D1D1F] font-medium whitespace-nowrap">
                          {row.nome}
                        </td>
                        <td className="px-4 py-3">
                          <a
                            href={(() => { const n = row.whatsapp.replace(/\D/g, ""); return `https://wa.me/${n.startsWith("55") ? n : `55${n}`}`; })()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-600 hover:underline whitespace-nowrap"
                          >
                            {row.whatsapp}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-[#1D1D1F] whitespace-nowrap">
                          {row.modelo_novo} {row.storage_novo}
                          <span className="text-[#86868B] ml-1 text-xs">({fmt(row.preco_novo)})</span>
                        </td>
                        <td className="px-4 py-3 text-[#6E6E73] whitespace-nowrap">
                          {row.modelo_usado} {row.storage_usado}
                        </td>
                        <td className="px-4 py-3 text-green-600 font-medium whitespace-nowrap">
                          {fmt(row.avaliacao_usado)}
                        </td>
                        <td className="px-4 py-3 text-[#E8740E] font-bold whitespace-nowrap">
                          {fmt(row.diferenca)}
                        </td>
                        <td className="px-4 py-3 text-[#6E6E73] text-xs max-w-[160px] truncate">
                          {row.forma_pagamento || "—"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                              row.status === "GOSTEI"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-600"
                            }`}
                          >
                            {row.status === "GOSTEI" ? "✅ Fechou" : "🚪 Saiu"}
                          </span>
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
              <h3 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-4">
                📱 Modelos mais buscados
              </h3>
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
                        <div
                          className="h-full bg-gradient-to-r from-[#E8740E] to-[#F5A623] rounded-full transition-all"
                          style={{ width: `${(count / maxModeloCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Últimas 24h */}
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#86868B] uppercase tracking-wider mb-4">
                ⏱️ Últimas 24 horas
              </h3>
              {(() => {
                const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const recentes = data.filter((d) => new Date(d.created_at) > ontem);
                const recGostei = recentes.filter((d) => d.status === "GOSTEI").length;
                const recSair = recentes.filter((d) => d.status === "SAIR").length;
                return (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-[#86868B] text-sm">Simulações</span>
                      <span className="text-[#1D1D1F] font-bold">{recentes.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#86868B] text-sm">Fecharam</span>
                      <span className="text-green-600 font-bold">{recGostei}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#86868B] text-sm">Saíram</span>
                      <span className="text-red-500 font-bold">{recSair}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
