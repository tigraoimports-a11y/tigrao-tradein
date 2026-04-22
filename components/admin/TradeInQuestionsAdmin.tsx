"use client";
import React, { useEffect, useMemo, useState } from "react";
import { TradeInQuestion, TradeInQuestionOption, SeminovoOption, SeminovoVariante, SeminovoCategoria, SEMINOVO_CAT_LABELS, getSeminovoVariantes, consolidateSeminovos } from "@/lib/types";

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

const DEVICE_TABS = [
  { key: "iphone", label: "iPhone" },
  { key: "ipad", label: "iPad" },
  { key: "macbook", label: "MacBook" },
  { key: "watch", label: "Apple Watch" },
];

export default function TradeInQuestionsAdmin({ password }: Props) {
  const [questions, setQuestions] = useState<TradeInQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [deviceTab, setDeviceTab] = useState("iphone");

  function getHeaders() {
    return { "x-admin-password": password, "Content-Type": "application/json" };
  }

  function fetchQuestions(dt: string) {
    setLoading(true);
    setExpandedId(null);
    fetch(`/api/admin/tradein-perguntas?device_type=${dt}`, { headers: getHeaders() })
      .then(r => r.json())
      .then(json => {
        if (json.data && json.data.length > 0) {
          setQuestions(json.data);
        } else {
          // Fallback: buscar perguntas padrão (hardcoded) e gerar IDs fake
          return fetch(`/api/tradein-perguntas?device_type=${dt}`)
            .then(r => r.json())
            .then(json2 => {
              const qs = (json2.data || []).map((q: TradeInQuestion, i: number) => ({
                ...q,
                id: q.id || `fallback-${dt}-${i}`,
              }));
              setQuestions(qs);
              if (qs.length > 0) {
                setMsg("Perguntas padrao carregadas. Edite e salve pra gravar no banco.");
                setTimeout(() => setMsg(""), 4000);
              }
            });
        }
      })
      .catch(err => setMsg("Erro: " + String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    fetchQuestions(deviceTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceTab]);

  async function handleSave(q: TradeInQuestion) {
    setSaving(q.id);
    try {
      // Se o ID parece ser do fallback (não é UUID válido), criar no banco via POST
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.id);
      const method = isUUID ? "PUT" : "POST";
      const body = isUUID
        ? { id: q.id, titulo: q.titulo, opcoes: q.opcoes, config: q.config, ativo: q.ativo }
        : { slug: q.slug, titulo: q.titulo, tipo: q.tipo, opcoes: q.opcoes, config: q.config, ativo: q.ativo, ordem: q.ordem, device_type: deviceTab };
      const res = await fetch("/api/admin/tradein-perguntas", {
        method,
        headers: getHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        // Se criou no banco, atualizar o ID local com o UUID real
        if (!isUUID && json.data?.id) {
          setQuestions(prev => prev.map(p => p.id === q.id ? { ...p, id: json.data.id } : p));
        }
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
      {/* Device type tabs */}
      <div className="flex gap-2 flex-wrap items-center">
        {DEVICE_TABS.map(t => (
          <button key={t.key} onClick={() => setDeviceTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${deviceTab === t.key ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#1D1D1F] hover:border-[#E8740E]"}`}>
            {t.label}
          </button>
        ))}
        {questions.length <= 1 && (
          <button
            onClick={async () => {
              setSaving("seed");
              try {
                // Buscar perguntas padrão do fallback
                const res = await fetch(`/api/tradein-perguntas?device_type=${deviceTab}`);
                const json = await res.json();
                const defaults = json.data || [];
                if (defaults.length === 0) { setMsg("Nenhuma pergunta padrao encontrada."); setSaving(null); return; }
                // Buscar as que JÁ existem no banco (com UUID real)
                const dbSlugs = new Set(questions.filter(q => /^[0-9a-f]{8}-/i.test(q.id)).map(q => q.slug));
                let inserted = 0;
                for (const q of defaults) {
                  if (dbSlugs.has(q.slug)) continue; // já existe no banco
                  const body = { slug: `${q.slug}_${deviceTab}`, titulo: q.titulo, tipo: q.tipo, opcoes: q.opcoes, config: q.config, ativo: q.ativo, ordem: q.ordem, device_type: deviceTab };
                  await fetch("/api/admin/tradein-perguntas", { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
                  inserted++;
                }
                setMsg(`${inserted} perguntas padrao carregadas no banco!`);
                setTimeout(() => setMsg(""), 3000);
                fetchQuestions(deviceTab);
              } catch { setMsg("Erro ao carregar perguntas padrao"); }
              setSaving(null);
            }}
            disabled={saving === "seed"}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 border border-blue-300 hover:bg-blue-50 transition-colors disabled:opacity-50"
          >
            {saving === "seed" ? "Carregando..." : "⚡ Carregar perguntas padrao"}
          </button>
        )}
      </div>
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

      {/* deviceTab drives which seminovo category is shown in "Modelos Seminovo". */}
      <TradeInConfigAdmin password={password} deviceTab={deviceTab} />

      <div className="border-t border-[#E5E5EA] my-6" />

      <div className="flex items-center justify-between px-1 mb-2">
        <div className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">
          Perguntas de Avaliação do Aparelho
        </div>
        <button
          onClick={async () => {
            const titulo = prompt("Titulo da nova pergunta:");
            if (!titulo) return;
            const tipo = prompt("Tipo (yesno, selection, numeric, multiselect, conditional_date):", "yesno");
            if (!tipo) return;
            const slug = titulo.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 30);
            const ordem = questions.length + 1;
            try {
              const res = await fetch("/api/admin/tradein-perguntas", {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({ slug, titulo, tipo, opcoes: tipo === "yesno" ? [{ value: "yes", label: "Sim", discount: 0 }, { value: "no", label: "Nao", discount: 0 }] : [], ordem, ativo: true, config: {}, device_type: deviceTab }),
              });
              const json = await res.json();
              if (json.ok && json.data) {
                setQuestions(prev => [...prev, json.data]);
                setMsg("Pergunta criada! Clique nela pra editar opcoes e descontos.");
                setTimeout(() => setMsg(""), 4000);
              } else {
                setMsg("Erro: " + (json.error || "falha ao criar"));
              }
            } catch { setMsg("Erro de rede ao criar pergunta"); }
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors"
        >
          + Nova Pergunta
        </button>
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
              <div className="flex flex-col gap-0" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => handleReorder(idx, "up")}
                  disabled={idx === 0}
                  className="w-7 h-7 flex items-center justify-center rounded-t-lg text-sm font-bold text-[#86868B] hover:text-[#E8740E] hover:bg-[#FFF5EB] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleReorder(idx, "down")}
                  disabled={idx === questions.length - 1}
                  className="w-7 h-7 flex items-center justify-center rounded-b-lg text-sm font-bold text-[#86868B] hover:text-[#E8740E] hover:bg-[#FFF5EB] disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
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

              {/* Delete button */}
              <div onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={async () => {
                    if (!confirm(`Excluir pergunta "${q.titulo}"?`)) return;
                    const isUUID = /^[0-9a-f]{8}-/i.test(q.id);
                    if (isUUID) {
                      try {
                        await fetch("/api/admin/tradein-perguntas", { method: "DELETE", headers: getHeaders(), body: JSON.stringify({ id: q.id }) });
                      } catch { /* ignore */ }
                    }
                    setQuestions(prev => prev.filter(p => p.id !== q.id));
                    setMsg("Pergunta excluida!");
                    setTimeout(() => setMsg(""), 2000);
                  }}
                  className="text-[#D2D2D7] hover:text-red-500 text-xs transition-colors"
                  title="Excluir pergunta"
                >🗑️</button>
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
                          <button onClick={() => {
                            const thresholds = [...(q.config.thresholds as Array<{ below: number; discount: number }>)];
                            thresholds.splice(ti, 1);
                            updateConfig(q.id, "thresholds", thresholds);
                          }} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        </div>
                      ))}
                      <button onClick={() => {
                        const current = Array.isArray((q.config as Record<string, unknown>).thresholds) ? [...(q.config.thresholds as Array<{ below: number; discount: number }>)] : [];
                        current.push({ below: 80, discount: -200 });
                        updateConfig(q.id, "thresholds", current);
                      }} className="text-xs font-semibold text-[#E8740E] hover:underline mt-1">+ Adicionar threshold</button>
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
  { modelo: "iPhone 15 Pro", ativo: true, categoria: "iphone", variantes: [{ storage: "128GB", ativo: true }, { storage: "256GB", ativo: true }] },
  { modelo: "iPhone 15 Pro Max", ativo: true, categoria: "iphone", variantes: [{ storage: "256GB", ativo: true }, { storage: "512GB", ativo: true }] },
  { modelo: "iPhone 16 Pro", ativo: true, categoria: "iphone", variantes: [{ storage: "128GB", ativo: true }, { storage: "256GB", ativo: true }] },
  { modelo: "iPhone 16 Pro Max", ativo: true, categoria: "iphone", variantes: [{ storage: "256GB", ativo: true }] },
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

function TradeInConfigAdmin({ password, deviceTab }: { password: string; deviceTab: string }) {
  // Mantemos a lista inteira em memória — o banco persiste tudo num único
  // JSONB, então precisa voltar completa no PUT. A filtragem é por render.
  const [seminovos, setSeminovos] = useState<SeminovoOption[]>(DEFAULT_SEMINOVOS);
  const [labels, setLabels] = useState<Record<string, string>>(DEFAULT_LABELS);
  const [origens, setOrigens] = useState<string[]>(DEFAULT_ORIGENS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [newOrigem, setNewOrigem] = useState("");
  const [newSemiModelo, setNewSemiModelo] = useState("");

  // Itens sem categoria (pré-migration) caem em "iphone" para compatibilidade.
  const categoriaAtiva: SeminovoCategoria = (deviceTab as SeminovoCategoria) in SEMINOVO_CAT_LABELS ? (deviceTab as SeminovoCategoria) : "iphone";

  // Índices reais na lista completa — toggles/edições precisam do índice certo
  // mesmo com a UI filtrada.
  const visibleIndices = useMemo(
    () => seminovos.reduce<number[]>((acc, s, i) => {
      if ((s.categoria || "iphone") === categoriaAtiva) acc.push(i);
      return acc;
    }, []),
    [seminovos, categoriaAtiva]
  );

  const countCategoriaAtiva = useMemo(
    () => seminovos.filter((s) => (s.categoria || "iphone") === categoriaAtiva && s.ativo).length,
    [seminovos, categoriaAtiva]
  );

  function getHeaders() {
    return { "x-admin-password": password, "Content-Type": "application/json" };
  }

  useEffect(() => {
    fetch("/api/tradein-config")
      .then((r) => r.json())
      .then((json) => {
        const d = json.data;
        if (d) {
          if (Array.isArray(d.seminovos) && d.seminovos.length > 0) {
            // Backfill: itens antigos sem categoria caem em "iphone"; legado
            // sem `variantes` é convertido via helper. Não mexemos no banco —
            // só no estado local; a forma canônica será escrita no próximo save.
            const normalized: SeminovoOption[] = d.seminovos.map((s: SeminovoOption) => ({
              modelo: s.modelo,
              ativo: s.ativo !== false,
              categoria: (s.categoria as SeminovoCategoria) || "iphone",
              variantes: getSeminovoVariantes(s),
            }));
            setSeminovos(normalized);
          }
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
      // Consolida duplicatas antes de persistir. Operador pode ter criado
      // "iPhone 15 Pro" duas vezes editando categorias diferentes — aqui colapsa
      // em uma única entrada com todas variantes.
      const consolidated = consolidateSeminovos(seminovos);
      // Reflete a consolidação no state pra UI já mostrar o resultado final.
      if (consolidated.length !== seminovos.length) setSeminovos(consolidated);
      const res = await fetch("/api/admin/tradein-config", {
        method: "PUT",
        headers: getHeaders(),
        body: JSON.stringify({ seminovos: consolidated, labels, origens }),
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

      {/* === SEMINOVOS ===
          O botão mostra "(n)" = nº de modelos ativos NA CATEGORIA da aba atual
          (antes mostrava o total geral, o que causava confusão). */}
      {sectionBtn("seminovos", `Modelos Seminovo — ${SEMINOVO_CAT_LABELS[categoriaAtiva].label}`, countCategoriaAtiva)}
      {expandedSection === "seminovos" && (
        <div className="border border-[#D2D2D7] rounded-xl bg-white p-4 space-y-3">
          <div className="text-[11px] text-[#86868B] bg-[#F5F5F7] rounded-lg px-3 py-2 leading-relaxed">
            <strong>{SEMINOVO_CAT_LABELS[categoriaAtiva].label}:</strong> apenas os modelos seminovos desta categoria aparecem aqui.
            Troque a aba acima para ver/editar outras categorias.
          </div>
          {visibleIndices.length === 0 && (
            <div className="text-center text-sm text-[#86868B] py-4 italic">
              Nenhum modelo seminovo cadastrado para {SEMINOVO_CAT_LABELS[categoriaAtiva].label}.
            </div>
          )}
          {visibleIndices.map((si) => {
            const s = seminovos[si];
            const variantes = s.variantes || [];
            const updateVariante = (vi: number, patch: Partial<SeminovoVariante>) => {
              const arr = [...seminovos];
              const v = [...(arr[si].variantes || [])];
              v[vi] = { ...v[vi], ...patch };
              arr[si] = { ...arr[si], variantes: v };
              setSeminovos(arr);
            };
            const removeVariante = (vi: number) => {
              const arr = [...seminovos];
              arr[si] = { ...arr[si], variantes: (arr[si].variantes || []).filter((_, i) => i !== vi) };
              setSeminovos(arr);
            };
            const addVariante = () => {
              const arr = [...seminovos];
              arr[si] = { ...arr[si], variantes: [...(arr[si].variantes || []), { storage: "", ativo: true }] };
              setSeminovos(arr);
            };
            return (
            <div key={si} className={`rounded-lg border border-[#E5E5EA] p-3 space-y-3 ${!s.ativo ? "opacity-50" : ""}`}>
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
                  title={s.ativo ? "Modelo visível ao cliente" : "Modelo oculto"}
                  className={`w-10 h-5 rounded-full transition-colors relative ${s.ativo ? "bg-[#E8740E]" : "bg-[#D2D2D7]"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${s.ativo ? "left-5" : "left-0.5"}`} />
                </button>
                <button
                  onClick={() => setSeminovos(seminovos.filter((_, i) => i !== si))}
                  className="text-red-400 hover:text-red-600 text-sm px-1"
                  title="Remover modelo"
                >
                  ✕
                </button>
              </div>

              {/* Variantes: uma linha por storage. Preço definido → orçamento
                  automático no cliente; sem preço → fallback WhatsApp manual. */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center px-1 text-[10px] font-semibold uppercase tracking-wider text-[#86868B]">
                  <span>Storage</span>
                  <span className="text-right pr-1">Preço (R$)</span>
                  <span className="text-center w-10">Ativo</span>
                  <span className="w-4" />
                </div>
                {variantes.length === 0 && (
                  <div className="text-[11px] italic text-[#86868B] px-1 py-1">
                    Sem variantes. Adicione ao menos uma abaixo.
                  </div>
                )}
                {variantes.map((v, vi) => (
                  <div key={vi} className={`grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center ${v.ativo === false ? "opacity-50" : ""}`}>
                    <input
                      value={v.storage}
                      onChange={(e) => updateVariante(vi, { storage: e.target.value })}
                      placeholder="Ex: 256GB"
                      className="px-2 py-1 rounded border border-[#D2D2D7] text-xs focus:outline-none focus:border-[#E8740E]"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={typeof v.preco === "number" ? String(v.preco) : ""}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const num = raw === "" ? undefined : Number(raw);
                        updateVariante(vi, { preco: Number.isFinite(num as number) ? (num as number) : undefined });
                      }}
                      placeholder="—"
                      className="w-24 px-2 py-1 rounded border border-[#D2D2D7] text-xs text-right focus:outline-none focus:border-[#E8740E]"
                    />
                    <button
                      onClick={() => updateVariante(vi, { ativo: v.ativo === false })}
                      title={v.ativo !== false ? "Variante visível" : "Variante oculta"}
                      className={`w-10 h-5 rounded-full transition-colors relative ${v.ativo !== false ? "bg-[#E8740E]" : "bg-[#D2D2D7]"}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${v.ativo !== false ? "left-5" : "left-0.5"}`} />
                    </button>
                    <button
                      onClick={() => removeVariante(vi)}
                      className="text-[#86868B] hover:text-red-500 text-xs w-4"
                      title="Remover variante"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  onClick={addVariante}
                  className="text-[11px] font-semibold text-[#E8740E] hover:underline mt-1"
                >
                  + Adicionar variante
                </button>
                <p className="text-[10px] text-[#86868B] leading-relaxed pt-1">
                  Com preço → orçamento automático. Sem preço → cliente é levado ao WhatsApp pra cotação manual.
                </p>
              </div>
            </div>
            );
          })}
          <div className="flex gap-2">
            <input
              value={newSemiModelo}
              onChange={(e) => setNewSemiModelo(e.target.value)}
              placeholder={`Ex: ${categoriaAtiva === "iphone" ? "iPhone 17 Pro" : categoriaAtiva === "ipad" ? "iPad Pro M4" : categoriaAtiva === "macbook" ? "MacBook Air M3" : "Apple Watch Series 10"}`}
              className="flex-1 px-3 py-2 rounded-lg border border-dashed border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
            />
            <button
              onClick={() => {
                if (newSemiModelo.trim()) {
                  // Novo item herda a categoria da aba aberta e vem com duas
                  // variantes vazias — operador preenche storage/preço inline.
                  setSeminovos([...seminovos, {
                    modelo: newSemiModelo.trim(),
                    ativo: true,
                    categoria: categoriaAtiva,
                    variantes: [
                      { storage: "128GB", ativo: true },
                      { storage: "256GB", ativo: true },
                    ],
                  }]);
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
