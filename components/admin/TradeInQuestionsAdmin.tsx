"use client";
import React, { useEffect, useState } from "react";
import { TradeInQuestion, TradeInQuestionOption, SeminovoOption } from "@/lib/types";

interface Props {
  password: string;
}

const TIPO_LABELS: Record<string, string> = {
  yesno: "Sim/Não",
  selection: "Seleção",
  numeric: "Numérico",
  conditional_date: "Data Condicional",
  multiselect: "Multi-seleção",
};

const TIPO_COLORS: Record<string, string> = {
  yesno: "bg-blue-100 text-blue-700",
  selection: "bg-purple-100 text-purple-700",
  numeric: "bg-green-100 text-green-700",
  conditional_date: "bg-yellow-100 text-yellow-700",
  multiselect: "bg-orange-100 text-orange-700",
};

export default function TradeInQuestionsAdmin({ password }: Props) {
  const [questions, setQuestions] = useState<TradeInQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  function getHeaders() {
    return { "x-admin-password": password, "Content-Type": "application/json" };
  }

  useEffect(() => {
    // Fetch from admin API to include inactive questions
    fetch("/api/admin/tradein-perguntas?device_type=iphone", { headers: getHeaders() })
      .then(r => r.json())
      .then(json => {
        setQuestions(json.data || []);
        if (!json.data || json.data.length === 0) {
          // Fallback to public API
          return fetch("/api/tradein-perguntas?device_type=iphone")
            .then(r => r.json())
            .then(json2 => {
              setQuestions(json2.data || []);
              if (!json2.data || json2.data.length === 0) {
                setMsg("Nenhuma pergunta encontrada na API.");
              }
            });
        }
      })
      .catch(err => setMsg("Erro: " + String(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave(q: TradeInQuestion) {
    setSaving(q.id);
    try {
      const res = await fetch("/api/admin/tradein-perguntas", {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({
          id: q.id,
          titulo: q.titulo,
          opcoes: q.opcoes,
          config: q.config,
          ativo: q.ativo,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg(`"${q.titulo}" salvo!`);
        setTimeout(() => setMsg(""), 3000);
      } else {
        setMsg("Erro: " + json.error);
      }
    } catch {
      setMsg("Erro de rede ao salvar");
    }
    setSaving(null);
  }

  async function handleToggle(q: TradeInQuestion) {
    const updated = { ...q, ativo: !q.ativo };
    setQuestions((prev) => prev.map((p) => (p.id === q.id ? updated : p)));
    await handleSave(updated);
  }

  async function handleReorder(index: number, direction: "up" | "down") {
    const newList = [...questions];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newList.length) return;

    [newList[index], newList[swapIdx]] = [newList[swapIdx], newList[index]];
    const reorderItems = newList.map((q, i) => ({ id: q.id, ordem: i + 1 }));
    setQuestions(newList.map((q, i) => ({ ...q, ordem: i + 1 })));

    try {
      await fetch("/api/admin/tradein-perguntas", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ action: "reorder", items: reorderItems }),
      });
    } catch {
      setMsg("Erro ao reordenar");
    }
  }

  function updateQuestion(id: string, updates: Partial<TradeInQuestion>) {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...updates } : q)));
  }

  function updateOption(qId: string, optIdx: number, updates: Partial<TradeInQuestionOption>) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        const newOpcoes = [...q.opcoes];
        newOpcoes[optIdx] = { ...newOpcoes[optIdx], ...updates };
        return { ...q, opcoes: newOpcoes };
      })
    );
  }

  function updateConfig(qId: string, key: string, value: unknown) {
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== qId) return q;
        return { ...q, config: { ...q.config, [key]: value } };
      })
    );
  }

  if (loading) return <div className="p-8 text-center text-[#86868B]">Carregando perguntas...</div>;

  if (questions.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-[#86868B] mb-4">Nenhuma pergunta cadastrada.</p>
        <p className="text-sm text-[#86868B]">Execute o SQL de seed no Supabase para carregar as perguntas padrão.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className="rounded-xl px-4 py-3 text-sm font-medium"
          style={{
            background: msg.includes("Erro") ? "#FFEBEE" : "#E8F5E9",
            border: `1px solid ${msg.includes("Erro") ? "#E74C3C" : "#2ECC71"}`,
            color: msg.includes("Erro") ? "#B71C1C" : "#1B5E20",
          }}
        >
          {msg}
        </div>
      )}

      <div className="text-xs text-[#86868B] px-1">
        Gerencie as perguntas do simulador de troca. Altere texto, opções, descontos e ordem. Desative perguntas que não quer exibir.
      </div>

      {/* === CONFIG SECTIONS === */}
      <TradeInConfigAdmin password={password} />

      <div className="border-t border-[#E5E5EA] my-6" />

      <div className="text-xs font-semibold text-[#86868B] uppercase tracking-wider px-1 mb-2">
        Perguntas de Avaliação do Aparelho
      </div>

      {questions.map((q, idx) => {
        const isExpanded = expandedId === q.id;
        return (
          <div
            key={q.id}
            className={`border rounded-xl overflow-hidden transition-all ${
              q.ativo ? "border-[#D2D2D7] bg-white" : "border-[#D2D2D7] bg-[#F5F5F7] opacity-60"
            }`}
          >
            {/* Header */}
            <div
              className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[#F5F5F7] transition-colors"
              onClick={() => setExpandedId(isExpanded ? null : q.id)}
            >
              {/* Reorder arrows */}
              <div className="flex flex-col gap-0.5" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleReorder(idx, "up")}
                  disabled={idx === 0}
                  className="text-[10px] text-[#86868B] hover:text-[#E8740E] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleReorder(idx, "down")}
                  disabled={idx === questions.length - 1}
                  className="text-[10px] text-[#86868B] hover:text-[#E8740E] disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ▼
                </button>
              </div>

              {/* Order number */}
              <span className="text-xs font-bold text-[#86868B] w-6 text-center">{q.ordem}</span>

              {/* Title */}
              <span className="flex-1 font-medium text-sm text-[#1D1D1F]">{q.titulo}</span>

              {/* Type badge */}
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${TIPO_COLORS[q.tipo] || "bg-gray-100 text-gray-700"}`}>
                {TIPO_LABELS[q.tipo] || q.tipo}
              </span>

              {/* Toggle */}
              <div onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleToggle(q)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${q.ativo ? "bg-[#E8740E]" : "bg-[#D2D2D7]"}`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
                      q.ativo ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>

              {/* Expand icon */}
              <span className="text-[#86868B] text-xs">{isExpanded ? "▾" : "▸"}</span>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div className="px-4 pb-4 border-t border-[#F5F5F7] space-y-4">
                {/* Title edit */}
                <div className="pt-3">
                  <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Texto da pergunta</label>
                  <input
                    value={q.titulo}
                    onChange={(e) => updateQuestion(q.id, { titulo: e.target.value })}
                    className="w-full mt-1 px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                  />
                </div>

                {/* Options editor - for selection, yesno, and multiselect */}
                {(q.tipo === "selection" || q.tipo === "yesno" || q.tipo === "multiselect") && (
                  <div>
                    <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Opções de resposta</label>
                    <div className="mt-2 space-y-2">
                      {q.opcoes.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2 bg-[#F5F5F7] rounded-lg px-3 py-2">
                          <input
                            value={opt.label}
                            onChange={(e) => updateOption(q.id, oi, { label: e.target.value })}
                            className="flex-1 px-2 py-1 rounded border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                            placeholder="Label"
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[#86868B]">R$</span>
                            <input
                              type="number"
                              value={opt.discount}
                              onChange={(e) => updateOption(q.id, oi, { discount: Number(e.target.value) })}
                              className="w-20 px-2 py-1 rounded border border-[#D2D2D7] text-sm text-center focus:outline-none focus:border-[#E8740E]"
                            />
                          </div>
                          {opt.reject && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">Rejeita</span>
                          )}
                          <label className="flex items-center gap-1 text-[10px] text-[#86868B]">
                            <input
                              type="checkbox"
                              checked={!!opt.reject}
                              onChange={(e) => updateOption(q.id, oi, { reject: e.target.checked })}
                              className="w-3 h-3 accent-red-500"
                            />
                            Rejeitar
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Numeric (battery) config */}
                {q.tipo === "numeric" && (
                  <div>
                    <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Thresholds de desconto</label>
                    <div className="mt-2 space-y-2">
                      {(Array.isArray((q.config as Record<string, unknown>).thresholds) ? (q.config.thresholds as Array<{ below: number; discount: number }>) : []).map((t, ti) => (
                        <div key={ti} className="flex items-center gap-2 bg-[#F5F5F7] rounded-lg px-3 py-2">
                          <span className="text-xs text-[#86868B]">Abaixo de</span>
                          <input
                            type="number"
                            value={t.below}
                            onChange={(e) => {
                              const thresholds = [...(q.config.thresholds as Array<{ below: number; discount: number }>)];
                              thresholds[ti] = { ...thresholds[ti], below: Number(e.target.value) };
                              updateConfig(q.id, "thresholds", thresholds);
                            }}
                            className="w-16 px-2 py-1 rounded border border-[#D2D2D7] text-sm text-center focus:outline-none focus:border-[#E8740E]"
                          />
                          <span className="text-xs text-[#86868B]">% → desconto R$</span>
                          <input
                            type="number"
                            value={t.discount}
                            onChange={(e) => {
                              const thresholds = [...(q.config.thresholds as Array<{ below: number; discount: number }>)];
                              thresholds[ti] = { ...thresholds[ti], discount: Number(e.target.value) };
                              updateConfig(q.id, "thresholds", thresholds);
                            }}
                            className="w-20 px-2 py-1 rounded border border-[#D2D2D7] text-sm text-center focus:outline-none focus:border-[#E8740E]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conditional date (warranty) config */}
                {q.tipo === "conditional_date" && (
                  <div>
                    <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Bônus de garantia (% do valor base)</label>
                    <div className="mt-2 space-y-2">
                      {["ate3m", "de3a6m", "acima6m"].map((key) => {
                        const bonuses = (q.config.bonuses || {}) as Record<string, number>;
                        const labels: Record<string, string> = { ate3m: "Até 3 meses", de3a6m: "3 a 6 meses", acima6m: "Acima de 6 meses" };
                        return (
                          <div key={key} className="flex items-center gap-2 bg-[#F5F5F7] rounded-lg px-3 py-2">
                            <span className="text-xs text-[#86868B] w-32">{labels[key]}</span>
                            <input
                              type="number"
                              step="0.01"
                              value={bonuses[key] || 0}
                              onChange={(e) => {
                                const newBonuses = { ...bonuses, [key]: Number(e.target.value) };
                                updateConfig(q.id, "bonuses", newBonuses);
                              }}
                              className="w-20 px-2 py-1 rounded border border-[#D2D2D7] text-sm text-center focus:outline-none focus:border-[#E8740E]"
                            />
                            <span className="text-xs text-[#86868B]">({((bonuses[key] || 0) * 100).toFixed(0)}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Save button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => handleSave(q)}
                    disabled={saving === q.id}
                    className="px-6 py-2 rounded-xl text-sm font-semibold text-white bg-[#E8740E] hover:bg-[#D06A0D] transition-colors disabled:opacity-50"
                  >
                    {saving === q.id ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   TradeInConfigAdmin — Seminovos, Labels, Origens
   ============================================================ */

const DEFAULT_LABELS: Record<string, string> = {
  step1_titulo: "Qual é o modelo do seu usado?",
  step2_titulo: "Voce deseja comprar um...",
  lacrado_label: "Lacrado",
  lacrado_desc: "Novo, na caixa",
  seminovo_label: "Seminovo",
  seminovo_desc: "Revisado, com garantia",
  seminovo_info: "Aparelhos revisados e em excelente estado. O valor e condicoes serao informados por WhatsApp.",
  step3_nome_label: "Seu nome",
  step3_nome_placeholder: "Como podemos te chamar?",
  step3_whatsapp_label: "WhatsApp com DDD",
  step3_whatsapp_placeholder: "(21) 99999-9999",
  step3_instagram_label: "Instagram (opcional)",
  step3_instagram_placeholder: "@seuperfil",
  step3_origem_label: "Como nos encontrou? (opcional)",
};

const DEFAULT_SEMINOVOS: SeminovoOption[] = [
  { modelo: "iPhone 15 Pro", storages: ["128GB", "256GB"], ativo: true },
  { modelo: "iPhone 15 Pro Max", storages: ["256GB", "512GB"], ativo: true },
  { modelo: "iPhone 16 Pro", storages: ["128GB", "256GB"], ativo: true },
  { modelo: "iPhone 16 Pro Max", storages: ["256GB"], ativo: true },
];

const DEFAULT_ORIGENS = ["Anúncio", "Story", "Direct", "WhatsApp", "Indicação", "Já sou cliente"];

const LABEL_GROUPS: { title: string; keys: { key: string; label: string }[] }[] = [
  {
    title: "Etapa 1 — Aparelho Usado",
    keys: [{ key: "step1_titulo", label: "Título da etapa" }],
  },
  {
    title: "Etapa 2 — Aparelho Novo",
    keys: [
      { key: "step2_titulo", label: "Título da etapa" },
      { key: "lacrado_label", label: "Label 'Lacrado'" },
      { key: "lacrado_desc", label: "Descrição 'Lacrado'" },
      { key: "seminovo_label", label: "Label 'Seminovo'" },
      { key: "seminovo_desc", label: "Descrição 'Seminovo'" },
      { key: "seminovo_info", label: "Info box Seminovo" },
    ],
  },
  {
    title: "Etapa 3 — Dados de Contato",
    keys: [
      { key: "step3_nome_label", label: "Label Nome" },
      { key: "step3_nome_placeholder", label: "Placeholder Nome" },
      { key: "step3_whatsapp_label", label: "Label WhatsApp" },
      { key: "step3_whatsapp_placeholder", label: "Placeholder WhatsApp" },
      { key: "step3_instagram_label", label: "Label Instagram" },
      { key: "step3_instagram_placeholder", label: "Placeholder Instagram" },
      { key: "step3_origem_label", label: "Label Origem" },
    ],
  },
];

function TradeInConfigAdmin({ password }: { password: string }) {
  const [seminovos, setSeminovos] = useState<SeminovoOption[]>(DEFAULT_SEMINOVOS);
  const [labels, setLabels] = useState<Record<string, string>>(DEFAULT_LABELS);
  const [origens, setOrigens] = useState<string[]>(DEFAULT_ORIGENS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [newOrigem, setNewOrigem] = useState("");
  const [newSemiModelo, setNewSemiModelo] = useState("");
  const [newSemiStorage, setNewSemiStorage] = useState("");

  function getHeaders() {
    return { "x-admin-password": password, "Content-Type": "application/json" };
  }

  useEffect(() => {
    fetch("/api/tradein-config")
      .then((r) => r.json())
      .then((json) => {
        const d = json.data;
        if (d) {
          if (Array.isArray(d.seminovos) && d.seminovos.length > 0) setSeminovos(d.seminovos);
          if (d.labels && Object.keys(d.labels).length > 0) setLabels({ ...DEFAULT_LABELS, ...d.labels });
          if (Array.isArray(d.origens) && d.origens.length > 0) setOrigens(d.origens);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tradein-config", {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ seminovos, labels, origens }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg("Configuração salva!");
        setTimeout(() => setMsg(""), 3000);
      } else {
        setMsg("Erro: " + (json.error || "Falha ao salvar"));
      }
    } catch {
      setMsg("Erro de rede ao salvar");
    }
    setSaving(false);
  }

  function showMsg() {
    if (!msg) return null;
    return (
      <div
        className="rounded-xl px-4 py-3 text-sm font-medium"
        style={{
          background: msg.includes("Erro") ? "#FFEBEE" : "#E8F5E9",
          border: `1px solid ${msg.includes("Erro") ? "#E74C3C" : "#2ECC71"}`,
          color: msg.includes("Erro") ? "#B71C1C" : "#1B5E20",
        }}
      >
        {msg}
      </div>
    );
  }

  if (loading) return <div className="text-center text-sm text-[#86868B] py-4">Carregando configuração...</div>;

  const sectionBtn = (id: string, title: string, count?: number) => (
    <button
      onClick={() => setExpandedSection(expandedSection === id ? null : id)}
      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-[#D2D2D7] bg-white hover:bg-[#F5F5F7] transition-colors"
    >
      <span className="font-medium text-sm text-[#1D1D1F]">
        {title}
        {count !== undefined && (
          <span className="ml-2 text-xs text-[#86868B]">({count})</span>
        )}
      </span>
      <span className="text-[#86868B] text-xs">{expandedSection === id ? "▾" : "▸"}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-[#86868B] uppercase tracking-wider px-1">
        Configuração do Formulário
      </div>

      {showMsg()}

      {/* === SEMINOVOS === */}
      {sectionBtn("seminovos", "Modelos Seminovo", seminovos.filter((s) => s.ativo).length)}
      {expandedSection === "seminovos" && (
        <div className="border border-[#D2D2D7] rounded-xl bg-white p-4 space-y-3">
          {seminovos.map((s, si) => (
            <div key={si} className={`rounded-lg border border-[#E5E5EA] p-3 space-y-2 ${!s.ativo ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <input
                  value={s.modelo}
                  onChange={(e) => {
                    const arr = [...seminovos];
                    arr[si] = { ...arr[si], modelo: e.target.value };
                    setSeminovos(arr);
                  }}
                  className="flex-1 px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                  placeholder="Nome do modelo"
                />
                <button
                  onClick={() => {
                    const arr = [...seminovos];
                    arr[si] = { ...arr[si], ativo: !arr[si].ativo };
                    setSeminovos(arr);
                  }}
                  className={`w-10 h-5 rounded-full transition-colors relative ${s.ativo ? "bg-[#E8740E]" : "bg-[#D2D2D7]"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${s.ativo ? "left-5" : "left-0.5"}`} />
                </button>
                <button
                  onClick={() => setSeminovos(seminovos.filter((_, i) => i !== si))}
                  className="text-red-400 hover:text-red-600 text-sm px-1"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {s.storages.map((st, sti) => (
                  <span key={sti} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5F5F7] text-xs text-[#1D1D1F]">
                    {st}
                    <button
                      onClick={() => {
                        const arr = [...seminovos];
                        arr[si] = { ...arr[si], storages: arr[si].storages.filter((_, i) => i !== sti) };
                        setSeminovos(arr);
                      }}
                      className="text-[#86868B] hover:text-red-500 text-[10px]"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <div className="inline-flex items-center gap-1">
                  <input
                    value={si === seminovos.length - 1 ? newSemiStorage : ""}
                    onChange={(e) => setNewSemiStorage(e.target.value)}
                    onFocus={() => setNewSemiStorage("")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newSemiStorage.trim()) {
                        const arr = [...seminovos];
                        arr[si] = { ...arr[si], storages: [...arr[si].storages, newSemiStorage.trim()] };
                        setSeminovos(arr);
                        setNewSemiStorage("");
                      }
                    }}
                    placeholder="+ storage"
                    className="w-20 px-2 py-0.5 rounded border border-dashed border-[#D2D2D7] text-xs focus:outline-none focus:border-[#E8740E]"
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={newSemiModelo}
              onChange={(e) => setNewSemiModelo(e.target.value)}
              placeholder="Ex: iPhone 17 Pro"
              className="flex-1 px-3 py-2 rounded-lg border border-dashed border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
            />
            <button
              onClick={() => {
                if (newSemiModelo.trim()) {
                  setSeminovos([...seminovos, { modelo: newSemiModelo.trim(), storages: ["128GB", "256GB"], ativo: true }]);
                  setNewSemiModelo("");
                }
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[#E8740E] border border-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
            >
              + Adicionar
            </button>
          </div>
        </div>
      )}

      {/* === ORIGENS === */}
      {sectionBtn("origens", "Origens de Contato", origens.length)}
      {expandedSection === "origens" && (
        <div className="border border-[#D2D2D7] rounded-xl bg-white p-4 space-y-2">
          {origens.map((o, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                value={o}
                onChange={(e) => {
                  const arr = [...origens];
                  arr[oi] = e.target.value;
                  setOrigens(arr);
                }}
                className="flex-1 px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
              />
              <button
                onClick={() => setOrigens(origens.filter((_, i) => i !== oi))}
                className="text-red-400 hover:text-red-600 text-sm px-2"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <input
              value={newOrigem}
              onChange={(e) => setNewOrigem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newOrigem.trim()) {
                  setOrigens([...origens, newOrigem.trim()]);
                  setNewOrigem("");
                }
              }}
              placeholder="Nova origem..."
              className="flex-1 px-3 py-2 rounded-lg border border-dashed border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
            />
            <button
              onClick={() => {
                if (newOrigem.trim()) {
                  setOrigens([...origens, newOrigem.trim()]);
                  setNewOrigem("");
                }
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-[#E8740E] border border-[#E8740E] hover:bg-[#FFF5EB] transition-colors"
            >
              + Adicionar
            </button>
          </div>
        </div>
      )}

      {/* === LABELS === */}
      {sectionBtn("labels", "Textos do Formulário", Object.keys(labels).length)}
      {expandedSection === "labels" && (
        <div className="border border-[#D2D2D7] rounded-xl bg-white p-4 space-y-5">
          {LABEL_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-2">
                {group.title}
              </div>
              <div className="space-y-2">
                {group.keys.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-[11px] text-[#86868B] mb-0.5 block">{label}</label>
                    <input
                      value={labels[key] || ""}
                      onChange={(e) => setLabels({ ...labels, [key]: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 rounded-xl text-sm font-semibold text-white bg-[#E8740E] hover:bg-[#D06A0D] transition-colors disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar Configuração"}
        </button>
      </div>
    </div>
  );
}
