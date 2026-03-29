"use client";

import { useState, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

// Taxas fixas por parcela (tabela usada com o cliente)
const TAXAS: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 6.5, 6: 7, 7: 7.5, 8: 8.5,
  9: 9.5, 10: 11, 11: 12, 12: 13, 13: 13, 14: 14, 15: 15,
  16: 16, 17: 17, 18: 19, 19: 20, 20: 21, 21: 22,
};

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const fmtDec = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CalculadoraTaxasPage() {
  useAdmin();
  const [valorInput, setValorInput] = useState("");

  const valor = useMemo(() => {
    const clean = valorInput.replace(/\./g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  }, [valorInput]);

  const formatInput = (raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";
    return Number(digits).toLocaleString("pt-BR");
  };

  const parcelas = useMemo(() => {
    if (valor <= 0) return [];
    return Object.entries(TAXAS).map(([p, taxa]) => {
      const n = Number(p);
      const totalParcelado = Math.round(valor / (1 - taxa / 100));
      const valorParcela = Math.round(totalParcelado / n);
      return { parcelas: n, taxa, valorParcela, totalParcelado };
    });
  }, [valor]);

  // Versão "cliente" — sem mostrar a taxa
  const [modoCliente, setModoCliente] = useState(false);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-[#1D1D1F]">Calculadora de Parcelas</h1>
        <p className="text-sm text-[#86868B]">Digite o valor do produto e veja as opcoes de parcelamento</p>
      </div>

      {/* Input */}
      <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
        <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Valor do Produto (R$)</label>
        <input
          type="text"
          inputMode="numeric"
          value={valorInput}
          onChange={(e) => setValorInput(formatInput(e.target.value))}
          placeholder="Ex: 8500"
          className="w-full mt-2 px-4 py-3 text-2xl font-bold text-[#1D1D1F] bg-[#F5F5F7] border border-[#D2D2D7] rounded-xl focus:outline-none focus:border-[#E8740E] transition-colors"
          autoFocus
        />
        {valor > 0 && (
          <p className="text-sm text-[#86868B] mt-2">Valor a receber (liquido): <span className="font-bold text-green-600">{fmt(valor)}</span></p>
        )}
      </div>

      {/* Toggle modo */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setModoCliente(false)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${!modoCliente ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B]"}`}
        >
          Modo Completo
        </button>
        <button
          onClick={() => setModoCliente(true)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${modoCliente ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B]"}`}
        >
          Modo Cliente (sem taxa)
        </button>
      </div>

      {/* Tabela */}
      {valor > 0 && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#1D1D1F] text-white">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase">Parcelas</th>
                {!modoCliente && <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Taxa</th>}
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase">Valor da Parcela</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase">Total Parcelado</th>
              </tr>
            </thead>
            <tbody>
              {/* PIX / A vista */}
              <tr className="border-b border-[#E5E5E5] bg-green-50">
                <td className="px-4 py-3 font-bold text-green-700">PIX / A vista</td>
                {!modoCliente && <td className="px-4 py-3 text-center text-green-600 font-semibold">0%</td>}
                <td className="px-4 py-3 text-center font-bold text-green-700 text-lg">{fmt(valor)}</td>
                <td className="px-4 py-3 text-right font-bold text-green-700">{fmt(valor)}</td>
              </tr>
              {parcelas.map((p, i) => (
                <tr key={p.parcelas} className={`border-b border-[#E5E5E5] ${i % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]"}`}>
                  <td className="px-4 py-3 font-bold text-[#1D1D1F]">{p.parcelas}x</td>
                  {!modoCliente && (
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-orange-100 text-[#E8740E]">{p.taxa}%</span>
                    </td>
                  )}
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold text-[#E8740E]">{fmt(p.valorParcela)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-semibold text-green-600">{fmt(p.totalParcelado)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dica */}
      {valor > 0 && (
        <p className="text-[11px] text-[#86868B] text-center">
          Use "Modo Cliente" para enviar print sem mostrar as taxas
        </p>
      )}
    </div>
  );
}
