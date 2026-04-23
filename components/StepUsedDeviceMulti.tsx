"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import type { UsedDeviceValue, TradeInQuestion } from "@/lib/types";
import { corParaPT } from "@/lib/cor-pt";
import { getUniqueUsedModels, getUsedStoragesForModel, getUsedBaseValue } from "@/lib/sheets";
import {
  calculateAnyTradeInValue, getDiscountsForModel, formatBRL,
  type DeviceType, type ConditionData, type AnyConditionData, type ModelDiscounts,
} from "@/lib/calculations";

type MultiDeviceType = DeviceType | "watch";

interface StepUsedDeviceMultiProps {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  modelDiscounts?: Record<string, ModelDiscounts>;
  questionsConfig?: TradeInQuestion[] | null;
  deviceType: MultiDeviceType;
  onNext: (data: { usedModel: string; usedStorage: string; usedColor: string; condition: AnyConditionData; tradeInValue: number; deviceType: DeviceType; extraAnswers?: Record<string, unknown> }) => void;
  onTrackQuestion?: (step: number, question: string) => void;
}

// Slugs que ja sao renderizados pela UI hardcoded. Qualquer pergunta do
// questionsConfig cujo slug esteja fora dessa lista entra no bloco dinamico
// "Perguntas adicionais" no final — permite admin adicionar perguntas novas
// (ex: "Ciclos" pra MacBook, "Pulseira" pra Watch) via /admin/simulacoes sem
// precisar mexer no componente.
const HARDCODED_SLUGS = new Set([
  "battery", "hasDamage", "hasOriginalBox", "hasWarranty", "hasWearMarks",
  "partsReplaced", "peeling", "screenScratch", "sideScratch",
  "warrantyMonth", "wearMarks",
]);

// Formata uma resposta dinamica pra exibir no resumo/WhatsApp.
function formatExtraAnswer(q: TradeInQuestion, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (Array.isArray(value)) {
    const labels = value.map((v) => q.opcoes.find((o) => o.value === v)?.label || String(v));
    return labels.join(", ");
  }
  if (typeof value === "boolean") return value ? "Sim" : "Nao";
  const opt = q.opcoes.find((o) => o.value === value);
  return opt?.label || String(value);
}

// Helper to get question config by slug
function getQ(config: TradeInQuestion[] | null | undefined, slug: string): TradeInQuestion | undefined {
  return config?.find((q) => q.slug === slug && q.ativo !== false);
}
function getQTitle(config: TradeInQuestion[] | null | undefined, slug: string, fallback: string): string {
  return getQ(config, slug)?.titulo || fallback;
}
function getQOptions(config: TradeInQuestion[] | null | undefined, slug: string) {
  return getQ(config, slug)?.opcoes || [];
}
function isQActive(config: TradeInQuestion[] | null | undefined, slug: string): boolean {
  if (!config || config.length === 0) return true; // no config = use all defaults
  const q = config.find((q) => q.slug === slug);
  return q ? q.ativo : true; // not found = active by default
}

const MONTHS = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const DEVICE_LABELS: Record<MultiDeviceType, string> = {
  iphone: "iPhone",
  ipad: "iPad",
  macbook: "MacBook",
  watch: "Apple Watch",
};

function filterByDeviceType(values: UsedDeviceValue[], deviceType: MultiDeviceType): UsedDeviceValue[] {
  switch (deviceType) {
    case "iphone": return values.filter((v) => v.modelo.startsWith("iPhone"));
    case "ipad": return values.filter((v) => v.modelo.startsWith("iPad"));
    case "macbook": return values.filter((v) => v.modelo.startsWith("Mac"));
    case "watch": return values.filter((v) => v.modelo.startsWith("Apple Watch"));
    default: return values;
  }
}

function extractLines(models: string[], deviceType: MultiDeviceType): string[] {
  const s = new Set<string>();
  switch (deviceType) {
    case "iphone":
      models.forEach((m) => { const x = m.match(/iPhone (\d+)/); if (x) s.add(x[1]); });
      return [...s].sort((a, b) => Number(a) - Number(b));
    case "ipad":
      models.forEach((m) => {
        if (m.startsWith("iPad Air")) s.add("Air");
        else if (m.startsWith("iPad Pro")) s.add("Pro");
        else if (m.startsWith("iPad mini") || m.startsWith("iPad Mini")) s.add("mini");
        else s.add("iPad");
      });
      return [...s].sort();
    case "macbook":
      models.forEach((m) => {
        if (m.includes("Air")) s.add("Air");
        else if (m.includes("Pro")) s.add("Pro");
      });
      return [...s].sort();
    case "watch":
      models.forEach((m) => {
        const se = m.match(/Apple Watch SE/i);
        if (se) { s.add("SE"); return; }
        const series = m.match(/Apple Watch (?:Series )?(\d+)/i);
        if (series) { s.add(`Series ${series[1]}`); return; }
        const ultra = m.match(/Apple Watch Ultra/i);
        if (ultra) { s.add("Ultra"); return; }
        s.add("Watch");
      });
      return [...s].sort();
    default:
      return [];
  }
}

function getModelsInLine(allModels: string[], line: string, deviceType: MultiDeviceType): string[] {
  switch (deviceType) {
    case "iphone":
      return allModels.filter((m) => { const x = m.match(/iPhone (\d+)/); return x && x[1] === line; });
    case "ipad":
      if (line === "Air") return allModels.filter((m) => m.startsWith("iPad Air"));
      if (line === "Pro") return allModels.filter((m) => m.startsWith("iPad Pro"));
      if (line === "mini") return allModels.filter((m) => m.startsWith("iPad mini") || m.startsWith("iPad Mini"));
      return allModels.filter((m) => m.startsWith("iPad") && !m.startsWith("iPad Air") && !m.startsWith("iPad Pro") && !m.startsWith("iPad mini") && !m.startsWith("iPad Mini"));
    case "macbook":
      if (line === "Air") return allModels.filter((m) => m.includes("Air"));
      if (line === "Pro") return allModels.filter((m) => m.includes("Pro"));
      return allModels;
    case "watch":
      if (line === "SE") return allModels.filter((m) => /Apple Watch SE/i.test(m));
      if (line === "Ultra") return allModels.filter((m) => /Apple Watch Ultra/i.test(m));
      if (line.startsWith("Series ")) {
        const num = line.replace("Series ", "");
        return allModels.filter((m) => new RegExp(`Apple Watch (?:Series )?${num}\\b`, "i").test(m));
      }
      return allModels;
    default:
      return [];
  }
}

function getLineDisplayName(line: string, deviceType: MultiDeviceType): string {
  switch (deviceType) {
    case "iphone": return `iPhone ${line}`;
    case "ipad": return line === "iPad" ? "iPad" : `iPad ${line}`;
    case "macbook": return `MacBook ${line}`;
    case "watch": return line === "Watch" ? "Apple Watch" : `Apple Watch ${line}`;
    default: return line;
  }
}

// Map MultiDeviceType to actual DeviceType for calculations
function toCalcDeviceType(dt: MultiDeviceType): DeviceType {
  if (dt === "watch") return "iphone"; // fallback until watch type is added
  return dt;
}

export default function StepUsedDeviceMulti({ usedValues, excludedModels, modelDiscounts, questionsConfig, deviceType, onNext, onTrackQuestion }: StepUsedDeviceMultiProps) {
  const qc = questionsConfig;
  const [line, setLine] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");
  const [hasDamage, setHasDamage] = useState<boolean | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [screenScratch, setScreenScratch] = useState<"none"|"one"|"multiple"|null>(null);
  const [sideScratch, setSideScratch] = useState<"none"|"one"|"multiple"|null>(null);
  const [peeling, setPeeling] = useState<"none"|"light"|"heavy"|null>(null);
  const [hasWearMarks, setHasWearMarks] = useState<boolean | null>(null);
  const [wearMarks, setWearMarks] = useState<string[]>([]);
  const [partsReplaced, setPartsReplaced] = useState<"no"|"apple"|"thirdParty"|null>(null);
  const [partsReplacedDetail, setPartsReplacedDetail] = useState("");
  const [hasWarranty, setHasWarranty] = useState<boolean|null>(null);
  const [warrantyMonth, setWarrantyMonth] = useState<number|null>(null);
  const [warrantyYear, setWarrantyYear] = useState<number>(new Date().getFullYear());
  const [hasOriginalBox, setHasOriginalBox] = useState<boolean|null>(null);
  const [cor, setCor] = useState("");
  const [coresDisponiveis, setCoresDisponiveis] = useState<Record<string, string[]>>({});
  // Respostas das perguntas dinamicas (slugs fora do HARDCODED_SLUGS). Chave
  // e o slug, valor depende do `tipo`: string pra selection/yesno,
  // string[] pra multiselect, number pra numeric.
  const [extraAnswers, setExtraAnswers] = useState<Record<string, unknown>>({});

  // Busca cores do catálogo/estoque quando muda o deviceType
  const fetchCores = useCallback(async () => {
    try {
      const dt = deviceType === "watch" ? "watch" : deviceType;
      const res = await fetch(`/api/cores-dispositivo?device_type=${dt}`);
      const j = await res.json();
      setCoresDisponiveis(j.modelos || {});
    } catch { /* ignore */ }
  }, [deviceType]);
  useEffect(() => { fetchCores(); }, [fetchCores]);

  // Cores pro modelo selecionado (traduzidas pra PT, dedup)
  const coresModelo = useMemo(() => {
    if (!model) return [];
    // Tenta match exato primeiro, depois substring
    let cores = coresDisponiveis[model];
    if (!cores) {
      const entry = Object.entries(coresDisponiveis).find(([k]) => model.toUpperCase().includes(k.toUpperCase()) || k.toUpperCase().includes(model.toUpperCase()));
      cores = entry?.[1] ?? [];
    }
    if (!cores || cores.length === 0) return [];
    // Traduz pra PT e dedup
    const ptMap = new Map<string, string>();
    for (const c of cores) {
      const pt = corParaPT(c);
      if (!ptMap.has(pt)) ptMap.set(pt, c);
    }
    return [...ptMap.keys()].sort();
  }, [model, coresDisponiveis]);

  const filtered = useMemo(() => filterByDeviceType(usedValues, deviceType), [usedValues, deviceType]);
  const allModels = useMemo(() => getUniqueUsedModels(filtered), [filtered]);
  const lines = useMemo(() => extractLines(allModels, deviceType), [allModels, deviceType]);
  const modelsInLine = useMemo(() => getModelsInLine(allModels, line, deviceType), [allModels, line, deviceType]);

  // Subgrupo: pra MacBook/iPad, agrupar modelos por chip (M1,M2...) e depois tamanho de tela
  const [subLine, setSubLine] = useState("");
  const chipGroups = useMemo(() => {
    if (deviceType !== "macbook" && deviceType !== "ipad") return null;
    const groups: Record<string, string[]> = {};
    for (const m of modelsInLine) {
      // Extrair chip: "MacBook Air M2 15\"" → "M2", "iPad Pro M4 11\"" → "M4"
      const chipMatch = m.match(/\b(M\d+(?:\s+(?:Pro|Max))?)\b/i);
      const chip = chipMatch ? chipMatch[1] : "Outro";
      if (!groups[chip]) groups[chip] = [];
      groups[chip].push(m);
    }
    // Se TODOS os modelos caem em "Outro" (ex: iPad linha generica com iPad 10/11
    // sem chip M), nao agrupa por chip — renderiza modelos direto pra nao mostrar
    // aba "iPad Outro" desnecessaria.
    if (Object.keys(groups).length === 1 && groups["Outro"]) return null;
    return Object.keys(groups).length > 0 ? groups : null;
  }, [modelsInLine, deviceType]);

  const chipList = useMemo(() => chipGroups ? Object.keys(chipGroups).sort() : [], [chipGroups]);
  const modelsForChip = useMemo(() => chipGroups && subLine ? (chipGroups[subLine] || []) : [], [chipGroups, subLine]);

  // Se o chip selecionado tem só 1 modelo, auto-selecionar
  const needsScreenSize = modelsForChip.length > 1;
  const autoModel = modelsForChip.length === 1 ? modelsForChip[0] : null;

  const storages = useMemo(() => (model ? getUsedStoragesForModel(filtered, model) : []), [filtered, model]);
  const baseValue = useMemo(() => (model && storage ? getUsedBaseValue(filtered, model, storage) : null), [filtered, model, storage]);

  const calcDeviceType = toCalcDeviceType(deviceType);

  // Calculate accumulated wearMarks discount from selected options
  const wearMarksDiscount = useMemo(() => {
    if (!isQActive(qc, "wearMarks") || wearMarks.length === 0) return 0;
    const opts = getQOptions(qc, "wearMarks");
    return wearMarks.reduce((sum, val) => {
      const opt = opts.find((o) => o.value === val);
      return sum + (opt?.discount || 0);
    }, 0);
  }, [wearMarks, qc]);

  const useNewWearMarks = isQActive(qc, "hasWearMarks");

  const cond: ConditionData = {
    screenScratch: screenScratch ?? "none", sideScratch: sideScratch ?? "none", peeling: peeling ?? "none",
    battery: battery ?? 100, hasDamage: hasDamage === true, partsReplaced: partsReplaced ?? "no",
    partsReplacedDetail: partsReplaced === "apple" ? partsReplacedDetail : "",
    hasWarranty: hasWarranty === true, warrantyMonth: hasWarranty ? warrantyMonth : null,
    warrantyYear: hasWarranty ? warrantyYear : null, hasOriginalBox: hasOriginalBox === true,
    ...(useNewWearMarks ? {
      hasWearMarks: hasWearMarks === true,
      wearMarks,
      wearMarksDiscount,
    } : {}),
  };

  const md = useMemo(() => getDiscountsForModel(model, modelDiscounts), [model, modelDiscounts]);
  const tradeInValue = useMemo(() => {
    if (baseValue === null || (isQActive(qc, "hasDamage") && hasDamage !== false) || (isQActive(qc, "partsReplaced") && partsReplaced === "thirdParty")) return 0;
    return calculateAnyTradeInValue(calcDeviceType, baseValue, cond, md);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseValue, screenScratch, sideScratch, peeling, battery, hasDamage, partsReplaced, hasWarranty, warrantyMonth, warrantyYear, md, hasOriginalBox, hasWearMarks, wearMarksDiscount, calcDeviceType]);

  // Perguntas dinamicas ativas: qualquer pergunta do DB com slug fora dos
  // hardcoded. Ordena por `ordem` pra respeitar a sequencia configurada no admin.
  const dynamicQuestions = useMemo(() => {
    if (!qc) return [];
    return qc
      .filter((q) => q.ativo !== false && !HARDCODED_SLUGS.has(q.slug))
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  }, [qc]);

  // Valida: toda pergunta dinamica precisa ter resposta (exceto multiselect,
  // que pode ficar vazio). Pra simplificar, considera "nao respondida" se a
  // chave nao existe em extraAnswers. Multiselect com [] conta como respondida.
  const dynamicOk = dynamicQuestions.every((q) => {
    const v = extraAnswers[q.slug];
    if (q.tipo === "multiselect") return v !== undefined;
    return v !== undefined && v !== null && v !== "";
  });

  const isExcluded = excludedModels.some((m) => model.toLowerCase().includes(m.toLowerCase()));
  const batteryFilled = !isQActive(qc, "battery") || (battery !== null && battery >= 1 && battery <= 100);
  // New wear marks system: if hasWearMarks is active, skip old screenScratch/sideScratch/peeling checks
  const wearMarksOk = !isQActive(qc, "hasWearMarks") || hasWearMarks === false || (hasWearMarks === true && (!isQActive(qc, "wearMarks") || wearMarks.length > 0));
  const screenOk = useNewWearMarks || !isQActive(qc, "screenScratch") || screenScratch !== null;
  const sideOk = useNewWearMarks || !isQActive(qc, "sideScratch") || sideScratch !== null;
  const peelingOk = useNewWearMarks || !isQActive(qc, "peeling") || peeling !== null;
  const allCond = screenOk && sideOk && peelingOk && batteryFilled && wearMarksOk;
  const damageOk = !isQActive(qc, "hasDamage") || hasDamage === false;
  const warrantyFilled = !isQActive(qc, "hasWarranty") || hasWarranty === false || (hasWarranty === true && (!isQActive(qc, "warrantyMonth") || warrantyMonth !== null));
  const partsOk = !isQActive(qc, "partsReplaced") || partsReplaced === "no" || partsReplaced === "apple";
  const boxOk = !isQActive(qc, "hasOriginalBox") || hasOriginalBox !== null;
  const canProceed = model && storage && cor && baseValue !== null && !isExcluded && damageOk && partsOk && allCond && warrantyFilled && boxOk && dynamicOk;

  const tq = (q: string) => onTrackQuestion?.(1, q);
  function handleLineChange(l: string) { setLine(l); setSubLine(""); setModel(""); setStorage(""); setHasDamage(null); tq("line"); }
  function handleSubLineChange(sl: string) { setSubLine(sl); setModel(""); setStorage(""); setHasDamage(null); tq("chip"); }
  function handleModelChange(m: string) { setModel(m); setStorage(""); setHasDamage(null); tq("model"); }

  // Auto-select model when chip has only 1 model
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (autoModel && model !== autoModel) {
      setModel(autoModel);
      setStorage("");
      setHasDamage(null);
    }
  }, [autoModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const deviceLabel = DEVICE_LABELS[deviceType];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-[22px] font-bold" style={{ color: "var(--ti-text)" }}>Qual {deviceLabel} voce tem?</h2>
        <p className="text-[14px] mt-1" style={{ color: "var(--ti-muted)" }}>Selecione a linha pra comecar</p>
      </div>

      <Section title="">
        <div className={`grid gap-3 ${lines.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : lines.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`} style={{ justifyItems: "center" }}>
          {lines.map((l) => {
            const popular = deviceType === "iphone" ? ["15", "16", "17"].includes(l) : false;
            return (
              <Btn key={l} sel={line===l} onClick={() => handleLineChange(l)}
                className={`w-full text-center ${popular ? "ring-2 ring-[var(--ti-accent)]/20" : ""} ${lines.length <= 2 ? "py-5 text-[16px]" : ""}`}>
                {getLineDisplayName(l, deviceType)}
              </Btn>
            );
          })}
        </div>
      </Section>

      {line && modelsInLine.length > 0 && chipGroups && chipList.length > 0 ? (
        <>
          <Section title="Modelo">
            <div className={`grid gap-3 ${chipList.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : chipList.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
              {chipList.map((chip) => (
                <Btn key={chip} sel={subLine === chip} onClick={() => handleSubLineChange(chip)}
                  className={`w-full text-center ${chipList.length <= 4 ? "py-4 text-[15px]" : ""}`}>
                  {getLineDisplayName(line, deviceType)} {chip}
                </Btn>
              ))}
            </div>
          </Section>
          {subLine && needsScreenSize && (
            <Section title="Tamanho da tela">
              <div className="grid grid-cols-2 gap-3 max-w-[320px] mx-auto">
                {modelsForChip.map((m) => {
                  const sizeMatch = m.match(/(\d+)[""]/);
                  const size = sizeMatch ? `${sizeMatch[1]}"` : m;
                  return (
                    <Btn key={m} sel={model === m} onClick={() => handleModelChange(m)}
                      className="w-full text-center py-4 text-[15px]">
                      {size}
                    </Btn>
                  );
                })}
              </div>
            </Section>
          )}
          {isExcluded && <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--ti-error)" }}>Este modelo nao e aceito no programa de trade-in.</p>}
        </>
      ) : line && modelsInLine.length > 0 ? (
        <Section title="Modelo">
          <div className="grid grid-cols-1 gap-2">
            {modelsInLine.map((m) => <Btn key={m} sel={model===m} onClick={() => handleModelChange(m)} className="text-left">{m}</Btn>)}
          </div>
          {isExcluded && <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--ti-error)" }}>Este modelo nao e aceito no programa de trade-in.</p>}
        </Section>
      ) : null}

      {model && !isExcluded && storages.length > 0 && (
        deviceType === "macbook" ? (
          // MacBook: agrupar por RAM e mostrar SSD separado
          (() => {
            // storages são tipo "256GB/8GB", "512GB/8GB", "256GB/16GB" etc.
            const parsed = storages.map(s => {
              const parts = s.split("/");
              const ssd = parts[0] || s;
              const ram = parts[1] || "";
              return { raw: s, ssd, ram };
            });
            // Agrupar por RAM
            const byRam: Record<string, typeof parsed> = {};
            for (const p of parsed) {
              const key = p.ram || "default";
              if (!byRam[key]) byRam[key] = [];
              byRam[key].push(p);
            }
            const ramGroups = Object.entries(byRam).sort(([a], [b]) => {
              const na = parseInt(a) || 0;
              const nb = parseInt(b) || 0;
              return na - nb;
            });
            return (
              <Section title="Qual a configuracao do seu MacBook?">
                <div className="space-y-4">
                  {ramGroups.map(([ram, items]) => (
                    <div key={ram}>
                      {ram && ram !== "default" && ramGroups.length > 1 && (
                        <p className="text-[13px] font-semibold mb-2 text-center" style={{ color: "var(--ti-text)" }}>{ram} RAM</p>
                      )}
                      <div className={`grid gap-2 ${items.length <= 2 ? "grid-cols-2 max-w-[320px] mx-auto" : "grid-cols-3"}`}>
                        {items.map(({ raw, ssd, ram: r }) => (
                          <Btn key={raw} sel={storage === raw} onClick={() => { setStorage(raw); tq("storage"); }}
                            className="w-full text-center">
                            {r ? <><span className="block font-bold">{r} RAM</span><span className="block text-[12px] opacity-80">{ssd} SSD</span></> : ssd}
                          </Btn>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            );
          })()
        ) : (
          <Section title="Armazenamento">
            <div className="flex gap-2 flex-wrap">
              {storages.map((s) => <Btn key={s} sel={storage===s} onClick={() => { setStorage(s); tq("storage"); }} className="flex-1 min-w-[80px]">{s}</Btn>)}
            </div>
          </Section>
        )
      )}

      {/* Cor do aparelho */}
      {model && storage && coresModelo.length > 0 && (
        <Section title="Qual a cor do seu aparelho?">
          <div className={`grid gap-2 ${coresModelo.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}>
            {coresModelo.map(c => (
              <button key={c} type="button" onClick={() => setCor(c)}
                className="py-3 rounded-xl text-[14px] font-semibold transition-all"
                style={cor === c
                  ? { backgroundColor: "var(--ti-success-light)", color: "var(--ti-success)", border: "2px solid var(--ti-success)" }
                  : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }
                }
              >{c}</button>
            ))}
          </div>
        </Section>
      )}

      {/* Cor manual — quando não tem cores do catálogo */}
      {model && storage && coresModelo.length === 0 && (
        <Section title="Qual a cor do seu aparelho?">
          <input
            type="text"
            value={cor}
            onChange={(e) => setCor(e.target.value)}
            placeholder="Ex: Preto, Prata, Dourado..."
            className="w-full px-4 py-3 rounded-xl text-[14px] text-center"
            style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)", color: "var(--ti-text)" }}
          />
        </Section>
      )}

      {model && storage && !isExcluded && isQActive(qc, "hasDamage") && (
        <Section title={getQTitle(qc, "hasDamage", "O aparelho esta trincado, quebrado ou com defeito?")}>
          <div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "hasDamage");
              const noOpt = opts.find(o => o.value === "no");
              const yesOpt = opts.find(o => o.value === "yes");
              return <>
                <Btn sel={hasDamage===false} onClick={() => { setHasDamage(false); tq("damage"); }} className="flex-1" variant="success">{noOpt?.label || "Nao"}</Btn>
                <Btn sel={hasDamage===true} onClick={() => { setHasDamage(true); tq("damage"); }} className="flex-1" variant="error">{yesOpt?.label || "Sim"}</Btn>
              </>;
            })()}
          </div>
          {hasDamage === true && (
            <div className="mt-4 rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-error-light)", border: "1px solid var(--ti-error)" }}>
              <p className="text-[15px] font-semibold" style={{ color: "var(--ti-error)" }}>{getQOptions(qc, "hasDamage").find(o => o.reject)?.rejectMessage || "Infelizmente nao aceitamos aparelhos com tela trincada, quebrada ou com defeito na troca."}</p>
            </div>
          )}
        </Section>
      )}

      {model && storage && !isExcluded && hasDamage === false && (
        <>
          {isQActive(qc, "battery") && (
          <Section title={getQTitle(qc, "battery", "Saude da bateria")}>
            <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
              <div className="relative">
                <input type="tel" inputMode="numeric" pattern="[0-9]*" value={battery ?? ""} placeholder="Ex: 87"
                  onChange={(e) => { const r = e.target.value.replace(/\D/g, ""); if (r === "") { setBattery(null); return; } setBattery(Math.min(100, Number(r))); tq("battery"); }}
                  className="w-full px-4 py-3 pr-10 rounded-xl text-[20px] font-bold text-center focus:outline-none transition-colors"
                  style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)", color: "var(--ti-text)" }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold" style={{ color: "var(--ti-muted)" }}>%</span>
              </div>
              {deviceType === "iphone" && (
                <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir a saude da bateria?</summary>
                  <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                    <p>1. Abra <strong style={{ color: "var(--ti-text)" }}>Ajustes</strong> no seu iPhone</p>
                    <p>2. Toque em <strong style={{ color: "var(--ti-text)" }}>Bateria</strong></p>
                    <p>3. Toque em <strong style={{ color: "var(--ti-text)" }}>Saude e Carregamento da Bateria</strong></p>
                    <p>4. Veja o valor em <strong style={{ color: "var(--ti-text)" }}>Capacidade Maxima</strong></p>
                  </div>
                </details>
              )}
              {deviceType === "ipad" && (
                <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir a saude da bateria?</summary>
                  <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                    <p>1. Abra <strong style={{ color: "var(--ti-text)" }}>Ajustes</strong> no seu iPad</p>
                    <p>2. Toque em <strong style={{ color: "var(--ti-text)" }}>Bateria</strong></p>
                    <p>3. Toque em <strong style={{ color: "var(--ti-text)" }}>Saude da Bateria</strong></p>
                    <p>4. Veja o valor em <strong style={{ color: "var(--ti-text)" }}>Capacidade Maxima</strong></p>
                  </div>
                </details>
              )}
              {deviceType === "macbook" && (
                <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir a saude da bateria?</summary>
                  <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                    <p>1. Clique no menu <strong style={{ color: "var(--ti-text)" }}>Apple</strong> {">"} <strong style={{ color: "var(--ti-text)" }}>Sobre Este Mac</strong></p>
                    <p>2. Clique em <strong style={{ color: "var(--ti-text)" }}>Mais Informacoes</strong></p>
                    <p>3. Veja <strong style={{ color: "var(--ti-text)" }}>Bateria</strong> {">"} <strong style={{ color: "var(--ti-text)" }}>Saude</strong></p>
                  </div>
                </details>
              )}
              {deviceType === "watch" && (
                <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                  <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir a saude da bateria?</summary>
                  <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                    <p>1. No Apple Watch, abra <strong style={{ color: "var(--ti-text)" }}>Ajustes</strong></p>
                    <p>2. Toque em <strong style={{ color: "var(--ti-text)" }}>Bateria</strong></p>
                    <p>3. Toque em <strong style={{ color: "var(--ti-text)" }}>Saude da Bateria</strong></p>
                    <p>4. Veja o valor em <strong style={{ color: "var(--ti-text)" }}>Capacidade Maxima</strong></p>
                  </div>
                </details>
              )}
            </div>
          </Section>
          )}

          {/* === NEW: Wear marks 2-step flow === */}
          {batteryFilled && isQActive(qc, "hasWearMarks") && (
            <Section title={getQTitle(qc, "hasWearMarks", "Seu aparelho possui marcas de uso?")}>
              <div className="flex gap-2">
                {(() => {
                  const opts = getQOptions(qc, "hasWearMarks");
                  const noOpt = opts.find(o => o.value === "no");
                  const yesOpt = opts.find(o => o.value === "yes");
                  return <>
                    <Btn sel={hasWearMarks===false} onClick={() => { setHasWearMarks(false); setWearMarks([]); tq("hasWearMarks"); }} className="flex-1" variant="success">{noOpt?.label || "Nao"}</Btn>
                    <Btn sel={hasWearMarks===true} onClick={() => { setHasWearMarks(true); tq("hasWearMarks"); }} className="flex-1">{yesOpt?.label || "Sim"}</Btn>
                  </>;
                })()}
              </div>
            </Section>
          )}

          {batteryFilled && isQActive(qc, "hasWearMarks") && hasWearMarks === true && isQActive(qc, "wearMarks") && (
            <Section title={getQTitle(qc, "wearMarks", "Selecione as marcas de uso:")}>
              <div className="grid grid-cols-1 gap-2">
                {(() => {
                  const opts = getQOptions(qc, "wearMarks");
                  const items = opts.length > 0
                    ? opts
                    : [
                        { value: "screen_scratches", label: "Arranhoes na tela", discount: -200 },
                        { value: "side_marks", label: "Marcas nas laterais", discount: -200 },
                        { value: "light_peeling", label: "Descascado leve", discount: -200 },
                        { value: "heavy_peeling", label: "Descascado forte", discount: -300 },
                      ];
                  return items.map((opt) => {
                    const isSelected = wearMarks.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setWearMarks((prev) =>
                            isSelected ? prev.filter((v) => v !== opt.value) : [...prev, opt.value]
                          );
                          tq("wearMarks");
                        }}
                        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 text-left"
                        style={isSelected
                          ? { backgroundColor: "var(--ti-error-light)", color: "var(--ti-error)", border: "1px solid var(--ti-error)" }
                          : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }
                        }
                      >
                        <span className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
                          style={isSelected
                            ? { backgroundColor: "var(--ti-error)", color: "white", border: "1px solid var(--ti-error)" }
                            : { backgroundColor: "transparent", border: "2px solid var(--ti-btn-border)" }
                          }
                        >
                          {isSelected ? "\u2713" : ""}
                        </span>
                        <span className="flex-1">{opt.label}</span>
                        {/* Desconto oculto do cliente */}
                      </button>
                    );
                  });
                })()}
              </div>
              {/* Desconto total oculto do cliente */}
            </Section>
          )}

          {/* === LEGACY: Old individual scratch/peeling questions (only if hasWearMarks is NOT active) === */}
          {batteryFilled && !useNewWearMarks && isQActive(qc, "screenScratch") && <Section title={getQTitle(qc, "screenScratch", "Riscos na tela")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "screenScratch");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Nenhum"],["one","1 risco"],["multiple","2 ou mais"]];
              return items.map(([v,l]) => <Btn key={v} sel={screenScratch===v} onClick={() => { setScreenScratch(v as typeof screenScratch); tq("screenScratch"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {screenScratch !== null && !useNewWearMarks && isQActive(qc, "sideScratch") && <Section title={getQTitle(qc, "sideScratch", "Riscos laterais")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "sideScratch");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Nenhum"],["one","1 risco"],["multiple","2 ou mais"]];
              return items.map(([v,l]) => <Btn key={v} sel={sideScratch===v} onClick={() => { setSideScratch(v as typeof sideScratch); tq("sideScratch"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {sideScratch !== null && !useNewWearMarks && isQActive(qc, "peeling") && <Section title={getQTitle(qc, "peeling", "Descascado / Amassado")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "peeling");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Nao"],["light","Leve"],["heavy","Forte"]];
              return items.map(([v,l]) => <Btn key={v} sel={peeling===v} onClick={() => { setPeeling(v as typeof peeling); tq("peeling"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {/* Parts replaced — 2-step flow: first Sim/Nao, then where */}
          {((useNewWearMarks && (hasWearMarks === false || (hasWearMarks === true && wearMarks.length > 0))) || (!useNewWearMarks && peeling !== null)) && isQActive(qc, "partsReplaced") && (
          <Section title="O aparelho ja teve alguma peca trocada?">
            {(() => {
              const tpOpt = getQOptions(qc, "partsReplaced").find(o => o.value === "thirdParty");
              const partsConfig = getQ(qc, "partsReplaced")?.config || {};
              const answeredYes = partsReplaced === "apple" || partsReplaced === "thirdParty";
              return <>
                <div className="flex gap-2">
                  <Btn sel={partsReplaced==="no"} onClick={() => { setPartsReplaced("no"); tq("partsReplaced"); }} variant="success" className="flex-1">Nao</Btn>
                  <Btn sel={answeredYes} onClick={() => { if (!answeredYes) setPartsReplaced("apple"); tq("partsReplaced"); }} className="flex-1">Sim</Btn>
                </div>
                {answeredYes && (
                  <div className="mt-4">
                    <p className="text-[13px] font-semibold text-center mb-2" style={{ color: "var(--ti-text)" }}>Onde foi feito o reparo?</p>
                    <div className="grid grid-cols-1 gap-2">
                      <Btn sel={partsReplaced==="apple"} onClick={() => { setPartsReplaced("apple"); tq("partsReplaced"); }} variant="success">Na loja da Apple (autorizada)</Btn>
                      <Btn sel={partsReplaced==="thirdParty"} onClick={() => { setPartsReplaced("thirdParty"); tq("partsReplaced"); }} variant="error">Fora da Apple</Btn>
                    </div>
                    {partsReplaced === "apple" && (
                      <div className="mt-3">
                        <label className="block text-[12px] font-semibold mb-1.5 text-center" style={{ color: "var(--ti-muted)" }}>Qual peca foi trocada?</label>
                        <input type="text" value={partsReplacedDetail} onChange={(e) => setPartsReplacedDetail(e.target.value)}
                          placeholder={(partsConfig.detailPlaceholder as string) || "Ex: Tela, Bateria, Alto-falante..."}
                          className="w-full px-4 py-3 rounded-2xl text-[14px] text-center focus:outline-none"
                          style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-success)", color: "var(--ti-text)" }} />
                      </div>
                    )}
                    {partsReplaced === "thirdParty" && (
                      <div className="mt-4 rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-error-light)", border: "1px solid var(--ti-error)" }}>
                        <p className="text-[15px] font-semibold" style={{ color: "var(--ti-error)" }}>{tpOpt?.rejectMessage || "Infelizmente nao aceitamos aparelhos com pecas trocadas fora da rede autorizada Apple."}</p>
                      </div>
                    )}
                  </div>
                )}
              </>;
            })()}
          </Section>)}

          {partsOk && isQActive(qc, "hasWarranty") && (
          <Section title={getQTitle(qc, "hasWarranty", "Ainda esta na garantia Apple de 12 meses?")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "hasWarranty");
              const yesOpt = opts.find(o => o.value === "yes");
              const noOpt = opts.find(o => o.value === "no");
              return <>
                <Btn sel={hasWarranty===false} onClick={() => { setHasWarranty(false); setWarrantyMonth(null); tq("warranty"); }} className="flex-1">{noOpt?.label || "Nao"}</Btn>
                <Btn sel={hasWarranty===true} onClick={() => { setHasWarranty(true); tq("warranty"); }} className="flex-1" variant="success">{yesOpt?.label || "Sim"}</Btn>
              </>;
            })()}
          </div></Section>)}

          {hasWarranty === true && isQActive(qc, "warrantyMonth") && (
            <Section title={getQTitle(qc, "warrantyMonth", "Ate qual mes vai a garantia do seu aparelho?")}>
              <div className="flex gap-2 mb-3">
                {[new Date().getFullYear(), new Date().getFullYear()+1].map((y) => <Btn key={y} sel={warrantyYear===y} onClick={() => setWarrantyYear(y)} className="flex-1" variant="success">{y}</Btn>)}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((m, i) => <Btn key={i} sel={warrantyMonth===i+1} onClick={() => setWarrantyMonth(i+1)} variant="success">{m}</Btn>)}
              </div>
            </Section>
          )}

          {warrantyFilled && isQActive(qc, "hasOriginalBox") && (
          <Section title={getQTitle(qc, "hasOriginalBox", "Ainda tem a caixa original do aparelho?")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "hasOriginalBox");
              const yesOpt = opts.find(o => o.value === "yes");
              const noOpt = opts.find(o => o.value === "no");
              return <>
                <Btn sel={hasOriginalBox===true} onClick={() => { setHasOriginalBox(true); tq("originalBox"); }} className="flex-1" variant="success">{yesOpt?.label || "Sim"}</Btn>
                <Btn sel={hasOriginalBox===false} onClick={() => { setHasOriginalBox(false); tq("originalBox"); }} className="flex-1">{noOpt?.label || "Nao"}</Btn>
              </>;
            })()}
          </div></Section>)}
        </>
      )}

      {/* Perguntas adicionais — cadastradas via /admin/simulacoes com slug
          diferente dos hardcoded. Renderizacao generica por `tipo`. Admin
          pode adicionar/editar/remover pra qualquer device_type sem precisar
          mexer no codigo. */}
      {model && !isExcluded && dynamicQuestions.length > 0 && dynamicQuestions.map((q) => {
        const val = extraAnswers[q.slug];
        const setVal = (v: unknown) => setExtraAnswers((prev) => ({ ...prev, [q.slug]: v }));
        return (
          <Section key={q.id || q.slug} title={q.titulo}>
            {q.tipo === "yesno" && (
              <div className="flex gap-2">
                {(q.opcoes.length > 0 ? q.opcoes : [{ value: "yes", label: "Sim" }, { value: "no", label: "Nao" }]).map((opt) => (
                  <Btn key={opt.value} sel={val === opt.value} onClick={() => { setVal(opt.value); tq(q.slug); }} className="flex-1">
                    {opt.label}
                  </Btn>
                ))}
              </div>
            )}
            {q.tipo === "selection" && (
              <div className={`grid gap-2 ${q.opcoes.length <= 2 ? "grid-cols-2" : q.opcoes.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {q.opcoes.map((opt) => (
                  <Btn key={opt.value} sel={val === opt.value} onClick={() => { setVal(opt.value); tq(q.slug); }}>
                    {opt.label}
                  </Btn>
                ))}
              </div>
            )}
            {q.tipo === "multiselect" && (
              <div className="grid grid-cols-2 gap-2">
                {q.opcoes.map((opt) => {
                  const arr = Array.isArray(val) ? (val as string[]) : [];
                  const sel = arr.includes(opt.value);
                  return (
                    <Btn key={opt.value} sel={sel} onClick={() => {
                      const next = sel ? arr.filter((v) => v !== opt.value) : [...arr, opt.value];
                      setVal(next); tq(q.slug);
                    }}>
                      {sel ? "✓ " : ""}{opt.label}
                    </Btn>
                  );
                })}
                {/* Inicializa array vazio quando usuario nao marcou nada ainda, pra validacao saber que ja interagiu */}
                {val === undefined && (
                  <button onClick={() => setVal([])} className="col-span-2 text-[11px] text-[#86868B] underline py-1">Nenhum</button>
                )}
              </div>
            )}
            {q.tipo === "numeric" && (
              <input
                type="number"
                inputMode="numeric"
                value={typeof val === "number" ? String(val) : (typeof val === "string" ? val : "")}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  const num = raw === "" ? undefined : Number(raw);
                  setVal(Number.isFinite(num as number) ? (num as number) : undefined);
                  tq(q.slug);
                }}
                className="w-full px-4 py-3 rounded-xl text-[15px]"
                style={{ backgroundColor: "var(--ti-input-bg)", color: "var(--ti-text)", border: "1px solid var(--ti-input-border)" }}
                placeholder="Ex: 500"
              />
            )}
          </Section>
        );
      })}

      {canProceed && (
        <button onClick={() => onNext({
          usedModel: model, usedStorage: storage, usedColor: cor, condition: cond, tradeInValue, deviceType: calcDeviceType,
          extraAnswers: dynamicQuestions.length > 0 ? extraAnswers : undefined,
        })}
          className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98] shadow-lg"
          style={{ backgroundColor: "#22c55e" }}>
          Ver minha avaliacao {"\u2192"}
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Auto-scroll para a secao quando ela aparece
    const timer = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="animate-fadeIn" ref={ref}>
      <label className="block text-[14px] font-bold mb-3 text-center" style={{ color: "var(--ti-text)" }}>{title}</label>
      {children}
    </div>
  );
}

function Btn({ sel, onClick, children, className = "", variant = "default", style: extraStyle }: {
  sel: boolean; onClick: () => void; children: React.ReactNode; className?: string; variant?: "default"|"success"|"error"; style?: React.CSSProperties;
}) {
  const selStyle = variant === "success"
    ? { backgroundColor: "var(--ti-success-light)", color: "var(--ti-success)", border: "1px solid var(--ti-success)" }
    : variant === "error"
    ? { backgroundColor: "var(--ti-error-light)", color: "var(--ti-error)", border: "1px solid var(--ti-error)" }
    : { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" };
  const unselStyle = { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" };

  return (
    <button onClick={onClick} className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 ${className}`}
      style={{ ...(sel ? selStyle : unselStyle), ...extraStyle }}>
      {children}
    </button>
  );
}
