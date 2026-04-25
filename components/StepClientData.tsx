"use client";

import { useState } from "react";
import type { TradeInConfig } from "@/lib/types";

// Campos "Como nos encontrou?" e "Instagram" foram REMOVIDOS (Abr/2026) pra
// reduzir friccao na etapa 4 — cliente nao quer responder isso na hora critica
// do funil (chegar na cotacao). UTMs do anuncio + Meta Pixel ja dao a info de
// origem. Form fica enxuto: so Nome + WhatsApp. Mantemos clienteInstagram="" e
// clienteOrigem="" no payload pra nao quebrar tipos no backend.
interface StepClientDataProps {
  onNext: (data: { clienteNome: string; clienteWhatsApp: string; clienteInstagram: string; clienteOrigem: string }) => void;
  onBack: () => void;
  initialNome?: string;
  initialWhatsApp?: string;
  initialInstagram?: string;
  initialOrigem?: string;
  tradeinConfig?: TradeInConfig | null;
}

export default function StepClientData({ onNext, onBack, initialNome, initialWhatsApp, tradeinConfig }: StepClientDataProps) {
  const [nome, setNome] = useState(initialNome || "");
  const [whatsapp, setWhatsapp] = useState(initialWhatsApp || "");
  const canProceed = nome.trim() !== "" && whatsapp.trim() !== "";

  const lbl = tradeinConfig?.labels || {};

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)",
    color: "var(--ti-text)", outline: "none",
  };

  return (
    <div className="space-y-8">
      <h2 className="text-[20px] font-bold" style={{ color: "var(--ti-text)" }}>Quase lá! Seus dados para contato</h2>
      <p className="text-[14px] -mt-4" style={{ color: "var(--ti-muted)" }}>Seus dados ficam salvos apenas para que possamos entrar em contato com sua cotação.</p>

      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>{lbl.step3_nome_label || "Seu nome"} *</label>
        <input type="text" placeholder={lbl.step3_nome_placeholder || "Como podemos te chamar?"} value={nome} onChange={(e) => setNome(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl text-[15px] transition-colors" style={inputStyle} />
      </div>

      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>{lbl.step3_whatsapp_label || "WhatsApp com DDD"} *</label>
        <input type="tel" placeholder={lbl.step3_whatsapp_placeholder || "(21) 99999-9999"} value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d\s()+\-]/g, ""))}
          className="w-full px-4 py-3.5 rounded-2xl text-[15px] transition-colors" style={inputStyle} />
      </div>

      <div className="space-y-3 pt-2">
        {canProceed && (
          <button onClick={() => onNext({ clienteNome: nome.trim().toUpperCase(), clienteWhatsApp: whatsapp.trim(), clienteInstagram: "", clienteOrigem: "" })}
            className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
            style={{ backgroundColor: "var(--ti-accent)" }}>
            Ver minha cotação
          </button>
        )}
        <button onClick={onBack} className="w-full py-3 rounded-2xl text-[15px] font-medium transition-all duration-200"
          style={{ color: "var(--ti-muted)", backgroundColor: "var(--ti-btn-bg)", border: "1px solid var(--ti-btn-border)" }}>
          Voltar
        </button>
      </div>
    </div>
  );
}
