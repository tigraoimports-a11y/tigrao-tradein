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
  getDiscountsForModel,
  formatBRL,
  type DeviceType,
  type ConditionData,
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

const MONTHS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function StepUsedDevice({
  usedValues,
  excludedModels,
  modelDiscounts,
  warrantyBonuses,
  onNext,
}: StepUsedDeviceProps) {
  const [line, setLine] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");
  const [hasDamage, setHasDamage] = useState<boolean | null>(null);

  const [battery, setBattery] = useState<number | null>(null);
  const [screenScratch, setScreenScratch] = useState<"none" | "one" | "multiple" | null>(null);
  const [sideScratch, setSideScratch] = useState<"none" | "one" | "multiple" | null>(null);
  const [peeling, setPeeling] = useState<"none" | "light" | "heavy" | null>(null);
  const [partsReplaced, setPartsReplaced] = useState<"no" | "apple" | "thirdParty" | null>(null);
  const [hasWarranty, setHasWarranty] = useState<boolean | null>(null);
  const [warrantyMonth, setWarrantyMonth] = useState<number | null>(null);
  const [warrantyYear, setWarrantyYear] = useState<number>(new Date().getFullYear());
  const [hasOriginalBox, setHasOriginalBox] = useState<boolean | null>(null);

  const filteredUsedValues = useMemo(() => {
    return usedValues.filter((v) => v.modelo.startsWith("iPhone"));
  }, [usedValues]);

  const allModels = useMemo(() => getUniqueUsedModels(filteredUsedValues), [filteredUsedValues]);

  const lines = useMemo(() => {
    const lineSet = new Set<string>();
    allModels.forEach((m) => {
      const match = m.match(/iPhone (\d+)/);
      if (match) lineSet.add(match[1]);
    });
    return [...lineSet].sort((a, b) => Number(a) - Number(b));
  }, [allModels]);

  const modelsInLine = useMemo(() => {
    return allModels.filter((m) => {
      const match = m.match(/iPhone (\d+)/);
      return match && match[1] === line;
    });
  }, [allModels, line]);

  const storages = useMemo(
    () => (model ? getUsedStoragesForModel(filteredUsedValues, model) : []),
    [filteredUsedValues, model]
  );

  const baseValue = useMemo(
    () => (model && storage ? getUsedBaseValue(filteredUsedValues, model, storage) : null),
    [filteredUsedValues, model, storage]
  );

  const iphoneCondition: ConditionData = {
    screenScratch: screenScratch ?? "none",
    sideScratch: sideScratch ?? "none",
    peeling: peeling ?? "none",
    battery: battery ?? 100,
    hasDamage: hasDamage === true,
    partsReplaced: partsReplaced ?? "no",
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
    if (baseValue === null || hasDamage !== false || partsReplaced === "thirdParty") return 0;
    return calculateTradeInValue(baseValue, iphoneCondition, modelDiscount, warrantyBonuses);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseValue, screenScratch, sideScratch, peeling, battery, hasDamage, partsReplaced, hasWarranty, warrantyMonth, warrantyYear, modelDiscount, hasOriginalBox]);

  const isExcluded = excludedModels.some((m) =>
    model.toLowerCase().includes(m.toLowerCase())
  );

  const batteryFilled = battery !== null && battery >= 1 && battery <= 100;
  const allConditionsFilled = screenScratch !== null && sideScratch !== null && peeling !== null && batteryFilled;
  const warrantyFilled = hasWarranty === false || (hasWarranty === true && warrantyMonth !== null);
  const partsReplacedOk = partsReplaced === "no" || partsReplaced === "apple";
  const canProceed = model && storage && baseValue !== null && !isExcluded && hasDamage === false && partsReplacedOk && allConditionsFilled && warrantyFilled && hasOriginalBox !== null;

  function handleLineChange(l: string) {
    setLine(l); setModel(""); setStorage(""); setHasDamage(null);
  }

  function handleModelChange(m: string) {
    setModel(m); setStorage(""); setHasDamage(null);
  }

  return (
    <div className="space-y-8">
      <h2 className="text-[20px] font-bold text-[#F5F5F5]">
        Qual é o modelo do seu usado?
      </h2>

      <Section title="Linha do seu iPhone">
        <div className="grid grid-cols-3 gap-2">
          {lines.map((l) => (
            <SelectButton key={l} selected={line === l} onClick={() => handleLineChange(l)}>
              {`iPhone ${l}`}
            </SelectButton>
          ))}
        </div>
      </Section>

      {line && modelsInLine.length > 0 && (
        <Section title="Modelo">
          <div className="grid grid-cols-1 gap-2">
            {modelsInLine.map((m) => (
              <SelectButton key={m} selected={model === m} onClick={() => handleModelChange(m)} className="text-left">
                {m}
              </SelectButton>
            ))}
          </div>
          {isExcluded && (
            <p className="mt-3 text-[13px] text-[#E74C3C] font-medium">
              Este modelo nao e aceito no programa de trade-in.
            </p>
          )}
        </Section>
      )}

      {model && !isExcluded && storages.length > 0 && (
        <Section title="Armazenamento">
          <div className="flex gap-2 flex-wrap">
            {storages.map((s) => (
              <SelectButton key={s} selected={storage === s} onClick={() => setStorage(s)} className="flex-1 min-w-[80px]">
                {s}
              </SelectButton>
            ))}
          </div>
        </Section>
      )}

      {model && storage && !isExcluded && (
        <Section title="O aparelho esta trincado, quebrado ou com defeito?">
          <div className="flex gap-2">
            <SelectButton selected={hasDamage === false} onClick={() => setHasDamage(false)} className="flex-1" variant="success">
              Nao
            </SelectButton>
            <SelectButton selected={hasDamage === true} onClick={() => setHasDamage(true)} className="flex-1" variant="error">
              Sim
            </SelectButton>
          </div>
          {hasDamage === true && (
            <div className="mt-4 bg-[#E74C3C]/10 border border-[#E74C3C]/30 rounded-2xl p-4 text-center">
              <p className="text-[15px] font-semibold text-[#E74C3C]">
                Infelizmente nao aceitamos aparelhos com tela trincada, quebrada ou com defeito na troca.
              </p>
            </div>
          )}
        </Section>
      )}

      {model && storage && !isExcluded && hasDamage === false && (
        <>
          <Section title="Saude da bateria">
            <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-4 space-y-3">
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
                    className="w-full px-4 py-3 pr-10 rounded-xl border border-[#2A2A2A] bg-[#0A0A0A] text-[20px] font-bold text-center text-[#F5F5F5] focus:outline-none focus:border-[#E8740E] focus:ring-2 focus:ring-[#E8740E]/20"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px] font-bold text-[#888]">%</span>
                </div>
              </div>
              <div className="bg-[#0A0A0A] rounded-xl p-3 border border-[#2A2A2A]">
                <p className="text-[12px] font-semibold text-[#F5F5F5] mb-1.5">
                  Como descobrir a saude da bateria:
                </p>
                <div className="text-[11px] text-[#888] space-y-1">
                  <p>1. Abra <strong className="text-[#F5F5F5]">Ajustes</strong> no seu iPhone</p>
                  <p>2. Toque em <strong className="text-[#F5F5F5]">Bateria</strong></p>
                  <p>3. Toque em <strong className="text-[#F5F5F5]">Saude e Carregamento da Bateria</strong></p>
                  <p>4. Veja o valor em <strong className="text-[#F5F5F5]">Capacidade Maxima</strong></p>
                </div>
              </div>
            </div>
          </Section>

          {batteryFilled && (
          <Section title="Riscos na tela">
            <div className="flex gap-2">
              {([["none", "Nenhum"], ["one", "1 risco"], ["multiple", "2 ou mais"]] as const).map(
                ([val, label]) => (
                  <SelectButton key={val} selected={screenScratch === val} onClick={() => setScreenScratch(val)} className="flex-1">
                    {label}
                  </SelectButton>
                )
              )}
            </div>
          </Section>
          )}

          {screenScratch !== null && (
          <Section title="Riscos laterais">
            <div className="flex gap-2">
              {([["none", "Nenhum"], ["one", "1 risco"], ["multiple", "2 ou mais"]] as const).map(
                ([val, label]) => (
                  <SelectButton key={val} selected={sideScratch === val} onClick={() => setSideScratch(val)} className="flex-1">
                    {label}
                  </SelectButton>
                )
              )}
            </div>
          </Section>
          )}

          {sideScratch !== null && (
          <Section title="Descascado / Amassado">
            <div className="flex gap-2">
              {([["none", "Nao"], ["light", "Leve"], ["heavy", "Forte"]] as const).map(
                ([val, label]) => (
                  <SelectButton key={val} selected={peeling === val} onClick={() => setPeeling(val)} className="flex-1">
                    {label}
                  </SelectButton>
                )
              )}
            </div>
          </Section>
          )}

          {peeling !== null && (
          <Section title="O aparelho ja teve alguma peca trocada?">
            <div className="grid grid-cols-1 gap-2">
              <SelectButton selected={partsReplaced === "no"} onClick={() => setPartsReplaced("no")} variant="success">
                Nao
              </SelectButton>
              <SelectButton selected={partsReplaced === "apple"} onClick={() => setPartsReplaced("apple")} variant="success">
                Sim, na Apple (autorizada)
              </SelectButton>
              <SelectButton selected={partsReplaced === "thirdParty"} onClick={() => setPartsReplaced("thirdParty")} variant="error">
                Sim, fora da Apple
              </SelectButton>
            </div>
            {partsReplaced === "thirdParty" && (
              <div className="mt-4 bg-[#E74C3C]/10 border border-[#E74C3C]/30 rounded-2xl p-4 text-center">
                <p className="text-[15px] font-semibold text-[#E74C3C]">
                  Infelizmente nao aceitamos aparelhos com pecas trocadas fora da rede autorizada Apple.
                </p>
              </div>
            )}
          </Section>
          )}

          {partsReplacedOk && (
          <Section title="Ainda esta na garantia Apple de 12 meses?">
            <div className="flex gap-2">
              <SelectButton selected={hasWarranty === false} onClick={() => { setHasWarranty(false); setWarrantyMonth(null); }} className="flex-1">
                Nao
              </SelectButton>
              <SelectButton selected={hasWarranty === true} onClick={() => setHasWarranty(true)} className="flex-1" variant="success">
                Sim
              </SelectButton>
            </div>
          </Section>
          )}

          {hasWarranty === true && (
            <Section title="Ate qual mes vai a garantia do seu aparelho?">
              <div className="flex gap-2 mb-3">
                {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
                  <SelectButton key={y} selected={warrantyYear === y} onClick={() => setWarrantyYear(y)} className="flex-1" variant="success">
                    {y}
                  </SelectButton>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((m, i) => (
                  <SelectButton key={i} selected={warrantyMonth === i + 1} onClick={() => setWarrantyMonth(i + 1)} variant="success">
                    {m}
                  </SelectButton>
                ))}
              </div>
            </Section>
          )}

          {warrantyFilled && (
          <Section title="Ainda tem a caixa original do aparelho?">
            <div className="flex gap-2">
              <SelectButton selected={hasOriginalBox === true} onClick={() => setHasOriginalBox(true)} className="flex-1" variant="success">
                Sim
              </SelectButton>
              <SelectButton selected={hasOriginalBox === false} onClick={() => setHasOriginalBox(false)} className="flex-1">
                Nao
              </SelectButton>
            </div>
          </Section>
          )}
        </>
      )}

      {canProceed && (
        <button
          onClick={() =>
            onNext({ usedModel: model, usedStorage: storage, condition: iphoneCondition, tradeInValue, deviceType: "iphone" })
          }
          className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white bg-[#E8740E] hover:bg-[#F5A623] transition-all duration-200 active:scale-[0.98]"
        >
          Continuar
        </button>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-fadeIn">
      <label className="block text-[14px] font-bold text-[#F5F5F5] mb-3 text-center">
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
    default: "bg-[#1E1208] text-[#E8740E] border border-[#E8740E]",
    success: "bg-[#2ECC71]/15 text-[#2ECC71] border border-[#2ECC71]/50",
    error: "bg-[#E74C3C]/15 text-[#E74C3C] border border-[#E74C3C]/50",
  };

  return (
    <button
      onClick={onClick}
      className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 ${
        selected
          ? selectedColors[variant]
          : "bg-[#141414] text-[#F5F5F5] border border-[#2A2A2A] hover:bg-[#1A1A1A]"
      } ${className}`}
    >
      {children}
    </button>
  );
}
