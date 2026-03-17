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
  calculateWarrantyBonus,
  formatBRL,
  type ConditionData,
} from "@/lib/calculations";

interface StepUsedDeviceProps {
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  onNext: (data: {
    usedModel: string;
    usedStorage: string;
    condition: ConditionData;
    tradeInValue: number;
  }) => void;
}

function getLineFromModel(model: string): string {
  // Handle "iPhone 17 Air" -> "17"
  const match = model.match(/iPhone (\d+)/);
  return match ? match[1] : model;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function StepUsedDevice({
  usedValues,
  excludedModels,
  onNext,
}: StepUsedDeviceProps) {
  const [line, setLine] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");
  const [hasDamage, setHasDamage] = useState<boolean | null>(null);
  const [battery, setBattery] = useState(100);
  const [screenScratch, setScreenScratch] = useState<"none" | "one" | "multiple">("none");
  const [sideScratch, setSideScratch] = useState<"none" | "one" | "multiple">("none");
  const [peeling, setPeeling] = useState<"none" | "light" | "heavy">("none");
  const [hasWarranty, setHasWarranty] = useState<boolean | null>(null);
  const [warrantyMonth, setWarrantyMonth] = useState<number | null>(null);

  const allModels = useMemo(() => getUniqueUsedModels(usedValues), [usedValues]);

  const lines = useMemo(() => {
    const lineSet = new Set<string>();
    allModels.forEach((m) => lineSet.add(getLineFromModel(m)));
    return [...lineSet].sort((a, b) => Number(a) - Number(b));
  }, [allModels]);

  const modelsInLine = useMemo(
    () => allModels.filter((m) => getLineFromModel(m) === line),
    [allModels, line]
  );

  const storages = useMemo(
    () => (model ? getUsedStoragesForModel(usedValues, model) : []),
    [usedValues, model]
  );

  const baseValue = useMemo(
    () => (model && storage ? getUsedBaseValue(usedValues, model, storage) : null),
    [usedValues, model, storage]
  );

  const condition: ConditionData = {
    screenScratch, sideScratch, peeling, battery,
    hasDamage: hasDamage === true,
    hasWarranty: hasWarranty === true,
    warrantyMonth: hasWarranty ? warrantyMonth : null,
  };

  const tradeInValue = useMemo(
    () => (baseValue !== null && hasDamage === false ? calculateTradeInValue(baseValue, condition) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseValue, screenScratch, sideScratch, peeling, battery, hasDamage, hasWarranty, warrantyMonth]
  );

  const isExcluded = excludedModels.some((m) =>
    model.toLowerCase().includes(m.toLowerCase())
  );

  const canProceed = model && storage && baseValue !== null && !isExcluded && hasDamage === false;

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

  const warrantyBonusText = warrantyMonth !== null
    ? calculateWarrantyBonus(warrantyMonth)
    : 0;

  return (
    <div className="space-y-8">
      {/* Linha */}
      <Section title="Linha do seu iPhone">
        <div className="grid grid-cols-3 gap-2">
          {lines.map((l) => (
            <SelectButton
              key={l}
              selected={line === l}
              onClick={() => handleLineChange(l)}
            >
              iPhone {l}
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
          <div className="flex gap-2">
            {storages.map((s) => (
              <SelectButton
                key={s}
                selected={storage === s}
                onClick={() => setStorage(s)}
                className="flex-1"
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
          {/* Bateria */}
          <Section title="Saude da bateria">
            <div className="bg-[#F5F5F7] rounded-2xl p-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[13px] text-[#6E6E73]">Porcentagem</span>
                <span className={`text-[28px] font-bold ${battery >= 85 ? "text-[#34C759]" : "text-[#FF3B30]"}`}>
                  {battery}%
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={100}
                value={battery}
                onChange={(e) => setBattery(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-[11px] text-[#86868B] mt-2">
                <span>50%</span>
                <span>100%</span>
              </div>
              {battery < 85 && (
                <p className="text-[12px] text-[#FF3B30] mt-2 font-medium">
                  Abaixo de 85% — desconto de R$ 200
                </p>
              )}
            </div>
          </Section>

          {/* Riscos na tela */}
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

          {/* Riscos laterais */}
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

          {/* Descascado/Amassado */}
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

          {/* Garantia Apple - Pergunta 1 */}
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

          {/* Garantia Apple - Pergunta 2 (mês) */}
          {hasWarranty === true && (
            <Section title="Ate qual mes vai a garantia do seu aparelho?">
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
              {warrantyMonth !== null && (
                <p className="text-[12px] text-[#34C759] mt-3 font-medium text-center">
                  Bonus garantia: +{formatBRL(warrantyBonusText)}
                </p>
              )}
            </Section>
          )}

          {/* Preview avaliação */}
          <div className="bg-[#F5F5F7] rounded-2xl p-5 text-center">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-2">
              Avaliacao estimada
            </p>
            <p className="text-[36px] font-bold text-[#34C759]">
              {formatBRL(tradeInValue)}
            </p>
            {baseValue !== null && tradeInValue < baseValue && (
              <p className="text-[12px] text-[#86868B] mt-2">
                Valor base {formatBRL(baseValue)} com ajustes aplicados
              </p>
            )}
            {baseValue !== null && tradeInValue > baseValue && (
              <p className="text-[12px] text-[#86868B] mt-2">
                Valor base {formatBRL(baseValue)} + bonus garantia
              </p>
            )}
          </div>
        </>
      )}

      {/* Botão próximo */}
      {canProceed && (
        <button
          onClick={() =>
            onNext({ usedModel: model, usedStorage: storage, condition, tradeInValue })
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
      <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3">
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
