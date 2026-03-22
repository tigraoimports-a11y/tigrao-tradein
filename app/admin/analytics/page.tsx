"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface FunnelStep {
  step: number;
  views: number;
  completes: number;
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

interface AnalyticsData {
  totalSessions: number;
  whatsappCount: number;
  exitCount: number;
  cotarOutroCount: number;
  funnel: FunnelStep[];
  questionBreakdown: QuestionBreakdown[];
  daily: DailyData[];
  conversionRate: string;
}

const STEP_LABELS: Record<number, string> = {
  1: "Seu Aparelho",
  2: "Aparelho Novo",
  3: "Seus Dados",
  4: "Cotacao",
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
  const { password } = useAdmin();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<"7d" | "30d" | "all">("7d");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics?range=${range}`, {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [password, range]);

  useEffect(() => {
    if (password) fetchData();
  }, [password, range, fetchData]);

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

  const maxViews = Math.max(...data.funnel.map((f) => f.views), 1);

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Sessoes" value={data.totalSessions} />
        <KPICard
          label="WhatsApp"
          value={data.whatsappCount}
          accent
        />
        <KPICard label="Saidas" value={data.exitCount} />
        <KPICard
          label="Conversao"
          value={`${data.conversionRate}%`}
          accent
        />
      </div>

      {/* Funnel */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
        <h2 className="text-base font-semibold text-[#1D1D1F] mb-4">
          Funil de Conversao
        </h2>
        <div className="space-y-3">
          {data.funnel.map((f, idx) => {
            const pct = maxViews > 0 ? (f.views / maxViews) * 100 : 0;
            const completePct =
              f.views > 0 ? ((f.completes / f.views) * 100).toFixed(0) : "0";
            const nextStep = data.funnel[idx + 1];
            const dropoff =
              nextStep && f.views > 0
                ? (
                    ((f.views - nextStep.views) / f.views) *
                    100
                  ).toFixed(0)
                : null;

            return (
              <div key={f.step}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-[#1D1D1F]">
                    Etapa {f.step}: {STEP_LABELS[f.step] || `Step ${f.step}`}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-[#86868B]">
                    <span>
                      {f.views} sessoes
                    </span>
                    <span className="text-[#2ECC71] font-medium">
                      {completePct}% completaram
                    </span>
                  </div>
                </div>
                <div className="h-8 bg-[#F5F5F7] rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg transition-all duration-500"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor:
                        f.step === 4 ? "#2ECC71" : "#E8740E",
                      opacity: 0.8 + (f.step / 4) * 0.2,
                    }}
                  />
                  <span className="absolute inset-0 flex items-center pl-3 text-xs font-semibold text-white mix-blend-difference">
                    {f.views}
                  </span>
                </div>
                {dropoff && (
                  <p className="text-[11px] text-[#E74C3C] mt-0.5 text-right">
                    {dropoff}% desistiram aqui
                  </p>
                )}
              </div>
            );
          })}
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

      {/* Question breakdown */}
      {data.questionBreakdown.length > 0 && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm">
          <h2 className="text-base font-semibold text-[#1D1D1F] mb-1">
            Perguntas Respondidas (Etapa 1)
          </h2>
          <p className="text-xs text-[#86868B] mb-4">
            Sessoes que responderam cada pergunta — queda indica onde desistem
          </p>
          <div className="space-y-2">
            {data.questionBreakdown
              .filter((q) => q.step === 1)
              .map((q) => {
                const stepViews =
                  data.funnel.find((f) => f.step === q.step)?.views || 1;
                const pct = ((q.sessions / stepViews) * 100).toFixed(0);
                return (
                  <div
                    key={`${q.step}:${q.question}`}
                    className="flex items-center gap-3"
                  >
                    <span className="text-xs text-[#6E6E73] w-28 shrink-0 truncate">
                      {QUESTION_LABELS[q.question] || q.question}
                    </span>
                    <div className="flex-1 h-5 bg-[#F5F5F7] rounded overflow-hidden">
                      <div
                        className="h-full bg-[#E8740E]/70 rounded transition-all duration-500"
                        style={{
                          width: `${Math.max(parseFloat(pct), 2)}%`,
                        }}
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
      )}

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

function KPICard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
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
    </div>
  );
}
