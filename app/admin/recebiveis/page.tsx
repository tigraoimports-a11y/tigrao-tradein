"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { useTabParam } from "@/lib/useTabParam";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

type Tab = "pendentes" | "vencidos" | "todos" | "recebidos";
const TABS: readonly Tab[] = ["pendentes", "vencidos", "todos", "recebidos"];
const TAB_LABELS: Record<Tab, string> = { pendentes: "Pendentes", vencidos: "Vencidos", todos: "Todos", recebidos: "Recebidos" };

interface Parcela { valor: number; data: string; recebido: boolean }
interface VendaFiado {
  id: string; data: string; cliente: string; produto: string;
  entrada_fiado: number; fiado_parcelas: Parcela[];
  status_pagamento: string;
}
interface ParcelaRow { venda: VendaFiado; parcela: Parcela; idx: number }

function today() { return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); }
function diffDays(dateStr: string): number {
  const target = new Date(dateStr + "T12:00:00");
  const now = new Date(today() + "T12:00:00");
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function RecebiveisPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [vendas, setVendas] = useState<VendaFiado[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useTabParam<Tab>("pendentes", TABS);
  const [markingKey, setMarkingKey] = useState<string | null>(null);

  const fetchVendas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vendas", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const all = (json.data ?? []).filter((v: any) => (v.entrada_fiado || 0) > 0 && v.status_pagamento !== "CANCELADO");
        setVendas(all);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { if (password) fetchVendas(); }, [password, fetchVendas]);

  // Flatten parcelas into rows
  const allRows: ParcelaRow[] = [];
  for (const v of vendas) {
    const parcelas = Array.isArray(v.fiado_parcelas) && v.fiado_parcelas.length > 0
      ? v.fiado_parcelas
      : [{ valor: v.entrada_fiado, data: "", recebido: false }]; // fallback: single parcela
    parcelas.forEach((p, idx) => allRows.push({ venda: v, parcela: p, idx }));
  }

  const hj = today();
  const pendentes = allRows.filter(r => !r.parcela.recebido && (!r.parcela.data || r.parcela.data >= hj));
  const vencidos = allRows.filter(r => !r.parcela.recebido && r.parcela.data && r.parcela.data < hj);
  const recebidos = allRows.filter(r => r.parcela.recebido);

  const totalPendentes = pendentes.reduce((s, r) => s + r.parcela.valor, 0);
  const totalVencidos = vencidos.reduce((s, r) => s + r.parcela.valor, 0);
  const totalAVencer = pendentes.reduce((s, r) => s + r.parcela.valor, 0);
  const totalRecebidos = recebidos.reduce((s, r) => s + r.parcela.valor, 0);

  let filtered: ParcelaRow[] = [];
  if (tab === "pendentes") filtered = pendentes;
  else if (tab === "vencidos") filtered = vencidos;
  else if (tab === "recebidos") filtered = recebidos;
  else filtered = allRows;

  filtered = [...filtered].sort((a, b) => (a.parcela.data || "9999").localeCompare(b.parcela.data || "9999"));

  const handleMarcarRecebido = async (row: ParcelaRow) => {
    const key = `${row.venda.id}-${row.idx}`;
    if (!confirm(`Marcar parcela ${row.idx + 1} de ${row.venda.cliente} (${fmt(row.parcela.valor)}) como recebida?`)) return;
    setMarkingKey(key);
    try {
      // Update the specific parcela in the JSONB array
      const parcelas = [...(row.venda.fiado_parcelas || [])];
      parcelas[row.idx] = { ...parcelas[row.idx], recebido: true };
      const allRecebido = parcelas.every(p => p.recebido);
      const res = await fetch("/api/vendas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
        body: JSON.stringify({ id: row.venda.id, fiado_parcelas: parcelas, ...(allRecebido ? { fiado_recebido: true } : {}) }),
      });
      if ((await res.json()).ok) {
        setVendas(prev => prev.map(v => v.id === row.venda.id ? { ...v, fiado_parcelas: parcelas } : v));
      }
    } catch { alert("Erro de conexao"); }
    setMarkingKey(null);
  };

  function statusBadge(r: ParcelaRow) {
    if (r.parcela.recebido) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">Recebido</span>;
    if (r.parcela.data && r.parcela.data < hj) return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">Vencido</span>;
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">Pendente</span>;
  }

  function diasLabel(r: ParcelaRow) {
    if (r.parcela.recebido) return "—";
    if (!r.parcela.data) return "Sem data";
    const d = diffDays(r.parcela.data);
    if (d < 0) return `Vencido ha ${Math.abs(d)}d`;
    if (d === 0) return "Vence hoje";
    return `${d}d restantes`;
  }

  const cardCls = `rounded-2xl border p-5 shadow-sm ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`;
  const thCls = `px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wide ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Total a Receber</p>
          <p className={`text-xl font-bold mt-1 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{fmt(totalPendentes + totalVencidos)}</p>
          <p className="text-[10px] text-[#86868B] mt-1">{pendentes.length + vencidos.length} parcela(s)</p>
        </div>
        <div className={`${cardCls} ${totalVencidos > 0 ? (dm ? "border-red-500/40" : "border-red-300 bg-red-50") : ""}`}>
          <p className={`text-xs uppercase tracking-wide ${totalVencidos > 0 ? "text-red-500 font-semibold" : (dm ? "text-[#98989D]" : "text-[#86868B]")}`}>Vencidos</p>
          <p className={`text-xl font-bold mt-1 ${totalVencidos > 0 ? "text-red-600" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{fmt(totalVencidos)}</p>
          <p className="text-[10px] text-[#86868B] mt-1">{vencidos.length} parcela(s)</p>
        </div>
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wide ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>A Vencer</p>
          <p className={`text-xl font-bold mt-1 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{fmt(totalAVencer)}</p>
          <p className="text-[10px] text-[#86868B] mt-1">{pendentes.length} parcela(s)</p>
        </div>
        <div className={`${cardCls} ${dm ? "border-green-500/30" : "border-green-200 bg-green-50"}`}>
          <p className="text-xs uppercase tracking-wide text-green-600 font-semibold">Recebidos</p>
          <p className="text-xl font-bold mt-1 text-green-600">{fmt(totalRecebidos)}</p>
          <p className="text-[10px] text-[#86868B] mt-1">{recebidos.length} parcela(s)</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}>
            {TAB_LABELS[t]}
            {t === "vencidos" && vencidos.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px]">{vencidos.length}</span>}
          </button>
        ))}
      </div>

      <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                {["Data Venda", "Cliente", "Produto", "Parcela", "Valor", "Vencimento", "Prazo", "Status", ""].map((h) => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-[#86868B]">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-[#86868B]">Nenhum registro encontrado</td></tr>
              ) : filtered.map((r) => {
                const totalParc = Array.isArray(r.venda.fiado_parcelas) ? r.venda.fiado_parcelas.length : 1;
                return (
                  <tr key={`${r.venda.id}-${r.idx}`}
                    className={`border-b transition-colors ${dm ? "border-[#2C2C2E] hover:bg-[#2C2C2E]" : "border-[#F5F5F7] hover:bg-[#F5F5F7]"}`}>
                    <td className={`px-4 py-3 text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{formatDate(r.venda.data)}</td>
                    <td className={`px-4 py-3 font-medium ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{r.venda.cliente}</td>
                    <td className={`px-4 py-3 max-w-[180px] truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{r.venda.produto}</td>
                    <td className={`px-4 py-3 text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{r.idx + 1}/{totalParc}</td>
                    <td className="px-4 py-3 font-bold text-[#E8740E]">{fmt(r.parcela.valor)}</td>
                    <td className={`px-4 py-3 text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{r.parcela.data ? formatDate(r.parcela.data) : "—"}</td>
                    <td className={`px-4 py-3 text-xs font-medium ${r.parcela.recebido ? "text-green-600" : r.parcela.data && r.parcela.data < hj ? "text-red-600" : (dm ? "text-[#98989D]" : "text-[#86868B]")}`}>
                      {diasLabel(r)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(r)}</td>
                    <td className="px-4 py-3">
                      {!r.parcela.recebido && (
                        <button onClick={() => handleMarcarRecebido(r)} disabled={markingKey === `${r.venda.id}-${r.idx}`}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors disabled:opacity-50 whitespace-nowrap">
                          {markingKey === `${r.venda.id}-${r.idx}` ? "..." : "Recebido"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
