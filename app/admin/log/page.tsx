"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface LogEntry {
  id: string;
  usuario: string;
  acao: string;
  detalhes: string | null;
  entidade: string | null;
  entidade_id: string | null;
  created_at: string;
}

const ACTION_ICONS: Record<string, string> = {
  "Registrou venda": "💰",
  "Excluiu venda": "🗑️",
  "Registrou gasto": "📤",
  "Adicionou ao estoque": "📦",
  "Removeu do estoque": "🗑️",
  "Alterou preco": "🏷️",
  "Alterou usuario": "👤",
  "Criou usuario": "👤",
};

function getIcon(acao: string): string {
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (acao.includes(key)) return icon;
  }
  return "📋";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string): string {
  const now = new Date();
  const d = new Date(iso);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

export default function LogPage() {
  const { password } = useAdmin();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");
  const [filtroFrom, setFiltroFrom] = useState("");
  const [filtroTo, setFiltroTo] = useState("");

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filtroUsuario) params.set("usuario", filtroUsuario);
      if (filtroAcao) params.set("acao", filtroAcao);
      if (filtroFrom) params.set("from", filtroFrom);
      if (filtroTo) params.set("to", filtroTo);

      const res = await fetch(`/api/admin/log?${params}`, {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setEntries(json.data ?? []);
        setTotalPages(json.totalPages ?? 1);
        setTotal(json.total ?? 0);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, page, filtroUsuario, filtroAcao, filtroFrom, filtroTo]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filtroUsuario, filtroAcao, filtroFrom, filtroTo]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1D1D1F]">Log de Atividades</h1>
        <span className="text-xs text-[#86868B]">{total} registros</span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-[#E8E8ED] p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] text-[#86868B] uppercase tracking-wider font-medium">Usuario</label>
          <input
            type="text"
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            placeholder="Todos"
            className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8ED] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] text-[#86868B] uppercase tracking-wider font-medium">Acao</label>
          <input
            type="text"
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            placeholder="Todas"
            className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8ED] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]"
          />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-[10px] text-[#86868B] uppercase tracking-wider font-medium">De</label>
          <input
            type="date"
            value={filtroFrom}
            onChange={(e) => setFiltroFrom(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8ED] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]"
          />
        </div>
        <div className="flex-1 min-w-[120px]">
          <label className="text-[10px] text-[#86868B] uppercase tracking-wider font-medium">Ate</label>
          <input
            type="date"
            value={filtroTo}
            onChange={(e) => setFiltroTo(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#E8E8ED] text-sm text-[#1D1D1F] focus:outline-none focus:border-[#E8740E]"
          />
        </div>
        {(filtroUsuario || filtroAcao || filtroFrom || filtroTo) && (
          <button
            onClick={() => { setFiltroUsuario(""); setFiltroAcao(""); setFiltroFrom(""); setFiltroTo(""); }}
            className="self-end px-3 py-2 rounded-xl text-xs text-[#E74C3C] border border-[#E74C3C]/20 hover:bg-[#FEF2F2] transition-colors"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-[#86868B] text-sm">Carregando...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-[#86868B] text-sm">Nenhuma atividade encontrada</div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E8E8ED] divide-y divide-[#F0F0F5]">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[#FAFAFA] transition-colors">
              {/* Icon */}
              <div className="w-9 h-9 rounded-full bg-[#F5F5F7] flex items-center justify-center text-base shrink-0 mt-0.5">
                {getIcon(entry.acao)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[#1D1D1F]">{entry.usuario}</span>
                  <span className="text-sm text-[#6E6E73]">{entry.acao}</span>
                </div>
                {entry.detalhes && (
                  <p className="text-xs text-[#86868B] mt-0.5 truncate">{entry.detalhes}</p>
                )}
                {entry.entidade && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded-lg bg-[#F0F0F5] text-[10px] text-[#86868B] font-medium uppercase">
                    {entry.entidade}
                  </span>
                )}
              </div>

              {/* Time */}
              <div className="text-right shrink-0">
                <span className="text-xs text-[#86868B] font-medium">{timeAgo(entry.created_at)}</span>
                <p className="text-[10px] text-[#AEAEB2]">{formatDate(entry.created_at)} {formatTime(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 py-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-xl text-xs border border-[#E8E8ED] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-30"
          >
            Anterior
          </button>
          <span className="text-xs text-[#86868B]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-xl text-xs border border-[#E8E8ED] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-30"
          >
            Proximo
          </button>
        </div>
      )}
    </div>
  );
}
