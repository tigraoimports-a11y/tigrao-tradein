"use client";

import { useState, useMemo } from "react";
import type { NewProduct } from "@/lib/types";
import {
  getUniqueModels,
  getStoragesForModel,
  getProductPrice,
} from "@/lib/sheets";
import { formatBRL } from "@/lib/calculations";

interface StepNewDeviceProps {
  products: NewProduct[];
  tradeInValue: number;
  onNext: (data: {
    newModel: string;
    newStorage: string;
    newPrice: number;
  }) => void;
  onBack: () => void;
}

function getLineFromModel(model: string): string {
  const match = model.match(/iPhone (\d+)/);
  return match ? match[1] : model;
}

export default function StepNewDevice({
  products,
  tradeInValue,
  onNext,
  onBack,
}: StepNewDeviceProps) {
  const [line, setLine] = useState("");
  const [model, setModel] = useState("");
  const [storage, setStorage] = useState("");

  const allModels = useMemo(() => getUniqueModels(products), [products]);

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
    () => (model ? getStoragesForModel(products, model) : []),
    [products, model]
  );

  const price = useMemo(
    () => (model && storage ? getProductPrice(products, model, storage) : null),
    [products, model, storage]
  );

  const difference = price !== null ? Math.max(price - tradeInValue, 0) : null;

  function handleLineChange(l: string) {
    setLine(l);
    setModel("");
    setStorage("");
  }

  function handleModelChange(m: string) {
    setModel(m);
    setStorage("");
  }

  const canProceed = model && storage && price !== null;

  return (
    <div className="space-y-8">
      {/* Linha */}
      <Section title="Linha do iPhone novo">
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

      {/* Modelo */}
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
        </Section>
      )}

      {/* Storage com preço */}
      {model && storages.length > 0 && (
        <Section title="Armazenamento">
          <div className="flex gap-2 flex-wrap">
            {storages.map((s) => {
              const p = getProductPrice(products, model, s);
              return (
                <button
                  key={s}
                  onClick={() => setStorage(s)}
                  className={`flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 flex flex-col items-center gap-1 ${
                    storage === s
                      ? "bg-[#0071E3] text-white shadow-sm"
                      : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"
                  }`}
                >
                  <span className="font-semibold">{s}</span>
                  {p && (
                    <span className={`text-[12px] font-normal ${storage === s ? "text-white/70" : "text-[#86868B]"}`}>
                      {formatBRL(p)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* Preview diferença */}
      {price !== null && difference !== null && (
        <div className="bg-[#F5F5F7] rounded-2xl p-5 animate-fadeIn">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[13px] text-[#6E6E73]">Preco novo (Pix)</span>
            <span className="text-[13px] font-semibold">{formatBRL(price)}</span>
          </div>
          <div className="flex justify-between items-center mb-3">
            <span className="text-[13px] text-[#6E6E73]">Desconto do seu usado</span>
            <span className="text-[13px] font-semibold text-[#34C759]">
              - {formatBRL(tradeInValue)}
            </span>
          </div>
          <div className="border-t border-[#E8E8ED] my-3" />
          <div className="flex justify-between items-center">
            <span className="text-[14px] font-semibold text-[#6E6E73]">Diferenca</span>
            <span className="text-[24px] font-bold text-[#1D1D1F]">
              {formatBRL(difference)}
            </span>
          </div>
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-4 rounded-2xl text-[15px] font-semibold text-[#6E6E73] bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-all duration-200"
        >
          Voltar
        </button>
        {canProceed && (
          <button
            onClick={() =>
              onNext({
                newModel: model,
                newStorage: storage,
                newPrice: price,
              })
            }
            className="flex-[2] py-4 rounded-2xl text-[15px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] transition-all duration-200 active:scale-[0.98]"
          >
            Ver cotacao
          </button>
        )}
      </div>
    </div>
  );
}

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
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 ${
        selected
          ? "bg-[#0071E3] text-white shadow-sm"
          : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"
      } ${className}`}
    >
      {children}
    </button>
  );
}
