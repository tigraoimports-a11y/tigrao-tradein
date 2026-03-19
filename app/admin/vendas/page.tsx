"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularBruto, calcularRecebimento } from "@/lib/taxas";
import type { Venda } from "@/lib/admin-types";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

export default function VendasPage() {
  const { password } = useAdmin();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"nova" | "historico">("nova");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Form state
  const [form, setForm] = useState({
    data: new Date().toISOString().split("T")[0],
    cliente: "",
    origem: "ANUNCIO",
    tipo: "VENDA",
    produto: "",
    fornecedor: "",
    custo: "",
    preco_vendido: "",
    banco: "ITAU",
    forma: "PIX",
    qnt_parcelas: "",
    bandeira: "",
    local: "",
    produto_na_troca: "",
    entrada_pix: "",
    banco_pix: "",
    banco_2nd: "",
    banco_alt: "",
    parc_alt: "",
    band_alt: "",
    sinal_antecipado: "",
    banco_sinal: "",
  });

  const fetchVendas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/vendas", { headers: { "x-admin-password": password } });
      if (res.ok) {
        const json = await res.json();
        setVendas(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchVendas(); }, [fetchVendas]);

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  // Cálculos em tempo real
  const custo = parseFloat(form.custo) || 0;
  const preco = parseFloat(form.preco_vendido) || 0;
  const lucro = preco - custo;
  const margem = preco > 0 ? (lucro / preco) * 100 : 0;
  const parcelas = parseInt(form.qnt_parcelas) || 0;
  const taxa = form.forma === "CARTAO"
    ? getTaxa(form.banco, form.bandeira || null, parcelas, form.forma)
    : 0;
  const comprovante = taxa > 0 ? calcularBruto(preco, taxa) : preco;
  const recebimento = calcularRecebimento(form.forma, parcelas || null);

  const handleSubmit = async () => {
    if (!form.cliente || !form.produto || !form.preco_vendido) {
      setMsg("Preencha cliente, produto e preco");
      return;
    }
    setSaving(true);
    setMsg("");
    const payload = {
      data: form.data,
      cliente: form.cliente,
      origem: form.origem,
      tipo: form.tipo,
      produto: form.produto,
      fornecedor: form.fornecedor || null,
      custo,
      preco_vendido: preco,
      banco: form.banco,
      forma: form.forma,
      recebimento,
      qnt_parcelas: parcelas || null,
      bandeira: form.bandeira || null,
      valor_comprovante: comprovante || null,
      local: form.local || null,
      produto_na_troca: form.produto_na_troca || null,
      entrada_pix: parseFloat(form.entrada_pix) || 0,
      banco_pix: form.banco_pix || null,
      banco_2nd: form.banco_2nd || null,
      banco_alt: form.banco_alt || null,
      parc_alt: parseInt(form.parc_alt) || null,
      band_alt: form.band_alt || null,
      sinal_antecipado: parseFloat(form.sinal_antecipado) || 0,
      banco_sinal: form.banco_sinal || null,
    };

    const res = await fetch("/api/vendas", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Venda registrada!");
      setForm((f) => ({ ...f, cliente: "", produto: "", fornecedor: "", custo: "", preco_vendido: "", qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "", entrada_pix: "", banco_pix: "", sinal_antecipado: "", banco_sinal: "" }));
      fetchVendas();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";
  const selectCls = inputCls;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2">
        {(["nova", "historico"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
            {t === "nova" ? "Nova Venda" : "Historico"}
          </button>
        ))}
      </div>

      {tab === "nova" ? (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-[#1D1D1F]">Registrar Nova Venda</h2>

          {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

          {/* Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelCls}>Data</p><input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Cliente</p><input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Nome" className={inputCls} /></div>
            <div><p className={labelCls}>Origem</p><select value={form.origem} onChange={(e) => set("origem", e.target.value)} className={selectCls}>
              <option>ANUNCIO</option><option>RECOMPRA</option><option>INDICACAO</option><option>ATACADO</option>
            </select></div>
            <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={selectCls}>
              <option>VENDA</option><option>UPGRADE</option><option>ATACADO</option>
            </select></div>
          </div>

          {/* Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><p className={labelCls}>Produto</p><input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: iPhone 16 Pro Max 256GB" className={inputCls} /></div>
            <div><p className={labelCls}>Fornecedor</p><input value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Local</p><input value={form.local} onChange={(e) => set("local", e.target.value)} className={inputCls} /></div>
          </div>

          {/* Row 3: Valores */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelCls}>Custo (R$)</p><input type="number" value={form.custo} onChange={(e) => set("custo", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Preco Vendido (R$)</p><input type="number" value={form.preco_vendido} onChange={(e) => set("preco_vendido", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Banco</p><select value={form.banco} onChange={(e) => set("banco", e.target.value)} className={selectCls}>
              <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option><option>ESPECIE</option>
            </select></div>
            <div><p className={labelCls}>Forma</p><select value={form.forma} onChange={(e) => set("forma", e.target.value)} className={selectCls}>
              <option>PIX</option><option>CARTAO</option><option>DINHEIRO</option><option>FIADO</option>
            </select></div>
          </div>

          {/* Cartão details */}
          {form.forma === "CARTAO" && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-[#F5F5F7] rounded-xl">
              <div><p className={labelCls}>Parcelas</p><input type="number" value={form.qnt_parcelas} onChange={(e) => set("qnt_parcelas", e.target.value)} placeholder="1" className={inputCls} /></div>
              <div><p className={labelCls}>Bandeira</p><select value={form.bandeira} onChange={(e) => set("bandeira", e.target.value)} className={selectCls}>
                <option value="">Selecionar</option><option>VISA</option><option>MASTERCARD</option><option>ELO</option><option>AMEX</option>
              </select></div>
              <div className="col-span-2 flex items-end gap-4 text-sm">
                <span className="text-[#86868B]">Taxa: <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                <span className="text-[#86868B]">Comprovante: <strong className="text-[#1D1D1F]">{fmt(comprovante)}</strong></span>
              </div>
            </div>
          )}

          {/* Troca / Sinal */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelCls}>Produto na troca</p><input value={form.produto_na_troca} onChange={(e) => set("produto_na_troca", e.target.value)} placeholder="iPhone usado (se houver)" className={inputCls} /></div>
            <div><p className={labelCls}>Sinal antecipado (R$)</p><input type="number" value={form.sinal_antecipado} onChange={(e) => set("sinal_antecipado", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Banco do sinal</p><input value={form.banco_sinal} onChange={(e) => set("banco_sinal", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Entrada PIX (R$)</p><input type="number" value={form.entrada_pix} onChange={(e) => set("entrada_pix", e.target.value)} className={inputCls} /></div>
          </div>

          {/* Preview */}
          <div className="p-4 bg-gradient-to-r from-[#1E1208] to-[#2A1A0F] rounded-xl text-white">
            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-white/60">Lucro</p>
                <p className={`text-lg font-bold ${lucro >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(lucro)}</p>
              </div>
              <div>
                <p className="text-xs text-white/60">Margem</p>
                <p className={`text-lg font-bold ${margem >= 0 ? "text-green-400" : "text-red-400"}`}>{margem.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-xs text-white/60">Recebimento</p>
                <p className="text-lg font-bold text-[#F5A623]">{recebimento}</p>
              </div>
              <div>
                <p className="text-xs text-white/60">Taxa</p>
                <p className="text-lg font-bold text-white">{taxa > 0 ? `${taxa.toFixed(2)}%` : "—"}</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Registrar Venda"}
          </button>
        </div>
      ) : (
        /* Histórico */
        <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between">
            <h2 className="font-bold text-[#1D1D1F]">Historico de Vendas</h2>
            <span className="text-xs text-[#86868B]">{vendas.length} vendas</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-[#86868B]">Carregando...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                    {["Data", "Cliente", "Produto", "Custo", "Vendido", "Lucro", "Margem", "Banco", "Forma", "Receb.", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendas.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-[#86868B]">Nenhuma venda registrada</td></tr>
                  ) : vendas.map((v) => (
                    <tr key={v.id} className="border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors">
                      <td className="px-4 py-3 text-xs text-[#86868B] whitespace-nowrap">{v.data}</td>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{v.cliente}</td>
                      <td className="px-4 py-3 whitespace-nowrap max-w-[200px] truncate">{v.produto}</td>
                      <td className="px-4 py-3 text-[#86868B]">{fmt(v.custo)}</td>
                      <td className="px-4 py-3 font-medium">{fmt(v.preco_vendido)}</td>
                      <td className={`px-4 py-3 font-bold ${v.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(v.lucro)}</td>
                      <td className="px-4 py-3 text-[#86868B]">{Number(v.margem_pct).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-xs">{v.banco}</td>
                      <td className="px-4 py-3 text-xs">{v.forma}{v.qnt_parcelas ? ` ${v.qnt_parcelas}x` : ""}</td>
                      <td className="px-4 py-3 text-xs"><span className={`px-2 py-0.5 rounded text-xs font-semibold ${v.recebimento === "D+0" ? "bg-green-100 text-green-700" : v.recebimento === "D+1" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>{v.recebimento}</span></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={async () => {
                            if (!confirm(`Excluir venda de ${v.cliente}?`)) return;
                            await fetch("/api/vendas", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password }, body: JSON.stringify({ id: v.id }) });
                            setVendas((prev) => prev.filter((r) => r.id !== v.id));
                          }}
                          className="text-[#86868B] hover:text-red-500 text-xs"
                        >X</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
