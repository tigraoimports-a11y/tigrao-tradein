"use client";

import { useState, useMemo } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const TAXA_DEBITO = 1;
const TAXAS: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 6.5, 6: 7, 7: 7.5, 8: 8.5,
  9: 9.5, 10: 11, 11: 12, 12: 13, 13: 13, 14: 14, 15: 15,
  16: 16, 17: 17, 18: 19, 19: 20, 20: 21, 21: 22,
};

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

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

  const debito = useMemo(() => valor > 0 ? Math.ceil(valor * (1 + TAXA_DEBITO / 100)) : 0, [valor]);

  const parcelas = useMemo(() => {
    if (valor <= 0) return [];
    return Object.entries(TAXAS).map(([p, taxa]) => {
      const n = Number(p);
      const total = Math.ceil(valor * (1 + taxa / 100));
      return { n, parcela: Math.ceil(total / n), total };
    });
  }, [valor]);

  return (
    <div className="max-w-md mx-auto space-y-2">
      <div className="bg-white border border-[#D2D2D7] rounded-xl p-2 shadow-sm">
        <input
          type="text"
          inputMode="numeric"
          value={valorInput}
          onChange={(e) => setValorInput(formatInput(e.target.value))}
          placeholder="Valor do produto (R$)"
          className="w-full px-3 py-2 text-xl font-bold text-[#1D1D1F] bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg focus:outline-none focus:border-[#E8740E]"
          autoFocus
        />
      </div>

      {valor > 0 && (
        <div className="bg-white border border-[#D2D2D7] rounded-xl shadow-sm overflow-hidden text-[13px]">
          <table className="w-full">
            <thead>
              <tr className="bg-[#1D1D1F] text-white text-[11px]">
                <th className="px-2 py-1.5 text-left font-semibold"></th>
                <th className="px-2 py-1.5 text-center font-semibold">PARCELA</th>
                <th className="px-2 py-1.5 text-right font-semibold">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[#E5E5E5] bg-green-50">
                <td className="px-2 py-[5px] font-bold text-green-700">PIX</td>
                <td className="px-2 py-[5px] text-center font-bold text-green-700">{fmt(valor)}</td>
                <td className="px-2 py-[5px] text-right font-bold text-green-700">{fmt(valor)}</td>
              </tr>
              <tr className="border-b border-[#E5E5E5] bg-blue-50">
                <td className="px-2 py-[5px] font-bold text-blue-700">Debito</td>
                <td className="px-2 py-[5px] text-center font-bold text-blue-700">{fmt(debito)}</td>
                <td className="px-2 py-[5px] text-right font-bold text-blue-700">{fmt(debito)}</td>
              </tr>
              {parcelas.map((p, i) => (
                <tr key={p.n} className={`border-b border-[#E5E5E5] ${i % 2 === 0 ? "" : "bg-[#FAFAFA]"}`}>
                  <td className="px-2 py-[5px] font-bold text-[#1D1D1F]">{p.n}x</td>
                  <td className="px-2 py-[5px] text-center font-bold text-[#E8740E]">{fmt(p.parcela)}</td>
                  <td className="px-2 py-[5px] text-right font-semibold text-green-600">{fmt(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
