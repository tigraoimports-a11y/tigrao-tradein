// app/admin/giro-sku/page.tsx
// Dashboard de velocidade de giro — quantos dias cada SKU fica parado antes
// de vender. Destaca encalhados (candidatos a promocao) e ajuda a priorizar
// proxima compra pelos que giram rapido.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { SkuInfoModal } from "@/components/admin/SkuInfoModal";

interface SkuGiro {
  sku: string;
  nome_canonico: string | null;
  vendas_90d: number;
  giro_medio_dias: number | null;
  giro_min_dias: number | null;
  giro_max_dias: number | null;
  em_estoque_qnt: number;
  em_estoque_dias_max: number | null;
  alerta: "quente" | "normal" | "lento" | "encalhado" | null;
}

const ALERTA_LABEL: Record<string, { label: string; icon: string; cls: string }> = {
  quente: { label: "Quente", icon: "🔥", cls: "bg-red-100 text-red-700" },
  normal: { label: "Normal", icon: "✅", cls: "bg-green-100 text-green-700" },
  lento: { label: "Lento", icon: "🐌", cls: "bg-yellow-100 text-yellow-700" },
  encalhado: { label: "Encalhado", icon: "⚠️", cls: "bg-orange-100 text-orange-700" },
};

export default function GiroSkuPage() {
  const { password } = useAdmin();
  const [data, setData] = useState<SkuGiro[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todos" | "quente" | "encalhado" | "normal" | "lento">("todos");
  const [skuInfo, setSkuInfo] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    if (!password) return;
    setLoading(true);
    fetch("/api/admin/sku/giro", {
      headers: { "x-admin-password": password },
    })
      .then((r) => r.json())
      .then((json) => setData(json.ok ? json.resultados : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [password]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const filtrados = (data || []).filter((r) =>
    filtro === "todos" ? true : r.alerta === filtro,
  );

  const contarAlerta = (tipo: string) => (data || []).filter((r) => r.alerta === tipo).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1D1D1F]">⏱️ Velocidade de Giro</h1>
          <p className="text-sm text-[#86868B] mt-0.5">
            Dias médios que cada SKU fica parado antes de vender. Encalhados ≥ 60 dias → candidatos a promoção.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
        >
          Atualizar
        </button>
      </div>

      {/* KPIs por categoria de velocidade */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="🔥 Quentes" value={contarAlerta("quente")} sub="≤ 7 dias" accent="red" />
          <KPICard label="✅ Normais" value={contarAlerta("normal")} sub="8-30 dias" accent="green" />
          <KPICard label="🐌 Lentos" value={contarAlerta("lento")} sub="31-60 dias" accent="yellow" />
          <KPICard label="⚠️ Encalhados" value={contarAlerta("encalhado")} sub="> 60 dias" accent="orange" />
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {(["todos", "quente", "normal", "lento", "encalhado"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtro === f
                ? "bg-[#E8740E] text-white"
                : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E]"
            }`}
          >
            {f === "todos" ? "Todos" : ALERTA_LABEL[f].label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#86868B]">Calculando…</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#86868B]">Sem SKUs nesse filtro.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-[#6E6E73]">Produto</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Alerta</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Vendas 90d</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Giro médio</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Em estoque</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#E8740E]">Parado há</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const al = r.alerta ? ALERTA_LABEL[r.alerta] : null;
                  return (
                    <tr key={r.sku} className="border-b border-[#F0F0F5] hover:bg-[#FAFAFB]">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-[#1D1D1F]">{r.nome_canonico || r.sku}</div>
                        <div className="font-mono text-[10px] text-[#86868B] mt-0.5">{r.sku}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {al && (
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${al.cls}`}>
                            {al.icon} {al.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-[#1D1D1F]">{r.vendas_90d}</td>
                      <td className="px-3 py-2.5 text-center">
                        {r.giro_medio_dias !== null ? (
                          <div className="text-[#1D1D1F]">
                            {r.giro_medio_dias}d
                            {r.giro_min_dias !== null && r.giro_max_dias !== null && r.giro_min_dias !== r.giro_max_dias && (
                              <span className="text-[10px] text-[#86868B] ml-1">
                                ({r.giro_min_dias}-{r.giro_max_dias})
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#86868B]">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.em_estoque_qnt > 0 ? (
                          <span className="font-semibold text-green-600">{r.em_estoque_qnt}</span>
                        ) : (
                          <span className="text-[#86868B]">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {r.em_estoque_dias_max !== null ? (
                          <span
                            className={
                              r.em_estoque_dias_max > 60
                                ? "text-red-600 font-semibold"
                                : r.em_estoque_dias_max > 30
                                  ? "text-orange-600 font-medium"
                                  : "text-[#86868B]"
                            }
                          >
                            {r.em_estoque_dias_max}d
                          </span>
                        ) : (
                          <span className="text-[#86868B]">—</span>
                        )}
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
                  );
                })}
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
  value: number;
  sub?: string;
  accent: "red" | "green" | "yellow" | "orange";
}) {
  const bgMap = {
    red: "bg-red-50 border-red-200",
    green: "bg-green-50 border-green-200",
    yellow: "bg-yellow-50 border-yellow-200",
    orange: "bg-[#FFF5EB] border-[#E8740E]/30",
  };
  const textMap = {
    red: "text-red-600",
    green: "text-green-600",
    yellow: "text-yellow-600",
    orange: "text-[#E8740E]",
  };
  return (
    <div className={`p-4 rounded-2xl border ${bgMap[accent]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#86868B]">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${textMap[accent]}`}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5 text-[#86868B]">{sub}</p>}
    </div>
  );
}
