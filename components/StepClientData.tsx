"use client";

import { useState } from "react";

const ORIGENS = [
  "Anuncio", "Story", "Direct",
  "WhatsApp", "Indicacao", "Ja sou cliente",
];

interface StepClientDataProps {
  onNext: (data: { clienteNome: string; clienteWhatsApp: string; clienteInstagram: string; clienteOrigem: string }) => void;
  onBack: () => void;
}

export default function StepClientData({ onNext, onBack }: StepClientDataProps) {
  const [nome, setNome] = useState(""); const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState(""); const [origem, setOrigem] = useState("");
  const canProceed = nome.trim() !== "" && whatsapp.trim() !== "";

  const inputStyle: React.CSSProperties = {
    backgroundColor: "var(--ti-card-bg)", border: "1px solid var(--ti-card-border)",
    color: "var(--ti-text)", outline: "none",
  };

  return (
    <div className="space-y-8">
      <h2 className="text-[20px] font-bold" style={{ color: "var(--ti-text)" }}>Quase la! Seus dados para contato</h2>
      <p className="text-[14px] -mt-4" style={{ color: "var(--ti-muted)" }}>Seus dados ficam salvos apenas para que possamos entrar em contato com sua cotacao.</p>

      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>Seu nome *</label>
        <input type="text" placeholder="Como podemos te chamar?" value={nome} onChange={(e) => setNome(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl text-[15px] transition-colors" style={inputStyle} />
      </div>

      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>WhatsApp com DDD *</label>
        <input type="tel" placeholder="(21) 99999-9999" value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value.replace(/[^\d\s()+\-]/g, ""))}
          className="w-full px-4 py-3.5 rounded-2xl text-[15px] transition-colors" style={inputStyle} />
      </div>

      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>Instagram (opcional)</label>
        <input type="text" placeholder="@seuperfil" value={instagram}
          onChange={(e) => { const v = e.target.value; setInstagram(v && !v.startsWith("@") ? "@"+v : v); }}
          className="w-full px-4 py-3.5 rounded-2xl text-[15px] transition-colors" style={inputStyle} />
      </div>

      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase mb-3" style={{ color: "var(--ti-muted)" }}>Como nos encontrou? (opcional)</label>
        <div className="grid grid-cols-2 gap-2">
          {ORIGENS.map((o) => (
            <button key={o} onClick={() => setOrigem(origem === o ? "" : o)}
              className="px-3 py-3 rounded-2xl text-[13px] font-medium transition-all duration-200 text-left"
              style={origem === o
                ? { backgroundColor: "var(--ti-accent-light)", color: "var(--ti-accent-text)", border: "1px solid var(--ti-accent)" }
                : { backgroundColor: "var(--ti-btn-bg)", color: "var(--ti-btn-text)", border: "1px solid var(--ti-btn-border)" }}>
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 pt-2">
        {canProceed && (
          <button onClick={() => onNext({ clienteNome: nome.trim(), clienteWhatsApp: whatsapp.trim(), clienteInstagram: instagram.trim(), clienteOrigem: origem })}
            className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white transition-all duration-200 active:scale-[0.98]"
            style={{ backgroundColor: "var(--ti-accent)" }}>
            Ver minha cotacao
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
