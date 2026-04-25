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

interface CampanhaBucket {
  nome: string;
  qty: number;
  receita: number;
}

interface CrescimentoRow {
  nome: string;
  cidade: string;
  atual: { qty: number; receita: number; lucro: number };
  anterior: { qty: number; receita: number; lucro: number };
  deltaQty: number;
  deltaReceita: number;
  score: number;
}

interface CampanhaStat {
  campanha: string;
  source: string;
  qty: number;
  receita: number;
  lucro: number;
  ticket: number;
  topBairros: CampanhaBucket[];
  topCidades: CampanhaBucket[];
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
  campanhas?: CampanhaStat[];
  crescimentoRegiao?: CrescimentoRow[];
  crescimentoInicioAtual?: string;
  crescimentoInicioAnterior?: string;
}

type RangeOption = "7" | "month" | "30" | "90" | "all" | "custom";

const BAR_COLORS = [
  "#E8740E", "#F5A623", "#3B82F6", "#2ECC71", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F59E0B", "#6366F1", "#EF4444",
  "#06B6D4", "#84CC16", "#D946EF", "#0EA5E9", "#F97316",
];

function getBarColor(index: number): string {
  return BAR_COLORS[index % BAR_COLORS.length];
}

export default function MapaVendasPage() {
  const { password, user } = useAdmin();
  const [data, setData] = useState<MapaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeOption>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/admin/mapa-vendas?range=${range}`;
      if (range === "custom" && customFrom && customTo) {
        url = `/api/admin/mapa-vendas?range=custom&from=${customFrom}&to=${customTo}`;
      }
      const res = await fetch(url, {
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      });
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [password, range, customFrom, customTo]);

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
        <div className="flex flex-wrap gap-2 items-center">
          {(["7", "month", "30", "90", "all", "custom"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E]"
              }`}
            >
              {r === "7" ? "7 dias" : r === "month" ? "Este mes" : r === "30" ? "30 dias" : r === "90" ? "90 dias" : r === "all" ? "Tudo" : "Personalizado"}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
          >
            Atualizar
          </button>
        </div>
        {range === "custom" && (
          <div className="flex gap-2 items-center mt-2">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs border border-[#D2D2D7] focus:border-[#E8740E] focus:outline-none" />
            <span className="text-xs text-[#86868B]">até</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="px-3 py-1.5 rounded-lg text-xs border border-[#D2D2D7] focus:border-[#E8740E] focus:outline-none" />
            <button onClick={fetchData} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors">Buscar</button>
          </div>
        )}
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

      {/* Cruzamento Meta Ads × região (UTM) */}
      <CampanhasSection campanhas={data.campanhas ?? []} />

      {/* Crescimento por regiao — mes atual vs mes anterior */}
      <CrescimentoRegiaoSection
        rows={data.crescimentoRegiao ?? []}
        inicioAtual={data.crescimentoInicioAtual}
        inicioAnterior={data.crescimentoInicioAnterior}
      />
    </div>
  );
}

function CampanhasSection({ campanhas }: { campanhas: CampanhaStat[] }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const totalComUTM = campanhas.filter(c => c.source !== "direct").reduce((s, c) => s + c.qty, 0);
  const direct = campanhas.find(c => c.source === "direct");
  const comUTM = campanhas.filter(c => c.source !== "direct");

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-semibold text-[#1D1D1F]">🎯 Campanhas × Região</h2>
        <span className="text-xs text-[#86868B]">{totalComUTM} vendas com UTM</span>
      </div>
      <p className="text-xs text-[#86868B] mb-4">
        Onde cada campanha (Meta Ads, Instagram, etc.) converteu. Clique pra ver os bairros específicos.
      </p>

      {comUTM.length === 0 ? (
        <div className="rounded-xl p-4 bg-[#F5F5F7] text-center">
          <p className="text-sm text-[#86868B]">
            Nenhuma venda com UTM registrada ainda.
          </p>
          <p className="text-xs text-[#B0B0B0] mt-1">
            Configure <span className="font-semibold">Parâmetros de URL</span> nas campanhas Meta Ads pra começar a rastrear.
          </p>
          {direct && direct.qty > 0 && (
            <p className="text-xs text-[#86868B] mt-3">{direct.qty} vendas sem atribuição (direct)</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {comUTM.map((c) => {
            const isOpen = aberta === `${c.source}::${c.campanha}`;
            const pct = totalComUTM > 0 ? (c.qty / totalComUTM) * 100 : 0;
            return (
              <div key={`${c.source}::${c.campanha}`} className="border border-[#E8E8ED] rounded-xl overflow-hidden">
                <button
                  onClick={() => setAberta(isOpen ? null : `${c.source}::${c.campanha}`)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#FAFAFA] transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#FFF5EB] text-[#E8740E]">{c.source}</span>
                      <span className="text-sm font-semibold text-[#1D1D1F] truncate">{c.campanha}</span>
                    </div>
                    <div className="h-1.5 bg-[#F5F5F7] rounded-full overflow-hidden">
                      <div className="h-full bg-[#E8740E]" style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 ml-4 shrink-0 text-right">
                    <div>
                      <div className="text-xs text-[#86868B]">vendas</div>
                      <div className="text-sm font-bold text-[#1D1D1F]">{c.qty}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#86868B]">receita</div>
                      <div className="text-sm font-bold text-[#1D1D1F]">{fmt(c.receita)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[#86868B]">ticket</div>
                      <div className="text-sm font-bold text-[#1D1D1F]">{fmt(c.ticket)}</div>
                    </div>
                    <span className="text-[#86868B] text-xs">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 py-3 bg-[#FAFAFA] border-t border-[#E8E8ED] grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#86868B] mb-2">Top bairros</p>
                      {c.topBairros.length === 0 ? (
                        <p className="text-xs text-[#B0B0B0]">Sem bairros informados</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {c.topBairros.map(b => (
                            <li key={b.nome} className="flex items-center justify-between text-sm">
                              <span className="text-[#1D1D1F] truncate max-w-[60%]">{b.nome}</span>
                              <span className="text-[#86868B] shrink-0">{b.qty}x · {fmt(b.receita)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#86868B] mb-2">Top cidades</p>
                      {c.topCidades.length === 0 ? (
                        <p className="text-xs text-[#B0B0B0]">Sem cidades informadas</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {c.topCidades.map(cid => (
                            <li key={cid.nome} className="flex items-center justify-between text-sm">
                              <span className="text-[#1D1D1F] truncate max-w-[60%]">{cid.nome}</span>
                              <span className="text-[#86868B] shrink-0">{cid.qty}x · {fmt(cid.receita)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {direct && direct.qty > 0 && (
            <p className="text-xs text-[#86868B] text-center pt-2">
              + {direct.qty} vendas sem atribuição (direct/orgânico sem UTM)
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(d: string): string {
  if (!d) return "\u2014";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function CrescimentoRegiaoSection({ rows, inicioAtual, inicioAnterior }: { rows: CrescimentoRow[]; inicioAtual?: string; inicioAnterior?: string }) {
  const [aba, setAba] = useState<"subindo" | "descendo" | "novos" | "sumindo">("subindo");

  const subindo = rows.filter(r => r.atual.qty > 0 && r.anterior.qty > 0 && r.deltaQty > 0).sort((a, b) => b.deltaQty - a.deltaQty).slice(0, 10);
  const descendo = rows.filter(r => r.atual.qty > 0 && r.anterior.qty > 0 && r.deltaQty < 0).sort((a, b) => a.deltaQty - b.deltaQty).slice(0, 10);
  const novos = rows.filter(r => r.atual.qty > 0 && r.anterior.qty === 0).sort((a, b) => b.atual.qty - a.atual.qty).slice(0, 10);
  const sumindo = rows.filter(r => r.atual.qty === 0 && r.anterior.qty > 0).sort((a, b) => b.anterior.qty - a.anterior.qty).slice(0, 10);

  const visiveis =
    aba === "subindo" ? subindo :
    aba === "descendo" ? descendo :
    aba === "novos" ? novos :
    sumindo;

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-[#1D1D1F]">📈 Crescimento por Região (mês vs anterior)</h2>
        {inicioAtual && inicioAnterior && (
          <span className="text-[10px] text-[#86868B]">
            {formatDate(inicioAnterior)} → {formatDate(inicioAtual)}  vs  {formatDate(inicioAtual)} → hoje
          </span>
        )}
      </div>
      <p className="text-xs text-[#86868B] mb-4">
        Compara vendas dos últimos 30 dias com os 30 dias anteriores. Ajuda a identificar onde a demanda subiu ou sumiu.
      </p>

      {/* Abas */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { k: "subindo" as const, label: `📈 Subindo (${subindo.length})`, color: "#2ECC71" },
          { k: "descendo" as const, label: `📉 Descendo (${descendo.length})`, color: "#E74C3C" },
          { k: "novos" as const, label: `✨ Novos (${novos.length})`, color: "#3498DB" },
          { k: "sumindo" as const, label: `🚨 Sumindo (${sumindo.length})`, color: "#95A5A6" },
        ].map(tab => (
          <button
            key={tab.k}
            onClick={() => setAba(tab.k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              aba === tab.k
                ? "bg-[#E8740E] text-white"
                : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      {visiveis.length === 0 ? (
        <p className="text-xs text-[#86868B] text-center py-6">
          {aba === "subindo" && "Nenhuma região com crescimento."}
          {aba === "descendo" && "Nenhuma região em queda."}
          {aba === "novos" && "Nenhuma região nova nos últimos 30 dias."}
          {aba === "sumindo" && "Nenhuma região sumiu."}
        </p>
      ) : (
        <div className="space-y-2">
          {visiveis.map((r) => {
            const isNovo = aba === "novos";
            const isSumindo = aba === "sumindo";
            const deltaStr = isNovo ? "novo" : isSumindo ? "sumiu" : `${r.deltaQty > 0 ? "+" : ""}${r.deltaQty}%`;
            const deltaColor = isNovo ? "text-blue-600" :
              isSumindo ? "text-gray-500" :
              r.deltaQty > 0 ? "text-green-600" : "text-red-500";
            return (
              <div key={r.nome} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-[#E8E8ED] hover:bg-[#FAFAFA]">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1D1D1F] truncate">{r.nome}</p>
                  <p className="text-[10px] text-[#86868B]">
                    Agora: {r.atual.qty}x · R$ {Math.round(r.atual.receita).toLocaleString("pt-BR")}
                    {!isNovo && !isSumindo && (
                      <>  ·  Antes: {r.anterior.qty}x · R$ {Math.round(r.anterior.receita).toLocaleString("pt-BR")}</>
                    )}
                    {isSumindo && (
                      <>  (tinha {r.anterior.qty}x · R$ {Math.round(r.anterior.receita).toLocaleString("pt-BR")})</>
                    )}
                  </p>
                </div>
                <span className={`text-sm font-bold shrink-0 ${deltaColor}`}>
                  {deltaStr}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
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
