"use client";

import { useState } from "react";

interface StepClientDataProps {
  onNext: (data: {
    clienteNome: string;
    clienteWhatsApp: string;
    clienteInstagram: string;
  }) => void;
  onBack: () => void;
}

export default function StepClientData({ onNext, onBack }: StepClientDataProps) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [instagram, setInstagram] = useState("");

  const canProceed = nome.trim() !== "" && whatsapp.trim() !== "";

  function handleWhatsAppChange(val: string) {
    // Permite apenas números e alguns caracteres de formatação
    const clean = val.replace(/[^\d\s()+\-]/g, "");
    setWhatsapp(clean);
  }

  function handleInstagramChange(val: string) {
    // Garante @ no início
    if (val && !val.startsWith("@")) {
      setInstagram("@" + val);
    } else {
      setInstagram(val);
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-[20px] font-bold text-[#1D1D1F]">
        Quase lá! Seus dados para contato
      </h2>

      <p className="text-[14px] text-[#6E6E73] -mt-4">
        Seus dados ficam salvos apenas para que possamos entrar em contato com sua cotação.
      </p>

      {/* Nome */}
      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3">
          Seu nome *
        </label>
        <input
          type="text"
          placeholder="Como podemos te chamar?"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl border border-[#D2D2D7] bg-white text-[15px] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] transition-colors"
        />
      </div>

      {/* WhatsApp */}
      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3">
          WhatsApp com DDD *
        </label>
        <input
          type="tel"
          placeholder="(21) 99999-9999"
          value={whatsapp}
          onChange={(e) => handleWhatsAppChange(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl border border-[#D2D2D7] bg-white text-[15px] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] transition-colors"
        />
      </div>

      {/* Instagram */}
      <div className="animate-fadeIn">
        <label className="block text-[11px] font-semibold tracking-wider uppercase text-[#86868B] mb-3">
          Instagram (opcional)
        </label>
        <input
          type="text"
          placeholder="@seuperfil"
          value={instagram}
          onChange={(e) => handleInstagramChange(e.target.value)}
          className="w-full px-4 py-3.5 rounded-2xl border border-[#D2D2D7] bg-white text-[15px] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#0071E3] transition-colors"
        />
      </div>

      {/* Botões */}
      <div className="space-y-3 pt-2">
        {canProceed && (
          <button
            onClick={() =>
              onNext({
                clienteNome: nome.trim(),
                clienteWhatsApp: whatsapp.trim(),
                clienteInstagram: instagram.trim(),
              })
            }
            className="w-full py-4 rounded-2xl text-[17px] font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] transition-all duration-200 active:scale-[0.98]"
          >
            Ver minha cotação
          </button>
        )}

        <button
          onClick={onBack}
          className="w-full py-3 rounded-2xl text-[15px] font-medium text-[#6E6E73] bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-all duration-200"
        >
          Voltar
        </button>
      </div>
    </div>
  );
}
