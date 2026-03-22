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

const ACTION_CONFIG: Record<string, { icon: string; color: string }> = {
  "Registrou venda": { icon: "💰", color: "#2ECC71" },
  "Excluiu venda": { icon: "🗑️", color: "#E74C3C" },
  "Registrou gasto": { icon: "📤", color: "#E8740E" },
  "Adicionou ao estoque": { icon: "📦", color: "#3498DB" },
  "Removeu do estoque": { icon: "📦", color: "#E74C3C" },
  "Alterou preco": { icon: "🏷️", color: "#9B59B6" },
  "Alterou usuario": { icon: "👤", color: "#6E6E73" },
  "Criou usuario": { icon: "👤", color: "#2ECC71" },
};

function getConfig(acao: string) {
  for (const [key, cfg] of Object.entries(ACTION_CONFIG)) {
    if (acao.includes(key)) return cfg;
  }
  return { icon: "📋", color: "#86868B" };
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return `${Math.floor(diffH / 24)}d`;
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

type Periodo = "hoje" | "ontem" | "7dias" | "30dias" | "tudo";

export default function LogPage() {
  const { password } = useAdmin();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [periodo, setPeriodo] = useState<Periodo>("hoje");

  const getDateRange = useCallback((): { from: string; to: string } => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    switch (periodo) {
      case "hoje": return { from: fmt(today), to: fmt(today) };
      case "ontem": { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: fmt(y), to: fmt(y) }; }
      case "7dias": { const d = new Date(today); d.setDate(d.getDate() - 7); return { from: fmt(d), to: fmt(today) }; }
      case "30dias": { const d = new Date(today); d.setDate(d.getDate() - 30); return { from: fmt(d), to: fmt(today) }; }
      default: return { from: "", to: "" };
    }
  }, [periodo]);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      const range = getDateRange();
      if (range.from) params.set("from", range.from);
      if (range.to) {
        const nextDay = new Date(range.to);
        nextDay.setDate(nextDay.getDate() + 1);
        params.set("to", nextDay.toISOString().split("T")[0]);
      }
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
  }, [password, page, getDateRange]);

  useEffect(() => { fetchLog(); }, [fetchLog]);
  useEffect(() => { setPage(1); }, [periodo]);

  // Agrupar por hora
  const grouped = entries.reduce<Record<string, LogEntry[]>>((acc, e) => {
    const hour = formatTime(e.created_at).split(":")[0] + ":00";
    if (!acc[hour]) acc[hour] = [];
    acc[hour].push(e);
    return acc;
  }, {});

  const periodoLabel: Record<Periodo, string> = {
    hoje: `Hoje — ${new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}`,
    ontem: "Ontem",
    "7dias": "Últimos 7 dias",
    "30dias": "Últimos 30 dias",
    tudo: "Todo o histórico",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Log de Atividades</h1>
          <p className="text-xs text-[#86868B] mt-0.5">{periodoLabel[periodo]}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#86868B]">{total} registros</span>
          <button onClick={fetchLog} className="px-3 py-1.5 rounded-xl text-xs bg-[#E8740E] text-white hover:bg-[#D4680D] transition-colors">
            Atualizar
          </button>
        </div>
      </div>

      {/* Periodo pills */}
      <div className="flex gap-2 flex-wrap">
        {(["hoje", "ontem", "7dias", "30dias", "tudo"] as Periodo[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriodo(p)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
              periodo === p
                ? "bg-[#E8740E] text-white"
                : "bg-white border border-[#E8E8ED] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E]"
            }`}
          >
            {{ hoje: "Hoje", ontem: "Ontem", "7dias": "7 dias", "30dias": "30 dias", tudo: "Histórico" }[p]}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="text-center py-12 text-[#86868B] text-sm">Carregando...</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">📋</p>
          <p className="text-sm text-[#86868B]">Nenhuma atividade {periodo === "hoje" ? "hoje" : "neste período"}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([hour, items]) => (
            <div key={hour}>
              {/* Hour label */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-[#86868B] bg-[#F5F5F7] px-2 py-0.5 rounded-lg">{hour}</span>
                <div className="flex-1 h-px bg-[#E8E8ED]" />
              </div>

              {/* Entries */}
              <div className="bg-white rounded-2xl border border-[#E8E8ED] divide-y divide-[#F0F0F5]">
                {items.map((entry) => {
                  const cfg = getConfig(entry.acao);
                  return (
                    <div key={entry.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[#FAFAFA] transition-colors">
                      {/* Icon with color bar */}
                      <div className="relative">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                          style={{ backgroundColor: cfg.color + "15" }}
                        >
                          {cfg.icon}
                        </div>
                        <div
                          className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white"
                          style={{ backgroundColor: cfg.color }}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{entry.usuario}</span>
                          <span className="text-sm text-[#6E6E73]">{entry.acao.toLowerCase()}</span>
                        </div>
                        {entry.detalhes && (
                          <p className="text-xs text-[#86868B] mt-0.5 truncate">{entry.detalhes}</p>
                        )}
                      </div>

                      {/* Time */}
                      <div className="text-right shrink-0">
                        <span className="text-xs font-medium" style={{ color: cfg.color }}>{timeAgo(entry.created_at)}</span>
                        <p className="text-[10px] text-[#AEAEB2]">{formatTime(entry.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
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
            ← Anterior
          </button>
          <span className="text-xs text-[#86868B]">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-xl text-xs border border-[#E8E8ED] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-30"
          >
            Próximo →
          </button>
        </div>
      )}
    </div>
  );
}
