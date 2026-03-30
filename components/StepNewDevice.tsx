"use client";

import { useState, useMemo } from "react";
import type { NewProduct, TradeInConfig } from "@/lib/types";
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
  tradeinConfig?: TradeInConfig | null;
}

function getLine(m: string): string { const x = m.match(/iPhone (\d+)/); return x ? x[1] : m; }

const SEMINOVOS = [
  { modelo: "iPhone 15 Pro", storages: ["128GB", "256GB"] },
  { modelo: "iPhone 15 Pro Max", storages: ["256GB", "512GB"] },
  { modelo: "iPhone 16 Pro", storages: ["128GB", "256GB"] },
  { modelo: "iPhone 16 Pro Max", storages: ["256GB"] },
];

export default function StepNewDevice({ products, tradeInValue, onNext, onBack, usedModel, usedStorage, whatsappNumber, condition, deviceType, tradeinConfig }: StepNewDeviceProps) {
  const [mode, setMode] = useState<"" | "lacrado" | "seminovo">("");
  const [line, setLine] = useState(""); const [model, setModel] = useState(""); const [storage, setStorage] = useState("");
  const [compareMode, setCompareMode] = useState(false);
  const [lineB, setLineB] = useState(""); const [modelB, setModelB] = useState(""); const [storageB, setStorageB] = useState("");
  const [semiModel, setSemiModel] = useState("");
  const [semiStorage, setSemiStorage] = useState("");
  const [semiPreco, setSemiPreco] = useState("");
  const [semiNome, setSemiNome] = useState("");
  const [semiWhatsapp, setSemiWhatsapp] = useState("");

  // Use config from DB or fallback to hardcoded
  const seminovos = useMemo(() => {
    const list = tradeinConfig?.seminovos?.filter((s) => s.ativo);
    return list && list.length > 0 ? list : SEMINOVOS;
  }, [tradeinConfig]);
  const lbl = tradeinConfig?.labels || {};

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
    lines.push(`*DADOS DO CLIENTE:*`);
    lines.push(`Nome: ${semiNome || "Nao informado"}`);
    lines.push(`WhatsApp: ${semiWhatsapp || "Nao informado"}`);
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
        <h2 className="text-[22px] font-bold leading-tight" style={{ color: "var(--ti-text)" }}>{lbl.step2_titulo || "Voce deseja comprar um:"}</h2>
      </div>

      {/* Lacrado vs Seminovo */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => selectMode("lacrado")}
          className="py-5 rounded-2xl text-[15px] font-semibold transition-all duration-200 flex flex-col items-center gap-2"
          style={mode === "lacrado"
            ? { backgroundColor: "var(--ti-accent)", color: "#fff", border: "2px solid var(--ti-accent)" }
            : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "2px solid var(--ti-btn-border)" }}>
          <span className="text-[24px]">📦</span>
          {lbl.lacrado_label || "Lacrado"}
          <span className="text-[11px] font-normal opacity-70">{lbl.lacrado_desc || "Novo, na caixa. 1 ano de garantia Apple, nota fiscal"}</span>
        </button>
        <button onClick={() => selectMode("seminovo")}
          className="py-5 rounded-2xl text-[15px] font-semibold transition-all duration-200 flex flex-col items-center gap-2"
          style={mode === "seminovo"
            ? { backgroundColor: "var(--ti-accent)", color: "#fff", border: "2px solid var(--ti-accent)" }
            : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "2px solid var(--ti-btn-border)" }}>
          <span className="text-[24px]">📱</span>
          {lbl.seminovo_label || "Seminovo"}
          <span className="text-[11px] font-normal opacity-70">{lbl.seminovo_desc || "Usado, revisado, com garantia de 3 meses, nota fiscal"}</span>
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
            <p className="text-[12px]" style={{ color: "var(--ti-muted)" }}>{lbl.seminovo_info || "Aparelhos revisados e em excelente estado. O valor e condicoes serao informados por WhatsApp."}</p>
          </div>

          <Sec title="Modelo seminovo">
            <div className="grid grid-cols-1 gap-2">
              {seminovos.map((s) => (
                <Btn key={s.modelo} sel={semiModel === s.modelo} onClick={() => { setSemiModel(s.modelo); setSemiStorage(""); }} className="text-left">
                  {s.modelo}
                </Btn>
              ))}
            </div>
          </Sec>

          {semiModel && (
            <Sec title="Armazenamento">
              <div className="flex gap-2 flex-wrap">
                {seminovos.find(s => s.modelo === semiModel)?.storages.map((st) => (
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
              </div>
              <Sec title="Preco de venda (R$)">
                <input
                  type="text" inputMode="numeric"
                  placeholder="Ex: 6500"
                  value={semiPreco}
                  onChange={e => setSemiPreco(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-4 py-3.5 rounded-xl text-[16px] font-bold text-center"
                  style={{ backgroundColor: "var(--ti-input-bg)", color: "var(--ti-text)", border: "1px solid var(--ti-input-border)" }}
                />
                {semiPreco && tradeInValue > 0 && (
                  <div className="mt-2 rounded-xl p-3 text-center" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-accent)" }}>
                    <p className="text-[12px]" style={{ color: "var(--ti-muted)" }}>Com a sua troca:</p>
                    <p className="text-[20px] font-bold" style={{ color: "var(--ti-accent)" }}>
                      R$ {((parseFloat(semiPreco) || 0) - tradeInValue).toLocaleString("pt-BR")}
                    </p>
                  </div>
                )}
              </Sec>
              {semiPreco && parseFloat(semiPreco) > 0 && (
                <button
                  onClick={() => onNext({ newModel: `${semiModel} SEMINOVO`, newStorage: semiStorage, newPrice: parseFloat(semiPreco) || 0 })}
                  className="w-full py-4 rounded-2xl text-[15px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
                  style={{ backgroundColor: "var(--ti-accent)" }}>
                  Gerar Orcamento
                </button>
              )}
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
