"use client";

import { useState, useMemo } from "react";
import type { NewProduct } from "@/lib/types";
import {
  getUniqueModels,
  getStoragesForModel,
  getProductPrice,
} from "@/lib/sheets";
import { formatBRL, calculateQuote } from "@/lib/calculations";

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

  const [compareMode, setCompareMode] = useState(false);
  const [lineB, setLineB] = useState("");
  const [modelB, setModelB] = useState("");
  const [storageB, setStorageB] = useState("");

  const allModels = useMemo(
    () => getUniqueModels(products).filter((m) => /^iPhone \d/i.test(m)),
    [products]
  );

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

  function handleLineChange(l: string) { setLine(l); setModel(""); setStorage(""); }
  function handleModelChange(m: string) { setModel(m); setStorage(""); }
  function handleLineBChange(l: string) { setLineB(l); setModelB(""); setStorageB(""); }
  function handleModelBChange(m: string) { setModelB(m); setStorageB(""); }
  function cancelCompare() { setCompareMode(false); setLineB(""); setModelB(""); setStorageB(""); }

  const canProceed = model && storage && price !== null;
  const bothSelected = canProceed && modelB && storageB && priceB !== null;

  const fmt = (v: number) => formatBRL(v);
  const diffA = price !== null ? Math.max(price - tradeInValue, 0) : null;
  const diffB = priceB !== null ? Math.max(priceB - tradeInValue, 0) : null;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-[22px] font-bold text-[#F5F5F5] leading-tight">
          Agora me diz, qual modelo voce quer comprar?
        </h2>
      </div>

      <Section title="Linha do iPhone novo">
        <div className="grid grid-cols-3 gap-2">
          {lines.map((l) => (
            <SelectButton key={l} selected={line === l} onClick={() => handleLineChange(l)}>
              iPhone {l}
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
        </Section>
      )}

      {model && storages.length > 0 && (
        <Section title="Armazenamento">
          <div className="flex gap-2 flex-wrap">
            {storages.map((s) => {
              const p = getProductPrice(products, model, s);
              return (
                <button
                  key={s}
                  onClick={() => setStorage(s)}
                  className={`flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 flex flex-col items-center gap-1 border ${
                    storage === s
                      ? "bg-[#1E1208] text-[#E8740E] border-[#E8740E]"
                      : "bg-[#141414] text-[#F5F5F5] border-[#2A2A2A] hover:bg-[#1A1A1A]"
                  }`}
                >
                  <span className="font-semibold">{s}</span>
                  {p && (
                    <span className={`text-[12px] font-normal ${storage === s ? "text-[#E8740E]/70" : "text-[#888]"}`}>
                      {formatBRL(p)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {canProceed && !compareMode && (
        <button
          onClick={() => setCompareMode(true)}
          className="w-full py-3 rounded-2xl text-[14px] font-medium text-[#E8740E] bg-[#E8740E]/8 hover:bg-[#E8740E]/15 transition-all duration-200 border border-[#E8740E]/20"
        >
          Comparar com outro modelo
        </button>
      )}

      {compareMode && (
        <div className="border border-[#2A2A2A] rounded-2xl p-4 space-y-5 animate-fadeIn bg-[#141414]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wider uppercase text-[#888]">
              Segundo modelo
            </p>
            <button onClick={cancelCompare} className="text-[12px] text-[#888] hover:text-[#E74C3C] transition-colors">
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
                      className={`flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 flex flex-col items-center gap-1 border ${
                        storageB === s
                          ? "bg-[#1E1208] text-[#E8740E] border-[#E8740E]"
                          : "bg-[#141414] text-[#F5F5F5] border-[#2A2A2A] hover:bg-[#1A1A1A]"
                      }`}
                    >
                      <span className="font-semibold">{s}</span>
                      {p && (
                        <span className={`text-[12px] font-normal ${storageB === s ? "text-[#E8740E]/70" : "text-[#888]"}`}>
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

      {bothSelected && diffA !== null && diffB !== null && (() => {
        const quoteA = calculateQuote(tradeInValue, price!);
        const quoteB = calculateQuote(tradeInValue, priceB!);
        const getInst = (q: typeof quoteA, n: number) => q.installments.find(i => i.parcelas === n);

        return (
        <div className="animate-fadeIn">
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3">
            Comparacao
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-4 flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-[#F5F5F5] leading-tight">{model}</p>
              <p className="text-[12px] text-[#888]">{storage}</p>
              <p className="text-[15px] font-bold text-[#F5F5F5]">{fmt(price!)}</p>
              <div className="border-t border-[#2A2A2A] pt-2 mt-1 space-y-1">
                <p className="text-[11px] text-[#888]">Voce paga:</p>
                <p className="text-[16px] font-bold text-[#2ECC71]">{fmt(diffA)} <span className="text-[11px] font-normal">PIX</span></p>
                {[6, 12, 21].map(n => {
                  const inst = getInst(quoteA, n);
                  return inst ? (
                    <p key={n} className="text-[11px] text-[#888]">
                      {n}x de <span className="font-semibold text-[#F5F5F5]">{fmt(inst.valorParcela)}</span>
                    </p>
                  ) : null;
                })}
              </div>
              <button
                onClick={() => { cancelCompare(); onNext({ newModel: model, newStorage: storage, newPrice: price! }); }}
                className="mt-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#E8740E] hover:bg-[#F5A623] transition-all"
              >
                Escolher este
              </button>
            </div>

            <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-4 flex flex-col gap-2">
              <p className="text-[13px] font-semibold text-[#F5F5F5] leading-tight">{modelB}</p>
              <p className="text-[12px] text-[#888]">{storageB}</p>
              <p className="text-[15px] font-bold text-[#F5F5F5]">{fmt(priceB!)}</p>
              <div className="border-t border-[#2A2A2A] pt-2 mt-1 space-y-1">
                <p className="text-[11px] text-[#888]">Voce paga:</p>
                <p className="text-[16px] font-bold text-[#2ECC71]">{fmt(diffB)} <span className="text-[11px] font-normal">PIX</span></p>
                {[6, 12, 21].map(n => {
                  const inst = getInst(quoteB, n);
                  return inst ? (
                    <p key={n} className="text-[11px] text-[#888]">
                      {n}x de <span className="font-semibold text-[#F5F5F5]">{fmt(inst.valorParcela)}</span>
                    </p>
                  ) : null;
                })}
              </div>
              <button
                onClick={() => { cancelCompare(); onNext({ newModel: modelB, newStorage: storageB, newPrice: priceB! }); }}
                className="mt-1 py-2.5 rounded-xl text-[13px] font-semibold text-white bg-[#E8740E] hover:bg-[#F5A623] transition-all"
              >
                Escolher este
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 py-4 rounded-2xl text-[15px] font-semibold text-[#888] bg-[#141414] border border-[#2A2A2A] hover:bg-[#1A1A1A] transition-all duration-200"
        >
          Voltar
        </button>
        {canProceed && !compareMode && (
          <button
            onClick={() => onNext({ newModel: model, newStorage: storage, newPrice: price })}
            className="flex-[2] py-4 rounded-2xl text-[15px] font-semibold text-white bg-[#E8740E] hover:bg-[#F5A623] transition-all duration-200 active:scale-[0.98]"
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
      <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3">
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
      className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 border ${
        selected
          ? "bg-[#1E1208] text-[#E8740E] border-[#E8740E]"
          : "bg-[#141414] text-[#F5F5F5] border-[#2A2A2A] hover:bg-[#1A1A1A]"
      } ${className}`}
    >
      {children}
    </button>
  );
}
