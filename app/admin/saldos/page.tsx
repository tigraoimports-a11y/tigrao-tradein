"use client";
import { hojeBR } from "@/lib/date-utils";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import type { SaldoBancario } from "@/lib/admin-types";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

// Formata número para exibição BR: 325000.50 → "325.000,50"
function toDisplayBR(raw: string): string {
  const num = parseFloat(raw);
  if (isNaN(num)) return "0,00";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Converte display BR para valor numérico: "325.000,50" → "325000.50"
function fromDisplayBR(display: string): string {
  const clean = display.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(clean);
  if (isNaN(num)) return "0";
  return String(Math.round(num * 100) / 100);
}

export default function SaldosPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [saldos, setSaldos] = useState<SaldoBancario[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataAtual, setDataAtual] = useState(hojeBR());
  const [saldoHoje, setSaldoHoje] = useState<SaldoBancario | null>(null);
  const [saving, setSaving] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [msg, setMsg] = useState("");

  // Form para edição dos saldos base
  const [itau, setItau] = useState("");
  const [inf, setInf] = useState("");
  const [mp, setMp] = useState("");
  const [esp, setEsp] = useState("");

  const fetchSaldos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/saldos", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        setSaldos(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  const fetchSaldoData = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/saldos?data=${d}`, { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        const s = json.data;
        setSaldoHoje(s);
        if (s) {
          setItau(toDisplayBR(String(s.itau_base || 0)));
          setInf(toDisplayBR(String(s.inf_base || 0)));
          setMp(toDisplayBR(String(s.mp_base || 0)));
          setEsp(toDisplayBR(String(s.esp_especie_base ?? s.esp_especie ?? 0)));
        } else {
          setItau("0,00"); setInf("0,00"); setMp("0,00"); setEsp("0,00");
        }
      }
    } catch { /* ignore */ }
  }, [password]);

  useEffect(() => { fetchSaldos(); }, [fetchSaldos]);
  useEffect(() => { fetchSaldoData(dataAtual); }, [dataAtual, fetchSaldoData]);

  const handleSalvar = async () => {
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/saldos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify({
        data: dataAtual,
        itau_base: parseFloat(fromDisplayBR(itau)) || 0,
        inf_base: parseFloat(fromDisplayBR(inf)) || 0,
        mp_base: parseFloat(fromDisplayBR(mp)) || 0,
        esp_especie_base: parseFloat(fromDisplayBR(esp)) || 0,
      }),
    });
    const json = await res.json();
    setMsg(json.ok ? "Saldos base salvos!" : "Erro: " + json.error);
    setSaving(false);
    fetchSaldos();
    fetchSaldoData(dataAtual);
  };

  const handleNoite = async () => {
    setExecutando(true);
    setMsg("");
    const res = await fetch("/api/saldos", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify({ data: dataAtual }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Fechamento executado!");
      fetchSaldos();
      fetchSaldoData(dataAtual);
    } else {
      setMsg("Erro: " + json.error);
    }
    setExecutando(false);
  };

  const [depositando, setDepositando] = useState(false);

  const handleDepositar = async () => {
    const espVal = parseFloat(fromDisplayBR(esp));
    if (!espVal || espVal <= 0) { setMsg("Nenhum valor em especie para depositar"); return; }
    if (!confirm(`Depositar R$ ${toDisplayBR(String(espVal))} de Especie no Itau?`)) return;

    setDepositando(true);
    setMsg("");
    try {
      // Cria gasto com is_dep_esp=true (banco = destino do depósito)
      const res = await fetch("/api/gastos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
          "x-admin-user": encodeURIComponent(user?.nome || "sistema"),
        },
        body: JSON.stringify({
          data: dataAtual,
          tipo: "SAIDA",
          categoria: "TRANSFERENCIA",
          descricao: `Depósito espécie → Itaú`,
          banco: "ITAU",
          valor: espVal,
          is_dep_esp: true,
        }),
      });
      const json = await res.json();
      if (json.ok || json.data) {
        setMsg(`R$ ${toDisplayBR(String(espVal))} depositado de Espécie no Itaú com sucesso!`);
        // Recalcular saldos
        await fetch("/api/saldos", {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
          body: JSON.stringify({ data: dataAtual }),
        });
        fetchSaldos();
        fetchSaldoData(dataAtual);
      } else {
        setMsg("Erro ao depositar: " + (json.error || "desconhecido"));
      }
    } catch {
      setMsg("Erro de conexão ao depositar");
    }
    setDepositando(false);
  };

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold text-[#1D1D1F]">Saldos Bancarios</h2>
        <input type="date" value={dataAtual} onChange={(e) => setDataAtual(e.target.value)} className="px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm" />
      </div>

      {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

      {/* Cards dos bancos */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Itau", color: "#F47920", base: itau, setBase: setItau, esp: saldoHoje?.esp_itau },
          { label: "Infinite", color: "#1D1D1F", base: inf, setBase: setInf, esp: saldoHoje?.esp_inf },
          { label: "Mercado Pago", color: "#00B1EA", base: mp, setBase: setMp, esp: saldoHoje?.esp_mp },
          { label: "Especie", color: "#2ECC71", base: esp, setBase: setEsp, esp: saldoHoje?.esp_especie },
        ].map((bank) => (
          <div key={bank.label} className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-5 shadow-sm`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: bank.color }} />
              <h3 className={`font-semibold text-sm ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{bank.label}</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className={`text-[10px] uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Base manha (pre-D+1)</p>
                <div className="flex items-center gap-1">
                  <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>R$</span>
                  <input type="text" inputMode="decimal" value={bank.base}
                    onChange={(e) => bank.setBase(e.target.value.replace(/[^\d.,-]/g, ""))}
                    onBlur={() => bank.setBase(toDisplayBR(fromDisplayBR(bank.base)))}
                    className={inputCls} />
                </div>
              </div>
              {bank.esp !== undefined && bank.esp !== null && (
                <div>
                  <p className={`text-[10px] uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Fechamento noite</p>
                  <p className="text-lg font-bold" style={{ color: bank.color }}>{fmt(Number(bank.esp))}</p>
                </div>
              )}
              {bank.label === "Especie" && parseFloat(fromDisplayBR(esp)) > 0 && (
                <button onClick={handleDepositar} disabled={depositando} className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F47920] text-white text-xs font-semibold hover:bg-[#E8740E] transition-colors disabled:opacity-50">
                  {depositando ? "Depositando..." : `Depositar ${esp} no Itau`}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Botões */}
      <div className="flex gap-3">
        <button onClick={handleSalvar} disabled={saving} className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar Saldos Base"}
        </button>
        <button onClick={handleNoite} disabled={executando} className="px-6 py-3 rounded-xl bg-[#1D1D1F] text-white font-semibold hover:bg-[#333] transition-colors disabled:opacity-50">
          {executando ? "Executando..." : "Executar Fechamento /noite"}
        </button>
      </div>

      {/* Histórico */}
      <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
        <div className={`px-5 py-4 border-b ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
          <h3 className={`font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Historico (ultimos 7 dias)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                {["Data", "Itau Base", "Inf Base", "MP Base", "Esp Itau", "Esp Inf", "Esp MP", "Especie"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#86868B]">Carregando...</td></tr>
              ) : saldos.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-[#86868B]">Nenhum saldo registrado</td></tr>
              ) : saldos.map((s) => (
                <tr key={s.id} className="border-b border-[#F5F5F7] hover:bg-[#F5F5F7]">
                  <td className="px-4 py-3 font-medium">{s.data}</td>
                  <td className="px-4 py-3">{fmt(s.itau_base)}</td>
                  <td className="px-4 py-3">{fmt(s.inf_base)}</td>
                  <td className="px-4 py-3">{fmt(s.mp_base)}</td>
                  <td className="px-4 py-3 font-bold text-[#F47920]">{fmt(s.esp_itau)}</td>
                  <td className="px-4 py-3 font-bold text-[#1D1D1F]">{fmt(s.esp_inf)}</td>
                  <td className="px-4 py-3 font-bold text-[#00B1EA]">{fmt(s.esp_mp)}</td>
                  <td className="px-4 py-3 font-bold text-[#2ECC71]">{fmt(s.esp_especie)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
