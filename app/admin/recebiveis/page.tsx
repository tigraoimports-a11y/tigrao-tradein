"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import type { Venda } from "@/lib/admin-types";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

// -------------------------------------------------------
// Receivable = one future installment from a credit card sale
// -------------------------------------------------------
interface Recebivel {
  vendaId: string;
  data: string;           // sale date
  dataPrevista: string;    // expected credit date (YYYY-MM-DD)
  cliente: string;
  produto: string;
  banco: string;
  parcela: number;         // 1-based
  totalParcelas: number;
  valorParcela: number;
  fonte: "principal" | "alt"; // primary or secondary card
}

// -------------------------------------------------------
// Add calendar days (simple, no business-day logic — matches D+N convention)
// -------------------------------------------------------
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// -------------------------------------------------------
// Compute installment credit dates per user spec
// Installment 1: D+1   (sale date + 1 day)
// Installment N: D + (30*(N-1) + 1)
// -------------------------------------------------------
function installmentDate(saleDate: string, n: number): string {
  const offset = 30 * (n - 1) + 1;
  return addDays(saleDate, offset);
}

// -------------------------------------------------------
// Build receivables from vendas
// -------------------------------------------------------
function buildRecebiveis(vendas: Venda[]): Recebivel[] {
  const today = new Date().toISOString().split("T")[0];
  const result: Recebivel[] = [];

  for (const v of vendas) {
    // Primary card payment
    if (v.forma === "CARTAO" && v.qnt_parcelas && v.qnt_parcelas > 0 && v.valor_comprovante) {
      const valorParcela = Math.round(v.valor_comprovante / v.qnt_parcelas);
      for (let i = 1; i <= v.qnt_parcelas; i++) {
        const dt = installmentDate(v.data, i);
        if (dt >= today) {
          result.push({
            vendaId: v.id,
            data: v.data,
            dataPrevista: dt,
            cliente: v.cliente,
            produto: v.produto,
            banco: bancoLabel(v.banco),
            parcela: i,
            totalParcelas: v.qnt_parcelas,
            valorParcela,
            fonte: "principal",
          });
        }
      }
    }

    // Secondary (alt) card payment
    if (v.banco_alt && v.parc_alt && v.parc_alt > 0 && v.comp_alt) {
      const valorParcela = Math.round(v.comp_alt / v.parc_alt);
      for (let i = 1; i <= v.parc_alt; i++) {
        const dt = installmentDate(v.data, i);
        if (dt >= today) {
          result.push({
            vendaId: v.id,
            data: v.data,
            dataPrevista: dt,
            cliente: v.cliente,
            produto: v.produto,
            banco: bancoLabel(v.banco_alt),
            parcela: i,
            totalParcelas: v.parc_alt,
            valorParcela,
            fonte: "alt",
          });
        }
      }
    }
  }

  result.sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista));
  return result;
}

function bancoLabel(b: string): string {
  const map: Record<string, string> = {
    ITAU: "Itau",
    INFINITE: "Infinite",
    MERCADO_PAGO: "Mercado Pago",
  };
  return map[b] || b;
}

function bancoIcon(b: string): string {
  if (b === "Itau") return "🏦";
  if (b === "Infinite") return "💳";
  if (b === "Mercado Pago") return "💚";
  return "💳";
}

function bancoColor(b: string): string {
  if (b === "Itau") return "text-blue-700";
  if (b === "Infinite") return "text-purple-700";
  if (b === "Mercado Pago") return "text-green-700";
  return "text-gray-700";
}

// -------------------------------------------------------
// Week label: "Semana de 17/03 a 23/03"
// -------------------------------------------------------
function weekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7)); // Monday
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const f = (dt: Date) => `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
  return `Semana de ${f(mon)} a ${f(sun)}`;
}

function weekKey(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const mon = new Date(d);
  mon.setDate(d.getDate() - ((day + 6) % 7));
  return mon.toISOString().split("T")[0];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  return `${dias[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// -------------------------------------------------------
// Page component
// -------------------------------------------------------
export default function RecebiveisPage() {
  const { password, user } = useAdmin();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVendas = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch last 12 months of sales (enough to cover longest installment plans)
      const from = new Date();
      from.setMonth(from.getMonth() - 12);
      const fromStr = from.toISOString().split("T")[0];
      const params = new URLSearchParams({ from: fromStr });
      const res = await fetch(`/api/vendas?${params}`, {
        headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
      });
      if (res.ok) {
        const json = await res.json();
        setVendas(json.data ?? []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [password]);

  useEffect(() => {
    if (password) fetchVendas();
  }, [password, fetchVendas]);

  const recebiveis = useMemo(() => buildRecebiveis(vendas), [vendas]);

  // Summary calculations
  const today = new Date().toISOString().split("T")[0];
  const in7 = addDays(today, 7);
  const in30 = addDays(today, 30);
  const in60 = addDays(today, 60);

  const total7 = recebiveis.filter((r) => r.dataPrevista <= in7).reduce((s, r) => s + r.valorParcela, 0);
  const total30 = recebiveis.filter((r) => r.dataPrevista <= in30).reduce((s, r) => s + r.valorParcela, 0);
  const total60 = recebiveis.filter((r) => r.dataPrevista <= in60).reduce((s, r) => s + r.valorParcela, 0);
  const totalPendente = recebiveis.reduce((s, r) => s + r.valorParcela, 0);

  // Breakdown by bank
  const bancos = useMemo(() => {
    const map: Record<string, { total: number; em7: number; em30: number; em60: number }> = {};
    for (const r of recebiveis) {
      if (!map[r.banco]) map[r.banco] = { total: 0, em7: 0, em30: 0, em60: 0 };
      map[r.banco].total += r.valorParcela;
      if (r.dataPrevista <= in7) map[r.banco].em7 += r.valorParcela;
      if (r.dataPrevista <= in30) map[r.banco].em30 += r.valorParcela;
      if (r.dataPrevista <= in60) map[r.banco].em60 += r.valorParcela;
    }
    return map;
  }, [recebiveis, in7, in30, in60]);

  // Group by week for timeline
  const weeks = useMemo(() => {
    const map: Record<string, { label: string; items: Recebivel[] }> = {};
    for (const r of recebiveis) {
      const wk = weekKey(r.dataPrevista);
      if (!map[wk]) map[wk] = { label: weekLabel(r.dataPrevista), items: [] };
      map[wk].items.push(r);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [recebiveis]);

  // Card style
  const cardCls = "bg-white rounded-xl border border-[#E8E8ED] p-5";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[#1D1D1F]">Controle de Recebiveis</h1>
        <p className="text-sm text-[#86868B] mt-1">
          Parcelas de cartao pendentes de credito
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-[#86868B]">Carregando...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={cardCls}>
              <p className="text-xs text-[#86868B] uppercase tracking-wide">Proximos 7 dias</p>
              <p className="text-xl font-bold text-[#1D1D1F] mt-1">{fmt(total7)}</p>
            </div>
            <div className={cardCls}>
              <p className="text-xs text-[#86868B] uppercase tracking-wide">Proximos 30 dias</p>
              <p className="text-xl font-bold text-[#1D1D1F] mt-1">{fmt(total30)}</p>
            </div>
            <div className={cardCls}>
              <p className="text-xs text-[#86868B] uppercase tracking-wide">Proximos 60 dias</p>
              <p className="text-xl font-bold text-[#1D1D1F] mt-1">{fmt(total60)}</p>
            </div>
            <div className={`${cardCls} border-[#E8740E]/30 bg-[#FFF9F3]`}>
              <p className="text-xs text-[#E8740E] uppercase tracking-wide font-semibold">Total pendente</p>
              <p className="text-xl font-bold text-[#E8740E] mt-1">{fmt(totalPendente)}</p>
              <p className="text-[10px] text-[#86868B] mt-1">{recebiveis.length} parcelas</p>
            </div>
          </div>

          {/* Breakdown by bank */}
          {Object.keys(bancos).length > 0 && (
            <div className={cardCls}>
              <h2 className="text-sm font-semibold text-[#1D1D1F] mb-4">Por maquininha</h2>
              <div className="space-y-4">
                {Object.entries(bancos).map(([banco, vals]) => (
                  <div key={banco} className="flex items-start gap-3">
                    <span className="text-lg">{bancoIcon(banco)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${bancoColor(banco)}`}>{banco}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-1">
                        <div>
                          <p className="text-[10px] text-[#86868B]">7 dias</p>
                          <p className="text-sm font-medium text-[#1D1D1F]">{fmt(vals.em7)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#86868B]">30 dias</p>
                          <p className="text-sm font-medium text-[#1D1D1F]">{fmt(vals.em30)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#86868B]">60 dias</p>
                          <p className="text-sm font-medium text-[#1D1D1F]">{fmt(vals.em60)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#86868B]">Total</p>
                          <p className="text-sm font-bold text-[#1D1D1F]">{fmt(vals.total)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline by week */}
          <div className={cardCls}>
            <h2 className="text-sm font-semibold text-[#1D1D1F] mb-4">Linha do tempo</h2>
            {weeks.length === 0 ? (
              <p className="text-sm text-[#86868B] py-4 text-center">Nenhum recebivel pendente</p>
            ) : (
              <div className="space-y-6">
                {weeks.map(([wk, { label, items }]) => {
                  const weekTotal = items.reduce((s, r) => s + r.valorParcela, 0);
                  // Group items within week by date
                  const byDate: Record<string, Recebivel[]> = {};
                  for (const r of items) {
                    if (!byDate[r.dataPrevista]) byDate[r.dataPrevista] = [];
                    byDate[r.dataPrevista].push(r);
                  }
                  return (
                    <div key={wk}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wide">{label}</p>
                        <p className="text-xs font-bold text-[#E8740E]">{fmt(weekTotal)}</p>
                      </div>
                      <div className="space-y-1">
                        {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([dt, recs]) => (
                          <div key={dt}>
                            <div className="flex items-center gap-2 mb-1">
                              <div className="w-2 h-2 rounded-full bg-[#E8740E] shrink-0" />
                              <span className="text-xs font-semibold text-[#1D1D1F]">{formatDate(dt)}</span>
                              <span className="text-[10px] text-[#86868B]">
                                {fmt(recs.reduce((s, r) => s + r.valorParcela, 0))}
                              </span>
                            </div>
                            <div className="ml-4 space-y-1">
                              {recs.map((r, idx) => (
                                <div
                                  key={`${r.vendaId}-${r.parcela}-${r.fonte}-${idx}`}
                                  className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-[#F5F5F7] text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span>{bancoIcon(r.banco)}</span>
                                    <span className="text-[#1D1D1F] font-medium truncate">{r.cliente}</span>
                                    <span className="text-[#86868B] shrink-0">
                                      {r.parcela}/{r.totalParcelas}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-[10px] ${bancoColor(r.banco)}`}>{r.banco}</span>
                                    <span className="text-[#1D1D1F] font-bold">{fmt(r.valorParcela)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
