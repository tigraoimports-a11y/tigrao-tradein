"use client";

import { useState, useMemo } from "react";
import type { NewProduct } from "@/lib/types";
import { getUniqueModels, getStoragesForModel, getProductPrice } from "@/lib/sheets";
import { formatBRL, calculateQuote, getAnyConditionLines, type AnyConditionData, type DeviceType } from "@/lib/calculations";

interface StepNewDeviceProps {
  products: NewProduct[];
  tradeInValue: number;
  onNext: (data: { newModel: string; newStorage: string; newPrice: number }) => void;
  onBack: () => void;
  usedModel?: string;
  usedStorage?: string;
  whatsappNumber?: string;
  condition?: AnyConditionData;
  deviceType?: DeviceType;
}

function getLine(m: string): string { const x = m.match(/iPhone (\d+)/); return x ? x[1] : m; }

const SEMINOVOS = [
  { modelo: "iPhone 15 Pro", storages: ["128GB", "256GB"] },
  { modelo: "iPhone 15 Pro Max", storages: ["256GB", "512GB"] },
  { modelo: "iPhone 16 Pro", storages: ["128GB", "256GB"] },
  { modelo: "iPhone 16 Pro Max", storages: ["256GB"] },
];

export default function StepNewDevice({ products, tradeInValue, onNext, onBack, usedModel, usedStorage, whatsappNumber, condition, deviceType }: StepNewDeviceProps) {
  const [mode, setMode] = useState<"" | "lacrado" | "seminovo">("");
  const [line, setLine] = useState(""); const [model, setModel] = useState(""); const [storage, setStorage] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [lineB, setLineB] = useState(""); const [modelB, setModelB] = useState(""); const [storageB, setStorageB] = useState("");
  const [semiModel, setSemiModel] = useState("");
  const [semiStorage, setSemiStorage] = useState("");

  const allModels = useMemo(() => getUniqueModels(products).filter((m) => /^iPhone \d/i.test(m)), [products]);
  const lines = useMemo(() => { const s = new Set<string>(); allModels.forEach((m) => s.add(getLine(m))); return [...s].sort((a,b) => Number(a)-Number(b)); }, [allModels]);
  const modelsInLine = useMemo(() => allModels.filter((m) => getLine(m) === line), [allModels, line]);
  const storages_ = useMemo(() => (model ? getStoragesForModel(products, model) : []), [products, model]);
  const price = useMemo(() => (model && storage ? getProductPrice(products, model, storage) : null), [products, model, storage]);
  const modelsInLineB = useMemo(() => allModels.filter((m) => getLine(m) === lineB), [allModels, lineB]);
  const storagesB = useMemo(() => (modelB ? getStoragesForModel(products, modelB) : []), [products, modelB]);
  const priceB = useMemo(() => (modelB && storageB ? getProductPrice(products, modelB, storageB) : null), [products, modelB, storageB]);

  function hL(l: string) { setLine(l); setModel(""); setStorage(""); }
  function hM(m: string) { setModel(m); setStorage(""); }
  function hLB(l: string) { setLineB(l); setModelB(""); setStorageB(""); }
  function hMB(m: string) { setModelB(m); setStorageB(""); }
  function cancelCmp() { setCompareMode(false); setLineB(""); setModelB(""); setStorageB(""); }

  function selectMode(m: "lacrado" | "seminovo") {
    setMode(m);
    setLine(""); setModel(""); setStorage(""); cancelCmp();
    setSemiModel(""); setSemiStorage("");
  }

  // Build WhatsApp message with full device condition
  function buildWhatsAppMsg(): string {
    const lines: string[] = [];
    lines.push(`Ola! Fiz a simulacao de Trade-In no site e tenho interesse em um *${semiModel} ${semiStorage} SEMINOVO*.`);
    lines.push("");
    lines.push(`*MEU APARELHO ATUAL:*`);
    lines.push(`Modelo: ${usedModel || "Nao informado"} ${usedStorage || ""}`);
    lines.push(`Valor avaliado: R$ ${Math.round(tradeInValue).toLocaleString("pt-BR")}`);

    if (condition && deviceType) {
      lines.push("");
      lines.push(`*CONDICAO DO APARELHO:*`);
      const condLines = getAnyConditionLines(deviceType, condition);
      condLines.forEach((l) => lines.push(`• ${l}`));
    }

    lines.push("");
    lines.push("Gostaria de saber o valor e condicoes de pagamento para a troca!");
    return lines.join("\n");
  }

  const canProceed = model && storage && price !== null;
  const bothSel = canProceed && modelB && storageB && priceB !== null;
  const diffA = price !== null ? Math.max(price - tradeInValue, 0) : null;
  const diffB = priceB !== null ? Math.max(priceB - tradeInValue, 0) : null;

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-[22px] font-bold leading-tight" style={{ color: "var(--ti-text)" }}>Voce deseja comprar um:</h2>
      </div>

      {/* Lacrado vs Seminovo */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => selectMode("lacrado")}
          className="py-5 rounded-2xl text-[15px] font-semibold transition-all duration-200 flex flex-col items-center gap-2"
          style={mode === "lacrado"
            ? { backgroundColor: "var(--ti-accent)", color: "#fff", border: "2px solid var(--ti-accent)" }
            : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "2px solid var(--ti-btn-border)" }}>
          <span className="text-[24px]">📦</span>
          Lacrado
          <span className="text-[11px] font-normal opacity-70">Novo, na caixa</span>
        </button>
        <button onClick={() => selectMode("seminovo")}
          className="py-5 rounded-2xl text-[15px] font-semibold transition-all duration-200 flex flex-col items-center gap-2"
          style={mode === "seminovo"
            ? { backgroundColor: "var(--ti-accent)", color: "#fff", border: "2px solid var(--ti-accent)" }
            : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "2px solid var(--ti-btn-border)" }}>
          <span className="text-[24px]">📱</span>
          Seminovo
          <span className="text-[11px] font-normal opacity-70">Revisado, com garantia</span>
        </button>
      </div>

      {/* ====== LACRADO ====== */}
      {mode === "lacrado" && (
        <div className="space-y-5 animate-fadeIn">
          <Sec title="Linha do iPhone"><div className="grid grid-cols-3 gap-2">
            {lines.map((l) => <Btn key={l} sel={line===l} onClick={() => hL(l)}>iPhone {l}</Btn>)}
          </div></Sec>

          {line && modelsInLine.length > 0 && <Sec title="Modelo"><div className="grid grid-cols-1 gap-2">
            {modelsInLine.map((m) => <Btn key={m} sel={model===m} onClick={() => hM(m)} className="text-left">{m}</Btn>)}
          </div></Sec>}

          {model && storages_.length > 0 && <Sec title="Armazenamento"><div className="flex gap-2 flex-wrap">
            {storages_.map((s) => { const p = getProductPrice(products, model, s); return (
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
        </div>
      )}

      {/* ====== SEMINOVO ====== */}
      {mode === "seminovo" && (
        <div className="space-y-5 animate-fadeIn">
          <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
            <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--ti-text)" }}>Seminovos com garantia</p>
            <p className="text-[12px]" style={{ color: "var(--ti-muted)" }}>Aparelhos revisados e em excelente estado. O valor e condicoes serao informados por WhatsApp.</p>
          </div>

          <Sec title="Modelo seminovo">
            <div className="grid grid-cols-1 gap-2">
              {SEMINOVOS.map((s) => (
                <Btn key={s.modelo} sel={semiModel === s.modelo} onClick={() => { setSemiModel(s.modelo); setSemiStorage(""); }} className="text-left">
                  {s.modelo}
                </Btn>
              ))}
            </div>
          </Sec>

          {semiModel && (
            <Sec title="Armazenamento">
              <div className="flex gap-2 flex-wrap">
                {SEMINOVOS.find(s => s.modelo === semiModel)?.storages.map((st) => (
                  <button key={st} onClick={() => setSemiStorage(st)}
                    className="flex-1 min-w-[80px] px-4 py-3.5 rounded-2xl text-[14px] font-medium transition-all duration-200"
                    style={semiStorage === st
                      ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
                      : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
                    {st}
                  </button>
                ))}
              </div>
            </Sec>
          )}

          {semiModel && semiStorage && (
            <div className="space-y-3 animate-fadeIn">
              <div className="rounded-2xl p-4 text-center" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
                <p className="text-[13px] mb-2" style={{ color: "var(--ti-muted)" }}>Voce selecionou:</p>
                <p className="text-[18px] font-bold" style={{ color: "var(--ti-text)" }}>{semiModel} {semiStorage}</p>
                <p className="text-[12px] mt-1" style={{ color: "var(--ti-accent)" }}>SEMINOVO</p>
                <p className="text-[12px] mt-3" style={{ color: "var(--ti-muted)" }}>A cotacao sera feita por WhatsApp com base nas condicoes do seu aparelho.</p>
              </div>
              <button
                onClick={() => {
                  const waNum = whatsappNumber || "5521995618747";
                  const msg = encodeURIComponent(buildWhatsAppMsg());
                  window.open(`https://wa.me/${waNum}?text=${msg}`, "_blank");
                }}
                className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                style={{ backgroundColor: "#25D366" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492l4.612-1.474A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75c-2.115 0-4.07-.662-5.674-1.789l-.407-.264-2.746.878.829-2.676-.281-.427A9.71 9.71 0 012.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75z"/></svg>
                Consultar no WhatsApp
              </button>
            </div>
          )}
        </div>
      )}

      {/* Botões de navegação */}
      <div className="flex gap-3">
        <button onClick={() => { if (mode) { setMode(""); } else { onBack(); } }} className="flex-1 py-4 rounded-2xl text-[15px] font-semibold transition-all duration-200"
          style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-btn-bg)", border: "1px solid var(--ti-btn-border)" }}>
          Voltar
        </button>
        {mode === "lacrado" && canProceed && !compareMode && (
          <button onClick={() => onNext({ newModel: model, newStorage: storage, newPrice: price })}
            className="flex-[2] py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
            style={{ backgroundColor: "var(--ti-accent)" }}>
            Ver cotação
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
