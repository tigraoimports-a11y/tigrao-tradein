"use client";

import { useState, useEffect } from "react";

const formatBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatUSD = (v: number) =>
  v.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface CalcResult {
  p: number;
  w: number;
  fx: number;
  markup: number;
  fretePeso: number;
  subtotal: number;
  totalUsd: number;
  totalBrl: number;
}

export default function CalculadoraImportacao() {
  const [preco, setPreco] = useState("");
  const [peso, setPeso] = useState("");
  const [cotacao, setCotacao] = useState("");
  const [result, setResult] = useState<CalcResult | null>(null);

  useEffect(() => {
    if (preco && peso && cotacao) {
      const p = parseFloat(preco);
      const w = parseFloat(peso);
      const fx = parseFloat(cotacao);
      if (p > 0 && w >= 0 && fx > 0) {
        const markup = p * 1.1;
        const fretePeso = w * 30;
        const subtotal = markup + fretePeso;
        const totalUsd = subtotal * 1.12;
        const totalBrl = totalUsd * fx;
        setResult({ markup, fretePeso, subtotal, totalUsd, totalBrl, p, w, fx });
      } else {
        setResult(null);
      }
    } else {
      setResult(null);
    }
  }, [preco, peso, cotacao]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-[#1D1D1F]">Calculadora de Importação</h2>
        <p className="text-sm text-[#86868B] mt-1">
          Calcule o custo final de importação de produtos Apple dos EUA para o Brasil.
        </p>
      </div>

      {/* Formula card */}
      <div className="rounded-2xl border border-[#E5E5EA] bg-[#F5F5F7] px-5 py-4">
        <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-2">
          Fórmula
        </div>
        <code className="text-sm text-[#1D1D1F] font-mono">
          (Preço × 1,10 + Peso × $30) × 1,12 × Câmbio
        </code>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InputField
          label="Preço Apple US"
          prefix="US$"
          value={preco}
          onChange={setPreco}
          placeholder="1000"
        />
        <InputField
          label="Peso do produto"
          suffix="kg"
          value={peso}
          onChange={setPeso}
          placeholder="3.0"
        />
        <InputField
          label="Cotação do dólar"
          prefix="R$"
          value={cotacao}
          onChange={setCotacao}
          placeholder="5.75"
        />
      </div>

      {/* Results */}
      {result && (
        <div className="rounded-2xl border border-[#E5E5EA] bg-white overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="text-[10px] font-semibold text-[#86868B] uppercase tracking-wider mb-4">
              Detalhamento
            </div>

            <Row label="Preço Apple US" value={formatUSD(result.p)} />
            <Row label="+ Markup 10%" value={formatUSD(result.p * 0.1)} sub />
            <Row label={`+ Frete (${result.w}kg × $30)`} value={formatUSD(result.fretePeso)} sub />

            <div className="h-px bg-[#E5E5EA] my-3" />

            <Row label="Subtotal" value={formatUSD(result.subtotal)} />
            <Row label="+ Envio BR 12%" value={formatUSD(result.subtotal * 0.12)} sub />

            <div className="h-px bg-[#E5E5EA] my-3" />

            <Row label="Total em dólar" value={formatUSD(result.totalUsd)} bold />
            <Row label={`Câmbio (R$ ${result.fx.toFixed(2)})`} value="" sub />
          </div>

          {/* Final price */}
          <div className="mt-2 px-5 py-5 bg-gradient-to-r from-[#E8740E] to-[#D06A0D] text-center">
            <div className="text-[10px] font-semibold text-white/80 uppercase tracking-wider mb-1">
              Custo Final
            </div>
            <div className="text-3xl font-extrabold text-white tracking-tight">
              {formatBRL(result.totalBrl)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InputField({
  label,
  prefix,
  suffix,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#86868B] mb-1.5">{label}</label>
      <div className="flex items-center rounded-xl border border-[#D2D2D7] bg-white overflow-hidden focus-within:border-[#E8740E] transition-colors">
        {prefix && (
          <span className="pl-3 text-sm text-[#86868B] font-medium">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-3 bg-transparent text-[#1D1D1F] text-base font-semibold outline-none placeholder:text-[#C7C7CC] w-full"
        />
        {suffix && (
          <span className="pr-3 text-sm text-[#86868B] font-medium">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, sub, bold }: { label: string; value: string; sub?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className={`text-sm ${sub ? "text-[#86868B]" : bold ? "text-[#1D1D1F] font-bold" : "text-[#3C3C43]"}`}>
        {label}
      </span>
      <span className={`text-sm font-mono ${sub ? "text-[#86868B]" : bold ? "text-[#1D1D1F] font-bold" : "text-[#1D1D1F] font-medium"}`}>
        {value}
      </span>
    </div>
  );
}
