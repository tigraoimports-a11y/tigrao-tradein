"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularBruto, calcularLiquido, calcularRecebimento } from "@/lib/taxas";
import { useTabParam } from "@/lib/useTabParam";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { addToQueue, getQueue, removeFromQueue, getQueueCount } from "@/lib/offline-queue";
import type { Venda } from "@/lib/admin-types";
import BarcodeScanner from "@/components/BarcodeScanner";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const VENDAS_PASSWORD = "tigrao$vendas";

export default function VendasPage() {
  const { password, user, darkMode } = useAdmin();
  const dm = darkMode;
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [loading, setLoading] = useState(true);
  const VENDAS_TABS = ["nova", "andamento", "hoje", "finalizadas"] as const;
  const [tab, setTab] = useTabParam<"nova" | "andamento" | "hoje" | "finalizadas">("nova", VENDAS_TABS);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editandoVendaId, setEditandoVendaId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [vendasUnlocked, setVendasUnlocked] = useState(false);
  const [vendasPw, setVendasPw] = useState("");
  const [vendasPwError, setVendasPwError] = useState(false);
  const [exportando, setExportando] = useState(false);
  const { isOnline } = useOnlineStatus();
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const isSyncing = useRef(false);
  const [duplicadoInfo, setDuplicadoInfo] = useState<{ data: string; cliente: string } | null>(null);
  const [showClienteSuggestions, setShowClienteSuggestions] = useState(false);

  // Client history state
  const [clienteHistorico, setClienteHistorico] = useState<{
    nome: string;
    totalCompras: number;
    totalGasto: number;
    ultimaCompraData: string;
    ultimaCompraProduto: string;
    fezTroca: boolean;
    clienteDesde: string;
  } | null>(null);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const clienteHistoricoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filtros de data para histórico
  const now = new Date();
  const [filtroAno, setFiltroAno] = useState(String(now.getFullYear()));
  const [filtroMes, setFiltroMes] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [filtroDia, setFiltroDia] = useState("");
  const [filtroCpf, setFiltroCpf] = useState("");
  const [ordenar, setOrdenar] = useState<"recente" | "antigo" | "origem" | "cliente">("recente");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [finalizandoLote, setFinalizandoLote] = useState(false);

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
    parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "",
    // Dados do aparelho na troca (para criar seminovo)
    troca_produto: "", troca_cor: "", troca_bateria: "", troca_obs: "",
    troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "",
    // Serial e IMEI
    serial_no: "", imei: "",
    // CEP e endereço
    cep: "", bairro: "", cidade: "", uf: "",
  });

  // CEP auto-fill
  const [cepLoading, setCepLoading] = useState(false);
  const fetchCep = useCallback(async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (res.ok) {
        const data = await res.json();
        if (!data.erro) {
          setForm((f) => ({ ...f, bairro: data.bairro || "", cidade: data.localidade || "", uf: data.uf || "" }));
        }
      }
    } catch { /* ignore */ }
    setCepLoading(false);
  }, []);

  // Carrinho de produtos (multi-produto na mesma venda)
  // Payment fields are GLOBAL (in form state), not per-product
  interface ProdutoCarrinho {
    produto: string;
    fornecedor: string;
    custo: string;
    preco_vendido: string;
    local: string;
    serial_no: string;
    imei: string;
    _estoqueId: string;
    _catSel: string;
    _produtoManual: boolean;
  }
  const [produtosCarrinho, setProdutosCarrinho] = useState<ProdutoCarrinho[]>([]);

  // Estoque: catálogo de produtos
  interface EstoqueItem { id: string; produto: string; categoria: string; tipo: string; qnt: number; custo_unitario: number; cor: string | null; fornecedor: string | null; status: string }
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [catSel, setCatSel] = useState("");
  const [estoqueId, setEstoqueId] = useState("");
  const [produtoManual, setProdutoManual] = useState(false);
  const [scanMode, setScanMode] = useState(true); // Scan é o modo padrão — produto novo obrigatório bipar
  const [scanMsg, setScanMsg] = useState("");

  // Fornecedores
  interface Fornecedor { id: string; nome: string }
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const fetchFornecedores = useCallback(async () => {
    try {
      const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" } });
      if (res.ok) {
        const json = await res.json();
        setFornecedores(json.data ?? []);
      }
    } catch { /* ignore */ }
  }, [password]);

  const fetchEstoque = useCallback(async () => {
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" } });
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
      let url: string;
      if (filtroCpf.replace(/\D/g, "").length >= 3) {
        // Buscar por CPF
        url = `/api/vendas?search=${encodeURIComponent(filtroCpf)}`;
      } else {
        // Construir filtro de data
        const from = filtroDia
          ? `${filtroAno}-${filtroMes}-${filtroDia.padStart(2, "0")}`
          : `${filtroAno}-${filtroMes}-01`;
        const to = filtroDia
          ? `${filtroAno}-${filtroMes}-${filtroDia.padStart(2, "0")}`
          : `${filtroAno}-${filtroMes}-31`;
        url = `/api/vendas?from=${from}&to=${to}`;
      }
      const res = await fetch(url, { headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" } });
      if (res.ok) {
        const json = await res.json();
        setVendas(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, filtroAno, filtroMes, filtroDia, filtroCpf]);

  useEffect(() => { if (password) fetchVendas(); }, [password, fetchVendas]);

  // Fetch client history when client name changes (3+ chars, debounced)
  const fetchClienteHistorico = useCallback(async (nome: string) => {
    if (!nome || nome.length < 3 || !password) {
      setClienteHistorico(null);
      return;
    }
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/vendas?search=${encodeURIComponent(nome)}`, {
        headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
      });
      if (res.ok) {
        const json = await res.json();
        const allVendas = (json.data ?? []) as Venda[];
        // Filter for exact-ish match (case insensitive contains)
        const matched = allVendas.filter((v: Venda) =>
          v.cliente?.toLowerCase().includes(nome.toLowerCase())
        );
        if (matched.length > 0) {
          const sorted = [...matched].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
          const oldest = [...matched].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
          const totalGasto = matched.reduce((sum: number, v: Venda) => sum + (v.preco_vendido || 0), 0);
          const fezTroca = matched.some((v: Venda) => v.produto_na_troca && parseFloat(String(v.produto_na_troca)) > 0);
          setClienteHistorico({
            nome: sorted[0].cliente,
            totalCompras: matched.length,
            totalGasto,
            ultimaCompraData: sorted[0].data,
            ultimaCompraProduto: sorted[0].produto,
            fezTroca,
            clienteDesde: oldest[0].data,
          });
        } else {
          setClienteHistorico(null);
        }
      }
    } catch { /* ignore */ }
    setLoadingHistorico(false);
  }, [password]);

  // Debounce client history search
  useEffect(() => {
    if (clienteHistoricoTimer.current) clearTimeout(clienteHistoricoTimer.current);
    if (form.cliente.length >= 3) {
      clienteHistoricoTimer.current = setTimeout(() => {
        fetchClienteHistorico(form.cliente);
      }, 500);
    } else {
      setClienteHistorico(null);
    }
    return () => { if (clienteHistoricoTimer.current) clearTimeout(clienteHistoricoTimer.current); };
  }, [form.cliente, fetchClienteHistorico]);

  // Verificar se já desbloqueou nesta sessão
  useEffect(() => {
    if (isAdmin) { setVendasUnlocked(true); return; }
    const unlocked = sessionStorage.getItem("vendas_unlocked");
    if (unlocked === "true") setVendasUnlocked(true);
  }, [isAdmin]);

  // Keep offline queue count in sync
  useEffect(() => {
    setOfflineCount(getQueueCount());
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (!isOnline || !password) return;

    const syncQueue = async () => {
      const queue = getQueue();
      if (queue.length === 0 || isSyncing.current) return;

      isSyncing.current = true;
      let synced = 0;
      const total = queue.length;

      for (let i = queue.length - 1; i >= 0; i--) {
        setSyncStatus(`Sincronizando venda ${total - i} de ${total}...`);
        try {
          const res = await fetch("/api/vendas", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
            body: JSON.stringify(queue[i].payload),
          });
          const json = await res.json();
          if (json.ok) {
            removeFromQueue(i);
            synced++;
          }
        } catch {
          // Keep in queue on failure
        }
      }

      setOfflineCount(getQueueCount());
      isSyncing.current = false;

      if (synced > 0) {
        setSyncStatus(`${synced} venda${synced > 1 ? "s" : ""} sincronizada${synced > 1 ? "s" : ""} com sucesso!`);
        fetchVendas();
        fetchEstoque();
        setTimeout(() => setSyncStatus(null), 5000);
      } else if (getQueueCount() > 0) {
        setSyncStatus("Erro ao sincronizar. Tentando novamente em breve...");
        setTimeout(() => setSyncStatus(null), 5000);
      } else {
        setSyncStatus(null);
      }
    };

    syncQueue();
  }, [isOnline, password, fetchVendas, fetchEstoque]);

  if (!vendasUnlocked) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-full max-w-sm">
          <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-6 space-y-4 shadow-sm`}>
            <div className="text-center">
              <div className="text-3xl mb-2">🔒</div>
              <h2 className={`text-lg font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Area Restrita</h2>
              <p className={`text-xs mt-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Digite a senha para acessar Vendas</p>
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
  const parcelas = parseInt(form.qnt_parcelas) || 0;
  const taxa = form.forma === "CARTAO"
    ? getTaxa(form.banco, form.bandeira || null, parcelas, form.forma)
    : form.forma === "LINK" ? getTaxa("MERCADO_PAGO", null, parcelas, "CARTAO") : 0;
  const comprovante = taxa > 0 ? calcularBruto(valorCartao > 0 ? valorCartao : preco, taxa) : preco;
  const recebimento = form.forma ? calcularRecebimento(form.forma === "LINK" ? "CARTAO" : form.forma, parcelas || null) : "—";

  // Lógica correta de lucro (diagrama):
  // 1. Busca taxa da maquininha (forma + parcelas)
  // 2. Valor líquido = bruto × (1 − taxa)
  // 3. Total real recebido = líquido + troca
  // 4. Lucro = total real − custo
  // 5. Margem = lucro ÷ total real × 100
  const parteCartao = Math.max(0, valorCartao);
  const valorComprovanteInput = parseFloat(form.valor_comprovante_input) || 0;
  const valorLiquido = taxa > 0
    ? calcularLiquido(valorComprovanteInput > 0 ? valorComprovanteInput : comprovante || parteCartao, taxa)
    : parteCartao;
  const totalRealRecebido = valorLiquido + entradaPix + entradaEspecie + valorTroca;
  const lucro = totalRealRecebido - custo;
  const margem = totalRealRecebido > 0 ? (lucro / totalRealRecebido) * 100 : 0;

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

  // Helper: build payload from product fields + global payment (from form state)
  // Payment info is GLOBAL for the entire sale — copied to each product record
  const buildPayload = (prodFields: {
    produto: string; fornecedor: string; custo: string; preco_vendido: string;
    local: string; serial_no: string; imei: string; _estoqueId?: string;
  }) => {
    const pCusto = parseFloat(prodFields.custo) || 0;
    const pPrecoVendido = parseFloat(prodFields.preco_vendido) || 0;

    // Global payment fields from form
    const gForma = form.forma;
    const gBanco = form.banco;
    const gBancoPix = form.banco_pix;
    const gParcelas = parseInt(form.qnt_parcelas) || 0;
    const gBandeira = form.bandeira;
    const gValorComprovanteInput = parseFloat(form.valor_comprovante_input) || 0;
    const gEntradaPix = parseFloat(form.entrada_pix) || 0;
    const gEntradaEspecie = parseFloat(form.entrada_especie) || 0;
    const gValorTroca = parseFloat(form.produto_na_troca) || 0;
    const gTemTroca = gValorTroca > 0;
    const gTemEntradaPix = gEntradaPix > 0;

    const gTaxa = gForma === "CARTAO"
      ? getTaxa(gBanco, gBandeira || null, gParcelas, gForma)
      : gForma === "LINK" ? getTaxa("MERCADO_PAGO", null, gParcelas, "CARTAO") : 0;

    let pBancoFinal = gBanco;
    if (gForma === "LINK") pBancoFinal = "MERCADO_PAGO";
    if (gForma === "PIX") pBancoFinal = gBancoPix || "ITAU";
    if (gForma === "ESPECIE") pBancoFinal = "ESPECIE";
    if (!gForma) pBancoFinal = "ITAU";

    const payload: Record<string, unknown> = {
      data: form.data,
      cliente: form.cliente,
      cpf: form.cpf || null,
      cnpj: form.cnpj || null,
      email: form.email || null,
      endereco: form.endereco || null,
      cep: form.cep?.replace(/\D/g, "") || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      uf: form.uf || null,
      local: form.local || null,
      origem: form.tipo === "ATACADO" ? "ATACADO" : form.origem,
      tipo: gTemTroca ? "UPGRADE" : form.tipo,
      produto: prodFields.produto,
      fornecedor: prodFields.fornecedor || null,
      custo: pCusto,
      preco_vendido: pPrecoVendido,
      banco: pBancoFinal,
      forma: !gForma ? "PIX" : gForma === "LINK" ? "CARTAO" : gForma === "ESPECIE" ? "ESPECIE" : gForma,
      recebimento: !gForma ? "D+0" : gForma === "PIX" || gForma === "ESPECIE" ? "D+0" : gForma === "LINK" ? "D+0" : "D+1",
      qnt_parcelas: gParcelas || null,
      bandeira: gBandeira || null,
      valor_comprovante: gValorComprovanteInput || null,
      produto_na_troca: gTemTroca ? String(gValorTroca) : null,
      entrada_pix: gEntradaPix,
      banco_pix: gTemEntradaPix ? (gBancoPix || "ITAU") : null,
      entrada_especie: gEntradaEspecie,
      banco_2nd: form.banco_2nd || null,
      banco_alt: form.banco_alt || null,
      parc_alt: parseInt(form.parc_alt) || null,
      band_alt: form.band_alt || null,
      comp_alt: parseFloat(form.comp_alt) || null,
      sinal_antecipado: parseFloat(form.sinal_antecipado) || 0,
      banco_sinal: form.banco_sinal || null,
      serial_no: prodFields.serial_no || null,
      imei: prodFields.imei || null,
      troca_produto: form.troca_produto || null,
      troca_cor: form.troca_cor || null,
      troca_bateria: form.troca_bateria || null,
      troca_obs: form.troca_obs || null,
      status_pagamento: "AGUARDANDO",
    };

    if (prodFields._estoqueId) {
      payload._estoque_id = prodFields._estoqueId;
    }

    if (gTemTroca && form.troca_produto) {
      payload._seminovo = {
        produto: form.troca_produto,
        valor: gValorTroca,
        cor: form.troca_cor || null,
        bateria: form.troca_bateria ? parseInt(form.troca_bateria as string) : null,
        observacao: form.troca_obs || null,
      };
    }

    return payload;
  };

  // Helper: extract current product fields from form (only product-specific, not payment)
  const getCurrentProductFields = (): ProdutoCarrinho => ({
    produto: form.produto,
    fornecedor: form.fornecedor,
    custo: form.custo,
    preco_vendido: form.preco_vendido,
    local: form.local,
    serial_no: form.serial_no,
    imei: form.imei,
    _estoqueId: estoqueId,
    _catSel: catSel,
    _produtoManual: produtoManual,
  });

  // Helper: clear product fields in form (keeps payment fields intact for multi-product)
  const clearProductFields = () => {
    setForm(f => ({
      ...f,
      produto: "", fornecedor: "",
      custo: "", preco_vendido: "",
      serial_no: "", imei: "",
    }));
    setCatSel("");
    setEstoqueId("");
    setProdutoManual(false);
  };

  // Add current product to cart
  const handleAddToCart = () => {
    if (!form.produto) {
      setMsg("Preencha o produto antes de adicionar ao carrinho");
      return;
    }
    const prodFields = getCurrentProductFields();
    setProdutosCarrinho(prev => [...prev, prodFields]);
    clearProductFields();
    setMsg(`Produto adicionado ao carrinho. Continue adicionando ou registre as vendas.`);
  };

  // Remove product from cart
  const handleRemoveFromCart = (index: number) => {
    setProdutosCarrinho(prev => prev.filter((_, i) => i !== index));
  };

  // Edit product from cart — load product fields back into form (payment stays global)
  const handleEditFromCart = (index: number) => {
    const p = produtosCarrinho[index];
    setForm(f => ({
      ...f,
      produto: p.produto,
      fornecedor: p.fornecedor,
      custo: p.custo,
      preco_vendido: p.preco_vendido,
      serial_no: p.serial_no,
      imei: p.imei,
    }));
    if (p._catSel) setCatSel(p._catSel);
    if (p._estoqueId) setEstoqueId(p._estoqueId);
    setProdutoManual(!!p._produtoManual);
    // Remove from cart (will be re-added when user clicks "Adicionar")
    setProdutosCarrinho(prev => prev.filter((_, i) => i !== index));
    setMsg(`Editando produto: ${p.produto}. Faça as alterações e adicione de volta ao carrinho.`);
  };

  const handleSubmit = async () => {
    if (!form.cliente) {
      setMsg("Preencha o nome do cliente");
      return;
    }

    // Collect all products: cart items + current form (if has product)
    const allProducts: ProdutoCarrinho[] = [...produtosCarrinho];
    if (form.produto) {
      allProducts.push(getCurrentProductFields());
    }

    if (allProducts.length === 0) {
      setMsg("Adicione pelo menos um produto");
      return;
    }

    // Validação: comprovante obrigatório para vendas no CARTÃO
    if ((form.forma === "CARTAO" || form.forma === "LINK") && !(parseFloat(form.valor_comprovante_input) > 0)) {
      setMsg("⚠️ Preencha o VALOR DO COMPROVANTE para vendas no cartão");
      return;
    }

    setSaving(true);
    setMsg("");

    // Build payloads for all products
    const payloads: Record<string, unknown>[] = [];
    for (const prod of allProducts) {
      payloads.push(buildPayload(prod));
    }
    if (payloads.length > 1) {
      const comprovanteTotal = Number(payloads[0]?.valor_comprovante || 0);
      if (comprovanteTotal > 0) {
        // Calculate total custo for proportional distribution
        const totalCusto = payloads.reduce((s, p) => s + Number(p.custo || 0), 0);

        if (totalCusto > 0) {
          // Calculate taxa from form (same for all products since payment is global)
          const gForma = form.forma;
          const gBanco = gForma === "LINK" ? "MERCADO_PAGO" : form.banco;
          const gParcelas = parseInt(form.qnt_parcelas) || 0;
          const gBandeira = form.bandeira || null;
          const gTaxa = (gForma === "CARTAO" || gForma === "LINK")
            ? getTaxa(gBanco, gBandeira, gParcelas, gForma === "LINK" ? "CARTAO" : gForma)
            : 0;

          // Total líquido from comprovante after tax
          const totalLiquido = gTaxa > 0 ? calcularLiquido(comprovanteTotal, gTaxa) : comprovanteTotal;

          // Add entradas (pix, especie, troca) — these are global, added once to the total
          const gEntradaPix = parseFloat(form.entrada_pix) || 0;
          const gEntradaEspecie = parseFloat(form.entrada_especie) || 0;
          const gValorTroca = parseFloat(form.produto_na_troca) || 0;
          const totalRecebido = totalLiquido + gEntradaPix + gEntradaEspecie + gValorTroca;

          let comprovanteDistribuido = 0;
          let vendidoDistribuido = 0;
          for (let i = 0; i < payloads.length; i++) {
            const custoItem = Number(payloads[i].custo || 0);
            const proporcao = custoItem / totalCusto;

            if (i === payloads.length - 1) {
              // Last item gets the remainder (avoids rounding errors)
              payloads[i].valor_comprovante = Math.round(comprovanteTotal - comprovanteDistribuido);
              payloads[i].preco_vendido = Math.round(totalRecebido - vendidoDistribuido);
            } else {
              const compProporcional = Math.round(comprovanteTotal * proporcao);
              const vendidoProporcional = Math.round(totalRecebido * proporcao);
              payloads[i].valor_comprovante = compProporcional;
              payloads[i].preco_vendido = vendidoProporcional;
              comprovanteDistribuido += compProporcional;
              vendidoDistribuido += vendidoProporcional;
            }
          }
        }
      }
    }

    // OFFLINE MODE: save to local queue instead of posting
    if (!isOnline) {
      for (const payload of payloads) {
        addToQueue(payload);
      }
      setOfflineCount(getQueueCount());
      setDuplicadoInfo(null);
      const clienteInfo = { cliente: form.cliente, cpf: form.cpf, cnpj: form.cnpj, email: form.email, endereco: form.endereco, pessoa: form.pessoa, origem: form.origem, tipo: form.tipo };
      setLastClienteData(clienteInfo);
      setProdutosCarrinho([]);
      clearProductFields();
      const plural = payloads.length > 1 ? "s" : "";
      setMsg(`Sem conexao — ${payloads.length} venda${plural} salva${plural} localmente. Sera sincronizada quando a internet voltar.`);
      setSaving(false);
      return;
    }

    // MODO EDIÇÃO: atualizar venda existente via PATCH
    if (editandoVendaId) {
      const prod = allProducts[0]; // edição é sempre 1 produto
      const payload = buildPayload(prod);
      try {
        const res = await fetch("/api/vendas", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-admin-password": password },
          body: JSON.stringify({ id: editandoVendaId, ...payload }),
        });
        const json = await res.json();
        if (json.ok || json.data) {
          setEditandoVendaId(null);
          setDuplicadoInfo(null);
          setProdutosCarrinho([]);
          clearProductFields();
          setMsg("Venda atualizada com sucesso!");
          fetchVendas();
          fetchEstoque();
        } else {
          setMsg("Erro ao atualizar: " + (json.error || "erro desconhecido"));
        }
      } catch {
        setMsg("Erro de rede ao atualizar venda");
      }
      setSaving(false);
      return;
    }

    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i];
      const prod = allProducts[i];

      try {
        const res = await fetch("/api/vendas", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.ok) {
          successCount++;
        } else {
          errors.push(`${prod.produto}: ${json.error}`);
        }
      } catch (err) {
        // Network error during online attempt — save to offline queue
        addToQueue(payload);
        setOfflineCount(getQueueCount());
        errors.push(`${prod.produto}: salva offline (erro de rede)`);
      }
    }

    if (successCount > 0) {
      setDuplicadoInfo(null);
      const clienteInfo = { cliente: form.cliente, cpf: form.cpf, cnpj: form.cnpj, email: form.email, endereco: form.endereco, pessoa: form.pessoa, origem: form.origem, tipo: form.tipo };
      setLastClienteData(clienteInfo);
      setProdutosCarrinho([]);
      clearProductFields();
      const plural = successCount > 1 ? "s" : "";
      setMsg(`${successCount} venda${plural} registrada${plural}!${errors.length > 0 ? ` (${errors.length} erro${errors.length > 1 ? "s" : ""})` : ""} Adicione outro produto para ${clienteInfo.cliente.split(" ")[0]} ou limpe o formulario.`);
      fetchVendas();
      fetchEstoque();
    } else {
      setMsg("Erro: " + errors.join("; "));
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
        headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
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
      comp_alt: String(v.comp_alt || ""),
      sinal_antecipado: "",
      banco_sinal: "",
      troca_produto: "",
      troca_cor: "",
      troca_bateria: "",
      troca_obs: "",
      troca_grade: "",
      troca_caixa: "",
      troca_cabo: "",
      troca_fonte: "",
      serial_no: "",
      imei: v.imei || "",
      cep: "",
      bairro: "",
      cidade: "",
      uf: "",
    });
    setCatSel("");
    setEstoqueId("");
    setProdutoManual(true); // produto duplicado vai como manual
    setProdutosCarrinho([]); // limpar carrinho ao duplicar
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

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;
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
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${tab === t.key ? `${t.color} text-white` : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}>
              {t.label}{t.count > 0 ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* Filtros — só no histórico e em andamento */}
        {(tab === "andamento" || tab === "finalizadas") && (
          <div className="flex gap-1.5 items-center ml-auto flex-wrap">
            <input
              type="text"
              placeholder="Buscar CPF..."
              value={filtroCpf}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                const formatted = v.length > 9 ? `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}` : v.length > 6 ? `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}` : v.length > 3 ? `${v.slice(0,3)}.${v.slice(3)}` : v;
                setFiltroCpf(formatted);
              }}
              className={`px-2 py-1.5 rounded-lg border text-xs w-[130px] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder:text-[#6E6E73]" : "bg-white border-[#D2D2D7] placeholder:text-[#86868B]"}`}
            />
            {filtroCpf && (
              <button onClick={() => setFiltroCpf("")} className="text-xs text-red-500 hover:text-red-700">Limpar</button>
            )}
            <select value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)} className={`px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className={`px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
              {["01","02","03","04","05","06","07","08","09","10","11","12"].map((m) => (
                <option key={m} value={m}>{["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(m)-1]}</option>
              ))}
            </select>
            <select value={filtroDia} onChange={(e) => setFiltroDia(e.target.value)} className={`px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
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
        <div className="space-y-4">
          {/* Offline banner */}
          {!isOnline && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: "#FFF3E0", border: "1px solid #E8740E" }}>
              <span className="text-lg">📡</span>
              <div>
                <p className="text-sm font-semibold" style={{ color: "#E65100" }}>
                  Modo Offline — Vendas serao salvas localmente e sincronizadas quando a conexao voltar
                </p>
                {offlineCount > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: "#BF360C" }}>
                    {offlineCount} venda{offlineCount > 1 ? "s" : ""} pendente{offlineCount > 1 ? "s" : ""} de sincronizacao
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Sync status banner */}
          {syncStatus && (
            <div
              className="rounded-xl px-4 py-3 text-sm font-medium"
              style={{
                background: syncStatus.includes("sucesso") ? "#E8F5E9" : syncStatus.includes("Erro") ? "#FFEBEE" : "#E3F2FD",
                border: `1px solid ${syncStatus.includes("sucesso") ? "#2ECC71" : syncStatus.includes("Erro") ? "#E74C3C" : "#2196F3"}`,
                color: syncStatus.includes("sucesso") ? "#1B5E20" : syncStatus.includes("Erro") ? "#B71C1C" : "#0D47A1",
              }}
            >
              {syncStatus}
            </div>
          )}

          {/* Pending offline queue indicator (when online) */}
          {isOnline && offlineCount > 0 && !syncStatus && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FFF8E1", border: "1px solid #FFC107", color: "#F57F17" }}>
              {offlineCount} venda{offlineCount > 1 ? "s" : ""} pendente{offlineCount > 1 ? "s" : ""} de sincronizacao...
            </div>
          )}

          {/* Banner de edição */}
          {editandoVendaId && (
            <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{ background: "#E3F2FD", border: "1px solid #2196F3" }}>
              <div className="flex items-center gap-2">
                <span className="text-lg">✏️</span>
                <p className="text-sm font-semibold" style={{ color: "#0D47A1" }}>
                  Editando venda de {form.cliente || "..."} — {form.produto || "..."}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditandoVendaId(null);
                  setForm(f => ({ ...f, cliente: "", produto: "", custo: "", preco_vendido: "", forma: "" }));
                  setMsg("");
                }}
                className="text-xs text-red-500 hover:text-red-700 font-semibold"
              >
                Cancelar edicao
              </button>
            </div>
          )}

        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6`}>
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
                className={`w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] resize-none ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`}
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
            <div><p className={labelCls}>Origem</p><select value={form.origem} onChange={(e) => { const v = e.target.value; set("origem", v); if (v === "ATACADO") { set("tipo", "ATACADO"); set("local", "ATACADO"); set("email", "N/A"); set("cep", "00000-000"); set("bairro", ""); set("cidade", ""); set("uf", ""); } }} className={selectCls}>
              <option>ANUNCIO</option><option>RECOMPRA</option><option>INDICACAO</option><option>ATACADO</option><option>ANDRE</option><option>NICOLAS</option><option>BIANCA</option><option>DIRECT</option><option>STORY</option><option>WHATSAPP</option>
            </select></div>
            <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => { set("tipo", e.target.value); if (e.target.value === "ATACADO") { set("origem", "ATACADO"); set("local", "ATACADO"); set("email", "N/A"); set("cep", "00000-000"); set("bairro", ""); set("cidade", ""); set("uf", ""); } else if (form.origem === "ATACADO") { set("origem", "ANUNCIO"); set("local", ""); set("email", ""); set("cep", ""); } }} className={selectCls}>
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
                <div className="relative"><p className={labelCls}>{form.pessoa === "PJ" ? "Razão Social" : "Cliente"}</p><input value={form.cliente} onChange={(e) => { set("cliente", e.target.value.toUpperCase()); setShowClienteSuggestions(true); }} onFocus={() => setShowClienteSuggestions(true)} onBlur={() => setTimeout(() => setShowClienteSuggestions(false), 200)} placeholder={form.pessoa === "PJ" ? "Nome da empresa" : "Nome completo"} className={inputCls} />
                  {/* Dropdown Clientes Recorrentes */}
                  {showClienteSuggestions && clientesRecorrentes.length > 0 && (
                    <div className={`absolute z-50 left-0 right-0 top-full mt-1 border rounded-xl shadow-lg overflow-hidden max-h-[200px] overflow-y-auto ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
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

              {/* Historico do Cliente */}
              {(clienteHistorico || loadingHistorico) && form.cliente.length >= 3 && (
                <div className="bg-[#F5F5F7] border border-[#E0E0E5] rounded-xl px-4 py-3">
                  {loadingHistorico ? (
                    <p className="text-[11px] text-[#86868B]">Buscando historico...</p>
                  ) : clienteHistorico && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-bold text-[#1D1D1F]">
                        {clienteHistorico.nome}
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-[#E8740E]/10 text-[#E8740E] text-[10px] font-semibold">
                          {clienteHistorico.totalCompras} compra{clienteHistorico.totalCompras > 1 ? "s" : ""}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-[#86868B]">
                        <span>Total gasto: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(clienteHistorico.totalGasto)}</strong></span>
                        <span>Ultima compra: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{(() => { const [y, m, d] = (clienteHistorico.ultimaCompraData || "").split("-"); return d && m ? `${d}/${m}/${y}` : clienteHistorico.ultimaCompraData; })()} — {clienteHistorico.ultimaCompraProduto}</strong></span>
                        <span>Ja fez troca: <strong className={clienteHistorico.fezTroca ? "text-purple-600" : "text-[#1D1D1F]"}>{clienteHistorico.fezTroca ? "Sim" : "Nao"}</strong></span>
                        <span>Cliente desde: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{(() => { const [y, m, d] = (clienteHistorico.clienteDesde || "").split("-"); return d && m ? `${d}/${m}/${y}` : clienteHistorico.clienteDesde; })()}</strong></span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Endereço — só PJ */}
              {form.pessoa === "PJ" && (
                <div><p className={labelCls}>Endereço</p><input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Endereço completo" className={inputCls} /></div>
              )}

              {/* CEP + Local */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelCls}>Local</p><select value={form.local} onChange={(e) => set("local", e.target.value)} className={selectCls}>
                  <option value="">—</option><option>ENTREGA</option><option>RETIRADA</option><option>CORREIO</option><option>ATACADO</option>
                </select></div>
                <div>
                  <p className={labelCls}>CEP</p>
                  <input
                    value={form.cep}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 8);
                      if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
                      set("cep", v);
                      if (v.replace(/\D/g, "").length === 8) fetchCep(v);
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 8);
                      if (pasted.length > 0) {
                        let v = pasted;
                        if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
                        set("cep", v);
                        if (pasted.length === 8) fetchCep(pasted);
                      }
                    }}
                    placeholder="00000-000"
                    className={inputCls}
                    maxLength={9}
                  />
                </div>
                {(form.bairro || form.cidade || form.uf || cepLoading) && (
                  <div className="flex items-end">
                    {cepLoading ? (
                      <p className="text-xs text-[#86868B] py-2">Buscando CEP...</p>
                    ) : (
                      <p className="text-xs text-[#1D1D1F] py-2">{form.bairro}{form.bairro && form.cidade ? " — " : ""}{form.cidade}{form.uf ? `/${form.uf}` : ""}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Carrinho — Produtos já adicionados */}
          {produtosCarrinho.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#86868B] uppercase tracking-wider">Produtos no carrinho ({produtosCarrinho.length})</p>
              {produtosCarrinho.map((p, i) => {
                const pCusto = parseFloat(p.custo) || 0;
                const pVendido = parseFloat(p.preco_vendido) || 0;
                const pLucro = pVendido - pCusto;
                return (
                  <div key={i} className="flex items-center justify-between px-4 py-3 bg-[#F5F5F7] border border-[#D2D2D7] rounded-xl">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-[#1D1D1F] truncate block">{p.produto}</span>
                      <span className="text-[10px] text-[#86868B]">
                        {fmt(pCusto)} custo | {fmt(pVendido)} vendido | Lucro: <strong className={pLucro >= 0 ? "text-green-600" : "text-red-500"}>{fmt(pLucro)}</strong>
                        {p.fornecedor && ` | ${p.fornecedor}`}
                        {p.serial_no && ` | SN: ${p.serial_no}`}
                        {p.imei && ` | IMEI: ${p.imei}`}
                      </span>
                    </div>
                    <div className="ml-3 flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleEditFromCart(i)}
                        className="px-2 py-1 rounded-lg text-xs text-blue-500 hover:bg-blue-50 transition-colors"
                        title="Editar produto"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleRemoveFromCart(i)}
                        className="px-2 py-1 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors"
                        title="Remover produto"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Cart summary — totals across all cart products */}
              {(() => {
                const cartTotalCusto = produtosCarrinho.reduce((s, p) => s + (parseFloat(p.custo) || 0), 0);
                const cartTotalVendido = produtosCarrinho.reduce((s, p) => s + (parseFloat(p.preco_vendido) || 0), 0);
                const cartTotalLucro = cartTotalVendido - cartTotalCusto;
                const cartMargem = cartTotalVendido > 0 ? (cartTotalLucro / cartTotalVendido) * 100 : 0;
                return (
                  <div className="px-4 py-2.5 bg-[#1E1208] rounded-xl flex flex-wrap items-center gap-3 text-xs text-white/80">
                    <span>Total custo: <strong className="text-white">{fmt(cartTotalCusto)}</strong></span>
                    <span>Total vendido: <strong className="text-white">{fmt(cartTotalVendido)}</strong></span>
                    <span>Lucro: <strong className={cartTotalLucro >= 0 ? "text-green-400" : "text-red-400"}>{fmt(cartTotalLucro)}</strong></span>
                    <span>Margem: <strong className={cartMargem >= 0 ? "text-green-400" : "text-red-400"}>{cartMargem.toFixed(1)}%</strong></span>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Row 2: Produto */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm font-bold text-[#1D1D1F]">Produto</p>
              <button
                onClick={() => { setScanMode(true); setProdutoManual(false); setScanMsg(""); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${scanMode ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E]"}`}
              >
                📟 Bipar Código
              </button>
              <button
                onClick={() => { setScanMode(false); setProdutoManual(true); setEstoqueId(""); setCatSel(""); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${produtoManual ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E]"}`}
              >
                ✏️ Digitar manual
              </button>
            </div>

            {/* SCAN MODE: Bipar Serial Number */}
            {scanMode && (
              <div className="bg-[#F5F5F7] rounded-xl p-4 space-y-3 border border-[#E5E5EA]">
                <p className="text-xs text-[#86868B] text-center">Bipe o Serial Number da caixa para selecionar o produto</p>
                {scanMsg && <div className={`text-sm px-3 py-2 rounded-lg ${scanMsg.startsWith("✅") ? "bg-green-50 text-green-700 border border-green-200" : scanMsg.startsWith("❌") ? "bg-red-50 text-red-700 border border-red-200" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>{scanMsg}</div>}
                <BarcodeScanner
                  placeholder="Serial Number..."
                  onScan={async (code) => {
                    setScanMsg("🔍 Buscando...");
                    try {
                      const res = await fetch("/api/scan", {
                        method: "POST",
                        headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema", "Content-Type": "application/json" },
                        body: JSON.stringify({ serial_no: code }),
                      });
                      const data = await res.json();

                      if (!data.found) {
                        setScanMsg(`❌ SN "${code}" não cadastrado. Cadastre primeiro em Estoque → Scan.`);
                        return;
                      }

                      if (data.status === "VENDIDO") {
                        setScanMsg(`❌ Produto já vendido: ${data.message}`);
                        return;
                      }

                      if (data.status === "EM_ESTOQUE" && data.produto) {
                        const p = data.produto;
                        const nome = p.cor ? `${p.produto} ${p.cor}` : p.produto;
                        set("produto", nome);
                        set("custo", String(p.custo_unitario || 0));
                        if (p.fornecedor) set("fornecedor", p.fornecedor);
                        if (p.imei) set("imei", p.imei);
                        if (p.serial_no) set("serial_no", p.serial_no);
                        setEstoqueId(p.estoque_id || "");
                        setScanMsg(`✅ ${nome} — Custo: R$ ${Math.round(p.custo_unitario || 0).toLocaleString("pt-BR")}`);
                        setScanMode(false);
                      }
                    } catch {
                      setScanMsg("❌ Erro de conexão");
                    }
                  }}
                />
              </div>
            )}

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
                                        : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border border-[#D2D2D7] text-[#1D1D1F]"} hover:border-[#E8740E] ${dm ? "hover:bg-[#2A1A0F]" : "hover:bg-[#FFF8F0]"}`
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

            {/* Serial No. e IMEI movidos para seção de troca */}

            {/* Limpar formulário — aparece quando tem cliente preenchido após uma venda */}
            {lastClienteData && form.cliente && (
              <button
                onClick={() => {
                  setForm({
                    data: new Date().toISOString().split("T")[0],
                    cliente: "", cpf: "", cnpj: "", email: "", endereco: "", pessoa: "PF", origem: "ANUNCIO", tipo: "VENDA", produto: "", fornecedor: "",
                    custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
                    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
                    entrada_pix: "", banco_pix: "ITAU", entrada_especie: "", banco_2nd: "", banco_alt: "",
                    parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "",
                    troca_produto: "", troca_cor: "", troca_bateria: "", troca_obs: "",
                    troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "",
                    serial_no: "", imei: "",
                    cep: "", bairro: "", cidade: "", uf: "",
                  });
                  setLastClienteData(null);
                  setCatSel("");
                  setEstoqueId("");
                  setProdutoManual(false);
                  setProdutosCarrinho([]);
                  setMsg("");
                }}
                className="w-full py-2 rounded-xl text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
              >
                ✕ Limpar formulário (outro cliente)
              </button>
            )}
            {/* +1 Produto — mesmo cliente, outro produto (quando cliente foi limpo) */}
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
          <div className="grid grid-cols-2 gap-4">
            <div><p className={labelCls}>Custo (R$)</p><input type="number" value={form.custo} onChange={(e) => set("custo", e.target.value)} placeholder="Quanto voce pagou" className={inputCls} /></div>
            <div><p className={labelCls}>Preco Vendido Liquido (R$)</p><input type="number" value={form.preco_vendido} onChange={(e) => set("preco_vendido", e.target.value)} placeholder="Valor que voce recebe" className={inputCls} /></div>
          </div>

          {/* FORMA DE PAGAMENTO — inline only for single product (no cart) */}
          {produtosCarrinho.length === 0 && (
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
                <>
                <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                  <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                </select></div>
                <div><p className={labelCls}>Valor do PIX (R$)</p><input type="number" value={form.valor_comprovante_input} onChange={(e) => {
                  const v = e.target.value;
                  set("valor_comprovante_input", v);
                  // PIX é 100% líquido — preco_vendido = valor PIX + troca + espécie
                  if (produtosCarrinho.length === 0) {
                    const pixVal = parseFloat(v) || 0;
                    if (pixVal > 0) {
                      const totalLiq = Math.round(pixVal + (parseFloat(form.entrada_especie) || 0) + (parseFloat(form.produto_na_troca) || 0));
                      setForm(f => ({ ...f, valor_comprovante_input: v, preco_vendido: String(totalLiq) }));
                    }
                  }
                }} placeholder="Valor transferido" className={inputCls} /></div>
                </>
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
                        // Só auto-calcular preco_vendido se NÃO tem produtos no carrinho (venda simples)
                        if (produtosCarrinho.length === 0) {
                          const compVal = parseFloat(comp) || 0;
                          if (compVal > 0 && taxa > 0) {
                            const liquidoCartao = calcularLiquido(compVal, taxa);
                            const totalLiq = Math.round(liquidoCartao + entradaPix + entradaEspecie + valorTroca);
                            setForm(f => ({ ...f, valor_comprovante_input: comp, preco_vendido: String(totalLiq) }));
                          }
                        }
                      }} placeholder="Valor da maquina" className={inputCls} /></div>
                      <div className="col-span-2 md:col-span-3 bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs text-[#86868B] flex flex-wrap gap-3">
                        <span>Taxa: <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                        {(parseFloat(form.valor_comprovante_input) || 0) > 0 && (
                          <>
                            <span>Liquido cartao: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, taxa))}</strong></span>
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
                <>
                  <div><p className={labelCls}>Parcelas no Link</p><input type="number" value={form.qnt_parcelas} onChange={(e) => set("qnt_parcelas", e.target.value)} placeholder="1" className={inputCls} /></div>
                  {taxa > 0 && (
                    <>
                      <div><p className={labelCls}>Valor no Link (R$)</p><input type="number" value={form.valor_comprovante_input} onChange={(e) => {
                        const comp = e.target.value;
                        set("valor_comprovante_input", comp);
                        if (produtosCarrinho.length === 0) {
                          const compVal = parseFloat(comp) || 0;
                          if (compVal > 0 && taxa > 0) {
                            const liquidoLink = calcularLiquido(compVal, taxa);
                            const totalLiq = Math.round(liquidoLink + entradaPix + entradaEspecie + valorTroca);
                            setForm(f => ({ ...f, valor_comprovante_input: comp, preco_vendido: String(totalLiq) }));
                          }
                        }
                      }} placeholder="Valor total do link" className={inputCls} /></div>
                      <div className="col-span-2 md:col-span-3 bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs text-[#86868B] flex flex-wrap gap-3">
                        <span>Taxa MP: <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                        {(parseFloat(form.valor_comprovante_input) || 0) > 0 && (
                          <>
                            <span>Liquido: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, taxa))}</strong></span>
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
                  {entradaPix > 0 && <span>PIX: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(entradaPix)}</strong></span>}
                  {entradaEspecie > 0 && <span>Especie: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(entradaEspecie)}</strong></span>}
                  {valorTroca > 0 && <span>Troca: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(valorTroca)}</strong></span>}
                  <span>Restante ({form.forma}): <strong className="text-[#E8740E]">{fmt(Math.max(0, valorCartao))}</strong></span>
                </div>
              )}
            </div>
            )}

            {/* Segundo cartao (opcional) */}
            {form.forma === "CARTAO" && (
            <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-[#86868B]">
                <input type="checkbox" checked={!!form.banco_alt} onChange={(e) => {
                  if (!e.target.checked) { set("banco_alt", ""); set("parc_alt", ""); set("band_alt", ""); set("comp_alt", ""); }
                  else { set("banco_alt", "ITAU"); }
                }} className="accent-[#E8740E]" />
                <span className="font-semibold">Cliente pagou com segundo cartao?</span>
              </label>
              {form.banco_alt && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className={labelCls}>Maquina (2o cartao)</p><select value={form.banco_alt} onChange={(e) => set("banco_alt", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                  </select></div>
                  <div><p className={labelCls}>Parcelas</p><input type="number" value={form.parc_alt} onChange={(e) => set("parc_alt", e.target.value)} placeholder="1" className={inputCls} /></div>
                  <div><p className={labelCls}>Bandeira</p><select value={form.band_alt} onChange={(e) => set("band_alt", e.target.value)} className={selectCls}>
                    <option value="">Selecionar</option><option>VISA</option><option>MASTERCARD</option><option>ELO</option><option>AMEX</option>
                  </select></div>
                  <div><p className={labelCls}>Valor no comprovante (R$)</p><input type="number" value={form.comp_alt} onChange={(e) => set("comp_alt", e.target.value)} placeholder="0" className={inputCls} /></div>
                </div>
              )}
            </div>
            )}
          </div>
          )}

          {/* PRODUTO NA TROCA — inline only for single product (no cart) */}
          {produtosCarrinho.length === 0 && (
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
                  <div><p className={labelCls}>Grade</p>
                    <select value={form.troca_grade} onChange={(e) => set("troca_grade", e.target.value)} className={inputCls}>
                      <option value="">Selecione...</option>
                      <option value="A+">A+ (Excelente)</option>
                      <option value="A">A (Ótimo)</option>
                      <option value="B">B (Bom)</option>
                      <option value="C">C (Regular)</option>
                    </select>
                  </div>
                  <div><p className={labelCls}>Caixa original</p>
                    <select value={form.troca_caixa} onChange={(e) => set("troca_caixa", e.target.value)} className={inputCls}>
                      <option value="">Selecione...</option>
                      <option value="SIM">Sim</option>
                      <option value="NAO">Não</option>
                    </select>
                  </div>
                  <div><p className={labelCls}>Cabo original</p>
                    <select value={form.troca_cabo} onChange={(e) => set("troca_cabo", e.target.value)} className={inputCls}>
                      <option value="">Selecione...</option>
                      <option value="SIM">Sim</option>
                      <option value="NAO">Não</option>
                    </select>
                  </div>
                  {/* Fonte original — só para iPad e MacBook */}
                  {(form.troca_produto.toUpperCase().includes("IPAD") || form.troca_produto.toUpperCase().includes("MACBOOK") || form.troca_produto.toUpperCase().includes("MAC")) && (
                    <div><p className={labelCls}>Fonte original</p>
                      <select value={form.troca_fonte} onChange={(e) => set("troca_fonte", e.target.value)} className={inputCls}>
                        <option value="">Selecione...</option>
                        <option value="SIM">Sim</option>
                        <option value="NAO">Não</option>
                      </select>
                    </div>
                  )}
                  <div><p className={labelCls}>Serial No.</p><input value={form.serial_no} onChange={(e) => set("serial_no", e.target.value)} placeholder="Ex: C39XXXXX..." className={inputCls} /></div>
                  <div><p className={labelCls}>IMEI</p><input value={form.imei} onChange={(e) => set("imei", e.target.value)} placeholder="Ex: 35XXXXXXXXXXXXX" className={inputCls} /></div>
                  <div className="col-span-2 md:col-span-3"><p className={labelCls}>Obs do seminovo</p><input value={form.troca_obs} onChange={(e) => set("troca_obs", e.target.value)} placeholder="Detalhes adicionais..." className={inputCls} /></div>
                </>
              )}
            </div>
            {temTroca && <p className="text-xs text-orange-500">O produto na troca será adicionado como PENDENTE (aguardando recebimento)</p>}
          </div>
          )}

          {/* ===== PAGAMENTO + TROCA SEPARADOS (cart mode: produtosCarrinho >= 1) ===== */}
          {produtosCarrinho.length > 0 && (
          <div className="space-y-4">
            <div className="border-t-2 border-[#E8740E] pt-4">
              <p className="text-sm font-bold text-[#1D1D1F] mb-1">Pagamento (para todos os produtos)</p>
              <p className="text-[10px] text-[#86868B] mb-3">Preencha o pagamento uma unica vez — vale para todos os {produtosCarrinho.length} produto{produtosCarrinho.length > 1 ? "s" : ""} no carrinho.</p>
            </div>

            {/* FORMA DE PAGAMENTO — cart mode */}
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
                        }} placeholder="Valor da maquina" className={inputCls} /></div>
                        <div className="col-span-2 md:col-span-3 bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs text-[#86868B] flex flex-wrap gap-3">
                          <span>Taxa: <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                          {(parseFloat(form.valor_comprovante_input) || 0) > 0 && (
                            <>
                              <span>Liquido cartao: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, taxa))}</strong></span>
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
                  <>
                    <div><p className={labelCls}>Parcelas no Link</p><input type="number" value={form.qnt_parcelas} onChange={(e) => set("qnt_parcelas", e.target.value)} placeholder="1" className={inputCls} /></div>
                    {taxa > 0 && (
                      <>
                        <div><p className={labelCls}>Valor no Link (R$)</p><input type="number" value={form.valor_comprovante_input} onChange={(e) => {
                          const comp = e.target.value;
                          set("valor_comprovante_input", comp);
                        }} placeholder="Valor total do link" className={inputCls} /></div>
                        <div className="col-span-2 md:col-span-3 bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs text-[#86868B] flex flex-wrap gap-3">
                          <span>Taxa MP: <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                          {(parseFloat(form.valor_comprovante_input) || 0) > 0 && (
                            <>
                              <span>Liquido: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, taxa))}</strong></span>
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
              </div>

              {/* Pagamento misto — cart mode */}
              {form.forma && form.forma !== "FIADO" && (
              <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
                <p className="text-xs text-[#86868B] font-semibold">Pagamento misto? (combine valores abaixo)</p>

                {/* Entrada PIX */}
                {form.forma !== "PIX" && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><p className={labelCls}>Entrada PIX (R$)</p><input type="number" value={form.entrada_pix} onChange={(e) => {
                    const v = e.target.value;
                    setForm(f => ({ ...f, entrada_pix: v }));
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
                    setForm(f => ({ ...f, entrada_especie: v }));
                  }} placeholder="0" className={inputCls} /></div>
                </div>
                )}

                {/* Resumo misto */}
                {(entradaPix > 0 || entradaEspecie > 0) && (
                  <div className="bg-[#F5F5F7] rounded-lg px-3 py-2 text-xs text-[#86868B] flex flex-wrap gap-3">
                    {entradaPix > 0 && <span>PIX: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(entradaPix)}</strong></span>}
                    {entradaEspecie > 0 && <span>Especie: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(entradaEspecie)}</strong></span>}
                    {valorTroca > 0 && <span>Troca: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(valorTroca)}</strong></span>}
                    <span>Restante ({form.forma}): <strong className="text-[#E8740E]">{fmt(Math.max(0, valorCartao))}</strong></span>
                  </div>
                )}
              </div>
              )}

              {/* Segundo cartao (opcional) — cart mode */}
              {form.forma === "CARTAO" && (
              <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-[#86868B]">
                  <input type="checkbox" checked={!!form.banco_alt} onChange={(e) => {
                    if (!e.target.checked) { set("banco_alt", ""); set("parc_alt", ""); set("band_alt", ""); set("comp_alt", ""); }
                    else { set("banco_alt", "ITAU"); }
                  }} className="accent-[#E8740E]" />
                  <span className="font-semibold">Cliente pagou com segundo cartao?</span>
                </label>
                {form.banco_alt && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className={labelCls}>Maquina (2o cartao)</p><select value={form.banco_alt} onChange={(e) => set("banco_alt", e.target.value)} className={selectCls}>
                      <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                    </select></div>
                    <div><p className={labelCls}>Parcelas</p><input type="number" value={form.parc_alt} onChange={(e) => set("parc_alt", e.target.value)} placeholder="1" className={inputCls} /></div>
                    <div><p className={labelCls}>Bandeira</p><select value={form.band_alt} onChange={(e) => set("band_alt", e.target.value)} className={selectCls}>
                      <option value="">Selecionar</option><option>VISA</option><option>MASTERCARD</option><option>ELO</option><option>AMEX</option>
                    </select></div>
                    <div><p className={labelCls}>Valor no comprovante (R$)</p><input type="number" value={form.comp_alt} onChange={(e) => set("comp_alt", e.target.value)} placeholder="0" className={inputCls} /></div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* PRODUTO NA TROCA — cart mode */}
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
                    <div><p className={labelCls}>Cor</p><input value={form.troca_cor} onChange={(e) => set("troca_cor", e.target.value)} placeholder="Ex: Titânio Natural" className={inputCls} /></div>
                    <div><p className={labelCls}>Bateria (%)</p><input type="number" value={form.troca_bateria} onChange={(e) => set("troca_bateria", e.target.value)} placeholder="Ex: 87" className={inputCls} /></div>
                    <div><p className={labelCls}>Grade</p><select value={form.troca_grade} onChange={(e) => set("troca_grade", e.target.value)} className={selectCls}>
                      <option value="">Selecionar</option><option value="A+">A+ (Impecável)</option><option value="A">A (Ótimo)</option><option value="B">B (Bom)</option><option value="C">C (Marcas visíveis)</option>
                    </select></div>
                    <div className="flex gap-3 items-center">
                      <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_caixa === "SIM"} onChange={(e) => set("troca_caixa", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Caixa</label>
                      <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_cabo === "SIM"} onChange={(e) => set("troca_cabo", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Cabo</label>
                      <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_fonte === "SIM"} onChange={(e) => set("troca_fonte", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Fonte</label>
                    </div>
                    <div><p className={labelCls}>Serial No.</p><input value={form.serial_no} onChange={(e) => set("serial_no", e.target.value)} placeholder="Ex: C39XXXXX..." className={inputCls} /></div>
                    <div><p className={labelCls}>IMEI</p><input value={form.imei} onChange={(e) => set("imei", e.target.value)} placeholder="Ex: 35XXXXXXXXXXXXX" className={inputCls} /></div>
                    <div className="col-span-2 md:col-span-3"><p className={labelCls}>Obs do seminovo</p><input value={form.troca_obs} onChange={(e) => set("troca_obs", e.target.value)} placeholder="Detalhes adicionais..." className={inputCls} /></div>
                  </>
                )}
              </div>
              {temTroca && <p className="text-xs text-orange-500">O produto na troca será adicionado como PENDENTE (aguardando recebimento)</p>}
            </div>
          </div>
          )}

          {/* Botão Adicionar Produto ao Carrinho — sempre visível quando tem cliente */}
          {form.cliente && (
            <button
              onClick={handleAddToCart}
              disabled={!form.produto}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm ${
                form.produto
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              }`}
            >
              {produtosCarrinho.length > 0
                ? `+ Adicionar Produto ${produtosCarrinho.length + 1} ao Carrinho`
                : "+ Adicionar Produto ao Carrinho"}
            </button>
          )}

          {/* Preview — combined totals for all products (cart + current form) */}
          {(() => {
            // Aggregate all products: cart + current form product (if any)
            const allProds = [...produtosCarrinho];
            if (form.produto && form.custo) {
              allProds.push(getCurrentProductFields());
            }
            const totalCusto = allProds.reduce((s, p) => s + (parseFloat(p.custo) || 0), 0);
            const totalVendido = allProds.reduce((s, p) => s + (parseFloat(p.preco_vendido) || 0), 0);
            // Se tem comprovante e taxa, calcular o líquido real
            const gComp = parseFloat(form.valor_comprovante_input) || 0;
            const gCompAlt = parseFloat(form.comp_alt) || 0;
            const gPixE = parseFloat(form.entrada_pix) || 0;
            const gEspecieE = parseFloat(form.entrada_especie) || 0;
            const gTrocaE = parseFloat(form.produto_na_troca) || 0;
            // Receita real = líquido cartão principal + líquido cartão alt + pix + espécie + troca
            let receitaReal = totalVendido; // fallback: soma dos preços vendidos
            if (gComp > 0 && taxa > 0) {
              const liqPrincipal = calcularLiquido(gComp, taxa);
              const taxaAlt = gCompAlt > 0 ? getTaxa(form.banco_alt || "ITAU", form.band_alt || null, parseInt(form.parc_alt) || 0, "CARTAO") : 0;
              const liqAlt = gCompAlt > 0 && taxaAlt > 0 ? calcularLiquido(gCompAlt, taxaAlt) : 0;
              receitaReal = liqPrincipal + liqAlt + gPixE + gEspecieE + gTrocaE;
            }
            const totalLucroAll = receitaReal - totalCusto;
            const totalMargemAll = receitaReal > 0 ? (totalLucroAll / receitaReal) * 100 : 0;

            // Conferencia: comprovante + pix + especie + troca should roughly match total vendido
            const gComprovante = parseFloat(form.valor_comprovante_input) || 0;
            const gPix = parseFloat(form.entrada_pix) || 0;
            const gEspecie = parseFloat(form.entrada_especie) || 0;
            const gTroca = parseFloat(form.produto_na_troca) || 0;
            const somaFormas = gComprovante + gPix + gEspecie + gTroca;
            // Only check conferencia if at least one payment field is filled
            const temConferencia = somaFormas > 0 && totalVendido > 0;
            const diffConferencia = Math.abs(somaFormas - totalVendido);
            const confOk = diffConferencia <= Math.max(totalVendido * 0.02, 50); // 2% tolerance or R$50

            return (
              <div className="p-4 bg-gradient-to-r from-[#1E1208] to-[#2A1A0F] rounded-xl text-white">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
                  <div>
                    <p className="text-xs text-white/60">{allProds.length > 1 ? "Lucro Total" : "Lucro"}</p>
                    <p className={`text-lg font-bold ${totalLucroAll >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt(totalLucroAll)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-white/60">Margem</p>
                    <p className={`text-lg font-bold ${totalMargemAll >= 0 ? "text-green-400" : "text-red-400"}`}>{totalMargemAll.toFixed(1)}%</p>
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
                {allProds.length > 1 && (
                  <div className="mt-3 pt-3 border-t border-white/20 text-xs text-white/70 text-center">
                    <span>Total vendido: <strong className="text-white">{fmt(totalVendido)}</strong></span>
                    <span className="mx-2">|</span>
                    <span>Total custo: <strong className="text-white">{fmt(totalCusto)}</strong></span>
                    <span className="mx-2">|</span>
                    <span>{allProds.length} produtos</span>
                  </div>
                )}
                {(temTroca || temEntradaPix) && (
                  <div className="mt-3 pt-3 border-t border-white/20 text-xs text-white/70 text-center">
                    {temTroca && <span>Troca: {fmt(valorTroca)} </span>}
                    {temEntradaPix && <span>+ PIX: {fmt(entradaPix)} ({form.banco_pix}) </span>}
                    {temCartao && valorCartao > 0 && <span>+ {form.forma === "LINK" ? "Link MP" : `Cartao ${form.banco}`}: {fmt(valorCartao)}</span>}
                  </div>
                )}
                {temConferencia && (
                  <div className={`mt-2 pt-2 border-t border-white/10 text-xs text-center ${confOk ? "text-green-400" : "text-yellow-400"}`}>
                    {confOk ? "Conferencia OK" : `Conferencia: soma formas (${fmt(somaFormas)}) != total vendido (${fmt(totalVendido)}) — diferenca: ${fmt(diffConferencia)}`}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {saving ? "Salvando..." : editandoVendaId ? "Salvar Alteracoes" : produtosCarrinho.length > 0 ? `Registrar ${produtosCarrinho.length + (form.produto ? 1 : 0)} Vendas` : "Registrar Venda"}
            </button>
            {form.cliente && (
              <button
                onClick={() => {
                  setForm((f) => ({ ...f, cliente: "", cpf: "", cnpj: "", email: "", endereco: "", pessoa: "PF" as "PF" | "PJ", cep: "", bairro: "", cidade: "", uf: "", local: "" }));
                  setLastClienteData(null);
                }}
                className="px-4 py-3 rounded-xl border border-[#D2D2D7] text-[#86868B] text-sm hover:bg-[#F5F5F7] transition-colors"
              >
                Limpar
              </button>
            )}
          </div>
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
            <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
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
                <div className="flex gap-3 items-center text-xs text-[#86868B]">
                  <span>{filtered.length} vendas</span>
                  {selecionadas.size > 0 && (
                    <div className="flex gap-2">
                      {tab === "andamento" && (
                        <button
                          disabled={finalizandoLote}
                          onClick={async () => {
                            if (!confirm(`Finalizar ${selecionadas.size} venda(s) selecionada(s)?`)) return;
                            setFinalizandoLote(true);
                            let ok = 0;
                            for (const id of selecionadas) {
                              try {
                                await fetch("/api/vendas", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "admin" },
                                  body: JSON.stringify({ id, status_pagamento: "FINALIZADO" }),
                                });
                                ok++;
                              } catch {}
                            }
                            setVendas(prev => prev.map(v => selecionadas.has(v.id) ? { ...v, status_pagamento: "FINALIZADO" } : v));
                            setSelecionadas(new Set());
                            setFinalizandoLote(false);
                            setMsg(`${ok} venda(s) finalizada(s) com sucesso!`);
                          }}
                          className="px-4 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors"
                        >
                          {finalizandoLote ? "Finalizando..." : `✅ Finalizar ${selecionadas.size} selecionada(s)`}
                        </button>
                      )}
                      {(tab === "finalizadas" || tab === "hoje") && (
                        <button
                          disabled={finalizandoLote}
                          onClick={async () => {
                            if (!confirm(`Mover ${selecionadas.size} venda(s) para Pendentes?`)) return;
                            setFinalizandoLote(true);
                            let ok = 0;
                            for (const id of selecionadas) {
                              try {
                                await fetch("/api/vendas", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "admin" },
                                  body: JSON.stringify({ id, status_pagamento: "AGUARDANDO" }),
                                });
                                ok++;
                              } catch {}
                            }
                            setVendas(prev => prev.map(v => selecionadas.has(v.id) ? { ...v, status_pagamento: "AGUARDANDO" } : v));
                            setSelecionadas(new Set());
                            setFinalizandoLote(false);
                            setMsg(`${ok} venda(s) movida(s) para Pendentes!`);
                          }}
                          className="px-4 py-1.5 rounded-lg bg-yellow-500 text-white font-semibold hover:bg-yellow-600 transition-colors"
                        >
                          {finalizandoLote ? "Movendo..." : `⏳ Mover ${selecionadas.size} para Pendentes`}
                        </button>
                      )}
                    </div>
                  )}
                  {(tab === "finalizadas" || tab === "hoje") && filtered.length > 0 && (
                    <>
                      <span>Vendido: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(totalVendido)}</strong></span>
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
                        {(tab === "andamento" || tab === "finalizadas" || tab === "hoje") && (
                          <th className="px-3 py-3 w-8">
                            <input
                              type="checkbox"
                              checked={filtered.length > 0 && selecionadas.size === filtered.length}
                              onChange={() => {
                                if (selecionadas.size === filtered.length) setSelecionadas(new Set());
                                else setSelecionadas(new Set(filtered.map(v => v.id)));
                              }}
                              className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                            />
                          </th>
                        )}
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
                          pagParts.push(`${v.banco} ${v.qnt_parcelas}x${v.bandeira ? ` ${v.bandeira}` : ""}${v.valor_comprovante ? ` (${fmt(v.valor_comprovante)})` : ""}`);
                        } else if (v.banco === "MERCADO_PAGO" && !temEntrada && !valorTrocaV) {
                          pagParts.push(`Link MP${v.qnt_parcelas ? ` ${v.qnt_parcelas}x` : ""}`);
                        } else if (!temEntrada && !valorTrocaV) {
                          pagParts.push(`${v.forma} ${v.banco}`);
                        }
                        if (v.banco_alt) {
                          pagParts.push(`2o: ${v.banco_alt} ${v.parc_alt || 0}x${v.band_alt ? ` ${v.band_alt}` : ""}${v.comp_alt ? ` (${fmt(v.comp_alt)})` : ""}`);
                        }

                        return (
                          <React.Fragment key={v.id}>
                            <tr
                              className={`border-b border-[#F5F5F7] hover:bg-[#F5F5F7] transition-colors cursor-pointer ${isExpanded ? "bg-[#F5F5F7]" : ""} ${selecionadas.has(v.id) ? "bg-[#E8740E]/10 dark:bg-[#E8740E]/15" : ""}`}
                              onClick={() => setExpandedId(isExpanded ? null : v.id)}
                            >
                              {(tab === "andamento" || tab === "finalizadas" || tab === "hoje") && (
                                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={selecionadas.has(v.id)}
                                    onChange={() => {
                                      setSelecionadas(prev => {
                                        const next = new Set(prev);
                                        if (next.has(v.id)) next.delete(v.id);
                                        else next.add(v.id);
                                        return next;
                                      });
                                    }}
                                    className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                                  />
                                </td>
                              )}
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
                                                // Lucro = total real recebido - custo (preco_vendido já é o total real)
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
                                                  valor_comprovante: parseFloat(ef.valor_comprovante) || null,
                                                  banco_alt: ef.banco_alt || null,
                                                  parc_alt: parseInt(ef.parc_alt) || null,
                                                  band_alt: ef.band_alt || null,
                                                  comp_alt: parseFloat(ef.comp_alt) || null,
                                                };
                                                const res = await fetch("/api/vendas", {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
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
                                            <input value={ef.cliente} onChange={e => setEf("cliente", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Produto</span>
                                            <input value={ef.produto} onChange={e => setEf("produto", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Custo</span>
                                            <input type="number" value={ef.custo} onChange={e => setEf("custo", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Preço Vendido</span>
                                            <input type="number" value={ef.preco_vendido} onChange={e => setEf("preco_vendido", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Banco</span>
                                            <select value={ef.banco} onChange={e => setEf("banco", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
                                              <option value="ITAU">ITAU</option>
                                              <option value="INFINITE">INFINITE</option>
                                              <option value="MERCADO_PAGO">MERCADO PAGO</option>
                                              <option value="ESPECIE">ESPECIE</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Forma</span>
                                            <select value={ef.forma} onChange={e => setEf("forma", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
                                              <option value="PIX">PIX</option>
                                              <option value="CARTAO">CARTAO</option>
                                              <option value="ESPECIE">ESPECIE</option>
                                              <option value="FIADO">FIADO</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Recebimento</span>
                                            <select value={ef.recebimento} onChange={e => setEf("recebimento", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
                                              <option value="D+0">D+0</option>
                                              <option value="D+1">D+1</option>
                                              <option value="FIADO">FIADO</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Parcelas</span>
                                            <input type="number" value={ef.qnt_parcelas} onChange={e => setEf("qnt_parcelas", e.target.value)} placeholder="—" className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Bandeira</span>
                                            <select value={ef.bandeira} onChange={e => setEf("bandeira", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
                                              <option value="">—</option>
                                              <option value="VISA">VISA</option>
                                              <option value="MASTERCARD">MASTERCARD</option>
                                              <option value="ELO">ELO</option>
                                              <option value="AMEX">AMEX</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Entrada PIX</span>
                                            <input type="number" value={ef.entrada_pix} onChange={e => setEf("entrada_pix", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Banco PIX</span>
                                            <select value={ef.banco_pix} onChange={e => setEf("banco_pix", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
                                              <option value="">—</option>
                                              <option value="ITAU">ITAU</option>
                                              <option value="INFINITE">INFINITE</option>
                                              <option value="MERCADO_PAGO">MERCADO PAGO</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Entrada Especie</span>
                                            <input type="number" value={ef.entrada_especie} onChange={e => setEf("entrada_especie", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Valor Troca</span>
                                            <input type="number" value={ef.produto_na_troca} onChange={e => setEf("produto_na_troca", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                        </div>
                                        {/* 2o Cartao — edição */}
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">2o Banco</span>
                                            <select value={ef.banco_alt} onChange={e => setEf("banco_alt", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
                                              <option value="">—</option>
                                              <option value="ITAU">ITAU</option>
                                              <option value="INFINITE">INFINITE</option>
                                              <option value="MERCADO_PAGO">MERCADO PAGO</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">2o Parcelas</span>
                                            <input type="number" value={ef.parc_alt} onChange={e => setEf("parc_alt", e.target.value)} placeholder="—" className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">2o Bandeira</span>
                                            <select value={ef.band_alt} onChange={e => setEf("band_alt", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}>
                                              <option value="">—</option>
                                              <option value="VISA">VISA</option>
                                              <option value="MASTERCARD">MASTERCARD</option>
                                              <option value="ELO">ELO</option>
                                              <option value="AMEX">AMEX</option>
                                            </select>
                                          </label>
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">2o Comprovante</span>
                                            <input type="number" value={ef.comp_alt} onChange={e => setEf("comp_alt", e.target.value)} placeholder="R$" className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
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
                                                }} placeholder="Valor da maquina" className={`w-full px-2 py-1.5 border border-[#E8740E] rounded-lg text-xs ${dm ? "bg-[#2C2C2E] text-[#F5F5F7]" : "bg-white"}`} />
                                              </label>
                                              <div className="col-span-1 md:col-span-3 flex items-end">
                                                <div className="bg-[#F5F5F7] rounded-lg px-3 py-2 text-[10px] text-[#86868B] flex flex-wrap gap-2 w-full">
                                                  <span>Taxa: <strong className="text-[#E8740E]">{efTaxa.toFixed(2)}%</strong></span>
                                                  {(parseFloat(ef.valor_comprovante) || 0) > 0 && (
                                                    <>
                                                      <span>Liq: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(calcularLiquido(parseFloat(ef.valor_comprovante) || 0, efTaxa))}</strong></span>
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
                                        {v.produto_na_troca && parseFloat(v.produto_na_troca) > 0 && (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            try {
                                              const hoje = new Date().toLocaleDateString("pt-BR");
                                              const vx = v as unknown as Record<string, unknown>;
                                              const res = await fetch("/api/admin/contrato", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                  clienteNome: v.cliente,
                                                  clienteTelefone: "—",
                                                  aparelhoModelo: (vx.troca_produto as string) || "Aparelho na troca",
                                                  aparelhoStorage: "",
                                                  aparelhoIMEI: v.imei || undefined,
                                                  condicao: "Conforme avaliação presencial",
                                                  valorAvaliado: parseFloat(v.produto_na_troca || "0"),
                                                  novoModelo: v.produto,
                                                  novoStorage: "",
                                                  novoCor: "—",
                                                  novoPreco: v.preco_vendido,
                                                  diferenca: v.preco_vendido - parseFloat(v.produto_na_troca || "0"),
                                                  formaPagamento: v.forma + (v.qnt_parcelas ? ` ${v.qnt_parcelas}x` : ""),
                                                  data: hoje,
                                                  validade: "24 horas",
                                                }),
                                              });
                                              if (!res.ok) throw new Error("Erro");
                                              const blob = await res.blob();
                                              const url = URL.createObjectURL(blob);
                                              const a = document.createElement("a");
                                              a.href = url;
                                              a.download = `contrato_${v.cliente.replace(/\s+/g, "_").toLowerCase()}.pdf`;
                                              document.body.appendChild(a);
                                              a.click();
                                              document.body.removeChild(a);
                                              URL.revokeObjectURL(url);
                                            } catch { alert("Erro ao gerar contrato"); }
                                          }}
                                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors"
                                        >
                                          📄 Contrato
                                        </button>
                                        )}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            // Preencher formulário Nova Venda com dados da venda para edição completa
                                            setForm({
                                              data: v.data || new Date().toISOString().split("T")[0],
                                              cliente: v.cliente,
                                              cpf: v.cpf || "",
                                              cnpj: v.cnpj || "",
                                              email: v.email || "",
                                              endereco: v.endereco || "",
                                              pessoa: (v.pessoa === "PJ" ? "PJ" : "PF") as "PF" | "PJ",
                                              origem: v.origem || "ANUNCIO",
                                              tipo: v.tipo || "VENDA",
                                              produto: v.produto,
                                              fornecedor: v.fornecedor || "",
                                              custo: String(v.custo || ""),
                                              preco_vendido: String(v.preco_vendido || ""),
                                              valor_comprovante_input: String(v.valor_comprovante || ""),
                                              banco: v.banco || "ITAU",
                                              forma: v.forma || "",
                                              qnt_parcelas: String(v.qnt_parcelas || ""),
                                              bandeira: v.bandeira || "",
                                              local: v.local || "",
                                              produto_na_troca: String(v.produto_na_troca || ""),
                                              entrada_pix: String(v.entrada_pix || ""),
                                              banco_pix: v.banco_pix || "ITAU",
                                              entrada_especie: String(v.entrada_especie || ""),
                                              banco_2nd: v.banco_2nd || "",
                                              banco_alt: v.banco_alt || "",
                                              parc_alt: String(v.parc_alt || ""),
                                              band_alt: v.band_alt || "",
                                              comp_alt: String(v.comp_alt || ""),
                                              sinal_antecipado: String(v.sinal_antecipado || ""),
                                              banco_sinal: v.banco_sinal || "",
                                              troca_produto: "",
                                              troca_cor: "",
                                              troca_bateria: "",
                                              troca_obs: "",
                                              troca_grade: "",
                                              troca_caixa: "",
                                              troca_cabo: "",
                                              troca_fonte: "",
                                              serial_no: v.serial_no || "",
                                              imei: v.imei || "",
                                              cep: v.cep || "",
                                              bairro: v.bairro || "",
                                              cidade: v.cidade || "",
                                              uf: v.uf || "",
                                            });
                                            setProdutoManual(true);
                                            setProdutosCarrinho([]);
                                            setEditandoVendaId(v.id);
                                            setTab("nova");
                                            window.scrollTo({ top: 0, behavior: "smooth" });
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
                                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
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
                                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
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
                                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
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

                                    {/* Split de Pagamento Visual */}
                                    {(() => {
                                      const pixVal = v.entrada_pix || 0;
                                      const especieVal = v.entrada_especie || 0;
                                      const trocaVal = v.produto_na_troca ? parseFloat(String(v.produto_na_troca)) || 0 : 0;
                                      const totalVenda = v.preco_vendido || 0;
                                      // Cartao = total minus other payment methods
                                      const cartaoVal = Math.max(0, totalVenda - pixVal - especieVal - trocaVal);
                                      const parts = [
                                        { label: "PIX", value: pixVal, color: "bg-green-500", textColor: "text-green-600" },
                                        { label: "Cartao", value: cartaoVal, color: "bg-blue-500", textColor: "text-blue-600" },
                                        { label: "Especie", value: especieVal, color: "bg-[#E8740E]", textColor: "text-[#E8740E]" },
                                        { label: "Troca", value: trocaVal, color: "bg-purple-500", textColor: "text-purple-600" },
                                      ].filter(p => p.value > 0);
                                      if (parts.length < 2) return null;
                                      return (
                                        <div className="md:col-span-3 space-y-2">
                                          <h4 className="text-xs font-bold text-[#86868B] uppercase">Composicao do Pagamento</h4>
                                          {/* Stacked bar */}
                                          <div className="flex h-5 rounded-lg overflow-hidden w-full max-w-[300px]" title={parts.map(p => `${p.label}: ${fmt(p.value)} (${totalVenda > 0 ? Math.round((p.value / totalVenda) * 100) : 0}%)`).join(" | ")}>
                                            {parts.map((p, i) => (
                                              <div
                                                key={i}
                                                className={`${p.color} relative group flex items-center justify-center transition-all`}
                                                style={{ width: `${totalVenda > 0 ? (p.value / totalVenda) * 100 : 0}%` }}
                                              >
                                                {(p.value / totalVenda) * 100 >= 15 && (
                                                  <span className="text-white text-[9px] font-bold">{Math.round((p.value / totalVenda) * 100)}%</span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                          {/* Legend */}
                                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[#86868B]">
                                            {parts.map((p, i) => (
                                              <span key={i}>
                                                <span className={`inline-block w-2 h-2 rounded-sm ${p.color} mr-1`}></span>
                                                {p.label}: <strong className={p.textColor}>{fmt(p.value)}</strong> ({Math.round((p.value / totalVenda) * 100)}%)
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* Produto na troca */}
                                    {(() => {
                                      const vx = v as unknown as Record<string, string | number | null>;
                                      const tProd = vx.troca_produto ? String(vx.troca_produto) : "";
                                      const tCor = vx.troca_cor ? String(vx.troca_cor) : "";
                                      const tBat = vx.troca_bateria ? String(vx.troca_bateria) : "";
                                      const tObs = vx.troca_obs ? String(vx.troca_obs) : "";
                                      const tValor = vx.produto_na_troca ? Number(vx.produto_na_troca) : 0;
                                      if (!tProd && !tValor) return null;
                                      return (
                                        <div className="space-y-2">
                                          <h4 className="text-xs font-bold text-[#86868B] uppercase">🔄 Produto na Troca</h4>
                                          <div className="text-xs space-y-1 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                            {tProd && <p><strong>Modelo:</strong> {tProd}</p>}
                                            {tCor && <p><strong>Cor:</strong> {tCor}</p>}
                                            {tBat && <p><strong>Bateria:</strong> {tBat}%</p>}
                                            {v.serial_no && <p><strong>Serial No.:</strong> {v.serial_no}</p>}
                                            {v.imei && <p><strong>IMEI:</strong> {v.imei}</p>}
                                            {tValor > 0 && <p><strong>Valor da troca:</strong> R$ {tValor.toLocaleString("pt-BR")}</p>}
                                            {tObs && <p><strong>Obs:</strong> {tObs}</p>}
                                          </div>
                                        </div>
                                      );
                                    })()}

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
                                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
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
                                                  headers: { "x-admin-password": password, "x-admin-user": user?.nome || "sistema" },
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
