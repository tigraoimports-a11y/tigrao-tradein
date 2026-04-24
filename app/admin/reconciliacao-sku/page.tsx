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
  const [syncingSku, setSyncingSku] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [backfillingCor, setBackfillingCor] = useState(false);
  // Set de ids (venda_id ou estoque_id) que o admin marcou como "ignorar".
  // Persiste em localStorage — util pra casos legitimos como atacado em lote,
  // brindes internos, ou vendas fora do sistema que nao queremos ver de novo.
  const [ignorados, setIgnorados] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem("tigrao_reconciliacao_ignorados") || "[]";
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  });
  const [mostrarIgnorados, setMostrarIgnorados] = useState(false);

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

  // Chave unica pra persistir decisao de ignorar: usa o ID mais especifico
  // disponivel (venda_id > estoque_id) mais o tipo, pra evitar colisao entre
  // tipos de alerta que compartilhem ids.
  const keyIgnorar = (i: Inconsistencia): string =>
    `${i.tipo}:${i.ids.venda_id || i.ids.estoque_id || "?"}`;

  const toggleIgnorar = (inc: Inconsistencia) => {
    const k = keyIgnorar(inc);
    const novo = new Set(ignorados);
    if (novo.has(k)) novo.delete(k);
    else novo.add(k);
    setIgnorados(novo);
    try {
      localStorage.setItem("tigrao_reconciliacao_ignorados", JSON.stringify([...novo]));
    } catch {}
  };

  // Ignora todas as inconsistencias atualmente filtradas (visiveis na lista).
  // Util pra limpar em massa quando o admin sabe que todos sao casos legitimos
  // (ex: 73 sumicos vindos de vendas atacado em lote, brindes, vendas fora do
  // sistema). Evita ter que clicar um por um.
  const ignorarTodosFiltrados = () => {
    const alvo = filtradas.filter((i) => !ignorados.has(keyIgnorar(i)));
    if (alvo.length === 0) return;
    if (!confirm(`Ignorar ${alvo.length} alertas de uma vez? Voce ainda pode restaurar depois clicando em "🙈 Ignorados".`)) return;
    const novo = new Set(ignorados);
    for (const i of alvo) novo.add(keyIgnorar(i));
    setIgnorados(novo);
    try {
      localStorage.setItem("tigrao_reconciliacao_ignorados", JSON.stringify([...novo]));
    } catch {}
  };

  // Ignora todas as inconsistencias com MESMO SKU do item clicado. Util pra
  // agrupar atacados em lote — ex: se ha 4 unidades do mesmo iPhone sumidas
  // e sabemos que foi 1 venda atacado, um clique ignora as 4.
  const ignorarTodosDoMesmoSku = (inc: Inconsistencia) => {
    const skuAlvo = typeof inc.detalhes.sku === "string" ? inc.detalhes.sku
      : typeof inc.detalhes.estoque_sku === "string" ? inc.detalhes.estoque_sku
      : null;
    if (!skuAlvo) return;
    const todos = (inconsistencias || []).filter((i) => {
      const sku = typeof i.detalhes.sku === "string" ? i.detalhes.sku
        : typeof i.detalhes.estoque_sku === "string" ? i.detalhes.estoque_sku
        : null;
      return sku === skuAlvo && !ignorados.has(keyIgnorar(i));
    });
    if (todos.length === 0) return;
    if (!confirm(`Ignorar ${todos.length} alertas com SKU ${skuAlvo}?`)) return;
    const novo = new Set(ignorados);
    for (const i of todos) novo.add(keyIgnorar(i));
    setIgnorados(novo);
    try {
      localStorage.setItem("tigrao_reconciliacao_ignorados", JSON.stringify([...novo]));
    } catch {}
  };

  // Backfill de cor: copia estoque.cor → venda.cor pra vendas historicas com
  // estoque_id vinculado mas sem cor salva. Elimina a raiz do problema de
  // "cor nao aparece em algumas vendas" — faz persistir a cor na venda em vez
  // de depender de enrichment em runtime ou inferencia de texto.
  const backfillCor = async () => {
    if (!password) return;
    if (!confirm("Rodar backfill de cor/categoria/observacao? Vai copiar os valores do estoque pra todas as vendas que tem estoque_id mas estao sem esses campos. E idempotente — seguro rodar de novo.")) return;
    setBackfillingCor(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/admin/vendas/backfill-cor", {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      const json = await res.json();
      if (json.ok) {
        setSyncMsg(
          `✅ Backfill concluido: ${json.atualizadas} vendas preenchidas ` +
          `(de ${json.total} candidatas). ` +
          `${json.sem_cor_no_estoque > 0 ? `${json.sem_cor_no_estoque} estoques nao tinham cor. ` : ""}` +
          `${json.sem_estoque > 0 ? `${json.sem_estoque} com estoque_id invalido.` : ""}`,
        );
        fetchData();
      } else {
        setSyncMsg(`Erro: ${json.error || "desconhecido"}`);
      }
    } catch (err) {
      setSyncMsg(`Erro de rede: ${err}`);
    } finally {
      setBackfillingCor(false);
    }
  };

  const limparIgnorados = () => {
    if (!confirm("Remover todos os alertas ignorados? Eles voltarao a aparecer na proxima auditoria.")) return;
    setIgnorados(new Set());
    try {
      localStorage.setItem("tigrao_reconciliacao_ignorados", "[]");
    } catch {}
  };

  const filtradas = (inconsistencias || []).filter((i) => {
    if (tipoFiltro !== "todos" && i.tipo !== tipoFiltro) return false;
    const isIgnorado = ignorados.has(keyIgnorar(i));
    if (mostrarIgnorados) return isIgnorado;
    return !isIgnorado;
  });
  const numIgnorados = (inconsistencias || []).filter((i) => ignorados.has(keyIgnorar(i))).length;

  // Corrige divergencias SKU em massa: copia estoque.sku → venda.sku quando
  // diferem. Resolve o caso Daniel (SKUs cruzados entre produtos do grupo) e
  // Glauco (Magic Mouse com SKU gerado via texto antes do backfill).
  const syncSkuDivergentes = async () => {
    if (!password) return;
    const divergentes = (inconsistencias || []).filter(
      (i) => i.tipo === "SKU_DIVERGENTE_PERSISTIDO" && i.ids.venda_id,
    );
    if (divergentes.length === 0) {
      setSyncMsg("Nenhuma divergencia SKU pra corrigir");
      return;
    }
    if (!confirm(`Sincronizar ${divergentes.length} vendas com SKU do estoque? Isso sobrescreve o SKU atual da venda com o SKU gravado no estoque vinculado.`)) {
      return;
    }
    setSyncingSku(true);
    setSyncMsg(null);
    try {
      const venda_ids = divergentes.map((i) => i.ids.venda_id!).filter(Boolean);
      const res = await fetch("/api/admin/sku/reconciliacao", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ action: "sync_from_estoque", venda_ids }),
      });
      const json = await res.json();
      if (json.ok) {
        setSyncMsg(
          `✅ ${json.atualizadas} vendas atualizadas${json.falhas?.length ? ` (${json.falhas.length} falhas)` : ""}`,
        );
        fetchData();
      } else {
        setSyncMsg(`Erro: ${json.error || "desconhecido"}`);
      }
    } catch (err) {
      setSyncMsg(`Erro de rede: ${err}`);
    } finally {
      setSyncingSku(false);
    }
  };

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
        <div className="flex gap-2 flex-wrap">
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
          {resumo && resumo.por_tipo.SKU_DIVERGENTE_PERSISTIDO > 0 && (
            <button
              onClick={syncSkuDivergentes}
              disabled={syncingSku}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#E8740E] text-white hover:bg-[#D26509] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Corrige automaticamente as vendas com SKU divergente — copia o SKU do estoque vinculado pra venda."
            >
              {syncingSku ? "Sincronizando…" : `🔧 Sincronizar ${resumo.por_tipo.SKU_DIVERGENTE_PERSISTIDO} SKUs`}
            </button>
          )}
          <button
            onClick={backfillCor}
            disabled={backfillingCor}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#E8740E]/40 text-[#E8740E] hover:bg-[#FFF5EB] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Copia cor/categoria/observacao do estoque pra vendas que tem estoque_id mas estao sem esses campos. Elimina 'cor nao aparece' em vendas antigas."
          >
            {backfillingCor ? "Preenchendo…" : "🎨 Backfill cor das vendas"}
          </button>
        </div>
      </div>
      {syncMsg && (
        <div className="bg-[#FFF5EB] border border-[#E8740E]/30 rounded-lg p-3 text-xs text-[#1D1D1F]">
          {syncMsg}
        </div>
      )}

      {/* Resumo — exclui os ignorados pra nao inflar os numeros com casos ja triados */}
      {resumo && (() => {
        const ativos = (inconsistencias || []).filter((i) => !ignorados.has(keyIgnorar(i)));
        const ativosPorTipo = {
          SKU_DIVERGENTE_PERSISTIDO: ativos.filter((i) => i.tipo === "SKU_DIVERGENTE_PERSISTIDO").length,
          ESGOTADO_SEM_VENDA: ativos.filter((i) => i.tipo === "ESGOTADO_SEM_VENDA").length,
          VENDA_SEM_ESTOQUE: ativos.filter((i) => i.tipo === "VENDA_SEM_ESTOQUE").length,
        };
        const ativosAlta = ativos.filter((i) => i.severidade === "alta").length;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPICard
              label="Total ativo"
              value={ativos.length}
              sub={`${resumo.periodo.from} → ${resumo.periodo.until}${numIgnorados > 0 ? ` · ${numIgnorados} ignorados` : ""}`}
              accent={ativos.length === 0 ? "green" : ativos.length > 10 ? "red" : "orange"}
            />
            <KPICard
              label="Alta severidade"
              value={ativosAlta}
              sub="investigar urgente"
              accent="red"
            />
            <KPICard
              label="Divergências SKU"
              value={ativosPorTipo.SKU_DIVERGENTE_PERSISTIDO}
              sub="produto errado"
              accent="red"
            />
            <KPICard
              label="Possíveis sumiços"
              value={ativosPorTipo.ESGOTADO_SEM_VENDA}
              sub="esgotados sem venda"
              accent="orange"
            />
          </div>
        );
      })()}

      {/* Filtros por tipo */}
      <div className="flex gap-2 flex-wrap items-center">
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
        {numIgnorados > 0 && (
          <>
            <span className="w-px h-5 bg-[#D2D2D7] mx-1" />
            <button
              onClick={() => setMostrarIgnorados(!mostrarIgnorados)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                mostrarIgnorados ? "bg-[#86868B] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B]"
              }`}
              title="Mostra/esconde os alertas que voce marcou como 'ignorar'"
            >
              {mostrarIgnorados ? "👁 Ver ativos" : `🙈 Ignorados (${numIgnorados})`}
            </button>
            {mostrarIgnorados && (
              <button
                onClick={limparIgnorados}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#86868B] hover:border-red-300 hover:text-red-600 transition-colors"
              >
                Limpar ignorados
              </button>
            )}
          </>
        )}
        {/* Bulk ignore — facilita limpar muitos alertas legitimos de uma vez */}
        {!mostrarIgnorados && filtradas.length > 0 && (
          <button
            onClick={ignorarTodosFiltrados}
            className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#86868B] hover:border-red-300 hover:text-red-600 transition-colors"
            title="Ignora TODOS os alertas atualmente visiveis (respeitando o filtro de tipo). Util quando voce sabe que todos sao casos legitimos."
          >
            🙈 Ignorar todos ({filtradas.length})
          </button>
        )}
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
                    <button
                      onClick={() => toggleIgnorar(inc)}
                      className={`text-xs px-2 py-1 rounded border text-center transition-colors ${
                        mostrarIgnorados
                          ? "border-[#E8740E]/30 text-[#E8740E] hover:bg-[#FFF5EB]"
                          : "border-[#D2D2D7] text-[#86868B] hover:border-red-300 hover:text-red-600"
                      }`}
                      title={
                        mostrarIgnorados
                          ? "Voltar a mostrar este alerta"
                          : "Ocultar este alerta — usar pra casos legitimos (atacado, brinde, venda fora do sistema)"
                      }
                    >
                      {mostrarIgnorados ? "↩ Restaurar" : "🙈 Ignorar"}
                    </button>
                    {/* Botao de conveniencia: ignora TODOS do mesmo SKU de uma vez.
                         Util pra atacados em lote — 1 venda, N unidades esgotadas */}
                    {!mostrarIgnorados && (() => {
                      const skuAlvo = typeof inc.detalhes.sku === "string" ? inc.detalhes.sku
                        : typeof inc.detalhes.estoque_sku === "string" ? inc.detalhes.estoque_sku
                        : null;
                      if (!skuAlvo) return null;
                      const iguais = (inconsistencias || []).filter((i) => {
                        const sku = typeof i.detalhes.sku === "string" ? i.detalhes.sku
                          : typeof i.detalhes.estoque_sku === "string" ? i.detalhes.estoque_sku
                          : null;
                        return sku === skuAlvo && !ignorados.has(keyIgnorar(i));
                      });
                      if (iguais.length <= 1) return null;
                      return (
                        <button
                          onClick={() => ignorarTodosDoMesmoSku(inc)}
                          className="text-xs px-2 py-1 rounded border border-[#D2D2D7] text-[#86868B] hover:border-red-300 hover:text-red-600 text-center transition-colors"
                          title={`Ignora todos os ${iguais.length} alertas com mesmo SKU (${skuAlvo}) — util pra atacados em lote`}
                        >
                          🙈×{iguais.length}
                        </button>
                      );
                    })()}
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
