// components/admin/TopSkusSection.tsx
// Dashboard de Top SKUs — exibe os produtos canonicos mais vendidos, mais
// simulados (interesse de compra) e mais pedidos (encomendas em aberto).
//
// Fonte: /api/admin/sku/top-vendidos
// Compartilha o range selecionado pela pagina pai de analytics (7d/30d/all).

"use client";

import { useEffect, useState } from "react";

interface SkuAggVenda {
  sku: string;
  total: number;
  valor_total: number;
  ticket_medio: number;
  modelo: string;
  seminovo: boolean;
  em_estoque: number;
}

interface SkuAggGenerico {
  sku: string;
  total: number;
  modelo: string;
  seminovo: boolean;
}

interface SkuAggEncomenda extends SkuAggGenerico {
  pendentes: number;
}

interface TopSkusData {
  range: string;
  vendas: SkuAggVenda[];
  simulacoes: SkuAggGenerico[];
  encomendas: SkuAggEncomenda[];
  meta: {
    vendas_unicas: number;
    simulacoes_unicas: number;
    encomendas_unicas: number;
  };
}

type Tab = "vendas" | "simulacoes" | "encomendas";

// Range aceito: herdado da pagina pai. "all" nao manda filtro; outros traduzem
// pra janela em dias (vide /api/admin/sku/top-vendidos).
export function TopSkusSection({
  password,
  range,
}: {
  password: string;
  range: "7d" | "30d" | "all";
}) {
  const [data, setData] = useState<TopSkusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("vendas");

  useEffect(() => {
    if (!password) return;
    // Nao reseta loading ao trocar range — dados antigos ficam visiveis
    // durante a transicao (melhor UX + agrada o lint set-state-in-effect).
    let cancelled = false;
    const rangeParam = range === "all" ? "all" : range;
    fetch(`/api/admin/sku/top-vendidos?range=${rangeParam}`, {
      headers: { "x-admin-password": password },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [password, range]);

  if (loading) {
    return (
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-[#F5F5F7] rounded w-1/3" />
          <div className="h-4 bg-[#F5F5F7] rounded w-full" />
          <div className="h-4 bg-[#F5F5F7] rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm text-center text-sm text-[#86868B]">
        Top SKUs indisponível (backend retornou erro).
      </div>
    );
  }

  const currentList: Array<SkuAggVenda | SkuAggEncomenda | SkuAggGenerico> =
    tab === "vendas" ? data.vendas : tab === "simulacoes" ? data.simulacoes : data.encomendas;

  const isVendas = tab === "vendas";
  const isEncomendas = tab === "encomendas";

  const maxTotal = Math.max(...currentList.map((r) => r.total), 1);

  return (
    <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-[#1D1D1F]">Top SKUs</h2>
          <p className="text-xs text-[#86868B] mt-0.5">
            Produtos canônicos com mais volume — {tab === "vendas" ? `${data.meta.vendas_unicas} SKUs vendidos` : tab === "simulacoes" ? `${data.meta.simulacoes_unicas} SKUs simulados` : `${data.meta.encomendas_unicas} SKUs encomendados`}
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["vendas", "simulacoes", "encomendas"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E]"
              }`}
            >
              {t === "vendas" ? "Vendas" : t === "simulacoes" ? "Simulações" : "Encomendas"}
            </button>
          ))}
        </div>
      </div>

      {currentList.length === 0 ? (
        <p className="text-sm text-[#86868B] text-center py-8">
          Sem dados no período.
        </p>
      ) : (
        <div className="space-y-2">
          {currentList.map((r, idx) => {
            const pct = (r.total / maxTotal) * 100;
            const venda = r as SkuAggVenda;
            const enc = r as SkuAggEncomenda;
            return (
              <div key={r.sku} className="flex items-center gap-3">
                <span className="text-[11px] text-[#86868B] w-6 shrink-0 text-right font-mono">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1D1D1F] truncate">
                      {r.modelo}
                    </span>
                    {r.seminovo && (
                      <span className="text-[10px] bg-[#FFF5EB] text-[#E8740E] px-1.5 py-0.5 rounded font-medium shrink-0">
                        seminovo
                      </span>
                    )}
                    {isVendas && venda.em_estoque === 0 && (
                      <span className="text-[10px] bg-[#FFF5F5] text-[#E74C3C] px-1.5 py-0.5 rounded font-medium shrink-0">
                        esgotado
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 bg-[#F5F5F7] rounded overflow-hidden">
                      <div
                        className="h-full bg-[#E8740E]/70 rounded transition-all duration-500"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-[#86868B] truncate max-w-[220px]" title={r.sku}>
                      {r.sku}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-[#1D1D1F]">
                    {r.total}
                  </p>
                  {isVendas && (
                    <p className="text-[10px] text-[#86868B]">
                      R$ {venda.valor_total.toLocaleString("pt-BR")}
                    </p>
                  )}
                  {isEncomendas && enc.pendentes > 0 && (
                    <p className="text-[10px] text-[#E8740E] font-medium">
                      {enc.pendentes} pendente{enc.pendentes > 1 ? "s" : ""}
                    </p>
                  )}
                  {isVendas && venda.em_estoque > 0 && (
                    <p className="text-[10px] text-[#2ECC71]">
                      {venda.em_estoque} em estoque
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
