"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface SearchResult {
  tipo: "estoque" | "venda";
  id: string;
  produto: string;
  status: string;
  cor?: string;
  custo?: number;
  fornecedor?: string;
  imei?: string;
  serial_no?: string;
  cliente?: string;
  preco_vendido?: number;
  lucro?: number;
  data?: string;
  categoria?: string;
  forma?: string;
  banco?: string;
  tipo_venda?: string;
}

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

export default function SuperSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { password, darkMode: dm } = useAdmin();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setResults([]);
      setExpandedId(null);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (includeHistory) params.set("history", "true");
      const res = await fetch(`/api/admin/search?${params}`, {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setResults(json.results ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, includeHistory]);

  useEffect(() => {
    const timer = setTimeout(() => { if (query.trim()) search(query); }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const bgOverlay = "bg-black/50 backdrop-blur-sm";
  const bgModal = dm ? "bg-[#1C1C1E]" : "bg-white";
  const borderModal = dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const bgInput = dm ? "bg-[#2C2C2E] text-[#F5F5F7] border-[#3A3A3C]" : "bg-[#F5F5F7] text-[#1D1D1F] border-[#D2D2D7]";
  const bgHover = dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F5F5F7]";

  const statusColor = (status: string) => {
    if (status === "EM ESTOQUE") return "bg-green-100 text-green-700";
    if (status === "A CAMINHO") return "bg-yellow-100 text-yellow-700";
    if (status === "PENDENTE") return "bg-orange-100 text-orange-700";
    if (status === "FINALIZADO") return "bg-blue-100 text-blue-700";
    if (status === "VENDIDO") return "bg-blue-100 text-blue-700";
    return "bg-gray-100 text-gray-700";
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center pt-[10vh] ${bgOverlay}`} onClick={onClose}>
      <div
        className={`w-full max-w-2xl ${bgModal} border ${borderModal} rounded-2xl shadow-2xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E8E8ED]">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={textSecondary}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busque por produto, serie, contato, valor..."
            className={`flex-1 bg-transparent text-[15px] ${textPrimary} placeholder:${textSecondary} focus:outline-none`}
          />
          <button onClick={onClose} className={`text-xs ${textSecondary} hover:text-[#E8740E]`}>ESC</button>
        </div>

        {/* Include history toggle */}
        <div className="px-5 py-2 border-b border-[#E8E8ED] flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeHistory}
            onChange={(e) => setIncludeHistory(e.target.checked)}
            className="accent-[#E8740E]"
            id="include-history"
          />
          <label htmlFor="include-history" className={`text-xs ${textSecondary} cursor-pointer`}>
            Incluir historico completo
          </label>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className={`py-12 text-center text-sm ${textSecondary}`}>Buscando...</div>
          ) : query.length < 2 ? (
            <div className="py-12 text-center">
              <p className="text-3xl mb-2">🔍</p>
              <p className={`text-sm ${textSecondary}`}>Digite para buscar</p>
            </div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center">
              <p className={`text-sm ${textSecondary}`}>Nenhum resultado para &quot;{query}&quot;</p>
            </div>
          ) : (
            <div className="divide-y divide-[#F0F0F5]">
              {results.map((r) => (
                <div key={`${r.tipo}-${r.id}`}>
                  <div
                    className={`px-5 py-3 cursor-pointer ${bgHover} transition-colors`}
                    onClick={() => setExpandedId(expandedId === `${r.tipo}-${r.id}` ? null : `${r.tipo}-${r.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{r.tipo === "estoque" ? "📦" : "💰"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-semibold ${textPrimary} truncate`}>{r.produto}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusColor(r.status)}`}>
                            {r.status}
                          </span>
                          {r.tipo_venda && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${r.tipo_venda === "ATACADO" ? "bg-blue-100 text-blue-700" : r.tipo_venda === "UPGRADE" ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"}`}>
                              {r.tipo_venda}
                            </span>
                          )}
                        </div>
                        <div className={`text-xs ${textSecondary} mt-0.5 flex items-center gap-2 flex-wrap`}>
                          {r.cor && <span>{r.cor}</span>}
                          {r.fornecedor && <span>Forn: {r.fornecedor}</span>}
                          {r.cliente && <span>Cliente: {r.cliente}</span>}
                          {r.data && <span>{r.data}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {r.tipo === "venda" && r.preco_vendido ? (
                          <div>
                            <p className="text-sm font-bold text-[#E8740E]">{fmt(r.preco_vendido)}</p>
                            {r.lucro !== undefined && (
                              <p className={`text-[10px] font-semibold ${r.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>
                                Lucro: {fmt(r.lucro)}
                              </p>
                            )}
                          </div>
                        ) : r.custo ? (
                          <p className={`text-sm font-semibold ${textSecondary}`}>{fmt(r.custo)}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {expandedId === `${r.tipo}-${r.id}` && (
                    <div className={`px-5 py-3 ${dm ? "bg-[#2C2C2E]" : "bg-[#FAFAFA]"} border-t border-[#F0F0F5]`}>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                        {r.categoria && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Categoria</p>
                            <p className={textPrimary}>{r.categoria}</p>
                          </div>
                        )}
                        {r.imei && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>IMEI</p>
                            <p className={textPrimary}>{r.imei}</p>
                          </div>
                        )}
                        {r.serial_no && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Serial</p>
                            <p className={textPrimary}>{r.serial_no}</p>
                          </div>
                        )}
                        {r.custo !== undefined && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Custo</p>
                            <p className={textPrimary}>{fmt(r.custo)}</p>
                          </div>
                        )}
                        {r.fornecedor && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Fornecedor</p>
                            <p className={textPrimary}>{r.fornecedor}</p>
                          </div>
                        )}
                        {r.cliente && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Cliente</p>
                            <p className={textPrimary}>{r.cliente}</p>
                          </div>
                        )}
                        {r.preco_vendido !== undefined && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Vendido por</p>
                            <p className="text-[#E8740E] font-bold">{fmt(r.preco_vendido)}</p>
                          </div>
                        )}
                        {r.lucro !== undefined && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Lucro</p>
                            <p className={`font-bold ${r.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(r.lucro)}</p>
                          </div>
                        )}
                        {r.forma && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Forma</p>
                            <p className={textPrimary}>{r.forma} {r.banco ? `(${r.banco})` : ""}</p>
                          </div>
                        )}
                        {r.cor && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Cor</p>
                            <p className={textPrimary}>{r.cor}</p>
                          </div>
                        )}
                        {r.data && (
                          <div>
                            <p className={`font-semibold uppercase tracking-wider ${textSecondary}`}>Data</p>
                            <p className={textPrimary}>{r.data}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
