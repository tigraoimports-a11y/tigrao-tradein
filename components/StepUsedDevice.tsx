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
  type ConditionData,
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
  const [hasWarranty, setHasWarranty] = useState<boolean | null>(null);
  const [warrantyMonth, setWarrantyMonth] = useState<number | null>(null);
  const [warrantyYear, setWarrantyYear] = useState<number>(new Date().getFullYear());
  const [hasOriginalBox, setHasOriginalBox] = useState<boolean | null>(null);

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

  const modelDiscount = useMemo(
    () => getDiscountsForModel(model, modelDiscounts),
    [model, modelDiscounts]
  );

  const tradeInValue = useMemo(
    () => (baseValue !== null && hasDamage === false ? calculateTradeInValue(baseValue, condition, modelDiscount, warrantyBonuses) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseValue, screenScratch, sideScratch, peeling, battery, hasDamage, hasWarranty, warrantyMonth, warrantyYear, modelDiscount]
  );

  const isExcluded = excludedModels.some((m) =>
    model.toLowerCase().includes(m.toLowerCase())
  );

  // Todos os campos são obrigatórios
  const batteryFilled = battery !== null && battery >= 1 && battery <= 100;
  const allConditionsFilled = screenScratch !== null && sideScratch !== null && peeling !== null && batteryFilled;
  const warrantyFilled = hasWarranty === false || (hasWarranty === true && warrantyMonth !== null);
  const canProceed = model && storage && baseValue !== null && !isExcluded && hasDamage === false && allConditionsFilled && warrantyFilled && hasOriginalBox !== null;

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

  return (
    <div className="space-y-8">
      {/* Título principal */}
      <h2 className="text-[20px] font-bold text-[#1D1D1F]">
        Qual é o modelo do seu usado?
      </h2>

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
                <p className="text-[12px] font-semibold text-[#1D1D1F] mb-1.5">Como descobrir a saude da bateria:</p>
                <div className="text-[11px] text-[#6E6E73] space-y-1">
                  <p>1. Abra <strong>Ajustes</strong> no seu iPhone</p>
                  <p>2. Toque em <strong>Bateria</strong></p>
                  <p>3. Toque em <strong>Saude e Carregamento da Bateria</strong></p>
                  <p>4. Veja o valor em <strong>Capacidade Maxima</strong></p>
                </div>
              </div>
            </div>
          </Section>

          {/* Riscos na tela — aparece após bateria preenchida */}
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

          {/* Riscos laterais — aparece após riscos tela */}
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

          {/* Descascado/Amassado — aparece após riscos laterais */}
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

          {/* Garantia Apple - Pergunta 1 — aparece após descascado */}
          {peeling !== null && (
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

          {/* Garantia Apple - Pergunta 2 (ano + mês) */}
          {hasWarranty === true && (
            <Section title="Ate qual mes vai a garantia do seu aparelho?">
              {/* Seletor de ano */}
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
              {/* Seletor de mês */}
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

          {/* Caixa original — aparece após garantia respondida */}
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
