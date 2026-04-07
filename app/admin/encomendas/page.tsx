"use client";
import { hojeBR } from "@/lib/date-utils";

import { useEffect, useState, useCallback } from "react";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { useAdmin } from "@/components/admin/AdminShell";
import { corParaPT } from "@/lib/cor-pt";

interface Encomenda {
  id: string;
  created_at: string;
  cliente: string;
  whatsapp: string | null;
  data: string;
  produto: string;
  cor: string | null;
  valor_venda: number;
  sinal_recebido: number;
  banco_sinal: string | null;
  custo: number;
  fornecedor: string | null;
  status: string;
  observacao: string | null;
}

const STATUS_OPTIONS = ["PENDENTE", "COMPRADO", "A CAMINHO", "ENTREGUE", "CANCELADA"] as const;
const STATUS_COLORS: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-700",
  COMPRADO: "bg-blue-100 text-blue-700",
  "A CAMINHO": "bg-purple-100 text-purple-700",
  ENTREGUE: "bg-green-100 text-green-700",
  CANCELADA: "bg-red-100 text-red-600",
};

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

export default function EncomendasPage() {
  const { password, user, darkMode: dm } = useAdmin();
  const [encomendas, setEncomendas] = useState<Encomenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"lista" | "nova">("lista");
  const [filterStatus, setFilterStatus] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    cliente: "", whatsapp: "", data: hojeBR(),
    produto: "", cor: "", valor_venda: "", sinal_recebido: "", banco_sinal: "",
    custo: "", fornecedor: "", observacao: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/encomendas", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) { const json = await res.json(); setEncomendas(json.data ?? []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefetch(fetchData);

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.cliente || !form.produto) { setMsg("Preencha cliente e produto"); return; }
    setSaving(true); setMsg("");
    const res = await fetch("/api/encomendas", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify({
        cliente: form.cliente, whatsapp: form.whatsapp || null, data: form.data,
        produto: form.produto, cor: form.cor || null,
        valor_venda: parseFloat(form.valor_venda) || 0,
        sinal_recebido: parseFloat(form.sinal_recebido) || 0,
        banco_sinal: form.banco_sinal || null,
        custo: parseFloat(form.custo) || 0,
        fornecedor: form.fornecedor || null,
        observacao: form.observacao || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Encomenda registrada!");
      setForm((f) => ({ ...f, cliente: "", whatsapp: "", produto: "", cor: "", valor_venda: "", sinal_recebido: "", banco_sinal: "", custo: "", fornecedor: "", observacao: "" }));
      fetchData();
    } else { setMsg("Erro: " + json.error); }
    setSaving(false);
  };

  const handleStatusChange = async (enc: Encomenda, newStatus: string) => {
    await fetch("/api/encomendas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify({ id: enc.id, status: newStatus }),
    });
    setEncomendas((prev) => prev.map((e) => e.id === enc.id ? { ...e, status: newStatus } : e));
  };

  const filtered = encomendas.filter((e) => !filterStatus || e.status === filterStatus);

  // KPIs
  const pendentes = encomendas.filter((e) => e.status === "PENDENTE").length;
  const aCaminho = encomendas.filter((e) => e.status === "A CAMINHO" || e.status === "COMPRADO").length;
  const totalSinais = encomendas.filter((e) => e.status !== "ENTREGUE" && e.status !== "CANCELADA").reduce((s, e) => s + (e.sinal_recebido || 0), 0);
  const totalPendente = encomendas.filter((e) => e.status !== "ENTREGUE" && e.status !== "CANCELADA").reduce((s, e) => s + (e.valor_venda - (e.sinal_recebido || 0)), 0);

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;

  return (
    <div className="space-y-6">
      {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pendentes", value: pendentes, color: "#F39C12" },
          { label: "Comprado / A Caminho", value: aCaminho, color: "#3498DB" },
          { label: "Sinais recebidos", value: fmt(totalSinais), color: "#2ECC71" },
          { label: "Falta receber", value: fmt(totalPendente), color: "#E8740E" },
        ].map((kpi) => (
          <div key={kpi.label} className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-4 shadow-sm`}>
            <p className={`text-xs mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{kpi.label}</p>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <div className="flex gap-2">
          {(["lista", "nova"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-[#E8740E] text-white" : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}>
              {t === "lista" ? `Encomendas (${encomendas.length})` : "Nova Encomenda"}
            </button>
          ))}
        </div>
        {tab === "lista" && (
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs">
            <option value="">Todos status</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {tab === "nova" ? (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-6 shadow-sm space-y-6`}>
          <h2 className={`text-lg font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Nova Encomenda</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelCls}>Cliente</p><input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>WhatsApp</p><input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Data</p><input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Fornecedor</p><input value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><p className={labelCls}>Produto</p><input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: iPhone 17 Pro Max 256GB" className={inputCls} /></div>
            <div><p className={labelCls}>Cor</p><input value={form.cor} onChange={(e) => set("cor", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Custo (R$)</p><input type="number" value={form.custo} onChange={(e) => set("custo", e.target.value)} className={inputCls} /></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className={labelCls}>Valor de Venda (R$)</p><input type="number" value={form.valor_venda} onChange={(e) => set("valor_venda", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Sinal Recebido (R$)</p><input type="number" value={form.sinal_recebido} onChange={(e) => set("sinal_recebido", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Banco do Sinal</p><select value={form.banco_sinal} onChange={(e) => set("banco_sinal", e.target.value)} className={inputCls}>
              <option value="">—</option><option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option><option>ESPECIE</option>
            </select></div>
          </div>
          <div><p className={labelCls}>Observacao</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} className={inputCls} /></div>
          <button onClick={handleSubmit} disabled={saving} className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {saving ? "Salvando..." : "Registrar Encomenda"}
          </button>
        </div>
      ) : (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                  {["Data", "Cliente", "Produto", "Valor", "Sinal", "Resta", "Fornecedor", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-[#86868B]">Carregando...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-[#86868B]">Nenhuma encomenda</td></tr>
                ) : filtered.map((enc) => (
                  <tr key={enc.id} className="border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors">
                    <td className="px-4 py-3 text-xs text-[#86868B]">{enc.data}</td>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {enc.cliente}
                      {enc.whatsapp && (
                        <a href={`https://wa.me/${enc.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="ml-1 text-green-500 text-xs">WA</a>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{enc.produto}{enc.cor ? ` (${corParaPT(enc.cor)})` : ""}</td>
                    <td className="px-4 py-3 font-medium">{fmt(enc.valor_venda)}</td>
                    <td className="px-4 py-3 text-green-600">{enc.sinal_recebido ? fmt(enc.sinal_recebido) : "—"}</td>
                    <td className="px-4 py-3 text-[#E8740E] font-bold">{fmt(enc.valor_venda - (enc.sinal_recebido || 0))}</td>
                    <td className="px-4 py-3 text-xs text-[#86868B]">{enc.fornecedor || "—"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={enc.status}
                        onChange={(e) => handleStatusChange(enc, e.target.value)}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold border-0 cursor-pointer ${STATUS_COLORS[enc.status] || "bg-gray-100"}`}
                      >
                        {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={async () => {
                        if (!confirm(`Excluir encomenda de ${enc.cliente}?`)) return;
                        await fetch("/api/encomendas", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") }, body: JSON.stringify({ id: enc.id }) });
                        setEncomendas((prev) => prev.filter((e) => e.id !== enc.id));
                      }} className="text-[#86868B] hover:text-red-500 text-xs">X</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
