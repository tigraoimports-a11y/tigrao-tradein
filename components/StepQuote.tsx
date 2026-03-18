"use client";

import { useState } from "react";
import type { ConditionData, QuoteResult, InstallmentOption } from "@/lib/calculations";
import type { LeadSaiu } from "@/lib/supabase";
import {
  calculateQuote,
  getWhatsAppUrl,
  getConditionLines,
  formatBRL,
} from "@/lib/calculations";

const PARCELAS_OPCOES = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21];

interface StepQuoteProps {
  newModel: string;
  newStorage: string;
  newPrice: number;
  usedModel: string;
  usedStorage: string;
  condition: ConditionData;
  tradeInValue: number;
  clienteNome: string;
  clienteWhatsApp: string;
  clienteInstagram: string;
  whatsappNumero: string;
  validadeHoras: number;
  onReset: () => void;
}

async function salvarLeadSaiu(lead: LeadSaiu) {
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

function generateWhatsAppMsg(
  newModel: string,
  newStorage: string,
  usedModel: string,
  usedStorage: string,
  condition: ConditionData,
  clienteNome: string,
  clienteWhatsApp: string,
  clienteInstagram: string,
  diferenca: number,
  formaPagamento: string
): string {
  const conditionLines = getConditionLines(condition);
  const instagramLine = clienteInstagram ? `Instagram: ${clienteInstagram}\n` : "";

  return `Ola! Vi meu orcamento no site e quero fechar!

*Nome:* ${clienteNome}
*WhatsApp:* ${clienteWhatsApp}
${instagramLine}
*ORCAMENTO DE TROCA - TigraoImports*
------------------------------------

*Produto novo:*
${newModel} ${newStorage}
Lacrado | 1 ano de garantia | Nota Fiscal

*Seu aparelho na troca:*
${usedModel} ${usedStorage}
${conditionLines.join("\n")}

------------------------------------
*Forma de pagamento:*
${formaPagamento}

Quero fechar o pedido!`;
}

export default function StepQuote({
  newModel,
  newStorage,
  newPrice,
  usedModel,
  usedStorage,
  condition,
  tradeInValue,
  clienteNome,
  clienteWhatsApp,
  clienteInstagram,
  whatsappNumero,
  validadeHoras,
  onReset,
}: StepQuoteProps) {
  const [entradaStr, setEntradaStr] = useState("");
  const [parcelaSelecionada, setParcelaSelecionada] = useState("");
  const [sairLoading, setSairLoading] = useState(false);

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

  const whatsappMsg = generateWhatsAppMsg(
    newModel, newStorage, usedModel, usedStorage, condition,
    clienteNome, clienteWhatsApp, clienteInstagram, diferenca, formaPagamento
  );
  const whatsappUrl = getWhatsAppUrl(whatsappNumero, whatsappMsg);

  const conditionLines = getConditionLines(condition);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-2">
        <h2 className="text-[28px] font-bold text-[#1D1D1F]">Sua Cotacao</h2>
        <p className="text-[13px] text-[#86868B] mt-1">Validade: {validadeHoras} horas</p>
      </div>

      {/* Produto novo */}
      <div className="bg-[#F5F5F7] rounded-2xl p-5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3">
          Produto novo
        </p>
        <p className="text-[18px] font-semibold text-[#1D1D1F]">
          {newModel} {newStorage}
        </p>
        <div className="flex gap-4 mt-3 text-[12px] text-[#86868B]">
          <span>Lacrado</span>
          <span>1 ano garantia</span>
          <span>Nota Fiscal</span>
        </div>
      </div>

      {/* Usado na troca */}
      <div className="bg-[#F5F5F7] rounded-2xl p-5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3">
          Seu aparelho na troca
        </p>
        <p className="text-[18px] font-semibold text-[#1D1D1F]">
          {usedModel} {usedStorage}
        </p>
        <div className="mt-1 space-y-0.5">
          {conditionLines.map((line, i) => (
            <p key={i} className="text-[13px] text-[#6E6E73]">{line}</p>
          ))}
        </div>
      </div>

      {/* Pagamento */}
      <div className="rounded-2xl border border-[#D2D2D7] p-5 space-y-5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] text-center">
          Voce paga apenas a diferenca
        </p>

        {/* PIX à vista */}
        <div className="bg-[#34C759]/5 border border-[#34C759]/20 rounded-2xl p-5 text-center">
          <p className="text-[12px] font-semibold text-[#34C759] mb-1">PIX / A vista</p>
          <p className="text-[36px] font-bold text-[#34C759]">{formatBRL(diferenca)}</p>
        </div>

        {/* Entrada no PIX */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3 text-center">
            Entrada no PIX (opcional)
          </p>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-[#6E6E73] font-medium">
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
              className="w-full pl-10 pr-4 py-3.5 rounded-2xl border border-[#D2D2D7] bg-white text-[15px] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] transition-colors"
            />
          </div>
          {temEntrada && (
            <div className="mt-2 bg-[#F5F5F7] rounded-xl px-4 py-3 flex justify-between text-[13px]">
              <span className="text-[#6E6E73]">Restante a parcelar</span>
              <span className="font-semibold text-[#1D1D1F]">{formatBRL(restante)}</span>
            </div>
          )}
        </div>

        {/* Dropdown de parcelas */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3 text-center">
            {temEntrada ? "Parcelamento do restante" : "Parcelamento no cartao"}
          </p>
          <div className="relative">
            <select
              value={parcelaSelecionada}
              onChange={(e) => setParcelaSelecionada(e.target.value)}
              className="w-full appearance-none px-4 py-3.5 rounded-2xl border border-[#D2D2D7] bg-white text-[15px] text-[#1D1D1F] focus:outline-none focus:border-[#0071E3] transition-colors cursor-pointer"
            >
              <option value="">Escolha o parcelamento...</option>
              <option value="pix">PIX a vista — {formatBRL(diferenca)}</option>
              {parcelasOpcoes.map((inst) => (
                <option key={inst.parcelas} value={String(inst.parcelas)}>
                  {inst.parcelas}x de {formatBRL(inst.valorParcela)} (total: {formatBRL(inst.total)})
                </option>
              ))}
            </select>
            {/* Chevron */}
            <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#86868B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>

          {/* Preview da parcela selecionada */}
          {instSelecionada && (
            <div className="mt-3 bg-[#0071E3]/5 border border-[#0071E3]/20 rounded-2xl p-4 animate-fadeIn">
              {temEntrada && (
                <div className="flex justify-between text-[13px] mb-2 pb-2 border-b border-[#0071E3]/10">
                  <span className="text-[#6E6E73]">Entrada PIX</span>
                  <span className="font-semibold text-[#34C759]">{formatBRL(entradaNum)}</span>
                </div>
              )}
              <div className="flex justify-between text-[13px] mb-2">
                <span className="text-[#6E6E73]">
                  {instSelecionada.parcelas}x no cartao
                </span>
                <span className="font-semibold text-[#1D1D1F]">
                  {formatBRL(instSelecionada.valorParcela)}/mes
                </span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-[#6E6E73]">Total cartao</span>
                <span className="text-[#86868B]">{formatBRL(instSelecionada.total)}</span>
              </div>
              {temEntrada && (
                <div className="flex justify-between text-[13px] mt-2 pt-2 border-t border-[#0071E3]/10">
                  <span className="font-semibold text-[#1D1D1F]">Total geral</span>
                  <span className="font-bold text-[#1D1D1F]">{formatBRL(entradaNum + instSelecionada.total)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Botão fechar */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full py-4 rounded-2xl text-[17px] font-semibold text-white text-center bg-[#34C759] hover:bg-[#2DB84D] transition-all duration-200 active:scale-[0.98]"
      >
        Gostei da proposta. Quero comprar!
      </a>

      {/* Botão SAIR */}
      <button
        disabled={sairLoading}
        onClick={async () => {
          setSairLoading(true);
          await salvarLeadSaiu({
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
          });
          setSairLoading(false);
          onReset();
        }}
        className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white bg-[#FF3B30] hover:bg-[#E0352B] transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
      >
        {sairLoading ? "Salvando..." : "Sair"}
      </button>
    </div>
  );
}
