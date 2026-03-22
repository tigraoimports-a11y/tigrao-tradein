"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ExitIntentPopupProps {
  /** Current step in the trade-in flow (show popup only if past step 1) */
  step: number;
  /** Client name if already filled */
  clienteNome?: string;
  /** Used device model if selected */
  usedModel?: string;
  /** New device model if selected */
  newModel?: string;
  /** Trade-in value calculated so far */
  tradeInValue?: number;
}

const SESSION_KEY = "tigrao_exit_intent_shown";

export default function ExitIntentPopup({
  step,
  clienteNome,
  usedModel,
  newModel,
  tradeInValue,
}: ExitIntentPopupProps) {
  const [visible, setVisible] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const hasTriggered = useRef(false);

  const shouldShow = step > 1;

  const showPopup = useCallback(() => {
    if (hasTriggered.current) return;
    if (!shouldShow) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    hasTriggered.current = true;
    sessionStorage.setItem(SESSION_KEY, "1");
    setVisible(true);
  }, [shouldShow]);

  useEffect(() => {
    if (!shouldShow) return;
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SESSION_KEY)) return;

    function handleMouseLeave(e: MouseEvent) {
      // Only trigger when mouse leaves toward the top (closing tab area)
      if (e.clientY <= 0) {
        showPopup();
      }
    }

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [shouldShow, showPopup]);

  function handleClose() {
    setVisible(false);
  }

  function formatWhatsApp(value: string): string {
    const digits = value.replace(/\D/g, "");
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  }

  function handleWhatsAppChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 11);
    setWhatsapp(raw);
    setError("");
  }

  async function handleSubmit() {
    if (whatsapp.replace(/\D/g, "").length < 10) {
      setError("Informe um numero valido com DDD");
      return;
    }

    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/leads/exit-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          whatsapp: whatsapp.replace(/\D/g, ""),
          nome: clienteNome || null,
          modelo_usado: usedModel || null,
          modelo_novo: newModel || null,
          valor_cotacao: tradeInValue || null,
        }),
      });

      if (!res.ok) throw new Error("Erro ao salvar");

      setSent(true);
    } catch {
      setError("Erro ao enviar. Tente novamente.");
    } finally {
      setSending(false);
    }
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="relative w-full max-w-[380px] rounded-2xl p-6 animate-fadeIn"
        style={{
          backgroundColor: "#141414",
          border: "1px solid #2A2A2A",
          boxShadow: "0 0 40px rgba(232, 116, 14, 0.15)",
        }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
          style={{ backgroundColor: "#1A1A1A", color: "#888" }}
          aria-label="Fechar"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="1" y1="1" x2="13" y2="13" />
            <line x1="13" y1="1" x2="1" y2="13" />
          </svg>
        </button>

        {sent ? (
          /* Success state */
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "rgba(46, 204, 113, 0.15)" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2ECC71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p className="text-[17px] font-bold" style={{ color: "#F5F5F5" }}>
              Pronto!
            </p>
            <p className="text-[14px] mt-2" style={{ color: "#888" }}>
              Vamos entrar em contato pelo WhatsApp em breve.
            </p>
            <button
              onClick={handleClose}
              className="mt-5 px-6 py-3 rounded-xl text-[14px] font-semibold transition-colors w-full"
              style={{ backgroundColor: "#1A1A1A", border: "1px solid #2A2A2A", color: "#F5F5F5" }}
            >
              Fechar
            </button>
          </div>
        ) : (
          /* Form state */
          <div>
            <div className="text-center mb-5">
              <p className="text-[22px] font-bold" style={{ color: "#F5F5F5" }}>
                Espera!
              </p>
              <p className="text-[14px] mt-2 leading-relaxed" style={{ color: "#888" }}>
                Quer receber sua cotacao no WhatsApp antes de sair?
              </p>
            </div>

            {/* WhatsApp input */}
            <div className="space-y-3">
              <label className="block text-[13px] font-medium" style={{ color: "#888" }}>
                Seu WhatsApp
              </label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="(21) 99999-9999"
                value={formatWhatsApp(whatsapp)}
                onChange={handleWhatsAppChange}
                className="w-full px-4 py-3.5 rounded-xl text-[15px] outline-none transition-colors"
                style={{
                  backgroundColor: "#0A0A0A",
                  border: error ? "1px solid #E74C3C" : "1px solid #2A2A2A",
                  color: "#F5F5F5",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#E8740E"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = error ? "#E74C3C" : "#2A2A2A"; }}
                autoFocus
              />
              {error && (
                <p className="text-[12px]" style={{ color: "#E74C3C" }}>{error}</p>
              )}
            </div>

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={sending}
              className="mt-4 w-full py-3.5 rounded-xl text-[15px] font-bold transition-all"
              style={{
                background: sending
                  ? "#555"
                  : "linear-gradient(135deg, #E8740E, #F5A623)",
                color: "#FFFFFF",
                opacity: sending ? 0.7 : 1,
              }}
            >
              {sending ? "Enviando..." : "Enviar cotacao"}
            </button>

            {/* Dismiss link */}
            <button
              onClick={handleClose}
              className="mt-3 w-full text-center text-[13px] py-2 transition-colors"
              style={{ color: "#555" }}
            >
              Nao, obrigado
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
