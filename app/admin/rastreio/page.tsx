"use client";

import React, { useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

interface EstoqueItem {
  id: string; produto: string; cor: string; qnt: number; custo_unitario: number;
  fornecedor: string; categoria: string; serial_no?: string; imei?: string;
  data_entrada?: string; tipo?: string;
}

interface VendaItem {
  id: string; data: string; cliente: string; produto: string; custo: number;
  preco_vendido: number; lucro: number; banco: string; forma: string;
  serial_no?: string; imei?: string; status_pagamento: string;
  fornecedor?: string;
}

interface TimelineEvent {
  date: string; type: "entrada" | "venda" | "troca" | "pendencia";
  title: string; detail: string; extra?: Record<string, string>;
}

export default function RastreioPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ estoque: EstoqueItem[]; vendas: VendaItem[]; timeline: TimelineEvent[] } | null>(null);

  const handleSearch = useCallback(async () => {
    const q = query.trim().toUpperCase();
    if (!q || q.length < 3) return;
    setSearching(true);
    setResults(null);
    try {
      const [eRes, vRes] = await Promise.all([
        fetch("/api/estoque", { headers: { "x-admin-password": password } }),
        fetch("/api/vendas", { headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" } }),
      ]);

      let estoqueMatches: EstoqueItem[] = [];
      let vendaMatches: VendaItem[] = [];

      if (eRes.ok) {
        const ej = await eRes.json();
        const all: EstoqueItem[] = ej.data ?? ej.estoque ?? [];
        estoqueMatches = all.filter(e =>
          (e.serial_no && e.serial_no.toUpperCase().includes(q)) ||
          (e.imei && e.imei.toUpperCase().includes(q)) ||
          e.produto.toUpperCase().includes(q)
        );
      }

      if (vRes.ok) {
        const vj = await vRes.json();
        const all: VendaItem[] = vj.data ?? [];
        vendaMatches = all.filter(v =>
          (v.serial_no && v.serial_no.toUpperCase().includes(q)) ||
          (v.imei && v.imei.toUpperCase().includes(q)) ||
          v.produto.toUpperCase().includes(q)
        );
      }

      // Build timeline
      const timeline: TimelineEvent[] = [];
      estoqueMatches.forEach(e => {
        timeline.push({
          date: e.data_entrada || "—",
          type: e.tipo === "SEMINOVO" ? "troca" : "entrada",
          title: `Entrada no estoque`,
          detail: e.produto + (e.cor ? ` ${e.cor}` : ""),
          extra: {
            "Fornecedor": e.fornecedor || "—",
            "Custo": fmt(e.custo_unitario || 0),
            "Categoria": e.categoria || "—",
            "Qtd atual": String(e.qnt),
            ...(e.serial_no ? { "Serial": e.serial_no } : {}),
            ...(e.imei ? { "IMEI": e.imei } : {}),
          },
        });
      });

      vendaMatches.forEach(v => {
        timeline.push({
          date: v.data,
          type: v.status_pagamento === "CANCELADO" ? "pendencia" : "venda",
          title: v.status_pagamento === "CANCELADO" ? "Venda cancelada" : "Vendido",
          detail: `${v.produto} → ${v.cliente}`,
          extra: {
            "Cliente": v.cliente,
            "Vendido por": fmt(v.preco_vendido),
            "Custo": fmt(v.custo),
            "Lucro": fmt(v.lucro),
            "Banco": v.banco || "—",
            "Forma": v.forma || "—",
            ...(v.serial_no ? { "Serial": v.serial_no } : {}),
            ...(v.imei ? { "IMEI": v.imei } : {}),
          },
        });
      });

      timeline.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

      setResults({ estoque: estoqueMatches, vendas: vendaMatches, timeline });
    } catch { /* ignore */ }
    setSearching(false);
  }, [query, password]);

  const typeColors: Record<string, { bg: string; border: string; icon: string }> = {
    entrada: { bg: "bg-blue-50", border: "border-blue-300", icon: "📦" },
    venda: { bg: "bg-green-50", border: "border-green-300", icon: "💰" },
    troca: { bg: "bg-orange-50", border: "border-orange-300", icon: "♻️" },
    pendencia: { bg: "bg-red-50", border: "border-red-300", icon: "⚠️" },
  };

  const cardCls = `rounded-2xl border p-5 shadow-sm ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`;

  return (
    <div className="space-y-6">
      <h1 className={`text-2xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Rastreio de Produto</h1>
      <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Busque por Serial Number, IMEI ou nome do produto para ver toda a timeline.</p>

      {/* Search */}
      <div className="flex gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Serial, IMEI ou nome do produto..."
          className={`flex-1 px-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors uppercase ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`}
        />
        <button
          onClick={handleSearch}
          disabled={searching}
          className="px-6 py-3 rounded-xl text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors disabled:opacity-50"
        >
          {searching ? "Buscando..." : "🔍 Buscar"}
        </button>
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Summary */}
          <div className="flex gap-4 text-sm">
            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>
              {results.estoque.length} no estoque | {results.vendas.length} vendas | {results.timeline.length} eventos
            </span>
          </div>

          {/* Timeline */}
          {results.timeline.length === 0 ? (
            <div className={`${cardCls} text-center py-8`}>
              <p className="text-[#86868B]">Nenhum resultado para &quot;{query}&quot;</p>
            </div>
          ) : (
            <div className="relative">
              {/* Linha vertical */}
              <div className={`absolute left-6 top-0 bottom-0 w-0.5 ${dm ? "bg-[#3A3A3C]" : "bg-[#D2D2D7]"}`} />

              <div className="space-y-4">
                {results.timeline.map((ev, i) => {
                  const c = typeColors[ev.type] || typeColors.entrada;
                  return (
                    <div key={i} className="relative pl-14">
                      {/* Dot */}
                      <div className={`absolute left-4 top-5 w-5 h-5 rounded-full flex items-center justify-center text-xs ${c.bg} border-2 ${c.border}`}>
                        {c.icon}
                      </div>
                      {/* Card */}
                      <div className={`${cardCls} ${c.bg} border ${c.border}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-xs font-bold uppercase ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{ev.date}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${c.bg} ${c.border} border`}>{ev.title}</span>
                        </div>
                        <p className={`text-sm font-medium mb-2 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{ev.detail}</p>
                        {ev.extra && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                            {Object.entries(ev.extra).map(([k, v]) => (
                              <div key={k} className="text-xs">
                                <span className="text-[#86868B]">{k}: </span>
                                <span className={`font-medium ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{v}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
