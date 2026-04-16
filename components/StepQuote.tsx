"use client";

import { useState, useEffect } from "react";
import type { QuoteResult, InstallmentOption, AnyConditionData, DeviceType } from "@/lib/calculations";
import type { LeadSaiu } from "@/lib/supabase";
import type { NewProduct } from "@/lib/types";
import { calculateQuote, getWhatsAppUrl, getAnyConditionLines, formatBRL } from "@/lib/calculations";
import { getHoneypotValue } from "@/lib/honeypot-client";
import FlexiblePaymentSimulator, { type PaymentBlock, type PaymentSummary, calculatePaymentSummary } from "./FlexiblePaymentSimulator";

const PARCELAS_OPCOES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];
const MOTIVOS_SAIDA = ["Achei o valor alto","Quero me organizar financeiramente","Quero tirar duvidas primeiro","Vou pesquisar em outros lugares","Outro motivo"];

interface StepQuoteProps {
  newModel: string; newStorage: string; newPrice: number;
  usedModel: string; usedStorage: string; usedColor?: string; condition: AnyConditionData; deviceType: DeviceType;
  tradeInValue: number;
  usedModel2?: string; usedStorage2?: string; usedColor2?: string; condition2?: AnyConditionData; deviceType2?: DeviceType;
  tradeInValue1?: number; tradeInValue2?: number;
  clienteNome: string; clienteWhatsApp: string; clienteInstagram: string; clienteOrigem: string;
  whatsappNumero: string; validadeHoras: number; vendedor?: string | null;
  allProducts?: NewProduct[];
  onReset: () => void; onCotarOutro: () => void;
  onGoToStep?: (step: number) => void;
  onTrackAction?: (action: string) => void;
}

async function salvarLead(lead: LeadSaiu & { formaPagamento?: string; origem?: string; motivoSaida?: string }) {
  try {
    const payload = { ...lead, website: getHoneypotValue() };
    const res = await fetch("/api/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.status === 429) { console.warn("[salvarLead] Rate limit atingido, mas prosseguindo"); return; }
    const json = await res.json();
    if (json.duplicate) console.log("[salvarLead] Duplicidade ignorada");
    else if (!json.ok) console.error("[salvarLead] Erro:", json.error);
    else console.log("[salvarLead] Simulação salva com sucesso");
  } catch (err) {
    console.error("[salvarLead] Erro de rede:", err);
  }
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
  const { newModel, newStorage, newPrice, usedModel, usedStorage, usedColor, condition, deviceType, tradeInValue,
    usedModel2, usedStorage2, usedColor2, condition2, deviceType2, tradeInValue1, tradeInValue2,
    clienteNome, clienteWhatsApp, clienteInstagram, clienteOrigem, whatsappNumero, validadeHoras, vendedor, allProducts, onReset, onCotarOutro, onGoToStep, onTrackAction } = p;

  const hasSecond = !!(usedModel2 && usedStorage2);
  const [entradaStr, setEntradaStr] = useState(""); const [parc, setParc] = useState("");
  const [sairLoading, setSairLoading] = useState(false); const [showFeedback, setShowFeedback] = useState(false); const [showAllParc, setShowAllParc] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [payMode, setPayMode] = useState<"simples" | "flex">("simples");
  const [fechando, setFechando] = useState(false);
  const [flexBlocks, setFlexBlocks] = useState<PaymentBlock[]>([]);
  const [flexSummary, setFlexSummary] = useState<PaymentSummary | null>(null);
  const countdown = useCountdown(validadeHoras);

  const qt: QuoteResult = calculateQuote(tradeInValue, newPrice);
  const dif = qt.pix;
  const entNum = Math.min(Math.max(parseFloat(entradaStr.replace(",","."))||0,0), dif-1);
  const temEnt = entNum > 0; const rest = dif - entNum;
  const qr: QuoteResult = temEnt ? calculateQuote(0, rest) : qt;
  const parcOpts: InstallmentOption[] = qr.installments.filter(i => PARCELAS_OPCOES.includes(i.parcelas));
  const instSel = parc && parc !== "pix" ? qr.installments.find(i => i.parcelas === parseInt(parc)) ?? null : null;
  const formaPagSimples = buildFormaPag(entNum, dif, parc, qr);
  const formaPagFlex = flexSummary ? flexSummary.blocks.map(b =>
    b.tipo === "PIX" ? `PIX: R$ ${b.valor.toLocaleString("pt-BR")}`
    : b.tipo === "DEBITO" ? `Debito: R$ ${b.valor.toLocaleString("pt-BR")}`
    : `Credito ${b.parcelas}x de R$ ${b.valorParcela.toLocaleString("pt-BR")} (total R$ ${b.totalBloco.toLocaleString("pt-BR")})`
  ).join(" + ") : "";
  const formaPag = payMode === "flex" && formaPagFlex ? formaPagFlex : formaPagSimples;
  const f2 = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  const cL1 = getAnyConditionLines(deviceType, condition);
  const igLine = clienteInstagram ? `Instagram: ${clienteInstagram}\n` : "";

  const corLine1 = usedColor ? `Cor: ${usedColor}\n` : "";
  const corLine2 = usedColor2 ? `Cor: ${usedColor2}\n` : "";
  let usadoSec: string;
  if (hasSecond && condition2) {
    const cL2 = getAnyConditionLines(deviceType2 ?? "iphone", condition2);
    usadoSec = `*PRODUTO 1 na troca:*\n${usedModel} ${usedStorage}\n${corLine1}${cL1.join("\n")}\nAvaliação: ${f2(tradeInValue1??0)}\n\n*PRODUTO 2 na troca:*\n${usedModel2} ${usedStorage2}\n${corLine2}${cL2.join("\n")}\nAvaliação: ${f2(tradeInValue2??0)}\n\n*Total avaliação: ${f2(tradeInValue)}*`;
  } else {
    usadoSec = `*Seu aparelho na troca:*\n${usedModel} ${usedStorage}\n${corLine1}${cL1.join("\n")}\nAvaliação do usado: ${f2(tradeInValue)}`;
  }

  const origemMap: Record<string, string> = {
    "anúncio": "Vim por um anúncio",
    "anuncio": "Vim por um anúncio",
    "story": "Vim pelo Story",
    "direct": "Vim pelo Direct",
    "whatsapp": "Vim pelo WhatsApp",
    "indicação": "Vim por Indicação",
    "indicacao": "Vim por Indicação",
    "já sou cliente": "Já sou cliente de vocês",
    "ja sou cliente": "Já sou cliente de vocês",
    "ja_cliente": "Já sou cliente de vocês",
  };
  const origemKey = clienteOrigem?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
  const origemTexto = clienteOrigem ? (origemMap[origemKey] || origemMap[clienteOrigem?.toLowerCase().normalize("NFC") || ""] || `Vim por ${clienteOrigem}`) : "";
  const origemLine = origemTexto ? `\n${origemTexto} e desejo fechar meu pedido!\n` : "";

  const waMsg = `Olá, me chamo ${clienteNome}. ${origemTexto || "Vi meu orçamento no site"} e desejo fechar meu pedido!\n\n*WhatsApp:* ${clienteWhatsApp}\n${igLine}\n*ORÇAMENTO DE TROCA -- TigraoImports*\n---\n\n*Produto novo:*\n${newModel} ${newStorage} -- ${f2(newPrice)}\nLacrado | 1 ano de garantia | Nota Fiscal\n\n${usadoSec}\n\n---\n*Diferença no PIX: ${f2(dif)}*\n\n*Forma de pagamento escolhida:*\n${formaPag}\n\n_Validade deste orçamento: ${validadeHoras} horas_`;
  const waUrl = getWhatsAppUrl(whatsappNumero, waMsg);
  const condLines = getAnyConditionLines(deviceType, condition);

  const leadBase = { nome: clienteNome, whatsapp: clienteWhatsApp, instagram: clienteInstagram,
    modeloNovo: newModel, storageNovo: newStorage, precoNovo: newPrice, modeloUsado: usedModel,
    storageUsado: usedStorage, corUsado: usedColor || "", avaliacaoUsado: hasSecond ? (tradeInValue1 ?? tradeInValue) : tradeInValue, diferenca: dif, condicaoLinhas: condLines,
    vendedor: vendedor || undefined, origem: clienteOrigem || undefined,
    ...(hasSecond ? { modeloUsado2: usedModel2, storageUsado2: usedStorage2, corUsado2: usedColor2 || "", avaliacaoUsado2: tradeInValue2 ?? 0, condicaoLinhas2: condition2 ? getAnyConditionLines(deviceType2 ?? "iphone", condition2) : [] } : {}) };

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

        {/* Toggle Simples / Personalizado */}
        <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--ti-card-border, #E8E8ED)" }}>
          <button onClick={() => setPayMode("simples")}
            className="flex-1 py-2.5 text-[13px] font-semibold transition-all"
            style={payMode === "simples" ? { backgroundColor: "var(--ti-accent, #E8740E)", color: "#fff" } : { backgroundColor: "var(--ti-input-bg, #F0F0F5)", color: "var(--ti-text, #1D1D1F)" }}>
            Parcelamento
          </button>
          <button onClick={() => setPayMode("flex")}
            className="flex-1 py-2.5 text-[13px] font-semibold transition-all"
            style={payMode === "flex" ? { backgroundColor: "var(--ti-accent, #E8740E)", color: "#fff" } : { backgroundColor: "var(--ti-input-bg, #F0F0F5)", color: "var(--ti-text, #1D1D1F)" }}>
            Personalizado
          </button>
        </div>

        {payMode === "simples" ? (
          <>
            {/* Installment preview: 12x and 21x */}
            <div className="text-center space-y-1">
              {(() => {
                const p12 = parcOpts.find(i => i.parcelas === 12);
                const p21 = parcOpts.find(i => i.parcelas === 21);
                return <>
                  {p12 && <p className="text-[13px]" style={{ color: "var(--ti-muted)" }}>
                    ou <span className="font-semibold" style={{ color: "var(--ti-text)" }}>12x de {formatBRL(p12.valorParcela)}</span> no cartão
                  </p>}
                  {p21 && <p className="text-[13px]" style={{ color: "var(--ti-muted)" }}>
                    ou <span className="font-semibold" style={{ color: "var(--ti-text)" }}>21x de {formatBRL(p21.valorParcela)}</span> no cartão
                  </p>}
                </>;
              })()}
            </div>

            {/* Entrada PIX */}
            <div>
              <p className="text-[13px] font-medium mb-3 text-center" style={{ color: "var(--ti-text)" }}>Deseja dar uma entrada no PIX? Qual valor?</p>
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

            {/* Collapsible installment options */}
            <div>
              <button onClick={() => setShowAllParc(!showAllParc)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[14px] font-medium transition-all duration-200"
                style={{ color: "var(--ti-accent)", backgroundColor: "var(--ti-accent-light)", border: "1px solid var(--ti-accent)" }}>
                <span>Visualizar todos os parcelamentos</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ti-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: showAllParc ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Modal popup de parcelas */}
              {showAllParc && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAllParc(false)}>
                  <div className="w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl overflow-hidden animate-fadeIn" style={{ backgroundColor: "var(--ti-card-bg, #fff)" }} onClick={e => e.stopPropagation()}>
                    <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--ti-card-border, #E8E8ED)" }}>
                      <p className="text-[15px] font-bold" style={{ color: "var(--ti-text)" }}>Escolha o parcelamento</p>
                      <button onClick={() => setShowAllParc(false)} className="w-8 h-8 flex items-center justify-center rounded-full text-[16px]" style={{ color: "var(--ti-muted)" }}>✕</button>
                    </div>
                    <div className="px-4 py-3 max-h-[60vh] overflow-y-auto space-y-1.5">
                      {/* PIX */}
                      <button onClick={() => { setParc("pix"); setShowAllParc(false); }}
                        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all"
                        style={parc === "pix" ? { backgroundColor: "var(--ti-accent-light)", border: "2px solid var(--ti-accent)" } : { backgroundColor: "var(--ti-input-bg)", border: "2px solid transparent" }}>
                        <span className="text-[14px] font-bold" style={{ color: "var(--ti-text)" }}>PIX / A vista</span>
                        <span className="text-[15px] font-bold" style={{ color: "var(--ti-accent)" }}>{formatBRL(dif)}</span>
                      </button>
                      {/* Parcelas */}
                      {parcOpts.map((i) => (
                        <button key={i.parcelas} onClick={() => { setParc(String(i.parcelas)); setShowAllParc(false); }}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                          style={parc === String(i.parcelas) ? { backgroundColor: "var(--ti-accent-light)", border: "2px solid var(--ti-accent)" } : { backgroundColor: "var(--ti-input-bg)", border: "2px solid transparent" }}>
                          <span className="text-[14px] font-semibold" style={{ color: "var(--ti-text)" }}>{i.parcelas}x de {formatBRL(i.valorParcela)}</span>
                          <span className="text-[12px]" style={{ color: "var(--ti-muted)" }}>(total {formatBRL(i.total)})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Resumo da parcela selecionada */}
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
                    <span style={{ color: "var(--ti-muted)" }}>Total cartao</span><span style={{ color: "var(--ti-muted)" }}>(total {formatBRL(instSel.total)})</span>
                  </div>
                  {temEnt && <div className="flex justify-between text-[13px] mt-2 pt-2" style={{ borderTop: `1px solid var(--ti-accent)` }}>
                    <span className="font-semibold" style={{ color: "var(--ti-text)" }}>Total geral</span>
                    <span className="font-bold" style={{ color: "var(--ti-text)" }}>{formatBRL(entNum + instSel.total)}</span>
                  </div>}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Modo Personalizado — simulador flexivel */
          <FlexiblePaymentSimulator
            totalAPagar={dif}
            onPaymentChange={(blocks, summary) => { setFlexBlocks(blocks); setFlexSummary(summary); }}
          />
        )}
      </div>

      {/* CTA — leva pro formulário de compra preenchido */}
      {(() => {
        const condLines = getAnyConditionLines(deviceType, condition);
        // Propagar TODAS as linhas do trade-in (bateria, caixa, peças trocadas, marcas de uso etc)
        const condStr = condLines.join(" | ");
        // Determinar forma de pagamento pra pré-preencher
        const formaPagParam = parc === "pix" ? "PIX" : parc && entNum > 0 ? "PIX + Cartao" : parc ? "Cartao de Credito" : "";
        // Valores de troca: quando tem 2 aparelhos, usar valores individuais
        const valor1 = hasSecond && tradeInValue1 !== undefined ? tradeInValue1 : tradeInValue;
        const valor2 = hasSecond && tradeInValue2 !== undefined ? tradeInValue2 : 0;
        const cond2Lines = hasSecond && condition2 ? getAnyConditionLines(deviceType2 || "iphone", condition2).join(" | ") : "";
        const params = new URLSearchParams({
          produto: `${newModel} ${newStorage}`,
          preco: String(Math.round(newPrice)),
          whatsapp: whatsappNumero,
          ...(vendedor ? { vendedor } : {}),
          ...(usedModel ? { troca_produto: `${usedModel} ${usedStorage || ""}`.trim() } : {}),
          ...(valor1 > 0 ? { troca_valor: String(Math.round(valor1)) } : {}),
          ...(condStr ? { troca_cond: condStr } : {}),
          ...(usedColor ? { troca_cor: usedColor } : {}),
          ...(condition && "hasOriginalBox" in condition ? { troca_caixa: (condition as { hasOriginalBox: boolean }).hasOriginalBox ? "1" : "0" } : {}),
          ...(hasSecond && usedModel2 ? { troca_produto2: `${usedModel2} ${usedStorage2 || ""}`.trim() } : {}),
          ...(hasSecond && valor2 > 0 ? { troca_valor2: String(Math.round(valor2)) } : {}),
          ...(cond2Lines ? { troca_cond2: cond2Lines } : {}),
          ...(hasSecond && usedColor2 ? { troca_cor2: usedColor2 } : {}),
          ...(hasSecond && condition2 && "hasOriginalBox" in condition2 ? { troca_caixa2: (condition2 as { hasOriginalBox: boolean }).hasOriginalBox ? "1" : "0" } : {}),
          ...(clienteNome ? { nome: clienteNome } : {}),
          ...(clienteWhatsApp ? { whatsapp_cliente: clienteWhatsApp } : {}),
          ...(clienteInstagram ? { instagram: clienteInstagram } : {}),
          ...(formaPagParam ? { forma: formaPagParam } : {}),
          ...(parc && parc !== "pix" ? { parcelas: parc } : {}),
          ...(entNum > 0 ? { entrada_pix: String(Math.round(entNum)) } : {}),
        });
        const baseOrigin = typeof window !== "undefined" ? window.location.origin : "";
        const compraUrl = `${baseOrigin}/compra?${params.toString()}`;
        return (
          <button disabled={fechando} onClick={async () => {
            if (fechando) return;
            setFechando(true);
            onTrackAction?.("quote_whatsapp");
            salvarLead({ ...leadBase, status: "GOSTEI", formaPagamento: formaPag });
            if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).fbq) (window as unknown as Record<string, (a: string, b: string, c: Record<string, unknown>) => void>).fbq("track", "CompleteRegistration", { content_name: `${newModel} ${newStorage}`, value: dif, currency: "BRL" });
            // Criar short_code ANTES de navegar, pra que /compra receba ?short=<code>
            // e consiga salvar o cliente_dados_preenchidos na submissão. window.location.href
            // (diferente de window.open) funciona bem após await no Safari.
            const shortData: Record<string, string> = {};
            for (const [k, v] of params.entries()) shortData[k] = v;
            let finalUrl = compraUrl;
            try {
              const shortRes = await fetch("/api/short-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: shortData }) });
              const shortJson = await shortRes.json();
              if (shortJson.code) {
                // Criar link_compras (fire-and-forget) — evita bloquear navegação
                fetch("/api/link-compras-auto", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    short_code: shortJson.code,
                    url_curta: `${baseOrigin}/c/${shortJson.code}`,
                    tipo: usedModel ? "TROCA" : "COMPRA",
                    cliente_nome: clienteNome || null,
                    cliente_telefone: clienteWhatsApp || null,
                    produto: `${newModel} ${newStorage}`.trim(),
                    cor: usedColor || null,
                    valor: Math.round(newPrice),
                    troca_produto: usedModel ? `${usedModel} ${usedStorage || ""}`.trim() : null,
                    troca_valor: Math.round(valor1),
                    troca_condicao: condStr || null,
                    troca_cor: usedColor || null,
                    troca_produto2: hasSecond && usedModel2 ? `${usedModel2} ${usedStorage2 || ""}`.trim() : null,
                    troca_valor2: hasSecond ? Math.round(valor2) : 0,
                    troca_condicao2: cond2Lines || null,
                    troca_cor2: hasSecond ? (usedColor2 || null) : null,
                    vendedor: vendedor || null,
                    website: getHoneypotValue(),
                  }),
                }).catch(() => {});
                // Inclui ?short=<code> na URL de /compra pra que a submissão salve o preenchimento
                const u = new URL(compraUrl);
                u.searchParams.set("short", shortJson.code);
                finalUrl = u.toString();
              }
            } catch {
              // Se falhar, segue sem short (modo degradado, igual comportamento antigo)
            }
            window.location.href = finalUrl;
          }}
            className="block w-full py-4 rounded-2xl text-[17px] font-semibold text-center transition-all duration-200 active:scale-[0.98]"
            style={{ backgroundColor: "#22c55e", color: "#fff", border: "1px solid #22c55e" }}>
            {fechando ? "Redirecionando..." : "DESEJO FECHAR MEU PEDIDO"}
          </button>
        );
      })()}

      {/* Alternativas mais baratas */}
      {(() => {
        if (!allProducts || allProducts.length === 0) return null;
        const currentKey = `${newModel} ${newStorage}`;
        // Filtrar por mesma categoria (iPhone com iPhone, etc)
        const modeloLower = newModel.toLowerCase();
        const isIphone = modeloLower.includes("iphone");
        const isMac = modeloLower.includes("mac");
        const isWatch = modeloLower.includes("watch");
        const isIpad = modeloLower.includes("ipad");
        // Extrair a "linha" do modelo: iPhone 17 Pro Max → "17", Apple Watch Series 11 → "11", MacBook Pro 2024 → "2024"
        const lineMatch = newModel.match(/(\d+)/);
        const productLine = lineMatch ? lineMatch[1] : "";
        const alternatives = allProducts
          .filter(p => {
            const key = `${p.modelo} ${p.armazenamento}`;
            if (key === currentKey) return false;
            if (p.precoPix >= newPrice || p.precoPix <= tradeInValue) return false;
            // Mesma categoria
            const m = p.modelo.toLowerCase();
            if (isIphone && !m.includes("iphone")) return false;
            if (isMac && !m.includes("mac")) return false;
            if (isWatch && !m.includes("watch")) return false;
            if (isIpad && !m.includes("ipad")) return false;
            // Mesma linha: ex iPhone 17 só com outros iPhone 17
            if (productLine) {
              const pLine = p.modelo.match(/(\d+)/);
              if (pLine && pLine[1] !== productLine) return false;
            }
            return true;
          })
          .map(p => ({ ...p, dif: p.precoPix - tradeInValue }))
          .sort((a, b) => b.precoPix - a.precoPix)
          .slice(0, 4);
        if (alternatives.length === 0) return null;
        return (
          <div className="space-y-3">
            <p className="text-[14px] font-bold text-center" style={{ color: "var(--ti-text)" }}>
              Outras opcoes com a sua troca:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {alternatives.map(alt => {
                const altQt = calculateQuote(tradeInValue, alt.precoPix);
                const alt12 = altQt.installments.find(i => i.parcelas === 12);
                const alt21 = altQt.installments.find(i => i.parcelas === 21);
                return (
                  <div key={`${alt.modelo}-${alt.armazenamento}`} className="rounded-2xl p-3 text-center" style={{ backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)" }}>
                    <p className="text-[13px] font-bold leading-tight" style={{ color: "var(--ti-text)" }}>
                      {alt.modelo}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--ti-muted)" }}>{alt.armazenamento}</p>
                    <p className="text-[18px] font-bold mt-2" style={{ color: "#22c55e" }}>
                      {formatBRL(alt.dif)}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--ti-muted)" }}>no PIX</p>
                    <div className="mt-1 text-[10px] space-y-0.5" style={{ color: "var(--ti-muted)" }}>
                      {alt12 && <p>ou 12x de {formatBRL(alt12.valorParcela)}</p>}
                      {alt21 && <p>ou 21x de {formatBRL(alt21.valorParcela)}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-center" style={{ color: "var(--ti-muted)" }}>
              Valores com a troca do seu {usedModel} {usedStorage}
            </p>
          </div>
        );
      })()}


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
          style={{ color: "#fff", backgroundColor: "#ef4444", border: "1px solid #ef4444" }}>
          NÃO GOSTEI, SAIR
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
