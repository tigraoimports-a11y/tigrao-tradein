"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { TopSkusSection } from "@/components/admin/TopSkusSection";

interface FunnelStep {
  step: number;
  views: number;
  completes: number;
  droppedHere: number;
}

interface QuestionBreakdown {
  step: number;
  question: string;
  sessions: number;
}

interface DailyData {
  date: string;
  sessions: number;
}

interface DimRow {
  key: string;
  sessions: number;
  started: number;
  whatsapp: number;
  submit: number;
  conversion: number;
}

interface SessionDetail {
  sessionId: string;
  startedAt: string;
  lastEventAt: string;
  lastStep: number | null;
  lastQuestion: string | null;
  utmSource: string | null;
  deviceType: string | null;
  completedWhatsapp: boolean;
  completedSubmit: boolean;
  eventCount: number;
}

interface AnalyticsData {
  visits: number;
  startedCount: number;
  totalSessions: number;
  whatsappCount: number;
  exitCount: number;
  cotarOutroCount: number;
  compraViewCount?: number;
  compraSubmitCount?: number;
  funnel: FunnelStep[];
  questionBreakdown: QuestionBreakdown[];
  daily: DailyData[];
  conversionRate: string;
  conversionRateFinal?: string;
  byUtmSource?: DimRow[];
  byDeviceType?: DimRow[];
  sessionsList?: SessionDetail[];
  filters?: { utm_source: string | null; device_type: string | null };
}

const DEVICE_LABELS: Record<string, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  macbook: "MacBook",
  watch: "Apple Watch",
};

const STEP_LABELS: Record<number, string> = {
  1: "Seu Aparelho",
  2: "Aparelho Novo",
  3: "Seus Dados",
  4: "Cotacao",
  5: "Formulario /compra",
};

const QUESTION_LABELS: Record<string, string> = {
  line: "Linha",
  model: "Modelo",
  storage: "Armazenamento",
  damage: "Dano",
  battery: "Bateria",
  screenScratch: "Riscos tela",
  sideScratch: "Riscos lateral",
  peeling: "Descascado",
  partsReplaced: "Pecas trocadas",
  warranty: "Garantia",
  originalBox: "Caixa original",
};

export default function AnalyticsPage() {
  const { password, user } = useAdmin();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"7d" | "30d" | "all">("7d");
  // Filtros adicionados pra item #20: drilldown por canal e dispositivo.
  // Quando ativos, todos numeros da tela viram da subset filtrado.
  const [filterUtm, setFilterUtm] = useState<string>("");
  const [filterDevice, setFilterDevice] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ range });
      if (filterUtm) params.set("utm_source", filterUtm);
      if (filterDevice) params.set("device_type", filterDevice);
      const res = await fetch(`/api/funnel?${params.toString()}`, {
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [password, range, filterUtm, filterDevice, user?.nome]);

  useEffect(() => {
    if (password) fetchData();
  }, [password, range, filterUtm, filterDevice, fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-[#E8740E] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-[#86868B]">
        Erro ao carregar analytics
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1D1D1F]">
            Funil do Trade-In
          </h1>
          <p className="text-sm text-[#86868B] mt-0.5">
            Analise de conversao por etapa
          </p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "all"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E]"
              }`}
            >
              {r === "7d" ? "7 dias" : r === "30d" ? "30 dias" : "Tudo"}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#D2D2D7] text-[#6E6E73] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Filtros — item #20 (drop-off por canal/dispositivo).
          Quando algum filtro tá ativo, todos numeros da pagina ficam restritos
          ao subset (ex: so sessoes que vieram de Meta Ads + escolheram iPhone). */}
      {data && (data.byUtmSource || data.byDeviceType) && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-3 sm:p-4 shadow-sm flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-[#86868B] uppercase tracking-wide">Filtrar por:</span>
          <select
            value={filterUtm}
            onChange={(e) => setFilterUtm(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs border border-[#D2D2D7] bg-white text-[#1D1D1F] focus:border-[#E8740E] focus:outline-none"
          >
            <option value="">Todos os canais</option>
            {(data.byUtmSource || []).map((u) => (
              <option key={u.key} value={u.key === "(direto/sem origem)" ? "" : u.key}>
                {u.key} ({u.sessions})
              </option>
            ))}
          </select>
          <select
            value={filterDevice}
            onChange={(e) => setFilterDevice(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs border border-[#D2D2D7] bg-white text-[#1D1D1F] focus:border-[#E8740E] focus:outline-none"
          >
            <option value="">Todos os dispositivos</option>
            {(data.byDeviceType || [])
              .filter((d) => d.key !== "(direto/sem origem)")
              .map((d) => (
                <option key={d.key} value={d.key}>
                  {DEVICE_LABELS[d.key] || d.key} ({d.sessions})
                </option>
              ))}
          </select>
          {(filterUtm || filterDevice) && (
            <button
              onClick={() => { setFilterUtm(""); setFilterDevice(""); }}
              className="text-xs px-2 py-1 rounded text-[#E74C3C] hover:bg-[#FFF5F5] transition-colors"
            >
              ✕ Limpar
            </button>
          )}
        </div>
      )}

      {/* KPI Cards — top of funnel */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KPICard label="Acessaram o site" value={data.visits} />
        <KPICard
          label="Iniciaram simulacao"
          value={data.startedCount}
          sub={
            data.visits > 0
              ? `${((data.startedCount / data.visits) * 100).toFixed(0)}% dos acessos`
              : undefined
          }
        />
        <KPICard
          label="Fecharam pedido"
          value={data.whatsappCount}
          sub={
            data.startedCount > 0
              ? `${((data.whatsappCount / data.startedCount) * 100).toFixed(0)}% de quem iniciou`
              : undefined
          }
        />
        <KPICard
          label="Submeteram /compra"
          value={data.compraSubmitCount ?? 0}
          accent
          sub={
            (data.compraViewCount ?? 0) > 0
              ? `${((((data.compraSubmitCount ?? 0) / (data.compraViewCount ?? 1)) * 100)).toFixed(0)}% de quem entrou`
              : "etapa 5 (formulario)"
          }
        />
        <KPICard
          label="Conversao final"
          value={`${data.conversionRateFinal ?? data.conversionRate}%`}
          accent
          sub="submit /compra / acessos"
        />
      </div>

      {/* Onde as pessoas param — drop-off por tela */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
          Onde as pessoas param
        </h2>
        <p className="text-xs text-[#86868B] mb-4">
          Quantos comecaram cada tela mas nao avancaram
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {data.funnel.map((f) => {
            const pct = f.views > 0 ? ((f.droppedHere / f.views) * 100).toFixed(0) : "0";
            return (
              <div
                key={f.step}
                className="rounded-xl p-3 border border-[#D2D2D7] bg-[#FFF5F5]"
              >
                <p className="text-[11px] text-[#86868B] font-medium uppercase tracking-wide">
                  Tela {f.step}: {STEP_LABELS[f.step]}
                </p>
                <p className="text-2xl font-bold mt-1 text-[#E74C3C]">
                  {f.droppedHere}
                </p>
                <p className="text-[11px] text-[#86868B] mt-0.5">
                  pararam aqui ({pct}%)
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Funnel — completo, do primeiro acesso ate fechar pedido */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">
          Funil de Conversao
        </h2>
        <div className="space-y-3">
          {(() => {
            const fullFunnel: { label: string; count: number; isFinal?: boolean }[] = [
              { label: "Acessaram o site", count: data.visits },
              { label: "Iniciaram simulacao", count: data.startedCount },
              ...data.funnel.map((f) => ({
                label: `Etapa ${f.step}: ${STEP_LABELS[f.step] || `Step ${f.step}`}`,
                count: f.views,
              })),
              { label: "Fecharam pedido (WhatsApp)", count: data.whatsappCount },
              { label: "Submeteram /compra", count: data.compraSubmitCount ?? 0, isFinal: true },
            ];
            const max = Math.max(...fullFunnel.map((s) => s.count), 1);
            return fullFunnel.map((s, idx) => {
              const pct = (s.count / max) * 100;
              const next = fullFunnel[idx + 1];
              const dropoff =
                next && s.count > 0
                  ? (((s.count - next.count) / s.count) * 100).toFixed(0)
                  : null;
              return (
                <div key={s.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-[#1D1D1F]">
                      {s.label}
                    </span>
                    <span className="text-xs text-[#86868B]">
                      {s.count} sessoes
                    </span>
                  </div>
                  <div className="h-8 bg-[#F5F5F7] rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-500"
                      style={{
                        width: `${Math.max(pct, 2)}%`,
                        backgroundColor: s.isFinal ? "#2ECC71" : "#E8740E",
                        opacity: 0.7 + (idx / fullFunnel.length) * 0.3,
                      }}
                    />
                    <span className="absolute inset-0 flex items-center pl-3 text-xs font-semibold text-white mix-blend-difference">
                      {s.count}
                    </span>
                  </div>
                  {dropoff && parseInt(dropoff) > 0 && (
                    <p className="text-[11px] text-[#E74C3C] mt-0.5 text-right">
                      {dropoff}% desistiram aqui
                    </p>
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* Actions in Step 4 */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">
          Acoes na Cotacao (Etapa 4)
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-[#F0FFF4] border border-[#2ECC71]/20">
            <p className="text-2xl font-bold text-[#2ECC71]">
              {data.whatsappCount}
            </p>
            <p className="text-xs text-[#86868B] mt-1">WhatsApp</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-[#FFF5EB] border border-[#E8740E]/20">
            <p className="text-2xl font-bold text-[#E8740E]">
              {data.cotarOutroCount}
            </p>
            <p className="text-xs text-[#86868B] mt-1">Cotar outro</p>
          </div>
          <div className="text-center p-3 rounded-xl bg-[#FFF5F5] border border-[#E74C3C]/20">
            <p className="text-2xl font-bold text-[#E74C3C]">
              {data.exitCount}
            </p>
            <p className="text-xs text-[#86868B] mt-1">Saiu</p>
          </div>
        </div>
      </div>

      {/* Question breakdown — TODAS as etapas (drop-off fino por pergunta) */}
      {data.questionBreakdown.length > 0 && (() => {
        // Agrupa perguntas por etapa
        const stepsComPerguntas = [...new Set(data.questionBreakdown.map(q => q.step))].sort((a, b) => a - b);
        return (
          <div className="space-y-4">
            {stepsComPerguntas.map(step => {
              const perguntasStep = data.questionBreakdown.filter(q => q.step === step);
              const stepViews = data.funnel.find(f => f.step === step)?.views || 1;
              const stepLabel = STEP_LABELS[step] || `Step ${step}`;

              // Drop-off dentro da etapa: diferença entre a primeira e última pergunta
              const maxSessions = Math.max(...perguntasStep.map(q => q.sessions), 1);
              const minSessions = Math.min(...perguntasStep.map(q => q.sessions), maxSessions);
              const dropoffInterno = maxSessions > 0
                ? (((maxSessions - minSessions) / maxSessions) * 100).toFixed(0)
                : "0";

              return (
                <div key={step} className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                    <h2 className="text-base font-semibold text-[#1D1D1F]">
                      Etapa {step}: {stepLabel}
                    </h2>
                    <span className="text-[11px] text-[#E74C3C] font-semibold">
                      {dropoffInterno}% drop-off interno · {stepViews} sessões entraram
                    </span>
                  </div>
                  <p className="text-xs text-[#86868B] mb-4">
                    Perguntas respondidas dentro dessa etapa — queda entre elas indica onde desistem
                  </p>
                  <div className="space-y-2">
                    {perguntasStep
                      .sort((a, b) => b.sessions - a.sessions)
                      .map((q) => {
                        const pct = ((q.sessions / stepViews) * 100).toFixed(0);
                        return (
                          <div key={`${q.step}:${q.question}`} className="flex items-center gap-3">
                            <span className="text-xs text-[#6E6E73] w-28 shrink-0 truncate">
                              {QUESTION_LABELS[q.question] || q.question}
                            </span>
                            <div className="flex-1 h-5 bg-[#F5F5F7] rounded overflow-hidden">
                              <div
                                className="h-full bg-[#E8740E]/70 rounded transition-all duration-500"
                                style={{ width: `${Math.max(parseFloat(pct), 2)}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-[#1D1D1F] w-16 text-right">
                              {q.sessions} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* === NOVO (#20): Drop-off por CANAL DE AQUISICAO (UTM source) === */}
      {data.byUtmSource && data.byUtmSource.length > 0 && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
            Por canal de aquisicao
          </h2>
          <p className="text-xs text-[#86868B] mb-4">
            Conversao de cada origem (Meta Ads, Instagram, direto, etc) — clique no filtro acima pra ver o funil completo desse canal
          </p>
          <DimTable rows={data.byUtmSource} labelHeader="Canal" />
        </div>
      )}

      {/* === NOVO (#20): Drop-off por TIPO DE DISPOSITIVO === */}
      {data.byDeviceType && data.byDeviceType.length > 0 && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
            Por tipo de dispositivo
          </h2>
          <p className="text-xs text-[#86868B] mb-4">
            Conversao por categoria — Apple Watch costuma ter taxa diferente de iPhone, indica onde refinar UX
          </p>
          <DimTable
            rows={data.byDeviceType.map((r) => ({
              ...r,
              key: DEVICE_LABELS[r.key] || r.key,
            }))}
            labelHeader="Dispositivo"
          />
        </div>
      )}

      {/* === NOVO (#20): SESSOES INDIVIDUAIS (ultimas 50) — debug fino === */}
      {data.sessionsList && data.sessionsList.length > 0 && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
            Ultimas {data.sessionsList.length} sessoes
          </h2>
          <p className="text-xs text-[#86868B] mb-4">
            Cada linha e uma pessoa que entrou. Mostra ate qual etapa avancou e em qual pergunta parou — util pra investigar abandono
          </p>
          <SessionsTable rows={data.sessionsList} />
        </div>
      )}

      {/* Top SKUs (vendas/simulacoes/encomendas por SKU canonico) */}
      <TopSkusSection password={password} range={range} />

      {/* Daily chart (simple bar chart) */}
      {data.daily.length > 0 && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">
            Sessoes por Dia
          </h2>
          <div className="flex items-end gap-1 h-32 overflow-x-auto">
            {data.daily.map((d) => {
              const maxDaily = Math.max(
                ...data.daily.map((x) => x.sessions),
                1
              );
              const h = (d.sessions / maxDaily) * 100;
              return (
                <div
                  key={d.date}
                  className="flex flex-col items-center gap-1 min-w-[24px]"
                  title={`${d.date}: ${d.sessions} sessoes`}
                >
                  <span className="text-[9px] text-[#86868B]">
                    {d.sessions}
                  </span>
                  <div
                    className="w-5 rounded-t bg-[#E8740E]/80 transition-all"
                    style={{ height: `${Math.max(h, 4)}%` }}
                  />
                  <span className="text-[8px] text-[#86868B] rotate-[-45deg] origin-top-left whitespace-nowrap">
                    {d.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Tabela compacta usada pra "Por canal" e "Por dispositivo".
// Mostra cada dimensao com KPIs lado a lado e barra visual da conversao final.
function DimTable({ rows, labelHeader }: { rows: DimRow[]; labelHeader: string }) {
  if (rows.length === 0) return <p className="text-xs text-[#86868B]">Sem dados ainda.</p>;
  const maxSessions = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-xs sm:text-sm">
        <thead>
          <tr className="text-left text-[#86868B] border-b border-[#D2D2D7]">
            <th className="px-2 sm:px-3 py-2 font-medium">{labelHeader}</th>
            <th className="px-2 sm:px-3 py-2 font-medium text-right">Sessoes</th>
            <th className="px-2 sm:px-3 py-2 font-medium text-right hidden sm:table-cell">Iniciaram</th>
            <th className="px-2 sm:px-3 py-2 font-medium text-right">WhatsApp</th>
            <th className="px-2 sm:px-3 py-2 font-medium text-right hidden sm:table-cell">Submeteu</th>
            <th className="px-2 sm:px-3 py-2 font-medium text-right">Conv.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const widthPct = (r.sessions / maxSessions) * 100;
            return (
              <tr key={r.key} className="border-b border-[#F5F5F7] hover:bg-[#FFF5EB]/30">
                <td className="px-2 sm:px-3 py-2.5 font-medium text-[#1D1D1F]">
                  <div className="flex items-center gap-2">
                    <span className="truncate max-w-[140px]">{r.key}</span>
                  </div>
                  <div className="h-1 bg-[#F5F5F7] rounded mt-1 overflow-hidden">
                    <div
                      className="h-full bg-[#E8740E]/60 rounded"
                      style={{ width: `${Math.max(widthPct, 2)}%` }}
                    />
                  </div>
                </td>
                <td className="px-2 sm:px-3 py-2.5 text-right text-[#1D1D1F]">{r.sessions}</td>
                <td className="px-2 sm:px-3 py-2.5 text-right text-[#6E6E73] hidden sm:table-cell">{r.started}</td>
                <td className="px-2 sm:px-3 py-2.5 text-right text-[#2ECC71] font-medium">{r.whatsapp}</td>
                <td className="px-2 sm:px-3 py-2.5 text-right text-[#E8740E] font-medium hidden sm:table-cell">{r.submit}</td>
                <td className="px-2 sm:px-3 py-2.5 text-right">
                  <span
                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      r.conversion >= 5
                        ? "bg-[#F0FFF4] text-[#27AE60]"
                        : r.conversion >= 2
                        ? "bg-[#FFF5EB] text-[#E8740E]"
                        : "bg-[#FFF5F5] text-[#E74C3C]"
                    }`}
                  >
                    {r.conversion}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Tabela das ultimas 50 sessoes — pra debugar onde cliente especifico abandonou.
// Mostra: quando entrou, ultima etapa vista, ultima pergunta respondida, canal,
// dispositivo, status final (completo/abandonou).
function SessionsTable({ rows }: { rows: SessionDetail[] }) {
  function fmtDate(iso: string): string {
    try {
      const d = new Date(iso);
      const dia = String(d.getDate()).padStart(2, "0");
      const mes = String(d.getMonth() + 1).padStart(2, "0");
      const hora = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${dia}/${mes} ${hora}:${min}`;
    } catch {
      return iso.slice(0, 16);
    }
  }
  function fmtDuration(start: string, end: string): string {
    try {
      const ms = new Date(end).getTime() - new Date(start).getTime();
      if (ms < 1000) return "<1s";
      const s = Math.floor(ms / 1000);
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}min`;
      return `${Math.floor(m / 60)}h${m % 60}min`;
    } catch {
      return "—";
    }
  }
  function statusBadge(s: SessionDetail): { text: string; cls: string } {
    if (s.completedSubmit) return { text: "✓ Submeteu", cls: "bg-[#F0FFF4] text-[#27AE60]" };
    if (s.completedWhatsapp) return { text: "→ WhatsApp", cls: "bg-[#FFF5EB] text-[#E8740E]" };
    if (s.lastStep != null) return { text: `Parou Etapa ${s.lastStep}`, cls: "bg-[#FFF5F5] text-[#E74C3C]" };
    return { text: "So visitou", cls: "bg-[#F5F5F7] text-[#86868B]" };
  }
  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[#86868B] border-b border-[#D2D2D7]">
            <th className="px-2 sm:px-3 py-2 font-medium">Quando</th>
            <th className="px-2 sm:px-3 py-2 font-medium hidden sm:table-cell">Duracao</th>
            <th className="px-2 sm:px-3 py-2 font-medium">Status</th>
            <th className="px-2 sm:px-3 py-2 font-medium hidden md:table-cell">Ultima pergunta</th>
            <th className="px-2 sm:px-3 py-2 font-medium">Canal</th>
            <th className="px-2 sm:px-3 py-2 font-medium hidden sm:table-cell">Dispositivo</th>
            <th className="px-2 sm:px-3 py-2 font-medium text-right hidden md:table-cell">Eventos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const badge = statusBadge(s);
            return (
              <tr key={s.sessionId} className="border-b border-[#F5F5F7] hover:bg-[#FFF5EB]/30">
                <td className="px-2 sm:px-3 py-2 text-[#1D1D1F] whitespace-nowrap">{fmtDate(s.startedAt)}</td>
                <td className="px-2 sm:px-3 py-2 text-[#6E6E73] hidden sm:table-cell">{fmtDuration(s.startedAt, s.lastEventAt)}</td>
                <td className="px-2 sm:px-3 py-2">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badge.cls}`}>
                    {badge.text}
                  </span>
                </td>
                <td className="px-2 sm:px-3 py-2 text-[#6E6E73] hidden md:table-cell truncate max-w-[140px]">
                  {s.lastQuestion || "—"}
                </td>
                <td className="px-2 sm:px-3 py-2 text-[#6E6E73] truncate max-w-[100px]">
                  {s.utmSource || "(direto)"}
                </td>
                <td className="px-2 sm:px-3 py-2 text-[#6E6E73] hidden sm:table-cell">
                  {s.deviceType ? (DEVICE_LABELS[s.deviceType] || s.deviceType) : "—"}
                </td>
                <td className="px-2 sm:px-3 py-2 text-right text-[#86868B] hidden md:table-cell">{s.eventCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KPICard({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-4 border shadow-sm ${
        accent
          ? "bg-[#FFF5EB] border-[#E8740E]/20"
          : "bg-white border-[#D2D2D7]"
      }`}
    >
      <p className="text-[11px] text-[#86868B] font-medium uppercase tracking-wide">
        {label}
      </p>
      <p
        className={`text-2xl font-bold mt-1 ${
          accent ? "text-[#E8740E]" : "text-[#1D1D1F]"
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-[#86868B] mt-0.5">{sub}</p>
      )}
    </div>
  );
}
