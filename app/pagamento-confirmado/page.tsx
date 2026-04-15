"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

// ============================================================
// /pagamento-confirmado
// ============================================================
// Tela exibida após o cliente pagar com sucesso no Mercado Pago
// (fluxo invertido: cliente preencheu /compra → pagou MP → volta aqui).
//
// IMPORTANTE: quem envia a notificação do pedido pro grupo é o webhook
// /api/mp-webhook. Esta tela é só visual — o cliente não precisa fazer
// nada (a gente já foi notificado no momento em que MP confirmou).
// ============================================================

function PagamentoConfirmadoInner() {
  const searchParams = useSearchParams();
  const shortCode = searchParams.get("short") || "";

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center max-w-md w-full">
        {/* Check animado */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#25D366] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-12 h-12 text-white fill-current" aria-hidden>
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-[#1D1D1F] mb-2">
          Pagamento confirmado!
        </h1>
        <p className="text-[#6E6E73] text-sm leading-relaxed mb-6">
          Seu pedido foi registrado com sucesso. Nossa equipe já foi notificada
          e em breve entrará em contato via WhatsApp para combinar os próximos
          passos (entrega ou retirada).
        </p>

        <div className="p-4 rounded-xl bg-[#F5F5F7] text-left space-y-2 mb-6">
          <div className="flex items-start gap-2">
            <span className="text-[#25D366] text-lg leading-none mt-0.5">✓</span>
            <p className="text-sm text-[#1D1D1F]">
              <strong>Pagamento recebido</strong> — Mercado Pago confirmou.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#25D366] text-lg leading-none mt-0.5">✓</span>
            <p className="text-sm text-[#1D1D1F]">
              <strong>Pedido enviado para a loja</strong> — equipe já está analisando.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#E8740E] text-lg leading-none mt-0.5">→</span>
            <p className="text-sm text-[#1D1D1F]">
              <strong>Próximo passo:</strong> nosso time vai te chamar no WhatsApp
              pra confirmar entrega/retirada.
            </p>
          </div>
        </div>

        {shortCode && (
          <p className="text-xs text-[#86868B] mb-4">
            Código do pedido: <span className="font-mono font-semibold">{shortCode}</span>
          </p>
        )}

        <Link
          href="/"
          className="inline-block w-full py-3 bg-[#1D1D1F] text-white font-semibold rounded-xl hover:bg-[#2D2D2F] transition-colors"
        >
          Voltar ao início
        </Link>

        <p className="text-xs text-[#86868B] mt-4">
          Dúvidas? Fale com a gente pelo WhatsApp — o número está no comprovante do Mercado Pago.
        </p>
      </div>
    </div>
  );
}

export default function PagamentoConfirmadoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center">
          <p className="text-[#86868B]">Carregando...</p>
        </div>
      }
    >
      <PagamentoConfirmadoInner />
    </Suspense>
  );
}
