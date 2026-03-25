"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import type { UsedDeviceValue, TradeInQuestion } from "@/lib/types";
import { getUniqueUsedModels, getUsedStoragesForModel, getUsedBaseValue } from "@/lib/sheets";
import {
  calculateTradeInValue, getDiscountsForModel, formatBRL,
  type DeviceType, type ConditionData, type AnyConditionData, type ModelDiscounts, type WarrantyBonuses,
} from "@/lib/calculations";

interface StepUsedDeviceProps {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  modelDiscounts?: Record<string, ModelDiscounts>;
  warrantyBonuses?: WarrantyBonuses;
  questionsConfig?: TradeInQuestion[] | null;
  onNext: (data: { usedModel: string; usedStorage: string; condition: AnyConditionData; tradeInValue: number; deviceType: DeviceType }) => void;
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
  const [hasDamage, setHasDamage] = useState<boolean | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [screenScratch, setScreenScratch] = useState<"none"|"one"|"multiple"|null>(null);
  const [sideScratch, setSideScratch] = useState<"none"|"one"|"multiple"|null>(null);
  const [peeling, setPeeling] = useState<"none"|"light"|"heavy"|null>(null);
  const [partsReplaced, setPartsReplaced] = useState<"no"|"apple"|"thirdParty"|null>(null);
  const [partsReplacedDetail, setPartsReplacedDetail] = useState("");
  const [hasWarranty, setHasWarranty] = useState<boolean|null>(null);
  const [warrantyMonth, setWarrantyMonth] = useState<number|null>(null);
  const [warrantyYear, setWarrantyYear] = useState<number>(new Date().getFullYear());
  const [hasOriginalBox, setHasOriginalBox] = useState<boolean|null>(null);

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

  const cond: ConditionData = {
    screenScratch: screenScratch ?? "none", sideScratch: sideScratch ?? "none", peeling: peeling ?? "none",
    battery: battery ?? 100, hasDamage: hasDamage === true, partsReplaced: partsReplaced ?? "no",
    partsReplacedDetail: partsReplaced === "apple" ? partsReplacedDetail : "",
    hasWarranty: hasWarranty === true, warrantyMonth: hasWarranty ? warrantyMonth : null,
    warrantyYear: hasWarranty ? warrantyYear : null, hasOriginalBox: hasOriginalBox === true,
  };

  const md = useMemo(() => getDiscountsForModel(model, modelDiscounts), [model, modelDiscounts]);
  const tradeInValue = useMemo(() => {
    if (baseValue === null || (isQActive(qc, "hasDamage") && hasDamage !== false) || (isQActive(qc, "partsReplaced") && partsReplaced === "thirdParty")) return 0;
    return calculateTradeInValue(baseValue, cond, md, warrantyBonuses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseValue, screenScratch, sideScratch, peeling, battery, hasDamage, partsReplaced, hasWarranty, warrantyMonth, warrantyYear, md, hasOriginalBox]);

  const isExcluded = excludedModels.some((m) => model.toLowerCase().includes(m.toLowerCase()));
  const batteryFilled = !isQActive(qc, "battery") || (battery !== null && battery >= 1 && battery <= 100);
  const screenOk = !isQActive(qc, "screenScratch") || screenScratch !== null;
  const sideOk = !isQActive(qc, "sideScratch") || sideScratch !== null;
  const peelingOk = !isQActive(qc, "peeling") || peeling !== null;
  const allCond = screenOk && sideOk && peelingOk && batteryFilled;
  const damageOk = !isQActive(qc, "hasDamage") || hasDamage === false;
  const warrantyFilled = !isQActive(qc, "hasWarranty") || hasWarranty === false || (hasWarranty === true && (!isQActive(qc, "warrantyMonth") || warrantyMonth !== null));
  const partsOk = !isQActive(qc, "partsReplaced") || partsReplaced === "no" || partsReplaced === "apple";
  const boxOk = !isQActive(qc, "hasOriginalBox") || hasOriginalBox !== null;
  const canProceed = model && storage && baseValue !== null && !isExcluded && damageOk && partsOk && allCond && warrantyFilled && boxOk;

  const tq = (q: string) => onTrackQuestion?.(1, q);
  function handleLineChange(l: string) { setLine(l); setModel(""); setStorage(""); setHasDamage(null); tq("line"); }
  function handleModelChange(m: string) { setModel(m); setStorage(""); setHasDamage(null); tq("model"); }

  return (
    <div className="space-y-8">
      <h2 className="text-[20px] font-bold" style={{ color: "var(--ti-text)" }}>Qual é o modelo do seu usado?</h2>

      <Section title="Linha do seu iPhone">
        <div className="grid grid-cols-3 gap-2">
          {lines.map((l) => <Btn key={l} sel={line===l} onClick={() => handleLineChange(l)}>{`iPhone ${l}`}</Btn>)}
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
              <div className="rounded-xl p-3" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
                <p className="text-[12px] font-semibold mb-1.5" style={{ color: "var(--ti-text)" }}>Como descobrir a saúde da bateria:</p>
                <div className="text-[11px] space-y-1" style={{ color: "var(--ti-muted)" }}>
                  <p>1. Abra <strong style={{ color: "var(--ti-text)" }}>Ajustes</strong> no seu iPhone</p>
                  <p>2. Toque em <strong style={{ color: "var(--ti-text)" }}>Bateria</strong></p>
                  <p>3. Toque em <strong style={{ color: "var(--ti-text)" }}>Saúde e Carregamento da Bateria</strong></p>
                  <p>4. Veja o valor em <strong style={{ color: "var(--ti-text)" }}>Capacidade Máxima</strong></p>
                </div>
              </div>
            </div>
          </Section>

          {batteryFilled && isQActive(qc, "screenScratch") && <Section title={getQTitle(qc, "screenScratch", "Riscos na tela")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "screenScratch");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Nenhum"],["one","1 risco"],["multiple","2 ou mais"]];
              return items.map(([v,l]) => <Btn key={v} sel={screenScratch===v} onClick={() => { setScreenScratch(v as typeof screenScratch); tq("screenScratch"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {screenScratch !== null && isQActive(qc, "sideScratch") && <Section title={getQTitle(qc, "sideScratch", "Riscos laterais")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "sideScratch");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Nenhum"],["one","1 risco"],["multiple","2 ou mais"]];
              return items.map(([v,l]) => <Btn key={v} sel={sideScratch===v} onClick={() => { setSideScratch(v as typeof sideScratch); tq("sideScratch"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {sideScratch !== null && isQActive(qc, "peeling") && <Section title={getQTitle(qc, "peeling", "Descascado / Amassado")}><div className="flex gap-2">
            {(() => {
              const opts = getQOptions(qc, "peeling");
              const items: [string, string][] = opts.length > 0
                ? opts.map(o => [o.value, o.label])
                : [["none","Não"],["light","Leve"],["heavy","Forte"]];
              return items.map(([v,l]) => <Btn key={v} sel={peeling===v} onClick={() => { setPeeling(v as typeof peeling); tq("peeling"); }} className="flex-1">{l}</Btn>);
            })()}
          </div></Section>}

          {peeling !== null && isQActive(qc, "partsReplaced") && (
          <Section title={getQTitle(qc, "partsReplaced", "O aparelho já teve alguma peça trocada?")}>
            {(() => {
              const opts = getQOptions(qc, "partsReplaced");
              const noOpt = opts.find(o => o.value === "no");
              const appleOpt = opts.find(o => o.value === "apple");
              const tpOpt = opts.find(o => o.value === "thirdParty");
              const partsConfig = getQ(qc, "partsReplaced")?.config || {};
              return <>
                <div className="grid grid-cols-1 gap-2">
                  <Btn sel={partsReplaced==="no"} onClick={() => { setPartsReplaced("no"); tq("partsReplaced"); }} variant="success">{noOpt?.label || "Não"}</Btn>
                  <Btn sel={partsReplaced==="apple"} onClick={() => { setPartsReplaced("apple"); tq("partsReplaced"); }} variant="success">{appleOpt?.label || "Sim, na Apple (autorizada)"}</Btn>
                  <Btn sel={partsReplaced==="thirdParty"} onClick={() => { setPartsReplaced("thirdParty"); tq("partsReplaced"); }} variant="error">{tpOpt?.label || "Sim, fora da Apple"}</Btn>
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
          </div></Section>)}

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

      {canProceed && (
        <button onClick={() => onNext({ usedModel: model, usedStorage: storage, condition: cond, tradeInValue, deviceType: "iphone" })}
          className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
          style={{ backgroundColor: "var(--ti-accent)" }}>
          Continuar
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

function Btn({ sel, onClick, children, className = "", variant = "default" }: {
  sel: boolean; onClick: () => void; children: React.ReactNode; className?: string; variant?: "default"|"success"|"error";
}) {
  const selStyle = variant === "success"
    ? { backgroundColor: "var(--ti-success-light)", color: "var(--ti-success)", border: "1px solid var(--ti-success)" }
    : variant === "error"
    ? { backgroundColor: "var(--ti-error-light)", color: "var(--ti-error)", border: "1px solid var(--ti-error)" }
    : { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" };
  const unselStyle = { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" };

  return (
    <button onClick={onClick} className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 ${className}`}
      style={sel ? selStyle : unselStyle}>
      {children}
    </button>
  );
}
