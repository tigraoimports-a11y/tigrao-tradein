"use client";

import { useState } from "react";
import type { ConditionData, QuoteResult } from "@/lib/calculations";
import type { LeadSaiu } from "@/lib/supabase";
import {
  calculateQuote,
  getWhatsAppUrl,
  getConditionLines,
  formatBRL,
} from "@/lib/calculations";

const PARCELAS_EXIBIDAS = [6, 10, 12, 18, 21];

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
    // silencioso — não bloqueia o usuário
  }
}

function generateWhatsAppMsg(
  newModel: string,
  newStorage: string,
  usedModel: string,
  usedStorage: string,
  condition: ConditionData,
  quote: QuoteResult,
  clienteNome: string,
  clienteWhatsApp: string,
  clienteInstagram: string,
  entrada: number
): string {
  const conditionLines = getConditionLines(condition);
  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

  const i12 = quote.installments.find(i => i.parcelas === 12)!;
  const i18 = quote.installments.find(i => i.parcelas === 18)!;
  const i21 = quote.installments.find(i => i.parcelas === 21)!;

  const instagramLine = clienteInstagram ? `Instagram: ${clienteInstagram}\n` : "";
  const entradaLine = entrada > 0
    ? `Entrada no PIX: ${fmt(entrada)}\nRestante parcelado:\n`
    : "";

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
*Voce paga apenas a diferenca:*

*${fmt(quote.pix)}* a vista no PIX
${entradaLine}12x de *${fmt(i12.valorParcela)}* (total: ${fmt(i12.total)})
18x de *${fmt(i18.valorParcela)}* (total: ${fmt(i18.total)})
21x de *${fmt(i21.valorParcela)}* (total: ${fmt(i21.total)})

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
  const [sairLoading, setSairLoading] = useState(false);

  const quoteTotal: QuoteResult = calculateQuote(tradeInValue, newPrice);
  const diferenca = quoteTotal.pix; // PIX = diferença sem acréscimo

  // Entrada válida: número positivo menor que a diferença
  const entradaNum = Math.min(Math.max(parseFloat(entradaStr.replace(",", ".")) || 0, 0), diferenca - 1);
  const temEntrada = entradaNum > 0;

  // Recalcula parcelas sobre (diferença - entrada)
  const restante = diferenca - entradaNum;
  const quoteRestante: QuoteResult = temEntrada
    ? calculateQuote(0, restante) // base já é o restante
    : quoteTotal;

  const conditionLines = getConditionLines(condition);

  const whatsappMsg = generateWhatsAppMsg(
    newModel, newStorage, usedModel, usedStorage, condition,
    quoteRestante, clienteNome, clienteWhatsApp, clienteInstagram, entradaNum
  );
  const whatsappUrl = getWhatsAppUrl(whatsappNumero, whatsappMsg);

  const parcelasExibidas = quoteRestante.installments.filter(i =>
    PARCELAS_EXIBIDAS.includes(i.parcelas)
  );

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
      <div className="rounded-2xl border border-[#D2D2D7] p-5 space-y-5">
        <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] text-center">
          Voce paga apenas a diferenca
        </p>

        {/* Pix à vista */}
        <div className="bg-[#34C759]/5 border border-[#34C759]/20 rounded-2xl p-5 text-center">
          <p className="text-[12px] font-semibold text-[#34C759] mb-1">PIX / A vista</p>
          <p className="text-[36px] font-bold text-[#34C759]">
            {formatBRL(diferenca)}
          </p>
        </div>

        {/* Entrada no PIX */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3 text-center">
            Entrada no PIX + parcelamento no cartao
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
              onChange={(e) => setEntradaStr(e.target.value)}
              className="w-full pl-10 pr-4 py-3.5 rounded-2xl border border-[#D2D2D7] bg-white text-[15px] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] transition-colors"
            />
          </div>
          {temEntrada && (
            <div className="mt-3 bg-[#F5F5F7] rounded-xl px-4 py-3 flex justify-between text-[13px]">
              <span className="text-[#6E6E73]">Restante a parcelar</span>
              <span className="font-semibold text-[#1D1D1F]">{formatBRL(restante)}</span>
            </div>
          )}
        </div>

        {/* Parcelas */}
        <div>
          <p className="text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3 text-center">
            Cartao de credito{temEntrada ? " (sobre o restante)" : ""}
          </p>
          <div className="space-y-2">
            {parcelasExibidas.map((inst) => (
              <div
                key={inst.parcelas}
                className="flex justify-between items-center bg-[#F5F5F7] rounded-xl px-4 py-3"
              >
                <p className="text-[14px] font-semibold text-[#1D1D1F]">
                  {inst.parcelas}x de {formatBRL(inst.valorParcela)}
                </p>
                <p className="text-[12px] text-[#86868B]">
                  total: {formatBRL(inst.total)}
                </p>
              </div>
            ))}
          </div>
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
