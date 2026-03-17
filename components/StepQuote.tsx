"use client";

import type { ConditionData, QuoteResult } from "@/lib/calculations";
import {
  calculateQuote,
  getWhatsAppUrl,
  getConditionLines,
  formatBRL,
} from "@/lib/calculations";

interface StepQuoteProps {
  newModel: string;
  newStorage: string;
  newPrice: number;
  usedModel: string;
  usedStorage: string;
  condition: ConditionData;
  tradeInValue: number;
  whatsappNumero: string;
  multipliers: Record<number, number>;
  validadeHoras: number;
  onReset: () => void;
}

function generateWhatsAppMsg(
  newModel: string,
  newStorage: string,
  usedModel: string,
  usedStorage: string,
  condition: ConditionData,
  quote: QuoteResult
): string {
  const conditionLines = getConditionLines(condition);
  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

  return `Ola! Vi meu orcamento no site e quero fechar!

*ORCAMENTO DE TROCA - TigraoImports*
------------------------------------

*Produto novo:*
${newModel} ${newStorage}
Lacrado | 1 ano de garantia | Nota Fiscal

*Seu aparelho na troca:*
${usedModel} ${usedStorage}
${conditionLines.join("\n")}

------------------------------------
*Voce paga apenas a diferenca:*

*${fmt(quote.pix)}* a vista no PIX
12x de *${fmt(quote.installment12)}* (total: ${fmt(quote.total12)})
18x de *${fmt(quote.installment18)}* (total: ${fmt(quote.total18)})
21x de *${fmt(quote.installment21)}* (total: ${fmt(quote.total21)})

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
  whatsappNumero,
  multipliers,
  validadeHoras,
  onReset,
}: StepQuoteProps) {
  const quote: QuoteResult = calculateQuote(tradeInValue, newPrice, multipliers);
  const conditionLines = getConditionLines(condition);
  const whatsappMsg = generateWhatsAppMsg(
    newModel, newStorage, usedModel, usedStorage, condition, quote
  );
  const whatsappUrl = getWhatsAppUrl(whatsappNumero, whatsappMsg);

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="text-center mb-2">
        <h2 className="text-[28px] font-bold text-[#1D1D1F]">
          Sua Cotacao
        </h2>
        <p className="text-[13px] text-[#86868B] mt-1">
          Validade: {validadeHoras} horas
        </p>
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

      {/* Valores */}
      <div className="rounded-2xl border border-[#D2D2D7] p-5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-4 text-center">
          Voce paga apenas a diferenca
        </p>

        {/* Pix */}
        <div className="bg-[#34C759]/5 border border-[#34C759]/20 rounded-2xl p-5 mb-4 text-center">
          <p className="text-[12px] font-semibold text-[#34C759] mb-1">PIX / A vista</p>
          <p className="text-[36px] font-bold text-[#34C759]">
            {formatBRL(quote.pix)}
          </p>
        </div>

        {/* Parcelas */}
        <div className="space-y-2">
          {[
            { label: "12x", value: quote.installment12, total: quote.total12 },
            { label: "18x", value: quote.installment18, total: quote.total18 },
            { label: "21x", value: quote.installment21, total: quote.total21 },
          ].map((p) => (
            <div
              key={p.label}
              className="flex justify-between items-center bg-[#F5F5F7] rounded-xl px-4 py-3.5"
            >
              <div>
                <p className="text-[14px] font-semibold text-[#1D1D1F]">
                  {p.label} de {formatBRL(p.value)}
                </p>
                <p className="text-[12px] text-[#86868B]">
                  total: {formatBRL(p.total)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Botão WhatsApp */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full py-4 rounded-2xl text-[17px] font-semibold text-white text-center bg-[#34C759] hover:bg-[#2DB84D] transition-all duration-200 active:scale-[0.98]"
      >
        Desejo fechar meu pedido
      </a>
      <button
        onClick={onReset}
        className="w-full py-3 rounded-2xl text-[14px] text-[#86868B] hover:text-[#6E6E73] transition-colors"
      >
        Recomecar simulacao
      </button>
    </div>
  );
}
