"use client";

import { useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface SaldoRow {
  data: string;
  itau_base: number; inf_base: number; mp_base: number;
  esp_itau: number; esp_inf: number; esp_mp: number; esp_especie: number;
}

interface Conciliacao {
  banco: string;
  icon: string;
  color: string;
  saldoSistema: number;
  saldoReal: number;
  diferenca: number;
}

export default function ConciliacaoPage() {
  const { password } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [saldoSistema, setSaldoSistema] = useState<SaldoRow | null>(null);
  const [itauReal, setItauReal] = useState("");
  const [infReal, setInfReal] = useState("");
  const [mpReal, setMpReal] = useState("");
  const [espReal, setEspReal] = useState("");
  const [conciliado, setConciliado] = useState(false);
  const [dataRef, setDataRef] = useState(new Date().toISOString().split("T")[0]);

  const fetchSaldos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/saldos?data=${dataRef}`, { headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" } });
      const json = await res.json();
      const row = json?.data?.[0] || json?.[0] || null;
      setSaldoSistema(row);
      setConciliado(false);
    } catch { /* silent */ }
    setLoading(false);
  }, [password, dataRef]);

  const parseVal = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;

  const conciliacoes: Conciliacao[] = saldoSistema ? [
    { banco: "Itau", icon: "🏦", color: "text-blue-700", saldoSistema: saldoSistema.esp_itau || 0, saldoReal: parseVal(itauReal), diferenca: parseVal(itauReal) - (saldoSistema.esp_itau || 0) },
    { banco: "Infinite", icon: "💳", color: "text-purple-700", saldoSistema: saldoSistema.esp_inf || 0, saldoReal: parseVal(infReal), diferenca: parseVal(infReal) - (saldoSistema.esp_inf || 0) },
    { banco: "Mercado Pago", icon: "💚", color: "text-green-700", saldoSistema: saldoSistema.esp_mp || 0, saldoReal: parseVal(mpReal), diferenca: parseVal(mpReal) - (saldoSistema.esp_mp || 0) },
    { banco: "Especie", icon: "💵", color: "text-[#1D1D1F]", saldoSistema: saldoSistema.esp_especie || 0, saldoReal: parseVal(espReal), diferenca: parseVal(espReal) - (saldoSistema.esp_especie || 0) },
  ] : [];

  const totalDif = conciliacoes.reduce((s, c) => s + Math.abs(c.diferenca), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1D1D1F]">Conciliacao Bancaria</h1>
        <p className="text-xs text-[#86868B]">Compare os saldos do sistema com os saldos reais dos bancos</p>
      </div>

      {/* Data + Buscar */}
      <div className="flex items-center gap-3">
        <input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)}
          className="px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" />
        <button onClick={fetchSaldos} disabled={loading}
          className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold disabled:opacity-50">
          {loading ? "..." : "Buscar Saldos do Sistema"}
        </button>
      </div>

      {saldoSistema && (
        <>
          {/* Input dos saldos reais */}
          <div className="bg-white rounded-2xl border border-[#D2D2D7] p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-[#86868B] uppercase mb-4">Informe os saldos REAIS (extrato bancario)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">🏦 Itau (real)</label>
                <input value={itauReal} onChange={(e) => setItauReal(e.target.value)} placeholder="0,00"
                  className="w-full px-3 py-2.5 border border-[#D2D2D7] rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">💳 Infinite (real)</label>
                <input value={infReal} onChange={(e) => setInfReal(e.target.value)} placeholder="0,00"
                  className="w-full px-3 py-2.5 border border-[#D2D2D7] rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">💚 Mercado Pago (real)</label>
                <input value={mpReal} onChange={(e) => setMpReal(e.target.value)} placeholder="0,00"
                  className="w-full px-3 py-2.5 border border-[#D2D2D7] rounded-lg text-sm font-mono" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">💵 Especie (real)</label>
                <input value={espReal} onChange={(e) => setEspReal(e.target.value)} placeholder="0,00"
                  className="w-full px-3 py-2.5 border border-[#D2D2D7] rounded-lg text-sm font-mono" />
              </div>
            </div>
            <button onClick={() => setConciliado(true)}
              className="mt-4 px-5 py-2.5 rounded-xl bg-[#1D1D1F] text-white text-sm font-semibold">
              Conciliar
            </button>
          </div>

          {/* Resultado */}
          {conciliado && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#86868B] uppercase">Resultado da Conciliacao — {new Date(dataRef).toLocaleDateString("pt-BR")}</h2>
                {totalDif === 0 ? (
                  <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold">TUDO BATENDO</span>
                ) : (
                  <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold">DIVERGENCIAS: {fmt(totalDif)}</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {conciliacoes.map((c) => {
                  const ok = Math.abs(c.diferenca) < 1;
                  return (
                    <div key={c.banco} className={`bg-white rounded-2xl border p-4 shadow-sm ${ok ? "border-green-300" : "border-red-300"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-bold flex items-center gap-2">{c.icon} {c.banco}</span>
                        {ok ? (
                          <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full">OK</span>
                        ) : (
                          <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full">DIVERGE</span>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-sm">
                          <span className="text-[#86868B]">Sistema (fechamento):</span>
                          <span className="font-semibold">{fmt(c.saldoSistema)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-[#86868B]">Real (extrato):</span>
                          <span className="font-semibold">{fmt(c.saldoReal)}</span>
                        </div>
                        <div className={`flex justify-between text-sm font-bold pt-1.5 border-t ${ok ? "text-green-600" : "text-red-600"}`}>
                          <span>Diferenca:</span>
                          <span>{c.diferenca > 0 ? "+" : ""}{fmt(c.diferenca)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
