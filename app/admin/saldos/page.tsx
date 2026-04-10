"use client";
import { hojeBR } from "@/lib/date-utils";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
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
  useAutoRefetch(fetchSaldos);
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
  const [depModal, setDepModal] = useState(false);
  const [depValor, setDepValor] = useState("");
  const [depBanco, setDepBanco] = useState<"ITAU" | "INFINITE" | "MERCADO_PAGO">("ITAU");
  const [depData, setDepData] = useState("");
  // Histórico de depósitos em espécie
  type DepHist = { id: string; data: string; valor: number; banco: string; descricao: string; observacao?: string; usuario?: string; created_at?: string };
  const [depHistModal, setDepHistModal] = useState(false);
  const [depHist, setDepHist] = useState<DepHist[]>([]);
  const [depHistLoading, setDepHistLoading] = useState(false);
  const fetchDepHist = async () => {
    setDepHistLoading(true);
    try {
      const res = await fetch(`/api/gastos?is_dep_esp=1&limit=100`, { headers: { "x-admin-password": password } });
      const j = await res.json();
      const rows = (j.data || j || []).filter((g: { is_dep_esp?: boolean; categoria?: string; tipo?: string }) =>
        g.is_dep_esp || g.categoria === "TRANSFERENCIA" || g.tipo === "TRANSFERENCIA"
      );
      setDepHist(rows);
    } catch { /* ignore */ }
    setDepHistLoading(false);
  };

  // Valor disponível = fechamento noite da espécie (nunca a base manual)
  const especieDisponivel = Number(saldoHoje?.esp_especie ?? 0);

  const abrirDeposito = () => {
    if (!especieDisponivel || especieDisponivel <= 0) {
      setMsg("Nenhum valor em espécie disponível nesta data");
      return;
    }
    setDepValor(toDisplayBR(String(especieDisponivel)));
    setDepBanco("ITAU");
    setDepData(dataAtual);
    setMsg("");
    setDepModal(true);
  };

  const handleDepositar = async () => {
    const espVal = especieDisponivel;
    const valorDep = parseFloat(fromDisplayBR(depValor));
    if (!valorDep || valorDep <= 0) { setMsg("Valor inválido"); return; }
    if (valorDep > espVal + 0.01) {
      setMsg(`Valor maior que o disponível (R$ ${toDisplayBR(String(espVal))})`);
      return;
    }
    const bancoLabelMap: Record<string, string> = {
      ITAU: "Itaú",
      INFINITE: "Infinite",
      MERCADO_PAGO: "Mercado Pago",
    };
    const bancoSel = { key: depBanco, label: bancoLabelMap[depBanco] };
    const dataDep = depData || dataAtual; // usa data escolhida no modal

    setDepositando(true);
    setMsg("");
    setDepModal(false);
    try {
      const res = await fetch("/api/gastos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
          "x-admin-user": encodeURIComponent(user?.nome || "sistema"),
        },
        body: JSON.stringify({
          data: dataDep,
          tipo: "TRANSFERENCIA",
          categoria: "TRANSFERENCIA",
          descricao: `Depósito espécie → ${bancoSel.label}`,
          banco: bancoSel.key,
          valor: valorDep,
          is_dep_esp: true,
        }),
      });
      const json = await res.json();
      if (!(json.ok || json.data)) {
        setMsg("Erro ao depositar: " + (json.error || "desconhecido"));
        setDepositando(false);
        return;
      }

      // Cascade rebalance: recalcula saldos da data do depósito em diante
      // (todas as datas registradas >= dataDep no histórico)
      const datasAfetadas = saldos
        .map((s) => s.data)
        .filter((d) => d >= dataDep)
        .sort();
      if (!datasAfetadas.includes(dataDep)) datasAfetadas.unshift(dataDep);
      for (const d of datasAfetadas) {
        await fetch("/api/saldos", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": password,
            "x-admin-user": encodeURIComponent(user?.nome || "sistema"),
          },
          body: JSON.stringify({ data: d }),
        });
      }

      setMsg(`✓ R$ ${toDisplayBR(String(valorDep))} depositado no ${bancoSel.label}`);
      fetchSaldos();
      fetchSaldoData(dataAtual);
    } catch {
      setMsg("Erro de conexão ao depositar");
    }
    setDepositando(false);
  };

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <h2 className="text-lg font-bold text-[#1D1D1F]">Saldos Bancarios</h2>
        <input type="date" value={dataAtual} onChange={(e) => setDataAtual(e.target.value)} className="px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm" />
        <button onClick={() => { setDepHistModal(true); fetchDepHist(); }}
          className="ml-auto px-3 py-2 rounded-xl border border-[#D2D2D7] text-sm font-semibold hover:bg-[#F5F5F7]">
          📋 Histórico de depósitos
        </button>
      </div>

      {depHistModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setDepHistModal(false)}>
          <div className={`w-full max-w-2xl max-h-[85vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col ${dm ? "bg-[#1C1C1E] border border-[#3A3A3C]" : "bg-white"}`} onClick={(e) => e.stopPropagation()}>
            <div className={`px-5 py-4 border-b flex items-center justify-between ${dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"}`}>
              <h3 className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Histórico de depósitos em espécie</h3>
              <button onClick={() => setDepHistModal(false)} className="text-lg text-[#86868B] hover:text-red-500">✕</button>
            </div>
            <div className="overflow-y-auto">
              {depHistLoading ? (
                <p className="p-8 text-center text-sm text-[#86868B]">Carregando...</p>
              ) : depHist.length === 0 ? (
                <p className="p-8 text-center text-sm text-[#86868B]">Nenhum depósito encontrado.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className={`${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"} sticky top-0`}>
                    <tr>
                      <th className="px-4 py-2 text-left text-xs uppercase text-[#86868B]">Data</th>
                      <th className="px-4 py-2 text-left text-xs uppercase text-[#86868B]">Banco</th>
                      <th className="px-4 py-2 text-right text-xs uppercase text-[#86868B]">Valor</th>
                      <th className="px-4 py-2 text-left text-xs uppercase text-[#86868B]">Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depHist.map((d) => (
                      <tr key={d.id} className={`border-t ${dm ? "border-[#3A3A3C]" : "border-[#F2F2F7]"}`}>
                        <td className="px-4 py-2 font-medium">{d.data}</td>
                        <td className="px-4 py-2">{d.banco}</td>
                        <td className="px-4 py-2 text-right font-bold text-[#2ECC71]">R$ {fmt(Number(d.valor))}</td>
                        <td className="px-4 py-2 text-xs text-[#86868B]">{d.descricao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

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
              {bank.label === "Especie" && especieDisponivel > 0 && (
                <button onClick={abrirDeposito} disabled={depositando} className="w-full mt-1 px-3 py-2 rounded-xl bg-[#F47920] text-white text-xs font-semibold hover:bg-[#E8740E] transition-colors disabled:opacity-50">
                  {depositando ? "Depositando..." : `Depositar espécie no banco…`}
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

      {depModal && (() => {
        const valorNum = parseFloat(fromDisplayBR(depValor)) || 0;
        const excedeu = valorNum > especieDisponivel + 0.01;
        const bancos = [
          { key: "ITAU" as const, label: "Itaú", color: "#F47920" },
          { key: "INFINITE" as const, label: "Infinite", color: "#1D1D1F" },
          { key: "MERCADO_PAGO" as const, label: "Mercado Pago", color: "#00B1EA" },
        ];
        const setPct = (p: number) => setDepValor(toDisplayBR(String(Math.round(especieDisponivel * p * 100) / 100)));
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !depositando && setDepModal(false)}>
            <div className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden ${dm ? "bg-[#1C1C1E] border border-[#3A3A3C]" : "bg-white border border-[#E8E8ED]"}`} onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 pt-6 pb-5 bg-gradient-to-br from-[#2ECC71]/10 to-[#E8740E]/10 border-b border-[#2ECC71]/20">
                <div className="flex items-start justify-between">
                  <div>
                    <p className={`text-[11px] uppercase tracking-wider font-semibold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Depósito de espécie</p>
                    <h3 className={`text-xl font-bold mt-1 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Transferir para banco</h3>
                    <div className="mt-2 flex items-center gap-2">
                      <label className={`text-[10px] uppercase tracking-wider font-semibold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Data do depósito:</label>
                      <input type="date" value={depData} onChange={(e) => setDepData(e.target.value)}
                        className={`px-2.5 py-1 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`} />
                    </div>
                  </div>
                  <button onClick={() => !depositando && setDepModal(false)} className={`w-8 h-8 rounded-full flex items-center justify-center text-lg ${dm ? "hover:bg-[#2C2C2E] text-[#98989D]" : "hover:bg-[#F5F5F7] text-[#86868B]"}`}>×</button>
                </div>
                <div className={`mt-4 p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-white/70"}`}>
                  <p className={`text-[10px] uppercase tracking-wider ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Disponível em espécie</p>
                  <p className="text-2xl font-bold text-[#2ECC71] mt-0.5">R$ {toDisplayBR(String(especieDisponivel))}</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Banco destino */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Banco destino</label>
                  <div className="grid grid-cols-3 gap-2">
                    {bancos.map((b) => (
                      <button key={b.key} type="button" onClick={() => setDepBanco(b.key)}
                        className={`p-3 rounded-xl border-2 font-semibold text-xs transition-all ${depBanco === b.key ? "border-[#E8740E] bg-[#E8740E]/10" : dm ? "border-[#3A3A3C] bg-[#2C2C2E] hover:border-[#5A5A5C]" : "border-[#E8E8ED] bg-white hover:border-[#D2D2D7]"}`}>
                        <div className="w-2.5 h-2.5 rounded-full mx-auto mb-1.5" style={{ backgroundColor: b.color }} />
                        <span className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{b.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Valor */}
                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Valor a depositar</label>
                  <div className={`flex items-center gap-2 rounded-xl border-2 px-4 py-3 ${excedeu ? "border-red-500" : dm ? "border-[#3A3A3C] bg-[#2C2C2E] focus-within:border-[#E8740E]" : "border-[#E8E8ED] bg-[#F5F5F7] focus-within:border-[#E8740E]"}`}>
                    <span className={`text-lg font-bold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>R$</span>
                    <input type="text" inputMode="decimal" value={depValor} autoFocus
                      onChange={(e) => setDepValor(e.target.value.replace(/[^\d.,-]/g, ""))}
                      onBlur={() => setDepValor(toDisplayBR(fromDisplayBR(depValor)))}
                      className={`flex-1 bg-transparent text-2xl font-bold outline-none ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`} />
                  </div>
                  {excedeu && <p className="text-xs text-red-500 mt-1.5 font-medium">Valor maior que o disponível</p>}
                  {/* Atalhos de percentual */}
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    {[{l:"25%",v:0.25},{l:"50%",v:0.5},{l:"75%",v:0.75},{l:"100%",v:1}].map((p) => (
                      <button key={p.l} type="button" onClick={() => setPct(p.v)}
                        className={`py-1.5 rounded-lg text-xs font-semibold border transition-colors ${dm ? "border-[#3A3A3C] bg-[#2C2C2E] text-[#F5F5F7] hover:border-[#E8740E]" : "border-[#E8E8ED] bg-white text-[#1D1D1F] hover:border-[#E8740E]"}`}>
                        {p.l}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Resumo */}
                {valorNum > 0 && !excedeu && (
                  <div className={`p-3 rounded-xl text-xs ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                    Restará em espécie após depósito:
                    <span className={`font-bold ml-1 ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>
                      R$ {toDisplayBR(String(Math.max(0, especieDisponivel - valorNum)))}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`flex gap-2 p-4 border-t ${dm ? "border-[#3A3A3C] bg-[#1C1C1E]" : "border-[#E8E8ED] bg-[#FAFAFA]"}`}>
                <button onClick={() => setDepModal(false)} disabled={depositando}
                  className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm border ${dm ? "border-[#3A3A3C] text-[#F5F5F7] hover:bg-[#2C2C2E]" : "border-[#D2D2D7] text-[#1D1D1F] hover:bg-white"} disabled:opacity-50`}>
                  Cancelar
                </button>
                <button onClick={handleDepositar} disabled={depositando || excedeu || valorNum <= 0}
                  className="flex-[2] px-4 py-3 rounded-xl bg-gradient-to-r from-[#E8740E] to-[#F5A623] text-white font-semibold text-sm hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                  {depositando ? "Depositando..." : `Depositar R$ ${toDisplayBR(String(valorNum))}`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
