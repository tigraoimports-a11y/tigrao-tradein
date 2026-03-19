"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularBruto, calcularRecebimento } from "@/lib/taxas";
import type { Venda } from "@/lib/admin-types";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const VENDAS_PASSWORD = "tigrao$vendas";

export default function VendasPage() {
  const { password, user } = useAdmin();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"nova" | "historico">("nova");
  const [saving, setSaving] = useState(false);
  const [vendasUnlocked, setVendasUnlocked] = useState(false);
  const [vendasPw, setVendasPw] = useState("");
  const [vendasPwError, setVendasPwError] = useState(false);

  // Admin não precisa de senha extra
  const isAdmin = user?.role === "admin";

  const [msg, setMsg] = useState("");

  // Form state — ALL hooks must be before any conditional return
  const [form, setForm] = useState({
    data: new Date().toISOString().split("T")[0],
    cliente: "", origem: "ANUNCIO", tipo: "VENDA", produto: "", fornecedor: "",
    custo: "", preco_vendido: "", banco: "ITAU", forma: "PIX",
    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
    entrada_pix: "", banco_pix: "ITAU", banco_2nd: "", banco_alt: "",
    parc_alt: "", band_alt: "", sinal_antecipado: "", banco_sinal: "",
    // Dados do aparelho na troca (para criar seminovo)
    troca_produto: "", troca_cor: "", troca_bateria: "", troca_obs: "",
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

  useEffect(() => { if (password) fetchVendas(); }, [password, fetchVendas]);

  // Verificar se já desbloqueou nesta sessão
  useEffect(() => {
    if (isAdmin) { setVendasUnlocked(true); return; }
    const unlocked = sessionStorage.getItem("vendas_unlocked");
    if (unlocked === "true") setVendasUnlocked(true);
  }, [isAdmin]);

  if (!vendasUnlocked) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-full max-w-sm">
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="text-center">
              <div className="text-3xl mb-2">🔒</div>
              <h2 className="text-lg font-bold text-[#1D1D1F]">Area Restrita</h2>
              <p className="text-[#86868B] text-xs mt-1">Digite a senha para acessar Vendas</p>
            </div>
            <input
              type="password"
              placeholder="Senha de Vendas"
              value={vendasPw}
              onChange={(e) => { setVendasPw(e.target.value); setVendasPwError(false); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (vendasPw === VENDAS_PASSWORD) {
                    setVendasUnlocked(true);
                    sessionStorage.setItem("vendas_unlocked", "true");
                  } else {
                    setVendasPwError(true);
                  }
                }
              }}
              className="w-full px-4 py-3 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] placeholder-[#86868B] focus:outline-none focus:border-[#E8740E]"
            />
            {vendasPwError && <p className="text-[#E74C3C] text-sm text-center">Senha incorreta</p>}
            <button
              onClick={() => {
                if (vendasPw === VENDAS_PASSWORD) {
                  setVendasUnlocked(true);
                  sessionStorage.setItem("vendas_unlocked", "true");
                } else {
                  setVendasPwError(true);
                }
              }}
              className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors"
            >
              Desbloquear
            </button>
          </div>
        </div>
      </div>
    );
  }

  const set = (field: string, value: string | boolean) => setForm((f) => ({ ...f, [field]: value }));

  // Cálculos em tempo real
  const custo = parseFloat(form.custo) || 0;
  const preco = parseFloat(form.preco_vendido) || 0;
  const valorTroca = parseFloat(form.produto_na_troca) || 0;
  const entradaPix = parseFloat(form.entrada_pix) || 0;
  const valorCartao = preco - valorTroca - entradaPix;
  const lucro = preco - custo;
  const margem = preco > 0 ? (lucro / preco) * 100 : 0;
  const parcelas = parseInt(form.qnt_parcelas) || 0;
  const taxa = form.forma === "CARTAO"
    ? getTaxa(form.banco, form.bandeira || null, parcelas, form.forma)
    : form.forma === "LINK" ? getTaxa("MERCADO_PAGO", null, parcelas, "CARTAO") : 0;
  const comprovante = taxa > 0 ? calcularBruto(valorCartao > 0 ? valorCartao : preco, taxa) : preco;
  const recebimento = calcularRecebimento(form.forma === "LINK" ? "CARTAO" : form.forma, parcelas || null);

  // Resumo financeiro
  const temTroca = valorTroca > 0;
  const temEntradaPix = entradaPix > 0;
  const temCartao = form.forma === "CARTAO" || form.forma === "LINK";

  const handleSubmit = async () => {
    if (!form.cliente || !form.produto || !form.preco_vendido) {
      setMsg("Preencha cliente, produto e preco");
      return;
    }
    setSaving(true);
    setMsg("");

    // Determinar banco principal
    let banco = form.banco;
    if (form.forma === "LINK") banco = "MERCADO_PAGO";
    if (form.forma === "PIX") banco = form.banco_pix || "ITAU";
    if (form.forma === "DINHEIRO") banco = "ESPECIE";

    const payload: Record<string, unknown> = {
      data: form.data,
      cliente: form.cliente,
      origem: form.origem,
      tipo: temTroca ? "UPGRADE" : form.tipo,
      produto: form.produto,
      fornecedor: form.fornecedor || null,
      custo,
      preco_vendido: preco,
      banco,
      forma: form.forma === "LINK" ? "CARTAO" : form.forma,
      recebimento: form.forma === "PIX" || form.forma === "DINHEIRO" ? "D+0" : form.forma === "LINK" ? "D+0" : "D+1",
      qnt_parcelas: parcelas || null,
      bandeira: form.bandeira || null,
      valor_comprovante: comprovante || null,
      local: form.local || null,
      produto_na_troca: temTroca ? String(valorTroca) : null,
      entrada_pix: entradaPix,
      banco_pix: temEntradaPix ? (form.banco_pix || "ITAU") : null,
      banco_2nd: form.banco_2nd || null,
      banco_alt: form.banco_alt || null,
      parc_alt: parseInt(form.parc_alt) || null,
      band_alt: form.band_alt || null,
      sinal_antecipado: parseFloat(form.sinal_antecipado) || 0,
      banco_sinal: form.banco_sinal || null,
    };

    // Se tem troca, enviar dados do seminovo para criar no estoque
    if (temTroca && form.troca_produto) {
      payload._seminovo = {
        produto: form.troca_produto,
        valor: valorTroca,
        cor: form.troca_cor || null,
        bateria: form.troca_bateria ? parseInt(form.troca_bateria as string) : null,
        observacao: form.troca_obs || null,
      };
    }

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
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className={labelCls}>Custo (R$)</p><input type="number" value={form.custo} onChange={(e) => set("custo", e.target.value)} placeholder="Quanto voce pagou" className={inputCls} /></div>
            <div><p className={labelCls}>Preco Vendido Liquido (R$)</p><input type="number" value={form.preco_vendido} onChange={(e) => set("preco_vendido", e.target.value)} placeholder="Valor que voce recebe" className={inputCls} /></div>
            <div><p className={labelCls}>Local</p><select value={form.local} onChange={(e) => set("local", e.target.value)} className={selectCls}>
              <option value="">—</option><option>ENTREGA</option><option>RETIRADA</option><option>CORREIO</option>
            </select></div>
          </div>

          {/* FORMA DE PAGAMENTO */}
          <div className="border border-[#D2D2D7] rounded-xl p-4 space-y-4">
            <p className="text-sm font-bold text-[#1D1D1F]">Como o cliente pagou?</p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className={labelCls}>Forma principal</p><select value={form.forma} onChange={(e) => set("forma", e.target.value)} className={selectCls}>
                <option value="PIX">PIX (Itau/Infinite) — D+0</option>
                <option value="LINK">Link Mercado Pago — D+0</option>
                <option value="CARTAO">Maquina Cartao (Itau/Infinite) — D+1</option>
                <option value="DINHEIRO">Dinheiro — D+0</option>
                <option value="FIADO">Fiado</option>
              </select></div>

              {form.forma === "PIX" && (
                <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                  <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                </select></div>
              )}

              {(form.forma === "CARTAO") && (
                <>
                  <div><p className={labelCls}>Maquina</p><select value={form.banco} onChange={(e) => set("banco", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option>
                  </select></div>
                  <div><p className={labelCls}>Parcelas</p><input type="number" value={form.qnt_parcelas} onChange={(e) => set("qnt_parcelas", e.target.value)} placeholder="1" className={inputCls} /></div>
                  <div><p className={labelCls}>Bandeira</p><select value={form.bandeira} onChange={(e) => set("bandeira", e.target.value)} className={selectCls}>
                    <option value="">Selecionar</option><option>VISA</option><option>MASTERCARD</option><option>ELO</option><option>AMEX</option>
                  </select></div>
                  {taxa > 0 && <div className="flex items-end text-sm gap-3">
                    <span className="text-[#86868B]">Taxa: <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                    <span className="text-[#86868B]">Comprovante: <strong>{fmt(comprovante)}</strong></span>
                  </div>}
                </>
              )}

              {form.forma === "LINK" && (
                <div><p className={labelCls}>Parcelas no Link</p><input type="number" value={form.qnt_parcelas} onChange={(e) => set("qnt_parcelas", e.target.value)} placeholder="1" className={inputCls} /></div>
              )}
            </div>

            {/* Entrada PIX (pagamento misto) */}
            <div className="border-t border-[#E8E8ED] pt-3">
              <p className="text-xs text-[#86868B] mb-2">Pagamento misto? (cliente deu PIX + cartao/link)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelCls}>Entrada no PIX (R$)</p><input type="number" value={form.entrada_pix} onChange={(e) => set("entrada_pix", e.target.value)} placeholder="0" className={inputCls} /></div>
                {entradaPix > 0 && (
                  <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                  </select></div>
                )}
              </div>
            </div>
          </div>

          {/* PRODUTO NA TROCA */}
          <div className="border border-[#D2D2D7] rounded-xl p-4 space-y-4">
            <p className="text-sm font-bold text-[#1D1D1F]">Cliente deu produto na troca?</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className={labelCls}>Valor da troca (R$)</p><input type="number" value={form.produto_na_troca} onChange={(e) => set("produto_na_troca", e.target.value)} placeholder="0" className={inputCls} /></div>
              {temTroca && (
                <>
                  <div><p className={labelCls}>Produto (modelo)</p><input value={form.troca_produto} onChange={(e) => set("troca_produto", e.target.value)} placeholder="Ex: iPhone 15 Pro Max 256GB" className={inputCls} /></div>
                  <div><p className={labelCls}>Cor</p><input value={form.troca_cor} onChange={(e) => set("troca_cor", e.target.value)} className={inputCls} /></div>
                  <div><p className={labelCls}>Bateria %</p><input type="number" value={form.troca_bateria} onChange={(e) => set("troca_bateria", e.target.value)} placeholder="92" className={inputCls} /></div>
                  <div className="col-span-2"><p className={labelCls}>Obs do seminovo</p><input value={form.troca_obs} onChange={(e) => set("troca_obs", e.target.value)} placeholder="Grade, caixa, detalhes..." className={inputCls} /></div>
                </>
              )}
            </div>
            {temTroca && <p className="text-xs text-[#2ECC71]">O produto na troca sera adicionado ao estoque como SEMINOVO automaticamente</p>}
          </div>

          {/* Preview */}
          <div className="p-4 bg-gradient-to-r from-[#1E1208] to-[#2A1A0F] rounded-xl text-white">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
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
              {temTroca && <div>
                <p className="text-xs text-white/60">Troca</p>
                <p className="text-lg font-bold text-[#2ECC71]">{fmt(valorTroca)}</p>
              </div>}
            </div>
            {(temTroca || temEntradaPix) && (
              <div className="mt-3 pt-3 border-t border-white/20 text-xs text-white/70 text-center">
                {temTroca && <span>Troca: {fmt(valorTroca)} </span>}
                {temEntradaPix && <span>+ PIX: {fmt(entradaPix)} ({form.banco_pix}) </span>}
                {temCartao && valorCartao > 0 && <span>+ {form.forma === "LINK" ? "Link MP" : `Cartao ${form.banco}`}: {fmt(valorCartao)}</span>}
              </div>
            )}
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
                    {["Data", "Cliente", "Origem", "Tipo", "Produto", "Custo", "Vendido", "Lucro", "Margem", "Pagamento", ""].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-[#86868B] font-medium text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendas.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-8 text-center text-[#86868B]">Nenhuma venda registrada</td></tr>
                  ) : vendas.map((v) => {
                    const temTrocaV = v.produto_na_troca && v.produto_na_troca !== "-" && v.produto_na_troca !== "null";
                    const temEntrada = v.entrada_pix && v.entrada_pix > 0;
                    const valorTrocaV = temTrocaV ? parseFloat(String(v.produto_na_troca)) || 0 : 0;

                    // Montar descrição do pagamento
                    const pagParts: string[] = [];
                    if (valorTrocaV > 0) pagParts.push(`Troca: ${fmt(valorTrocaV)}`);
                    if (temEntrada) pagParts.push(`PIX ${v.banco_pix || "ITAU"}: ${fmt(v.entrada_pix)}`);
                    if (v.forma === "CARTAO" && v.qnt_parcelas) {
                      pagParts.push(`${v.banco} ${v.qnt_parcelas}x${v.bandeira ? ` ${v.bandeira}` : ""}`);
                    } else if (v.banco === "MERCADO_PAGO" && !temEntrada && !valorTrocaV) {
                      pagParts.push(`Link MP${v.qnt_parcelas ? ` ${v.qnt_parcelas}x` : ""}`);
                    } else if (!temEntrada && !valorTrocaV) {
                      pagParts.push(`${v.forma} ${v.banco}`);
                    }

                    return (
                      <tr key={v.id} className="border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors">
                        <td className="px-3 py-2.5 text-xs text-[#86868B] whitespace-nowrap">{v.data}</td>
                        <td className="px-3 py-2.5 font-medium whitespace-nowrap text-sm">{v.cliente}</td>
                        <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F5F5F7] text-[#86868B]">{v.origem}</span></td>
                        <td className="px-3 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.tipo === "UPGRADE" ? "bg-purple-100 text-purple-700" : v.tipo === "ATACADO" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{v.tipo}</span></td>
                        <td className="px-3 py-2.5 whitespace-nowrap max-w-[180px] truncate text-xs">{v.produto}</td>
                        <td className="px-3 py-2.5 text-[#86868B] text-xs">{fmt(v.custo)}</td>
                        <td className="px-3 py-2.5 font-medium text-xs">{fmt(v.preco_vendido)}</td>
                        <td className={`px-3 py-2.5 font-bold text-xs ${v.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(v.lucro)}</td>
                        <td className="px-3 py-2.5 text-[#86868B] text-xs">{Number(v.margem_pct).toFixed(1)}%</td>
                        <td className="px-3 py-2.5 text-xs max-w-[250px]">
                          <div className="space-y-0.5">
                            {pagParts.map((p, i) => (
                              <span key={i} className="block text-[11px] text-[#1D1D1F]">{p}</span>
                            ))}
                          </div>
                          <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.recebimento === "D+0" ? "bg-green-100 text-green-700" : v.recebimento === "D+1" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>{v.recebimento}</span>
                        </td>
                        <td className="px-3 py-2.5">
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
