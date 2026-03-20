"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularBruto, calcularRecebimento } from "@/lib/taxas";
import type { Venda } from "@/lib/admin-types";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const VENDAS_PASSWORD = "tigrao$vendas";

export default function VendasPage() {
  const { password, user } = useAdmin();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"nova" | "andamento" | "finalizadas">("nova");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [vendasUnlocked, setVendasUnlocked] = useState(false);
  const [vendasPw, setVendasPw] = useState("");
  const [vendasPwError, setVendasPwError] = useState(false);

  // Admin não precisa de senha extra
  const isAdmin = user?.role === "admin";

  const [msg, setMsg] = useState("");

  // Form state — ALL hooks must be before any conditional return
  const [form, setForm] = useState({
    data: new Date().toISOString().split("T")[0],
    cliente: "", cpf: "", email: "", origem: "ANUNCIO", tipo: "VENDA", produto: "", fornecedor: "",
    custo: "", preco_vendido: "", banco: "ITAU", forma: "PIX",
    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
    entrada_pix: "", banco_pix: "ITAU", banco_2nd: "", banco_alt: "",
    parc_alt: "", band_alt: "", sinal_antecipado: "", banco_sinal: "",
    // Dados do aparelho na troca (para criar seminovo)
    troca_produto: "", troca_cor: "", troca_bateria: "", troca_obs: "",
  });

  // Estoque: catálogo de produtos
  interface EstoqueItem { id: string; produto: string; categoria: string; qnt: number; custo_unitario: number; cor: string | null; fornecedor: string | null; status: string }
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [catSel, setCatSel] = useState("");
  const [estoqueId, setEstoqueId] = useState("");
  const [produtoManual, setProdutoManual] = useState(false);

  const fetchEstoque = useCallback(async () => {
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password } });
      if (res.ok) {
        const json = await res.json();
        setEstoque((json.data ?? []).filter((p: EstoqueItem) => p.qnt > 0 && p.status === "EM ESTOQUE"));
      }
    } catch { /* ignore */ }
  }, [password]);

  useEffect(() => { if (password) fetchEstoque(); }, [password, fetchEstoque]);

  const categorias = [...new Set(estoque.map(p => p.categoria))].sort();
  const produtosFiltrados = catSel ? estoque.filter(p => p.categoria === catSel) : [];

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
    if (!form.cliente || !form.produto) {
      setMsg("Preencha cliente e produto");
      return;
    }
    setSaving(true);
    setMsg("");

    // Se não tem preço, salvar como AGUARDANDO (venda parcial — preencher depois)
    const isPartial = preco === 0;

    // Determinar banco principal
    let banco = form.banco;
    if (form.forma === "LINK") banco = "MERCADO_PAGO";
    if (form.forma === "PIX") banco = form.banco_pix || "ITAU";
    if (form.forma === "DINHEIRO") banco = "ESPECIE";

    const payload: Record<string, unknown> = {
      data: form.data,
      cliente: form.cliente,
      cpf: form.cpf || null,
      email: form.email || null,
      origem: form.tipo === "ATACADO" ? "ATACADO" : form.origem,
      tipo: temTroca ? "UPGRADE" : form.tipo,
      produto: form.produto,
      fornecedor: form.fornecedor || null,
      custo,
      preco_vendido: preco,
      lucro: preco > 0 ? preco - custo : 0,
      margem_pct: preco > 0 ? Math.round(((preco - custo) / preco) * 1000) / 10 : 0,
      banco: isPartial ? null : banco,
      forma: isPartial ? null : (form.forma === "LINK" ? "CARTAO" : form.forma),
      recebimento: isPartial ? null : (form.forma === "PIX" || form.forma === "DINHEIRO" ? "D+0" : form.forma === "LINK" ? "D+0" : "D+1"),
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
      status_pagamento: isPartial ? "AGUARDANDO" : "FINALIZADO",
    };

    // Se veio do estoque, enviar o ID para descontar
    if (estoqueId) {
      payload._estoque_id = estoqueId;
    }

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
      setForm((f) => ({ ...f, cliente: "", cpf: "", email: "", produto: "", fornecedor: "", custo: "", preco_vendido: "", qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "", entrada_pix: "", banco_pix: "", sinal_antecipado: "", banco_sinal: "", troca_produto: "", troca_cor: "", troca_bateria: "", troca_obs: "" }));
      setCatSel("");
      setEstoqueId("");
      fetchVendas();
      fetchEstoque();
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
        {([
          { key: "nova", label: "Nova Venda", count: 0 },
          { key: "andamento", label: "Em Andamento", count: vendas.filter(v => v.status_pagamento === "AGUARDANDO").length },
          { key: "finalizadas", label: "Finalizadas", count: vendas.filter(v => v.status_pagamento === "FINALIZADO" || !v.status_pagamento).length },
        ] as const).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t.key ? t.key === "andamento" ? "bg-yellow-500 text-white" : t.key === "finalizadas" ? "bg-green-600 text-white" : "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
            {t.label}{t.count > 0 ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {tab === "nova" ? (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-[#1D1D1F]">Registrar Nova Venda</h2>

          {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

          {/* Row 1: Tipo + Data */}
          <div className="grid grid-cols-2 gap-4">
            <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => { set("tipo", e.target.value); if (e.target.value === "ATACADO") { set("origem", "ATACADO"); } else if (form.origem === "ATACADO") { set("origem", "ANUNCIO"); } }} className={selectCls}>
              <option>VENDA</option><option>UPGRADE</option><option>ATACADO</option>
            </select></div>
            <div><p className={labelCls}>Data</p><input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} className={inputCls} /></div>
          </div>

          {/* Campos condicionais por tipo */}
          {form.tipo === "ATACADO" ? (
            <div className="grid grid-cols-1 gap-4">
              <div><p className={labelCls}>Nome da Loja</p><input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Ex: Mega Cell, TM Cel..." className={inputCls} /></div>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><p className={labelCls}>Cliente</p><input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Nome completo" className={inputCls} /></div>
              <div><p className={labelCls}>CPF</p><input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" className={inputCls} /></div>
              <div><p className={labelCls}>Email</p><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" className={inputCls} /></div>
              <div><p className={labelCls}>Origem</p><select value={form.origem} onChange={(e) => set("origem", e.target.value)} className={selectCls}>
                <option>ANUNCIO</option><option>RECOMPRA</option><option>INDICACAO</option>
              </select></div>
            </div>
          )}

          {/* Row 2: Produto */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <p className="text-sm font-bold text-[#1D1D1F]">Produto</p>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={produtoManual} onChange={(e) => { setProdutoManual(e.target.checked); if (e.target.checked) { setEstoqueId(""); setCatSel(""); } }} className="accent-[#E8740E]" />
                <span className="text-xs text-[#86868B]">Digitar manualmente</span>
              </label>
            </div>

            {produtoManual ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="col-span-2"><p className={labelCls}>Produto</p><input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: iPhone 16 Pro Max 256GB" className={inputCls} /></div>
                <div><p className={labelCls}>Fornecedor</p><input value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls} /></div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className={labelCls}>Categoria</p>
                    <select value={catSel} onChange={(e) => { setCatSel(e.target.value); setEstoqueId(""); set("produto", ""); set("custo", ""); set("fornecedor", ""); }} className={selectCls}>
                      <option value="">Selecionar...</option>
                      {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><p className={labelCls}>Fornecedor</p><input value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls} /></div>
                </div>

                {/* Produtos agrupados por modelo com cores como botões */}
                {catSel && (() => {
                  // Agrupar por nome do produto (sem cor)
                  const grupos: Record<string, EstoqueItem[]> = {};
                  for (const p of produtosFiltrados) {
                    const key = p.produto;
                    if (!grupos[key]) grupos[key] = [];
                    grupos[key].push(p);
                  }
                  const grupoKeys = Object.keys(grupos).sort();

                  if (grupoKeys.length === 0) return (
                    <div className="p-4 bg-[#F5F5F7] rounded-xl text-center text-sm text-[#86868B]">Nenhum produto disponivel nesta categoria</div>
                  );

                  return (
                    <div className="border border-[#D2D2D7] rounded-xl overflow-hidden max-h-[400px] overflow-y-auto">
                      {grupoKeys.map((modelo) => {
                        const items = grupos[modelo];
                        const custo = items[0].custo_unitario;
                        const totalQnt = items.reduce((s, p) => s + p.qnt, 0);
                        return (
                          <div key={modelo} className="border-b border-[#F5F5F7] last:border-0">
                            <div className="px-4 py-2.5 bg-[#F5F5F7] flex items-center justify-between">
                              <span className="text-sm font-semibold text-[#1D1D1F]">{modelo}</span>
                              <span className="text-[10px] text-[#86868B]">{totalQnt} un. | {fmt(custo)}</span>
                            </div>
                            <div className="px-4 py-2 flex flex-wrap gap-2">
                              {items.map((p) => {
                                const isSelected = estoqueId === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    onClick={() => {
                                      setEstoqueId(p.id);
                                      const nome = p.cor ? `${p.produto} ${p.cor}` : p.produto;
                                      set("produto", nome);
                                      set("custo", String(p.custo_unitario));
                                      if (p.fornecedor) set("fornecedor", p.fornecedor);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                      isSelected
                                        ? "bg-[#E8740E] text-white shadow-sm"
                                        : "bg-white border border-[#D2D2D7] text-[#1D1D1F] hover:border-[#E8740E] hover:bg-[#FFF8F0]"
                                    }`}
                                  >
                                    {p.cor || "Sem cor"} <span className="text-[10px] opacity-70">({p.qnt})</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Produto selecionado */}
                {estoqueId && (
                  <div className="px-4 py-2.5 bg-gradient-to-r from-[#1E1208] to-[#2A1A0F] rounded-xl flex items-center justify-between">
                    <span className="text-white text-sm font-medium">{form.produto}</span>
                    <span className="text-[#F5A623] text-sm font-bold">{fmt(parseFloat(form.custo) || 0)}</span>
                  </div>
                )}
              </div>
            )}
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
        /* Vendas Em Andamento / Finalizadas */
        (() => {
          const filtered = tab === "andamento"
            ? vendas.filter(v => v.status_pagamento === "AGUARDANDO")
            : vendas.filter(v => v.status_pagamento === "FINALIZADO" || !v.status_pagamento);
          const titulo = tab === "andamento" ? "Vendas em Andamento" : "Vendas Finalizadas";

          return (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between">
                <h2 className="font-bold text-[#1D1D1F]">{titulo}</h2>
                <span className="text-xs text-[#86868B]">{filtered.length} vendas</span>
              </div>
              {loading ? (
                <div className="p-8 text-center text-[#86868B]">Carregando...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#D2D2D7] bg-[#F5F5F7]">
                        {["Data", "Cliente", "Origem", "Tipo", "Produto", "Custo", "Vendido", "Lucro", "Margem", "Pagamento", "Status", ""].map((h) => (
                          <th key={h} className="px-3 py-3 text-left text-[#86868B] font-medium text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr><td colSpan={12} className="px-4 py-8 text-center text-[#86868B]">Nenhuma venda {tab === "andamento" ? "em andamento" : "finalizada"}</td></tr>
                      ) : filtered.map((v) => {
                        const temTrocaV = v.produto_na_troca && v.produto_na_troca !== "-" && v.produto_na_troca !== "null";
                        const temEntrada = v.entrada_pix && v.entrada_pix > 0;
                        const valorTrocaV = temTrocaV ? parseFloat(String(v.produto_na_troca)) || 0 : 0;
                        const isExpanded = expandedId === v.id;

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
                          <React.Fragment key={v.id}>
                            <tr
                              className={`border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors cursor-pointer ${isExpanded ? "bg-[#F5F5F7]" : ""}`}
                              onClick={() => setExpandedId(isExpanded ? null : v.id)}
                            >
                              <td className="px-3 py-2.5 text-xs text-[#86868B] whitespace-nowrap">{v.data}</td>
                              <td className="px-3 py-2.5 font-medium whitespace-nowrap text-sm">{v.cliente}</td>
                              <td className="px-3 py-2.5"><span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#F5F5F7] text-[#86868B]">{v.origem}</span></td>
                              <td className="px-3 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.tipo === "UPGRADE" ? "bg-purple-100 text-purple-700" : v.tipo === "ATACADO" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{v.tipo}</span></td>
                              <td className="px-3 py-2.5 whitespace-nowrap max-w-[180px] truncate text-xs">{v.produto}</td>
                              <td className="px-3 py-2.5 text-[#86868B] text-xs">{fmt(v.custo)}</td>
                              <td className="px-3 py-2.5 font-medium text-xs">{fmt(v.preco_vendido)}</td>
                              <td className={`px-3 py-2.5 font-bold text-xs ${v.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(v.lucro)}</td>
                              <td className="px-3 py-2.5 text-[#86868B] text-xs">{Number(v.margem_pct || 0).toFixed(1)}%</td>
                              <td className="px-3 py-2.5 text-xs max-w-[250px]">
                                <div className="space-y-0.5">
                                  {pagParts.map((p, i) => (
                                    <span key={i} className="block text-[11px] text-[#1D1D1F]">{p}</span>
                                  ))}
                                </div>
                                <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.recebimento === "D+0" ? "bg-green-100 text-green-700" : v.recebimento === "D+1" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>{v.recebimento}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${
                                  v.status_pagamento === "AGUARDANDO" ? "bg-yellow-100 text-yellow-700" :
                                  v.status_pagamento === "CANCELADO" ? "bg-red-100 text-red-600" :
                                  "bg-green-100 text-green-700"
                                }`}>
                                  {v.status_pagamento === "AGUARDANDO" ? "⏳ Pendente" : v.status_pagamento === "CANCELADO" ? "❌ Cancelado" : "✅ Finalizado"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-[#86868B]">{isExpanded ? "▲" : "▼"}</td>
                            </tr>

                            {/* Linha expandida */}
                            {isExpanded && (
                              <tr className="bg-[#FAFAFA]">
                                <td colSpan={12} className="px-5 py-4">
                                  {/* MODO EDIÇÃO */}
                                  {editingId === v.id ? (() => {
                                    const ef = editForm;
                                    const setEf = (k: string, val: string) => setEditForm(prev => ({ ...prev, [k]: val }));
                                    return (
                                      <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                          <h4 className="text-sm font-bold text-[#1D1D1F]">Editando venda</h4>
                                          <div className="flex gap-2">
                                            <button
                                              disabled={editSaving}
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                setEditSaving(true);
                                                const updates: Record<string, unknown> = { id: v.id };
                                                if (ef.banco !== v.banco) updates.banco = ef.banco;
                                                if (ef.forma !== v.forma) updates.forma = ef.forma;
                                                if (ef.recebimento !== v.recebimento) updates.recebimento = ef.recebimento;
                                                if (ef.preco_vendido !== String(v.preco_vendido)) {
                                                  updates.preco_vendido = parseFloat(ef.preco_vendido) || 0;
                                                  updates.lucro = (parseFloat(ef.preco_vendido) || 0) - (parseFloat(ef.custo) || 0);
                                                  const pv = parseFloat(ef.preco_vendido) || 0;
                                                  const c = parseFloat(ef.custo) || 0;
                                                  updates.margem_pct = pv > 0 ? Math.round(((pv - c) / pv) * 1000) / 10 : 0;
                                                }
                                                if (ef.custo !== String(v.custo)) {
                                                  updates.custo = parseFloat(ef.custo) || 0;
                                                  updates.lucro = (parseFloat(ef.preco_vendido) || 0) - (parseFloat(ef.custo) || 0);
                                                  const pv = parseFloat(ef.preco_vendido) || 0;
                                                  const c = parseFloat(ef.custo) || 0;
                                                  updates.margem_pct = pv > 0 ? Math.round(((pv - c) / pv) * 1000) / 10 : 0;
                                                }
                                                if (ef.qnt_parcelas !== String(v.qnt_parcelas || "")) updates.qnt_parcelas = parseInt(ef.qnt_parcelas) || null;
                                                if (ef.bandeira !== (v.bandeira || "")) updates.bandeira = ef.bandeira || null;
                                                if (ef.banco_pix !== (v.banco_pix || "")) updates.banco_pix = ef.banco_pix || null;
                                                if (ef.entrada_pix !== String(v.entrada_pix || 0)) updates.entrada_pix = parseFloat(ef.entrada_pix) || 0;
                                                if (ef.cliente !== v.cliente) updates.cliente = ef.cliente;
                                                if (ef.produto !== v.produto) updates.produto = ef.produto;

                                                if (Object.keys(updates).length <= 1) {
                                                  setEditingId(null);
                                                  setEditSaving(false);
                                                  return;
                                                }

                                                const res = await fetch("/api/vendas", {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password },
                                                  body: JSON.stringify(updates),
                                                });
                                                if (res.ok) {
                                                  const newLucro = (parseFloat(ef.preco_vendido) || 0) - (parseFloat(ef.custo) || 0);
                                                  const newPv = parseFloat(ef.preco_vendido) || 0;
                                                  const newMargem = newPv > 0 ? Math.round(((newPv - (parseFloat(ef.custo) || 0)) / newPv) * 1000) / 10 : 0;
                                                  setVendas(prev => prev.map(r => r.id === v.id ? {
                                                    ...r,
                                                    banco: ef.banco as Venda["banco"],
                                                    forma: ef.forma as Venda["forma"],
                                                    recebimento: ef.recebimento as Venda["recebimento"],
                                                    preco_vendido: parseFloat(ef.preco_vendido) || 0,
                                                    custo: parseFloat(ef.custo) || 0,
                                                    lucro: newLucro,
                                                    margem_pct: newMargem,
                                                    qnt_parcelas: parseInt(ef.qnt_parcelas) || null,
                                                    bandeira: (ef.bandeira || null) as Venda["bandeira"],
                                                    banco_pix: ef.banco_pix || null,
                                                    entrada_pix: parseFloat(ef.entrada_pix) || 0,
                                                    cliente: ef.cliente,
                                                    produto: ef.produto,
                                                  } : r));
                                                  setMsg("Venda atualizada!");
                                                } else {
                                                  setMsg("Erro ao atualizar venda");
                                                }
                                                setEditingId(null);
                                                setEditSaving(false);
                                              }}
                                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
                                            >
                                              {editSaving ? "Salvando..." : "Salvar"}
                                            </button>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setEditingId(null); }}
                                              className="px-3 py-1.5 rounded-lg text-xs text-[#86868B] border border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors"
                                            >
                                              Cancelar
                                            </button>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Cliente</span>
                                            <input value={ef.cliente} onChange={e => setEf("cliente", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white" />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Produto</span>
                                            <input value={ef.produto} onChange={e => setEf("produto", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white" />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Custo</span>
                                            <input type="number" value={ef.custo} onChange={e => setEf("custo", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white" />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Preço Vendido</span>
                                            <input type="number" value={ef.preco_vendido} onChange={e => setEf("preco_vendido", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white" />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Banco</span>
                                            <select value={ef.banco} onChange={e => setEf("banco", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white">
                                              <option value="ITAU">ITAU</option>
                                              <option value="INFINITE">INFINITE</option>
                                              <option value="MERCADO_PAGO">MERCADO PAGO</option>
                                              <option value="ESPECIE">ESPECIE</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Forma</span>
                                            <select value={ef.forma} onChange={e => setEf("forma", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white">
                                              <option value="PIX">PIX</option>
                                              <option value="CARTAO">CARTAO</option>
                                              <option value="DINHEIRO">DINHEIRO</option>
                                              <option value="FIADO">FIADO</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Recebimento</span>
                                            <select value={ef.recebimento} onChange={e => setEf("recebimento", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white">
                                              <option value="D+0">D+0</option>
                                              <option value="D+1">D+1</option>
                                              <option value="FIADO">FIADO</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Parcelas</span>
                                            <input type="number" value={ef.qnt_parcelas} onChange={e => setEf("qnt_parcelas", e.target.value)} placeholder="—" className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white" />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Bandeira</span>
                                            <select value={ef.bandeira} onChange={e => setEf("bandeira", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white">
                                              <option value="">—</option>
                                              <option value="VISA">VISA</option>
                                              <option value="MASTERCARD">MASTERCARD</option>
                                              <option value="ELO">ELO</option>
                                              <option value="AMEX">AMEX</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Entrada PIX</span>
                                            <input type="number" value={ef.entrada_pix} onChange={e => setEf("entrada_pix", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white" />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Banco PIX</span>
                                            <select value={ef.banco_pix} onChange={e => setEf("banco_pix", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white">
                                              <option value="">—</option>
                                              <option value="ITAU">ITAU</option>
                                              <option value="INFINITE">INFINITE</option>
                                              <option value="MERCADO_PAGO">MERCADO PAGO</option>
                                            </select>
                                          </label>
                                        </div>
                                      </div>
                                    );
                                  })() : (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Detalhes da venda */}
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-bold text-[#86868B] uppercase">Detalhes</h4>
                                      <div className="text-xs space-y-1">
                                        <p><strong>Produto:</strong> {v.produto}</p>
                                        <p><strong>Fornecedor:</strong> {v.fornecedor || "—"}</p>
                                        <p><strong>Local:</strong> {v.local || "—"}</p>
                                        {(v as unknown as Record<string, string>).notas && <p><strong>Notas:</strong> {(v as unknown as Record<string, string>).notas}</p>}
                                      </div>
                                    </div>

                                    {/* Ações de status */}
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-bold text-[#86868B] uppercase">Status</h4>
                                      <div className="flex gap-2 flex-wrap">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditForm({
                                              cliente: v.cliente,
                                              produto: v.produto,
                                              custo: String(v.custo),
                                              preco_vendido: String(v.preco_vendido),
                                              banco: v.banco,
                                              forma: v.forma,
                                              recebimento: v.recebimento,
                                              qnt_parcelas: String(v.qnt_parcelas || ""),
                                              bandeira: v.bandeira || "",
                                              entrada_pix: String(v.entrada_pix || 0),
                                              banco_pix: v.banco_pix || "",
                                            });
                                            setEditingId(v.id);
                                          }}
                                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors"
                                        >
                                          ✏️ Editar
                                        </button>
                                        {v.status_pagamento === "AGUARDANDO" && (
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              await fetch("/api/vendas", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json", "x-admin-password": password },
                                                body: JSON.stringify({ id: v.id, status_pagamento: "FINALIZADO" }),
                                              });
                                              setVendas(prev => prev.map(r => r.id === v.id ? { ...r, status_pagamento: "FINALIZADO" } : r));
                                              setMsg("Venda finalizada!");
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors"
                                          >
                                            ✅ Finalizar Venda
                                          </button>
                                        )}
                                        {v.status_pagamento !== "CANCELADO" && (
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              if (!confirm(`Cancelar venda de ${v.cliente}?\n\nIsso vai:\n- Marcar como cancelada\n- Remover o seminovo do estoque (se houver troca)`)) return;
                                              await fetch("/api/vendas", {
                                                method: "DELETE",
                                                headers: { "Content-Type": "application/json", "x-admin-password": password },
                                                body: JSON.stringify({ id: v.id }),
                                              });
                                              setVendas(prev => prev.filter(r => r.id !== v.id));
                                              setMsg("Venda cancelada!");
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                                          >
                                            ❌ Cancelar Venda
                                          </button>
                                        )}
                                        {v.status_pagamento === "FINALIZADO" && (
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              await fetch("/api/vendas", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json", "x-admin-password": password },
                                                body: JSON.stringify({ id: v.id, status_pagamento: "AGUARDANDO" }),
                                              });
                                              setVendas(prev => prev.map(r => r.id === v.id ? { ...r, status_pagamento: "AGUARDANDO" } : r));
                                              setMsg("Venda movida para Em Andamento");
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs text-yellow-600 border border-yellow-300 hover:bg-yellow-50 transition-colors"
                                          >
                                            ⏳ Mover para Andamento
                                          </button>
                                        )}
                                      </div>
                                    </div>

                                    {/* Comprovante */}
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-bold text-[#86868B] uppercase">Comprovante</h4>
                                      {v.comprovante_url ? (
                                        <div>
                                          <a href={v.comprovante_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">📎 Ver comprovante</a>
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              await fetch("/api/vendas", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json", "x-admin-password": password },
                                                body: JSON.stringify({ id: v.id, comprovante_url: null }),
                                              });
                                              setVendas(prev => prev.map(r => r.id === v.id ? { ...r, comprovante_url: "" } : r));
                                            }}
                                            className="ml-2 text-[10px] text-red-400 hover:text-red-600"
                                          >remover</button>
                                        </div>
                                      ) : (
                                        <div className="space-y-2">
                                          <input
                                            type="file"
                                            accept="image/*"
                                            onClick={(e) => e.stopPropagation()}
                                            onChange={async (e) => {
                                              e.stopPropagation();
                                              const file = e.target.files?.[0];
                                              if (!file) return;
                                              setUploadingId(v.id);
                                              const formData = new FormData();
                                              formData.append("file", file);
                                              formData.append("venda_id", v.id);
                                              try {
                                                const res = await fetch("/api/vendas/comprovante", {
                                                  method: "POST",
                                                  headers: { "x-admin-password": password },
                                                  body: formData,
                                                });
                                                const json = await res.json();
                                                if (json.url) {
                                                  setVendas(prev => prev.map(r => r.id === v.id ? { ...r, comprovante_url: json.url } : r));
                                                  setMsg("Comprovante salvo!");
                                                } else {
                                                  setMsg("Erro ao salvar comprovante");
                                                }
                                              } catch {
                                                setMsg("Erro ao enviar arquivo");
                                              }
                                              setUploadingId(null);
                                            }}
                                            className="text-xs"
                                          />
                                          {uploadingId === v.id && <p className="text-[10px] text-[#86868B]">Enviando...</p>}
                                          <p className="text-[10px] text-[#86868B]">Envie PNG/JPG do comprovante</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>)}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}
