"use client";

import { useState, useEffect, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  CartesianGrid, Area, AreaChart, ComposedChart,
} from "recharts";

/* ─── Formatters ─── */
const fmt = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtPct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

/* ─── Types ─── */
interface KPI {
  vendas: number;
  vendasAnterior: number;
  faturamento: number;
  faturamentoAnterior: number;
  lucro: number;
  lucroAnterior: number;
  ticketMedio: number;
  ticketMedioAnterior: number;
}

interface ProjecaoData {
  acumulado: number;
  projetadoRestante: number;
  projecaoTotal: number;
  mesAnteriorTotal: number;
  diario: { dia: string; acumulado: number; projetado: number | null }[];
  mediaPorDia: { dia: string; media: number }[];
}

interface ProdutoRanking {
  produto: string;
  qtd: number;
  receita: number;
  lucro: number;
}

interface TicketDiario {
  dia: number;
  ticketAtual: number;
  ticketAnterior: number;
}

interface MargemCanal {
  origem: string;
  vendas: number;
  receita: number;
  lucro: number;
  margem: number;
}

interface OrigemCliente {
  origem: string;
  qtd: number;
  pct: number;
}

interface RegiaoData {
  bairros: { nome: string; qtd: number }[];
  cidades: { nome: string; qtd: number }[];
}

interface AnalyticsVendasData {
  kpi: KPI;
  projecao: ProjecaoData;
  ranking: ProdutoRanking[];
  ticketDiario: TicketDiario[];
  margemCanal: MargemCanal[];
  origemClientes: OrigemCliente[];
  regiao: RegiaoData;
}

/* ─── Colors ─── */
const PIE_COLORS = [
  "#E8740E", "#2ECC71", "#3498DB", "#9B59B6", "#E74C3C",
  "#F39C12", "#1ABC9C", "#34495E", "#E67E22", "#27AE60",
];

/* ─── Custom Tooltip ─── */
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white p-3 rounded-xl shadow-lg border border-[#D2D2D7] text-sm">
      <p className="font-semibold text-[#1D1D1F]">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" && p.value > 100 ? fmt(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

/* ─── Skeleton Card ─── */
function SkeletonCard({ h = "h-64" }: { h?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#D2D2D7] p-6 ${h} animate-pulse`}>
      <div className="h-4 bg-[#E5E5EA] rounded w-1/3 mb-4" />
      <div className="h-8 bg-[#E5E5EA] rounded w-1/2 mb-3" />
      <div className="h-3 bg-[#E5E5EA] rounded w-2/3 mb-2" />
      <div className="h-3 bg-[#E5E5EA] rounded w-1/2" />
    </div>
  );
}

function SkeletonKPI() {
  return (
    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-5 animate-pulse">
      <div className="h-3 bg-[#E5E5EA] rounded w-1/2 mb-3" />
      <div className="h-7 bg-[#E5E5EA] rounded w-2/3 mb-2" />
      <div className="h-3 bg-[#E5E5EA] rounded w-1/3" />
    </div>
  );
}

/* ─── Section Wrapper ─── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-6">
      <h2 className="text-lg font-semibold text-[#1D1D1F] mb-4">{title}</h2>
      {children}
    </div>
  );
}

/* ─── KPI Card ─── */
function KPICard({
  label,
  current,
  previous,
  isCurrency = true,
}: {
  label: string;
  current: number;
  previous: number;
  isCurrency?: boolean;
}) {
  const variation = previous !== 0 ? ((current - previous) / previous) * 100 : 0;
  const isPositive = variation >= 0;
  const display = isCurrency ? fmt(current) : current.toLocaleString("pt-BR");
  const prevDisplay = isCurrency ? fmt(previous) : previous.toLocaleString("pt-BR");

  return (
    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-5 flex flex-col gap-1">
      <span className="text-xs font-medium text-[#86868B] uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-[#1D1D1F]">{display}</span>
      <span className="text-xs text-[#86868B]">Mês anterior: {prevDisplay}</span>
      <span
        className={`text-sm font-semibold ${isPositive ? "text-[#2ECC71]" : "text-[#E74C3C]"}`}
      >
        {isPositive ? "↑" : "↓"} {fmtPct(variation)}
      </span>
    </div>
  );
}

/* ─── Main Page ─── */
export default function AnalyticsVendasPage() {
  const { apiHeaders } = useAdmin();
  const [data, setData] = useState<AnalyticsVendasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"1m" | "3m" | "6m">("1m");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics-vendas?range=${range}`, {
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

  /* ─── Date range label ─── */
  const rangeLabel = () => {
    const now = new Date();
    const months = range === "1m" ? 1 : range === "3m" ? 3 : 6;
    const start = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    const sf = start.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    const ef = now.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
    return `${sf} — ${ef}`;
  };

  /* ─── Error State ─── */
  if (error && !loading && !data) {
    return (
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        <div className="bg-[#FDEDED] border border-[#E74C3C] rounded-2xl p-6 text-center">
          <p className="text-[#E74C3C] font-semibold text-lg mb-2">Erro ao carregar analytics</p>
          <p className="text-[#86868B] text-sm mb-4">{error}</p>
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
          <h1 className="text-2xl font-bold text-[#1D1D1F]">Analytics de Vendas</h1>
          <p className="text-sm text-[#86868B]">{rangeLabel()}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-[#E5E5EA] rounded-xl p-1">
            {(["1m", "3m", "6m"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  range === r
                    ? "bg-white text-[#1D1D1F] shadow-sm"
                    : "text-[#86868B] hover:text-[#1D1D1F]"
                }`}
              >
                {r.toUpperCase()}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-xl border border-[#D2D2D7] hover:bg-[#F0F0F0] transition-colors disabled:opacity-50"
            title="Atualizar"
          >
            <svg
              className={`w-5 h-5 text-[#86868B] ${loading ? "animate-spin" : ""}`}
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
              <SkeletonKPI key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </>
      )}

      {/* ─── DATA SECTIONS ─── */}
      {data && (
        <>
          {/* SECTION 1: KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label="Vendas" current={data.kpi.vendas} previous={data.kpi.vendasAnterior} isCurrency={false} />
            <KPICard label="Faturamento" current={data.kpi.faturamento} previous={data.kpi.faturamentoAnterior} />
            <KPICard label="Lucro" current={data.kpi.lucro} previous={data.kpi.lucroAnterior} />
            <KPICard label="Ticket Medio" current={data.kpi.ticketMedio} previous={data.kpi.ticketMedioAnterior} />
          </div>

          {/* SECTION 2: Projecao de Lucro */}
          <Section title="Projecao de Lucro">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-[#F5F5F7] rounded-xl p-4 text-center">
                <p className="text-xs text-[#86868B] uppercase tracking-wide mb-1">Projecao ate fim do mes</p>
                <p className="text-2xl font-bold text-[#E8740E]">{fmt(data.projecao.projecaoTotal)}</p>
              </div>
              <div className="bg-[#F5F5F7] rounded-xl p-4 text-center">
                <p className="text-xs text-[#86868B] uppercase tracking-wide mb-1">Acumulado real</p>
                <p className="text-xl font-semibold text-[#1D1D1F]">{fmt(data.projecao.acumulado)}</p>
                <p className="text-xs text-[#86868B] mt-1">
                  Projetado restante: {fmt(data.projecao.projetadoRestante)}
                </p>
              </div>
              <div className="bg-[#F5F5F7] rounded-xl p-4 text-center">
                <p className="text-xs text-[#86868B] uppercase tracking-wide mb-1">Mes anterior total</p>
                <p className="text-xl font-semibold text-[#1D1D1F]">{fmt(data.projecao.mesAnteriorTotal)}</p>
              </div>
            </div>

            <div className="mb-6">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.projecao.diario}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" />
                  <XAxis dataKey="dia" tick={{ fontSize: 12, fill: "#86868B" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#86868B" }} tickFormatter={(v) => fmt(v)} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="acumulado"
                    name="Acumulado Real"
                    stroke="#E8740E"
                    fill="#E8740E"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="projetado"
                    name="Projetado"
                    stroke="#D2D2D7"
                    fill="#D2D2D7"
                    fillOpacity={0.1}
                    strokeWidth={2}
                    strokeDasharray="6 3"
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {data.projecao.mediaPorDia.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-[#1D1D1F] mb-3">Media por dia da semana</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={data.projecao.mediaPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" />
                    <XAxis dataKey="dia" tick={{ fontSize: 12, fill: "#86868B" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#86868B" }} tickFormatter={(v) => fmt(v)} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="media" name="Media" fill="#E8740E" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Section>

          {/* SECTION 3: Ranking de Produtos */}
          <Section title="Ranking de Produtos">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.ranking.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" />
                <XAxis type="number" tick={{ fontSize: 12, fill: "#86868B" }} tickFormatter={(v) => fmt(v)} />
                <YAxis
                  type="category"
                  dataKey="produto"
                  tick={{ fontSize: 11, fill: "#1D1D1F" }}
                  width={160}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="receita" name="Receita" fill="#E8740E" radius={[0, 6, 6, 0]} />
                <Bar dataKey="qtd" name="Qtd" fill="#3498DB" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5E5EA]">
                    <th className="text-left py-2 text-[#86868B] font-medium">Produto</th>
                    <th className="text-right py-2 text-[#86868B] font-medium">Qtd</th>
                    <th className="text-right py-2 text-[#86868B] font-medium">Receita</th>
                    <th className="text-right py-2 text-[#86868B] font-medium">Lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ranking.map((p, i) => (
                    <tr key={i} className="border-b border-[#F0F0F0] hover:bg-[#F5F5F7] transition-colors">
                      <td className="py-2 text-[#1D1D1F] font-medium">{p.produto}</td>
                      <td className="py-2 text-right text-[#1D1D1F]">{p.qtd}</td>
                      <td className="py-2 text-right text-[#1D1D1F]">{fmt(p.receita)}</td>
                      <td className="py-2 text-right text-[#2ECC71] font-medium">{fmt(p.lucro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* SECTION 4: Ticket Medio Diario */}
          <Section title="Ticket Medio Diario">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data.ticketDiario}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" />
                <XAxis dataKey="dia" tick={{ fontSize: 12, fill: "#86868B" }} />
                <YAxis tick={{ fontSize: 12, fill: "#86868B" }} tickFormatter={(v) => fmt(v)} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="ticketAnterior"
                  name="Mes Anterior"
                  stroke="#D2D2D7"
                  fill="#D2D2D7"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
                <Line
                  type="monotone"
                  dataKey="ticketAtual"
                  name="Mes Atual"
                  stroke="#E8740E"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: "#E8740E" }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </Section>

          {/* SECTION 5 & 6 side by side on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* SECTION 5: Margem por Canal */}
            <Section title="Margem por Canal">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.margemCanal}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" />
                  <XAxis dataKey="origem" tick={{ fontSize: 11, fill: "#86868B" }} />
                  <YAxis tick={{ fontSize: 12, fill: "#86868B" }} tickFormatter={(v) => fmt(v)} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="receita" name="Receita" stackId="a" fill="#3498DB" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="lucro" name="Lucro" stackId="a" fill="#2ECC71" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5E5EA]">
                      <th className="text-left py-2 text-[#86868B] font-medium">Origem</th>
                      <th className="text-right py-2 text-[#86868B] font-medium">Vendas</th>
                      <th className="text-right py-2 text-[#86868B] font-medium">Receita</th>
                      <th className="text-right py-2 text-[#86868B] font-medium">Lucro</th>
                      <th className="text-right py-2 text-[#86868B] font-medium">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.margemCanal.map((c, i) => (
                      <tr key={i} className="border-b border-[#F0F0F0] hover:bg-[#F5F5F7] transition-colors">
                        <td className="py-2 text-[#1D1D1F] font-medium">{c.origem}</td>
                        <td className="py-2 text-right text-[#1D1D1F]">{c.vendas}</td>
                        <td className="py-2 text-right text-[#1D1D1F]">{fmt(c.receita)}</td>
                        <td className="py-2 text-right text-[#2ECC71] font-medium">{fmt(c.lucro)}</td>
                        <td className="py-2 text-right text-[#1D1D1F]">{c.margem.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            {/* SECTION 6: Origem dos Clientes */}
            <Section title="Origem dos Clientes">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.origemClientes}
                    dataKey="qtd"
                    nameKey="origem"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={55}
                    paddingAngle={2}
                    label={({ origem, pct }) => `${origem} ${pct.toFixed(0)}%`}
                    labelLine={{ stroke: "#D2D2D7" }}
                  >
                    {data.origemClientes.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: any, name: any) => [`${value} vendas`, name]}
                  />
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-4 space-y-2">
                {data.origemClientes.map((o, i) => {
                  const maxQtd = Math.max(...data.origemClientes.map((x) => x.qtd), 1);
                  const pctWidth = (o.qtd / maxQtd) * 100;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-sm text-[#1D1D1F] w-28 flex-shrink-0 truncate">{o.origem}</span>
                      <div className="flex-1 bg-[#F0F0F0] rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pctWidth}%`,
                            backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                      </div>
                      <span className="text-xs text-[#86868B] w-12 text-right">{o.pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* SECTION 7: Vendas por Regiao */}
          <Section title="Vendas por Regiao">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Top 10 Bairros */}
              <div>
                <h3 className="text-sm font-semibold text-[#1D1D1F] mb-3">Top 10 Bairros</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.regiao.bairros.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#86868B" }} />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: "#1D1D1F" }}
                      width={120}
                    />
                    <RechartsTooltip
                      formatter={(value: any) => [`${value} vendas`, "Vendas"]}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #D2D2D7",
                        borderRadius: "12px",
                        fontSize: "13px",
                      }}
                    />
                    <Bar dataKey="qtd" name="Vendas" fill="#E8740E" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top 5 Cidades */}
              <div>
                <h3 className="text-sm font-semibold text-[#1D1D1F] mb-3">Top 5 Cidades</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.regiao.cidades.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E5EA" />
                    <XAxis type="number" tick={{ fontSize: 12, fill: "#86868B" }} />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: "#1D1D1F" }}
                      width={120}
                    />
                    <RechartsTooltip
                      formatter={(value: any) => [`${value} vendas`, "Vendas"]}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #D2D2D7",
                        borderRadius: "12px",
                        fontSize: "13px",
                      }}
                    />
                    <Bar dataKey="qtd" name="Vendas" fill="#3498DB" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
