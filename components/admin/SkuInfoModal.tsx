// components/admin/SkuInfoModal.tsx
// Modal de visao 360° de um SKU — mostra em 1 tela tudo que voce precisa
// saber pra decidir algo sobre aquele produto agora (precificar, dar desconto,
// comprar mais, aceitar encomenda, etc).
//
// Aberto via:
//   - Botao 📊 nos resultados do SuperSearch (Cmd+K)
//   - Links diretos de outras telas (estoque, vendas, mostruario)
//
// Dados vem de /api/admin/sku/info?sku=X (endpoint agregador).

"use client";

import React, { useEffect, useState } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

interface SkuSimilar {
  sku: string;
  nome_canonico: string | null;
  em_estoque: number;
  custo_medio: number;
  similaridade: number;
  diferencas: string[];
}

interface Info {
  sku: string;
  nome_canonico: string | null;
  estoque: {
    total_unidades: number;
    custo_medio: number;
    custo_minimo: number;
    custo_maximo: number;
    items: Array<{
      id: string;
      produto: string;
      cor: string | null;
      serial_no: string | null;
      imei: string | null;
      custo_compra: number;
      fornecedor: string | null;
      data_entrada: string | null;
    }>;
  };
  vendas: {
    total_30d: number;
    total_90d: number;
    total_geral: number;
    ticket_medio_30d: number;
    faturamento_30d: number;
    margem_media: number;
    lucro_total_30d: number;
    ultima_venda_data: string | null;
    ultimas: Array<{
      id: string;
      data: string;
      cliente: string;
      preco_vendido: number;
      lucro: number | null;
    }>;
  };
  simulacoes_30d: number;
  avisos_ativos: number;
  encomendas_pendentes: number;
  mostruario: {
    visivel: boolean;
    preco: number | null;
    preco_parcelado: number | null;
    variacao_id: string | null;
  };
  similares?: SkuSimilar[];
}

export function SkuInfoModal({ sku: initialSku, onClose }: { sku: string; onClose: () => void }) {
  const { password, darkMode: dm } = useAdmin();
  // currentSku permite "trocar" o SKU foco sem fechar o modal — ao clicar
  // num similar, navegamos dentro da mesma view (breadcrumb historico).
  const [currentSku, setCurrentSku] = useState(initialSku);
  const [history, setHistory] = useState<string[]>([]);
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sku = currentSku;
  // loading = "o info atual nao corresponde ao SKU pedido" — derivado, sem
  // setState (agrada o lint react-hooks/set-state-in-effect e dá UX ok:
  // enquanto carrega o novo SKU, dados do anterior ficam visiveis ~1s).
  const loading = !info || (info.sku !== sku.toUpperCase() && !error);

  // Quando initialSku muda (consumidor abriu modal com outro SKU), reinicia.
  // Padrao legitimo de sincronizacao props→state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentSku(initialSku);
    setHistory([]);
    setError(null);
  }, [initialSku]);

  useEffect(() => {
    if (!sku || !password) return;
    let cancelled = false;
    fetch(`/api/admin/sku/info?sku=${encodeURIComponent(sku)}`, {
      headers: { "x-admin-password": password },
    })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok) {
          setInfo(json.data);
          setError(null);
        } else {
          setError(json.error || "Erro ao buscar info");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [sku, password]);

  const navigateToSku = (newSku: string) => {
    setHistory((prev) => [...prev, currentSku]);
    setCurrentSku(newSku);
  };

  const goBack = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setCurrentSku(last);
  };

  // ESC pra fechar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const bgCard = dm ? "bg-[#1C1C1E]" : "bg-white";
  const bgSection = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const divider = dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl ${bgCard} rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${divider}`}>
          <div className="flex items-center gap-2 min-w-0">
            {history.length > 0 && (
              <button
                onClick={goBack}
                title="Voltar ao SKU anterior"
                className={`text-sm px-2 py-1 rounded ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F5F5F7]"} ${textSecondary}`}
              >
                ←
              </button>
            )}
            <span className="text-2xl">📊</span>
            <div className="min-w-0">
              <h3 className={`text-sm font-bold ${textPrimary} truncate`}>
                {info?.nome_canonico || sku}
              </h3>
              <p className={`text-[11px] font-mono ${textSecondary} truncate`}>{sku}</p>
            </div>
          </div>
          <button onClick={onClose} className={`text-lg ${textSecondary} hover:text-[#E8740E] ml-2`}>
            ✕
          </button>
        </div>

        {loading && (
          <div className={`py-12 text-center text-sm ${textSecondary}`}>Carregando…</div>
        )}

        {error && !loading && (
          <div className="py-12 text-center text-sm text-red-500">{error}</div>
        )}

        {info && !loading && (
          <>
            {/* Alerta visual de esgotado / demanda / etc */}
            {info.estoque.total_unidades === 0 && (info.simulacoes_30d > 0 || info.avisos_ativos > 0) && (
              <div className={`mx-4 mt-4 p-3 rounded-xl border bg-red-50 border-red-200 ${dm ? "bg-red-950/30 border-red-900" : ""}`}>
                <p className="text-sm font-bold text-red-700">⚠️ ESGOTADO com demanda</p>
                <p className={`text-xs ${dm ? "text-red-300" : "text-red-600"} mt-0.5`}>
                  {info.simulacoes_30d > 0 && `${info.simulacoes_30d} simulações (30d)`}
                  {info.simulacoes_30d > 0 && info.avisos_ativos > 0 && " · "}
                  {info.avisos_ativos > 0 && `${info.avisos_ativos} avisos ativos`}
                  {" — comprar urgente"}
                </p>
              </div>
            )}

            {/* Grid de stats principais */}
            <div className="mx-4 mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard
                label="Em estoque"
                value={info.estoque.total_unidades}
                sub={info.estoque.total_unidades > 0 ? `${fmt(info.estoque.custo_medio)} médio` : undefined}
                accent={info.estoque.total_unidades === 0 ? "red" : "green"}
                dm={dm}
              />
              <StatCard
                label="Vendas 30d"
                value={info.vendas.total_30d}
                sub={info.vendas.total_30d > 0 ? fmt(info.vendas.faturamento_30d) : undefined}
                accent="orange"
                dm={dm}
              />
              <StatCard
                label="Margem média"
                value={`${info.vendas.margem_media}%`}
                sub={info.vendas.lucro_total_30d > 0 ? `+${fmt(info.vendas.lucro_total_30d)}` : undefined}
                accent={info.vendas.margem_media >= 15 ? "green" : info.vendas.margem_media >= 8 ? "orange" : "red"}
                dm={dm}
              />
              <StatCard
                label="Demanda ativa"
                value={info.simulacoes_30d + info.avisos_ativos}
                sub={`${info.simulacoes_30d} sim · ${info.avisos_ativos} avisos`}
                accent="purple"
                dm={dm}
              />
            </div>

            {/* Detalhes estoque */}
            <div className={`mx-4 mt-3 p-4 rounded-xl border ${bgSection}`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-xs font-bold ${textPrimary}`}>📦 Estoque atual</p>
                {info.estoque.total_unidades > 0 && (
                  <span className={`text-[11px] ${textSecondary}`}>
                    Custo: {fmt(info.estoque.custo_minimo)} – {fmt(info.estoque.custo_maximo)}
                  </span>
                )}
              </div>
              {info.estoque.items.length === 0 ? (
                <p className={`text-sm ${textSecondary}`}>Sem unidades disponíveis.</p>
              ) : (
                <div className="space-y-1">
                  {info.estoque.items.map((item) => (
                    <div key={item.id} className={`flex items-center gap-3 text-xs`}>
                      <span className="text-green-500">●</span>
                      <span className={`flex-1 truncate ${textPrimary}`}>
                        {item.produto}
                        {item.cor && <span className={textSecondary}> · {item.cor}</span>}
                      </span>
                      {(item.serial_no || item.imei) && (
                        <span className={`font-mono text-[10px] ${textSecondary}`}>
                          {item.serial_no || item.imei}
                        </span>
                      )}
                      <span className={`font-semibold ${textPrimary}`}>{fmt(item.custo_compra)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vendas recentes */}
            <div className={`mx-4 mt-3 p-4 rounded-xl border ${bgSection}`}>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-xs font-bold ${textPrimary}`}>💰 Últimas vendas</p>
                <span className={`text-[11px] ${textSecondary}`}>
                  Total: {info.vendas.total_geral} · 90d: {info.vendas.total_90d} · 30d: {info.vendas.total_30d}
                </span>
              </div>
              {info.vendas.ultimas.length === 0 ? (
                <p className={`text-sm ${textSecondary}`}>
                  Nenhuma venda nos últimos 30 dias
                  {info.vendas.total_geral > 0 && ` (histórico: ${info.vendas.total_geral})`}.
                </p>
              ) : (
                <div className="space-y-1">
                  {info.vendas.ultimas.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 text-xs">
                      <span className={`w-20 shrink-0 ${textSecondary}`}>{fmtDate(v.data)}</span>
                      <span className={`flex-1 truncate ${textPrimary}`}>{v.cliente}</span>
                      <span className="font-semibold text-[#E8740E]">{fmt(v.preco_vendido)}</span>
                      {v.lucro !== null && (
                        <span className={`w-16 text-right font-semibold ${v.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {v.lucro >= 0 ? "+" : ""}
                          {fmt(v.lucro)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Mostruario + Encomendas */}
            <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
              <div className={`p-4 rounded-xl border ${bgSection}`}>
                <p className={`text-xs font-bold ${textPrimary} mb-1`}>🛒 Mostruário</p>
                {info.mostruario.variacao_id ? (
                  <>
                    <p className={`text-[11px] ${textSecondary}`}>
                      {info.mostruario.visivel ? "✅ Visível ao público" : "🔒 Oculto"}
                    </p>
                    {info.mostruario.preco && (
                      <p className={`text-sm font-bold ${textPrimary} mt-1`}>{fmt(info.mostruario.preco)}</p>
                    )}
                  </>
                ) : (
                  <p className={`text-[11px] ${textSecondary}`}>SKU não cadastrado no mostruário</p>
                )}
              </div>
              <div className={`p-4 rounded-xl border ${bgSection}`}>
                <p className={`text-xs font-bold ${textPrimary} mb-1`}>📋 Encomendas pendentes</p>
                <p className={`text-2xl font-bold ${info.encomendas_pendentes > 0 ? "text-[#E8740E]" : textPrimary}`}>
                  {info.encomendas_pendentes}
                </p>
                <p className={`text-[11px] ${textSecondary}`}>
                  {info.encomendas_pendentes > 0 ? "prometidas a clientes" : "nenhuma em aberto"}
                </p>
              </div>
            </div>

            {/* Similares em estoque (substituicao quando esgotado) */}
            {info.similares && info.similares.length > 0 && (
              <div className={`mx-4 mt-3 p-4 rounded-xl border ${bgSection}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-xs font-bold ${textPrimary}`}>
                    🔄 {info.estoque.total_unidades === 0 ? "Sugestão de substituição" : "Variantes em estoque"}
                  </p>
                  <span className={`text-[11px] ${textSecondary}`}>
                    {info.estoque.total_unidades === 0 && "cliente pode levar uma dessas"}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {info.similares.map((s) => (
                    <button
                      key={s.sku}
                      onClick={() => navigateToSku(s.sku)}
                      className={`w-full text-left flex items-center gap-3 p-2 rounded-lg transition-colors ${
                        dm ? "hover:bg-[#3A3A3C]" : "hover:bg-white"
                      }`}
                    >
                      <span className="text-lg">{s.similaridade >= 90 ? "🟢" : s.similaridade >= 70 ? "🟡" : "🟠"}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${textPrimary} truncate`}>
                          {s.nome_canonico || s.sku}
                        </p>
                        <p className={`text-[11px] ${textSecondary}`}>
                          {s.diferencas.length > 0 ? `Diferença: ${s.diferencas.join(", ")}` : "Mesmo modelo"}
                          {" · "}
                          {s.custo_medio > 0 && `Custo ${fmt(s.custo_medio)}`}
                        </p>
                      </div>
                      <span className={`text-sm font-bold text-green-600 shrink-0`}>{s.em_estoque}un</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mx-4 mt-3 mb-4 flex flex-wrap gap-2">
              <a
                href={`/admin/estoque?sku=${encodeURIComponent(sku)}`}
                className="flex-1 min-w-[120px] text-center py-2 rounded-xl bg-[#E8740E] text-white text-xs font-semibold hover:bg-[#D06A0D] transition-colors"
              >
                Ver estoque
              </a>
              <a
                href={`/admin/vendas?sku=${encodeURIComponent(sku)}`}
                className={`flex-1 min-w-[120px] text-center py-2 rounded-xl border text-xs font-semibold transition-colors ${
                  dm
                    ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] hover:bg-[#3A3A3C]"
                    : "bg-white border-[#D2D2D7] text-[#1D1D1F] hover:bg-[#F5F5F7]"
                }`}
              >
                Ver vendas
              </a>
              {info.mostruario.variacao_id && (
                <a
                  href={`/admin/mostruario?variacao=${info.mostruario.variacao_id}`}
                  className={`flex-1 min-w-[120px] text-center py-2 rounded-xl border text-xs font-semibold transition-colors ${
                    dm
                      ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] hover:bg-[#3A3A3C]"
                      : "bg-white border-[#D2D2D7] text-[#1D1D1F] hover:bg-[#F5F5F7]"
                  }`}
                >
                  Mostruário
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
  dm,
}: {
  label: string;
  value: number | string;
  sub?: string;
  accent: "green" | "orange" | "red" | "purple";
  dm: boolean;
}) {
  const bgMap = {
    green: dm ? "bg-green-950/30 border-green-900" : "bg-green-50 border-green-200",
    orange: dm ? "bg-orange-950/30 border-orange-900" : "bg-[#FFF5EB] border-[#E8740E]/30",
    red: dm ? "bg-red-950/30 border-red-900" : "bg-red-50 border-red-200",
    purple: dm ? "bg-purple-950/30 border-purple-900" : "bg-purple-50 border-purple-200",
  };
  const textMap = {
    green: "text-green-600",
    orange: "text-[#E8740E]",
    red: "text-red-600",
    purple: "text-purple-600",
  };
  return (
    <div className={`p-3 rounded-xl border ${bgMap[accent]}`}>
      <p className={`text-[10px] font-medium uppercase tracking-wide ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
        {label}
      </p>
      <p className={`text-xl font-bold mt-0.5 ${textMap[accent]}`}>{value}</p>
      {sub && <p className={`text-[10px] mt-0.5 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{sub}</p>}
    </div>
  );
}
