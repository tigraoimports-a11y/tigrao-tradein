"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useAdmin } from "@/components/admin/AdminShell";
import { corParaPT } from "@/lib/cor-pt";

/* eslint-disable @typescript-eslint/no-explicit-any */

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

interface SearchResult {
  source: "estoque" | "venda" | "produto_individual";
  location: string;
  id: string;
  produto: string;
  status: string;
  cor?: string;
  custo?: number;
  fornecedor?: string;
  imei?: string;
  serial_no?: string;
  data_compra?: string;
  data_entrada?: string;
  data_saida?: string;
  data_venda?: string;
  categoria?: string;
  tipo_produto?: string;
  armazenamento?: string;
  observacao?: string;
  bateria?: number;
  qnt?: number;
  cliente?: string;
  preco_vendido?: number;
  lucro?: number;
  data?: string;
  forma?: string;
  banco?: string;
  tipo_venda?: string;
  parcelas?: number;
  estoque_id?: string;
  venda_id?: string;
  status_pagamento?: string;
}

const locationLabel: Record<string, { text: string; color: string; bg: string; icon: string }> = {
  em_estoque: { text: "Em Estoque", color: "text-green-700", bg: "bg-green-50 border-green-200", icon: "📦" },
  a_caminho: { text: "A Caminho", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200", icon: "🚚" },
  vendido: { text: "Vendido", color: "text-blue-700", bg: "bg-blue-50 border-blue-200", icon: "💰" },
  pendente: { text: "Pendente", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", icon: "⏳" },
  esgotado: { text: "Esgotado", color: "text-red-700", bg: "bg-red-50 border-red-200", icon: "❌" },
  devolvido: { text: "Devolvido", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: "↩️" },
};

export default function BuscaSerialPage() {
  const { password, darkMode: dm } = useAdmin();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = useCallback(async () => {
    const q = query.trim();
    if (!q || q.length < 2) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await fetch(`/api/admin/busca?q=${encodeURIComponent(q)}`, {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setResults(json.results ?? []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [query, password]);

  // Group results by serial/imei to show timeline per device
  const grouped = React.useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const r of results) {
      const key = r.serial_no || r.imei || r.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [results]);

  const cardCls = `rounded-2xl border p-5 shadow-sm transition-colors ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`;
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-2xl font-bold ${textPrimary}`}>Busca por Serial / IMEI</h1>
        <p className={`text-sm mt-1 ${textSecondary}`}>
          Encontre qualquer produto pelo numero de serie ou IMEI. Veja onde esta: estoque, vendido ou a caminho.
        </p>
      </div>

      {/* Search bar */}
      <div className={`${cardCls} !p-4`}>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${textSecondary}`}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Digite o Serial Number ou IMEI..."
              className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${
                dm
                  ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder-[#666]"
                  : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F] placeholder-[#86868B]"
              }`}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || query.trim().length < 2}
            className="px-6 py-3 rounded-xl text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors disabled:opacity-50 shrink-0"
          >
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </div>
        <p className={`text-xs mt-2 ${textSecondary}`}>
          Busca em estoque e vendas. Minimo 2 caracteres.
        </p>
      </div>

      {/* Results */}
      {loading && (
        <div className={`${cardCls} text-center py-12`}>
          <div className="inline-block w-6 h-6 border-2 border-[#E8740E] border-t-transparent rounded-full animate-spin mb-3" />
          <p className={textSecondary}>Buscando...</p>
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className={`${cardCls} text-center py-12`}>
          <p className="text-3xl mb-2">🔍</p>
          <p className={`text-sm ${textSecondary}`}>
            Nenhum resultado encontrado para &quot;{query}&quot;
          </p>
          <p className={`text-xs mt-1 ${textSecondary}`}>
            Verifique se o serial ou IMEI esta correto e tente novamente.
          </p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className={`text-sm ${textSecondary}`}>
            {results.length} resultado{results.length !== 1 ? "s" : ""} encontrado{results.length !== 1 ? "s" : ""}
          </div>

          <div className="space-y-6">
            {grouped.map(([key, items]) => {
              const mainItem = items[0];
              const serial = mainItem.serial_no || mainItem.imei || "—";
              const loc = locationLabel[mainItem.location] || locationLabel.em_estoque;

              // Find entries - produto_individual contains both estoque and venda info
              const piItem = items.find((i) => i.source === "produto_individual");
              const estoqueItem = piItem || items.find((i) => i.source === "estoque");
              const vendaItem = piItem?.location === "vendido" ? piItem : items.find((i) => i.source === "venda");

              return (
                <div key={key} className={cardCls}>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{loc.icon}</span>
                        <h3 className={`text-base font-bold ${textPrimary}`}>{mainItem.produto}</h3>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {mainItem.serial_no && (
                          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`}>
                            SN: {mainItem.serial_no}
                          </span>
                        )}
                        {mainItem.imei && (
                          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`}>
                            IMEI: {mainItem.imei}
                          </span>
                        )}
                        {mainItem.cor && (
                          <span className={`text-xs ${textSecondary}`}>{corParaPT(mainItem.cor)}</span>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${loc.bg} ${loc.color}`}>
                      {loc.text}
                    </span>
                  </div>

                  {/* Timeline */}
                  <div className="relative ml-3">
                    <div className={`absolute left-2.5 top-0 bottom-0 w-0.5 ${dm ? "bg-[#3A3A3C]" : "bg-[#E8E8ED]"}`} />

                    <div className="space-y-4">
                      {/* Entrada no estoque */}
                      {estoqueItem && (
                        <div className="relative pl-8">
                          <div className={`absolute left-0 top-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 ${
                            estoqueItem.status === "A CAMINHO" || estoqueItem.status === "A_CAMINHO"
                              ? "bg-yellow-50 border-yellow-300"
                              : "bg-blue-50 border-blue-300"
                          }`}>
                            {estoqueItem.status === "A CAMINHO" || estoqueItem.status === "A_CAMINHO" ? "🚚" : "📦"}
                          </div>
                          <div className={`rounded-xl border p-3 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-xs font-bold ${textSecondary}`}>
                                {estoqueItem.status === "A CAMINHO" || estoqueItem.status === "A_CAMINHO" ? "A Caminho" : "Entrada no Estoque"}
                              </span>
                              <span className={`text-xs ${textSecondary}`}>
                                {estoqueItem.data_entrada ? new Date(estoqueItem.data_entrada).toLocaleDateString("pt-BR") : estoqueItem.data_compra || "—"}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className={textSecondary}>Fornecedor: </span>
                                <span className={`font-medium ${textPrimary}`}>{estoqueItem.fornecedor || "—"}</span>
                              </div>
                              <div>
                                <span className={textSecondary}>Custo: </span>
                                <span className={`font-medium ${textPrimary}`}>{estoqueItem.custo ? fmt(estoqueItem.custo) : "—"}</span>
                              </div>
                              <div>
                                <span className={textSecondary}>Categoria: </span>
                                <span className={`font-medium ${textPrimary}`}>{estoqueItem.categoria || "—"}</span>
                              </div>
                              {estoqueItem.armazenamento && (
                                <div>
                                  <span className={textSecondary}>Armazenamento: </span>
                                  <span className={`font-medium ${textPrimary}`}>{estoqueItem.armazenamento}</span>
                                </div>
                              )}
                              {estoqueItem.tipo_produto && (
                                <div>
                                  <span className={textSecondary}>Condicao: </span>
                                  <span className={`font-medium ${textPrimary}`}>
                                    {estoqueItem.tipo_produto === "NOVO" ? "Lacrado" : estoqueItem.tipo_produto === "SEMINOVO" ? "Usado" : estoqueItem.tipo_produto}
                                  </span>
                                </div>
                              )}
                              {estoqueItem.bateria && (
                                <div>
                                  <span className={textSecondary}>Bateria: </span>
                                  <span className={`font-medium ${textPrimary}`}>{estoqueItem.bateria}%</span>
                                </div>
                              )}
                              {estoqueItem.observacao && (
                                <div className="col-span-2 sm:col-span-3">
                                  <span className={textSecondary}>Obs: </span>
                                  <span className={`font-medium ${textPrimary}`}>{estoqueItem.observacao}</span>
                                </div>
                              )}
                            </div>
                            <div className="mt-2">
                              <Link
                                href="/admin/estoque"
                                className="text-xs text-[#E8740E] hover:text-[#D06A0D] font-medium transition-colors"
                              >
                                Ver no estoque →
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Venda */}
                      {vendaItem && vendaItem.location === "vendido" && (
                        <div className="relative pl-8">
                          <div className="absolute left-0 top-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-green-50 border-2 border-green-300">
                            💰
                          </div>
                          <div className={`rounded-xl border p-3 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-xs font-bold ${textSecondary}`}>Vendido</span>
                              <span className={`text-xs ${textSecondary}`}>{vendaItem.data_venda || vendaItem.data || "—"}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                              <div>
                                <span className={textSecondary}>Cliente: </span>
                                <span className={`font-medium ${textPrimary}`}>{vendaItem.cliente || "—"}</span>
                              </div>
                              <div>
                                <span className={textSecondary}>Valor: </span>
                                <span className="font-medium text-[#E8740E]">
                                  {vendaItem.preco_vendido ? fmt(vendaItem.preco_vendido) : "—"}
                                </span>
                              </div>
                              {vendaItem.lucro !== undefined && (
                                <div>
                                  <span className={textSecondary}>Lucro: </span>
                                  <span className={`font-medium ${(vendaItem.lucro ?? 0) >= 0 ? "text-green-600" : "text-red-500"}`}>
                                    {fmt(vendaItem.lucro ?? 0)}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className={textSecondary}>Forma: </span>
                                <span className={`font-medium ${textPrimary}`}>
                                  {vendaItem.forma || "—"}{vendaItem.banco ? ` (${vendaItem.banco})` : ""}{vendaItem.parcelas && vendaItem.parcelas > 1 ? ` ${vendaItem.parcelas}x` : ""}
                                </span>
                              </div>
                              <div>
                                <span className={textSecondary}>Status: </span>
                                <span className={`font-medium ${textPrimary}`}>{vendaItem.status_pagamento || vendaItem.status}</span>
                              </div>
                            </div>
                            <div className="mt-2">
                              <Link
                                href="/admin/vendas"
                                className="text-xs text-[#E8740E] hover:text-[#D06A0D] font-medium transition-colors"
                              >
                                Ver nas vendas →
                              </Link>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* If no details found */}
                      {!estoqueItem && !vendaItem && (
                        <div className="relative pl-8">
                          <div className="absolute left-0 top-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] bg-gray-50 border-2 border-gray-300">
                            ❓
                          </div>
                          <div className={`rounded-xl border p-3 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FAFAFA] border-[#E8E8ED]"}`}>
                            <p className={`text-xs ${textSecondary}`}>Registro encontrado mas sem detalhes adicionais.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {!searched && (
        <div className={`${cardCls} text-center py-12`}>
          <p className="text-4xl mb-3">🔍</p>
          <p className={`font-medium ${textPrimary}`}>Busca por Serial / IMEI</p>
          <p className={`text-sm mt-1 ${textSecondary}`}>
            Digite um numero de serie ou IMEI acima para rastrear o produto.
          </p>
          <p className={`text-xs mt-3 ${textSecondary}`}>
            Voce tambem pode usar <kbd className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>⌘K</kbd> para busca rapida em qualquer tela.
          </p>
        </div>
      )}
    </div>
  );
}
