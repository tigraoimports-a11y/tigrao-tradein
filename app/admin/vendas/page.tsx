"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularBruto, calcularLiquido, calcularRecebimento } from "@/lib/taxas";
import { useTabParam } from "@/lib/useTabParam";
import type { Venda } from "@/lib/admin-types";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const VENDAS_PASSWORD = "tigrao$vendas";

export default function VendasPage() {
  const { password, user } = useAdmin();
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const VENDAS_TABS = ["nova", "andamento", "hoje", "finalizadas"] as const;
  const [tab, setTab] = useTabParam<"nova" | "andamento" | "hoje" | "finalizadas">("nova", VENDAS_TABS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [vendasUnlocked, setVendasUnlocked] = useState(false);
  const [vendasPw, setVendasPw] = useState("");
  const [vendasPwError, setVendasPwError] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [duplicadoInfo, setDuplicadoInfo] = useState<{ data: string; cliente: string } | null>(null);
  const [showClienteSuggestions, setShowClienteSuggestions] = useState(false);

  // Filtros de data para histórico
  const now = new Date();
  const [filtroAno, setFiltroAno] = useState(String(now.getFullYear()));
  const [filtroMes, setFiltroMes] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [filtroDia, setFiltroDia] = useState("");
  const [ordenar, setOrdenar] = useState<"recente" | "antigo" | "origem" | "cliente">("recente");

  // Admin não precisa de senha extra
  const isAdmin = user?.role === "admin";

  const [msg, setMsg] = useState("");
  const [lastClienteData, setLastClienteData] = useState<{ cliente: string; cpf: string; cnpj: string; email: string; endereco: string; pessoa: string; origem: string; tipo: string } | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Form state — ALL hooks must be before any conditional return
  const [form, setForm] = useState({
    data: new Date().toISOString().split("T")[0],
    cliente: "", cpf: "", cnpj: "", email: "", endereco: "", pessoa: "PF" as "PF" | "PJ", origem: "ANUNCIO", tipo: "VENDA", produto: "", fornecedor: "",
    custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
    entrada_pix: "", banco_pix: "ITAU", entrada_especie: "", banco_2nd: "", banco_alt: "",
    parc_alt: "", band_alt: "", sinal_antecipado: "", banco_sinal: "",
    // Dados do aparelho na troca (para criar seminovo)
    troca_produto: "", troca_cor: "", troca_bateria: "", troca_obs: "",
  });

  // Estoque: catálogo de produtos
  interface EstoqueItem { id: string; produto: string; categoria: string; tipo: string; qnt: number; custo_unitario: number; cor: string | null; fornecedor: string | null; status: string }
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [catSel, setCatSel] = useState("");
  const [estoqueId, setEstoqueId] = useState("");
  const [produtoManual, setProdutoManual] = useState(false);

  // Fornecedores
  interface Fornecedor { id: string; nome: string }
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const fetchFornecedores = useCallback(async () => {
    try {
      const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password } });
      if (res.ok) {
        const json = await res.json();
        setFornecedores(json.data ?? []);
      }
    } catch { /* ignore */ }
  }, [password]);

  const fetchEstoque = useCallback(async () => {
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password } });
      if (res.ok) {
        const json = await res.json();
        setEstoque((json.data ?? []).filter((p: EstoqueItem) => p.qnt > 0 && p.status === "EM ESTOQUE"));
      }
    } catch { /* ignore */ }
  }, [password]);

  useEffect(() => { if (password) { fetchEstoque(); fetchFornecedores(); } }, [password, fetchEstoque, fetchFornecedores]);

  // Gerar categorias separadas por tipo (Lacrado vs Seminovo)
  const categorias = (() => {
    const cats: { key: string; label: string }[] = [];
    const catSet = new Set<string>();
    for (const p of estoque) {
      const tipo = (p.tipo ?? "NOVO") === "SEMINOVO" ? "SEMINOVO" : "NOVO";
      const key = `${p.categoria}__${tipo}`;
      if (!catSet.has(key)) {
        catSet.add(key);
        const catLabel: Record<string, string> = { IPHONES: "iPhones", IPADS: "iPads", MACBOOK: "MacBooks", APPLE_WATCH: "Apple Watch", AIRPODS: "AirPods", ACESSORIOS: "Acessórios", OUTROS: "Outros" };
        const tipoLabel = tipo === "SEMINOVO" ? "Seminovos" : "Lacrados";
        cats.push({ key, label: `${catLabel[p.categoria] || p.categoria} — ${tipoLabel}` });
      }
    }
    // Ordenar: Lacrados primeiro, depois Seminovos, dentro de cada tipo por nome
    return cats.sort((a, b) => {
      const aS = a.key.includes("SEMINOVO") ? 1 : 0;
      const bS = b.key.includes("SEMINOVO") ? 1 : 0;
      if (aS !== bS) return aS - bS;
      return a.label.localeCompare(b.label);
    });
  })();

  const produtosFiltrados = catSel ? (() => {
    const [cat, tipo] = catSel.split("__");
    return estoque.filter(p => p.categoria === cat && ((p.tipo ?? "NOVO") === "SEMINOVO" ? "SEMINOVO" : "NOVO") === tipo);
  })() : [];

  const fetchVendas = useCallback(async () => {
    setLoading(true);
    try {
      // Construir filtro de data
      const from = filtroDia
        ? `${filtroAno}-${filtroMes}-${filtroDia.padStart(2, "0")}`
        : `${filtroAno}-${filtroMes}-01`;
      const to = filtroDia
        ? `${filtroAno}-${filtroMes}-${filtroDia.padStart(2, "0")}`
        : `${filtroAno}-${filtroMes}-31`;
      const params = new URLSearchParams({ from, to });
      const res = await fetch(`/api/vendas?${params}`, { headers: { "x-admin-password": password } });
      if (res.ok) {
        const json = await res.json();
        setVendas(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, filtroAno, filtroMes, filtroDia]);

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
  const entradaEspecie = parseFloat(form.entrada_especie) || 0;
  const valorCartao = preco - valorTroca - entradaPix - entradaEspecie;
  const lucro = preco - custo;
  const margem = preco > 0 ? (lucro / preco) * 100 : 0;
  const parcelas = parseInt(form.qnt_parcelas) || 0;
  const taxa = form.forma === "CARTAO"
    ? getTaxa(form.banco, form.bandeira || null, parcelas, form.forma)
    : form.forma === "LINK" ? getTaxa("MERCADO_PAGO", null, parcelas, "CARTAO") : 0;
  const comprovante = taxa > 0 ? calcularBruto(valorCartao > 0 ? valorCartao : preco, taxa) : preco;
  const recebimento = form.forma ? calcularRecebimento(form.forma === "LINK" ? "CARTAO" : form.forma, parcelas || null) : "—";

  // Helper: recalcular preco_vendido total quando muda qualquer componente do pagamento
  const recalcVendido = (overrides: { pix?: string; especie?: string; troca?: string; comp?: string }) => {
    const compVal = parseFloat(overrides.comp ?? form.valor_comprovante_input) || 0;
    const curTaxa = taxa;
    if (compVal > 0 && curTaxa > 0) {
      const liqCartao = calcularLiquido(compVal, curTaxa);
      const pix = parseFloat(overrides.pix ?? form.entrada_pix) || 0;
      const esp = parseFloat(overrides.especie ?? form.entrada_especie) || 0;
      const trc = parseFloat(overrides.troca ?? form.produto_na_troca) || 0;
      return String(Math.round(liqCartao + pix + esp + trc));
    }
    return undefined;
  };

  // Resumo financeiro
  const temTroca = valorTroca > 0;
  const temEntradaPix = entradaPix > 0;
  const temEntradaEspecie = entradaEspecie > 0;
  const temCartao = form.forma === "CARTAO" || form.forma === "LINK";

  const handleSubmit = async () => {
    if (!form.cliente || !form.produto) {
      setMsg("Preencha cliente e produto");
      return;
    }
    setSaving(true);
    setMsg("");

    // Determinar banco principal
    let banco = form.banco;
    if (form.forma === "LINK") banco = "MERCADO_PAGO";
    if (form.forma === "PIX") banco = form.banco_pix || "ITAU";
    if (form.forma === "ESPECIE") banco = "ESPECIE";
    if (!form.forma) banco = "ITAU"; // default para not-null constraint

    const payload: Record<string, unknown> = {
      data: form.data,
      cliente: form.cliente,
      cpf: form.cpf || null,
      cnpj: form.cnpj || null,
      email: form.email || null,
      endereco: form.endereco || null,
      origem: form.tipo === "ATACADO" ? "ATACADO" : form.origem,
      tipo: temTroca ? "UPGRADE" : form.tipo,
      produto: form.produto,
      fornecedor: form.fornecedor || null,
      custo,
      preco_vendido: preco,
      banco: banco,
      forma: !form.forma ? "PIX" : form.forma === "LINK" ? "CARTAO" : form.forma === "ESPECIE" ? "ESPECIE" : form.forma,
      recebimento: !form.forma ? "D+0" : form.forma === "PIX" || form.forma === "ESPECIE" ? "D+0" : form.forma === "LINK" ? "D+0" : "D+1",
      qnt_parcelas: parcelas || null,
      bandeira: form.bandeira || null,
      valor_comprovante: parseFloat(form.valor_comprovante_input) || comprovante || null,
      local: form.local || null,
      produto_na_troca: temTroca ? String(valorTroca) : null,
      entrada_pix: entradaPix,
      banco_pix: temEntradaPix ? (form.banco_pix || "ITAU") : null,
      entrada_especie: entradaEspecie,
      banco_2nd: form.banco_2nd || null,
      banco_alt: form.banco_alt || null,
      parc_alt: parseInt(form.parc_alt) || null,
      band_alt: form.band_alt || null,
      sinal_antecipado: parseFloat(form.sinal_antecipado) || 0,
      banco_sinal: form.banco_sinal || null,
      status_pagamento: "AGUARDANDO",
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
      setDuplicadoInfo(null);
      // Salvar dados do cliente para "+1 Produto" antes de limpar tudo
      setLastClienteData({ cliente: form.cliente, cpf: form.cpf, cnpj: form.cnpj, email: form.email, endereco: form.endereco, pessoa: form.pessoa, origem: form.origem, tipo: form.tipo });
      // Limpar TODOS os campos
      setForm({
        data: new Date().toISOString().split("T")[0],
        cliente: "", cpf: "", cnpj: "", email: "", endereco: "", pessoa: "PF", origem: "ANUNCIO", tipo: "VENDA", produto: "", fornecedor: "",
        custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
        qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
        entrada_pix: "", banco_pix: "ITAU", entrada_especie: "", banco_2nd: "", banco_alt: "",
        parc_alt: "", band_alt: "", sinal_antecipado: "", banco_sinal: "",
        troca_produto: "", troca_cor: "", troca_bateria: "", troca_obs: "",
      });
      setCatSel("");
      setEstoqueId("");
      setProdutoManual(false);
      fetchVendas();
      fetchEstoque();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  // Parser de texto colado (formulário WhatsApp)
  const parseClienteText = (text: string) => {
    const lines = text.split("\n").map(l => l.trim());
    let nome = "", cpf = "", cnpj = "", email = "", endereco = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();
      // Nome completo / Razão Social
      if (lower.includes("nome completo") || lower.includes("nome:") || lower.includes("razão social") || lower.includes("razao social")) {
        nome = line.replace(/.*(?:nome completo|razão social|razao social|nome)\s*[:：]\s*/i, "").trim();
      }
      // CNPJ
      if (lower.includes("cnpj")) {
        const cnpjMatch = line.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-.\s]?\d{2}/);
        if (cnpjMatch) cnpj = cnpjMatch[0];
      }
      // CPF
      if (lower.includes("cpf")) {
        const cpfMatch = line.match(/\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}/);
        if (cpfMatch) cpf = cpfMatch[0];
      }
      // Email
      if (lower.includes("e-mail") || lower.includes("email")) {
        const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
        if (emailMatch) email = emailMatch[0];
      }
      // Endereço
      if (lower.includes("end.:") || lower.includes("endereço") || lower.includes("endereco") || lower.includes("end:")) {
        endereco = line.replace(/.*(?:end\.|endereço|endereco|end)\s*[:：]\s*/i, "").trim();
        // Pegar próxima linha se existir (endereço pode ter 2 linhas)
        if (i + 1 < lines.length && !lines[i + 1].includes(":") && !lines[i + 1].startsWith("✅") && lines[i + 1].length > 3) {
          endereco += " " + lines[i + 1].trim();
        }
      }
    }
    return { nome, cpf, cnpj, email, endereco };
  };

  const handlePasteConfirm = () => {
    const { nome, cpf, cnpj, email, endereco } = parseClienteText(pasteText);
    if (nome) set("cliente", nome);
    if (cpf) set("cpf", cpf);
    if (cnpj) { set("cnpj", cnpj); set("pessoa", "PJ"); }
    if (email) set("email", email);
    if (endereco) set("endereco", endereco);
    setShowPasteModal(false);
    setPasteText("");
    const tipo = cnpj ? "PJ" : "PF";
    setMsg(nome ? `Dados ${tipo} preenchidos: ${nome}` : "Nenhum dado encontrado no texto");
  };

  // Exportar mês para Excel
  const handleExportar = async () => {
    setExportando(true);
    try {
      const mes = `${filtroAno}-${filtroMes}`;
      const res = await fetch(`/api/admin/exportar?mes=${mes}`, {
        headers: { "x-admin-password": password },
      });
      if (!res.ok) {
        const json = await res.json();
        alert(`Erro: ${json.error || "Falha ao exportar"}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tigrao-${filtroAno}${filtroMes}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Erro ao exportar: ${err}`);
    } finally {
      setExportando(false);
    }
  };

  // ── Duplicar Venda ──
  const handleDuplicar = (v: Venda) => {
    setForm({
      data: new Date().toISOString().split("T")[0], // hoje
      cliente: v.cliente,
      cpf: "",
      cnpj: "",
      email: "",
      endereco: "",
      pessoa: "PF",
      origem: v.origem || "ANUNCIO",
      tipo: v.tipo || "VENDA",
      produto: v.produto,
      fornecedor: v.fornecedor || "",
      custo: "",
      preco_vendido: "", // limpar para novo preço
      valor_comprovante_input: "",
      banco: v.banco || "ITAU",
      forma: v.forma || "",
      qnt_parcelas: String(v.qnt_parcelas || ""),
      bandeira: v.bandeira || "",
      local: v.local || "",
      produto_na_troca: "",
      entrada_pix: "",
      banco_pix: v.banco_pix || "ITAU",
      entrada_especie: "",
      banco_2nd: v.banco_2nd || "",
      banco_alt: v.banco_alt || "",
      parc_alt: String(v.parc_alt || ""),
      band_alt: v.band_alt || "",
      sinal_antecipado: "",
      banco_sinal: "",
      troca_produto: "",
      troca_cor: "",
      troca_bateria: "",
      troca_obs: "",
    });
    setCatSel("");
    setEstoqueId("");
    setProdutoManual(true); // produto duplicado vai como manual
    const [y, m, d] = (v.data || "").split("-");
    setDuplicadoInfo({ data: d && m ? `${d}/${m}` : v.data, cliente: v.cliente });
    setTab("nova");
    setMsg("");
    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── Clientes Recorrentes ──
  const clientesRecorrentes = (() => {
    if (!form.cliente || form.cliente.length < 2) return [];
    const term = form.cliente.toLowerCase();
    // Agrupar vendas por nome do cliente
    const map = new Map<string, { cliente: string; ultimaData: string; ultimoProduto: string; qtd: number; origem: string; tipo: string; forma: string; banco: string }>();
    for (const v of vendas) {
      const nome = v.cliente?.toLowerCase();
      if (!nome || !nome.includes(term)) continue;
      const existing = map.get(nome);
      if (!existing || (v.data || "") > (existing.ultimaData || "")) {
        map.set(nome, {
          cliente: v.cliente,
          ultimaData: v.data,
          ultimoProduto: v.produto,
          qtd: (existing?.qtd || 0) + 1,
          origem: v.origem,
          tipo: v.tipo,
          forma: v.forma,
          banco: v.banco,
        });
      } else {
        existing.qtd += 1;
      }
    }
    return Array.from(map.values()).slice(0, 5);
  })();

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";
  const selectCls = inputCls;

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto items-center flex-wrap">
        <div className="flex gap-2">
          {([
            { key: "nova", label: "Nova Venda", count: 0, color: "bg-[#E8740E]" },
            { key: "andamento", label: "Em Andamento", count: vendas.filter(v => v.status_pagamento === "AGUARDANDO").length, color: "bg-yellow-500" },
            { key: "hoje", label: "Finalizadas Hoje", count: vendas.filter(v => (v.status_pagamento === "FINALIZADO" || !v.status_pagamento) && v.data === now.toISOString().split("T")[0]).length, color: "bg-blue-500" },
            { key: "finalizadas", label: "Histórico", count: vendas.filter(v => v.status_pagamento === "FINALIZADO" || !v.status_pagamento).length, color: "bg-green-600" },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${tab === t.key ? `${t.color} text-white` : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
              {t.label}{t.count > 0 ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* Filtros de data — só no histórico e em andamento */}
        {(tab === "andamento" || tab === "finalizadas") && (
          <div className="flex gap-1.5 items-center ml-auto">
            <select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs bg-white">
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs bg-white">
              {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (
                <option key={m} value={m}>{["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(m)-1]}</option>
              ))}
            </select>
            <select value={filtroDia} onChange={(e) => setFiltroDia(e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs bg-white">
              <option value="">Todos os dias</option>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
              ))}
            </select>
            {tab === "finalizadas" && isAdmin && (
              <button
                onClick={handleExportar}
                disabled={exportando}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {exportando ? "Exportando..." : "Exportar Mês"}
              </button>
            )}
          </div>
        )}
      </div>

      {tab === "nova" ? (
        /* Form de Nova Venda */
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#1D1D1F]">Registrar Nova Venda</h2>
            <button
              onClick={() => setShowPasteModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#E8740E] border border-[#E8740E] hover:bg-[#FFF8F0] transition-colors"
            >
              📋 Colar dados cliente
            </button>
          </div>

          {/* Indicador de venda duplicada */}
          {duplicadoInfo && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
              <span className="text-xs text-blue-700">
                📋 Baseado na venda de <strong>{duplicadoInfo.data}</strong> para <strong>{duplicadoInfo.cliente}</strong>
              </span>
              <button
                onClick={() => setDuplicadoInfo(null)}
                className="text-xs text-blue-400 hover:text-blue-600 ml-2"
              >
                ✕
              </button>
            </div>
          )}

          {/* Modal para colar texto do formulário */}
          {showPasteModal && (
            <div className="border border-[#E8740E] bg-[#FFF8F0] rounded-xl p-4 space-y-3">
              <p className="text-sm font-semibold text-[#1D1D1F]">📋 Colar dados do cliente</p>
              <p className="text-xs text-[#86868B]">Cole o texto do formulário de confirmação do WhatsApp abaixo. O sistema vai extrair nome, CPF e email automaticamente.</p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Cole aqui o texto do formulário..."
                rows={5}
                className="w-full px-3 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] resize-none"
              />
              <div className="flex gap-2">
                <button onClick={handlePasteConfirm} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors">Extrair dados</button>
                <button onClick={() => { setShowPasteModal(false); setPasteText(""); }} className="px-4 py-2 rounded-xl border border-[#D2D2D7] text-[#86868B] text-sm hover:bg-[#F5F5F7] transition-colors">Cancelar</button>
              </div>
            </div>
          )}

          {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

          {/* Row 1: Origem + Tipo + Data */}
          <div className="grid grid-cols-3 gap-4">
            <div><p className={labelCls}>Origem</p><select value={form.origem} onChange={(e) => set("origem", e.target.value)} className={selectCls}>
              <option>ANUNCIO</option><option>RECOMPRA</option><option>INDICACAO</option><option>ATACADO</option>
            </select></div>
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
            <div className="space-y-4">
              {/* Toggle PF / PJ */}
              <div className="flex gap-2">
                {(["PF", "PJ"] as const).map((p) => (
                  <button key={p} onClick={() => set("pessoa", p)} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${form.pessoa === p ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E]"}`}>
                    {p === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="relative"><p className={labelCls}>{form.pessoa === "PJ" ? "Razão Social" : "Cliente"}</p><input value={form.cliente} onChange={(e) => { set("cliente", e.target.value); setShowClienteSuggestions(true); }} onFocus={() => setShowClienteSuggestions(true)} onBlur={() => setTimeout(() => setShowClienteSuggestions(false), 200)} placeholder={form.pessoa === "PJ" ? "Nome da empresa" : "Nome completo"} className={inputCls} />
                  {/* Dropdown Clientes Recorrentes */}
                  {showClienteSuggestions && clientesRecorrentes.length > 0 && (
                    <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-[#D2D2D7] rounded-xl shadow-lg overflow-hidden max-h-[200px] overflow-y-auto">
                      <div className="px-3 py-1.5 bg-[#F5F5F7] text-[10px] font-bold text-[#86868B] uppercase">Clientes recorrentes</div>
                      {clientesRecorrentes.map((c, i) => (
                        <button
                          key={i}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            set("cliente", c.cliente);
                            set("origem", c.origem);
                            set("tipo", c.tipo);
                            set("forma", c.forma);
                            set("banco", c.banco);
                            setShowClienteSuggestions(false);
                            setMsg(`Cliente recorrente: ${c.cliente} (${c.qtd} compra${c.qtd > 1 ? "s" : ""})`);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-[#FFF8F0] transition-colors border-b border-[#F5F5F7] last:border-0"
                        >
                          <span className="text-sm font-medium text-[#1D1D1F]">{c.cliente}</span>
                          <span className="block text-[10px] text-[#86868B]">{c.qtd} compra{c.qtd > 1 ? "s" : ""} — Ultimo: {c.ultimoProduto}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.pessoa === "PJ" ? (
                  <div><p className={labelCls}>CNPJ</p><input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0000-00" className={inputCls} /></div>
                ) : (
                  <div><p className={labelCls}>CPF</p><input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" className={inputCls} /></div>
                )}
                <div><p className={labelCls}>Email</p><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="cliente@email.com" className={inputCls} /></div>
              </div>

              {/* Endereço — só PJ */}
              {form.pessoa === "PJ" && (
                <div><p className={labelCls}>Endereço</p><input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Endereço completo" className={inputCls} /></div>
              )}
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
                <div><p className={labelCls}>Fornecedor</p><select value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={selectCls}>
                  <option value="">— Selecionar —</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                </select></div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className={labelCls}>Categoria</p>
                    <select value={catSel} onChange={(e) => { setCatSel(e.target.value); setEstoqueId(""); set("produto", ""); set("custo", ""); set("fornecedor", ""); }} className={selectCls}>
                      <option value="">Selecionar...</option>
                      {categorias.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div><p className={labelCls}>Fornecedor</p><select value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={selectCls}>
                  <option value="">— Selecionar —</option>
                  {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                </select></div>
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

            {/* +1 Produto — mesmo cliente, outro produto */}
            {lastClienteData && !form.cliente && (
              <button
                onClick={() => {
                  set("cliente", lastClienteData.cliente);
                  set("cpf", lastClienteData.cpf);
                  set("cnpj", lastClienteData.cnpj);
                  set("email", lastClienteData.email);
                  set("endereco", lastClienteData.endereco);
                  set("pessoa", lastClienteData.pessoa);
                  set("origem", lastClienteData.origem);
                  set("tipo", lastClienteData.tipo);
                  setMsg(`+1 produto para ${lastClienteData.cliente}`);
                }}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
              >
                ➕ +1 Produto para {lastClienteData.cliente.split(" ")[0]}
              </button>
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
                <option value="">— Definir depois —</option>
                <option value="PIX">PIX</option>
                <option value="CARTAO">Maquina Cartao</option>
                <option value="LINK">Link Mercado Pago</option>
                <option value="ESPECIE">Especie (Dinheiro)</option>
                <option value="FIADO">Fiado</option>
              </select></div>

              {form.forma === "PIX" && (
                <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                  <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                </select></div>
              )}

              {form.forma === "CARTAO" && (
                <>
                  <div><p className={labelCls}>Maquina</p><select value={form.banco} onChange={(e) => set("banco", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option>
                  </select></div>
                  <div><p className={labelCls}>Parcelas</p><input type="number" value={form.qnt_parcelas} onChange={(e) => set("qnt_parcelas", e.target.value)} placeholder="1" className={inputCls} /></div>
                  <div><p className={labelCls}>Bandeira</p><select value={form.bandeira} onChange={(e) => set("bandeira", e.target.value)} className={selectCls}>
                    <option value="">Selecionar</option><option>VISA</option><option>MASTERCARD</option><option>ELO</option><option>AMEX</option>
                  </select></div>
                  {taxa > 0 && (
                    <>
                      <div><p className={labelCls}>Valor no Comprovante (R$)</p><input type="number" value={form.valor_comprovante_input} onChange={(e) => {
                        const comp = e.target.value;
                        set("valor_comprovante_input", comp);
                        const compVal = parseFloat(comp) || 0;
                        if (compVal > 0 && taxa > 0) {
                          const liquidoCartao = calcularLiquido(compVal, taxa);
                          const totalLiq = Math.round(liquidoCartao + entradaPix + entradaEspecie + valorTroca);
                          setForm(f => ({ ...f, valor_comprovante_input: comp, preco_vendido: String(totalLiq) }));
                        }
                      }} placeholder="Valor da maquina" className={inputCls} /></div>
                      <div className="col-span-2 md:col-span-3 bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs text-[#86868B] flex flex-wrap gap-3">
                        <span>Taxa: <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                        {(parseFloat(form.valor_comprovante_input) || 0) > 0 && (
                          <>
                            <span>Liquido cartao: <strong className="text-[#1D1D1F]">{fmt(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, taxa))}</strong></span>
                            {entradaPix > 0 && <span>+ PIX: <strong>{fmt(entradaPix)}</strong></span>}
                            {entradaEspecie > 0 && <span>+ Especie: <strong>{fmt(entradaEspecie)}</strong></span>}
                            {valorTroca > 0 && <span>+ Troca: <strong>{fmt(valorTroca)}</strong></span>}
                            <span>= Vendido: <strong className="text-green-600">{fmt(Math.round(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, taxa) + entradaPix + entradaEspecie + valorTroca))}</strong></span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}

              {form.forma === "LINK" && (
                <div><p className={labelCls}>Parcelas no Link</p><input type="number" value={form.qnt_parcelas} onChange={(e) => set("qnt_parcelas", e.target.value)} placeholder="1" className={inputCls} /></div>
              )}
            </div>

            {/* Pagamento misto — combinações extras */}
            {form.forma && form.forma !== "FIADO" && (
            <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
              <p className="text-xs text-[#86868B] font-semibold">Pagamento misto? (combine valores abaixo)</p>

              {/* Entrada PIX */}
              {form.forma !== "PIX" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelCls}>Entrada PIX (R$)</p><input type="number" value={form.entrada_pix} onChange={(e) => {
                  const v = e.target.value;
                  const newVendido = recalcVendido({ pix: v });
                  setForm(f => ({ ...f, entrada_pix: v, ...(newVendido ? { preco_vendido: newVendido } : {}) }));
                }} placeholder="0" className={inputCls} /></div>
                {entradaPix > 0 && (
                  <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                  </select></div>
                )}
              </div>
              )}

              {/* Entrada Especie */}
              {form.forma !== "ESPECIE" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelCls}>Entrada Especie (R$)</p><input type="number" value={form.entrada_especie} onChange={(e) => {
                  const v = e.target.value;
                  const newVendido = recalcVendido({ especie: v });
                  setForm(f => ({ ...f, entrada_especie: v, ...(newVendido ? { preco_vendido: newVendido } : {}) }));
                }} placeholder="0" className={inputCls} /></div>
              </div>
              )}

              {/* Resumo misto */}
              {(entradaPix > 0 || entradaEspecie > 0) && (
                <div className="bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs text-[#86868B] flex flex-wrap gap-3">
                  {entradaPix > 0 && <span>PIX: <strong className="text-[#1D1D1F]">{fmt(entradaPix)}</strong></span>}
                  {entradaEspecie > 0 && <span>Especie: <strong className="text-[#1D1D1F]">{fmt(entradaEspecie)}</strong></span>}
                  {valorTroca > 0 && <span>Troca: <strong className="text-[#1D1D1F]">{fmt(valorTroca)}</strong></span>}
                  <span>Restante ({form.forma}): <strong className="text-[#E8740E]">{fmt(Math.max(0, valorCartao))}</strong></span>
                </div>
              )}
            </div>
            )}
          </div>

          {/* PRODUTO NA TROCA */}
          <div className="border border-[#D2D2D7] rounded-xl p-4 space-y-4">
            <p className="text-sm font-bold text-[#1D1D1F]">Cliente deu produto na troca?</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className={labelCls}>Valor da troca (R$)</p><input type="number" value={form.produto_na_troca} onChange={(e) => {
                const v = e.target.value;
                const newVendido = recalcVendido({ troca: v });
                setForm(f => ({ ...f, produto_na_troca: v, ...(newVendido ? { preco_vendido: newVendido } : {}) }));
              }} placeholder="0" className={inputCls} /></div>
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

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Registrar Venda"}
            </button>
            {form.cliente && (
              <button
                onClick={() => {
                  setForm((f) => ({ ...f, cliente: "", cpf: "", cnpj: "", email: "", endereco: "", pessoa: "PF" as "PF" | "PJ" }));
                  setLastClienteData(null);
                }}
                className="px-4 py-3 rounded-xl border border-[#D2D2D7] text-[#86868B] text-sm hover:bg-[#F5F5F7] transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Vendas Em Andamento / Finalizadas */
        (() => {
          const hoje = now.toISOString().split("T")[0];
          const filteredRaw = tab === "andamento"
            ? vendas.filter(v => v.status_pagamento === "AGUARDANDO")
            : tab === "hoje"
            ? vendas.filter(v => (v.status_pagamento === "FINALIZADO" || !v.status_pagamento) && v.data === hoje)
            : vendas.filter(v => v.status_pagamento === "FINALIZADO" || !v.status_pagamento);
          const filtered = [...filteredRaw].sort((a, b) => {
            if (ordenar === "recente") return (b.created_at || "").localeCompare(a.created_at || "");
            if (ordenar === "antigo") return (a.created_at || "").localeCompare(b.created_at || "");
            if (ordenar === "origem") return (a.origem || "").localeCompare(b.origem || "");
            if (ordenar === "cliente") return (a.cliente || "").localeCompare(b.cliente || "");
            return 0;
          });
          const titulo = tab === "andamento" ? "Vendas em Andamento" : tab === "hoje" ? "Finalizadas Hoje" : "Histórico de Vendas";
          const totalVendido = filtered.reduce((s, v) => s + (v.preco_vendido || 0), 0);
          const totalLucro = filtered.reduce((s, v) => s + (v.lucro || 0), 0);

          return (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-bold text-[#1D1D1F]">{titulo}</h2>
                  <select
                    value={ordenar}
                    onChange={(e) => setOrdenar(e.target.value as typeof ordenar)}
                    className="text-[10px] px-2 py-1 rounded-lg bg-[#F5F5F7] border border-[#D2D2D7] text-[#86868B] focus:outline-none focus:border-[#E8740E]"
                  >
                    <option value="recente">⏰ Mais recente</option>
                    <option value="antigo">⏰ Mais antigo</option>
                    <option value="origem">📌 Origem</option>
                    <option value="cliente">👤 Cliente</option>
                  </select>
                </div>
                <div className="flex gap-3 text-xs text-[#86868B]">
                  <span>{filtered.length} vendas</span>
                  {(tab === "finalizadas" || tab === "hoje") && filtered.length > 0 && (
                    <>
                      <span>Vendido: <strong className="text-[#1D1D1F]">{fmt(totalVendido)}</strong></span>
                      <span>Lucro: <strong className={totalLucro >= 0 ? "text-green-600" : "text-red-500"}>{fmt(totalLucro)}</strong></span>
                    </>
                  )}
                </div>
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
                        <tr><td colSpan={12} className="px-4 py-8 text-center text-[#86868B]">Nenhuma venda {tab === "andamento" ? "em andamento" : tab === "hoje" ? "finalizada hoje" : "finalizada"}</td></tr>
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
                              <td className="px-3 py-2.5 text-xs text-[#86868B] whitespace-nowrap">
                                {(() => {
                                  const [y, m, d] = (v.data || "").split("-");
                                  return d && m ? `${d}/${m}` : v.data;
                                })()}
                                {v.created_at && (
                                  <span className="block text-[10px] text-[#B0B0B0]">
                                    {new Date(v.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </td>
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
                                                // lucro e margem_pct são GENERATED ALWAYS no Supabase — NÃO enviar!
                                                const pv = parseFloat(ef.preco_vendido) || 0;
                                                const c = parseFloat(ef.custo) || 0;
                                                const newLucro = pv - c;
                                                const newMargem = pv > 0 ? Math.round(((pv - c) / pv) * 1000) / 10 : 0;
                                                const updates: Record<string, unknown> = {
                                                  id: v.id,
                                                  cliente: ef.cliente,
                                                  produto: ef.produto,
                                                  custo: c,
                                                  preco_vendido: pv,
                                                  // NÃO enviar lucro e margem_pct (GENERATED ALWAYS)
                                                  banco: ef.banco,
                                                  forma: ef.forma,
                                                  recebimento: ef.recebimento,
                                                  qnt_parcelas: parseInt(ef.qnt_parcelas) || null,
                                                  bandeira: ef.bandeira || null,
                                                  entrada_pix: parseFloat(ef.entrada_pix) || 0,
                                                  banco_pix: ef.banco_pix || null,
                                                  produto_na_troca: (parseFloat(ef.produto_na_troca) || 0) > 0 ? ef.produto_na_troca : null,
                                                };
                                                const res = await fetch("/api/vendas", {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password },
                                                  body: JSON.stringify(updates),
                                                });
                                                const resBody = await res.json();
                                                if (res.ok && resBody.updated?.[0]) {
                                                  // Usar dados retornados do Supabase (fonte de verdade)
                                                  const updated = resBody.updated[0] as Venda;
                                                  setVendas(prev => prev.map(r => r.id === v.id ? { ...r, ...updated } : r));
                                                  setMsg("Venda atualizada! Lucro: R$ " + (updated.lucro || newLucro));
                                                } else if (res.ok) {
                                                  // Fallback: atualizar com dados locais
                                                  setVendas(prev => prev.map(r => r.id === v.id ? {
                                                    ...r,
                                                    cliente: ef.cliente,
                                                    produto: ef.produto,
                                                    custo: c,
                                                    preco_vendido: pv,
                                                    lucro: newLucro,
                                                    margem_pct: newMargem,
                                                  } : r));
                                                  setMsg("Venda atualizada!");
                                                } else {
                                                  setMsg("Erro: " + (resBody.error || "falha ao atualizar"));
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
                                              <option value="ESPECIE">ESPECIE</option>
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
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Entrada Especie</span>
                                            <input type="number" value={ef.entrada_especie} onChange={e => setEf("entrada_especie", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white" />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Valor Troca</span>
                                            <input type="number" value={ef.produto_na_troca} onChange={e => setEf("produto_na_troca", e.target.value)} className="w-full px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs bg-white" />
                                          </label>
                                        </div>
                                        {/* Valor no Comprovante — edição */}
                                        {(ef.forma === "CARTAO" || ef.forma === "LINK") && (() => {
                                          const efParcelas = parseInt(ef.qnt_parcelas) || 0;
                                          const efTaxa = ef.forma === "CARTAO"
                                            ? getTaxa(ef.banco, ef.bandeira || null, efParcelas, ef.forma)
                                            : ef.forma === "LINK" ? getTaxa("MERCADO_PAGO", null, efParcelas, "CARTAO") : 0;
                                          if (efTaxa <= 0) return null;
                                          return (
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                                              <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                                <span className="text-[10px] font-bold text-[#E8740E] uppercase">Valor no Comprovante (R$)</span>
                                                <input type="number" value={ef.valor_comprovante} onChange={e => {
                                                  const comp = e.target.value;
                                                  const compVal = parseFloat(comp) || 0;
                                                  if (compVal > 0 && efTaxa > 0) {
                                                    const liqCartao = calcularLiquido(compVal, efTaxa);
                                                    const pix = parseFloat(ef.entrada_pix) || 0;
                                                    const esp = parseFloat(ef.entrada_especie) || 0;
                                                    const trc = parseFloat(ef.produto_na_troca) || 0;
                                                    const totalVendido = Math.round(liqCartao + pix + esp + trc);
                                                    setEditForm(prev => ({ ...prev, valor_comprovante: comp, preco_vendido: String(totalVendido) }));
                                                  } else {
                                                    setEf("valor_comprovante", comp);
                                                  }
                                                }} placeholder="Valor da maquina" className="w-full px-2 py-1.5 border border-[#E8740E] rounded-lg text-xs bg-white" />
                                              </label>
                                              <div className="col-span-1 md:col-span-3 flex items-end">
                                                <div className="bg-[#F5F5F7] rounded-lg px-3 py-2 text-[10px] text-[#86868B] flex flex-wrap gap-2 w-full">
                                                  <span>Taxa: <strong className="text-[#E8740E]">{efTaxa.toFixed(2)}%</strong></span>
                                                  {(parseFloat(ef.valor_comprovante) || 0) > 0 && (
                                                    <>
                                                      <span>Liq: <strong className="text-[#1D1D1F]">{fmt(calcularLiquido(parseFloat(ef.valor_comprovante) || 0, efTaxa))}</strong></span>
                                                      {(parseFloat(ef.entrada_pix) || 0) > 0 && <span>+ PIX: <strong>{fmt(parseFloat(ef.entrada_pix) || 0)}</strong></span>}
                                                      {(parseFloat(ef.entrada_especie) || 0) > 0 && <span>+ Esp: <strong>{fmt(parseFloat(ef.entrada_especie) || 0)}</strong></span>}
                                                      {(parseFloat(ef.produto_na_troca) || 0) > 0 && <span>+ Troca: <strong>{fmt(parseFloat(ef.produto_na_troca) || 0)}</strong></span>}
                                                      <span>= <strong className="text-green-600">{fmt(Math.round(calcularLiquido(parseFloat(ef.valor_comprovante) || 0, efTaxa) + (parseFloat(ef.entrada_pix) || 0) + (parseFloat(ef.entrada_especie) || 0) + (parseFloat(ef.produto_na_troca) || 0)))}</strong></span>
                                                    </>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })() : (
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* Ações de status — PRIMEIRO */}
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-bold text-[#86868B] uppercase">Status</h4>
                                      <div className="flex gap-2 flex-wrap">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDuplicar(v);
                                          }}
                                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-600 border border-purple-200 hover:bg-purple-50 transition-colors"
                                        >
                                          📋 Duplicar
                                        </button>
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
                                              entrada_especie: String(v.entrada_especie || 0),
                                              banco_pix: v.banco_pix || "",
                                              valor_comprovante: "",
                                              produto_na_troca: String(v.produto_na_troca || 0),
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
