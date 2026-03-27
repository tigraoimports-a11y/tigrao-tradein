"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

/* eslint-disable @typescript-eslint/no-explicit-any */
type SearchResult = Record<string, any>;

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

function DetailModal({ item, onClose, onSave, dm }: { item: SearchResult; onClose: () => void; onSave: (id: string, fields: Record<string, any>) => void; dm: boolean }) {
  const bgCard = dm ? "bg-[#1C1C1E]" : "bg-white";
  const bgSection = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#3A3A3C] border-[#4A4A4C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;

  const isEstoque = item.tipo === "estoque";
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    imei: item.imei || "",
    serial_no: item.serial_no || "",
    observacao: item.observacao || "",
    cor: item.cor || "",
    fornecedor: item.fornecedor || "",
    custo_unitario: item.custo ? String(item.custo) : "",
  });

  const statusColor = (s: string) => {
    if (s === "EM ESTOQUE") return "text-green-600";
    if (s === "A CAMINHO") return "text-yellow-600";
    if (s === "PENDENTE") return "text-orange-600";
    if (s === "VENDIDO" || s === "FINALIZADO") return "text-blue-600";
    return textSecondary;
  };

  const handleSave = () => {
    const updates: Record<string, any> = {};
    if (editFields.imei !== (item.imei || "")) updates.imei = editFields.imei || null;
    if (editFields.serial_no !== (item.serial_no || "")) updates.serial_no = editFields.serial_no || null;
    if (editFields.observacao !== (item.observacao || "")) updates.observacao = editFields.observacao || null;
    if (editFields.cor !== (item.cor || "")) updates.cor = editFields.cor || null;
    if (editFields.fornecedor !== (item.fornecedor || "")) updates.fornecedor = editFields.fornecedor || null;
    if (editFields.custo_unitario !== (item.custo ? String(item.custo) : "")) updates.custo_unitario = parseFloat(editFields.custo_unitario) || 0;
    if (Object.keys(updates).length > 0) onSave(item.id, updates);
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full max-w-lg mx-4 ${bgCard} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8ED]">
          <div className="flex items-center gap-2">
            <span className="text-lg">{isEstoque ? "📦" : "💰"}</span>
            <h3 className={`text-sm font-bold ${textPrimary}`}>Detalhes do Item</h3>
          </div>
          <div className="flex items-center gap-2">
            {isEstoque && item.status !== "VENDIDO" && (
              <button
                onClick={() => setEditing(!editing)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${editing ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#3A3A3C] text-[#F5A623]" : "bg-[#FFF3E0] text-[#E8740E]"}`}`}
              >
                {editing ? "Editando..." : "Editar"}
              </button>
            )}
            <button onClick={onClose} className={`text-lg ${textSecondary} hover:text-[#E8740E]`}>✕</button>
          </div>
        </div>

        {/* Produto Info */}
        <div className={`mx-4 mt-4 p-4 rounded-xl border ${bgSection}`}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Produto</p>
              <p className={`text-[15px] font-bold ${textPrimary}`}>{item.produto}</p>
            </div>
            <div className="text-right">
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Status</p>
              <p className={`text-sm font-bold ${statusColor(item.status)}`}>{item.status}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {item.serial_no && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Numero de Serie</p>
                {editing ? <input value={editFields.serial_no} onChange={(e) => setEditFields(f => ({ ...f, serial_no: e.target.value }))} className={inputCls} />
                  : <p className={`text-sm font-mono ${textPrimary}`}>{item.serial_no}</p>}
              </div>
            )}
            {(item.imei || editing) && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>IMEI</p>
                {editing ? <input value={editFields.imei} onChange={(e) => setEditFields(f => ({ ...f, imei: e.target.value }))} className={inputCls} />
                  : <p className={`text-sm font-mono ${textPrimary}`}>{item.imei || "—"}</p>}
              </div>
            )}
            {item.cor && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Cor</p>
                {editing ? <input value={editFields.cor} onChange={(e) => setEditFields(f => ({ ...f, cor: e.target.value }))} className={inputCls} />
                  : <p className={`text-sm ${textPrimary}`}>{item.cor}</p>}
              </div>
            )}
            {item.categoria && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Categoria</p>
                <p className={`text-sm ${textPrimary}`}>{item.categoria}</p>
              </div>
            )}
            {item.tipo_produto && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Condicao</p>
                <p className={`text-sm ${textPrimary}`}>{item.tipo_produto === "NOVO" ? "Lacrado" : item.tipo_produto === "SEMINOVO" ? "Usado" : item.tipo_produto}</p>
              </div>
            )}
            {item.bateria && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Bateria</p>
                <p className={`text-sm ${textPrimary}`}>{item.bateria}%</p>
              </div>
            )}
          </div>
        </div>

        {/* Informações Financeiras */}
        <div className={`mx-4 mt-3 p-4 rounded-xl border ${bgSection}`}>
          <p className={`text-xs font-bold ${textPrimary} mb-3`}>Informacoes Financeiras</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Preco de Compra</p>
              {editing ? <input type="number" value={editFields.custo_unitario} onChange={(e) => setEditFields(f => ({ ...f, custo_unitario: e.target.value }))} className={inputCls} />
                : <p className={`text-sm font-bold ${textPrimary}`}>{item.custo ? fmt(item.custo) : "—"}</p>}
            </div>
            {item.preco_vendido !== undefined && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Preco de Venda</p>
                <p className="text-sm font-bold text-[#E8740E]">{fmt(item.preco_vendido)}</p>
              </div>
            )}
            {item.lucro !== undefined && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Lucro</p>
                <p className={`text-sm font-bold ${item.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(item.lucro)}</p>
              </div>
            )}
            {item.margem !== undefined && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Margem</p>
                <p className={`text-sm font-bold ${item.margem >= 0 ? "text-green-600" : "text-red-500"}`}>{item.margem.toFixed(1)}%</p>
              </div>
            )}
          </div>
        </div>

        {/* Datas e Fornecedor */}
        <div className={`mx-4 mt-3 p-4 rounded-xl border ${bgSection}`}>
          <div className="grid grid-cols-2 gap-3">
            {item.data_compra && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Data da Compra</p>
                <p className={`text-sm ${textPrimary}`}>{item.data_compra}</p>
              </div>
            )}
            {item.data_entrada && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Data de Entrada</p>
                <p className={`text-sm ${textPrimary}`}>{item.data_entrada}</p>
              </div>
            )}
            {item.data && !item.data_entrada && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Data</p>
                <p className={`text-sm ${textPrimary}`}>{item.data}</p>
              </div>
            )}
            <div>
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Fornecedor</p>
              {editing ? <input value={editFields.fornecedor} onChange={(e) => setEditFields(f => ({ ...f, fornecedor: e.target.value }))} className={inputCls} />
                : <p className={`text-sm ${textPrimary}`}>{item.fornecedor || "Nao informado"}</p>}
            </div>
            {item.cliente && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Cliente</p>
                <p className={`text-sm ${textPrimary}`}>{item.cliente}</p>
              </div>
            )}
            {item.forma && (
              <div>
                <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Forma de Pagamento</p>
                <p className={`text-sm ${textPrimary}`}>{item.forma}{item.banco ? ` (${item.banco})` : ""}{item.parcelas > 1 ? ` ${item.parcelas}x` : ""}</p>
              </div>
            )}
          </div>
          {item.observacao && !editing && (
            <div className="mt-3">
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Observacao</p>
              <p className={`text-sm ${textPrimary}`}>{item.observacao}</p>
            </div>
          )}
          {editing && (
            <div className="mt-3">
              <p className={`text-[10px] uppercase tracking-wider ${textSecondary}`}>Observacao</p>
              <input value={editFields.observacao} onChange={(e) => setEditFields(f => ({ ...f, observacao: e.target.value }))} className={inputCls} />
            </div>
          )}
        </div>

        {/* Botão salvar edição */}
        {editing && (
          <div className="mx-4 mt-3 mb-4 flex gap-2">
            <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#D06A0D] transition-colors">
              Salvar Alteracoes
            </button>
            <button onClick={() => setEditing(false)} className={`px-4 py-3 rounded-xl border text-sm font-semibold ${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#D2D2D7] text-[#86868B]"}`}>
              Cancelar
            </button>
          </div>
        )}

        {!editing && <div className="h-4" />}
      </div>
    </div>
  );
}

export default function SuperSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { password, darkMode: dm } = useAdmin();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [detailItem, setDetailItem] = useState<SearchResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery("");
      setResults([]);
      setDetailItem(null);
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
      if (e.key === "Escape") {
        if (detailItem) setDetailItem(null);
        else if (open) onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, detailItem]);

  const handleSave = async (id: string, fields: Record<string, any>) => {
    try {
      const res = await fetch("/api/estoque", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ id, ...fields }),
      });
      if (res.ok) {
        // Atualizar resultado na lista
        setResults(prev => prev.map(r => r.id === id ? { ...r, ...fields, custo: fields.custo_unitario ?? r.custo } : r));
        if (detailItem?.id === id) setDetailItem(prev => prev ? { ...prev, ...fields, custo: fields.custo_unitario ?? prev.custo } : null);
      }
    } catch { /* ignore */ }
  };

  if (!open) return null;

  const bgModal = dm ? "bg-[#1C1C1E]" : "bg-white";
  const borderModal = dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const bgHover = dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F5F5F7]";

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      "EM ESTOQUE": "bg-green-100 text-green-700",
      "A CAMINHO": "bg-yellow-100 text-yellow-700",
      "PENDENTE": "bg-orange-100 text-orange-700",
      "FINALIZADO": "bg-blue-100 text-blue-700",
      "AGUARDANDO": "bg-purple-100 text-purple-700",
    };
    return colors[status] || "bg-gray-100 text-gray-700";
  };

  const tipoBadge = (tipo: string) => {
    const colors: Record<string, string> = {
      "VENDA": "bg-green-100 text-green-700",
      "UPGRADE": "bg-purple-100 text-purple-700",
      "ATACADO": "bg-blue-100 text-blue-700",
    };
    return colors[tipo] || "";
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className={`w-full max-w-2xl ${bgModal} border ${borderModal} rounded-2xl shadow-2xl overflow-hidden`} onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className={`flex items-center gap-3 px-5 py-4 border-b ${borderModal}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={textSecondary}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busque por produto, serie, IMEI, cliente, fornecedor..."
              className={`flex-1 bg-transparent text-[15px] ${textPrimary} focus:outline-none`}
            />
            <button onClick={onClose} className={`text-xs px-2 py-1 rounded border ${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#E8E8ED] text-[#86868B]"}`}>ESC</button>
          </div>

          {/* Toggle */}
          <div className={`px-5 py-2 border-b ${borderModal} flex items-center gap-2`}>
            <input type="checkbox" checked={includeHistory} onChange={(e) => setIncludeHistory(e.target.checked)} className="accent-[#E8740E]" id="hist" />
            <label htmlFor="hist" className={`text-xs ${textSecondary} cursor-pointer`}>Incluir historico completo</label>
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
              <div className={`divide-y ${dm ? "divide-[#2C2C2E]" : "divide-[#F0F0F5]"}`}>
                {results.map((r) => (
                  <div
                    key={`${r.tipo}-${r.id}`}
                    className={`px-5 py-3 cursor-pointer ${bgHover} transition-colors`}
                    onClick={() => setDetailItem(r)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{r.tipo === "estoque" ? "📦" : "💰"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-semibold ${textPrimary} truncate`}>{r.produto}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge(r.status)}`}>{r.status}</span>
                          {r.tipo_venda && <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tipoBadge(r.tipo_venda)}`}>{r.tipo_venda}</span>}
                        </div>
                        <div className={`text-xs ${textSecondary} mt-0.5 flex items-center gap-2 flex-wrap`}>
                          {r.cor && <span>{r.cor}</span>}
                          {r.fornecedor && <span>Forn: {r.fornecedor}</span>}
                          {r.cliente && <span>Cliente: {r.cliente}</span>}
                          {(r.data_entrada || r.data) && <span>{r.data_entrada || r.data}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {r.tipo === "venda" && r.preco_vendido ? (
                          <div>
                            <p className="text-sm font-bold text-[#E8740E]">{fmt(r.preco_vendido)}</p>
                            {r.lucro !== undefined && (
                              <p className={`text-[10px] font-semibold ${r.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>Lucro: {fmt(r.lucro)}</p>
                            )}
                          </div>
                        ) : r.custo ? (
                          <p className={`text-sm font-semibold ${textSecondary}`}>{fmt(r.custo)}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onSave={handleSave}
          dm={dm}
        />
      )}
    </>
  );
}
