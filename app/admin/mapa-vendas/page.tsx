"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { useAdmin } from "@/components/admin/AdminShell";

const SalesMap = dynamic(() => import("@/components/admin/SalesMap"), {
  ssr: false,
  loading: () => (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="h-[460px] flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-[#E8740E] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  ),
});

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

interface GeoData {
  nome: string;
  qty: number;
  receita: number;
  lucro: number;
  ticket: number;
  lat?: number | null;
  lng?: number | null;
}

interface ClienteData {
  nome: string;
  compras: number;
  total: number;
  lucro: number;
  ultimaCompra: string;
}

interface DiaSemanaData {
  dia: string;
  vendas: number;
  receita: number;
}

interface MapaData {
  totalVendas: number;
  totalReceita: number;
  totalLucro: number;
  ticketMedio: number;
  bairros: GeoData[];
  cidades: GeoData[];
  estados: GeoData[];
  topClientes: ClienteData[];
  porDiaSemana: DiaSemanaData[];
}

type RangeOption = "7" | "month" | "30" | "90" | "all";

const BAR_COLORS = [
  "#E8740E", "#F5A623", "#3B82F6", "#2ECC71", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F59E0B", "#6366F1", "#EF4444",
  "#06B6D4", "#84CC16", "#D946EF", "#0EA5E9", "#F97316",
];

function getBarColor(index: number): string {
  return BAR_COLORS[index % BAR_COLORS.length];
}

export default function MapaVendasPage() {
  const { password } = useAdmin();
  const [data, setData] = useState<MapaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeOption>("30");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/mapa-vendas?range=${range}`, {
        headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [password, range]);

  useEffect(() => {
    if (password) fetchData();
  }, [password, range, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#E8740E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-[#86868B]">
        Erro ao carregar dados
      </div>
    );
  }

  const topBairros = data.bairros.slice(0, 15);
  const maxBairroQty = Math.max(...topBairros.map((b) => b.qty), 1);
  const maxCidadeQty = Math.max(...data.cidades.map((c) => c.qty), 1);
  const maxDiaVendas = Math.max(...data.porDiaSemana.map((d) => d.vendas), 1);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1D1D1F]">
            Mapa de Vendas
          </h1>
          <p className="text-sm text-[#86868B] mt-0.5">
            Distribuicao geografica das vendas por bairro, cidade e estado
          </p>
        </div>
        <div className="flex gap-2">
          {(["7", "month", "30", "90", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E]"
              }`}
            >
              {r === "7" ? "7 dias" : r === "month" ? "Este mes" : r === "30" ? "30 dias" : r === "90" ? "90 dias" : "Tudo"}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Total Vendas" value={data.totalVendas} />
        <KPICard label="Faturamento" value={fmt(data.totalReceita)} accent />
        <KPICard label="Lucro" value={fmt(data.totalLucro)} />
        <KPICard label="Ticket Medio" value={fmt(data.ticketMedio)} accent />
      </div>

      {/* Sales Map */}
      <SalesMap bairros={data.bairros} />

      {/* Top Bairros */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
          Top Bairros
        </h2>
        <p className="text-xs text-[#86868B] mb-4">
          Top 15 bairros por numero de vendas
        </p>

        {topBairros.length === 0 ? (
          <p className="text-sm text-[#86868B] text-center py-8">
            Nenhum dado de bairro disponivel
          </p>
        ) : (
          <div className="space-y-2.5">
            {topBairros.map((b, i) => {
              const pct = (b.qty / maxBairroQty) * 100;
              const color = getBarColor(i);
              return (
                <div key={b.nome}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#1D1D1F] truncate max-w-[60%]">
                      {b.nome}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-[#86868B] shrink-0">
                      <span>{b.qty} vendas</span>
                      <span className="font-medium text-[#1D1D1F]">{fmt(b.receita)}</span>
                    </div>
                  </div>
                  <div className="h-6 bg-[#F5F5F7] rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 3)}%`,
                        backgroundColor: color,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top Cidades */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
          Top Cidades
        </h2>
        <p className="text-xs text-[#86868B] mb-4">
          Top 10 cidades por numero de vendas
        </p>

        {data.cidades.length === 0 ? (
          <p className="text-sm text-[#86868B] text-center py-8">
            Nenhum dado de cidade disponivel
          </p>
        ) : (
          <div className="space-y-2.5">
            {data.cidades.map((c, i) => {
              const pct = (c.qty / maxCidadeQty) * 100;
              const color = getBarColor(i);
              return (
                <div key={c.nome}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#1D1D1F] truncate max-w-[60%]">
                      {c.nome}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-[#86868B] shrink-0">
                      <span>{c.qty} vendas</span>
                      <span className="font-medium text-[#1D1D1F]">{fmt(c.receita)}</span>
                    </div>
                  </div>
                  <div className="h-6 bg-[#F5F5F7] rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 3)}%`,
                        backgroundColor: color,
                        opacity: 0.8,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Vendas por Estado */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
          Vendas por Estado
        </h2>
        <p className="text-xs text-[#86868B] mb-4">
          Distribuicao por UF
        </p>

        {data.estados.length === 0 ? (
          <p className="text-sm text-[#86868B] text-center py-8">
            Nenhum dado de estado disponivel
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8ED]">
                  <th className="text-left py-2 text-[#86868B] font-medium text-xs">UF</th>
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Vendas</th>
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Faturamento</th>
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Lucro</th>
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Ticket Medio</th>
                </tr>
              </thead>
              <tbody>
                {data.estados.map((e) => (
                  <tr key={e.nome} className="border-b border-[#F5F5F7] hover:bg-[#FAFAFA]">
                    <td className="py-2.5 font-medium text-[#1D1D1F]">{e.nome}</td>
                    <td className="py-2.5 text-right text-[#6E6E73]">{e.qty}</td>
                    <td className="py-2.5 text-right font-medium text-[#1D1D1F]">{fmt(e.receita)}</td>
                    <td className="py-2.5 text-right text-[#2ECC71]">{fmt(e.lucro)}</td>
                    <td className="py-2.5 text-right text-[#6E6E73]">{fmt(e.ticket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Day of Week Analysis */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
          Vendas por Dia da Semana
        </h2>
        <p className="text-xs text-[#86868B] mb-4">
          Quais dias vendem mais
        </p>

        <div className="flex items-end gap-2 sm:gap-4 h-48">
          {data.porDiaSemana.map((d) => {
            const h = maxDiaVendas > 0 ? (d.vendas / maxDiaVendas) * 100 : 0;
            const isBest = d.vendas === maxDiaVendas && d.vendas > 0;
            return (
              <div
                key={d.dia}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <span className="text-xs font-semibold text-[#1D1D1F]">
                  {d.vendas}
                </span>
                <span className="text-[9px] text-[#86868B]">
                  {fmt(d.receita)}
                </span>
                <div
                  className="w-full rounded-t-lg transition-all duration-500"
                  style={{
                    height: `${Math.max(h, 4)}%`,
                    backgroundColor: isBest ? "#E8740E" : "#E8740E80",
                    minHeight: "4px",
                  }}
                />
                <span className="text-[10px] sm:text-xs text-[#6E6E73] font-medium">
                  {d.dia.slice(0, 3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top Clients */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
          Top 10 Clientes
        </h2>
        <p className="text-xs text-[#86868B] mb-4">
          Clientes com maior volume de compras
        </p>

        {data.topClientes.length === 0 ? (
          <p className="text-sm text-[#86868B] text-center py-8">
            Nenhum dado de cliente disponivel
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8ED]">
                  <th className="text-left py-2 text-[#86868B] font-medium text-xs">#</th>
                  <th className="text-left py-2 text-[#86868B] font-medium text-xs">Cliente</th>
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Compras</th>
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Total Gasto</th>
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Lucro</th>
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Ultima Compra</th>
                </tr>
              </thead>
              <tbody>
                {data.topClientes.map((c, i) => (
                  <tr key={c.nome} className="border-b border-[#F5F5F7] hover:bg-[#FAFAFA]">
                    <td className="py-2.5 text-[#86868B]">
                      {i < 3 ? (
                        <span className="text-base">{["\u{1F947}", "\u{1F948}", "\u{1F949}"][i]}</span>
                      ) : (
                        <span className="text-xs">{i + 1}</span>
                      )}
                    </td>
                    <td className="py-2.5 font-medium text-[#1D1D1F]">{c.nome}</td>
                    <td className="py-2.5 text-right">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#FFF5EB] text-[#E8740E] text-xs font-bold">
                        {c.compras}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-medium text-[#1D1D1F]">{fmt(c.total)}</td>
                    <td className="py-2.5 text-right font-medium text-[#2ECC71]">{fmt(c.lucro)}</td>
                    <td className="py-2.5 text-right text-[#6E6E73] text-xs">
                      {formatDate(c.ultimaCompra)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(d: string): string {
  if (!d) return "\u2014";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function KPICard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 border shadow-sm ${
        accent
          ? "bg-[#FFF5EB] border-[#E8740E]/20"
          : "bg-white border-[#D2D2D7]"
      }`}
    >
      <p className="text-[11px] text-[#86868B] font-medium uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${
          accent ? "text-[#E8740E]" : "text-[#1D1D1F]"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
