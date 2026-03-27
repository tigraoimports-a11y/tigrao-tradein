"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const pct = (v: number) => `${v.toFixed(1)}%`;

function getWeekRange(date: Date): { start: string; end: string; label: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const f = (dt: Date) => dt.toISOString().split("T")[0];
  const label = `${mon.getDate().toString().padStart(2, "0")}/${(mon.getMonth() + 1).toString().padStart(2, "0")} a ${sun.getDate().toString().padStart(2, "0")}/${(sun.getMonth() + 1).toString().padStart(2, "0")}`;
  return { start: f(mon), end: f(sun), label };
}

function getMonthRange(year: number, month: number): { start: string; end: string; label: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
  const meses = ["", "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return { start, end, label: `${meses[month]} ${year}` };
}

interface Venda {
  data: string; cliente: string; produto: string; custo: number; preco_vendido: number;
  lucro: number; margem_pct: number; banco: string; forma: string; recebimento: string;
  origem: string; tipo: string; local: string; fornecedor: string; status_pagamento: string;
}

interface Gasto {
  data: string; descricao: string; valor: number; banco: string; usuario: string;
}

type Periodo = "semana" | "mes";

export default function RelatoriosPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  // Estado para envio de relatórios PDF por email
  const [sendingSemanal, setSendingSemanal] = useState(false);
  const [sendingMensal, setSendingMensal] = useState(false);
  const [reportMsg, setReportMsg] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const enviarRelatorio = async (tipo: "semanal" | "mensal") => {
    const setSending = tipo === "semanal" ? setSendingSemanal : setSendingMensal;
    setSending(true);
    setReportMsg(null);
    try {
      const res = await fetch(`/api/reports/${tipo}`);
      const data = await res.json();
      if (data.ok) {
        setReportMsg({ type: "ok", text: `Relatório ${tipo} enviado com sucesso para o email!` });
      } else {
        setReportMsg({ type: "error", text: data.error || `Erro ao enviar relatório ${tipo}` });
      }
    } catch (err) {
      setReportMsg({ type: "error", text: `Erro de conexão: ${String(err)}` });
    }
    setSending(false);
  };

  const hoje = new Date();
  const range = periodo === "semana"
    ? (() => { const d = new Date(hoje); d.setDate(d.getDate() + weekOffset * 7); return getWeekRange(d); })()
    : (() => { const d = new Date(hoje.getFullYear(), hoje.getMonth() + monthOffset, 1); return getMonthRange(d.getFullYear(), d.getMonth() + 1); })();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, gRes] = await Promise.all([
        fetch("/api/vendas", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } }),
        fetch("/api/gastos", { headers: { "x-admin-password": password } }),
      ]);
      if (vRes.ok) {
        const vj = await vRes.json();
        setVendas((vj.data ?? []).filter((v: Venda) => v.data >= range.start && v.data <= range.end && v.status_pagamento !== "CANCELADO"));
      }
      if (gRes.ok) {
        const gj = await gRes.json();
        setGastos((gj.data ?? []).filter((g: Gasto) => g.data >= range.start && g.data <= range.end));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, range.start, range.end]);

  useEffect(() => { if (password) fetchData(); }, [password, fetchData]);

  // KPIs
  const totalVendido = vendas.reduce((s, v) => s + (v.preco_vendido || 0), 0);
  const totalCusto = vendas.reduce((s, v) => s + (v.custo || 0), 0);
  const totalLucro = vendas.reduce((s, v) => s + (v.lucro || 0), 0);
  const totalGastos = gastos.reduce((s, g) => s + (g.valor || 0), 0);
  const lucroLiquido = totalLucro - totalGastos;
  const margemMedia = totalVendido > 0 ? (totalLucro / totalVendido) * 100 : 0;
  const ticketMedio = vendas.length > 0 ? totalVendido / vendas.length : 0;

  // Por dia
  const byDate: Record<string, { vendas: number; vendido: number; lucro: number; gastos: number }> = {};
  vendas.forEach(v => {
    if (!byDate[v.data]) byDate[v.data] = { vendas: 0, vendido: 0, lucro: 0, gastos: 0 };
    byDate[v.data].vendas++;
    byDate[v.data].vendido += v.preco_vendido || 0;
    byDate[v.data].lucro += v.lucro || 0;
  });
  gastos.forEach(g => {
    if (!byDate[g.data]) byDate[g.data] = { vendas: 0, vendido: 0, lucro: 0, gastos: 0 };
    byDate[g.data].gastos += g.valor || 0;
  });
  const sortedDates = Object.keys(byDate).sort();

  // Por origem
  const byOrigem: Record<string, { qtd: number; lucro: number }> = {};
  vendas.forEach(v => {
    const o = v.origem || "N/A";
    if (!byOrigem[o]) byOrigem[o] = { qtd: 0, lucro: 0 };
    byOrigem[o].qtd++;
    byOrigem[o].lucro += v.lucro || 0;
  });

  // Por banco
  const byBanco: Record<string, { qtd: number; total: number }> = {};
  vendas.forEach(v => {
    const b = v.banco || "N/A";
    if (!byBanco[b]) byBanco[b] = { qtd: 0, total: 0 };
    byBanco[b].qtd++;
    byBanco[b].total += v.preco_vendido || 0;
  });

  // Top produtos
  const byProduto: Record<string, { qtd: number; lucro: number }> = {};
  vendas.forEach(v => {
    const p = v.produto || "N/A";
    if (!byProduto[p]) byProduto[p] = { qtd: 0, lucro: 0 };
    byProduto[p].qtd++;
    byProduto[p].lucro += v.lucro || 0;
  });
  const topProdutos = Object.entries(byProduto).sort((a, b) => b[1].qtd - a[1].qtd).slice(0, 10);

  // Top clientes
  const byCliente: Record<string, { qtd: number; total: number }> = {};
  vendas.forEach(v => {
    const c = v.cliente || "N/A";
    if (!byCliente[c]) byCliente[c] = { qtd: 0, total: 0 };
    byCliente[c].qtd++;
    byCliente[c].total += v.preco_vendido || 0;
  });
  const topClientes = Object.entries(byCliente).sort((a, b) => b[1].total - a[1].total).slice(0, 10);

  const cardCls = `rounded-2xl border p-5 shadow-sm ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`;
  const thCls = `px-3 py-2 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider`;
  const tdCls = `px-3 py-2 text-sm ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`;

  const formatDateBR = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}`; };
  const diasSemana: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sab" };
  const getDiaSemana = (d: string) => diasSemana[new Date(d + "T12:00:00").getDay()];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className={`text-2xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Relatorios</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-[#D2D2D7]">
            {(["semana", "mes"] as const).map(p => (
              <button key={p} onClick={() => { setPeriodo(p); setWeekOffset(0); setMonthOffset(0); }}
                className={`px-4 py-2 text-sm font-semibold ${periodo === p ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#1C1C1E] text-[#98989D]" : "bg-white text-[#86868B]"}`}`}>
                {p === "semana" ? "Semanal" : "Mensal"}
              </button>
            ))}
          </div>
          <button onClick={() => periodo === "semana" ? setWeekOffset(o => o - 1) : setMonthOffset(o => o - 1)}
            className={`px-3 py-2 rounded-lg text-sm ${dm ? "bg-[#2C2C2E] text-[#F5F5F7]" : "bg-[#F5F5F7]"}`}>◀</button>
          <span className={`text-sm font-medium min-w-[140px] text-center ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{range.label}</span>
          <button onClick={() => periodo === "semana" ? setWeekOffset(o => o + 1) : setMonthOffset(o => o + 1)}
            className={`px-3 py-2 rounded-lg text-sm ${dm ? "bg-[#2C2C2E] text-[#F5F5F7]" : "bg-[#F5F5F7]"}`}>▶</button>
        </div>
      </div>

      {/* Enviar Relatórios PDF por Email */}
      <div className={cardCls}>
        <h2 className={`text-sm font-bold uppercase mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
          Enviar Relatório PDF por Email
        </h2>
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={() => enviarRelatorio("semanal")}
            disabled={sendingSemanal}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#E8740E] hover:bg-[#D06A0D] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sendingSemanal ? "Gerando..." : "Gerar Relatório Semanal"}
          </button>
          <button
            onClick={() => enviarRelatorio("mensal")}
            disabled={sendingMensal}
            className="px-5 py-2.5 rounded-xl font-semibold text-sm text-white bg-[#1D1D1F] hover:bg-[#3A3A3C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {sendingMensal ? "Gerando..." : "Gerar Relatório Mensal"}
          </button>
        </div>
        {reportMsg && (
          <p className={`mt-3 text-sm font-medium ${reportMsg.type === "ok" ? "text-green-600" : "text-red-500"}`}>
            {reportMsg.text}
          </p>
        )}
        <p className="mt-2 text-xs text-[#86868B]">
          O semanal envia as últimas 2 semanas (com comparativo). O mensal envia o mês anterior completo.
        </p>
      </div>

      {loading ? <p className="text-center py-8 text-[#86868B]">Carregando...</p> : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Vendas", value: String(vendas.length), color: "" },
              { label: "Vendido", value: fmt(totalVendido), color: "" },
              { label: "Custo", value: fmt(totalCusto), color: "" },
              { label: "Lucro Bruto", value: fmt(totalLucro), color: totalLucro >= 0 ? "text-green-600" : "text-red-500" },
              { label: "Gastos", value: fmt(totalGastos), color: "text-red-500" },
              { label: "Lucro Liquido", value: fmt(lucroLiquido), color: lucroLiquido >= 0 ? "text-green-600" : "text-red-500" },
              { label: "Margem Media", value: pct(margemMedia), color: "" },
            ].map((k, i) => (
              <div key={i} className={cardCls}>
                <p className="text-[10px] uppercase tracking-wide text-[#86868B]">{k.label}</p>
                <p className={`text-lg font-bold mt-1 ${k.color || (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Resumo por dia */}
          <div className={cardCls}>
            <h2 className={`text-sm font-bold uppercase mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Resumo por Dia</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
                    <th className={thCls}>Dia</th>
                    <th className={thCls}>Vendas</th>
                    <th className={thCls}>Vendido</th>
                    <th className={thCls}>Lucro</th>
                    <th className={thCls}>Gastos</th>
                    <th className={thCls}>Liquido</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedDates.map(d => {
                    const r = byDate[d];
                    const liq = r.lucro - r.gastos;
                    return (
                      <tr key={d} className={`border-b ${dm ? "border-[#2C2C2E]" : "border-[#F5F5F7]"}`}>
                        <td className={tdCls}><span className="font-medium">{formatDateBR(d)}</span> <span className="text-[#86868B] text-xs">{getDiaSemana(d)}</span></td>
                        <td className={tdCls}>{r.vendas}</td>
                        <td className={tdCls}>{fmt(r.vendido)}</td>
                        <td className={`${tdCls} ${r.lucro >= 0 ? "text-green-600" : "text-red-500"} font-medium`}>{fmt(r.lucro)}</td>
                        <td className={`${tdCls} text-red-500`}>{r.gastos > 0 ? fmt(r.gastos) : "—"}</td>
                        <td className={`${tdCls} font-bold ${liq >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(liq)}</td>
                      </tr>
                    );
                  })}
                  <tr className={`font-bold ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                    <td className={tdCls}>TOTAL</td>
                    <td className={tdCls}>{vendas.length}</td>
                    <td className={tdCls}>{fmt(totalVendido)}</td>
                    <td className={`${tdCls} ${totalLucro >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(totalLucro)}</td>
                    <td className={`${tdCls} text-red-500`}>{fmt(totalGastos)}</td>
                    <td className={`${tdCls} ${lucroLiquido >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(lucroLiquido)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Grids: Origem + Banco */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className={cardCls}>
              <h2 className={`text-sm font-bold uppercase mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Por Origem</h2>
              <table className="w-full text-sm">
                <thead><tr className={`border-b ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
                  <th className={thCls}>Origem</th><th className={thCls}>Qtd</th><th className={thCls}>Lucro</th>
                </tr></thead>
                <tbody>
                  {Object.entries(byOrigem).sort((a, b) => b[1].qtd - a[1].qtd).map(([o, r]) => (
                    <tr key={o} className={`border-b ${dm ? "border-[#2C2C2E]" : "border-[#F5F5F7]"}`}>
                      <td className={tdCls}>{o}</td><td className={tdCls}>{r.qtd}</td>
                      <td className={`${tdCls} ${r.lucro >= 0 ? "text-green-600" : "text-red-500"} font-medium`}>{fmt(r.lucro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={cardCls}>
              <h2 className={`text-sm font-bold uppercase mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Por Banco</h2>
              <table className="w-full text-sm">
                <thead><tr className={`border-b ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
                  <th className={thCls}>Banco</th><th className={thCls}>Qtd</th><th className={thCls}>Total</th>
                </tr></thead>
                <tbody>
                  {Object.entries(byBanco).sort((a, b) => b[1].total - a[1].total).map(([b, r]) => (
                    <tr key={b} className={`border-b ${dm ? "border-[#2C2C2E]" : "border-[#F5F5F7]"}`}>
                      <td className={tdCls}>{b}</td><td className={tdCls}>{r.qtd}</td>
                      <td className={`${tdCls} font-medium`}>{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top Produtos + Top Clientes */}
          <div className="grid md:grid-cols-2 gap-4">
            <div className={cardCls}>
              <h2 className={`text-sm font-bold uppercase mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Top 10 Produtos</h2>
              <table className="w-full text-sm">
                <thead><tr className={`border-b ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
                  <th className={thCls}>#</th><th className={thCls}>Produto</th><th className={thCls}>Qtd</th><th className={thCls}>Lucro</th>
                </tr></thead>
                <tbody>
                  {topProdutos.map(([p, r], i) => (
                    <tr key={p} className={`border-b ${dm ? "border-[#2C2C2E]" : "border-[#F5F5F7]"}`}>
                      <td className={`${tdCls} text-[#86868B]`}>{i + 1}</td>
                      <td className={`${tdCls} max-w-[200px] truncate`}>{p}</td>
                      <td className={tdCls}>{r.qtd}</td>
                      <td className={`${tdCls} ${r.lucro >= 0 ? "text-green-600" : "text-red-500"} font-medium`}>{fmt(r.lucro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={cardCls}>
              <h2 className={`text-sm font-bold uppercase mb-3 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Top 10 Clientes</h2>
              <table className="w-full text-sm">
                <thead><tr className={`border-b ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
                  <th className={thCls}>#</th><th className={thCls}>Cliente</th><th className={thCls}>Compras</th><th className={thCls}>Total</th>
                </tr></thead>
                <tbody>
                  {topClientes.map(([c, r], i) => (
                    <tr key={c} className={`border-b ${dm ? "border-[#2C2C2E]" : "border-[#F5F5F7]"}`}>
                      <td className={`${tdCls} text-[#86868B]`}>{i + 1}</td>
                      <td className={`${tdCls} max-w-[200px] truncate`}>{c}</td>
                      <td className={tdCls}>{r.qtd}</td>
                      <td className={`${tdCls} font-medium`}>{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Info */}
          <div className={`text-xs text-[#86868B] text-center`}>
            Ticket medio: {fmt(ticketMedio)} | Periodo: {range.start} a {range.end}
          </div>
        </>
      )}
    </div>
  );
}
