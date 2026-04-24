// app/admin/margem-sku/page.tsx
// Dashboard de margem real por SKU — decisao rapida de "em que produto posso
// dar desconto" e "qual rende mais" sem precisar abrir planilha ou analytics.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { SkuInfoModal } from "@/components/admin/SkuInfoModal";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

interface SkuMargem {
  sku: string;
  nome_canonico: string | null;
  vendas: number;
  faturamento: number;
  custo_total: number;
  lucro_total: number;
  ticket_medio: number;
  custo_medio: number;
  margem_pct: number;
}

interface Resposta {
  range: string;
  totais: {
    skus_unicos: number;
    vendas: number;
    faturamento: number;
    custo_total: number;
    lucro_total: number;
    margem_pct: number;
  };
  top_absoluto: SkuMargem[];
  top_percentual: SkuMargem[];
}

type Aba = "absoluto" | "percentual";

export default function MargemSkuPage() {
  const { password } = useAdmin();
  const [data, setData] = useState<Resposta | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [aba, setAba] = useState<Aba>("absoluto");
  const [skuInfo, setSkuInfo] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!password) return;
    setLoading(true);
    fetch(`/api/admin/sku/margens?range=${range}`, {
      headers: { "x-admin-password": password },
    })
      .then((r) => r.json())
      .then((json) => setData(json.ok ? json : null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [password, range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const lista = aba === "absoluto" ? data?.top_absoluto || [] : data?.top_percentual || [];

  const corMargem = (pct: number) =>
    pct >= 20 ? "text-green-600"
    : pct >= 10 ? "text-[#E8740E]"
    : pct > 0 ? "text-yellow-600"
    : "text-red-600";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1D1D1F]">💰 Margem por SKU</h1>
          <p className="text-sm text-[#86868B] mt-0.5">
            Lucro real de cada produto — cruza preço vendido × custo de aquisição.
          </p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "90d", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
              }`}
            >
              {r === "7d" ? "7d" : r === "30d" ? "30d" : r === "90d" ? "90d" : "Tudo"}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="Faturamento" value={fmt(data.totais.faturamento)} accent="green" />
          <KPICard label="Custo total" value={fmt(data.totais.custo_total)} accent="gray" />
          <KPICard label="Lucro total" value={fmt(data.totais.lucro_total)} accent="orange" />
          <KPICard
            label="Margem geral"
            value={`${data.totais.margem_pct}%`}
            sub={`${data.totais.vendas} vendas em ${data.totais.skus_unicos} SKUs`}
            accent={data.totais.margem_pct >= 15 ? "green" : "orange"}
          />
        </div>
      )}

      {/* Abas */}
      <div className="flex gap-2">
        <button
          onClick={() => setAba("absoluto")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
            aba === "absoluto"
              ? "bg-[#E8740E] text-white"
              : "bg-white border border-[#D2D2D7] text-[#6E6E73]"
          }`}
        >
          💵 Top lucro em R$
        </button>
        <button
          onClick={() => setAba("percentual")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
            aba === "percentual"
              ? "bg-[#E8740E] text-white"
              : "bg-white border border-[#D2D2D7] text-[#6E6E73]"
          }`}
        >
          📊 Top margem %
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#86868B]">Calculando margens…</div>
        ) : lista.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#86868B]">Sem dados no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-[#6E6E73]">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-[#6E6E73]">Produto</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Vendas</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[#6E6E73]">Ticket médio</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[#6E6E73]">Custo médio</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[#E8740E]">Lucro total</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Margem %</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r, idx) => (
                  <tr key={r.sku} className="border-b border-[#F0F0F5] hover:bg-[#FAFAFB]">
                    <td className="px-3 py-2.5 font-mono text-[#86868B]">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[#1D1D1F]">{r.nome_canonico || r.sku}</div>
                      <div className="font-mono text-[10px] text-[#86868B] mt-0.5">{r.sku}</div>
                    </td>
                    <td className="px-3 py-2.5 text-center text-[#1D1D1F]">{r.vendas}</td>
                    <td className="px-3 py-2.5 text-right text-[#1D1D1F]">{fmt(r.ticket_medio)}</td>
                    <td className="px-3 py-2.5 text-right text-[#86868B]">{fmt(r.custo_medio)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#E8740E]">{fmt(r.lucro_total)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`font-bold ${corMargem(r.margem_pct)}`}>
                        {r.margem_pct >= 0 ? `${r.margem_pct}%` : `${r.margem_pct}%`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setSkuInfo(r.sku)}
                        className="text-xs px-2 py-1 rounded border border-[#E8740E]/30 text-[#E8740E] hover:bg-[#FFF5EB]"
                      >
                        📊
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {skuInfo && <SkuInfoModal sku={skuInfo} onClose={() => setSkuInfo(null)} />}
    </div>
  );
}

function KPICard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent: "green" | "orange" | "gray";
}) {
  const bgMap = {
    green: "bg-green-50 border-green-200",
    orange: "bg-[#FFF5EB] border-[#E8740E]/30",
    gray: "bg-[#F5F5F7] border-[#D2D2D7]",
  };
  const textMap = {
    green: "text-green-600",
    orange: "text-[#E8740E]",
    gray: "text-[#6E6E73]",
  };
  return (
    <div className={`p-4 rounded-2xl border ${bgMap[accent]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#86868B]">{label}</p>
      <p className={`text-xl font-bold mt-1 ${textMap[accent]}`}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5 text-[#86868B]">{sub}</p>}
    </div>
  );
}
