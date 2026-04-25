// app/admin/comprar-urgente/page.tsx
// Dashboard de priorizacao de compra — mostra em ordem de urgencia quais SKUs
// precisam ser comprados do fornecedor agora. Cada linha mostra o score, a
// demanda (avisos + simulacoes + encomendas), a velocidade de venda e uma
// sugestao de quantidade ja pronta pra colar no pedido.

"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { SkuInfoModal } from "@/components/admin/SkuInfoModal";

const fmt = (v: number | null) => (v === null || v === undefined ? "—" : `R$ ${Math.round(v).toLocaleString("pt-BR")}`);

interface SkuUrgencia {
  sku: string;
  nome_canonico: string | null;
  score: number;
  em_estoque: number;
  vendas_30d: number;
  vendas_60d: number;
  simulacoes_30d: number;
  avisos_ativos: number;
  encomendas_pendentes: number;
  velocidade_semanal: number;
  qnt_sugerida: number;
  ultimo_custo: number | null;
  ultima_venda_data: string | null;
}

// Categorias detectadas pelo prefixo do SKU (IPHONE-, IPAD-, MACBOOK-, etc)
const CATEGORIAS: Array<{ label: string; prefixo: string }> = [
  { label: "Todos", prefixo: "" },
  { label: "iPhones", prefixo: "IPHONE-" },
  { label: "iPads", prefixo: "IPAD" },
  { label: "MacBooks", prefixo: "MACBOOK-" },
  { label: "Mac Mini", prefixo: "MAC-MINI" },
  { label: "Apple Watch", prefixo: "WATCH-" },
  { label: "AirPods", prefixo: "AIRPODS" },
];

export default function ComprarUrgentePage() {
  const { password } = useAdmin();
  const [data, setData] = useState<SkuUrgencia[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoriaFiltro, setCategoriaFiltro] = useState("");
  const [skuInfo, setSkuInfo] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [minScore, setMinScore] = useState(2);

  const fetchData = useCallback(() => {
    if (!password) return;
    setLoading(true);
    fetch(`/api/admin/sku/comprar-urgente?min_score=${minScore}`, {
      headers: { "x-admin-password": password },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) setData(json.resultados);
        else setData([]);
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [password, minScore]);

  useEffect(() => {
    // Mount + re-fetch quando password/periodo muda. fetchData chama
    // setLoading internamente — padrao tipico aceitavel (eslint excessivo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const filtrados = (data || []).filter((r) => {
    if (!categoriaFiltro) return true;
    return r.sku.startsWith(categoriaFiltro);
  });

  const copiarLista = () => {
    const linhas = filtrados.map(
      (r) => `${r.qnt_sugerida}x ${r.nome_canonico || r.sku}${r.ultimo_custo ? ` (último custo ${fmt(r.ultimo_custo)})` : ""}`,
    );
    const texto = `📦 Lista de compra — ${new Date().toLocaleDateString("pt-BR")}\n\n${linhas.join("\n")}`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1D1D1F]">🚨 Comprar Urgente</h1>
          <p className="text-sm text-[#86868B] mt-0.5">
            SKUs ranqueados por urgência baseado em demanda real (vendas recentes, simulações, avisos, encomendas).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copiarLista}
            disabled={filtrados.length === 0}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filtrados.length === 0
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : copiado
                  ? "bg-green-500 text-white"
                  : "bg-[#E8740E] text-white hover:bg-[#D06A0D]"
            }`}
          >
            {copiado ? "✅ Copiado" : "📋 Copiar lista pro fornecedor"}
          </button>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex gap-2 flex-wrap">
          {CATEGORIAS.map((c) => (
            <button
              key={c.label}
              onClick={() => setCategoriaFiltro(c.prefixo)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                categoriaFiltro === c.prefixo
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-[#86868B]">Score mínimo:</label>
          <select
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="px-2 py-1 rounded-lg border border-[#D2D2D7] text-xs"
          >
            <option value={1}>1 (tudo)</option>
            <option value={2}>2 (padrão)</option>
            <option value={5}>5 (importante)</option>
            <option value={10}>10 (crítico)</option>
          </select>
        </div>
      </div>

      {/* KPIs topo */}
      {!loading && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KPICard label="SKUs urgentes" value={filtrados.length} accent="red" />
          <KPICard
            label="Demanda reprimida"
            value={filtrados.reduce((s, r) => s + r.avisos_ativos + r.encomendas_pendentes, 0)}
            sub="avisos + encomendas"
            accent="orange"
          />
          <KPICard
            label="Interesse recente"
            value={filtrados.reduce((s, r) => s + r.simulacoes_30d, 0)}
            sub="simulações 30d"
            accent="purple"
          />
          <KPICard
            label="Total sugerido"
            value={filtrados.reduce((s, r) => s + r.qnt_sugerida, 0)}
            sub="unidades a comprar"
            accent="green"
          />
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-sm text-[#86868B]">Calculando urgências…</div>
        ) : filtrados.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-2">🎉</p>
            <p className="text-sm text-[#86868B]">Nenhum SKU com urgência crítica. Bom trabalho!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead className="bg-[#F5F5F7] border-b border-[#D2D2D7]">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold text-[#6E6E73]">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-[#6E6E73]">Produto</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Score</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Em estoque</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]" title="Simulações + Avisos + Encomendas">
                    Demanda
                  </th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#6E6E73]">Velocidade/sem</th>
                  <th className="px-3 py-2.5 text-center font-semibold text-[#E8740E]">Comprar</th>
                  <th className="px-3 py-2.5 text-right font-semibold text-[#6E6E73]">Último custo</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r, idx) => {
                  const urgenciaColor =
                    r.score >= 15 ? "bg-red-50" : r.score >= 8 ? "bg-orange-50" : "bg-yellow-50";
                  return (
                    <tr key={r.sku} className={`border-b border-[#F0F0F5] hover:bg-[#FAFAFB] transition-colors ${idx < 3 ? urgenciaColor : ""}`}>
                      <td className="px-3 py-2.5 font-mono text-[#86868B]">{idx + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-[#1D1D1F]">{r.nome_canonico || r.sku}</div>
                        <div className="font-mono text-[10px] text-[#86868B] mt-0.5">{r.sku}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          r.score >= 15 ? "bg-red-100 text-red-700" :
                          r.score >= 8 ? "bg-orange-100 text-orange-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {r.score}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={r.em_estoque === 0 ? "text-red-600 font-bold" : "text-[#1D1D1F]"}>
                          {r.em_estoque}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="text-[11px] text-[#86868B]">
                          {r.simulacoes_30d > 0 && <span title="Simulações 30d">{r.simulacoes_30d}s</span>}
                          {r.simulacoes_30d > 0 && (r.avisos_ativos > 0 || r.encomendas_pendentes > 0) && " · "}
                          {r.avisos_ativos > 0 && <span title="Avisos ativos">{r.avisos_ativos}a</span>}
                          {r.avisos_ativos > 0 && r.encomendas_pendentes > 0 && " · "}
                          {r.encomendas_pendentes > 0 && <span title="Encomendas pendentes" className="text-[#E8740E] font-semibold">{r.encomendas_pendentes}e</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center text-[#86868B]">
                        {r.velocidade_semanal > 0 ? `${r.velocidade_semanal}/sem` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-[#FFF5EB] text-[#E8740E] font-bold border border-[#E8740E]/30">
                          {r.qnt_sugerida}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#86868B]">{fmt(r.ultimo_custo)}</td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => setSkuInfo(r.sku)}
                          className="text-xs px-2 py-1 rounded border border-[#E8740E]/30 text-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
                          title="Ver resumo 360° do SKU"
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

      {/* Ajuda rápida */}
      {!loading && filtrados.length > 0 && (
        <div className="bg-[#F5F5F7] rounded-2xl p-4 text-xs text-[#6E6E73] space-y-1">
          <p>
            <strong>Score:</strong> avisos × 4 + encomendas × 3 + simulações × 2 + vendas × 2 (pontua só quando estoque ≤ 1).
          </p>
          <p>
            <strong>Comprar:</strong> maior entre (avisos+encomendas), 2 semanas de velocidade histórica ou 15% das simulações.
          </p>
          <p>
            <strong>Demanda:</strong> <code>s</code> = simulações, <code>a</code> = avisos, <code className="text-[#E8740E]">e</code> = encomendas pendentes.
          </p>
        </div>
      )}

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
  accent: "red" | "orange" | "purple" | "green";
}) {
  const bgMap = {
    red: "bg-red-50 border-red-200",
    orange: "bg-[#FFF5EB] border-[#E8740E]/30",
    purple: "bg-purple-50 border-purple-200",
    green: "bg-green-50 border-green-200",
  };
  const textMap = {
    red: "text-red-600",
    orange: "text-[#E8740E]",
    purple: "text-purple-600",
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
