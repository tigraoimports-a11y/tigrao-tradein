"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

interface LocalData {
  local: string;
  qty: number;
  receita: number;
  lucro: number;
  ticket: number;
}

interface ClienteData {
  nome: string;
  compras: number;
  total: number;
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
  locais: LocalData[];
  topClientes: ClienteData[];
  porDiaSemana: DiaSemanaData[];
}

type RangeOption = "7" | "30" | "90" | "all";

const LOCAL_COLORS: Record<string, string> = {
  RETIRADA: "#2ECC71",
  ENTREGA: "#3B82F6",
  CORREIO: "#8B5CF6",
  "NAO INFORMADO": "#94A3B8",
};

function getLocalColor(local: string): string {
  return LOCAL_COLORS[local] || "#E8740E";
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
        headers: { "x-admin-password": password },
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

  const maxLocalReceita = Math.max(...data.locais.map((l) => l.receita), 1);
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
            Analise de vendas por local, cliente e dia da semana
          </p>
        </div>
        <div className="flex gap-2">
          {(["7", "30", "90", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E]"
              }`}
            >
              {r === "7" ? "7 dias" : r === "30" ? "30 dias" : r === "90" ? "90 dias" : "Tudo"}
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

      {/* Region Breakdown */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
          Vendas por Local
        </h2>
        <p className="text-xs text-[#86868B] mb-4">
          Distribuicao por tipo de entrega/retirada
        </p>

        {/* Bar chart */}
        <div className="space-y-3 mb-6">
          {data.locais.map((l) => {
            const pct = (l.receita / maxLocalReceita) * 100;
            const color = getLocalColor(l.local);
            return (
              <div key={l.local}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-sm font-medium text-[#1D1D1F]">
                      {l.local}
                    </span>
                  </div>
                  <span className="text-xs text-[#86868B]">
                    {l.qty} vendas
                  </span>
                </div>
                <div className="h-7 bg-[#F5F5F7] rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, 3)}%`,
                      backgroundColor: color,
                      opacity: 0.8,
                    }}
                  />
                  <span className="absolute inset-0 flex items-center pl-3 text-xs font-semibold text-white mix-blend-difference">
                    {fmt(l.receita)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8E8ED]">
                <th className="text-left py-2 text-[#86868B] font-medium text-xs">Local</th>
                <th className="text-right py-2 text-[#86868B] font-medium text-xs">Vendas</th>
                <th className="text-right py-2 text-[#86868B] font-medium text-xs">Faturamento</th>
                <th className="text-right py-2 text-[#86868B] font-medium text-xs">Lucro</th>
                <th className="text-right py-2 text-[#86868B] font-medium text-xs">Ticket Medio</th>
              </tr>
            </thead>
            <tbody>
              {data.locais.map((l) => (
                <tr key={l.local} className="border-b border-[#F5F5F7] hover:bg-[#FAFAFA]">
                  <td className="py-2.5 font-medium text-[#1D1D1F]">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: getLocalColor(l.local) }}
                      />
                      {l.local}
                    </div>
                  </td>
                  <td className="py-2.5 text-right text-[#6E6E73]">{l.qty}</td>
                  <td className="py-2.5 text-right font-medium text-[#1D1D1F]">{fmt(l.receita)}</td>
                  <td className="py-2.5 text-right text-[#2ECC71]">{fmt(l.lucro)}</td>
                  <td className="py-2.5 text-right text-[#6E6E73]">{fmt(l.ticket)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                  <th className="text-right py-2 text-[#86868B] font-medium text-xs">Ultima Compra</th>
                </tr>
              </thead>
              <tbody>
                {data.topClientes.map((c, i) => (
                  <tr key={c.nome} className="border-b border-[#F5F5F7] hover:bg-[#FAFAFA]">
                    <td className="py-2.5 text-[#86868B]">
                      {i < 3 ? (
                        <span className="text-base">{["🥇", "🥈", "🥉"][i]}</span>
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
  if (!d) return "—";
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
