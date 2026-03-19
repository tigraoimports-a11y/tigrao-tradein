"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { CATEGORIAS_GASTO } from "@/lib/admin-types";
import type { Gasto } from "@/lib/admin-types";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

export default function GastosPage() {
  const { password } = useAdmin();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"novo" | "historico">("novo");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState({
    data: new Date().toISOString().split("T")[0],
    tipo: "SAIDA",
    categoria: "OUTROS",
    descricao: "",
    valor: "",
    banco: "ITAU",
    observacao: "",
    is_dep_esp: false,
  });

  const fetchGastos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/gastos", { headers: { "x-admin-password": password } });
      if (res.ok) {
        const json = await res.json();
        setGastos(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchGastos(); }, [fetchGastos]);

  const set = (field: string, value: string | boolean) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.valor || !form.categoria) {
      setMsg("Preencha valor e categoria");
      return;
    }
    setSaving(true);
    setMsg("");
    const payload = {
      data: form.data,
      tipo: form.tipo,
      categoria: form.categoria,
      descricao: form.descricao || null,
      valor: parseFloat(form.valor),
      banco: form.banco || null,
      observacao: form.observacao || null,
      is_dep_esp: form.is_dep_esp,
    };

    const res = await fetch("/api/gastos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Gasto registrado!");
      setForm((f) => ({ ...f, descricao: "", valor: "", observacao: "", is_dep_esp: false }));
      fetchGastos();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";

  // Totais
  const totalSaida = gastos.filter((g) => g.tipo === "SAIDA").reduce((s, g) => s + Number(g.valor), 0);
  const totalEntrada = gastos.filter((g) => g.tipo === "ENTRADA").reduce((s, g) => s + Number(g.valor), 0);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["novo", "historico"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
            {t === "novo" ? "Novo Gasto" : "Historico"}
          </button>
        ))}
      </div>

      {tab === "novo" ? (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-[#1D1D1F]">Registrar Gasto / Entrada</h2>

          {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelCls}>Data</p><input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
              <option>SAIDA</option><option>ENTRADA</option>
            </select></div>
            <div><p className={labelCls}>Categoria</p><select value={form.categoria} onChange={(e) => set("categoria", e.target.value)} className={inputCls}>
              {CATEGORIAS_GASTO.map((c) => <option key={c}>{c}</option>)}
            </select></div>
            <div><p className={labelCls}>Valor (R$)</p><input type="number" value={form.valor} onChange={(e) => set("valor", e.target.value)} className={inputCls} /></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className={labelCls}>Descricao</p><input value={form.descricao} onChange={(e) => set("descricao", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Banco</p><select value={form.banco} onChange={(e) => set("banco", e.target.value)} className={inputCls}>
              <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option><option>ESPECIE</option>
            </select></div>
            <div><p className={labelCls}>Observacao</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} className={inputCls} /></div>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#86868B]">
            <input type="checkbox" checked={form.is_dep_esp} onChange={(e) => set("is_dep_esp", e.target.checked)} className="accent-[#E8740E]" />
            Deposito de especie (sai do caixa, entra no banco)
          </label>

          <button onClick={handleSubmit} disabled={saving} className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {saving ? "Salvando..." : "Registrar"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Totais */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-[#86868B]">Total Saidas</p>
              <p className="text-xl font-bold text-red-500">{fmt(totalSaida)}</p>
            </div>
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-[#86868B]">Total Entradas</p>
              <p className="text-xl font-bold text-green-600">{fmt(totalEntrada)}</p>
            </div>
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 shadow-sm">
              <p className="text-xs text-[#86868B]">Saldo</p>
              <p className={`text-xl font-bold ${totalEntrada - totalSaida >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(totalEntrada - totalSaida)}</p>
            </div>
          </div>

          <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                    {["Data", "Tipo", "Categoria", "Descricao", "Valor", "Banco", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-[#86868B]">Carregando...</td></tr>
                  ) : gastos.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-[#86868B]">Nenhum gasto registrado</td></tr>
                  ) : gastos.map((g) => (
                    <tr key={g.id} className="border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors">
                      <td className="px-4 py-3 text-xs text-[#86868B]">{g.data}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${g.tipo === "SAIDA" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>{g.tipo}</span></td>
                      <td className="px-4 py-3 text-xs">{g.categoria}</td>
                      <td className="px-4 py-3 max-w-[200px] truncate">{g.descricao || "—"}</td>
                      <td className={`px-4 py-3 font-bold ${g.tipo === "SAIDA" ? "text-red-500" : "text-green-600"}`}>{fmt(g.valor)}</td>
                      <td className="px-4 py-3 text-xs">{g.banco || "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={async () => {
                          if (!confirm("Excluir?")) return;
                          await fetch("/api/gastos", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password }, body: JSON.stringify({ id: g.id }) });
                          setGastos((prev) => prev.filter((r) => r.id !== g.id));
                        }} className="text-[#86868B] hover:text-red-500 text-xs">X</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
