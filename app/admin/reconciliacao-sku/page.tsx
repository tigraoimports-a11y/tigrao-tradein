// app/admin/reconciliacao-sku/page.tsx
// Auditoria operacional: detecta inconsistencias entre estoque e vendas que
// indicam sumico, erro de registro ou divergencia de SKU. Rodar toda semana
// pra pegar problemas cedo em vez de deixar crescer ate a auditoria anual.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { SkuInfoModal } from "@/components/admin/SkuInfoModal";

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `R$ ${Math.round(Number(v)).toLocaleString("pt-BR")}`;

type Severidade = "alta" | "media" | "baixa";
type TipoInc = "SKU_DIVERGENTE_PERSISTIDO" | "ESGOTADO_SEM_VENDA" | "VENDA_SEM_ESTOQUE";

interface Inconsistencia {
  tipo: TipoInc;
  severidade: Severidade;
  descricao: string;
  produto: string;
  detalhes: Record<string, string | number | null>;
  ids: { venda_id?: string; estoque_id?: string };
}

interface Resumo {
  total: number;
  por_tipo: Record<TipoInc, number>;
  por_severidade: Record<Severidade, number>;
  periodo: { from: string; until: string };
}

const TIPO_LABEL: Record<TipoInc, { titulo: string; icone: string; explicacao: string }> = {
  SKU_DIVERGENTE_PERSISTIDO: {
    titulo: "SKU divergente",
    icone: "⚠️",
    explicacao:
      "Venda vinculada a item com SKU diferente — cliente pode ter recebido produto errado. Verifique e corrija.",
  },
  ESGOTADO_SEM_VENDA: {
    titulo: "Sumiço",
    icone: "🔍",
    explicacao:
      "Produto marcado como vendido/esgotado no estoque mas sem venda vinculada. Pode ser venda fora do sistema, erro de registro ou roubo.",
  },
  VENDA_SEM_ESTOQUE: {
    titulo: "Venda sem baixa",
    icone: "📦",
    explicacao:
      "Venda registrada sem vincular item do estoque — o estoque ainda pensa que tem. Dupla-contagem potencial.",
  },
};

export default function ReconciliacaoSkuPage() {
  const { password } = useAdmin();
  const [inconsistencias, setInconsistencias] = useState<Inconsistencia[] | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<TipoInc | "todos">("todos");
  const [skuInfo, setSkuInfo] = useState<string | null>(null);
  const [periodoDias, setPeriodoDias] = useState(30);

  const fetchData = useCallback(() => {
    if (!password) return;
    setLoading(true);
    const fromDate = new Date(Date.now() - periodoDias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fetch(`/api/admin/sku/reconciliacao?from=${fromDate}`, {
      headers: { "x-admin-password": password },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setInconsistencias(json.inconsistencias);
          setResumo(json.resumo);
        } else {
          setInconsistencias([]);
        }
      })
      .catch(() => setInconsistencias([]))
      .finally(() => setLoading(false));
  }, [password, periodoDias]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const filtradas = (inconsistencias || []).filter((i) =>
    tipoFiltro === "todos" ? true : i.tipo === tipoFiltro,
  );

  const severidadeColor = (s: Severidade): string =>
    s === "alta" ? "bg-red-100 text-red-700 border-red-200"
    : s === "media" ? "bg-orange-100 text-orange-700 border-orange-200"
    : "bg-yellow-100 text-yellow-700 border-yellow-200";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1D1D1F]">🔁 Reconciliação SKU</h1>
          <p className="text-sm text-[#86868B] mt-0.5">
            Auditoria cruzando estoque × vendas × SKU — detecta sumiço, erro de registro e divergências.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={periodoDias}
            onChange={(e) => setPeriodoDias(Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7]"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
            <option value={365}>Último ano</option>
          </select>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Resumo */}
      {resumo && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard
            label="Total"
            value={resumo.total}
            sub={`${resumo.periodo.from} → ${resumo.periodo.until}`}
            accent={resumo.total === 0 ? "green" : resumo.total > 10 ? "red" : "orange"}
          />
          <KPICard
            label="Alta severidade"
            value={resumo.por_severidade.alta}
            sub="investigar urgente"
            accent="red"
          />
          <KPICard
            label="Divergências SKU"
            value={resumo.por_tipo.SKU_DIVERGENTE_PERSISTIDO}
            sub="produto errado"
            accent="red"
          />
          <KPICard
            label="Possíveis sumiços"
            value={resumo.por_tipo.ESGOTADO_SEM_VENDA}
            sub="esgotados sem venda"
            accent="orange"
          />
        </div>
      )}

      {/* Filtros por tipo */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setTipoFiltro("todos")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tipoFiltro === "todos" ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#6E6E73]"
          }`}
        >
          Todos ({inconsistencias?.length || 0})
        </button>
        {(Object.keys(TIPO_LABEL) as TipoInc[]).map((tipo) => (
          <button
            key={tipo}
            onClick={() => setTipoFiltro(tipo)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tipoFiltro === tipo ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#6E6E73]"
            }`}
          >
            {TIPO_LABEL[tipo].icone} {TIPO_LABEL[tipo].titulo} ({resumo?.por_tipo[tipo] || 0})
          </button>
        ))}
      </div>

      {/* Lista de inconsistências */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#86868B]">Analisando…</div>
        ) : filtradas.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-2">✅</p>
            <p className="text-base font-bold text-green-700">Tudo em ordem!</p>
            <p className="text-sm text-[#86868B] mt-1">
              Nenhuma inconsistência detectada no período selecionado.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#F0F0F5]">
            {filtradas.map((inc, idx) => (
              <div key={idx} className="p-4 hover:bg-[#FAFAFB] transition-colors">
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{TIPO_LABEL[inc.tipo].icone}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${severidadeColor(inc.severidade)}`}>
                        {inc.severidade.toUpperCase()}
                      </span>
                      <span className="text-xs font-semibold text-[#E8740E]">
                        {TIPO_LABEL[inc.tipo].titulo}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-[#1D1D1F] mt-1">{inc.produto}</p>
                    <p className="text-xs text-[#86868B] mt-0.5">{inc.descricao}</p>

                    {/* Detalhes */}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[#6E6E73]">
                      {Object.entries(inc.detalhes).map(([k, v]) => {
                        if (v === null || v === undefined || v === "") return null;
                        const fmtValue = k === "preco" || k === "custo" ? fmt(v as number) : String(v);
                        return (
                          <span key={k}>
                            <strong className="text-[#86868B]">{k}:</strong> <span className={k === "sku" || k === "venda_sku" || k === "estoque_sku" ? "font-mono" : ""}>{fmtValue}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {inc.detalhes.sku && typeof inc.detalhes.sku === "string" && inc.detalhes.sku !== "sem SKU" && (
                      <button
                        onClick={() => setSkuInfo(inc.detalhes.sku as string)}
                        className="text-xs px-2 py-1 rounded border border-[#E8740E]/30 text-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
                      >
                        📊 SKU
                      </button>
                    )}
                    {inc.ids.venda_id && (
                      <a
                        href={`/admin/vendas?venda_id=${inc.ids.venda_id}`}
                        className="text-xs px-2 py-1 rounded border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] text-center transition-colors"
                      >
                        Ver venda
                      </a>
                    )}
                    {inc.ids.estoque_id && (
                      <a
                        href={`/admin/estoque?id=${inc.ids.estoque_id}`}
                        className="text-xs px-2 py-1 rounded border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] text-center transition-colors"
                      >
                        Ver estoque
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legenda */}
      <div className="bg-[#F5F5F7] rounded-2xl p-4 space-y-2">
        <p className="text-xs font-bold text-[#1D1D1F]">Legenda dos tipos</p>
        {(Object.keys(TIPO_LABEL) as TipoInc[]).map((tipo) => (
          <div key={tipo} className="flex gap-2 text-xs text-[#6E6E73]">
            <span>{TIPO_LABEL[tipo].icone}</span>
            <div>
              <strong>{TIPO_LABEL[tipo].titulo}:</strong> {TIPO_LABEL[tipo].explicacao}
            </div>
          </div>
        ))}
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
  accent: "red" | "orange" | "green";
}) {
  const bgMap = {
    red: "bg-red-50 border-red-200",
    orange: "bg-[#FFF5EB] border-[#E8740E]/30",
    green: "bg-green-50 border-green-200",
  };
  const textMap = {
    red: "text-red-600",
    orange: "text-[#E8740E]",
    green: "text-green-600",
  };
  return (
    <div className={`p-4 rounded-2xl border ${bgMap[accent]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-[#86868B]">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${textMap[accent]}`}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5 text-[#86868B]">{sub}</p>}
    </div>
  );
}
