"use client";

import { useState } from "react";

const ORIGENS = [
  "Instagram (Story)",
  "Instagram (Direct)",
  "Instagram (Feed/Reels)",
  "WhatsApp Nicolas",
  "WhatsApp Bianca",
  "WhatsApp Andre",
  "Indicacao de amigo",
  "Google",
  "Outro",
];

interface StepClientDataProps {
  onNext: (data: {
    clienteNome: string;
    clienteWhatsApp: string;
    clienteInstagram: string;
    clienteOrigem: string;
  }) => void;
  onBack: () => void;
}

export default function StepClientData({ onNext, onBack }: StepClientDataProps) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");
  const [origem, setOrigem] = useState("");

  const canProceed = nome.trim() !== "" && whatsapp.trim() !== "";

  function handleWhatsAppChange(val: string) {
    const clean = val.replace(/[^\d\s()+\-]/g, "");
    setWhatsapp(clean);
  }

  function handleInstagramChange(val: string) {
    if (val && !val.startsWith("@")) {
      setInstagram("@" + val);
    } else {
      setInstagram(val);
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-[20px] font-bold text-[#F5F5F5]">
        Quase la! Seus dados para contato
      </h2>

      <p className="text-[14px] text-[#888] -mt-4">
        Seus dados ficam salvos apenas para que possamos entrar em contato com sua cotacao.
      </p>

      {/* Nome */}
      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3">
          Seu nome *
        </label>
        <input
          type="text"
          placeholder="Como podemos te chamar?"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl border border-[#2A2A2A] bg-[#141414] text-[15px] text-[#F5F5F5] placeholder-[#555] focus:outline-none focus:border-[#E8740E] transition-colors"
        />
      </div>

      {/* WhatsApp */}
      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3">
          WhatsApp com DDD *
        </label>
        <input
          type="tel"
          placeholder="(21) 99999-9999"
          value={whatsapp}
          onChange={(e) => handleWhatsAppChange(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl border border-[#2A2A2A] bg-[#141414] text-[15px] text-[#F5F5F5] placeholder-[#555] focus:outline-none focus:border-[#E8740E] transition-colors"
        />
      </div>

      {/* Instagram */}
      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3">
          Instagram (opcional)
        </label>
        <input
          type="text"
          placeholder="@seuperfil"
          value={instagram}
          onChange={(e) => handleInstagramChange(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl border border-[#2A2A2A] bg-[#141414] text-[15px] text-[#F5F5F5] placeholder-[#555] focus:outline-none focus:border-[#E8740E] transition-colors"
        />
      </div>

      {/* Origem */}
      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#888] mb-3">
          Como nos encontrou? (opcional)
        </label>
        <div className="grid grid-cols-2 gap-2">
          {ORIGENS.map((o) => (
            <button
              key={o}
              onClick={() => setOrigem(origem === o ? "" : o)}
              className={`px-3 py-3 rounded-2xl text-[13px] font-medium transition-all duration-200 border text-left ${
                origem === o
                  ? "bg-[#1E1208] text-[#E8740E] border-[#E8740E]"
                  : "bg-[#141414] text-[#F5F5F5] border-[#2A2A2A] hover:bg-[#1A1A1A]"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      {/* Botoes */}
      <div className="space-y-3 pt-2">
        {canProceed && (
          <button
            onClick={() =>
              onNext({
                clienteNome: nome.trim(),
                clienteWhatsApp: whatsapp.trim(),
                clienteInstagram: instagram.trim(),
                clienteOrigem: origem,
              })
            }
            className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white bg-[#E8740E] hover:bg-[#F5A623] transition-all duration-200 active:scale-[0.98]"
          >
            Ver minha cotacao
          </button>
        )}

        <button
          onClick={onBack}
          className="w-full py-3 rounded-2xl text-[15px] font-medium text-[#888] bg-[#141414] border border-[#2A2A2A] hover:bg-[#1A1A1A] transition-all duration-200"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
