"use client";

import { useState, useEffect } from "react";
import type { QuoteResult, InstallmentOption, AnyConditionData, DeviceType } from "@/lib/calculations";
import type { LeadSaiu } from "@/lib/supabase";
import { calculateQuote, getWhatsAppUrl, getAnyConditionLines, formatBRL } from "@/lib/calculations";

const PARCELAS_OPCOES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
const MOTIVOS_SAIDA = ["Achei o valor alto","Quero me organizar financeiramente","Quero tirar duvidas primeiro","Vou pesquisar em outros lugares","Outro motivo"];

interface StepQuoteProps {
  newModel: string; newStorage: string; newPrice: number;
  usedModel: string; usedStorage: string; condition: AnyConditionData; deviceType: DeviceType;
  tradeInValue: number;
  usedModel2?: string; usedStorage2?: string; condition2?: AnyConditionData; deviceType2?: DeviceType;
  tradeInValue1?: number; tradeInValue2?: number;
  clienteNome: string; clienteWhatsApp: string; clienteInstagram: string; clienteOrigem: string;
  whatsappNumero: string; validadeHoras: number; vendedor?: string | null;
  onReset: () => void; onCotarOutro: () => void;
  onGoToStep?: (step: number) => void;
  onTrackAction?: (action: string) => void;
}

async function salvarLead(lead: LeadSaiu & { formaPagamento?: string; origem?: string; motivoSaida?: string }) {
  try { await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lead) }); } catch { /* silent */ }
}

function buildFormaPag(entrada: number, dif: number, parc: string, qr: QuoteResult): string {
  const f = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  if (parc === "pix" || parc === "") return `${f(dif)} a vista no PIX`;
  const n = parseInt(parc); const inst = qr.installments.find(i => i.parcelas === n)!;
  if (entrada > 0) return `${f(entrada)} a vista no PIX + ${n}x de ${f(inst.valorParcela)} no cartao (total: ${f(entrada + inst.total)})`;
  return `${n}x de ${f(inst.valorParcela)} no cartao (total: ${f(inst.total)})`;
}

function useCountdown(hours: number) {
  const [end] = useState(() => Date.now() + hours * 3600000);
  const [rem, setRem] = useState(hours * 3600);
  useEffect(() => { const t = () => setRem(Math.max(0, Math.floor((end - Date.now()) / 1000))); t(); const id = setInterval(t, 1000); return () => clearInterval(id); }, [end]);
  const h = Math.floor(rem/3600), m = Math.floor((rem%3600)/60), s = rem%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export default function StepQuote(p: StepQuoteProps) {
  const { newModel, newStorage, newPrice, usedModel, usedStorage, condition, deviceType, tradeInValue,
    usedModel2, usedStorage2, condition2, deviceType2, tradeInValue1, tradeInValue2,
    clienteNome, clienteWhatsApp, clienteInstagram, clienteOrigem, whatsappNumero, validadeHoras, vendedor, onReset, onCotarOutro, onGoToStep, onTrackAction } = p;

  const hasSecond = !!(usedModel2 && usedStorage2);
  const [entradaStr, setEntradaStr] = useState(""); const [parc, setParc] = useState("");
  const [sairLoading, setSairLoading] = useState(false); const [showFeedback, setShowFeedback] = useState(false);
  const [motivo, setMotivo] = useState("");
  const countdown = useCountdown(validadeHoras);

  const qt: QuoteResult = calculateQuote(tradeInValue, newPrice);
  const dif = qt.pix;
  const entNum = Math.min(Math.max(parseFloat(entradaStr.replace(",","."))||0,0), dif-1);
  const temEnt = entNum > 0; const rest = dif - entNum;
  const qr: QuoteResult = temEnt ? calculateQuote(0, rest) : qt;
  const parcOpts: InstallmentOption[] = qr.installments.filter(i => PARCELAS_OPCOES.includes(i.parcelas));
  const instSel = parc && parc !== "pix" ? qr.installments.find(i => i.parcelas === parseInt(parc)) ?? null : null;
  const formaPag = buildFormaPag(entNum, dif, parc, qr);
  const f2 = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  const cL1 = getAnyConditionLines(deviceType, condition);
  const igLine = clienteInstagram ? `Instagram: ${clienteInstagram}\n` : "";

  let usadoSec: string;
  if (hasSecond && condition2) {
    const cL2 = getAnyConditionLines(deviceType2 ?? "iphone", condition2);
    usadoSec = `*PRODUTO 1 na troca:*\n${usedModel} ${usedStorage}\n${cL1.join("\n")}\nAvaliação: ${f2(tradeInValue1??0)}\n\n*PRODUTO 2 na troca:*\n${usedModel2} ${usedStorage2}\n${cL2.join("\n")}\nAvaliação: ${f2(tradeInValue2??0)}\n\n*Total avaliação: ${f2(tradeInValue)}*`;
  } else {
    usadoSec = `*Seu aparelho na troca:*\n${usedModel} ${usedStorage}\n${cL1.join("\n")}\nAvaliação do usado: ${f2(tradeInValue)}`;
  }

  const waMsg = `Ola! Vi meu orçamento no site e quero fechar!\n\n*Nome:* ${clienteNome}\n*WhatsApp:* ${clienteWhatsApp}\n${igLine}\n*ORÇAMENTO DE TROCA -- TigraoImports*\n---\n\n*Produto novo:*\n${newModel} ${newStorage} -- ${f2(newPrice)}\nLacrado | 1 ano de garantia | Nota Fiscal\n\n${usadoSec}\n\n---\n*Diferença no PIX: ${f2(dif)}*\n\n*Forma de pagamento escolhida:*\n${formaPag}\n\n_Validade deste orçamento: ${validadeHoras} horas_\n\nQuero fechar o pedido!`;
  const waUrl = getWhatsAppUrl(whatsappNumero, waMsg);
  const condLines = getAnyConditionLines(deviceType, condition);

  const leadBase = { nome: clienteNome, whatsapp: clienteWhatsApp, instagram: clienteInstagram,
    modeloNovo: newModel, storageNovo: newStorage, precoNovo: newPrice, modeloUsado: usedModel,
    storageUsado: usedStorage, avaliacaoUsado: tradeInValue, diferenca: dif, condicaoLinhas: condLines,
    vendedor: vendedor || undefined, origem: clienteOrigem || undefined };

  const cardStyle: React.CSSProperties = { backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" };
  const inputStyle: React.CSSProperties = { backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)", color: "var(--ti-text)", outline: "none" };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="text-center mb-2">
        <h2 className="text-[28px] font-bold" style={{ color: "var(--ti-text)" }}>Sua Cotação</h2>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full px-4 py-1.5" style={{ backgroundColor: "var(--ti-accent-light)", border: "1px solid var(--ti-accent)" }}>
          <span className="text-[11px] font-medium" style={{ color: "var(--ti-accent)" }}>Válido por</span>
          <span className="text-[14px] font-bold font-mono" style={{ color: "var(--ti-accent)" }}>{countdown}</span>
        </div>
      </div>

      {/* Produto novo */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p className="text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>Produto novo</p>
        <p className="text-[18px] font-semibold" style={{ color: "var(--ti-text)" }}>{newModel} {newStorage}</p>
        <div className="flex gap-4 mt-3 text-[12px]" style={{ color: "var(--ti-muted)" }}><span>Lacrado</span><span>1 ano garantia</span><span>Nota Fiscal</span></div>
      </div>

      {/* Usado na troca */}
      <div className="rounded-2xl p-5" style={cardStyle}>
        <p className="text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>{hasSecond ? "Seus aparelhos na troca" : "Seu aparelho na troca"}</p>
        <div className={hasSecond ? "space-y-3" : ""}>
          <div>
            <p className="text-[18px] font-semibold" style={{ color: "var(--ti-text)" }}>{usedModel} {usedStorage}</p>
            <div className="mt-1 space-y-0.5">{condLines.map((l, i) => <p key={i} className="text-[13px]" style={{ color: "var(--ti-muted)" }}>{l}</p>)}</div>
            {hasSecond && tradeInValue1 !== undefined && <p className="text-[13px] font-medium mt-1" style={{ color: "var(--ti-success)" }}>Avaliação: {formatBRL(tradeInValue1)}</p>}
          </div>
          {hasSecond && condition2 && (
            <div className="pt-3" style={{ borderTop: "1px solid var(--ti-card-border)" }}>
              <p className="text-[18px] font-semibold" style={{ color: "var(--ti-text)" }}>{usedModel2} {usedStorage2}</p>
              <div className="mt-1 space-y-0.5">{getAnyConditionLines(deviceType2 ?? "iphone", condition2).map((l, i) => <p key={i} className="text-[13px]" style={{ color: "var(--ti-muted)" }}>{l}</p>)}</div>
              {tradeInValue2 !== undefined && <p className="text-[13px] font-medium mt-1" style={{ color: "var(--ti-success)" }}>Avaliação: {formatBRL(tradeInValue2)}</p>}
            </div>
          )}
        </div>
        {hasSecond && <p className="text-[15px] font-bold mt-3" style={{ color: "var(--ti-success)" }}>Avaliação total: {formatBRL(tradeInValue)}</p>}
      </div>

      {/* Pagamento */}
      <div className="rounded-2xl p-5 space-y-5" style={cardStyle}>
        <p className="text-[11px] font-semibold tracking-wider uppercase text-center" style={{ color: "var(--ti-muted)" }}>Você paga apenas a diferença</p>

        <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: "var(--ti-success-light)", border: "1px solid var(--ti-success)" }}>
          <p className="text-[12px] font-semibold mb-1" style={{ color: "var(--ti-success)" }}>PIX / A vista</p>
          <p className="text-[36px] font-bold" style={{ color: "var(--ti-success)" }}>{formatBRL(dif)}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase mb-3 text-center" style={{ color: "var(--ti-muted)" }}>Entrada no PIX (opcional)</p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium" style={{ color: "var(--ti-muted)" }}>R$</span>
            <input type="number" inputMode="numeric" min={0} max={dif-1} placeholder="0" value={entradaStr}
              onChange={(e) => { setEntradaStr(e.target.value); setParc(""); }}
              className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-[15px] transition-colors" style={inputStyle} />
          </div>
          {temEnt && (
            <div className="mt-2 rounded-xl px-4 py-3 flex justify-between text-[13px]" style={{ backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
              <span style={{ color: "var(--ti-muted)" }}>Restante a parcelar</span>
              <span className="font-semibold" style={{ color: "var(--ti-text)" }}>{formatBRL(rest)}</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase mb-3 text-center" style={{ color: "var(--ti-muted)" }}>
            {temEnt ? "Parcelamento do restante" : "Parcelamento no cartao"}
          </p>
          <div className="relative">
            <select value={parc} onChange={(e) => setParc(e.target.value)}
              className="w-full appearance-none px-4 py-3.5 rounded-2xl text-[15px] cursor-pointer transition-colors" style={inputStyle}>
              <option value="">Escolha o parcelamento...</option>
              <option value="pix">PIX a vista — {formatBRL(dif)}</option>
              {parcOpts.map((i) => <option key={i.parcelas} value={String(i.parcelas)}>{i.parcelas}x de {formatBRL(i.valorParcela)} (total: {formatBRL(i.total)})</option>)}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--ti-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </div>
          </div>

          {instSel && (
            <div className="mt-3 rounded-2xl p-4 animate-fadeIn" style={{ backgroundColor: "var(--ti-accent-light)", border: "1px solid var(--ti-accent)" }}>
              {temEnt && <div className="flex justify-between text-[13px] mb-2 pb-2" style={{ borderBottom: `1px solid var(--ti-accent)` }}>
                <span style={{ color: "var(--ti-muted)" }}>Entrada PIX</span><span className="font-semibold" style={{ color: "var(--ti-success)" }}>{formatBRL(entNum)}</span>
              </div>}
              <div className="flex justify-between text-[13px] mb-2">
                <span style={{ color: "var(--ti-muted)" }}>{instSel.parcelas}x no cartao</span>
                <span className="font-semibold" style={{ color: "var(--ti-text)" }}>{formatBRL(instSel.valorParcela)}/mes</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span style={{ color: "var(--ti-muted)" }}>Total cartao</span><span style={{ color: "var(--ti-muted)" }}>{formatBRL(instSel.total)}</span>
              </div>
              {temEnt && <div className="flex justify-between text-[13px] mt-2 pt-2" style={{ borderTop: `1px solid var(--ti-accent)` }}>
                <span className="font-semibold" style={{ color: "var(--ti-text)" }}>Total geral</span>
                <span className="font-bold" style={{ color: "var(--ti-text)" }}>{formatBRL(entNum + instSel.total)}</span>
              </div>}
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <button onClick={() => { onTrackAction?.("quote_whatsapp"); window.open(waUrl, "_blank"); salvarLead({ ...leadBase, status: "GOSTEI", formaPagamento: formaPag }); }}
        className="block w-full py-4 rounded-2xl text-[17px] font-semibold text-center transition-all duration-200 active:scale-[0.98]"
        style={{ backgroundColor: "var(--ti-cta-bg)", color: "var(--ti-cta-text)" }}>
        Gostei da proposta. Quero comprar!
      </button>

      <button onClick={onCotarOutro}
        className="w-full py-4 rounded-2xl text-[15px] font-semibold transition-all duration-200 active:scale-[0.98]"
        style={{ color: "var(--ti-accent)", backgroundColor: "var(--ti-accent-light)", border: "1px solid var(--ti-accent)" }}>
        Cotar outro modelo
      </button>

      {/* Edit buttons */}
      {onGoToStep && (
        <div className="rounded-2xl p-4 space-y-2" style={cardStyle}>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-center mb-2" style={{ color: "var(--ti-muted)" }}>Editar informacoes</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { onTrackAction?.("edit_used"); onGoToStep(1); }}
              className="py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 active:scale-[0.98]"
              style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
              Aparelho usado
            </button>
            <button onClick={() => { onTrackAction?.("edit_new"); onGoToStep(2); }}
              className="py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 active:scale-[0.98]"
              style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
              Aparelho novo
            </button>
            <button onClick={() => { onTrackAction?.("edit_client"); onGoToStep(3); }}
              className="py-2.5 rounded-xl text-[12px] font-medium transition-all duration-200 active:scale-[0.98]"
              style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
              Dados pessoais
            </button>
          </div>
        </div>
      )}

      {!showFeedback ? (
        <button onClick={() => setShowFeedback(true)}
          className="w-full py-3 rounded-2xl text-[14px] font-medium transition-all duration-200"
          style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-btn-bg)", border: "1px solid var(--ti-btn-border)" }}>
          Não gostei. Sair
        </button>
      ) : (
        <div className="rounded-2xl p-5 space-y-4 animate-fadeIn" style={cardStyle}>
          <p className="text-[14px] font-semibold text-center" style={{ color: "var(--ti-text)" }}>Pode nos dizer o motivo?</p>
          <p className="text-[12px] text-center -mt-2" style={{ color: "var(--ti-muted)" }}>Sua resposta nos ajuda a melhorar</p>
          <div className="space-y-2">
            {MOTIVOS_SAIDA.map((m) => (
              <button key={m} onClick={() => setMotivo(motivo===m?"":m)}
                className="w-full text-left px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-200"
                style={motivo===m
                  ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
                  : { backgroundColor: "var(--ti-input-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-card-border)" }}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => { setShowFeedback(false); setMotivo(""); }}
              className="flex-1 py-3 rounded-xl text-[13px] font-medium transition-all"
              style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-input-bg)", border: "1px solid var(--ti-card-border)" }}>
              Cancelar
            </button>
            <button disabled={sairLoading} onClick={async () => {
              onTrackAction?.("quote_exit"); setSairLoading(true); await salvarLead({ ...leadBase, status: "SAIR", motivoSaida: motivo || "Não informado" }); setSairLoading(false); onReset();
            }} className="flex-[2] py-3 rounded-xl text-[13px] font-semibold text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: "var(--ti-error)" }}>
              {sairLoading ? "Salvando..." : "Confirmar e sair"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
