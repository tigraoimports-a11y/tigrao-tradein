"use client";

import { useState, useMemo } from "react";
import type { NewProduct } from "@/lib/types";
import { getUniqueModels, getStoragesForModel, getProductPrice } from "@/lib/sheets";
import { formatBRL, calculateQuote } from "@/lib/calculations";

interface StepNewDeviceProps {
  products: NewProduct[];
  tradeInValue: number;
  onNext: (data: { newModel: string; newStorage: string; newPrice: number }) => void;
  onBack: () => void;
}

function getLine(m: string): string { const x = m.match(/iPhone (\d+)/); return x ? x[1] : m; }

export default function StepNewDevice({ products, tradeInValue, onNext, onBack }: StepNewDeviceProps) {
  const [line, setLine] = useState(""); const [model, setModel] = useState(""); const [storage, setStorage] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [lineB, setLineB] = useState(""); const [modelB, setModelB] = useState(""); const [storageB, setStorageB] = useState("");

  const allModels = useMemo(() => getUniqueModels(products).filter((m) => /^iPhone \d/i.test(m)), [products]);
  const lines = useMemo(() => { const s = new Set<string>(); allModels.forEach((m) => s.add(getLine(m))); return [...s].sort((a,b) => Number(a)-Number(b)); }, [allModels]);
  const modelsInLine = useMemo(() => allModels.filter((m) => getLine(m) === line), [allModels, line]);
  const storages = useMemo(() => (model ? getStoragesForModel(products, model) : []), [products, model]);
  const price = useMemo(() => (model && storage ? getProductPrice(products, model, storage) : null), [products, model, storage]);
  const modelsInLineB = useMemo(() => allModels.filter((m) => getLine(m) === lineB), [allModels, lineB]);
  const storagesB = useMemo(() => (modelB ? getStoragesForModel(products, modelB) : []), [products, modelB]);
  const priceB = useMemo(() => (modelB && storageB ? getProductPrice(products, modelB, storageB) : null), [products, modelB, storageB]);

  function hL(l: string) { setLine(l); setModel(""); setStorage(""); }
  function hM(m: string) { setModel(m); setStorage(""); }
  function hLB(l: string) { setLineB(l); setModelB(""); setStorageB(""); }
  function hMB(m: string) { setModelB(m); setStorageB(""); }
  function cancelCmp() { setCompareMode(false); setLineB(""); setModelB(""); setStorageB(""); }

  const canProceed = model && storage && price !== null;
  const bothSel = canProceed && modelB && storageB && priceB !== null;
  const diffA = price !== null ? Math.max(price - tradeInValue, 0) : null;
  const diffB = priceB !== null ? Math.max(priceB - tradeInValue, 0) : null;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-[22px] font-bold leading-tight" style={{ color: "var(--ti-text)" }}>Agora me diz, qual modelo voce quer comprar?</h2>
      </div>

      <Sec title="Linha do iPhone novo"><div className="grid grid-cols-3 gap-2">
        {lines.map((l) => <Btn key={l} sel={line===l} onClick={() => hL(l)}>iPhone {l}</Btn>)}
      </div></Sec>

      {line && modelsInLine.length > 0 && <Sec title="Modelo"><div className="grid grid-cols-1 gap-2">
        {modelsInLine.map((m) => <Btn key={m} sel={model===m} onClick={() => hM(m)} className="text-left">{m}</Btn>)}
      </div></Sec>}

      {model && storages.length > 0 && <Sec title="Armazenamento"><div className="flex gap-2 flex-wrap">
        {storages.map((s) => { const p = getProductPrice(products, model, s); return (
          <button key={s} onClick={() => setStorage(s)}
            className="flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 flex flex-col items-center gap-1"
            style={storage===s
              ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
              : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
            <span className="font-semibold">{s}</span>
            {p && <span className="text-[12px] font-normal" style={{ opacity: 0.7 }}>{formatBRL(p)}</span>}
          </button>);
        })}
      </div></Sec>}

      {canProceed && !compareMode && (
        <button onClick={() => setCompareMode(true)}
          className="w-full py-3 rounded-2xl text-[14px] font-medium transition-all duration-200"
          style={{ color: "var(--ti-accent)", backgroundColor: "var(--ti-accent-light)", border: "1px solid var(--ti-accent)" }}>
          Comparar com outro modelo
        </button>
      )}

      {compareMode && (
        <div className="rounded-2xl p-4 space-y-5 animate-fadeIn" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold tracking-wider uppercase" style={{ color: "var(--ti-muted)" }}>Segundo modelo</p>
            <button onClick={cancelCmp} className="text-[12px] transition-colors" style={{ color: "var(--ti-muted)" }}>Cancelar</button>
          </div>
          <Sec title="Linha"><div className="grid grid-cols-3 gap-2">{lines.map((l) => <Btn key={l} sel={lineB===l} onClick={() => hLB(l)}>iPhone {l}</Btn>)}</div></Sec>
          {lineB && modelsInLineB.length > 0 && <Sec title="Modelo"><div className="grid grid-cols-1 gap-2">{modelsInLineB.map((m) => <Btn key={m} sel={modelB===m} onClick={() => hMB(m)} className="text-left">{m}</Btn>)}</div></Sec>}
          {modelB && storagesB.length > 0 && <Sec title="Armazenamento"><div className="flex gap-2 flex-wrap">
            {storagesB.map((s) => { const p = getProductPrice(products, modelB, s); return (
              <button key={s} onClick={() => setStorageB(s)}
                className="flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all flex flex-col items-center gap-1"
                style={storageB===s
                  ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
                  : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
                <span className="font-semibold">{s}</span>
                {p && <span className="text-[12px] font-normal" style={{ opacity: 0.7 }}>{formatBRL(p)}</span>}
              </button>);
            })}
          </div></Sec>}
        </div>
      )}

      {bothSel && diffA !== null && diffB !== null && (() => {
        const qA = calculateQuote(tradeInValue, price!); const qB = calculateQuote(tradeInValue, priceB!);
        const gi = (q: typeof qA, n: number) => q.installments.find(i => i.parcelas === n);
        return (
        <div className="animate-fadeIn">
          <p className="text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>Comparacao</p>
          <div className="grid grid-cols-2 gap-3">
            {[[model, storage, price!, diffA, qA], [modelB, storageB, priceB!, diffB, qB]].map(([md, st, pr, df, qt], idx) => (
              <div key={idx} className="rounded-2xl p-4 flex flex-col gap-2" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
                <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--ti-text)" }}>{md as string}</p>
                <p className="text-[12px]" style={{ color: "var(--ti-muted)" }}>{st as string}</p>
                <p className="text-[15px] font-bold" style={{ color: "var(--ti-text)" }}>{formatBRL(pr as number)}</p>
                <div className="pt-2 mt-1 space-y-1" style={{ borderTop: "1px solid var(--ti-card-border)" }}>
                  <p className="text-[11px]" style={{ color: "var(--ti-muted)" }}>Voce paga:</p>
                  <p className="text-[16px] font-bold" style={{ color: "var(--ti-success)" }}>{formatBRL(df as number)} <span className="text-[11px] font-normal">PIX</span></p>
                  {[6,12,21].map(n => { const inst = gi(qt as ReturnType<typeof calculateQuote>, n); return inst ? (
                    <p key={n} className="text-[11px]" style={{ color: "var(--ti-muted)" }}>{n}x de <span className="font-semibold" style={{ color: "var(--ti-text)" }}>{formatBRL(inst.valorParcela)}</span></p>
                  ) : null; })}
                </div>
                <button onClick={() => { cancelCmp(); onNext({ newModel: md as string, newStorage: st as string, newPrice: pr as number }); }}
                  className="mt-1 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all" style={{ backgroundColor: "var(--ti-accent)" }}>
                  Escolher este
                </button>
              </div>
            ))}
          </div>
        </div>);
      })()}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-4 rounded-2xl text-[15px] font-semibold transition-all duration-200"
          style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-btn-bg)", border: "1px solid var(--ti-btn-border)" }}>
          Voltar
        </button>
        {canProceed && !compareMode && (
          <button onClick={() => onNext({ newModel: model, newStorage: storage, newPrice: price })}
            className="flex-[2] py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
            style={{ backgroundColor: "var(--ti-accent)" }}>
            Ver cotacao
          </button>
        )}
      </div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="animate-fadeIn"><label className="block text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>{title}</label>{children}</div>;
}

function Btn({ sel, onClick, children, className = "" }: { sel: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick} className={`px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200 ${className}`}
      style={sel
        ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
        : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
      {children}
    </button>
  );
}
