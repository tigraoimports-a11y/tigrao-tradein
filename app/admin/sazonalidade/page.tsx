"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  CartesianGrid,
} from "recharts";

/* ─── Formatters ─── */
const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/* ─── Types ─── */
interface DiaSemanaData {
  dia: string;
  diaFull: string;
  vendas: number;
  faturamento: number;
  faturamentoMedio: number;
}

interface HoraData {
  hora: string;
  vendas: number;
}

interface TopProduto {
  produto: string;
  qtd: number;
  receita: number;
  prevQtd: number;
  trend: number;
}

interface SemanaData {
  semana: string;
  faturamento: number;
  vendas: number;
}

interface KPIs {
  melhorDia: { dia: string; faturamento: number; faturamentoMedio: number };
  horarioPico: { inicio: number; fim: number; pct: number; vendas: number };
  produtoMaisVendido: { nome: string; qtd: number; receita: number } | null;
  margemMedia: number;
  totalVendas: number;
  totalFaturamento: number;
}

interface SazonalidadeData {
  porDiaSemana: DiaSemanaData[];
  porHora: HoraData[];
  topProdutos: TopProduto[];
  faturamentoSemanal: SemanaData[];
  kpis: KPIs;
}

type RangeKey = "1m" | "3m" | "6m" | "1y" | "all";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "1m", label: "Este mes" },
  { key: "3m", label: "3 meses" },
  { key: "6m", label: "6 meses" },
  { key: "1y", label: "Ano" },
  { key: "all", label: "Tudo" },
];

/* ─── Custom Tooltip ─── */
function CustomTooltip({ active, payload, label, darkMode }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className={`p-3 rounded-xl shadow-lg border text-sm ${
      darkMode
        ? "bg-[#1A1A1A] border-[#333] text-[#F5F5F5]"
        : "bg-white border-[#D2D2D7] text-[#1D1D1F]"
    }`}>
      <p className="font-semibold">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" && p.value > 100 ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

/* ─── Section Wrapper ─── */
function Section({ title, children, darkMode }: { title: string; children: React.ReactNode; darkMode: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 ${
      darkMode
        ? "bg-[#141414] border-[#2A2A2A]"
        : "bg-white border-[#D2D2D7]"
    }`}>
      <h2 className={`text-lg font-semibold mb-4 ${darkMode ? "text-[#F5F5F5]" : "text-[#1D1D1F]"}`}>{title}</h2>
      {children}
    </div>
  );
}

/* ─── KPI Card ─── */
function KPICard({ icon, label, value, sub, darkMode }: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  darkMode: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-1 ${
      darkMode
        ? "bg-[#141414] border-[#2A2A2A]"
        : "bg-white border-[#D2D2D7]"
    }`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xl">{icon}</span>
        <span className={`text-xs font-medium uppercase tracking-wide ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>
          {label}
        </span>
      </div>
      <span className={`text-lg font-bold ${darkMode ? "text-[#F5F5F5]" : "text-[#1D1D1F]"}`}>{value}</span>
      <span className={`text-xs ${darkMode ? "text-[#777]" : "text-[#86868B]"}`}>{sub}</span>
    </div>
  );
}

/* ─── Skeleton ─── */
function SkeletonCard({ darkMode }: { darkMode: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 h-64 animate-pulse ${
      darkMode ? "bg-[#141414] border-[#2A2A2A]" : "bg-white border-[#D2D2D7]"
    }`}>
      <div className={`h-4 rounded w-1/3 mb-4 ${darkMode ? "bg-[#2A2A2A]" : "bg-[#E5E5EA]"}`} />
      <div className={`h-8 rounded w-1/2 mb-3 ${darkMode ? "bg-[#2A2A2A]" : "bg-[#E5E5EA]"}`} />
      <div className={`h-3 rounded w-2/3 mb-2 ${darkMode ? "bg-[#2A2A2A]" : "bg-[#E5E5EA]"}`} />
    </div>
  );
}

function SkeletonKPI({ darkMode }: { darkMode: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 animate-pulse ${
      darkMode ? "bg-[#141414] border-[#2A2A2A]" : "bg-white border-[#D2D2D7]"
    }`}>
      <div className={`h-3 rounded w-1/2 mb-3 ${darkMode ? "bg-[#2A2A2A]" : "bg-[#E5E5EA]"}`} />
      <div className={`h-7 rounded w-2/3 mb-2 ${darkMode ? "bg-[#2A2A2A]" : "bg-[#E5E5EA]"}`} />
      <div className={`h-3 rounded w-1/3 ${darkMode ? "bg-[#2A2A2A]" : "bg-[#E5E5EA]"}`} />
    </div>
  );
}

/* ─── Main Page ─── */
export default function SazonalidadePage() {
  const { apiHeaders, darkMode } = useAdmin();
  const [data, setData] = useState<SazonalidadeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("3m");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/sazonalidade?range=${range}`, {
        headers: apiHeaders(),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados");
    }
    setLoading(false);
  }, [range, apiHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartTextColor = darkMode ? "#999" : "#86868B";
  const gridColor = darkMode ? "#2A2A2A" : "#E5E5EA";

  /* ─── Error State ─── */
  if (error && !loading && !data) {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className={`rounded-2xl p-6 text-center border ${
          darkMode ? "bg-[#1A0A0A] border-[#E74C3C]/30" : "bg-[#FDEDED] border-[#E74C3C]"
        }`}>
          <p className="text-[#E74C3C] font-semibold text-lg mb-2">Erro ao carregar sazonalidade</p>
          <p className={`text-sm mb-4 ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>{error}</p>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-[#E8740E] text-white rounded-xl font-medium hover:bg-[#D06A0D] transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      {/* ─── HEADER ─── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${darkMode ? "text-[#F5F5F5]" : "text-[#1D1D1F]"}`}>
            Sazonalidade
          </h1>
          <p className={`text-sm ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>
            Analise padroes de venda por dia, horario e periodo
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex rounded-xl p-1 ${darkMode ? "bg-[#1A1A1A]" : "bg-[#E5E5EA]"}`}>
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  range === r.key
                    ? darkMode
                      ? "bg-[#2A2A2A] text-[#F5F5F5] shadow-sm"
                      : "bg-white text-[#1D1D1F] shadow-sm"
                    : darkMode
                      ? "text-[#777] hover:text-[#F5F5F5]"
                      : "text-[#86868B] hover:text-[#1D1D1F]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className={`p-2 rounded-xl border hover:opacity-80 transition-colors disabled:opacity-50 ${
              darkMode ? "border-[#2A2A2A]" : "border-[#D2D2D7]"
            }`}
            title="Atualizar"
          >
            <svg
              className={`w-5 h-5 ${loading ? "animate-spin" : ""} ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* ─── LOADING STATE ─── */}
      {loading && !data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonKPI key={i} darkMode={darkMode} />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} darkMode={darkMode} />
            ))}
          </div>
        </>
      )}

      {/* ─── DATA SECTIONS ─── */}
      {data && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard
              icon="&#x1F4C5;"
              label="Melhor dia"
              value={data.kpis.melhorDia.dia}
              sub={`${fmt(data.kpis.melhorDia.faturamento)} total | ${fmt(data.kpis.melhorDia.faturamentoMedio)} medio`}
              darkMode={darkMode}
            />
            <KPICard
              icon="&#x23F0;"
              label="Horario de pico"
              value={`${data.kpis.horarioPico.inicio}h - ${data.kpis.horarioPico.fim}h`}
              sub={`${data.kpis.horarioPico.pct}% das vendas (${data.kpis.horarioPico.vendas} un.)`}
              darkMode={darkMode}
            />
            <KPICard
              icon="&#x1F3C6;"
              label="Mais vendido"
              value={data.kpis.produtoMaisVendido?.nome || "N/A"}
              sub={data.kpis.produtoMaisVendido ? `${data.kpis.produtoMaisVendido.qtd} un. | ${fmt(data.kpis.produtoMaisVendido.receita)}` : "Sem dados"}
              darkMode={darkMode}
            />
            <KPICard
              icon="&#x1F4B9;"
              label="Margem media"
              value={`${data.kpis.margemMedia}%`}
              sub={`${data.kpis.totalVendas} vendas | ${fmt(data.kpis.totalFaturamento)}`}
              darkMode={darkMode}
            />
          </div>

          {/* Vendas por Dia da Semana + Vendas por Hora (side by side) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Section title="Vendas por Dia da Semana" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.porDiaSemana}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="dia" tick={{ fontSize: 12, fill: chartTextColor }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12, fill: chartTextColor }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: chartTextColor }} tickFormatter={(v) => fmt(v)} />
                  <RechartsTooltip content={<CustomTooltip darkMode={darkMode} />} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="vendas" name="Vendas" fill="#E8740E" radius={[6, 6, 0, 0]} />
                  <Bar yAxisId="right" dataKey="faturamentoMedio" name="Ticket Medio" fill="#3498DB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Section>

            <Section title="Vendas por Hora do Dia" darkMode={darkMode}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.porHora}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis dataKey="hora" tick={{ fontSize: 12, fill: chartTextColor }} />
                  <YAxis tick={{ fontSize: 12, fill: chartTextColor }} />
                  <RechartsTooltip content={<CustomTooltip darkMode={darkMode} />} />
                  <Bar dataKey="vendas" name="Vendas" fill="#E8740E" radius={[6, 6, 0, 0]}>
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </div>

          {/* Faturamento por Semana */}
          <Section title="Faturamento por Semana" darkMode={darkMode}>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={data.faturamentoSemanal}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="semana" tick={{ fontSize: 11, fill: chartTextColor }} />
                <YAxis tick={{ fontSize: 12, fill: chartTextColor }} tickFormatter={(v) => fmt(v)} />
                <RechartsTooltip content={<CustomTooltip darkMode={darkMode} />} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="faturamento"
                  name="Faturamento"
                  stroke="#E8740E"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#E8740E" }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="vendas"
                  name="Qtd Vendas"
                  stroke="#3498DB"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#3498DB" }}
                  yAxisId={0}
                />
              </LineChart>
            </ResponsiveContainer>
          </Section>

          {/* Top Produtos */}
          <Section title="Top Produtos por Periodo" darkMode={darkMode}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${darkMode ? "border-[#2A2A2A]" : "border-[#E5E5EA]"}`}>
                    <th className={`text-left py-2 font-medium ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>#</th>
                    <th className={`text-left py-2 font-medium ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>Produto</th>
                    <th className={`text-right py-2 font-medium ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>Qtd</th>
                    <th className={`text-right py-2 font-medium ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>Receita</th>
                    <th className={`text-right py-2 font-medium ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>Periodo Anterior</th>
                    <th className={`text-right py-2 font-medium ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>Tendencia</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProdutos.map((p, i) => (
                    <tr key={i} className={`border-b transition-colors ${
                      darkMode
                        ? "border-[#1A1A1A] hover:bg-[#1A1A1A]"
                        : "border-[#F0F0F0] hover:bg-[#F5F5F7]"
                    }`}>
                      <td className={`py-2 font-bold ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>
                        {i + 1}
                      </td>
                      <td className={`py-2 font-medium ${darkMode ? "text-[#F5F5F5]" : "text-[#1D1D1F]"}`}>
                        {p.produto}
                      </td>
                      <td className={`py-2 text-right ${darkMode ? "text-[#F5F5F5]" : "text-[#1D1D1F]"}`}>
                        {p.qtd}
                      </td>
                      <td className={`py-2 text-right ${darkMode ? "text-[#F5F5F5]" : "text-[#1D1D1F]"}`}>
                        {fmt(p.receita)}
                      </td>
                      <td className={`py-2 text-right ${darkMode ? "text-[#999]" : "text-[#86868B]"}`}>
                        {p.prevQtd} un.
                      </td>
                      <td className="py-2 text-right">
                        {p.trend > 0 ? (
                          <span className="text-[#2ECC71] font-semibold">
                            &#9650; +{p.trend.toFixed(0)}%
                          </span>
                        ) : p.trend < 0 ? (
                          <span className="text-[#E74C3C] font-semibold">
                            &#9660; {p.trend.toFixed(0)}%
                          </span>
                        ) : (
                          <span className={darkMode ? "text-[#777]" : "text-[#86868B]"}>&#8212;</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
