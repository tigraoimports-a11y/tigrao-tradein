"use client";

import { useState, useMemo } from "react";
import type { UsedDeviceValue } from "@/lib/types";
import {
  getUniqueUsedModels,
  getUsedStoragesForModel,
  getUsedBaseValue,
} from "@/lib/sheets";
import {
  calculateTradeInValue,
  calculateIPadTradeInValue,
  calculateMacBookTradeInValue,
  getDiscountsForModel,
  formatBRL,
  type DeviceType,
  type ConditionData,
  type IPadConditionData,
  type MacBookConditionData,
  type AnyConditionData,
  type ModelDiscounts,
  type WarrantyBonuses,
} from "@/lib/calculations";

interface StepUsedDeviceProps {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  modelDiscounts?: Record<string, ModelDiscounts>;
  warrantyBonuses?: WarrantyBonuses;
  onNext: (data: {
    usedModel: string;
    usedStorage: string;
    condition: AnyConditionData;
    tradeInValue: number;
    deviceType: DeviceType;
  }) => void;
}

function getLineFromModel(model: string): string {
  // iPhone: "iPhone 17 Air" -> "17"
  const iphoneMatch = model.match(/iPhone (\d+)/);
  if (iphoneMatch) return iphoneMatch[1];
  // iPad: "iPad Pro 13\" M4" -> "iPad Pro 13\""
  // MacBook: "MacBook Air M4 15\"" -> "MacBook Air"
  return model;
}

function getDeviceCategory(model: string): DeviceType {
  if (model.startsWith("iPad")) return "ipad";
  if (model.startsWith("MacBook")) return "macbook";
  return "iphone";
}

// Para iPads, agrupamos por "linha" (iPad 10, iPad Air, iPad Pro)
function getIPadLine(model: string): string {
  if (model.startsWith("iPad Pro")) return "iPad Pro";
  if (model.startsWith("iPad Air")) return "iPad Air";
  if (model.startsWith("iPad Mini")) return "iPad Mini";
  return "iPad";
}

// Para MacBooks, agrupamos por tipo (Air vs Pro)
function getMacBookLine(model: string): string {
  if (model.includes("Pro M4 Max")) return "MacBook Pro M4 Max";
  if (model.includes("Pro M4 Pro")) return "MacBook Pro M4 Pro";
  if (model.includes("Pro M4")) return "MacBook Pro M4";
  if (model.includes("Air M4")) return "MacBook Air M4";
  if (model.includes("Air M3")) return "MacBook Air M3";
  if (model.includes("Air M2")) return "MacBook Air M2";
  return "MacBook";
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const DEVICE_TYPE_OPTIONS: { value: DeviceType; label: string }[] = [
  { value: "iphone", label: "iPhone" },
  { value: "ipad", label: "iPad" },
  { value: "macbook", label: "MacBook" },
];

export default function StepUsedDevice({
  usedValues,
  excludedModels,
  modelDiscounts,
  warrantyBonuses,
  onNext,
}: StepUsedDeviceProps) {
  const [deviceType, setDeviceType] = useState<DeviceType>("iphone");
  const [line, setLine] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");
  const [hasDamage, setHasDamage] = useState<boolean | null>(null);

  // iPhone / iPad fields
  const [battery, setBattery] = useState<number | null>(null);
  const [screenScratch, setScreenScratch] = useState<"none" | "one" | "multiple" | null>(null);
  const [sideScratch, setSideScratch] = useState<"none" | "one" | "multiple" | null>(null);
  const [peeling, setPeeling] = useState<"none" | "light" | "heavy" | null>(null);
  const [hasWarranty, setHasWarranty] = useState<boolean | null>(null);
  const [warrantyMonth, setWarrantyMonth] = useState<number | null>(null);
  const [warrantyYear, setWarrantyYear] = useState<number>(new Date().getFullYear());
  const [hasOriginalBox, setHasOriginalBox] = useState<boolean | null>(null);

  // iPad-specific
  const [hasApplePencil, setHasApplePencil] = useState<boolean | null>(null);

  // MacBook-specific
  const [bodyScratch, setBodyScratch] = useState<"none" | "light" | "heavy" | null>(null);
  const [batteryCycles, setBatteryCycles] = useState<number | null>(null);
  const [keyboardCondition, setKeyboardCondition] = useState<"perfect" | "sticky" | null>(null);
  const [hasCharger, setHasCharger] = useState<boolean | null>(null);

  // Filter usedValues by device type
  const filteredUsedValues = useMemo(() => {
    return usedValues.filter((v) => getDeviceCategory(v.modelo) === deviceType);
  }, [usedValues, deviceType]);

  const allModels = useMemo(() => getUniqueUsedModels(filteredUsedValues), [filteredUsedValues]);

  const lines = useMemo(() => {
    if (deviceType === "iphone") {
      const lineSet = new Set<string>();
      allModels.forEach((m) => {
        const match = m.match(/iPhone (\d+)/);
        if (match) lineSet.add(match[1]);
      });
      return [...lineSet].sort((a, b) => Number(a) - Number(b));
    }
    if (deviceType === "ipad") {
      const lineSet = new Set<string>();
      allModels.forEach((m) => lineSet.add(getIPadLine(m)));
      return [...lineSet].sort();
    }
    // macbook
    const lineSet = new Set<string>();
    allModels.forEach((m) => lineSet.add(getMacBookLine(m)));
    return [...lineSet].sort();
  }, [allModels, deviceType]);

  const modelsInLine = useMemo(() => {
    if (deviceType === "iphone") {
      return allModels.filter((m) => {
        const match = m.match(/iPhone (\d+)/);
        return match && match[1] === line;
      });
    }
    if (deviceType === "ipad") {
      return allModels.filter((m) => getIPadLine(m) === line);
    }
    return allModels.filter((m) => getMacBookLine(m) === line);
  }, [allModels, line, deviceType]);

  const storages = useMemo(
    () => (model ? getUsedStoragesForModel(filteredUsedValues, model) : []),
    [filteredUsedValues, model]
  );

  const baseValue = useMemo(
    () => (model && storage ? getUsedBaseValue(filteredUsedValues, model, storage) : null),
    [filteredUsedValues, model, storage]
  );

  // Build condition objects
  const iphoneCondition: ConditionData = {
    screenScratch: screenScratch ?? "none",
    sideScratch: sideScratch ?? "none",
    peeling: peeling ?? "none",
    battery: battery ?? 100,
    hasDamage: hasDamage === true,
    hasWarranty: hasWarranty === true,
    warrantyMonth: hasWarranty ? warrantyMonth : null,
    warrantyYear: hasWarranty ? warrantyYear : null,
    hasOriginalBox: hasOriginalBox === true,
  };

  const ipadCondition: IPadConditionData = {
    ...iphoneCondition,
    hasApplePencil: hasApplePencil === true,
  };

  const macbookCondition: MacBookConditionData = {
    screenScratch: screenScratch ?? "none",
    bodyScratch: bodyScratch ?? "none",
    batteryCycles: batteryCycles ?? 0,
    keyboardCondition: keyboardCondition ?? "perfect",
    hasCharger: hasCharger === true,
    hasDamage: hasDamage === true,
    hasWarranty: hasWarranty === true,
    warrantyMonth: hasWarranty ? warrantyMonth : null,
    warrantyYear: hasWarranty ? warrantyYear : null,
    hasOriginalBox: hasOriginalBox === true,
  };

  const modelDiscount = useMemo(
    () => getDiscountsForModel(model, modelDiscounts),
    [model, modelDiscounts]
  );

  const tradeInValue = useMemo(() => {
    if (baseValue === null || hasDamage !== false) return 0;

    if (deviceType === "ipad") {
      return calculateIPadTradeInValue(baseValue, ipadCondition, warrantyBonuses);
    }
    if (deviceType === "macbook") {
      return calculateMacBookTradeInValue(baseValue, macbookCondition, warrantyBonuses);
    }
    return calculateTradeInValue(baseValue, iphoneCondition, modelDiscount, warrantyBonuses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseValue, screenScratch, sideScratch, peeling, battery, hasDamage, hasWarranty, warrantyMonth, warrantyYear, modelDiscount, deviceType, hasApplePencil, bodyScratch, batteryCycles, keyboardCondition, hasCharger, hasOriginalBox]);

  const isExcluded = excludedModels.some((m) =>
    model.toLowerCase().includes(m.toLowerCase())
  );

  // Validation: all fields required
  const batteryFilled = deviceType !== "macbook" ? (battery !== null && battery >= 1 && battery <= 100) : true;
  const cyclesFilled = deviceType === "macbook" ? (batteryCycles !== null && batteryCycles >= 0) : true;

  const allConditionsFilled = (() => {
    if (deviceType === "macbook") {
      return screenScratch !== null && bodyScratch !== null && cyclesFilled && keyboardCondition !== null && hasCharger !== null;
    }
    // iPhone & iPad
    const baseFilled = screenScratch !== null && sideScratch !== null && peeling !== null && batteryFilled;
    if (deviceType === "ipad") {
      return baseFilled && hasApplePencil !== null;
    }
    return baseFilled;
  })();

  const warrantyFilled = hasWarranty === false || (hasWarranty === true && warrantyMonth !== null);
  const canProceed = model && storage && baseValue !== null && !isExcluded && hasDamage === false && allConditionsFilled && warrantyFilled && hasOriginalBox !== null;

  function handleDeviceTypeChange(dt: DeviceType) {
    setDeviceType(dt);
    setLine("");
    setModel("");
    setStorage("");
    resetConditions();
  }

  function handleLineChange(l: string) {
    setLine(l);
    setModel("");
    setStorage("");
    setHasDamage(null);
  }

  function handleModelChange(m: string) {
    setModel(m);
    setStorage("");
    setHasDamage(null);
  }

  function resetConditions() {
    setHasDamage(null);
    setBattery(null);
    setScreenScratch(null);
    setSideScratch(null);
    setPeeling(null);
    setHasWarranty(null);
    setWarrantyMonth(null);
    setWarrantyYear(new Date().getFullYear());
    setHasOriginalBox(null);
    setHasApplePencil(null);
    setBodyScratch(null);
    setBatteryCycles(null);
    setKeyboardCondition(null);
    setHasCharger(null);
  }

  function getCurrentCondition(): AnyConditionData {
    if (deviceType === "ipad") return ipadCondition;
    if (deviceType === "macbook") return macbookCondition;
    return iphoneCondition;
  }

  const lineLabel = deviceType === "iphone" ? "Linha do seu iPhone" : deviceType === "ipad" ? "Linha do seu iPad" : "Linha do seu MacBook";

  return (
    <div className="space-y-8">
      {/* Título principal */}
      <h2 className="text-[20px] font-bold text-[#1D1D1F]">
        Qual é o modelo do seu usado?
      </h2>

      {/* Device Type Selector */}
      <Section title="Tipo de aparelho">
        <div className="grid grid-cols-3 gap-2">
          {DEVICE_TYPE_OPTIONS.map((opt) => (
            <SelectButton
              key={opt.value}
              selected={deviceType === opt.value}
              onClick={() => handleDeviceTypeChange(opt.value)}
            >
              {opt.label}
            </SelectButton>
          ))}
        </div>
      </Section>

      {/* Linha */}
      <Section title={lineLabel}>
        <div className={`grid ${deviceType === "iphone" ? "grid-cols-3" : "grid-cols-1"} gap-2`}>
          {lines.map((l) => (
            <SelectButton
              key={l}
              selected={line === l}
              onClick={() => handleLineChange(l)}
            >
              {deviceType === "iphone" ? `iPhone ${l}` : l}
            </SelectButton>
          ))}
        </div>
      </Section>

      {/* Modelo dentro da linha */}
      {line && modelsInLine.length > 0 && (
        <Section title="Modelo">
          <div className="grid grid-cols-1 gap-2">
            {modelsInLine.map((m) => (
              <SelectButton
                key={m}
                selected={model === m}
                onClick={() => handleModelChange(m)}
                className="text-left"
              >
                {m}
              </SelectButton>
            ))}
          </div>
          {isExcluded && (
            <p className="mt-3 text-[13px] text-[#FF3B30] font-medium">
              Este modelo nao e aceito no programa de trade-in.
            </p>
          )}
        </Section>
      )}

      {/* Storage */}
      {model && !isExcluded && storages.length > 0 && (
        <Section title="Armazenamento">
          <div className="flex gap-2 flex-wrap">
            {storages.map((s) => (
              <SelectButton
                key={s}
                selected={storage === s}
                onClick={() => setStorage(s)}
                className="flex-1 min-w-[80px]"
              >
                {s}
              </SelectButton>
            ))}
          </div>
        </Section>
      )}

      {/* Dano / Defeito - BLOQUEIO */}
      {model && storage && !isExcluded && (
        <Section title="O aparelho esta trincado, quebrado ou com defeito?">
          <div className="flex gap-2">
            <SelectButton
              selected={hasDamage === false}
              onClick={() => setHasDamage(false)}
              className="flex-1"
              variant="success"
            >
              Nao
            </SelectButton>
            <SelectButton
              selected={hasDamage === true}
              onClick={() => setHasDamage(true)}
              className="flex-1"
              variant="error"
            >
              Sim
            </SelectButton>
          </div>
          {hasDamage === true && (
            <div className="mt-4 bg-[#FFF5F5] border border-[#FF3B30]/20 rounded-2xl p-4 text-center">
              <p className="text-[15px] font-semibold text-[#FF3B30]">
                Infelizmente nao aceitamos aparelhos com tela trincada, quebrada ou com defeito na troca.
              </p>
            </div>
          )}
        </Section>
      )}

      {/* Condição - só aparece se NÃO tem dano */}
      {model && storage && !isExcluded && hasDamage === false && (
        <>
          {/* ──── iPhone / iPad conditions ──── */}
          {(deviceType === "iphone" || deviceType === "ipad") && (
            <>
              {/* Bateria */}
              <Section title="Saude da bateria">
                <div className="bg-[#F5F5F7] rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={battery ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          if (raw === "") { setBattery(null); return; }
                          const val = Math.min(100, Number(raw));
                          setBattery(val);
                        }}
                        placeholder="Ex: 87"
                        className="w-full px-4 py-3 pr-10 rounded-xl border border-[#D2D2D7] bg-white text-[20px] font-bold text-center text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold text-[#86868B]">%</span>
                    </div>
                  </div>
                  {/* Passo a passo */}
                  <div className="bg-white rounded-xl p-3 border border-[#E5E5EA]">
                    <p className="text-[12px] font-semibold text-[#1D1D1F] mb-1.5">
                      {deviceType === "ipad" ? "Como descobrir a saude da bateria:" : "Como descobrir a saude da bateria:"}
                    </p>
                    <div className="text-[11px] text-[#6E6E73] space-y-1">
                      <p>1. Abra <strong>Ajustes</strong> no seu {deviceType === "ipad" ? "iPad" : "iPhone"}</p>
                      <p>2. Toque em <strong>Bateria</strong></p>
                      <p>3. Toque em <strong>Saude e Carregamento da Bateria</strong></p>
                      <p>4. Veja o valor em <strong>Capacidade Maxima</strong></p>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Riscos na tela */}
              {batteryFilled && (
              <Section title="Riscos na tela">
                <div className="flex gap-2">
                  {([["none", "Nenhum"], ["one", "1 risco"], ["multiple", "2 ou mais"]] as const).map(
                    ([val, label]) => (
                      <SelectButton
                        key={val}
                        selected={screenScratch === val}
                        onClick={() => setScreenScratch(val)}
                        className="flex-1"
                      >
                        {label}
                      </SelectButton>
                    )
                  )}
                </div>
              </Section>
              )}

              {/* Riscos laterais */}
              {screenScratch !== null && (
              <Section title="Riscos laterais">
                <div className="flex gap-2">
                  {([["none", "Nenhum"], ["one", "1 risco"], ["multiple", "2 ou mais"]] as const).map(
                    ([val, label]) => (
                      <SelectButton
                        key={val}
                        selected={sideScratch === val}
                        onClick={() => setSideScratch(val)}
                        className="flex-1"
                      >
                        {label}
                      </SelectButton>
                    )
                  )}
                </div>
              </Section>
              )}

              {/* Descascado/Amassado */}
              {sideScratch !== null && (
              <Section title="Descascado / Amassado">
                <div className="flex gap-2">
                  {([["none", "Nao"], ["light", "Leve"], ["heavy", "Forte"]] as const).map(
                    ([val, label]) => (
                      <SelectButton
                        key={val}
                        selected={peeling === val}
                        onClick={() => setPeeling(val)}
                        className="flex-1"
                      >
                        {label}
                      </SelectButton>
                    )
                  )}
                </div>
              </Section>
              )}

              {/* Apple Pencil (iPad only) */}
              {deviceType === "ipad" && peeling !== null && (
              <Section title="Acompanha Apple Pencil?">
                <div className="flex gap-2">
                  <SelectButton
                    selected={hasApplePencil === true}
                    onClick={() => setHasApplePencil(true)}
                    className="flex-1"
                    variant="success"
                  >
                    Sim
                  </SelectButton>
                  <SelectButton
                    selected={hasApplePencil === false}
                    onClick={() => setHasApplePencil(false)}
                    className="flex-1"
                  >
                    Nao
                  </SelectButton>
                </div>
              </Section>
              )}

              {/* Garantia Apple */}
              {((deviceType === "iphone" && peeling !== null) || (deviceType === "ipad" && hasApplePencil !== null)) && (
              <Section title="Ainda esta na garantia Apple de 12 meses?">
                <div className="flex gap-2">
                  <SelectButton
                    selected={hasWarranty === false}
                    onClick={() => { setHasWarranty(false); setWarrantyMonth(null); }}
                    className="flex-1"
                  >
                    Nao
                  </SelectButton>
                  <SelectButton
                    selected={hasWarranty === true}
                    onClick={() => setHasWarranty(true)}
                    className="flex-1"
                    variant="success"
                  >
                    Sim
                  </SelectButton>
                </div>
              </Section>
              )}

              {/* Garantia mês/ano */}
              {hasWarranty === true && (
                <Section title="Ate qual mes vai a garantia do seu aparelho?">
                  <div className="flex gap-2 mb-3">
                    {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                      <SelectButton
                        key={y}
                        selected={warrantyYear === y}
                        onClick={() => setWarrantyYear(y)}
                        className="flex-1"
                        variant="success"
                      >
                        {y}
                      </SelectButton>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {MONTHS.map((m, i) => (
                      <SelectButton
                        key={i}
                        selected={warrantyMonth === i + 1}
                        onClick={() => setWarrantyMonth(i + 1)}
                        variant="success"
                      >
                        {m}
                      </SelectButton>
                    ))}
                  </div>
                </Section>
              )}

              {/* Caixa original */}
              {warrantyFilled && (
              <Section title="Ainda tem a caixa original do aparelho?">
                <div className="flex gap-2">
                  <SelectButton
                    selected={hasOriginalBox === true}
                    onClick={() => setHasOriginalBox(true)}
                    className="flex-1"
                    variant="success"
                  >
                    Sim
                  </SelectButton>
                  <SelectButton
                    selected={hasOriginalBox === false}
                    onClick={() => setHasOriginalBox(false)}
                    className="flex-1"
                  >
                    Nao
                  </SelectButton>
                </div>
              </Section>
              )}
            </>
          )}

          {/* ──── MacBook conditions ──── */}
          {deviceType === "macbook" && (
            <>
              {/* Ciclos de bateria */}
              <Section title="Contagem de ciclos da bateria">
                <div className="bg-[#F5F5F7] rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={batteryCycles ?? ""}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, "");
                          if (raw === "") { setBatteryCycles(null); return; }
                          setBatteryCycles(Number(raw));
                        }}
                        placeholder="Ex: 150"
                        className="w-full px-4 py-3 pr-16 rounded-xl border border-[#D2D2D7] bg-white text-[20px] font-bold text-center text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#86868B]">ciclos</span>
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-3 border border-[#E5E5EA]">
                    <p className="text-[12px] font-semibold text-[#1D1D1F] mb-1.5">Como ver os ciclos de bateria:</p>
                    <div className="text-[11px] text-[#6E6E73] space-y-1">
                      <p>1. Clique no menu  (Apple) no canto superior esquerdo</p>
                      <p>2. Clique em <strong>Ajustes do Sistema</strong></p>
                      <p>3. Va em <strong>Geral</strong> &gt; <strong>Sobre</strong></p>
                      <p>4. Role ate <strong>Relatorio do Sistema</strong> &gt; <strong>Energia</strong></p>
                      <p>5. Veja o <strong>Contagem de Ciclos</strong></p>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Riscos na tela */}
              {cyclesFilled && batteryCycles !== null && (
              <Section title="Riscos na tela">
                <div className="flex gap-2">
                  {([["none", "Nenhum"], ["one", "1 risco"], ["multiple", "2 ou mais"]] as const).map(
                    ([val, label]) => (
                      <SelectButton
                        key={val}
                        selected={screenScratch === val}
                        onClick={() => setScreenScratch(val)}
                        className="flex-1"
                      >
                        {label}
                      </SelectButton>
                    )
                  )}
                </div>
              </Section>
              )}

              {/* Arranhoes no corpo */}
              {screenScratch !== null && (
              <Section title="Arranhoes no corpo (carcaca)">
                <div className="flex gap-2">
                  {([["none", "Nenhum"], ["light", "Leves"], ["heavy", "Fortes"]] as const).map(
                    ([val, label]) => (
                      <SelectButton
                        key={val}
                        selected={bodyScratch === val}
                        onClick={() => setBodyScratch(val)}
                        className="flex-1"
                      >
                        {label}
                      </SelectButton>
                    )
                  )}
                </div>
              </Section>
              )}

              {/* Teclado */}
              {bodyScratch !== null && (
              <Section title="Condicao do teclado">
                <div className="flex gap-2">
                  <SelectButton
                    selected={keyboardCondition === "perfect"}
                    onClick={() => setKeyboardCondition("perfect")}
                    className="flex-1"
                    variant="success"
                  >
                    Perfeito
                  </SelectButton>
                  <SelectButton
                    selected={keyboardCondition === "sticky"}
                    onClick={() => setKeyboardCondition("sticky")}
                    className="flex-1"
                    variant="error"
                  >
                    Teclas grudando
                  </SelectButton>
                </div>
              </Section>
              )}

              {/* Carregador */}
              {keyboardCondition !== null && (
              <Section title="Acompanha carregador?">
                <div className="flex gap-2">
                  <SelectButton
                    selected={hasCharger === true}
                    onClick={() => setHasCharger(true)}
                    className="flex-1"
                    variant="success"
                  >
                    Sim
                  </SelectButton>
                  <SelectButton
                    selected={hasCharger === false}
                    onClick={() => setHasCharger(false)}
                    className="flex-1"
                  >
                    Nao
                  </SelectButton>
                </div>
              </Section>
              )}

              {/* Garantia Apple */}
              {hasCharger !== null && (
              <Section title="Ainda esta na garantia Apple de 12 meses?">
                <div className="flex gap-2">
                  <SelectButton
                    selected={hasWarranty === false}
                    onClick={() => { setHasWarranty(false); setWarrantyMonth(null); }}
                    className="flex-1"
                  >
                    Nao
                  </SelectButton>
                  <SelectButton
                    selected={hasWarranty === true}
                    onClick={() => setHasWarranty(true)}
                    className="flex-1"
                    variant="success"
                  >
                    Sim
                  </SelectButton>
                </div>
              </Section>
              )}

              {/* Garantia mês/ano */}
              {hasWarranty === true && (
                <Section title="Ate qual mes vai a garantia do seu aparelho?">
                  <div className="flex gap-2 mb-3">
                    {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                      <SelectButton
                        key={y}
                        selected={warrantyYear === y}
                        onClick={() => setWarrantyYear(y)}
                        className="flex-1"
                        variant="success"
                      >
                        {y}
                      </SelectButton>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {MONTHS.map((m, i) => (
                      <SelectButton
                        key={i}
                        selected={warrantyMonth === i + 1}
                        onClick={() => setWarrantyMonth(i + 1)}
                        variant="success"
                      >
                        {m}
                      </SelectButton>
                    ))}
                  </div>
                </Section>
              )}

              {/* Caixa original */}
              {warrantyFilled && (
              <Section title="Ainda tem a caixa original do aparelho?">
                <div className="flex gap-2">
                  <SelectButton
                    selected={hasOriginalBox === true}
                    onClick={() => setHasOriginalBox(true)}
                    className="flex-1"
                    variant="success"
                  >
                    Sim
                  </SelectButton>
                  <SelectButton
                    selected={hasOriginalBox === false}
                    onClick={() => setHasOriginalBox(false)}
                    className="flex-1"
                  >
                    Nao
                  </SelectButton>
                </div>
              </Section>
              )}
            </>
          )}
        </>
      )}

      {/* Botão próximo */}
      {canProceed && (
        <button
          onClick={() =>
            onNext({ usedModel: model, usedStorage: storage, condition: getCurrentCondition(), tradeInValue, deviceType })
          }
          className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] transition-all duration-200 active:scale-[0.98]"
        >
          Continuar
        </button>
      )}
    </div>
  );
}

// Reusable components

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-fadeIn">
      <label className="block text-[14px] font-bold text-[#1D1D1F] mb-3 text-center">
        {title}
      </label>
      {children}
    </div>
  );
}

function SelectButton({
  selected,
  onClick,
  children,
  className = "",
  variant = "default",
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "success" | "error";
}) {
  const selectedColors = {
    default: "bg-[#0071E3] text-white shadow-sm",
    success: "bg-[#34C759] text-white shadow-sm",
    error: "bg-[#FF3B30] text-white shadow-sm",
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 ${
        selected
          ? selectedColors[variant]
          : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"
      } ${className}`}
    >
      {children}
    </button>
  );
}
