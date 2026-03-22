"use client";

import { useState, useEffect } from "react";
import type { QuoteResult, InstallmentOption, AnyConditionData, DeviceType } from "@/lib/calculations";
import type { LeadSaiu } from "@/lib/supabase";
import {
  calculateQuote,
  getWhatsAppUrl,
  getAnyConditionLines,
  formatBRL,
} from "@/lib/calculations";

const PARCELAS_OPCOES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];

const MOTIVOS_SAIDA = [
  "Achei o valor alto",
  "Quero me organizar financeiramente",
  "Quero tirar duvidas primeiro",
  "Vou pesquisar em outros lugares",
  "Outro motivo",
];

interface StepQuoteProps {
  newModel: string;
  newStorage: string;
  newPrice: number;
  usedModel: string;
  usedStorage: string;
  condition: AnyConditionData;
  deviceType: DeviceType;
  tradeInValue: number;
  usedModel2?: string;
  usedStorage2?: string;
  condition2?: AnyConditionData;
  deviceType2?: DeviceType;
  tradeInValue1?: number;
  tradeInValue2?: number;
  clienteNome: string;
  clienteWhatsApp: string;
  clienteInstagram: string;
  clienteOrigem: string;
  whatsappNumero: string;
  validadeHoras: number;
  vendedor?: string | null;
  onReset: () => void;
  onCotarOutro: () => void;
}

async function salvarLeadSaiu(lead: LeadSaiu & { formaPagamento?: string; origem?: string; motivoSaida?: string }) {
  try {
    await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
    });
  } catch {
    // silencioso
  }
}

function buildFormaPagamentoMsg(
  entrada: number,
  diferenca: number,
  parcelaSelecionada: string,
  quoteRestante: QuoteResult
): string {
  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

  if (parcelaSelecionada === "pix" || parcelaSelecionada === "") {
    return `${fmt(diferenca)} a vista no PIX`;
  }

  const n = parseInt(parcelaSelecionada);
  const inst = quoteRestante.installments.find(i => i.parcelas === n)!;

  if (entrada > 0) {
    return `${fmt(entrada)} a vista no PIX + ${n}x de ${fmt(inst.valorParcela)} no cartao (total: ${fmt(entrada + inst.total)})`;
  }
  return `${n}x de ${fmt(inst.valorParcela)} no cartao (total: ${fmt(inst.total)})`;
}

// Countdown hook
function useCountdown(hours: number) {
  const [endTime] = useState(() => Date.now() + hours * 60 * 60 * 1000);
  const [remaining, setRemaining] = useState(hours * 60 * 60);

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setRemaining(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function StepQuote({
  newModel,
  newStorage,
  newPrice,
  usedModel,
  usedStorage,
  condition,
  deviceType,
  tradeInValue,
  usedModel2,
  usedStorage2,
  condition2,
  deviceType2,
  tradeInValue1,
  tradeInValue2,
  clienteNome,
  clienteWhatsApp,
  clienteInstagram,
  clienteOrigem,
  whatsappNumero,
  validadeHoras,
  vendedor,
  onReset,
  onCotarOutro,
}: StepQuoteProps) {
  const hasSecond = !!(usedModel2 && usedStorage2);
  const [entradaStr, setEntradaStr] = useState("");
  const [parcelaSelecionada, setParcelaSelecionada] = useState("");
  const [sairLoading, setSairLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [motivoSelecionado, setMotivoSelecionado] = useState("");

  const countdown = useCountdown(validadeHoras);

  const quoteTotal: QuoteResult = calculateQuote(tradeInValue, newPrice);
  const diferenca = quoteTotal.pix;

  const entradaNum = Math.min(
    Math.max(parseFloat(entradaStr.replace(",", ".")) || 0, 0),
    diferenca - 1
  );
  const temEntrada = entradaNum > 0;
  const restante = diferenca - entradaNum;

  const quoteRestante: QuoteResult = temEntrada
    ? calculateQuote(0, restante)
    : quoteTotal;

  const parcelasOpcoes: InstallmentOption[] = quoteRestante.installments.filter(i =>
    PARCELAS_OPCOES.includes(i.parcelas)
  );

  const instSelecionada = parcelaSelecionada && parcelaSelecionada !== "pix"
    ? quoteRestante.installments.find(i => i.parcelas === parseInt(parcelaSelecionada)) ?? null
    : null;

  const formaPagamento = buildFormaPagamentoMsg(
    entradaNum, diferenca, parcelaSelecionada, quoteRestante
  );

  const fmt2 = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  const cLines1 = getAnyConditionLines(deviceType, condition);
  const instagramLine = clienteInstagram ? `Instagram: ${clienteInstagram}\n` : "";

  let usadoSection: string;
  if (hasSecond && condition2) {
    const cLines2 = getAnyConditionLines(deviceType2 ?? "iphone", condition2);
    usadoSection = `*PRODUTO 1 na troca:*
${usedModel} ${usedStorage}
${cLines1.join("\n")}
Avaliacao: ${fmt2(tradeInValue1 ?? 0)}

*PRODUTO 2 na troca:*
${usedModel2} ${usedStorage2}
${cLines2.join("\n")}
Avaliacao: ${fmt2(tradeInValue2 ?? 0)}

*Total avaliacao: ${fmt2(tradeInValue)}*`;
  } else {
    usadoSection = `*Seu aparelho na troca:*
${usedModel} ${usedStorage}
${cLines1.join("\n")}
Avaliacao do usado: ${fmt2(tradeInValue)}`;
  }

  const whatsappMsg = `Ola! Vi meu orcamento no site e quero fechar!

*Nome:* ${clienteNome}
*WhatsApp:* ${clienteWhatsApp}
${instagramLine}
*ORCAMENTO DE TROCA -- TigraoImports*
---

*Produto novo:*
${newModel} ${newStorage} -- ${fmt2(newPrice)}
Lacrado | 1 ano de garantia | Nota Fiscal

${usadoSection}

---
*Diferenca no PIX: ${fmt2(diferenca)}*

*Forma de pagamento escolhida:*
${formaPagamento}

_Validade deste orcamento: ${validadeHoras} horas_

Quero fechar o pedido!`;
  const whatsappUrl = getWhatsAppUrl(whatsappNumero, whatsappMsg);

  const conditionLines = getAnyConditionLines(deviceType, condition);

  const leadBase = {
    nome: clienteNome,
    whatsapp: clienteWhatsApp,
    instagram: clienteInstagram,
    modeloNovo: newModel,
    storageNovo: newStorage,
    precoNovo: newPrice,
    modeloUsado: usedModel,
    storageUsado: usedStorage,
    avaliacaoUsado: tradeInValue,
    diferenca,
    condicaoLinhas: conditionLines,
    vendedor: vendedor || undefined,
    origem: clienteOrigem || undefined,
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-2">
        <h2 className="text-[28px] font-bold text-[#F5F5F5]">Sua Cotacao</h2>
        {/* Countdown timer */}
        <div className="mt-2 inline-flex items-center gap-2 bg-[#E8740E]/10 border border-[#E8740E]/30 rounded-full px-4 py-1.5">
          <span className="text-[11px] text-[#E8740E] font-medium">Valido por</span>
          <span className="text-[14px] font-bold text-[#E8740E] font-mono">{countdown}</span>
        </div>
      </div>

      {/* Produto novo */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3">
          Produto novo
        </p>
        <p className="text-[18px] font-semibold text-[#F5F5F5]">
          {newModel} {newStorage}
        </p>
        <div className="flex gap-4 mt-3 text-[12px] text-[#888]">
          <span>Lacrado</span>
          <span>1 ano garantia</span>
          <span>Nota Fiscal</span>
        </div>
      </div>

      {/* Usado na troca */}
      <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3">
          {hasSecond ? "Seus aparelhos na troca" : "Seu aparelho na troca"}
        </p>
        <div className={hasSecond ? "space-y-3" : ""}>
          <div>
            <p className="text-[18px] font-semibold text-[#F5F5F5]">
              {usedModel} {usedStorage}
            </p>
            <div className="mt-1 space-y-0.5">
              {conditionLines.map((line, i) => (
                <p key={i} className="text-[13px] text-[#888]">{line}</p>
              ))}
            </div>
            {hasSecond && tradeInValue1 !== undefined && (
              <p className="text-[13px] text-[#2ECC71] font-medium mt-1">Avaliacao: {formatBRL(tradeInValue1)}</p>
            )}
          </div>
          {hasSecond && condition2 && (
            <div className="pt-3 border-t border-[#2A2A2A]">
              <p className="text-[18px] font-semibold text-[#F5F5F5]">
                {usedModel2} {usedStorage2}
              </p>
              <div className="mt-1 space-y-0.5">
                {getAnyConditionLines(deviceType2 ?? "iphone", condition2).map((line, i) => (
                  <p key={i} className="text-[13px] text-[#888]">{line}</p>
                ))}
              </div>
              {tradeInValue2 !== undefined && (
                <p className="text-[13px] text-[#2ECC71] font-medium mt-1">Avaliacao: {formatBRL(tradeInValue2)}</p>
              )}
            </div>
          )}
        </div>
        {hasSecond && (
          <p className="text-[15px] text-[#2ECC71] font-bold mt-3">Avaliacao total: {formatBRL(tradeInValue)}</p>
        )}
      </div>

      {/* Pagamento */}
      <div className="rounded-2xl border border-[#2A2A2A] p-5 space-y-5 bg-[#141414]">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#888] text-center">
          Voce paga apenas a diferenca
        </p>

        {/* PIX a vista */}
        <div className="bg-[#2ECC71]/10 border border-[#2ECC71]/20 rounded-2xl p-5 text-center">
          <p className="text-[12px] font-semibold text-[#2ECC71] mb-1">PIX / A vista</p>
          <p className="text-[36px] font-bold text-[#2ECC71]">{formatBRL(diferenca)}</p>
        </div>

        {/* Entrada no PIX */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3 text-center">
            Entrada no PIX (opcional)
          </p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-[#888] font-medium">
              R$
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={diferenca - 1}
              placeholder="0"
              value={entradaStr}
              onChange={(e) => { setEntradaStr(e.target.value); setParcelaSelecionada(""); }}
              className="w-full pl-10 pr-4 py-3.5 rounded-2xl border border-[#2A2A2A] bg-[#0A0A0A] text-[15px] text-[#F5F5F5] placeholder-[#555] focus:outline-none focus:border-[#E8740E] transition-colors"
            />
          </div>
          {temEntrada && (
            <div className="mt-2 bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl px-4 py-3 flex justify-between text-[13px]">
              <span className="text-[#888]">Restante a parcelar</span>
              <span className="font-semibold text-[#F5F5F5]">{formatBRL(restante)}</span>
            </div>
          )}
        </div>

        {/* Dropdown de parcelas */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3 text-center">
            {temEntrada ? "Parcelamento do restante" : "Parcelamento no cartao"}
          </p>
          <div className="relative">
            <select
              value={parcelaSelecionada}
              onChange={(e) => setParcelaSelecionada(e.target.value)}
              className="w-full appearance-none px-4 py-3.5 rounded-2xl border border-[#2A2A2A] bg-[#0A0A0A] text-[15px] text-[#F5F5F5] focus:outline-none focus:border-[#E8740E] transition-colors cursor-pointer"
            >
              <option value="">Escolha o parcelamento...</option>
              <option value="pix">PIX a vista — {formatBRL(diferenca)}</option>
              {parcelasOpcoes.map((inst) => (
                <option key={inst.parcelas} value={String(inst.parcelas)}>
                  {inst.parcelas}x de {formatBRL(inst.valorParcela)} (total: {formatBRL(inst.total)})
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {instSelecionada && (
            <div className="mt-3 bg-[#E8740E]/10 border border-[#E8740E]/20 rounded-2xl p-4 animate-fadeIn">
              {temEntrada && (
                <div className="flex justify-between text-[13px] mb-2 pb-2 border-b border-[#E8740E]/10">
                  <span className="text-[#888]">Entrada PIX</span>
                  <span className="font-semibold text-[#2ECC71]">{formatBRL(entradaNum)}</span>
                </div>
              )}
              <div className="flex justify-between text-[13px] mb-2">
                <span className="text-[#888]">
                  {instSelecionada.parcelas}x no cartao
                </span>
                <span className="font-semibold text-[#F5F5F5]">
                  {formatBRL(instSelecionada.valorParcela)}/mes
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[#888]">Total cartao</span>
                <span className="text-[#888]">{formatBRL(instSelecionada.total)}</span>
              </div>
              {temEntrada && (
                <div className="flex justify-between text-[13px] mt-2 pt-2 border-t border-[#E8740E]/10">
                  <span className="font-semibold text-[#F5F5F5]">Total geral</span>
                  <span className="font-bold text-[#F5F5F5]">{formatBRL(entradaNum + instSelecionada.total)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Botao fechar */}
      <button
        onClick={() => {
          window.open(whatsappUrl, "_blank");
          salvarLeadSaiu({ ...leadBase, status: "GOSTEI", formaPagamento });
        }}
        className="block w-full py-4 rounded-2xl text-[17px] font-semibold text-white text-center bg-[#2ECC71] hover:bg-[#27AE60] transition-all duration-200 active:scale-[0.98]"
      >
        Gostei da proposta. Quero comprar!
      </button>

      {/* Botao COTAR OUTRO MODELO */}
      <button
        onClick={onCotarOutro}
        className="w-full py-4 rounded-2xl text-[15px] font-semibold text-[#E8740E] bg-[#E8740E]/10 border border-[#E8740E]/30 hover:bg-[#E8740E]/20 transition-all duration-200 active:scale-[0.98]"
      >
        Cotar outro modelo
      </button>

      {/* Botao SAIR */}
      {!showFeedback ? (
        <button
          onClick={() => setShowFeedback(true)}
          className="w-full py-3 rounded-2xl text-[14px] font-medium text-[#888] bg-[#141414] border border-[#2A2A2A] hover:bg-[#1A1A1A] transition-all duration-200"
        >
          Nao gostei. Sair
        </button>
      ) : (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-5 space-y-4 animate-fadeIn">
          <p className="text-[14px] font-semibold text-[#F5F5F5] text-center">
            Pode nos dizer o motivo?
          </p>
          <p className="text-[12px] text-[#888] text-center -mt-2">
            Sua resposta nos ajuda a melhorar
          </p>
          <div className="space-y-2">
            {MOTIVOS_SAIDA.map((motivo) => (
              <button
                key={motivo}
                onClick={() => setMotivoSelecionado(motivoSelecionado === motivo ? "" : motivo)}
                className={`w-full text-left px-4 py-3 rounded-xl text-[13px] font-medium transition-all duration-200 border ${
                  motivoSelecionado === motivo
                    ? "bg-[#1E1208] text-[#E8740E] border-[#E8740E]"
                    : "bg-[#0A0A0A] text-[#F5F5F5] border-[#2A2A2A] hover:bg-[#1A1A1A]"
                }`}
              >
                {motivo}
              </button>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => { setShowFeedback(false); setMotivoSelecionado(""); }}
              className="flex-1 py-3 rounded-xl text-[13px] font-medium text-[#888] bg-[#0A0A0A] border border-[#2A2A2A] hover:bg-[#1A1A1A] transition-all"
            >
              Cancelar
            </button>
            <button
              disabled={sairLoading}
              onClick={async () => {
                setSairLoading(true);
                await salvarLeadSaiu({
                  ...leadBase,
                  status: "SAIR",
                  motivoSaida: motivoSelecionado || "Nao informado",
                });
                setSairLoading(false);
                onReset();
              }}
              className="flex-[2] py-3 rounded-xl text-[13px] font-semibold text-white bg-[#E74C3C] hover:bg-[#C0392B] transition-all disabled:opacity-60"
            >
              {sairLoading ? "Salvando..." : "Confirmar e sair"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
