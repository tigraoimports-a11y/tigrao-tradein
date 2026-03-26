"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { useTabParam } from "@/lib/useTabParam";
import type { Venda } from "@/lib/admin-types";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

type Tab = "pendentes" | "vencidos" | "todos" | "recebidos";
const TABS: readonly Tab[] = ["pendentes", "vencidos", "todos", "recebidos"];
const TAB_LABELS: Record<Tab, string> = {
  pendentes: "Pendentes",
  vencidos: "Vencidos",
  todos: "Todos",
  recebidos: "Recebidos",
};

interface FiadoVenda extends Venda {
  fiado_recebido?: boolean;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

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
  const [vendas, setVendas] = useState<FiadoVenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useTabParam<Tab>("pendentes", TABS);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const fetchVendas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vendas", {
        headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
      });
      if (res.ok) {
        const json = await res.json();
        const all: FiadoVenda[] = json.data ?? [];
        setVendas(all.filter((v) => v.entrada_fiado > 0));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => {
    if (password) fetchVendas();
  }, [password, fetchVendas]);

  const handleMarcarRecebido = async (id: string) => {
    if (!confirm("Marcar este fiado como recebido?")) return;
    setMarkingId(id);
    try {
      const res = await fetch("/api/vendas", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
          "x-admin-user": user?.nome || "sistema",
        },
        body: JSON.stringify({ id, fiado_recebido: true }),
      });
      const json = await res.json();
      if (json.ok) {
        setVendas((prev) =>
          prev.map((v) => (v.id === id ? { ...v, fiado_recebido: true } : v))
        );
      } else {
        alert("Erro: " + json.error);
      }
    } catch {
      alert("Erro de conexao");
    }
    setMarkingId(null);
  };

  // Derived data
  const hj = today();
  const pendentes = vendas.filter((v) => v.fiado_recebido !== true);
  const vencidos = pendentes.filter((v) => v.data_recebimento_fiado && v.data_recebimento_fiado < hj);
  const aVencer = pendentes.filter((v) => !v.data_recebimento_fiado || v.data_recebimento_fiado >= hj);
  const recebidos = vendas.filter((v) => v.fiado_recebido === true);

  const totalAReceber = pendentes.reduce((s, v) => s + Number(v.entrada_fiado), 0);
  const totalVencidos = vencidos.reduce((s, v) => s + Number(v.entrada_fiado), 0);
  const totalAVencer = aVencer.reduce((s, v) => s + Number(v.entrada_fiado), 0);
  const totalRecebidos = recebidos.reduce((s, v) => s + Number(v.entrada_fiado), 0);

  // Filter by tab
  let filtered: FiadoVenda[] = [];
  if (tab === "pendentes") filtered = aVencer;
  else if (tab === "vencidos") filtered = vencidos;
  else if (tab === "recebidos") filtered = recebidos;
  else filtered = vendas;

  // Sort: vencidos first, then by data_recebimento_fiado
  filtered = [...filtered].sort((a, b) => {
    const da = a.data_recebimento_fiado || "9999-12-31";
    const db = b.data_recebimento_fiado || "9999-12-31";
    return da.localeCompare(db);
  });

  function statusBadge(v: FiadoVenda) {
    if (v.fiado_recebido === true) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700">Recebido</span>;
    }
    if (v.data_recebimento_fiado && v.data_recebimento_fiado < hj) {
      return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-100 text-red-700">Vencido</span>;
    }
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-yellow-100 text-yellow-700">Pendente</span>;
  }

  function diasLabel(v: FiadoVenda) {
    if (v.fiado_recebido === true) return "—";
    if (!v.data_recebimento_fiado) return "Sem data";
    const diff = diffDays(v.data_recebimento_fiado);
    if (diff < 0) return `Vencido ha ${Math.abs(diff)}d`;
    if (diff === 0) return "Vence hoje";
    return `${diff}d restantes`;
  }

  const cardCls = `rounded-2xl border p-5 shadow-sm ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`;
  const thCls = `px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap`;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wide ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Total a Receber</p>
          <p className={`text-xl font-bold mt-1 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{fmt(totalAReceber)}</p>
          <p className="text-[10px] text-[#86868B] mt-1">{pendentes.length} pendente(s)</p>
        </div>
        <div className={`${cardCls} ${totalVencidos > 0 ? (dm ? "border-red-500/40" : "border-red-300 bg-red-50") : ""}`}>
          <p className={`text-xs uppercase tracking-wide ${totalVencidos > 0 ? "text-red-500 font-semibold" : (dm ? "text-[#98989D]" : "text-[#86868B]")}`}>Vencidos</p>
          <p className={`text-xl font-bold mt-1 ${totalVencidos > 0 ? "text-red-600" : (dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]")}`}>{fmt(totalVencidos)}</p>
          <p className="text-[10px] text-[#86868B] mt-1">{vencidos.length} venda(s)</p>
        </div>
        <div className={cardCls}>
          <p className={`text-xs uppercase tracking-wide ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>A Vencer</p>
          <p className={`text-xl font-bold mt-1 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{fmt(totalAVencer)}</p>
          <p className="text-[10px] text-[#86868B] mt-1">{aVencer.length} venda(s)</p>
        </div>
        <div className={`${cardCls} ${dm ? "border-green-500/30" : "border-green-200 bg-green-50"}`}>
          <p className="text-xs uppercase tracking-wide text-green-600 font-semibold">Recebidos</p>
          <p className="text-xl font-bold mt-1 text-green-600">{fmt(totalRecebidos)}</p>
          <p className="text-[10px] text-[#86868B] mt-1">{recebidos.length} venda(s)</p>
        </div>
      </div>

      {/* Tab filters */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              tab === t
                ? "bg-[#E8740E] text-white"
                : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`
            }`}
          >
            {TAB_LABELS[t]}
            {t === "vencidos" && vencidos.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px]">{vencidos.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                {["Data Venda", "Cliente", "Produto", "Valor Fiado", "Dt Recebimento", "Prazo", "Status", ""].map((h) => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#86868B]">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#86868B]">Nenhum registro encontrado</td></tr>
              ) : (
                filtered.map((v) => (
                  <tr
                    key={v.id}
                    className={`border-b transition-colors ${
                      dm
                        ? "border-[#2C2C2E] hover:bg-[#2C2C2E]"
                        : "border-[#F5F5F7] hover:bg-[#F5F5F7]"
                    }`}
                  >
                    <td className={`px-4 py-3 text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{formatDate(v.data)}</td>
                    <td className={`px-4 py-3 font-medium ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{v.cliente}</td>
                    <td className={`px-4 py-3 max-w-[180px] truncate ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{v.produto}</td>
                    <td className="px-4 py-3 font-bold text-[#E8740E]">{fmt(v.entrada_fiado)}</td>
                    <td className={`px-4 py-3 text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                      {v.data_recebimento_fiado ? formatDate(v.data_recebimento_fiado) : "—"}
                    </td>
                    <td className={`px-4 py-3 text-xs font-medium ${
                      v.fiado_recebido === true
                        ? "text-green-600"
                        : v.data_recebimento_fiado && v.data_recebimento_fiado < hj
                          ? "text-red-600"
                          : (dm ? "text-[#98989D]" : "text-[#86868B]")
                    }`}>
                      {diasLabel(v)}
                    </td>
                    <td className="px-4 py-3">{statusBadge(v)}</td>
                    <td className="px-4 py-3">
                      {v.fiado_recebido !== true && (
                        <button
                          onClick={() => handleMarcarRecebido(v.id)}
                          disabled={markingId === v.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {markingId === v.id ? "Salvando..." : "Marcar Recebido"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
