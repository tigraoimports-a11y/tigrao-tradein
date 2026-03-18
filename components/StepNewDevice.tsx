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

  // Compare states
  const [compareMode, setCompareMode] = useState(false);
  const [lineB, setLineB] = useState("");
  const [modelB, setModelB] = useState("");
  const [storageB, setStorageB] = useState("");

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

  // Compare model B
  const modelsInLineB = useMemo(
    () => allModels.filter((m) => getLineFromModel(m) === lineB),
    [allModels, lineB]
  );
  const storagesB = useMemo(
    () => (modelB ? getStoragesForModel(products, modelB) : []),
    [products, modelB]
  );
  const priceB = useMemo(
    () => (modelB && storageB ? getProductPrice(products, modelB, storageB) : null),
    [products, modelB, storageB]
  );

  function handleLineChange(l: string) {
    setLine(l);
    setModel("");
    setStorage("");
  }

  function handleModelChange(m: string) {
    setModel(m);
    setStorage("");
  }

  function handleLineBChange(l: string) {
    setLineB(l);
    setModelB("");
    setStorageB("");
  }

  function handleModelBChange(m: string) {
    setModelB(m);
    setStorageB("");
  }

  function cancelCompare() {
    setCompareMode(false);
    setLineB("");
    setModelB("");
    setStorageB("");
  }

  const canProceed = model && storage && price !== null;
  const bothSelected = canProceed && modelB && storageB && priceB !== null;

  const fmt = (v: number) => formatBRL(v);
  const diffA = price !== null ? Math.max(price - tradeInValue, 0) : null;
  const diffB = priceB !== null ? Math.max(priceB - tradeInValue, 0) : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-[22px] font-bold text-[#1D1D1F] leading-tight">
          Agora me diz, qual modelo você quer comprar?
        </h2>
      </div>

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

      {/* Botão comparar */}
      {canProceed && !compareMode && (
        <button
          onClick={() => setCompareMode(true)}
          className="w-full py-3 rounded-2xl text-[14px] font-medium text-[#0071E3] bg-[#0071E3]/8 hover:bg-[#0071E3]/15 transition-all duration-200 border border-[#0071E3]/20"
        >
          Comparar com outro modelo
        </button>
      )}

      {/* Seletor modelo B */}
      {compareMode && (
        <div className="border border-[#D2D2D7] rounded-2xl p-4 space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B]">
              Segundo modelo
            </p>
            <button
              onClick={cancelCompare}
              className="text-[12px] text-[#86868B] hover:text-[#E74C3C] transition-colors"
            >
              Cancelar
            </button>
          </div>

          <Section title="Linha">
            <div className="grid grid-cols-3 gap-2">
              {lines.map((l) => (
                <SelectButton key={l} selected={lineB === l} onClick={() => handleLineBChange(l)}>
                  iPhone {l}
                </SelectButton>
              ))}
            </div>
          </Section>

          {lineB && modelsInLineB.length > 0 && (
            <Section title="Modelo">
              <div className="grid grid-cols-1 gap-2">
                {modelsInLineB.map((m) => (
                  <SelectButton key={m} selected={modelB === m} onClick={() => handleModelBChange(m)} className="text-left">
                    {m}
                  </SelectButton>
                ))}
              </div>
            </Section>
          )}

          {modelB && storagesB.length > 0 && (
            <Section title="Armazenamento">
              <div className="flex gap-2 flex-wrap">
                {storagesB.map((s) => {
                  const p = getProductPrice(products, modelB, s);
                  return (
                    <button
                      key={s}
                      onClick={() => setStorageB(s)}
                      className={`flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 flex flex-col items-center gap-1 ${
                        storageB === s
                          ? "bg-[#0071E3] text-white shadow-sm"
                          : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"
                      }`}
                    >
                      <span className="font-semibold">{s}</span>
                      {p && (
                        <span className={`text-[12px] font-normal ${storageB === s ? "text-white/70" : "text-[#86868B]"}`}>
                          {formatBRL(p)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* Comparação lado a lado */}
      {bothSelected && diffA !== null && diffB !== null && (
        <div className="animate-fadeIn">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3">
            Comparacao
          </p>
          <div className="grid grid-cols-2 gap-3">
            {/* Card A */}
            <div className="bg-[#F5F5F7] rounded-2xl p-4 flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-[#1D1D1F] leading-tight">{model}</p>
              <p className="text-[12px] text-[#86868B]">{storage}</p>
              <p className="text-[15px] font-bold text-[#1D1D1F]">{fmt(price!)}</p>
              <div className="border-t border-[#D2D2D7] pt-2 mt-1">
                <p className="text-[11px] text-[#86868B]">Voce paga (PIX)</p>
                <p className="text-[16px] font-bold text-[#34C759]">{fmt(diffA)}</p>
              </div>
              <button
                onClick={() => { cancelCompare(); onNext({ newModel: model, newStorage: storage, newPrice: price! }); }}
                className="mt-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] transition-all"
              >
                Escolher este
              </button>
            </div>

            {/* Card B */}
            <div className="bg-[#F5F5F7] rounded-2xl p-4 flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-[#1D1D1F] leading-tight">{modelB}</p>
              <p className="text-[12px] text-[#86868B]">{storageB}</p>
              <p className="text-[15px] font-bold text-[#1D1D1F]">{fmt(priceB!)}</p>
              <div className="border-t border-[#D2D2D7] pt-2 mt-1">
                <p className="text-[11px] text-[#86868B]">Voce paga (PIX)</p>
                <p className="text-[16px] font-bold text-[#34C759]">{fmt(diffB)}</p>
              </div>
              <button
                onClick={() => { cancelCompare(); onNext({ newModel: modelB, newStorage: storageB, newPrice: priceB! }); }}
                className="mt-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] transition-all"
              >
                Escolher este
              </button>
            </div>
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
        {canProceed && !compareMode && (
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
