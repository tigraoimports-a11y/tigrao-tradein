"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { UsedDeviceValue, TradeInQuestion } from "@/lib/types";
import { getUniqueUsedModels, getUsedStoragesForModel, getUsedBaseValue } from "@/lib/sheets";
import {
  calculateTradeInValue, getDiscountsForModel, formatBRL,
  type DeviceType, type ConditionData, type AnyConditionData, type ModelDiscounts, type WarrantyBonuses,
} from "@/lib/calculations";
import { COR_EN_TO_PT_SIMPLES } from "@/lib/cor-pt";

const COR_MAP_LOWER: Record<string, string> = Object.fromEntries(
  Object.entries(COR_EN_TO_PT_SIMPLES).map(([k, v]) => [k.toLowerCase().trim(), v])
);
function corParaPT(en: string): string {
  if (!en) return "";
  const key = en.toLowerCase().trim();
  return COR_MAP_LOWER[key] || COR_EN_TO_PT_SIMPLES[en] || en;
}

interface StepUsedDeviceProps {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  modelDiscounts?: Record<string, ModelDiscounts>;
  warrantyBonuses?: WarrantyBonuses;
  questionsConfig?: TradeInQuestion[] | null;
  onNext: (data: { usedModel: string; usedStorage: string; usedColor: string; condition: AnyConditionData; tradeInValue: number; deviceType: DeviceType }) => void;
  onTrackQuestion?: (step: number, question: string) => void;
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

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export default function StepUsedDevice({ usedValues, excludedModels, modelDiscounts, warrantyBonuses, questionsConfig, onNext, onTrackQuestion }: StepUsedDeviceProps) {
  const qc = questionsConfig;
  const [line, setLine] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");
  const [color, setColor] = useState("");
  const [colorError, setColorError] = useState(false);
  const [topAlert, setTopAlert] = useState<string | null>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
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

  // Cores cadastradas por modelo de iPhone (buscadas do catálogo)
  const [catalogCores, setCatalogCores] = useState<Record<string, string[]>>({});
  useEffect(() => {
    fetch("/api/cores-iphone")
      .then((r) => r.json())
      .then((j) => { if (j?.modelos) setCatalogCores(j.modelos); })
      .catch(() => {});
  }, []);
  // Encontra as cores do modelo selecionado (match por normalização)
  const coresDoModelo = useMemo(() => {
    if (!model) return [];
    const norm = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();
    const nm = norm(model);
    // Somente match EXATO — evita "iPhone 15" casar com "iPhone 15 Pro"
    for (const [k, v] of Object.entries(catalogCores)) {
      if (norm(k) === nm) return v;
    }
    return [];
  }, [model, catalogCores]);

  const filtered = useMemo(() => usedValues.filter((v) => v.modelo.startsWith("iPhone")), [usedValues]);
  const allModels = useMemo(() => getUniqueUsedModels(filtered), [filtered]);
  const lines = useMemo(() => {
    const s = new Set<string>();
    allModels.forEach((m) => { const x = m.match(/iPhone (\d+)/); if (x) s.add(x[1]); });
    return [...s].sort((a, b) => Number(a) - Number(b));
  }, [allModels]);
  const modelsInLine = useMemo(() => allModels.filter((m) => { const x = m.match(/iPhone (\d+)/); return x && x[1] === line; }), [allModels, line]);
  const storages = useMemo(() => (model ? getUsedStoragesForModel(filtered, model) : []), [filtered, model]);
  const baseValue = useMemo(() => (model && storage ? getUsedBaseValue(filtered, model, storage) : null), [filtered, model, storage]);

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
    return calculateTradeInValue(baseValue, cond, md, warrantyBonuses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseValue, screenScratch, sideScratch, peeling, battery, hasDamage, partsReplaced, hasWarranty, warrantyMonth, warrantyYear, md, hasOriginalBox, hasWearMarks, wearMarksDiscount]);

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
  const canProceed = model && storage && color.trim() && baseValue !== null && !isExcluded && damageOk && partsOk && allCond && warrantyFilled && boxOk;

  const tq = (q: string) => onTrackQuestion?.(1, q);
  function handleLineChange(l: string) { setLine(l); setModel(""); setStorage(""); setColor(""); setHasDamage(null); tq("line"); }
  function handleModelChange(m: string) { setModel(m); setStorage(""); setColor(""); setHasDamage(null); tq("model"); }

  const handleAdvance = () => {
    if (!color.trim()) {
      setColorError(true);
      setTopAlert("Por favor, selecione a cor do aparelho.");
      setTimeout(() => {
        colorInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        colorInputRef.current?.focus();
      }, 50);
      setTimeout(() => setTopAlert(null), 4000);
      return;
    }
    if (!canProceed) return;
    onNext({ usedModel: model, usedStorage: storage, usedColor: color.trim(), condition: cond, tradeInValue, deviceType: "iphone" });
  };

  return (
    <div className="space-y-8">
      {topAlert && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md rounded-xl px-4 py-3 text-center text-[14px] font-semibold shadow-2xl animate-fadeIn"
          style={{ backgroundColor: "var(--ti-error-light)", color: "var(--ti-error)", border: "2px solid var(--ti-error)" }}>
          {topAlert}
        </div>
      )}
      <div className="text-center">
        <h2 className="text-[22px] font-bold" style={{ color: "var(--ti-text)" }}>Qual iPhone voce tem?</h2>
        <p className="text-[14px] mt-1" style={{ color: "var(--ti-muted)" }}>Selecione a linha pra comecar</p>
      </div>

      <Section title="">
        <div className="grid grid-cols-3 gap-2" style={{ justifyItems: "center" }}>
          {lines.map((l, i) => {
            const popular = ["15", "16", "17"].includes(l);
            const isLast = i === lines.length - 1 && lines.length % 3 !== 0;
            return (
              <Btn key={l} sel={line===l} onClick={() => handleLineChange(l)}
                className={`w-full ${popular ? "ring-2 ring-[var(--ti-accent)]/20" : ""}`}
                style={isLast && lines.length % 3 === 1 ? { gridColumn: "2" } : undefined}>
                {`iPhone ${l}`}
              </Btn>
            );
          })}
        </div>
      </Section>

      {line && modelsInLine.length > 0 && (
        <Section title="Modelo">
          <div className="grid grid-cols-1 gap-2">
            {modelsInLine.map((m) => <Btn key={m} sel={model===m} onClick={() => handleModelChange(m)} className="text-left">{m}</Btn>)}
          </div>
          {isExcluded && <p className="mt-3 text-[13px] font-medium" style={{ color: "var(--ti-error)" }}>Este modelo não é aceito no programa de trade-in.</p>}
        </Section>
      )}

      {model && !isExcluded && storages.length > 0 && (
        <Section title="Armazenamento">
          <div className="flex gap-2 flex-wrap">
            {storages.map((s) => <Btn key={s} sel={storage===s} onClick={() => { setStorage(s); tq("storage"); }} className="flex-1 min-w-[80px]">{s}</Btn>)}
          </div>
        </Section>
      )}

      {model && storage && !isExcluded && (
        <Section title="Qual a cor do seu aparelho?">
          {coresDoModelo.length > 0 ? (
            <>
              <div ref={colorInputRef as unknown as React.RefObject<HTMLDivElement>} className="grid grid-cols-2 gap-2">
                {(() => {
                  // Deduplica cores EN que mapeiam para a mesma cor PT
                  const seen = new Set<string>();
                  const unique: { en: string; pt: string }[] = [];
                  for (const c of coresDoModelo) {
                    const pt = corParaPT(c);
                    if (seen.has(pt)) continue;
                    seen.add(pt);
                    unique.push({ en: c, pt });
                  }
                  return unique.map(({ en, pt }) => (
                    <Btn
                      key={en}
                      sel={color.toUpperCase() === pt.toUpperCase() || color.toUpperCase() === en.toUpperCase()}
                      onClick={() => { setColor(pt); setColorError(false); tq("color"); }}
                      className="text-left"
                    >
                      {pt}
                    </Btn>
                  ));
                })()}
              </div>
              {colorError && (
                <p className="text-[12px] mt-2 font-semibold" style={{ color: "var(--ti-error)" }}>Por favor, selecione a cor do aparelho.</p>
              )}
              <p className="text-[11px] mt-2" style={{ color: "var(--ti-muted)" }}>Selecione a cor do seu iPhone.</p>
            </>
          ) : (
            <>
              <input
                ref={colorInputRef}
                type="text"
                value={color}
                onChange={(e) => { setColor(e.target.value); if (e.target.value.trim()) setColorError(false); }}
                onBlur={() => { if (color.trim()) tq("color"); }}
                placeholder="Ex: Preto, Titânio Natural, Azul..."
                maxLength={40}
                className="w-full px-4 py-3 rounded-xl text-[16px] font-medium focus:outline-none transition-colors"
                style={{ backgroundColor: "var(--ti-input-bg)", border: colorError ? "2px solid var(--ti-error)" : "1px solid var(--ti-card-border)", color: "var(--ti-text)" }}
              />
              {colorError && (
                <p className="text-[12px] mt-1.5 font-semibold" style={{ color: "var(--ti-error)" }}>Por favor, informe a cor do aparelho.</p>
              )}
              <p className="text-[11px] mt-1.5" style={{ color: "var(--ti-muted)" }}>Informe a cor exata como aparece no seu iPhone.</p>
            </>
          )}
        </Section>
      )}

      {model && storage && !isExcluded && isQActive(qc, "hasDamage") && (
        <Section title={getQTitle(qc, "hasDamage", "O aparelho está trincado, quebrado ou com defeito?")}>
          <div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "hasDamage");
              const noOpt = opts.find(o => o.value === "no");
              const yesOpt = opts.find(o => o.value === "yes");
              return <>
                <Btn sel={hasDamage===false} onClick={() => { setHasDamage(false); tq("damage"); }} className="flex-1" variant="success">{noOpt?.label || "Não"}</Btn>
                <Btn sel={hasDamage===true} onClick={() => { setHasDamage(true); tq("damage"); }} className="flex-1" variant="error">{yesOpt?.label || "Sim"}</Btn>
              </>;
            })()}
          </div>
          {hasDamage === true && (
            <div className="mt-4 rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-error-light)", border: "1px solid var(--ti-error)" }}>
              <p className="text-[15px] font-semibold" style={{ color: "var(--ti-error)" }}>{getQOptions(qc, "hasDamage").find(o => o.reject)?.rejectMessage || "Infelizmente não aceitamos aparelhos com tela trincada, quebrada ou com defeito na troca."}</p>
            </div>
          )}
        </Section>
      )}

      {model && storage && !isExcluded && hasDamage === false && (
        <>
          <Section title={getQTitle(qc, "battery", "Saúde da bateria")}>
            <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
              <div className="relative">
                <input type="tel" inputMode="numeric" pattern="[0-9]*" value={battery ?? ""} placeholder="Ex: 87"
                  onChange={(e) => { const r = e.target.value.replace(/\D/g, ""); if (r === "") { setBattery(null); return; } setBattery(Math.min(100, Number(r))); tq("battery"); }}
                  className="w-full px-4 py-3 pr-10 rounded-xl text-[20px] font-bold text-center focus:outline-none transition-colors"
                  style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)", color: "var(--ti-text)" }}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold" style={{ color: "var(--ti-muted)" }}>%</span>
              </div>
              <details className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                <summary className="text-[12px] font-semibold cursor-pointer" style={{ color: "var(--ti-accent)" }}>Como descobrir a saúde da bateria?</summary>
                <div className="text-[11px] space-y-1 mt-2" style={{ color: "var(--ti-muted)" }}>
                  <p>1. Abra <strong style={{ color: "var(--ti-text)" }}>Ajustes</strong> no seu iPhone</p>
                  <p>2. Toque em <strong style={{ color: "var(--ti-text)" }}>Bateria</strong></p>
                  <p>3. Toque em <strong style={{ color: "var(--ti-text)" }}>Saúde e Carregamento da Bateria</strong></p>
                  <p>4. Veja o valor em <strong style={{ color: "var(--ti-text)" }}>Capacidade Máxima</strong></p>
                </div>
              </details>
            </div>
          </Section>

          {/* === NEW: Wear marks 2-step flow === */}
          {batteryFilled && isQActive(qc, "hasWearMarks") && (
            <Section title={getQTitle(qc, "hasWearMarks", "Seu aparelho possui marcas de uso?")}>
              <div className="flex gap-2">
                {(() => {
                  const opts = getQOptions(qc, "hasWearMarks");
                  const noOpt = opts.find(o => o.value === "no");
                  const yesOpt = opts.find(o => o.value === "yes");
                  return <>
                    <Btn sel={hasWearMarks===false} onClick={() => { setHasWearMarks(false); setWearMarks([]); tq("hasWearMarks"); }} className="flex-1" variant="success">{noOpt?.label || "Não"}</Btn>
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
                : [["none","Não"],["light","Leve"],["heavy","Forte"]];
              return items.map(([v,l]) => <Btn key={v} sel={peeling===v} onClick={() => { setPeeling(v as typeof peeling); tq("peeling"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {/* Parts replaced — 2-step flow: first Sim/Não, then where */}
          {((useNewWearMarks && (hasWearMarks === false || (hasWearMarks === true && wearMarks.length > 0))) || (!useNewWearMarks && peeling !== null)) && isQActive(qc, "partsReplaced") && (
          <Section title="O aparelho já teve alguma peça trocada?">
            {(() => {
              const tpOpt = getQOptions(qc, "partsReplaced").find(o => o.value === "thirdParty");
              const partsConfig = getQ(qc, "partsReplaced")?.config || {};
              const hasPartsAnswer = partsReplaced !== null;
              const answeredYes = partsReplaced === "apple" || partsReplaced === "thirdParty";
              return <>
                <div className="flex gap-2">
                  <Btn sel={partsReplaced==="no"} onClick={() => { setPartsReplaced("no"); tq("partsReplaced"); }} variant="success" className="flex-1">Não</Btn>
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
                        <label className="block text-[12px] font-semibold mb-1.5 text-center" style={{ color: "var(--ti-muted)" }}>Qual peça foi trocada?</label>
                        <input type="text" value={partsReplacedDetail} onChange={(e) => setPartsReplacedDetail(e.target.value)}
                          placeholder={(partsConfig.detailPlaceholder as string) || "Ex: Tela, Bateria, Alto-falante..."}
                          className="w-full px-4 py-3 rounded-2xl text-[14px] text-center focus:outline-none"
                          style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-success)", color: "var(--ti-text)" }} />
                      </div>
                    )}
                    {partsReplaced === "thirdParty" && (
                      <div className="mt-4 rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-error-light)", border: "1px solid var(--ti-error)" }}>
                        <p className="text-[15px] font-semibold" style={{ color: "var(--ti-error)" }}>{tpOpt?.rejectMessage || "Infelizmente não aceitamos aparelhos com peças trocadas fora da rede autorizada Apple."}</p>
                      </div>
                    )}
                  </div>
                )}
              </>;
            })()}
          </Section>)}

          {partsOk && isQActive(qc, "hasWarranty") && (
          <Section title={getQTitle(qc, "hasWarranty", "Ainda está na garantia Apple de 12 meses?")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "hasWarranty");
              const yesOpt = opts.find(o => o.value === "yes");
              const noOpt = opts.find(o => o.value === "no");
              return <>
                <Btn sel={hasWarranty===false} onClick={() => { setHasWarranty(false); setWarrantyMonth(null); tq("warranty"); }} className="flex-1">{noOpt?.label || "Não"}</Btn>
                <Btn sel={hasWarranty===true} onClick={() => { setHasWarranty(true); tq("warranty"); }} className="flex-1" variant="success">{yesOpt?.label || "Sim"}</Btn>
              </>;
            })()}
          </div>
          {hasWarranty === true && !md.warrantyBonuses && (
            <p className="mt-2 text-xs text-center" style={{ color: "var(--ti-muted)" }}>
              A garantia não impacta na avaliação deste modelo.
            </p>
          )}
          </Section>)}

          {hasWarranty === true && isQActive(qc, "warrantyMonth") && (
            <Section title={getQTitle(qc, "warrantyMonth", "Até qual mês vai a garantia do seu aparelho?")}>
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
                <Btn sel={hasOriginalBox===false} onClick={() => { setHasOriginalBox(false); tq("originalBox"); }} className="flex-1">{noOpt?.label || "Não"}</Btn>
              </>;
            })()}
          </div></Section>)}
        </>
      )}

      {model && storage && !isExcluded && (
        <button onClick={handleAdvance}
          className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98] shadow-lg disabled:opacity-50"
          style={{ backgroundColor: canProceed ? "#22c55e" : "#9ca3af" }}>
          Ver minha avaliacao →
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Auto-scroll para a seção quando ela aparece
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
