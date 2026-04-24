"use client";
import { hojeBR } from "@/lib/date-utils";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { getTaxa, calcularBruto, calcularLiquido, calcularRecebimento } from "@/lib/taxas";
import { useTabParam } from "@/lib/useTabParam";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { useAutoRefetch } from "@/lib/useAutoRefetch";
import { addToQueue, getQueue, removeFromQueue, getQueueCount } from "@/lib/offline-queue";
import type { Venda } from "@/lib/admin-types";
import { corParaPT, normalizarCoresNoTexto } from "@/lib/cor-pt";
import { getModeloBase } from "@/lib/produto-display";
import { useVendedores } from "@/lib/vendedores";
import BarcodeScanner from "@/components/BarcodeScanner";
import ProdutoSpecFields, { createEmptyProdutoRow, type ProdutoRowState } from "@/components/admin/ProdutoSpecFields";
import { SkuFilterBanner, useSkuFilter } from "@/components/admin/SkuFilterBanner";

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const VENDAS_PASSWORD = "tigrao$vendas";

// Display do produto da venda: pega a chave "base" do getModeloBase (que inclui
// storage/tela/RAM+SSD conforme categoria) e anexa a cor PT. Para acessorios
// resolve o caso "MAGIC KEYBOARD IPAD PRO M4" vindo puro no v.produto e
// aparecendo sem tela/cor — aqui enriquece com v.observacao ([TELA:X"]) e v.cor.
function buildProdutoDisplay(v: Venda): string {
  const base = getModeloBase(v.produto || "", v.categoria || "", v.observacao);
  const cor = v.cor ? corParaPT(v.cor) : "";
  const corValida = cor && cor !== "—" ? cor : "";
  if (corValida && !base.toUpperCase().includes(corValida.toUpperCase())) {
    return `${base} ${corValida}`;
  }
  return base;
}

// Formata a resposta de erro do backend quando SKU do estoque selecionado
// nao bate com o SKU esperado pela venda (cliente pediu produto diferente).
// Retorna string multilinha pronta pra setMsg.
interface SkuDivergencia {
  codigo?: string;
  error?: string;
  produto_venda?: string;
  produto_estoque?: string;
  diferencas?: Array<{ campo: string; esperado: string; selecionado: string }>;
  esperado?: string;
  selecionado?: string;
}

function formatSkuDivergenciaMsg(json: SkuDivergencia): string {
  if (json?.codigo !== "SKU_DIVERGENTE") {
    return json?.error || "erro desconhecido";
  }
  const diffs = (json.diferencas || [])
    .map((d) => `• ${d.campo}: ${d.esperado} → ${d.selecionado}`)
    .join("\n");
  // Temporario: texto de ALERTA em vez de "bloqueada" — andre pediu pra liberar
  // registro via botao "Registrar mesmo assim" ate ajustes finos do sistema SKU
  // (acessorios cadastrados com categoria errada disparam falso-positivo).
  return [
    "⚠️ ALERTA — produto não bate 100% com o pedido",
    "",
    `Cliente pediu:    ${json.produto_venda || "?"}`,
    `Você selecionou:  ${json.produto_estoque || "?"}`,
    "",
    "Diverge em:",
    diffs || `• SKU diferente (${json.esperado} ≠ ${json.selecionado})`,
    "",
    "Revise a seleção. Se realmente é o produto certo, clique em “Registrar mesmo assim”.",
  ].join("\n");
}

// Formata N divergencias de uma vez quando o carrinho tem multiplos produtos e
// mais de um diverge. Evita que o admin precise salvar 3x pra ver 3 alertas —
// lista tudo junto pra ele revisar de uma vez so.
function formatSkuDivergenciasMultiplas(erros: SkuDivergencia[]): string {
  if (erros.length === 0) return "";
  if (erros.length === 1) return formatSkuDivergenciaMsg(erros[0]);

  const linhas = [
    `⚠️ ALERTA — ${erros.length} produtos não batem 100%`,
    "",
  ];
  erros.forEach((e, idx) => {
    const diffs = (e.diferencas || [])
      .map((d) => `   • ${d.campo}: ${d.esperado} → ${d.selecionado}`)
      .join("\n");
    linhas.push(
      `${idx + 1}) ${e.produto_venda || "?"}`,
      `   → Você vinculou: ${e.produto_estoque || "?"}`,
      diffs || `   • SKU diferente`,
      "",
    );
  });
  linhas.push("Revise cada um. Se estiver tudo certo, clique em “Registrar mesmo assim”.");
  return linhas.join("\n");
}

export default function VendasPage() {
  const { password, user, darkMode } = useAdmin();
  const skuFilter = useSkuFilter();
  // SKU override: quando backend retorna 409 SKU_DIVERGENTE, em vez de bloquear
  // a venda exibe alerta com botao "Registrar mesmo assim". Se usuario clicar,
  // seta a ref e chama handleSubmit de novo com flag _sku_override=true.
  const skuOverrideRef = useRef(false);
  const [skuAlertaAtivo, setSkuAlertaAtivo] = useState(false);
  const vendedoresList = useVendedores(password);
  const dm = darkMode;
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [termosPorVenda, setTermosPorVenda] = useState<Record<string, { id: string; status: string; zapsign_sign_url?: string | null; signed_pdf_url?: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const VENDAS_TABS = ["nova", "formularios", "andamento", "programadas", "hoje", "finalizadas", "correios"] as const;
  const [tab, setTab] = useTabParam<"nova" | "formularios" | "andamento" | "programadas" | "hoje" | "finalizadas" | "correios">("nova", VENDAS_TABS);
  // Filtro de pendencias (NF nao anexada/enviada, Termo nao assinado)
  const [pendenciaFilter, setPendenciaFilter] = useState<"nf" | "termo" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reajusteId, setReajusteId] = useState<string | null>(null);
  const [encaminharVenda, setEncaminharVenda] = useState<Venda | null>(null);
  const [reajForm, setReajForm] = useState({ valor: "", motivo: "", banco: "ITAU", forma: "PIX", observacao: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editandoVendaId, setEditandoVendaId] = useState<string | null>(null);
  // Guarda o estoque_id original da venda ao entrar em modo edição.
  // Usado pra detectar se o admin trocou o produto (mesmo digitando manualmente
  // sem vincular novo item do estoque). Permite devolver o antigo ao estoque.
  const [estoqueIdOriginal, setEstoqueIdOriginal] = useState<string | null>(null);
  // Guarda o status_pagamento ORIGINAL da venda em edicao. Sem isso,
  // buildPayload defaulta pra "AGUARDANDO" e edicoes (ex: trocar forma de
  // pagamento) jogam a venda finalizada de volta pra "em andamento" —
  // disparando reenvio de NF/Telegram na proxima finalizacao.
  const [statusPagamentoOriginal, setStatusPagamentoOriginal] = useState<string | null>(null);
  const [vendaProgramada, setVendaProgramada] = useState(false);
  const [programadaJaPago, setProgramadaJaPago] = useState(false);
  const [programadaComSinal, setProgramadaComSinal] = useState(false);
  const [dataProgramada, setDataProgramada] = useState("");
  const [editandoGrupoIds, setEditandoGrupoIds] = useState<string[]>([]);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);
  // Inline payment form state (vendas programadas)
  const [pagFormId, setPagFormId] = useState<string | null>(null);
  const [pagForm, setPagForm] = useState({ valor: "", data: hojeBR(), forma: "PIX", banco: "ITAU", parcelas: "", bandeira: "", obs: "" });
  // Multi-date payment mode (registrar venda com pagamentos em datas diferentes)
  const [multiDatePagamento, setMultiDatePagamento] = useState(false);
  const [pagEntries, setPagEntries] = useState<{ data: string; valor: string; forma: string; banco: string; parcelas: string; bandeira: string; obs: string }[]>([]);
  const [vendasUnlocked, setVendasUnlocked] = useState(false);
  const [vendasPw, setVendasPw] = useState("");
  const [vendasPwError, setVendasPwError] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [exportandoDia, setExportandoDia] = useState(false);
  const { isOnline } = useOnlineStatus();
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const isSyncing = useRef(false);
  const [duplicadoInfo, setDuplicadoInfo] = useState<{ data: string; cliente: string } | null>(null);
  const [showClienteSuggestions, setShowClienteSuggestions] = useState(false);
  const [showLojistaSuggestions, setShowLojistaSuggestions] = useState(false);
  const [lojistas, setLojistas] = useState<{ id: string; nome: string; cpf?: string | null; cnpj?: string | null; saldo_credito?: number }[]>([]);

  // Card title overrides (sincronizado com a página de Estoque)
  const [cardTitleOverrides, setCardTitleOverrides] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("tigrao_card_title_overrides") || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    if (!password) return;
    fetch("/api/admin/estoque-settings?key=card_title_overrides", { headers: { "x-admin-password": password }, cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (j.value && typeof j.value === "object") {
          setCardTitleOverrides(prev => ({ ...(j.value as Record<string, string>), ...prev }));
          try { localStorage.setItem("tigrao_card_title_overrides", JSON.stringify(j.value)); } catch {}
        }
      })
      .catch(() => {});
  }, [password]);
  const applyCardTitleOverride = (modelo: string): string => {
    if (cardTitleOverrides[modelo]) return cardTitleOverrides[modelo].toUpperCase();
    const semConn = modelo.replace(/\s+GPS\+CEL$/, "").replace(/\s+GPS$/, "");
    if (semConn !== modelo && cardTitleOverrides[semConn]) {
      const base = cardTitleOverrides[semConn];
      const suffix = modelo.endsWith(" GPS+CEL") ? " GPS+CEL" : modelo.endsWith(" GPS") ? " GPS" : "";
      return (base + suffix).toUpperCase();
    }
    return modelo;
  };

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
  const hojeStr = hojeBR(); // data de hoje no fuso BR
  const [filtroAno, setFiltroAno] = useState(String(now.getFullYear()));
  const [filtroMes, setFiltroMes] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [filtroDia, setFiltroDia] = useState("");
  const [filtroCpf, setFiltroCpf] = useState("");
  const [ordenar, setOrdenar] = useState<"recente" | "antigo" | "origem" | "cliente">("recente");
  const [filtroBrinde, setFiltroBrinde] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [finalizandoLote, setFinalizandoLote] = useState(false);

  // Admin não precisa de senha extra
  const isAdmin = user?.role === "admin";
  // Pode ver histórico completo (admin + vendas_ver)
  const podeVerHistorico = isAdmin || (user?.permissoes?.includes("vendas_ver") ?? false);
  // Pode ver Em Andamento (admin + vendas_ver + vendas_andamento)
  const podeVerAndamento = podeVerHistorico || (user?.permissoes?.includes("vendas_andamento") ?? false);

  const [msg, setMsg] = useState("");
  const [lastClienteData, setLastClienteData] = useState<{ cliente: string; cpf: string; cnpj: string; email: string; endereco: string; pessoa: string; origem: string; tipo: string } | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Form state — ALL hooks must be before any conditional return
  const [form, setForm] = useState({
    data: hojeBR(),
    cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF" as "PF" | "PJ", origem: "", tipo: "", produto: "", fornecedor: "",
    custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
    entrada_pix: "", banco_pix: "ITAU", entrada_pix_2: "", banco_pix_2: "INFINITE", entrada_especie: "", banco_2nd: "", banco_alt: "",
    forma_alt: "", parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "", forma_sinal: "PIX",
    entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
    valor_total_venda: "",
    troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "", troca_obs: "",
    troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
    troca_serial: "", troca_imei: "", troca_condicao: "SEMINOVO",
    produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "",
    troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
    troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao2: "SEMINOVO",
    serial_no: "", imei: "",
    cep: "", bairro: "", cidade: "", uf: "",
    // Atacado: frete/entrega cobrado a parte
    frete_valor: "", frete_recebido: false as boolean,
    frete_forma: "" as string, frete_banco: "" as string, frete_parcelas: "" as string, frete_bandeira: "" as string,
    // Crédito de lojista (ATACADO): valor a abater do saldo pré-pago
    usar_credito_loja: "",
    // Brinde / Cortesia
    is_brinde: false as boolean,
    // Rastreio Correios (quando local = CORREIO)
    codigo_rastreio: "",
  });
  const [creditoLojistaSaldo, setCreditoLojistaSaldo] = useState(0);
  const [creditoLojistaId, setCreditoLojistaId] = useState<string | null>(null);
  // Restaurar rascunho do localStorage ao montar
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tigrao_venda_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.cliente) setForm(f => ({ ...f, ...parsed, data: hojeBR() }));
      }
    } catch {}
  }, []);

  // Auto-save rascunho da venda no localStorage (só se tem dados relevantes)
  useEffect(() => {
    if (form.cliente || form.produto || form.custo) {
      localStorage.setItem("tigrao_venda_draft", JSON.stringify(form));
    } else {
      // Form foi limpo — remover rascunho
      localStorage.removeItem("tigrao_venda_draft");
    }
  }, [form]);

  // Troca toggles
  const [trocaEnabled, setTrocaEnabled] = useState(false);
  const [showSegundaTroca, setShowSegundaTroca] = useState(false);

  // Busca por serial number
  const [serialBusca, setSerialBusca] = useState("");

  // QR Code scanner
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrScanMsg, setQrScanMsg] = useState("");
  const qrVideoRef = useRef<HTMLVideoElement | null>(null);
  const qrStreamRef = useRef<MediaStream | null>(null);
  const qrScanningRef = useRef(false);
  const serialInputRef = useRef<HTMLInputElement | null>(null);

  // Scanner remoto via iPhone
  const [iPhoneScanModal, setIPhoneScanModal] = useState(false);
  const [iPhoneScanToken, setIPhoneScanToken] = useState("");
  const [iPhoneScanStatus, setIPhoneScanStatus] = useState<"loading" | "waiting" | "done" | "error">("loading");
  const iPhonePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleOpenIPhoneScan = async () => {
    setIPhoneScanModal(true);
    setIPhoneScanStatus("loading");
    setIPhoneScanToken("");
    try {
      const res = await fetch("/api/scan-session", {
        method: "POST",
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      });
      if (!res.ok) throw new Error("Erro ao criar sessão");
      const { token } = await res.json();
      setIPhoneScanToken(token);
      setIPhoneScanStatus("waiting");
      // Polling a cada 1.5s
      iPhonePollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/scan-session?token=${token}`);
          if (r.status === 410) { handleCloseIPhoneScan(); setMsg("Sessão expirada. Abra novamente."); return; }
          if (!r.ok) return;
          const j = await r.json();
          if (j.serial) {
            handleCloseIPhoneScan();
            await fetch(`/api/scan-session?token=${token}`, { method: "DELETE" });
            setSerialBusca(j.serial);
            setEstoqueId(""); set("produto", ""); set("custo", ""); set("fornecedor", ""); set("serial_no", ""); set("imei", "");
            autoSelecionarPorSerial(j.serial);
          }
        } catch { /* ignore poll errors */ }
      }, 1500);
    } catch {
      setIPhoneScanStatus("error");
    }
  };

  const handleCloseIPhoneScan = () => {
    if (iPhonePollRef.current) { clearInterval(iPhonePollRef.current); iPhonePollRef.current = null; }
    setIPhoneScanModal(false);
    setIPhoneScanToken("");
    setIPhoneScanStatus("loading");
  };

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

  // Helpers: uppercase text + formatar moeda
  const setFormUpper = (field: string, val: string) => setForm(f => ({ ...f, [field]: val.toUpperCase() }));
  const fmtMoney = (v: string) => {
    const num = v.replace(/\D/g, "");
    if (!num) return "";
    return Number(num).toLocaleString("pt-BR");
  };
  const parseMoney = (v: string) => v.replace(/\./g, "").replace(",", ".");

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
    // Troca individual por produto
    produto_na_troca: string;
    troca_produto: string;
    troca_cor: string;
    troca_categoria: string;
    troca_bateria: string;
    troca_obs: string;
    troca_grade: string;
    troca_caixa: string;
    troca_cabo: string;
    troca_fonte: string;
    troca_pulseira: string;
    troca_ciclos: string;
    troca_serial: string;
    troca_imei: string;
    troca_garantia: string;
    troca_condicao: string;
    // 2º produto na troca
    produto_na_troca2: string;
    troca_produto2: string;
    troca_cor2: string;
    troca_categoria2: string;
    troca_bateria2: string;
    troca_obs2: string;
    troca_serial2: string;
    troca_imei2: string;
    troca_garantia2: string;
    troca_pulseira2: string;
    troca_ciclos2: string;
    troca_condicao2: string;
  }
  const [produtosCarrinho, setProdutosCarrinho] = useState<ProdutoCarrinho[]>([]);

  // Estoque: catálogo de produtos
  interface EstoqueItem { id: string; produto: string; categoria: string; tipo: string; qnt: number; custo_unitario: number; cor: string | null; fornecedor: string | null; status: string; serial_no: string | null; imei: string | null; reserva_cliente: string | null; observacao: string | null; sku: string | null }
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [catSel, setCatSel] = useState("");
  const [estoqueId, setEstoqueId] = useState("");
  const [expandedVendaCor, setExpandedVendaCor] = useState("");
  const [produtoManual, setProdutoManual] = useState(false);

  // Preencher produto a partir da URL (ex: vindo do estoque "Criar Venda")
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const produto = params.get("produto");
    if (produto) {
      setForm(f => ({
        ...f,
        produto: produto,
        custo: params.get("custo") || f.custo,
        serial_no: params.get("serial") || f.serial_no,
        fornecedor: params.get("fornecedor") || f.fornecedor,
      }));
      const eid = params.get("estoque_id");
      if (eid) setEstoqueId(eid);
      setProdutoManual(true);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [scanMode, setScanMode] = useState(true); // Scan é o modo padrão — produto novo obrigatório bipar
  const [scanMsg, setScanMsg] = useState("");

  // Nota fiscal PDF upload
  const [notaFiscalVendaIds, setNotaFiscalVendaIds] = useState<string[]>([]);
  const [notaFiscalFile, setNotaFiscalFile] = useState<File | null>(null);
  const [notaFiscalUploading, setNotaFiscalUploading] = useState(false);
  const [notaFiscalDragOver, setNotaFiscalDragOver] = useState(false);

  // Troca — produto selecionado pelo catálogo
  const [trocaRow, setTrocaRow] = useState<ProdutoRowState>(() => createEmptyProdutoRow());
  const [trocaRow2, setTrocaRow2] = useState<ProdutoRowState>(() => createEmptyProdutoRow());

  // Sync trocaRow → form (apenas produto/cor/categoria; serial/imei/grade/caixa têm inputs próprios no form)
  useEffect(() => {
    setForm(f => ({
      ...f,
      troca_produto: trocaRow.produto || f.troca_produto,
      troca_cor: trocaRow.cor || f.troca_cor,
      troca_categoria: trocaRow.categoria || f.troca_categoria,
    }));
  }, [trocaRow.produto, trocaRow.cor, trocaRow.categoria]);
  useEffect(() => {
    setForm(f => ({
      ...f,
      troca_produto2: trocaRow2.produto || f.troca_produto2,
      troca_cor2: trocaRow2.cor || f.troca_cor2,
      troca_categoria2: trocaRow2.categoria || f.troca_categoria2,
    }));
  }, [trocaRow2.produto, trocaRow2.cor, trocaRow2.categoria]);

  // Fornecedores
  interface Fornecedor { id: string; nome: string }
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);

  const fetchFornecedores = useCallback(async () => {
    try {
      const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        setFornecedores(json.data ?? []);
      }
    } catch { /* ignore */ }
  }, [password]);

  // Campos que NÃO devem ser uppercased (emails, senhas, etc)
  const noUpperFields = new Set(["email", "telefone", "data", "cep", "cpf", "cnpj", "custo", "preco_vendido", "valor_comprovante_input", "entrada_pix", "entrada_especie", "entrada_fiado", "sinal_antecipado", "comp_alt", "qnt_parcelas", "parc_alt", "fiado_qnt_parcelas", "fiado_data_inicio", "fiado_intervalo", "pessoa", "valor_total_venda"]);
  const set = (field: string, value: string | boolean) => {
    const v = typeof value === "string" && !noUpperFields.has(field) ? value.toUpperCase() : value;
    setForm((f) => ({ ...f, [field]: v }));
  };

  // ── QR Scanner ──────────────────────────────────────────────────────────────
  const handleStopQR = useCallback(() => {
    qrScanningRef.current = false;
    if (qrStreamRef.current) { qrStreamRef.current.getTracks().forEach(t => t.stop()); qrStreamRef.current = null; }
    setShowQRScanner(false);
    setQrScanMsg("");
  }, []);

  const handleQRDetected = useCallback((rawValue: string) => {
    const val = rawValue.trim();
    // Novo formato das etiquetas (pos-SKU): QR codifica JSON { sku, c: codigo }.
    // Prefere busca por SKU (100% preciso) + fallback pelo codigo serial/IMEI.
    // Retrocompat: QR antigo sem JSON continua funcionando (codigo bruto).
    let sku: string | null = null;
    let codigo = val;
    if (val.startsWith("{")) {
      try {
        const parsed = JSON.parse(val) as { sku?: string; c?: string };
        if (parsed.sku) sku = String(parsed.sku).toUpperCase();
        if (parsed.c) codigo = String(parsed.c);
      } catch {
        /* nao e JSON valido — trata val inteiro como codigo */
      }
    }

    // Busca no estoque: prioridade SKU, depois serial/imei/id
    const found = estoque.find(p => {
      if (sku && p.sku && p.sku.toUpperCase() === sku) {
        // Match por SKU: se ainda bate por serial/imei tambem, perfeito;
        // senao aceita qualquer unidade do SKU (mas idealmente deve bater codigo).
        return (p.serial_no && p.serial_no.toUpperCase() === codigo.toUpperCase()) ||
               (p.imei && p.imei.toUpperCase() === codigo.toUpperCase()) ||
               // Se codigo nao bate serial/imei, aceita mesmo assim — pode ser
               // etiqueta de item sem serial (raro). Usuario pode editar depois.
               true;
      }
      // Fallback: busca por serial/imei/id (comportamento antigo)
      return (p.serial_no && p.serial_no.toUpperCase() === codigo.toUpperCase()) ||
             (p.imei && p.imei.toUpperCase() === codigo.toUpperCase()) ||
             p.id === codigo;
    });

    if (found) {
      const tipoKey = (found.tipo ?? "NOVO") === "SEMINOVO" ? "SEMINOVO" : "NOVO";
      setCatSel(`${found.categoria}__${tipoKey}`);
      setEstoqueId(found.id);
      set("produto", found.produto);
      set("custo", String(Math.round(found.custo_unitario || 0)));
      if (found.fornecedor) set("fornecedor", found.fornecedor);
      if (found.serial_no) { set("serial_no", found.serial_no); setSerialBusca(found.serial_no); }
      if (found.imei) { set("imei", found.imei); if (!found.serial_no) setSerialBusca(found.imei); }
      handleStopQR();
      setMsg(`✅ Produto encontrado: ${found.produto}${sku ? ` (SKU ${sku})` : ""}`);
    } else {
      setQrScanMsg(`⚠️ ${sku ? `SKU ${sku} com ${codigo.slice(0, 16)}…` : `Codigo ${codigo.slice(0, 20)}…`} nao encontrado em estoque`);
    }
  }, [estoque, set, handleStopQR]);

  const handleOpenQRScanner = useCallback(async () => {
    setShowQRScanner(true);
    setQrScanMsg("Aguarde, iniciando câmera...");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(window as any).BarcodeDetector) {
        setQrScanMsg("❌ Scanner não suportado neste browser. Use Chrome ou Edge.");
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } } });
      qrStreamRef.current = stream;
      await new Promise<void>(resolve => setTimeout(resolve, 100));
      if (qrVideoRef.current) { qrVideoRef.current.srcObject = stream; await qrVideoRef.current.play(); }
      qrScanningRef.current = true;
      setQrScanMsg("Aponte a câmera para o QR code da etiqueta...");
      let lastVal = "";
      const scan = async () => {
        if (!qrScanningRef.current || !qrVideoRef.current) return;
        try {
          const barcodes = await detector.detect(qrVideoRef.current);
          if (barcodes.length > 0 && barcodes[0].rawValue !== lastVal) {
            lastVal = barcodes[0].rawValue;
            handleQRDetected(barcodes[0].rawValue);
            return;
          }
        } catch { /* ignore */ }
        requestAnimationFrame(scan);
      };
      requestAnimationFrame(scan);
    } catch {
      setQrScanMsg("❌ Erro ao acessar câmera. Verifique as permissões do browser.");
    }
  }, [estoque, handleQRDetected]);
  // ────────────────────────────────────────────────────────────────────────────

  const fetchEstoque = useCallback(async () => {
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        setEstoque((json.data ?? []).filter((p: EstoqueItem) => p.qnt > 0 && (p.status === "EM ESTOQUE" || p.tipo === "A_CAMINHO")));
      }
    } catch { /* ignore */ }
  }, [password]);

  useEffect(() => { if (password) { fetchEstoque(); fetchFornecedores(); } }, [password, fetchEstoque, fetchFornecedores]);

  // Auto-selecionar produto por serial/IMEI — chamado direto no onChange
  // Busca no estoque filtrado primeiro; se não achar, busca na API (produto pode estar com status/tipo inesperado)
  const autoSelecionarPorSerial = useCallback((val: string) => {
    const v = val.trim().toUpperCase();
    if (!v || v.length < 5) return;
    let found = estoque.find(p =>
      (p.serial_no && p.serial_no.toUpperCase() === v) ||
      (p.imei && p.imei.toUpperCase() === v)
    );
    // Se não achou no estoque filtrado, buscar via API (pode estar com status diferente)
    if (!found && v.length >= 8) {
      fetch(`/api/estoque?serial=${encodeURIComponent(v)}`, { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } })
        .then(r => r.json())
        .then(j => {
          const item = (j.data || []).find((p: EstoqueItem) => p.qnt > 0 && ((p.serial_no || "").toUpperCase() === v || (p.imei || "").toUpperCase() === v));
          if (item && item.status !== "EM ESTOQUE") {
            setMsg(`⚠️ Produto encontrado mas com status "${item.status}" (tipo: ${item.tipo}). Mova para estoque antes de vender.`);
          }
        })
        .catch(() => {});
    }
    if (found) {
      const tipoKey = (found.tipo ?? "NOVO") === "SEMINOVO" ? "SEMINOVO" : "NOVO";
      setCatSel(`${found.categoria}__${tipoKey}`);
      setEstoqueId(found.id);
      setForm(f => ({ ...f,
        produto: found.produto.toUpperCase(),
        custo: String(Math.round(found.custo_unitario || 0)),
        fornecedor: found.fornecedor ? found.fornecedor.toUpperCase() : f.fornecedor,
        serial_no: found.serial_no ? found.serial_no.toUpperCase() : f.serial_no,
        imei: found.imei ? found.imei.toUpperCase() : f.imei,
      }));
      setMsg(`✅ ${found.produto}`);
    }
  }, [estoque, setCatSel, setEstoqueId, setForm]);

  // Gerar categorias separadas por tipo (Lacrado vs Seminovo)
  const categorias = (() => {
    const cats: { key: string; label: string }[] = [];
    const catSet = new Set<string>();
    for (const p of estoque) {
      const tipo = (p.tipo === "SEMINOVO" || p.tipo === "NAO_ATIVADO") ? "SEMINOVO" : "NOVO";
      const key = `${p.categoria}__${tipo}`;
      if (!catSet.has(key)) {
        catSet.add(key);
        const catLabel: Record<string, string> = { IPHONES: "iPhones", IPADS: "iPads", MACBOOK: "MacBooks", MAC_MINI: "Mac Mini", APPLE_WATCH: "Apple Watch", AIRPODS: "AirPods", ACESSORIOS: "Acessórios", OUTROS: "Outros", SEMINOVOS: "Seminovos" };
        const label = (catLabel[p.categoria] || p.categoria) + (tipo === "SEMINOVO" ? " (Seminovo)" : "");
        cats.push({ key, label });
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
    return estoque.filter(p => p.categoria === cat && ((p.tipo === "SEMINOVO" || p.tipo === "NAO_ATIVADO") ? "SEMINOVO" : "NOVO") === tipo && p.qnt > 0 && p.status === "EM ESTOQUE");
  })() : [];

  const fetchVendas = useCallback(async () => {
    setLoading(true);
    try {
      let url: string;
      if (filtroCpf.trim().length >= 3) {
        // Buscar por nome ou CPF
        url = `/api/vendas?search=${encodeURIComponent(filtroCpf.trim())}`;
      } else {
        // Construir filtro de data
        const from = filtroDia
          ? `${filtroAno}-${filtroMes}-${filtroDia.padStart(2, "0")}`
          : `${filtroAno}-${filtroMes}-01`;
        const lastDay = new Date(Number(filtroAno), Number(filtroMes), 0).getDate();
        const to = filtroDia
          ? `${filtroAno}-${filtroMes}-${filtroDia.padStart(2, "0")}`
          : `${filtroAno}-${filtroMes}-${lastDay}`;
        url = `/api/vendas?from=${from}&to=${to}`;
      }
      const res = await fetch(url, { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) {
        const json = await res.json();
        setVendas(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, filtroAno, filtroMes, filtroDia, filtroCpf]);

  // Busca os termos de procedencia (apenas os com zapsign enviado) pra mostrar badge nas vendas
  const fetchTermos = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/termo-procedencia?limit=200", {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        const termos = (json.data || []) as Array<{ id: string; venda_id?: string | null; status: string; zapsign_sign_url?: string | null; signed_pdf_url?: string | null; created_at: string }>;
        // Pega o mais recente por venda_id
        const map: Record<string, { id: string; status: string; zapsign_sign_url?: string | null; signed_pdf_url?: string | null }> = {};
        for (const t of termos) {
          if (!t.venda_id) continue;
          // Se ja tem um termo pra essa venda, mantem o mais recente (array ja vem ordenado desc)
          if (!map[t.venda_id]) {
            map[t.venda_id] = { id: t.id, status: t.status, zapsign_sign_url: t.zapsign_sign_url, signed_pdf_url: t.signed_pdf_url };
          }
        }
        setTermosPorVenda(map);
      }
    } catch { /* silent */ }
  }, [password]);

  useEffect(() => { if (password) { fetchVendas(); fetchTermos(); } }, [password, fetchVendas, fetchTermos]);

  // Auto-refresh dos termos a cada 20s pra badge mudar quando cliente assinar
  // (o webhook ZapSign atualiza o banco mas a UI não sabe sem refetch)
  useAutoRefetch(fetchTermos, !!password, 20000);

  // Auto-transição: vendas PROGRAMADAS cuja data já chegou → mover para AGUARDANDO
  const transicionadasRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!password || vendas.length === 0) return;
    const programadasVencidas = vendas.filter(
      v => v.status_pagamento === "PROGRAMADA" && v.data_programada && v.data_programada <= hojeStr && !transicionadasRef.current.has(v.id)
    );
    if (programadasVencidas.length === 0) return;
    programadasVencidas.forEach(v => transicionadasRef.current.add(v.id));
    // Mover para AGUARDANDO automaticamente
    const headers = { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") };
    Promise.all(programadasVencidas.map(v =>
      fetch("/api/vendas", { method: "PATCH", headers, body: JSON.stringify({ id: v.id, status_pagamento: "AGUARDANDO" }) })
    )).then(() => {
      const ids = new Set(programadasVencidas.map(v => v.id));
      setVendas(prev => prev.map(v => ids.has(v.id) ? { ...v, status_pagamento: "AGUARDANDO" } : v));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendas, password]);

  // Fetch client history when client name changes (3+ chars, debounced)
  const fetchClienteHistorico = useCallback(async (nome: string) => {
    if (!nome || nome.length < 3 || !password) {
      setClienteHistorico(null);
      return;
    }
    setLoadingHistorico(true);
    try {
      const res = await fetch(`/api/vendas?search=${encodeURIComponent(nome)}`, {
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
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

  // Carregar lista de lojistas cadastrados pra autocomplete no modo ATACADO.
  // Busca uma vez ao entrar em ATACADO e reusa — a lista e pequena (< 100 em geral).
  useEffect(() => {
    if (form.tipo !== "ATACADO" || !password || lojistas.length > 0) return;
    fetch("/api/admin/lojistas", {
      headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
    })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (j?.lojistas) setLojistas(j.lojistas); })
      .catch(() => {});
  }, [form.tipo, password, user?.nome, lojistas.length]);

  // Buscar saldo de crédito do lojista quando cliente/cpf/cnpj mudar (só ATACADO)
  useEffect(() => {
    if (form.tipo !== "ATACADO" || (!form.cliente && !form.cpf && !form.cnpj)) {
      setCreditoLojistaSaldo(0);
      setCreditoLojistaId(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (form.cpf) params.set("cpf", form.cpf);
        if (form.cnpj) params.set("cnpj", form.cnpj);
        if (form.cliente) params.set("nome", form.cliente);
        // Usa a mesma tabela que a tela Clientes/Lojistas (lojistas.saldo_credito)
        const res = await fetch(`/api/admin/lojistas?${params}`, { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
        if (res.ok) {
          const json = await res.json();
          const saldo = Number(json.saldo || 0);
          setCreditoLojistaSaldo(saldo);
          setCreditoLojistaId(json.lojista?.id || null);
          // Fallback: se veio cpf/cnpj e não achou, tenta só pelo nome
          if (saldo === 0 && form.cliente && (form.cpf || form.cnpj)) {
            const p2 = new URLSearchParams({ nome: form.cliente });
            const r2 = await fetch(`/api/admin/lojistas?${p2}`, { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
            if (r2.ok) {
              const j2 = await r2.json();
              setCreditoLojistaSaldo(Number(j2.saldo || 0));
              setCreditoLojistaId(j2.lojista?.id || null);
            }
          }
        }
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.tipo, form.cliente, form.cpf, form.cnpj, password, user?.nome]);

  // Verificar se já desbloqueou nesta sessão
  useEffect(() => {
    const temPermissaoVendas = user?.permissoes?.some(p => p === "vendas_ver" || p === "vendas_registrar");
    if (isAdmin || temPermissaoVendas) { setVendasUnlocked(true); return; }
    const unlocked = sessionStorage.getItem("vendas_unlocked");
    if (unlocked === "true") setVendasUnlocked(true);
  }, [isAdmin, user]);

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
            headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
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

  // Recalcular preco_vendido automaticamente no modo "Datas diferentes".
  // Sem isso, preco_vendido fica 0 e a venda grava com lucro negativo (custo - 0).
  // Soma valor LIQUIDO de cada pagEntry respeitando a forma (taxa de cartao/link/debito).
  // Se for PIX/ESPECIE/FIADO: liquido = bruto (sem taxa).
  useEffect(() => {
    if (!multiDatePagamento) return;
    const pTroca1 = parseFloat(form.produto_na_troca) || 0;
    const pTroca2 = parseFloat(form.produto_na_troca2) || 0;
    const totalTroca = pTroca1 + pTroca2;
    const totalPagEntries = pagEntries.reduce((sum, e) => {
      const bruto = parseFloat(String(e.valor).replace(/\./g, "").replace(",", ".")) || 0;
      if (bruto <= 0) return sum;
      const forma = e.forma || "";
      if (forma === "CARTAO" || forma === "LINK" || forma === "DEBITO") {
        const banco = forma === "LINK" ? "MERCADO_PAGO" : (e.banco || "ITAU");
        const parcelas = parseInt(e.parcelas) || 0;
        const bandeira = e.bandeira || null;
        const formaTaxa = (forma === "LINK" ? "CARTAO" : forma) as "CARTAO" | "DEBITO";
        const taxa = getTaxa(banco, bandeira, parcelas, formaTaxa);
        return sum + (taxa > 0 ? calcularLiquido(bruto, taxa) : bruto);
      }
      // PIX, ESPECIE, DINHEIRO, FIADO: sem taxa
      return sum + bruto;
    }, 0);
    const newVendido = String(Math.round(totalPagEntries + totalTroca));
    if (newVendido === "0") return;
    if (produtosCarrinho.length === 0) {
      setForm(f => f.preco_vendido === newVendido ? f : { ...f, preco_vendido: newVendido });
    } else if (produtosCarrinho.length === 1) {
      setProdutosCarrinho(prev => prev.length === 1 && prev[0].preco_vendido !== newVendido
        ? [{ ...prev[0], preco_vendido: newVendido }]
        : prev);
    }
  }, [multiDatePagamento, pagEntries, form.produto_na_troca, form.produto_na_troca2, produtosCarrinho.length]);

  // Recalcular preco_vendido automaticamente quando 2o cartão (ou qualquer parte do pagamento) mudar
  // IMPORTANTE: precisa estar ANTES do early return abaixo (regras dos hooks)
  useEffect(() => {
    const compAltVal = parseFloat(form.comp_alt) || 0;
    if (compAltVal <= 0) return;
    const compVal = parseFloat(form.valor_comprovante_input) || 0;
    const pix = parseFloat(form.entrada_pix) || 0;
    const pix2 = parseFloat(form.entrada_pix_2) || 0;
    const esp = parseFloat(form.entrada_especie) || 0;
    const trc1 = parseFloat(form.produto_na_troca) || 0;
    const trc2 = parseFloat(form.produto_na_troca2) || 0;
    const trc = trc1 + trc2;
    const taxaAlt = getTaxa((form.forma_alt || form.forma) === "LINK" ? "MERCADO_PAGO" : (form.banco_alt || "ITAU"), form.band_alt || null, parseInt(form.parc_alt) || 0, (form.forma_alt || form.forma || "CARTAO") as "CARTAO" | "LINK");
    const liqAlt = taxaAlt > 0 ? calcularLiquido(compAltVal, taxaAlt) : compAltVal;
    let liqPrinc = 0;
    if (compVal > 0) {
      const tx = (form.forma === "CARTAO" || form.forma === "LINK")
        ? getTaxa(form.forma === "LINK" ? "MERCADO_PAGO" : (form.banco || "ITAU"), form.bandeira || null, parseInt(form.qnt_parcelas) || 0, "CARTAO")
        : form.forma === "DEBITO" ? 0.75 : 0;
      liqPrinc = tx > 0 ? calcularLiquido(compVal, tx) : compVal;
    }
    const newVendido = String(Math.round(liqPrinc + liqAlt + pix + pix2 + esp + trc));
    if (produtosCarrinho.length === 0) {
      setForm(f => f.preco_vendido === newVendido ? f : { ...f, preco_vendido: newVendido });
    } else if (produtosCarrinho.length === 1) {
      setProdutosCarrinho(prev => prev.length === 1 && prev[0].preco_vendido !== newVendido
        ? [{ ...prev[0], preco_vendido: newVendido }]
        : prev);
    }
  }, [form.comp_alt, form.banco_alt, form.parc_alt, form.band_alt, form.valor_comprovante_input, form.entrada_pix, form.entrada_pix_2, form.entrada_especie, form.produto_na_troca, form.produto_na_troca2, form.forma, form.banco, form.bandeira, form.qnt_parcelas, produtosCarrinho.length]);

  // Auto-desbloquear para quem tem vendas_andamento mas não vendas_ver (equipe como Bianca)
  useEffect(() => {
    if (podeVerAndamento && !podeVerHistorico && !vendasUnlocked) {
      setVendasUnlocked(true);
      setTab("andamento");
    }
  }, [podeVerAndamento, podeVerHistorico, vendasUnlocked]);

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
              className={`w-full px-4 py-3 rounded-xl border placeholder-[#86868B] focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`}
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

  // Formatação de valores com separador de milhares
  const fmtMil = (v: string) => {
    const num = v.replace(/\D/g, "");
    return num ? Number(num).toLocaleString("pt-BR") : "";
  };
  const setMoney = (field: string, raw: string) => {
    const clean = raw.replace(/\./g, "").replace(/\D/g, "");
    setForm(f => ({ ...f, [field]: clean }));
  };

  // Cálculos em tempo real
  const custo = parseFloat(form.custo) || 0;
  const preco = parseFloat(form.preco_vendido) || 0;
  const valorTroca = (parseFloat(form.produto_na_troca) || 0) + (parseFloat(form.produto_na_troca2) || 0);
  const entradaPix = parseFloat(form.entrada_pix) || 0;
  const entradaPix2 = parseFloat(form.entrada_pix_2) || 0;
  const entradaEspecie = parseFloat(form.entrada_especie) || 0;
  // 2o PIX sai do banco principal — entra no calculo como entrada PIX extra.
  const valorCartao = preco - valorTroca - entradaPix - entradaPix2 - entradaEspecie;
  const parcelas = parseInt(form.qnt_parcelas) || 0;
  const taxa = form.forma === "CARTAO"
    ? getTaxa(form.banco, form.bandeira || null, parcelas, form.forma)
    : form.forma === "LINK" ? getTaxa("MERCADO_PAGO", null, parcelas, "CARTAO")
    : form.forma === "DEBITO" ? 0.75
    : 0;
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
  const creditoLojaNum = parseFloat(String(form.usar_credito_loja || "0").replace(/\./g, "").replace(",", ".")) || 0;
  const totalRealRecebido = valorLiquido + entradaPix + entradaPix2 + entradaEspecie + valorTroca + creditoLojaNum;
  const lucro = totalRealRecebido - custo;
  const margem = totalRealRecebido > 0 ? (lucro / totalRealRecebido) * 100 : 0;

  // Helper: recalcular preco_vendido total quando muda qualquer componente do pagamento
  const recalcVendido = (overrides: { pix?: string; pix2?: string; especie?: string; troca?: string; troca2?: string; comp?: string; credito?: string }) => {
    const compVal = parseFloat(overrides.comp ?? form.valor_comprovante_input) || 0;
    const curTaxa = taxa;
    const curForma = form.forma;
    const pix = parseFloat(overrides.pix ?? form.entrada_pix) || 0;
    const pix2 = parseFloat(overrides.pix2 ?? form.entrada_pix_2) || 0;
    const esp = parseFloat(overrides.especie ?? form.entrada_especie) || 0;
    // Segundo cartão (comp_alt) — sempre incluído quando preenchido
    const compAltVal = parseFloat(form.comp_alt) || 0;
    const taxaAlt = compAltVal > 0 ? getTaxa((form.forma_alt || form.forma) === "LINK" ? "MERCADO_PAGO" : (form.banco_alt || "ITAU"), form.band_alt || null, parseInt(form.parc_alt) || 0, (form.forma_alt || form.forma || "CARTAO") as "CARTAO" | "LINK") : 0;
    const liqAlt = compAltVal > 0 ? (taxaAlt > 0 ? calcularLiquido(compAltVal, taxaAlt) : compAltVal) : 0;
    // Trocas: no modo carrinho, somar de todos os produtos do carrinho + form global
    const trcForm1 = parseFloat(overrides.troca ?? form.produto_na_troca) || 0;
    const trcForm2 = parseFloat(overrides.troca2 ?? form.produto_na_troca2) || 0;
    const trcCarrinho = produtosCarrinho.reduce((s, p) => s + (parseFloat(p.produto_na_troca) || 0) + (parseFloat(p.produto_na_troca2) || 0), 0);
    const trc = produtosCarrinho.length > 0 ? Math.max(trcCarrinho, trcForm1 + trcForm2) : trcForm1 + trcForm2;

    // Crédito de lojista conta como valor recebido
    const credLoja = parseFloat(String(overrides.credito ?? (form.usar_credito_loja || "0")).replace(/\./g, "").replace(",", ".")) || 0;

    let result: string | undefined;
    if (curForma === "PIX" && compVal > 0) {
      // Forma PIX: compVal = PIX do banco principal; pix2 = 2o PIX enviado pra
      // outro banco (separado, nao split do principal). Ambos somam no total.
      result = String(Math.round(compVal + pix + pix2 + esp + trc + liqAlt + credLoja));
    } else if (compVal > 0 && curTaxa > 0) {
      const liqCartao = calcularLiquido(compVal, curTaxa);
      result = String(Math.round(liqCartao + pix + pix2 + esp + trc + liqAlt + credLoja));
    } else if (curForma === "ESPECIE" || curForma === "DINHEIRO") {
      const total = pix + pix2 + esp + trc + compVal + liqAlt + credLoja;
      if (total > 0) result = String(Math.round(total));
    } else if (credLoja > 0) {
      // Pagamento 100% via crédito de lojista (sem forma de pagamento adicional)
      result = String(Math.round(pix + pix2 + esp + trc + liqAlt + credLoja));
    } else if (liqAlt > 0) {
      // Apenas 2o cartão preenchido
      result = String(Math.round(pix + pix2 + esp + trc + liqAlt));
    }

    // Se tem carrinho com 2+ produtos, distribuir automaticamente
    if (result && produtosCarrinho.length > 0) {
      distribuirValorTotal(result);
      setForm(f => ({ ...f, valor_total_venda: result! }));
    }

    return result;
  };

  // Distribuir valor total da venda proporcionalmente ao custo de cada produto no carrinho
  const distribuirValorTotal = (totalStr: string) => {
    const total = parseFloat(totalStr) || 0;
    if (total <= 0 || produtosCarrinho.length === 0) return;
    const custoTotal = produtosCarrinho.reduce((s, p) => s + (parseFloat(p.custo) || 0), 0);
    if (custoTotal <= 0) {
      // Sem custo definido: divide igualmente
      const cada = Math.round(total / produtosCarrinho.length);
      setProdutosCarrinho(prev => prev.map((p, i) => ({
        ...p,
        preco_vendido: String(i === prev.length - 1 ? total - cada * (prev.length - 1) : cada),
      })));
    } else {
      // Proporcional ao custo
      let distribuido = 0;
      setProdutosCarrinho(prev => prev.map((p, i) => {
        const pCusto = parseFloat(p.custo) || 0;
        const valor = i === prev.length - 1
          ? Math.round(total - distribuido)
          : Math.round((pCusto / custoTotal) * total);
        distribuido += valor;
        return { ...p, preco_vendido: String(valor) };
      }));
    }
  };

  // Resumo financeiro
  // temTroca: controlado pelo checkbox trocaEnabled OU automaticamente se já tem dados de troca
  const temTroca = trocaEnabled || valorTroca > 0 || !!form.troca_produto || !!trocaRow.produto;
  const temEntradaPix = entradaPix > 0;
  const temEntradaEspecie = entradaEspecie > 0;
  const temCartao = form.forma === "CARTAO" || form.forma === "LINK" || form.forma === "DEBITO";

  // Helper: build payload from product fields + global payment (from form state)
  // Payment info is GLOBAL for the entire sale — copied to each product record
  const buildPayload = (prodFields: ProdutoCarrinho) => {
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
    // Troca individual por produto (do carrinho)
    const pValorTroca1 = parseFloat(prodFields.produto_na_troca) || 0;
    const pValorTroca2 = parseFloat(prodFields.produto_na_troca2) || 0;
    const pValorTroca = pValorTroca1 + pValorTroca2;
    // pTemTroca: considera valor OU produto preenchido (vendas pendentes sem valor ainda)
    const pTemTroca = pValorTroca > 0 || !!prodFields.troca_produto || !!prodFields.troca_produto2;
    const gTemEntradaPix = gEntradaPix > 0;

    const gTaxa = gForma === "CARTAO"
      ? getTaxa(gBanco, gBandeira || null, gParcelas, gForma)
      : gForma === "LINK" ? getTaxa("MERCADO_PAGO", null, gParcelas, "CARTAO")
      : gForma === "DEBITO" ? 0.75
      : 0;

    let pBancoFinal = gBanco;
    if (gForma === "LINK") pBancoFinal = "MERCADO_PAGO";
    if (gForma === "PIX") pBancoFinal = gBancoPix || "ITAU";
    if (gForma === "ESPECIE") pBancoFinal = "ESPECIE";
    if (!gForma) pBancoFinal = "ITAU";

    const isBrinde = !!form.is_brinde;
    const payload: Record<string, unknown> = {
      data: form.data,
      is_brinde: isBrinde,
      cliente: form.cliente,
      cpf: form.cpf || null,
      cnpj: form.cnpj || null,
      email: form.email || null,
      telefone: form.telefone || null,
      endereco: form.endereco || null,
      cep: form.cep?.replace(/\D/g, "") || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      uf: form.uf || null,
      local: form.local || null,
      origem: form.tipo === "ATACADO" ? "ATACADO" : form.origem,
      tipo: pTemTroca ? "UPGRADE" : form.tipo,
      produto: prodFields.produto,
      fornecedor: prodFields.fornecedor || null,
      custo: pCusto,
      preco_vendido: pPrecoVendido,
      banco: multiDatePagamento && pagEntries.length > 0
        ? (pagEntries[0].forma === "ESPECIE" ? "ESPECIE" : pagEntries[0].banco || "ITAU")
        : pBancoFinal,
      forma: multiDatePagamento && pagEntries.length > 0
        ? (pagEntries[0].forma === "LINK" ? "CARTAO" : pagEntries[0].forma === "ESPECIE" ? "DINHEIRO" : pagEntries[0].forma)
        : (!gForma ? null : gForma === "LINK" ? "CARTAO" : gForma === "ESPECIE" ? "DINHEIRO" : gForma),
      recebimento: !gForma ? null : gForma === "FIADO" ? (form.fiado_data_inicio || null) : gForma === "PIX" || gForma === "ESPECIE" ? "D+0" : gForma === "LINK" ? "D+0" : gForma === "DEBITO" ? "D+1" : "D+1",
      data_recebimento_fiado: gForma === "FIADO" && form.fiado_data_inicio ? form.fiado_data_inicio : null,
      qnt_parcelas: gParcelas || null,
      bandeira: gBandeira || null,
      valor_comprovante: gValorComprovanteInput || null,
      produto_na_troca: pValorTroca1 > 0 ? String(pValorTroca1) : (prodFields.troca_produto ? "0" : null),
      entrada_pix: gEntradaPix,
      banco_pix: gTemEntradaPix ? (gBancoPix || "ITAU") : null,
      entrada_pix_2: parseFloat(form.entrada_pix_2) || 0,
      banco_pix_2: (parseFloat(form.entrada_pix_2) || 0) > 0 ? (form.banco_pix_2 || "INFINITE") : null,
      entrada_especie: gEntradaEspecie,
      entrada_fiado: gForma === "FIADO" ? (gValorComprovanteInput || pCusto) : (parseFloat(form.entrada_fiado) || 0),
      fiado_parcelas: (() => {
        // Se forma principal é FIADO, criar 1 parcela na data de recebimento
        if (gForma === "FIADO") {
          const total = gValorComprovanteInput || pCusto;
          if (!total || !form.fiado_data_inicio) return [];
          return [{ valor: total, data: form.fiado_data_inicio, pago: false }];
        }
        const total = parseFloat(form.entrada_fiado) || 0;
        if (total <= 0) return [];
        const n = parseInt(form.fiado_qnt_parcelas) || 1;
        const intervalo = parseInt(form.fiado_intervalo) || 7;
        const valorParcela = Math.round((total / n) * 100) / 100;
        const inicio = form.fiado_data_inicio ? new Date(form.fiado_data_inicio + "T12:00:00") : new Date();
        return Array.from({ length: n }, (_, i) => {
          const d = new Date(inicio);
          d.setDate(d.getDate() + i * intervalo);
          return { valor: i === n - 1 ? Math.round((total - valorParcela * (n - 1)) * 100) / 100 : valorParcela, data: d.toISOString().split("T")[0], recebido: false };
        });
      })(),
      banco_2nd: form.banco_2nd || null,
      banco_alt: form.banco_alt || null,
      parc_alt: parseInt(form.parc_alt) || null,
      band_alt: form.band_alt || null,
      comp_alt: parseFloat(form.comp_alt) || null,
      sinal_antecipado: parseFloat(form.sinal_antecipado) || 0,
      banco_sinal: form.banco_sinal || null,
      forma_sinal: form.forma_sinal || "PIX",
      serial_no: prodFields.serial_no || null,
      imei: prodFields.imei || null,
      troca_produto: prodFields.troca_produto || null,
      troca_cor: prodFields.troca_cor || null,
      troca_bateria: prodFields.troca_bateria || null,
      troca_obs: prodFields.troca_obs || null,
      troca_categoria: (prodFields.troca_categoria as string) || null,
      troca_serial: prodFields.troca_serial || null,
      troca_imei: prodFields.troca_imei || null,
      troca_grade: prodFields.troca_grade || null,
      troca_caixa: prodFields.troca_caixa || null,
      troca_cabo: prodFields.troca_cabo || null,
      troca_fonte: prodFields.troca_fonte || null,
      troca_pulseira: prodFields.troca_pulseira || null,
      troca_ciclos: prodFields.troca_ciclos || null,
      troca_garantia: prodFields.troca_garantia || null,
      troca_produto2: prodFields.troca_produto2 || null,
      troca_cor2: prodFields.troca_cor2 || null,
      troca_bateria2: prodFields.troca_bateria2 || null,
      troca_obs2: prodFields.troca_obs2 || null,
      troca_categoria2: (prodFields.troca_categoria2 as string) || null,
      troca_serial2: prodFields.troca_serial2 || null,
      troca_imei2: prodFields.troca_imei2 || null,
      troca_pulseira2: prodFields.troca_pulseira2 || null,
      troca_ciclos2: prodFields.troca_ciclos2 || null,
      troca_garantia2: prodFields.troca_garantia2 || null,
      produto_na_troca2: pValorTroca2 > 0 ? String(pValorTroca2) : (prodFields.troca_produto2 ? "0" : null),
      status_pagamento: multiDatePagamento
        ? (() => {
            // Modo multi-data: admin finaliza manualmente quando cobrar tudo.
            // Nao finalizar automaticamente porque:
            // 1. totalEntries e soma BRUTA; pPrecoVendido e LIQUIDO pos-taxa.
            //    Comparar bruto >= liquido resultava em FINALIZADO quase sempre.
            // 2. Pagamentos com cartao podem ter chargeback; admin deve
            //    confirmar manualmente quando o dinheiro entrar.
            // 3. Pagamentos com data futura obviamente ainda nao foram feitos.
            const hojeISO = hojeBR();
            const temDataFutura = pagEntries.some(e => {
              const valor = parseFloat(e.valor.replace(/\./g, "").replace(",", ".")) || 0;
              return valor > 0 && e.data && e.data > hojeISO;
            });
            if (temDataFutura) return "AGUARDANDO";
            return "AGUARDANDO";
          })()
        : vendaProgramada ? (programadaJaPago ? "FINALIZADO" : "PROGRAMADA")
        // Em edicao, preserva o status original — edicao de forma de pagamento,
        // dados do cliente, etc., nao deve jogar venda finalizada de volta
        // pra AGUARDANDO (isso disparava reenvio de NF quando o admin
        // finalizasse de novo).
        : (editandoVendaId && statusPagamentoOriginal) ? statusPagamentoOriginal
        : "AGUARDANDO",
      data_programada: vendaProgramada && dataProgramada ? dataProgramada : null,
      ...(multiDatePagamento && pagEntries.length > 0 ? {
        pagamento_historia: pagEntries.filter(e => (parseFloat(e.valor.replace(/\./g, "").replace(",", ".")) || 0) > 0).map(e => {
          const valor = parseFloat(e.valor.replace(/\./g, "").replace(",", ".")) || 0;
          const formaStr = [e.forma === "LINK" ? "CARTAO" : e.forma, e.parcelas ? `${e.parcelas}x` : "", e.bandeira].filter(Boolean).join(" ");
          return {
            tipo: "PARCIAL",
            valor,
            data: e.data,
            forma: formaStr,
            banco: e.forma === "ESPECIE" ? "ESPECIE" : e.forma === "LINK" ? "MERCADO_PAGO" : (e.banco || "ITAU"),
            ...(e.obs ? { obs: e.obs } : {}),
          };
        }),
      } : {}),
      vendedor: user?.nome || null,
      // Entrega atacado (cobrada à parte)
      frete_valor: parseFloat(String(form.frete_valor).replace(/\./g, "").replace(",", ".")) || null,
      frete_recebido: form.frete_valor ? (form.frete_forma ? true : !!form.frete_recebido) : null,
      frete_forma: form.frete_forma ? [form.frete_forma, form.frete_parcelas ? `${form.frete_parcelas}x` : "", form.frete_bandeira].filter(Boolean).join(" ") : null,
      frete_banco: form.frete_banco || null,
      // Crédito de lojista: valor a abater do saldo (backend debita automaticamente)
      usar_credito_loja: form.tipo === "ATACADO" ? (parseFloat(String(form.usar_credito_loja || "0").replace(/\./g, "").replace(",", ".")) || 0) : 0,
      _lojista_id: creditoLojistaId || null,
      // Rastreio Correios
      codigo_rastreio: form.local === "CORREIO" && form.codigo_rastreio ? form.codigo_rastreio.trim().toUpperCase() : null,
    };

    // Estoque_id: sempre envia quando vinculou um item novo.
    // Adicionalmente, se estamos editando uma venda e o admin MUDOU o produto
    // (estoque_id atual difere do original — incluindo quando limpou vinculo
    // digitando produto manualmente), envia null pra backend devolver o antigo.
    if (prodFields._estoqueId) {
      payload._estoque_id = prodFields._estoqueId;
    } else if (editandoVendaId && estoqueIdOriginal && !prodFields._estoqueId) {
      // Admin editou venda e desvinculou o produto — envia null explicitamente
      // pra backend devolver o item antigo ao estoque
      payload._estoque_id = null;
    }

    // Helper: build observacao with tags from checkboxes
    const buildSeminovoObs = (obs: string, grade: string, caixa: string, cabo: string, fonte: string, pulseira: string, ciclos: string) => {
      let result = obs || "";
      if (grade) result += ` [GRADE_${grade}]`;
      if (caixa === "SIM") result += " [COM_CAIXA]";
      if (cabo === "SIM") result += " [COM_CABO]";
      if (fonte === "SIM") result += " [COM_FONTE]";
      if (pulseira === "SIM") result += " [COM_PULSEIRA]";
      if (ciclos) result += ` [CICLOS:${ciclos}]`;
      return result.trim() || null;
    };

    if (prodFields.troca_produto || pValorTroca1 > 0) {
      payload._seminovo = {
        produto: prodFields.troca_produto,
        valor: pValorTroca1,
        cor: prodFields.troca_cor || null,
        categoria: (prodFields.troca_categoria as string) || null,
        bateria: prodFields.troca_bateria ? parseInt(prodFields.troca_bateria as string) : null,
        observacao: buildSeminovoObs(prodFields.troca_obs, prodFields.troca_grade, prodFields.troca_caixa, prodFields.troca_cabo, prodFields.troca_fonte, prodFields.troca_pulseira, prodFields.troca_ciclos),
        serial_no: prodFields.troca_serial || null,
        imei: prodFields.troca_imei || null,
        garantia: prodFields.troca_garantia || null,
      };
    }

    if (prodFields.troca_produto2 || pValorTroca2 > 0) {
      payload._seminovo2 = {
        produto: prodFields.troca_produto2,
        valor: pValorTroca2,
        cor: prodFields.troca_cor2 || null,
        categoria: (prodFields.troca_categoria2 as string) || null,
        bateria: prodFields.troca_bateria2 ? parseInt(prodFields.troca_bateria2 as string) : null,
        observacao: buildSeminovoObs(prodFields.troca_obs2, "", "", "", "", prodFields.troca_pulseira2, prodFields.troca_ciclos2),
        serial_no: prodFields.troca_serial2 || null,
        imei: prodFields.troca_imei2 || null,
        garantia: prodFields.troca_garantia2 || null,
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
    // Lê direto de trocaRow/trocaRow2 (fonte de verdade do ProdutoSpecFields),
    // com fallback para form.* quando preenchido fora do componente
    produto_na_troca: form.produto_na_troca || trocaRow.custo_unitario || "",
    troca_produto: trocaRow.produto || form.troca_produto,
    troca_cor: trocaRow.cor || form.troca_cor,
    troca_categoria: trocaRow.categoria || form.troca_categoria,
    troca_bateria: form.troca_bateria,
    troca_obs: form.troca_obs,
    troca_grade: trocaRow.grade || form.troca_grade,
    troca_caixa: trocaRow.caixa ? "SIM" : form.troca_caixa,
    troca_cabo: form.troca_cabo,
    troca_fonte: form.troca_fonte,
    troca_pulseira: form.troca_pulseira,
    troca_ciclos: form.troca_ciclos,
    troca_serial: trocaRow.serial_no || form.troca_serial,
    troca_imei: trocaRow.imei || form.troca_imei,
    troca_garantia: form.troca_garantia,
    troca_condicao: form.troca_condicao || "SEMINOVO",
    produto_na_troca2: form.produto_na_troca2 || trocaRow2.custo_unitario || "",
    troca_produto2: trocaRow2.produto || form.troca_produto2,
    troca_cor2: trocaRow2.cor || form.troca_cor2,
    troca_categoria2: trocaRow2.categoria || form.troca_categoria2,
    troca_bateria2: form.troca_bateria2,
    troca_obs2: form.troca_obs2,
    troca_serial2: trocaRow2.serial_no || form.troca_serial2,
    troca_imei2: trocaRow2.imei || form.troca_imei2,
    troca_garantia2: form.troca_garantia2,
    troca_pulseira2: form.troca_pulseira2,
    troca_ciclos2: form.troca_ciclos2,
    troca_condicao2: form.troca_condicao2 || "SEMINOVO",
  });

  // Helper: clear product fields in form (keeps payment fields intact for multi-product)
  const clearProductFields = () => {
    setForm(f => ({
      ...f,
      produto: "", fornecedor: "",
      custo: "", preco_vendido: "",
      serial_no: "", imei: "",
      produto_na_troca: "", troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "",
      troca_obs: "", troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
      troca_serial: "", troca_imei: "",
      produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "",
      troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
      troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
    }));
    setCatSel("");
    setEstoqueId("");
    setProdutoManual(false);
    setShowSegundaTroca(false); setTrocaEnabled(false);
    // Resetar trocaRow/trocaRow2 tambem — sao a fonte de verdade lida pelo
    // ProdutoSpecFields e getCurrentProductFields cai nelas via fallback.
    // Sem isso, o proximo produto adicionado ao carrinho herdava a troca do
    // anterior (bug: mesma troca contava duas vezes em multi-produto).
    setTrocaRow(createEmptyProdutoRow());
    setTrocaRow2(createEmptyProdutoRow());
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

    if (!form.origem) {
      setMsg("Selecione a ORIGEM da venda");
      return;
    }

    if (!form.tipo) {
      setMsg("Selecione o TIPO da venda");
      return;
    }

    // Collect all products: cart items + current form.
    // Regra: so inclui o form como venda adicional se tiver um PRODUTO NOVO preenchido
    // (form.produto). Dados so de troca/trocaRow NAO geram venda nova — sao copiados
    // pro primeiro item do carrinho via globalTroca (linhas 1315-1322).
    // Bug fixado: cliente com carrinho + so troca no form global criava venda fantasma
    // sem produto (R$ 0 em tudo).
    // Pra o cenario sem carrinho (venda apenas de troca/so-troca-value), aceita se
    // o usuario preencheu explicitamente alguma informacao de produto/troca.
    const allProducts: ProdutoCarrinho[] = [...produtosCarrinho];
    const formTemProduto = !!form.produto;
    const formSoTemTroca = !form.produto && !!(form.troca_produto || trocaRow.produto || parseFloat(form.produto_na_troca) > 0);
    if (formTemProduto) {
      allProducts.push(getCurrentProductFields());
    } else if (formSoTemTroca && produtosCarrinho.length === 0) {
      // Sem carrinho e so tem troca — aceita (caso de so-troca-valor, sem produto novo)
      allProducts.push(getCurrentProductFields());
    }
    // Se tem carrinho E form so tem troca: troca vai pro primeiro item via globalTroca
    // abaixo. Nao cria venda fantasma.

    if (allProducts.length === 0) {
      setMsg("Preencha ao menos o produto da compra, da troca ou adicione ao carrinho");
      return;
    }

    // Forma de pagamento é opcional — se não preenchida, venda vai como "Em Andamento" (AGUARDANDO)
    // e o pagamento pode ser registrado depois na aba "Em Andamento"

    // Validação: comprovante obrigatório para vendas no CARTÃO (só se tem permissão de ver histórico).
    // No modo "Datas diferentes" cada pagamento em pagEntries tem sua propria forma/valor/comprovante.
    if (!multiDatePagamento && podeVerHistorico && (form.forma === "CARTAO" || form.forma === "LINK" || form.forma === "DEBITO") && !(parseFloat(form.valor_comprovante_input) > 0)) {
      setMsg("⚠️ Preencha o VALOR DO COMPROVANTE para vendas no cartão/débito");
      return;
    }

    setSaving(true);
    setMsg("");

    // Build payloads for all products
    // Se tem carrinho, atribuir a troca global ao primeiro produto
    if (allProducts.length > 1) {
      const globalTroca1 = form.produto_na_troca;
      const globalTroca2 = form.produto_na_troca2;
      if ((parseFloat(globalTroca1) || 0) > 0 && !(parseFloat(allProducts[0].produto_na_troca) > 0)) {
        allProducts[0] = { ...allProducts[0], produto_na_troca: globalTroca1, troca_produto: form.troca_produto, troca_cor: form.troca_cor, troca_bateria: form.troca_bateria, troca_obs: form.troca_obs, troca_grade: form.troca_grade, troca_caixa: form.troca_caixa, troca_cabo: form.troca_cabo, troca_fonte: form.troca_fonte, troca_pulseira: form.troca_pulseira, troca_ciclos: form.troca_ciclos };
      }
      if ((parseFloat(globalTroca2) || 0) > 0 && !(parseFloat(allProducts[0].produto_na_troca2) > 0)) {
        allProducts[0] = { ...allProducts[0], produto_na_troca2: globalTroca2, troca_produto2: form.troca_produto2, troca_cor2: form.troca_cor2, troca_bateria2: form.troca_bateria2, troca_obs2: form.troca_obs2 };
      }
    }
    const payloads: Record<string, unknown>[] = [];
    for (const prod of allProducts) {
      payloads.push(buildPayload(prod));
    }
    // Multi-produto: entrada_pix_2 fica inteira no primeiro payload (nao
    // distribuimos proporcional como entrada_pix — mantem a logica simples e
    // os saldos continuam somando ao total correto porque leitura e por row).
    for (let i = 1; i < payloads.length; i++) {
      payloads[i].entrada_pix_2 = 0;
      payloads[i].banco_pix_2 = null;
    }
    // Single-product: se tem segundo cartão, SEMPRE recalcular preco_vendido como
    // líquido(cartão principal) + líquido(2o cartão) + pix + espécie + troca
    if (payloads.length === 1) {
      const gCompAlt = parseFloat(form.comp_alt) || 0;
      if (gCompAlt > 0) {
        const gCompPrinc = Number(payloads[0].valor_comprovante || 0);
        const gEntradaPix = parseFloat(form.entrada_pix) || 0;
        const gEntradaPix2 = parseFloat(form.entrada_pix_2) || 0;
        const gEntradaEspecie = parseFloat(form.entrada_especie) || 0;
        const gTroca = parseFloat(String(payloads[0].produto_na_troca || "0")) || 0;
        const gForma = String(payloads[0].forma || form.forma);
        const gBanco = gForma === "LINK" ? "MERCADO_PAGO" : String(payloads[0].banco || form.banco);
        const gParcelas = parseInt(form.qnt_parcelas) || 0;
        const gBandeira = form.bandeira || null;
        const gTaxa = (gForma === "CARTAO" || gForma === "LINK")
          ? getTaxa(gBanco, gBandeira, gParcelas, gForma === "LINK" ? "CARTAO" : gForma)
          : gForma === "DEBITO" ? 0.75
          : 0;
        // Taxa do 2o cartão
        const gTaxaAlt = getTaxa(
          (form.forma_alt || form.forma) === "LINK" ? "MERCADO_PAGO" : (form.banco_alt || "ITAU"),
          form.band_alt || null,
          parseInt(form.parc_alt) || 0,
          ((form.forma_alt || form.forma || "CARTAO") === "LINK" ? "CARTAO" : (form.forma_alt || form.forma || "CARTAO")) as "CARTAO" | "DEBITO"
        );
        // preco_vendido = valor LIQUIDO (o que entrou no bolso após taxa) — fix bug lucro exorbitante
        const liquidoPrinc = gTaxa > 0 ? calcularLiquido(gCompPrinc, gTaxa) : gCompPrinc;
        const liquidoAlt = gTaxaAlt > 0 ? calcularLiquido(gCompAlt, gTaxaAlt) : gCompAlt;
        payloads[0].preco_vendido = Math.round(liquidoPrinc + liquidoAlt + gEntradaPix + gEntradaPix2 + gEntradaEspecie + gTroca);
      }
    }
    if (payloads.length > 1) {
      const comprovanteTotal = Number(payloads[0]?.valor_comprovante || 0);
      const gEntradaPix = parseFloat(form.entrada_pix) || 0;
      const gEntradaPix2 = parseFloat(form.entrada_pix_2) || 0;
      const gEntradaEspecie = parseFloat(form.entrada_especie) || 0;
      // Redistribuir sempre que há algum pagamento global — comprovante, PIX (1o ou 2o) ou espécie
      if (comprovanteTotal > 0 || gEntradaPix > 0 || gEntradaPix2 > 0 || gEntradaEspecie > 0) {
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
            : gForma === "DEBITO" ? 0.75
            : 0;

          // Cartão alternativo (2o cartão) — taxa própria
          const gCompAlt = parseFloat(form.comp_alt) || 0;
          const gTaxaAlt = gCompAlt > 0 ? getTaxa(
            (form.forma_alt || form.forma) === "LINK" ? "MERCADO_PAGO" : (form.banco_alt || "ITAU"),
            form.band_alt || null,
            parseInt(form.parc_alt) || 0,
            ((form.forma_alt || form.forma || "CARTAO") === "LINK" ? "CARTAO" : (form.forma_alt || form.forma || "CARTAO")) as "CARTAO" | "DEBITO"
          ) : 0;

          // Trocas são por produto — somar todas as trocas de todos os produtos
          const totalTrocas = payloads.reduce((s, p) => s + (parseFloat(String(p.produto_na_troca)) || 0), 0);

          // Converter BRUTO dos cartões em LIQUIDO (descontando taxa) — fix bug lucro exorbitante
          const liquidoCartao = gTaxa > 0 ? calcularLiquido(comprovanteTotal, gTaxa) : comprovanteTotal;
          const liquidoCartaoAlt = gCompAlt > 0 && gTaxaAlt > 0 ? calcularLiquido(gCompAlt, gTaxaAlt) : gCompAlt;
          // preco_vendido = valor LIQUIDO (o que entrou no bolso após taxa)
          // gEntradaPix2 entra no total; na distribuicao fica inteira na row 0
          // (ver bloco logo apos buildPayload), entao nao precisa distribuir.
          const totalRecebido = liquidoCartao + liquidoCartaoAlt + gEntradaPix + gEntradaPix2 + gEntradaEspecie + totalTrocas;

          let vendidoDistribuido = 0;
          let pixDistribuido = 0;
          let especieDistribuido = 0;
          // Passo 1: distribuir preco_vendido, entrada_pix, entrada_especie proporcional ao custo
          for (let i = 0; i < payloads.length; i++) {
            const custoItem = Number(payloads[i].custo || 0);
            const proporcao = custoItem / totalCusto;

            if (i === payloads.length - 1) {
              // Last item gets the remainder (avoids rounding errors)
              payloads[i].preco_vendido = Math.round(totalRecebido - vendidoDistribuido);
              payloads[i].entrada_pix = Math.round((gEntradaPix - pixDistribuido) * 100) / 100;
              payloads[i].entrada_especie = Math.round((gEntradaEspecie - especieDistribuido) * 100) / 100;
            } else {
              const vendidoProporcional = Math.round(totalRecebido * proporcao);
              const pixProporcional = Math.round(gEntradaPix * proporcao * 100) / 100;
              const especieProporcional = Math.round(gEntradaEspecie * proporcao * 100) / 100;
              payloads[i].preco_vendido = vendidoProporcional;
              payloads[i].entrada_pix = pixProporcional;
              payloads[i].entrada_especie = especieProporcional;
              vendidoDistribuido += vendidoProporcional;
              pixDistribuido += pixProporcional;
              especieDistribuido += especieProporcional;
            }
          }
          // Passo 2: valor_comprovante por produto = preco - troca_do_produto - pix - pix2 - especie
          // (troca pertence a UM produto específico, não pode ser distribuída; comprovante fecha a conta)
          // Se forma é cartão com taxa, converte líquido -> bruto
          for (let i = 0; i < payloads.length; i++) {
            const preco = Number(payloads[i].preco_vendido || 0);
            const troca = parseFloat(String(payloads[i].produto_na_troca || "0")) || 0;
            const pix = Number(payloads[i].entrada_pix || 0);
            const pix2 = Number(payloads[i].entrada_pix_2 || 0);
            const esp = Number(payloads[i].entrada_especie || 0);
            const compLiquido = preco - troca - pix - pix2 - esp;
            payloads[i].valor_comprovante = gTaxa > 0 && compLiquido > 0
              ? Math.round(compLiquido / (1 - gTaxa / 100))
              : Math.max(0, Math.round(compLiquido));
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
      const clienteInfo = { cliente: form.cliente, cpf: form.cpf, cnpj: form.cnpj, email: form.email, telefone: form.telefone, endereco: form.endereco, pessoa: form.pessoa, origem: form.origem, tipo: form.tipo };
      setLastClienteData(clienteInfo);
      setProdutosCarrinho([]);
      clearProductFields();
      const plural = payloads.length > 1 ? "s" : "";
      setMsg(`Sem conexao — ${payloads.length} venda${plural} salva${plural} localmente. Sera sincronizada quando a internet voltar.`);
      setSaving(false);
      return;
    }

    // MODO EDIÇÃO: atualizar venda(s) existente(s) via PATCH
    if (editandoVendaId) {
      try {
        // Edição de grupo (múltiplas vendas)
        // Agora suporta adicionar/remover produtos: PATCH existentes, POST novos, DELETE removidos.
        if (editandoGrupoIds.length > 1 || (editandoGrupoIds.length >= 1 && allProducts.length > editandoGrupoIds.length)) {
          // Build payloads and redistribute valor_comprovante/preco_vendido proportionally
          const groupPayloads: Record<string, unknown>[] = allProducts.map(p => buildPayload(p));
          // Multi-produto: entrada_pix_2 fica inteira na primeira row (mesmo
          // tratamento do fluxo Nova Venda).
          for (let i = 1; i < groupPayloads.length; i++) {
            groupPayloads[i].entrada_pix_2 = 0;
            groupPayloads[i].banco_pix_2 = null;
          }
          const comprovanteTotal = Number(groupPayloads[0]?.valor_comprovante || 0);
          const gEntradaPix = parseFloat(form.entrada_pix) || 0;
          const gEntradaPix2 = parseFloat(form.entrada_pix_2) || 0;
          const gEntradaEspecie = parseFloat(form.entrada_especie) || 0;
          if (comprovanteTotal > 0 || gEntradaPix > 0 || gEntradaPix2 > 0 || gEntradaEspecie > 0) {
            const totalCusto = groupPayloads.reduce((s, p) => s + Number(p.custo || 0), 0);
            if (totalCusto > 0) {
              const gForma = form.forma;
              const gBanco = gForma === "LINK" ? "MERCADO_PAGO" : form.banco;
              const gParcelas = parseInt(form.qnt_parcelas) || 0;
              const gBandeira = form.bandeira || null;
              const gTaxa = (gForma === "CARTAO" || gForma === "LINK")
                ? getTaxa(gBanco, gBandeira, gParcelas, gForma === "LINK" ? "CARTAO" : gForma)
                : gForma === "DEBITO" ? 0.75
                : 0;
              const gCompAlt = parseFloat(form.comp_alt) || 0;
              const gTaxaAlt = gCompAlt > 0 ? getTaxa(
                (form.forma_alt || form.forma) === "LINK" ? "MERCADO_PAGO" : (form.banco_alt || "ITAU"),
                form.band_alt || null,
                parseInt(form.parc_alt) || 0,
                ((form.forma_alt || form.forma || "CARTAO") === "LINK" ? "CARTAO" : (form.forma_alt || form.forma || "CARTAO")) as "CARTAO" | "DEBITO"
              ) : 0;
              const totalTrocas = groupPayloads.reduce((s, p) => s + (parseFloat(String(p.produto_na_troca)) || 0), 0);
              // Converter BRUTO dos cartões em LIQUIDO — fix bug lucro exorbitante
              const liquidoCartao = gTaxa > 0 ? calcularLiquido(comprovanteTotal, gTaxa) : comprovanteTotal;
              const liquidoCartaoAlt = gCompAlt > 0 && gTaxaAlt > 0 ? calcularLiquido(gCompAlt, gTaxaAlt) : gCompAlt;
              // preco_vendido = valor LIQUIDO (o que entrou no bolso após taxa).
              // gEntradaPix2 entra no total; na distribuicao fica inteira na row 0.
              const totalRecebido = liquidoCartao + liquidoCartaoAlt + gEntradaPix + gEntradaPix2 + gEntradaEspecie + totalTrocas;

              let vendidoDistribuido = 0;
              let pixDistribuido = 0;
              let especieDistribuido = 0;
              // Passo 1: distribuir preco_vendido, entrada_pix, entrada_especie proporcional ao custo
              for (let i = 0; i < groupPayloads.length; i++) {
                const custoItem = Number(groupPayloads[i].custo || 0);
                const proporcao = custoItem / totalCusto;
                if (i === groupPayloads.length - 1) {
                  groupPayloads[i].preco_vendido = Math.round(totalRecebido - vendidoDistribuido);
                  groupPayloads[i].entrada_pix = Math.round((gEntradaPix - pixDistribuido) * 100) / 100;
                  groupPayloads[i].entrada_especie = Math.round((gEntradaEspecie - especieDistribuido) * 100) / 100;
                } else {
                  const vendidoProporcional = Math.round(totalRecebido * proporcao);
                  const pixProporcional = Math.round(gEntradaPix * proporcao * 100) / 100;
                  const especieProporcional = Math.round(gEntradaEspecie * proporcao * 100) / 100;
                  groupPayloads[i].preco_vendido = vendidoProporcional;
                  groupPayloads[i].entrada_pix = pixProporcional;
                  groupPayloads[i].entrada_especie = especieProporcional;
                  vendidoDistribuido += vendidoProporcional;
                  pixDistribuido += pixProporcional;
                  especieDistribuido += especieProporcional;
                }
              }
              // Passo 2: valor_comprovante por produto = preco - troca_do_produto - pix - pix2 - especie
              // (troca pertence a UM produto; comprovante fecha a conta de cada venda)
              for (let i = 0; i < groupPayloads.length; i++) {
                const preco = Number(groupPayloads[i].preco_vendido || 0);
                const troca = parseFloat(String(groupPayloads[i].produto_na_troca || "0")) || 0;
                const pix = Number(groupPayloads[i].entrada_pix || 0);
                const pix2 = Number(groupPayloads[i].entrada_pix_2 || 0);
                const esp = Number(groupPayloads[i].entrada_especie || 0);
                const compLiquido = preco - troca - pix - pix2 - esp;
                groupPayloads[i].valor_comprovante = gTaxa > 0 && compLiquido > 0
                  ? Math.round(compLiquido / (1 - gTaxa / 100))
                  : Math.max(0, Math.round(compLiquido));
              }
            }
          }

          // Descobrir grupo_id original (pra novos itens vincularem ao mesmo grupo).
          // Se a venda original nao tem grupo_id (era venda unica) e estamos adicionando
          // novos produtos, gera um UUID real pra agrupar todos.
          const primeiraVenda = vendas.find(v => v.id === editandoGrupoIds[0]);
          const grupoIdExistente = (primeiraVenda as unknown as { grupo_id?: string })?.grupo_id;
          const precisaCriarGrupo = !grupoIdExistente && allProducts.length > editandoGrupoIds.length;
          const grupoIdOriginal = grupoIdExistente
            || (precisaCriarGrupo ? crypto.randomUUID() : editandoGrupoIds[0]);

          let allOk = true;
          // Acumula divergencias de SKU (nao quebra o loop) — assim o admin
          // ve TODAS as linhas problematicas de uma vez em vez de salvar
          // varias vezes descobrindo 1 por vez.
          const skuDivergencias: SkuDivergencia[] = [];
          let primeiroErroNaoSku = "";

          // 1. PATCH nos produtos que casam com vendas existentes.
          // Se estamos criando grupo novo (venda unica virando multi), propaga grupo_id
          // pro PATCH pra original tambem entrar no mesmo grupo.
          const nPatch = Math.min(allProducts.length, editandoGrupoIds.length);
          for (let i = 0; i < nPatch; i++) {
            const patchBody: Record<string, unknown> = { id: editandoGrupoIds[i], ...groupPayloads[i] };
            if (precisaCriarGrupo) patchBody.grupo_id = grupoIdOriginal;
            if (skuOverrideRef.current) patchBody._sku_override = true;
            const res = await fetch("/api/vendas", {
              method: "PATCH",
              headers: { "Content-Type": "application/json", "x-admin-password": password },
              body: JSON.stringify(patchBody),
            });
            const json = await res.json();
            if (!json.ok && !json.data) {
              if (json.codigo === "SKU_DIVERGENTE") {
                // Coleta e continua — vai reportar tudo no final.
                skuDivergencias.push(json);
                allOk = false;
              } else if (!primeiroErroNaoSku) {
                // Outros erros (nao SKU): guarda o primeiro e quebra o loop.
                primeiroErroNaoSku = "Erro ao atualizar: " + (json.error || "erro desconhecido");
                allOk = false;
                break;
              }
            }
          }

          // 2. POST novos produtos (se allProducts.length > editandoGrupoIds.length)
          // So roda se fase 1 passou 100% — divergencias de SKU em PATCH
          // existentes impedem avancar pra criar itens novos sem admin revisar.
          if (allOk && allProducts.length > editandoGrupoIds.length) {
            for (let i = editandoGrupoIds.length; i < allProducts.length; i++) {
              const payload: Record<string, unknown> = { ...groupPayloads[i], grupo_id: grupoIdOriginal };
              if (skuOverrideRef.current) payload._sku_override = true;
              const res = await fetch("/api/vendas", {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-admin-password": password },
                body: JSON.stringify(payload),
              });
              const json = await res.json();
              if (!json.ok && !json.data) {
                if (json.codigo === "SKU_DIVERGENTE") {
                  skuDivergencias.push(json);
                  allOk = false;
                } else if (!primeiroErroNaoSku) {
                  primeiroErroNaoSku = "Erro ao criar novo item: " + (json.error || "erro desconhecido");
                  allOk = false;
                  break;
                }
              }
            }
          }

          // Se teve divergencia de SKU em qualquer fase, mostra alerta agregado
          if (skuDivergencias.length > 0) {
            setMsg(formatSkuDivergenciasMultiplas(skuDivergencias));
            setSkuAlertaAtivo(true);
          } else if (primeiroErroNaoSku) {
            setMsg(primeiroErroNaoSku);
          }

          // 3. DELETE vendas removidas (se allProducts.length < editandoGrupoIds.length)
          if (allOk && allProducts.length < editandoGrupoIds.length) {
            for (let i = allProducts.length; i < editandoGrupoIds.length; i++) {
              const res = await fetch(`/api/vendas?id=${editandoGrupoIds[i]}`, {
                method: "DELETE",
                headers: { "x-admin-password": password },
              });
              if (!res.ok) { allOk = false; setMsg("Erro ao remover item"); break; }
            }
          }

          if (allOk) {
            const msgFinal = allProducts.length === editandoGrupoIds.length
              ? `${editandoGrupoIds.length} vendas atualizadas com sucesso!`
              : allProducts.length > editandoGrupoIds.length
                ? `${editandoGrupoIds.length} atualizadas + ${allProducts.length - editandoGrupoIds.length} novas criadas!`
                : `${allProducts.length} atualizadas + ${editandoGrupoIds.length - allProducts.length} removidas!`;
            setEditandoVendaId(null); setEstoqueIdOriginal(null); setStatusPagamentoOriginal(null);
            setEditandoGrupoIds([]);
            setDuplicadoInfo(null);
            setProdutosCarrinho([]);
            setLastClienteData(null);
            // Limpar TODOS os campos (cliente + produto) após edição
            setForm({
              data: hojeBR(),
              cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF" as "PF" | "PJ", origem: "", tipo: "", produto: "", fornecedor: "",
              custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
              qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
              entrada_pix: "", banco_pix: "ITAU", entrada_pix_2: "", banco_pix_2: "INFINITE", entrada_especie: "", banco_2nd: "", banco_alt: "",
              forma_alt: "", parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "", forma_sinal: "PIX",
              entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
              valor_total_venda: "",
              troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "", troca_obs: "",
              troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
              troca_serial: "", troca_imei: "",
              produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
              troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
              serial_no: "", imei: "",
              cep: "", bairro: "", cidade: "", uf: "",
              frete_valor: "", frete_recebido: false, frete_forma: "", frete_banco: "", frete_parcelas: "", frete_bandeira: "", usar_credito_loja: "", codigo_rastreio: "",
              is_brinde: false,
            });
            setCatSel(""); setEstoqueId(""); setProdutoManual(false); setShowSegundaTroca(false);
            localStorage.removeItem("tigrao_venda_draft");
            setMsg(msgFinal);
            setSkuAlertaAtivo(false);
            skuOverrideRef.current = false;
            fetchVendas();
            fetchEstoque();
          }
        } else {
          // Edição simples (1 produto)
          const prod = allProducts[0];
          const payload = buildPayload(prod);
          const body: Record<string, unknown> = { id: editandoVendaId, ...payload };
          if (skuOverrideRef.current) body._sku_override = true;
          const res = await fetch("/api/vendas", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "x-admin-password": password },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          if (json.ok || json.data) {
            setEditandoVendaId(null); setEstoqueIdOriginal(null); setStatusPagamentoOriginal(null);
            setEditandoGrupoIds([]);
            setDuplicadoInfo(null);
            setProdutosCarrinho([]);
            setLastClienteData(null);
            // Limpar TODOS os campos (cliente + produto) após edição
            setForm({
              data: hojeBR(),
              cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF" as "PF" | "PJ", origem: "", tipo: "", produto: "", fornecedor: "",
              custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
              qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
              entrada_pix: "", banco_pix: "ITAU", entrada_pix_2: "", banco_pix_2: "INFINITE", entrada_especie: "", banco_2nd: "", banco_alt: "",
              forma_alt: "", parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "", forma_sinal: "PIX",
              entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
              valor_total_venda: "",
              troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "", troca_obs: "",
              troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
              troca_serial: "", troca_imei: "",
              produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
              troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
              serial_no: "", imei: "",
              cep: "", bairro: "", cidade: "", uf: "",
              frete_valor: "", frete_recebido: false, frete_forma: "", frete_banco: "", frete_parcelas: "", frete_bandeira: "", usar_credito_loja: "", codigo_rastreio: "",
              is_brinde: false,
            });
            setCatSel(""); setEstoqueId(""); setProdutoManual(false); setShowSegundaTroca(false);
            localStorage.removeItem("tigrao_venda_draft");
            setMsg("Venda atualizada com sucesso!");
            // Sucesso — resetar estado do alerta/override
            setSkuAlertaAtivo(false);
            skuOverrideRef.current = false;
            fetchVendas();
            fetchEstoque();
          } else {
            // Se backend retornou SKU_DIVERGENTE, mostra mensagem detalhada.
            // Senao, erro generico.
            setMsg(
              json.codigo === "SKU_DIVERGENTE"
                ? formatSkuDivergenciaMsg(json)
                : "Erro ao atualizar: " + (json.error || "erro desconhecido"),
            );
            if (json.codigo === "SKU_DIVERGENTE") {
              setSkuAlertaAtivo(true);
            } else {
              // Erro diferente → limpa flag pra proximo save nao carregar override
              setSkuAlertaAtivo(false);
              skuOverrideRef.current = false;
            }
          }
        }
      } catch {
        setMsg("Erro de rede ao atualizar venda");
      }
      setSaving(false);
      return;
    }

    // Multi-produto: gerar grupo_id para vincular vendas da mesma transação
    const grupoId = payloads.length > 1 ? crypto.randomUUID() : null;
    if (grupoId) {
      for (const p of payloads) p.grupo_id = grupoId;
    }

    let successCount = 0;
    const errors: string[] = [];
    const savedVendaIds: string[] = [];
    // Acumula divergencias de SKU pra mostrar tudo de uma vez no final
    // (multi-produto com varios erros SKU = 1 alerta consolidado).
    const skuDivergenciasPost: SkuDivergencia[] = [];

    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i];
      const prod = allProducts[i];

      try {
        const bodyFinal = skuOverrideRef.current
          ? { ...payload, _sku_override: true }
          : payload;
        const res = await fetch("/api/vendas", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
          body: JSON.stringify(bodyFinal),
        });
        const json = await res.json();
        if (json.ok) {
          successCount++;
          if (json.data?.id) savedVendaIds.push(json.data.id);
          if (json.creditoDebitError) {
            errors.push(`⚠️ Crédito lojista: ${json.creditoDebitError}`);
          }
        } else if (json.codigo === "SKU_DIVERGENTE") {
          // Alerta: coleta e continua o loop pra reportar TODOS os SKUs
          // divergentes de uma vez (evita admin salvar varias vezes).
          skuDivergenciasPost.push(json);
        } else {
          errors.push(`${prod.produto}: ${json.error}`);
        }
      } catch {
        // Network error during online attempt — save to offline queue
        addToQueue(payload);
        setOfflineCount(getQueueCount());
        errors.push(`${prod.produto}: salva offline (erro de rede)`);
      }
    }

    // Se teve divergencias SKU, ativa o alerta agregado (setMsg vem depois)
    if (skuDivergenciasPost.length > 0) {
      setSkuAlertaAtivo(true);
    }

    if (successCount > 0) {
      // Sucesso — resetar estado do alerta/override pra nao carregar no proximo save
      setSkuAlertaAtivo(false);
      skuOverrideRef.current = false;
      setDuplicadoInfo(null);
      setLastClienteData(null);
      setProdutosCarrinho([]);
      // Limpar TODOS os campos do formulário para a próxima venda
      setForm({
        data: hojeBR(),
        cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF" as "PF" | "PJ", origem: "", tipo: "", produto: "", fornecedor: "",
        custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
        qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
        entrada_pix: "", banco_pix: "ITAU", entrada_pix_2: "", banco_pix_2: "INFINITE", entrada_especie: "", banco_2nd: "", banco_alt: "",
        forma_alt: "", parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "", forma_sinal: "PIX",
        entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
        valor_total_venda: "",
        troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "", troca_obs: "",
        troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
        troca_serial: "", troca_imei: "",
        produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
        troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
        serial_no: "", imei: "",
        cep: "", bairro: "", cidade: "", uf: "",
        frete_valor: "", frete_recebido: false, frete_forma: "", frete_banco: "", frete_parcelas: "", frete_bandeira: "", usar_credito_loja: "", codigo_rastreio: "",
        is_brinde: false,
      });
      setCatSel("");
      setEstoqueId("");
      setProdutoManual(false);
      setShowSegundaTroca(false); setTrocaEnabled(false);
      setTrocaRow(createEmptyProdutoRow()); setTrocaRow2(createEmptyProdutoRow());
      setSerialBusca(""); setScanMsg("");
      setVendaProgramada(false); setProgramadaJaPago(false); setProgramadaComSinal(false); setDataProgramada(""); setMultiDatePagamento(false); setPagEntries([]);
      localStorage.removeItem("tigrao_venda_draft");
      const statusTxt = vendaProgramada ? "programada" : "registrada";
      const plural = successCount > 1 ? "s" : "";
      const totalFalhas = errors.length + skuDivergenciasPost.length;
      setMsg(`${successCount} venda${plural} ${statusTxt}${plural}!${totalFalhas > 0 ? ` (${totalFalhas} erro${totalFalhas > 1 ? "s" : ""})` : ""}`);
      fetchVendas();
      fetchEstoque();
      // NF é adicionada depois nas vendas pendentes, não no momento do registro

      // Entrega NÃO é criada automaticamente — equipe cria manualmente na agenda
    } else if (skuDivergenciasPost.length > 0) {
      // Nenhuma venda registrada + todas bateram SKU_DIVERGENTE → alerta consolidado
      setMsg(formatSkuDivergenciasMultiplas(skuDivergenciasPost));
    } else {
      setMsg("Erro: " + errors.join("; "));
    }
    setSaving(false);
  };

  // Parser de texto colado (formulário WhatsApp)
  const parseClienteText = (text: string) => {
    const lines = text.split("\n").map(l => l.trim());
    const r: Record<string, string> = {};
    const extractValue = (line: string) => line.replace(/\*/g, "").replace(/^[✅⚠️📌🤔]*\s*/g, "").replace(/^[^:：]+[:：]\s*/, "").trim();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase().replace(/[✅⚠️📌🤔*]/g, "").trim();
      if (!lower || lower.length < 3) continue;

      // Nome completo / Razão Social
      if (lower.includes("nome completo") || lower.match(/^nome\s*[:：]/) || lower.includes("razão social") || lower.includes("razao social")) {
        r.nome = extractValue(line);
      }
      // CNPJ
      else if (lower.includes("cnpj")) {
        const m = line.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-.\s]?\d{2}/);
        if (m) r.cnpj = m[0];
      }
      // CPF
      else if (lower.includes("cpf")) {
        const m = line.match(/\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2}/);
        if (m) r.cpf = m[0];
      }
      // Email
      else if (lower.includes("e-mail") || lower.includes("email")) {
        const m = line.match(/[\w.+-]+@[\w.-]+\.\w+/);
        if (m) r.email = m[0];
      }
      // Telefone
      else if (lower.includes("telefone") || lower.includes("celular") || lower.includes("whatsapp") || lower.includes("contato")) {
        const m = line.match(/\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/);
        if (m) r.telefone = m[0];
      }
      // CEP
      else if (lower.includes("cep")) {
        const m = line.match(/\d{5}[-.\s]?\d{3}/);
        if (m) r.cep = m[0];
      }
      // Bairro
      else if (lower.includes("bairro")) {
        r.bairro = extractValue(line);
      }
      // Endereço
      else if (lower.includes("endereço") || lower.includes("endereco") || lower.match(/^end[\s.:]/)) {
        r.endereco = extractValue(line);
        if (i + 1 < lines.length && !lines[i + 1].includes(":") && !lines[i + 1].startsWith("✅") && lines[i + 1].length > 3) {
          r.endereco += " " + lines[i + 1].trim();
        }
      }
      // Modelo / Produto
      else if (lower.includes("modelo escolhido") || lower.includes("modelo:") || lower.includes("produto escolhido")) {
        r.produto = extractValue(line);
      }
      // Valor
      else if ((lower.includes("valor no pix") || lower.includes("valor:") || lower.includes("valor total")) && !lower.includes("pagamento")) {
        const m = line.match(/[\d.,]+/g);
        if (m) r.valor = m[m.length - 1].replace(/\./g, "").replace(",", ".");
      }
      // Forma de pagamento
      else if (lower.includes("forma de pagamento") || lower.includes("forma pagamento")) {
        const v = extractValue(line).toUpperCase();
        if (v.includes("PIX")) r.forma = "PIX";
        else if (v.includes("CARTAO") || v.includes("CARTÃO") || v.includes("CREDITO") || v.includes("CRÉDITO")) r.forma = "CARTAO";
        else if (v.includes("ESPECIE") || v.includes("ESPÉCIE") || v.includes("DINHEIRO")) r.forma = "ESPECIE";
        else r.forma = v;
      }
      // Como conheceu (origem)
      else if (lower.includes("como conheceu") || lower.includes("como nos conheceu")) {
        const v = extractValue(line).toLowerCase();
        if (v.includes("instagram") || v.includes("insta")) r.origem = "ANUNCIO";
        else if (v.includes("amig") || v.includes("indicaç") || v.includes("indicac") || v.includes("conhecid")) r.origem = "INDICACAO";
        else if (v.includes("google") || v.includes("anuncio") || v.includes("anúncio")) r.origem = "ANUNCIO";
        else if (v.includes("recompra") || v.includes("voltou") || v.includes("cliente antigo") || v.includes("ja sou cliente") || v.includes("já sou cliente") || v.includes("ja comprei") || v.includes("já comprei")) r.origem = "RECOMPRA";
        else if (v.includes("story") || v.includes("stories") || v.includes("post") || v.includes("reel")) r.origem = "ANUNCIO";
        // default: não seta origem, deixa a detecção de recompra por CPF decidir
      }
      // Entrega ou Retirada
      else if (lower.includes("retirada") && lower.includes("entrega")) {
        const v = extractValue(line).toLowerCase();
        if (v.includes("entrega")) r.local = "ENTREGA";
        else if (v.includes("retirada")) r.local = "RETIRADA";
      }
      // Horário
      else if (lower.includes("horário") || lower.includes("horario")) {
        r.horario = extractValue(line);
      }
    }
    return r;
  };

  const handlePasteConfirm = async () => {
    const r = parseClienteText(pasteText);
    if (r.nome) set("cliente", r.nome);
    if (r.cpf) set("cpf", r.cpf);
    if (r.cnpj) { set("cnpj", r.cnpj); set("pessoa", "PJ"); }
    if (r.email) set("email", r.email);
    if (r.telefone) set("telefone", r.telefone);
    if (r.endereco) set("endereco", r.endereco);
    if (r.cep) { set("cep", r.cep); fetchCep(r.cep.replace(/\D/g, "")); }
    if (r.bairro) set("bairro", r.bairro);
    if (r.local) set("local", r.local);
    if (r.forma) set("forma", r.forma);
    if (r.produto) set("produto", r.produto);
    if (r.valor) set("preco_vendido", r.valor);

    // Detectar recompra: verificar se CPF ou nome já tem vendas anteriores
    let isRecompra = false;
    if (r.cpf || r.nome) {
      try {
        const searchParam = r.cpf ? `cpf=${encodeURIComponent(r.cpf)}` : `cliente=${encodeURIComponent(r.nome)}`;
        const res = await fetch(`/api/vendas?action=check_recompra&${searchParam}`, {
          headers: { "x-admin-password": password },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.recompra) isRecompra = true;
        }
      } catch { /* ignore */ }
    }
    set("origem", isRecompra ? "RECOMPRA" : (r.origem || ""));

    setShowPasteModal(false);
    setPasteText("");
    const tipo = r.cnpj ? "PJ" : "PF";
    const campos = Object.keys(r).length;
    setMsg(r.nome ? `Dados ${tipo} preenchidos: ${r.nome} (${campos} campos)${isRecompra ? " — RECOMPRA detectada!" : ""}` : "Nenhum dado encontrado no texto");
  };

  // Exportar mês para Excel
  const handleExportar = async () => {
    setExportando(true);
    try {
      const mes = `${filtroAno}-${filtroMes}`;
      const res = await fetch(`/api/admin/exportar?mes=${mes}`, {
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
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

  // Exportar dia para Excel (backup completo)
  const handleExportarDia = async () => {
    setExportandoDia(true);
    try {
      const dia = filtroDia
        ? `${filtroAno}-${filtroMes}-${filtroDia.padStart(2, "0")}`
        : `${filtroAno}-${filtroMes}-${String(new Date().getDate()).padStart(2, "0")}`;
      const res = await fetch(`/api/admin/exportar?dia=${dia}`, {
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
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
      a.download = `tigrao-${dia}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Erro ao exportar: ${err}`);
    } finally {
      setExportandoDia(false);
    }
  };

  // ── Duplicar Venda ──
  const handleDuplicar = (v: Venda) => {
    setForm({
      data: hojeBR(), // hoje
      cliente: v.cliente,
      cpf: "",
      cnpj: "",
      email: "",
      telefone: "",
      endereco: "",
      pessoa: "PF",
      origem: v.origem || "",
      tipo: v.tipo || "",
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
      entrada_pix_2: "",
      banco_pix_2: v.banco_pix_2 || "INFINITE",
      entrada_especie: "",
      entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
      valor_total_venda: "",
      banco_2nd: v.banco_2nd || "",
      banco_alt: v.banco_alt || "",
      forma_alt: (v as unknown as Record<string, string>).forma_alt || "",
      parc_alt: String(v.parc_alt || ""),
      band_alt: v.band_alt || "",
      comp_alt: String(v.comp_alt || ""),
      sinal_antecipado: "",
      banco_sinal: "",
      forma_sinal: "PIX",
      troca_produto: "",
      troca_cor: "",
      troca_categoria: "",
      troca_bateria: "",
      troca_obs: "",
      troca_grade: "",
      troca_caixa: "",
      troca_cabo: "",
      troca_fonte: "",
      troca_pulseira: "",
      troca_ciclos: "",
      troca_garantia: "",
      troca_serial: "", troca_imei: "",
      produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
      troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
      serial_no: v.serial_no || "",
      imei: v.imei || "",
      cep: "",
      bairro: "",
      cidade: "",
      uf: "",
      frete_valor: "",
      frete_recebido: false, frete_forma: "", frete_banco: "", frete_parcelas: "", frete_bandeira: "", usar_credito_loja: "", codigo_rastreio: "",
      is_brinde: false,
    });
    setCatSel("");
    setEstoqueId("");
    setProdutoManual(true); // produto duplicado vai como manual
    setProdutosCarrinho([]); // limpar carrinho ao duplicar
    setShowSegundaTroca(false); setTrocaEnabled(false);
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
    const map = new Map<string, { cliente: string; ultimaData: string; ultimoProduto: string; qtd: number; origem: string; tipo: string; forma: string; banco: string; cpf: string; cnpj: string; email: string; endereco: string; cep: string; pessoa: string; bairro: string; cidade: string; uf: string }>();
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
          cpf: v.cpf || "",
          cnpj: v.cnpj || "",
          email: v.email || "",
          endereco: v.endereco || "",
          cep: v.cep || "",
          pessoa: v.pessoa || "PF",
          bairro: v.bairro || "",
          cidade: v.cidade || "",
          uf: v.uf || "",
        });
      } else {
        existing.qtd += 1;
      }
    }
    return Array.from(map.values()).slice(0, 5);
  })();

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors uppercase ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;
  const selectCls = inputCls;


  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto items-center flex-wrap">
        <div className="flex gap-2">
          {([
            { key: "nova", label: "Nova Venda", count: 0, color: "bg-[#E8740E]", visible: podeVerHistorico || !!(user?.permissoes?.includes("vendas_registrar")) },
            { key: "formularios", label: "📝 Formulários Preenchidos", count: vendas.filter(v => v.status_pagamento === "FORMULARIO_PREENCHIDO").length, color: "bg-indigo-500", visible: podeVerAndamento },
            { key: "andamento", label: "Em Andamento", count: vendas.filter(v => v.status_pagamento === "AGUARDANDO").length, color: "bg-yellow-500", visible: podeVerAndamento },
            { key: "hoje", label: "Finalizadas Hoje", count: vendas.filter(v => (v.status_pagamento === "FINALIZADO" || !v.status_pagamento) && (v.data_programada || v.data) === hojeStr).length, color: "bg-blue-500", visible: podeVerAndamento },
            { key: "finalizadas", label: "Histórico", count: vendas.filter(v => v.status_pagamento === "FINALIZADO" || !v.status_pagamento).length, color: "bg-green-600", visible: podeVerHistorico },
            { key: "programadas", label: "Programadas", count: vendas.filter(v => v.status_pagamento === "PROGRAMADA").length, color: "bg-purple-500", visible: podeVerAndamento },
            { key: "correios", label: "📦 Correios", count: vendas.filter(v => v.local === "CORREIO" && v.codigo_rastreio).length, color: "bg-blue-500", visible: podeVerAndamento },
          ] as const).filter(t => t.visible).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap ${tab === t.key ? `${t.color} text-white` : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#98989D]" : "bg-white border border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E]`}`}>
              {t.label}{t.count > 0 ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>

        {/* Filtros — só no histórico e em andamento */}
        {(tab === "andamento" || tab === "programadas" || tab === "hoje" || tab === "finalizadas" || tab === "correios") && (
          <div className="flex gap-1.5 items-center ml-auto flex-wrap">
            <input
              type="text"
              placeholder="Buscar nome ou CPF..."
              value={filtroCpf}
              onChange={(e) => setFiltroCpf(e.target.value)}
              className={`px-2 py-1.5 rounded-lg border text-xs w-[160px] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder:text-[#6E6E73]" : "bg-white border-[#D2D2D7] placeholder:text-[#86868B]"}`}
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
            {tab === "finalizadas" && isAdmin && (<>
              <button
                onClick={handleExportarDia}
                disabled={exportandoDia}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {exportandoDia ? "Exportando..." : `Exportar Dia${filtroDia ? ` ${filtroDia}` : ""}`}
              </button>
              <button
                onClick={handleExportar}
                disabled={exportando}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {exportando ? "Exportando..." : "Exportar Mes"}
              </button>
            </>)}
            {/* Filtro Brinde */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none whitespace-nowrap">
              <input type="checkbox" checked={filtroBrinde} onChange={(e) => setFiltroBrinde(e.target.checked)} className="w-3.5 h-3.5 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
              <span className="text-xs text-pink-700 font-medium">Apenas Brindes</span>
            </label>
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
                  {editandoGrupoIds.length > 1
                    ? `Editando ${editandoGrupoIds.length} produtos de ${form.cliente || "..."}`
                    : `Editando venda de ${form.cliente || "..."} — ${form.produto || "..."}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditandoVendaId(null); setEstoqueIdOriginal(null); setStatusPagamentoOriginal(null);
                  setEditandoGrupoIds([]);
                  setProdutosCarrinho([]);
                  setForm(f => ({ ...f, cliente: "", produto: "", custo: "", preco_vendido: "", forma: "" }));
                  setMsg("");
                }}
                className="text-xs text-red-500 hover:text-red-700 font-semibold"
              >
                Cancelar edicao
              </button>
            </div>
          )}

          {/* Hint: edicao de venda unica com produto no form e carrinho vazio. Avisa que
              digitar outro produto sobrescreve o atual — precisa clicar "Adicionar ao
              carrinho" primeiro pra preservar. */}
          {editandoVendaId && editandoGrupoIds.length <= 1 && form.produto && produtosCarrinho.length === 0 && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "#FFF8E1", border: "1px solid #FFC107", color: "#8D6E00" }}>
              💡 <strong>Pra adicionar OUTRO produto nesta venda:</strong> clique no botao verde <em>&quot;+ Adicionar Produto ao Carrinho&quot;</em> embaixo ANTES de digitar o novo produto. Senao os dados atuais sao sobrescritos.
            </div>
          )}

        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6`}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-base sm:text-lg font-bold text-[#1D1D1F]">Registrar Nova Venda</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setForm({
                    data: hojeBR(), cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF" as "PF" | "PJ", origem: "", tipo: "", produto: "", fornecedor: "",
                    custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
                    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
                    entrada_pix: "", banco_pix: "ITAU", entrada_pix_2: "", banco_pix_2: "INFINITE", entrada_especie: "", banco_2nd: "", banco_alt: "",
                    forma_alt: "", parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "", forma_sinal: "PIX",
                    entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
                    valor_total_venda: "",
                    troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "", troca_obs: "",
                    troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
                    troca_serial: "", troca_imei: "",
                    produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
                    troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
                    serial_no: "", imei: "", cep: "", bairro: "", cidade: "", uf: "",
                    frete_valor: "", frete_recebido: false, frete_forma: "", frete_banco: "", frete_parcelas: "", frete_bandeira: "", usar_credito_loja: "", codigo_rastreio: "",
                    is_brinde: false,
                  });
                  setCatSel(""); setEstoqueId(""); setProdutoManual(false); setShowSegundaTroca(false); setTrocaEnabled(false);
                  setProdutosCarrinho([]); setEditandoVendaId(null); setEstoqueIdOriginal(null); setStatusPagamentoOriginal(null); setEditandoGrupoIds([]); setDuplicadoInfo(null); setLastClienteData(null);
                  setTrocaRow(createEmptyProdutoRow()); setTrocaRow2(createEmptyProdutoRow());
                  setSerialBusca(""); setScanMsg("");
                  setVendaProgramada(false); setProgramadaJaPago(false); setProgramadaComSinal(false); setDataProgramada(""); setMultiDatePagamento(false); setPagEntries([]);
                  localStorage.removeItem("tigrao_venda_draft");
                  setMsg("Formulario limpo!");
                  setTimeout(() => setMsg(""), 2000);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${dm ? "text-[#98989D] border-[#3A3A3C] hover:text-red-400 hover:border-red-400" : "text-[#86868B] border-[#D2D2D7] hover:text-red-500 hover:border-red-500"} border`}
              >
                🗑️ Limpar
              </button>
              <button
                onClick={() => setShowPasteModal(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#E8740E] border border-[#E8740E] hover:bg-[#FFF8F0] transition-colors"
              >
                📋 Colar dados cliente
              </button>
            </div>
          </div>

          {/* Indicador de venda duplicada */}
          {duplicadoInfo && (
            <div className={`flex items-center justify-between px-4 py-2.5 border rounded-xl ${dm ? "bg-blue-900/30 border-blue-700 text-blue-300" : "bg-blue-50 border-blue-200"}`}>
              <span className={`text-xs ${dm ? "text-blue-300" : "text-blue-700"}`}>
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

          {/* Modal QR Scanner */}
          {showQRScanner && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={handleStopQR}>
              <div className={`rounded-2xl p-4 w-80 shadow-2xl ${dm ? "bg-[#1C1C1E]" : "bg-white"}`} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`font-bold text-sm ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>📷 Scan QR Code da Etiqueta</span>
                  <button onClick={handleStopQR} className="text-[#86868B] hover:text-red-500 text-lg leading-none">✕</button>
                </div>
                <video ref={qrVideoRef} className="w-full rounded-xl bg-black aspect-square object-cover" playsInline muted />
                {qrScanMsg && <p className={`mt-2 text-xs text-center ${qrScanMsg.startsWith("❌") || qrScanMsg.startsWith("⚠️") ? "text-red-500" : "text-[#86868B]"}`}>{qrScanMsg}</p>}
                <button onClick={handleStopQR} className={`mt-3 w-full py-2 rounded-xl text-xs font-semibold transition-colors ${dm ? "bg-[#2C2C2E] text-[#98989D] hover:bg-[#3A3A3C]" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED]"}`}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Modal Scanner iPhone */}
          {iPhoneScanModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={handleCloseIPhoneScan}>
              <div className={`rounded-2xl p-5 w-80 shadow-2xl ${dm ? "bg-[#1C1C1E]" : "bg-white"}`} onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <span className={`font-bold text-sm ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>📱 Escanear com iPhone</span>
                  <button onClick={handleCloseIPhoneScan} className="text-[#86868B] hover:text-red-500 text-lg leading-none">✕</button>
                </div>
                {iPhoneScanStatus === "loading" && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <div className="w-8 h-8 border-2 border-[#E8740E] border-t-transparent rounded-full animate-spin" />
                    <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Gerando sessão...</p>
                  </div>
                )}
                {iPhoneScanStatus === "error" && (
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <p className="text-red-500 text-sm">Erro ao criar sessão. Verifique se a tabela scan_sessions foi criada no Supabase.</p>
                    <button onClick={handleCloseIPhoneScan} className={`px-4 py-2 rounded-xl text-xs font-semibold ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>Fechar</button>
                  </div>
                )}
                {iPhoneScanStatus === "waiting" && iPhoneScanToken && (() => {
                  const scanUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/scan?token=${iPhoneScanToken}`;
                  return (
                    <div className="flex flex-col items-center gap-4">
                      <p className={`text-xs text-center ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                        Escaneie o QR abaixo com o iPhone para abrir o scanner
                      </p>
                      <div className="p-2 bg-white rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(scanUrl)}`}
                          alt="QR code para abrir scanner no iPhone"
                          width={200} height={200}
                          className="rounded-lg"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#E8740E] animate-pulse" />
                        <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Aguardando iPhone escanear a etiqueta...</p>
                      </div>
                      <button onClick={handleCloseIPhoneScan} className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${dm ? "bg-[#2C2C2E] text-[#98989D] hover:text-[#F5F5F7]" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED]"}`}>Cancelar</button>
                    </div>
                  );
                })()}
              </div>
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
                <button onClick={() => { setShowPasteModal(false); setPasteText(""); }} className={`px-4 py-2 rounded-xl border text-sm transition-colors ${dm ? "border-[#3A3A3C] text-[#98989D] hover:bg-[#2C2C2E]" : "border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"}`}>Cancelar</button>
              </div>
            </div>
          )}

          {msg && (
            <div className={`px-4 py-3 rounded-xl text-sm whitespace-pre-line ${
              skuAlertaAtivo
                ? "bg-amber-50 text-amber-800 border border-amber-300"
                : msg.includes("Erro") || msg.includes("🚫") || msg.includes("bloqueada")
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-green-50 text-green-700"
            }`}>
              <div>{msg}</div>
              {skuAlertaAtivo && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      // Override: proxima submissao envia _sku_override=true e pula validacao.
                      // Limpa msg + alerta e re-chama handleSubmit pra retentar o save.
                      skuOverrideRef.current = true;
                      setSkuAlertaAtivo(false);
                      setMsg("");
                      handleSubmit();
                    }}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
                  >
                    ⚠️ Registrar mesmo assim
                  </button>
                  <button
                    onClick={() => {
                      // Usuario quer corrigir a selecao — so limpa o alerta
                      setSkuAlertaAtivo(false);
                      skuOverrideRef.current = false;
                      setMsg("");
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-amber-400 text-amber-800 bg-white hover:bg-amber-50 transition-colors"
                  >
                    Corrigir seleção
                  </button>
                </div>
              )}
            </div>
          )}
          <SkuFilterBanner />

          {/* Row 1: Data + Brinde */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><p className={labelCls}>Data</p><input type="date" value={form.data} onChange={(e) => set("data", e.target.value)} className={inputCls} /></div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_brinde}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setForm(f => ({
                      ...f,
                      is_brinde: checked,
                      ...(checked ? { custo: "0", preco_vendido: "0" } : {}),
                    }));
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500"
                />
                <span className="text-sm font-medium text-pink-700">Brinde / Cortesia</span>
              </label>
            </div>
          </div>
          {form.is_brinde && (
            <div className={`px-3 py-2 rounded-xl border text-xs ${dm ? "bg-pink-900/30 border-pink-700 text-pink-300" : "bg-pink-50 border-pink-200 text-pink-700"}`}>
              Esta venda sera registrada como brinde. Nao entrara no faturamento nem no lucro. O estoque sera atualizado normalmente.
            </div>
          )}

          {/* Campos condicionais por tipo */}
          {form.tipo === "ATACADO" ? (
            <div className="grid grid-cols-1 gap-4">
              <div className="relative">
                <p className={labelCls}>Nome da Loja</p>
                <input
                  value={form.cliente}
                  onChange={(e) => { set("cliente", e.target.value.toUpperCase()); setShowLojistaSuggestions(true); }}
                  onFocus={() => setShowLojistaSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowLojistaSuggestions(false), 200)}
                  placeholder="Ex: Mega Cell, TM Cel..."
                  className={inputCls}
                />
                {showLojistaSuggestions && (() => {
                  const term = form.cliente.trim().toLowerCase();
                  const lista = (term.length === 0
                    ? lojistas
                    : lojistas.filter(l => (l.nome || "").toLowerCase().includes(term))
                  ).slice(0, 8);
                  if (lista.length === 0) return null;
                  return (
                    <div className={`absolute z-50 left-0 right-0 top-full mt-1 border rounded-xl shadow-lg overflow-hidden max-h-[220px] overflow-y-auto ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
                      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>Lojistas cadastrados</div>
                      {lista.map(l => (
                        <button
                          key={l.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            set("cliente", (l.nome || "").toUpperCase());
                            if (l.cpf) set("cpf", l.cpf);
                            if (l.cnpj) set("cnpj", l.cnpj);
                            setShowLojistaSuggestions(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-[#FFF8F0] transition-colors border-b border-[#F5F5F7] last:border-0"
                        >
                          <span className="text-sm font-medium text-[#1D1D1F]">{l.nome}</span>
                          {(l.cnpj || l.cpf || (l.saldo_credito && l.saldo_credito > 0)) && (
                            <span className="block text-[10px] text-[#86868B]">
                              {l.cnpj ? `CNPJ ${l.cnpj}` : l.cpf ? `CPF ${l.cpf}` : ""}
                              {l.saldo_credito && l.saldo_credito > 0 ? ` · Crédito: R$ ${Number(l.saldo_credito).toLocaleString("pt-BR")}` : ""}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Entrega cobrada à parte */}
              <div className={`p-3 rounded-xl border ${dm ? "border-[#3A3A3C] bg-[#1C1C1E]" : "border-[#E0E0E5] bg-[#FAFAFA]"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#86868B]">🚚 Entrega (cobrada à parte)</span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-[#86868B]">
                    <input
                      type="checkbox"
                      checked={!!form.frete_recebido}
                      onChange={(e) => set("frete_recebido", e.target.checked)}
                      className="w-4 h-4 rounded accent-[#E8740E]"
                    />
                    Já recebido
                  </label>
                </div>
                <div>
                  <p className={labelCls}>Valor do frete (R$)</p>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.frete_valor}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      set("frete_valor", digits ? Number(digits).toLocaleString("pt-BR") : "");
                    }}
                    placeholder="Ex: 150 — deixe vazio se não há entrega"
                    className={inputCls}
                  />
                  <p className="text-[10px] text-[#86868B] mt-1">Opcional. Some ao lucro da venda e aparece no card &quot;Faturamento com entregas&quot;.</p>
                </div>
                {/* Banco do PIX da entrega */}
                {form.frete_valor && (
                  <div className="mt-3">
                    <p className={labelCls}>Banco do PIX</p>
                    <select value={form.frete_banco} onChange={(e) => { set("frete_banco", e.target.value); set("frete_forma", e.target.value ? "PIX" : ""); }} className={inputCls}>
                      <option value="">— Selecionar —</option>
                      <option value="ITAU">Itaú</option>
                      <option value="INFINITE">InfinitePay</option>
                      <option value="MERCADO_PAGO">Mercado Pago</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Crédito de Lojista — aparece sempre em ATACADO, mesmo sem saldo (facilita cadastrar/ver) */}
              {form.tipo === "ATACADO" && form.cliente && (
                <div className={`p-3 rounded-xl border ${dm ? "border-blue-700 bg-blue-900/30" : "border-blue-200 bg-blue-50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-700">💳 Crédito do Lojista</span>
                    <span className="text-sm font-bold text-blue-700">Saldo: R$ {creditoLojistaSaldo.toLocaleString("pt-BR")}</span>
                  </div>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <p className={labelCls}>Usar crédito (R$)</p>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.usar_credito_loja}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "");
                          const v = digits ? Math.min(parseInt(digits), creditoLojistaSaldo) : 0;
                          set("usar_credito_loja", v ? String(v) : "");
                          // Recalcular preco_vendido incluindo crédito
                          const newResult = recalcVendido({ credito: v ? String(v) : "0" });
                          if (newResult) set("preco_vendido", newResult);
                        }}
                        placeholder="0"
                        className={inputCls}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const val = String(Math.min(creditoLojistaSaldo, parseFloat(form.preco_vendido) || creditoLojistaSaldo));
                        set("usar_credito_loja", val);
                        const newResult = recalcVendido({ credito: val });
                        if (newResult) set("preco_vendido", newResult);
                      }}
                      className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 whitespace-nowrap"
                    >
                      Usar tudo
                    </button>
                  </div>
                  <p className="text-[10px] text-blue-600 mt-1">Este valor será debitado do saldo ao finalizar a venda.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Toggle PF / PJ */}
              <div className="flex gap-2">
                {(["PF", "PJ"] as const).map((p) => (
                  <button key={p} onClick={() => set("pessoa", p)} className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${form.pessoa === p ? "bg-[#E8740E] text-white" : dm ? "bg-[#2C2C2E] text-[#98989D] border border-[#3A3A3C] hover:border-[#E8740E]" : "bg-[#F5F5F7] text-[#86868B] border border-[#D2D2D7] hover:border-[#E8740E]"}`}>
                    {p === "PF" ? "Pessoa Física" : "Pessoa Jurídica"}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="relative"><p className={labelCls}>{form.pessoa === "PJ" ? "Razão Social" : "Cliente"}</p><input value={form.cliente} onChange={(e) => { set("cliente", e.target.value.toUpperCase()); setShowClienteSuggestions(true); }} onFocus={() => setShowClienteSuggestions(true)} onBlur={() => setTimeout(() => setShowClienteSuggestions(false), 200)} placeholder={form.pessoa === "PJ" ? "Nome da empresa" : "Nome completo"} className={inputCls} />
                  {/* Dropdown Clientes Recorrentes */}
                  {showClienteSuggestions && clientesRecorrentes.length > 0 && (
                    <div className={`absolute z-50 left-0 right-0 top-full mt-1 border rounded-xl shadow-lg overflow-hidden max-h-[200px] overflow-y-auto ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
                      <div className={`px-3 py-1.5 text-[10px] font-bold uppercase ${dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>Clientes recorrentes</div>
                      {clientesRecorrentes.map((c, i) => (
                        <div key={i} className="flex items-center border-b border-[#F5F5F7] last:border-0">
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                              set("cliente", c.cliente);
                              set("origem", c.origem);
                              set("tipo", c.tipo);
                              set("forma", c.forma);
                              set("banco", c.banco);
                              if (c.pessoa) set("pessoa", c.pessoa);
                              if (c.cpf) set("cpf", c.cpf);
                              if (c.cnpj) set("cnpj", c.cnpj);
                              if (c.email) set("email", c.email);
                              if (c.endereco) set("endereco", c.endereco);
                              if (c.cep) set("cep", c.cep);
                              if (c.bairro) set("bairro", c.bairro);
                              if (c.cidade) set("cidade", c.cidade);
                              if (c.uf) set("uf", c.uf);
                              setShowClienteSuggestions(false);
                              setMsg(`Cliente recorrente: ${c.cliente} (${c.qtd} compra${c.qtd > 1 ? "s" : ""})`);
                            }}
                            className="flex-1 px-3 py-2 text-left hover:bg-[#FFF8F0] transition-colors"
                          >
                            <span className="text-sm font-medium text-[#1D1D1F]">{c.cliente}</span>
                            <span className="block text-[10px] text-[#86868B]">{c.qtd} compra{c.qtd > 1 ? "s" : ""} — Ultimo: {c.ultimoProduto}</span>
                          </button>
                          {clientesRecorrentes.length >= 2 && (
                            <button
                              onMouseDown={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const outros = clientesRecorrentes.filter((_, j) => j !== i);
                                const nomeNovo = c.cliente;
                                const listaAntigos = outros.map(o => `• ${o.cliente} (${o.qtd} compra${o.qtd > 1 ? "s" : ""})`).join("\n");
                                if (!confirm(`Unificar para "${nomeNovo}"?\n\nOs seguintes clientes serão renomeados:\n${listaAntigos}\n\nTodas as vendas, entregas e dados serão transferidos.`)) return;
                                setShowClienteSuggestions(false);
                                for (const o of outros) {
                                  try {
                                    await fetch("/api/admin/merge-cliente", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                      body: JSON.stringify({ nomeAntigo: o.cliente, nomeNovo }),
                                    });
                                  } catch { /* ignore */ }
                                }
                                setMsg(`Clientes unificados para "${nomeNovo}"`);
                                fetchVendas();
                              }}
                              className="shrink-0 px-2 py-1 mr-2 rounded text-[9px] font-bold text-[#E8740E] hover:bg-orange-50 transition-colors"
                              title={`Unificar todos para ${c.cliente}`}
                            >
                              Unificar
                            </button>
                          )}
                        </div>
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
                <div><p className={labelCls}>WhatsApp</p><input type="tel" value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(21) 99999-9999" className={inputCls} /></div>
              </div>

              {/* Historico do Cliente */}
              {(clienteHistorico || loadingHistorico) && form.cliente.length >= 3 && (
                <div className={`border rounded-xl px-4 py-3 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F5F5F7] border-[#E0E0E5]"}`}>
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

              {/* Local + Origem + Tipo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><p className={labelCls}>Local</p><select value={form.local} onChange={(e) => set("local", e.target.value)} className={selectCls}>
                  <option value="">—</option><option>ENTREGA</option><option>RETIRADA</option><option>CORREIO</option><option>ATACADO</option>
                </select></div>
                <div><p className={labelCls}>Origem</p><select value={form.origem} onChange={(e) => { const v = e.target.value; set("origem", v); if (v === "ATACADO") { set("tipo", "ATACADO"); set("local", "ATACADO"); set("email", "N/A"); set("cep", "00000-000"); set("bairro", ""); set("cidade", ""); set("uf", ""); } }} className={selectCls}>
                  <option value="">—</option><option>ANUNCIO</option><option>RECOMPRA</option><option>INDICACAO</option><option>ATACADO</option><option>NAO_INFORMARAM</option>
                </select></div>
                <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => { set("tipo", e.target.value); if (e.target.value === "ATACADO") { set("origem", "ATACADO"); set("local", "ATACADO"); set("email", "N/A"); set("cep", "00000-000"); set("bairro", ""); set("cidade", ""); set("uf", ""); } else if (form.origem === "ATACADO") { set("origem", ""); set("local", ""); set("email", ""); set("cep", ""); } }} className={selectCls}>
                  <option value="">—</option><option>VENDA</option><option>UPGRADE</option><option>ATACADO</option>
                </select></div>
              </div>
              {/* Código de Rastreio — quando envio por Correios */}
              {form.local === "CORREIO" && (
                <div>
                  <p className={labelCls}>Código de Rastreio (Correios)</p>
                  <div className="flex gap-2">
                    <input value={form.codigo_rastreio} onChange={(e) => set("codigo_rastreio", e.target.value.toUpperCase())} placeholder="Ex: BR123456789BR" className={`${inputCls} font-mono uppercase flex-1`} />
                    {form.codigo_rastreio && (
                      <a href={`https://www.linkcorreios.com.br/${form.codigo_rastreio}`} target="_blank" rel="noopener noreferrer" className={`shrink-0 px-3 flex items-center justify-center rounded-xl text-[12px] font-semibold transition-all bg-blue-500 hover:bg-blue-600 text-white gap-1`}>📦 Rastrear</a>
                    )}
                  </div>
                </div>
              )}
              {/* 🚚 Taxa de Entrega — vendas normais */}
              {(form.local === "ENTREGA" || form.local === "CORREIO") && (
                <div className={`p-3 rounded-xl border ${dm ? "border-[#3A3A3C] bg-[#1C1C1E]" : "border-[#E0E0E5] bg-[#FAFAFA]"}`}>
                  <div className="mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#86868B]">🚚 Taxa de Entrega</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={labelCls}>Valor (R$)</p>
                      <input type="text" inputMode="numeric" value={form.frete_valor} onChange={(e) => { const digits = e.target.value.replace(/\D/g, ""); set("frete_valor", digits ? Number(digits).toLocaleString("pt-BR") : ""); }} placeholder="Ex: 30" className={inputCls} />
                    </div>
                    <div>
                      <p className={labelCls}>Forma de Pagamento</p>
                      <select value={form.frete_forma} onChange={(e) => { set("frete_forma", e.target.value); if (e.target.value !== "CARTAO") { set("frete_parcelas", ""); set("frete_bandeira", ""); } if (e.target.value === "ESPECIE") set("frete_banco", "ESPECIE"); }} className={inputCls}>
                        <option value="">— Selecionar —</option>
                        <option value="PIX">PIX</option>
                        <option value="CARTAO">Cartão de Crédito</option>
                        <option value="DEBITO">Débito</option>
                        <option value="LINK">Link Mercado Pago</option>
                        <option value="ESPECIE">Espécie (Dinheiro)</option>
                      </select>
                    </div>
                  </div>
                  {/* Campos condicionais por forma */}
                  {form.frete_forma && form.frete_forma !== "ESPECIE" && (
                    <div className={`grid gap-3 mt-3 ${form.frete_forma === "CARTAO" ? "grid-cols-3" : "grid-cols-1"}`}>
                      <div>
                        <p className={labelCls}>{form.frete_forma === "PIX" ? "Banco do PIX" : form.frete_forma === "LINK" ? "Plataforma" : "Máquina"}</p>
                        <select value={form.frete_banco} onChange={(e) => set("frete_banco", e.target.value)} className={inputCls}>
                          <option value="">— Selecionar —</option>
                          {form.frete_forma === "LINK" ? (
                            <option value="MERCADO_PAGO">Mercado Pago</option>
                          ) : (
                            <>
                              <option value="ITAU">Itaú</option>
                              <option value="INFINITE">InfinitePay</option>
                              <option value="MERCADO_PAGO">Mercado Pago</option>
                            </>
                          )}
                        </select>
                      </div>
                      {form.frete_forma === "CARTAO" && (
                        <>
                          <div>
                            <p className={labelCls}>Parcelas</p>
                            <input type="number" min={1} max={18} value={form.frete_parcelas} onChange={(e) => set("frete_parcelas", e.target.value)} placeholder="1" className={inputCls} />
                          </div>
                          <div>
                            <p className={labelCls}>Bandeira</p>
                            <select value={form.frete_bandeira} onChange={(e) => set("frete_bandeira", e.target.value)} className={inputCls}>
                              <option value="">— Selecionar —</option>
                              <option value="VISA">Visa</option>
                              <option value="MASTERCARD">Mastercard</option>
                              <option value="ELO">Elo</option>
                              <option value="AMEX">Amex</option>
                            </select>
                          </div>
                        </>
                      )}
                      {form.frete_forma === "LINK" && (
                        <div>
                          <p className={labelCls}>Parcelas no Link</p>
                          <input type="number" min={1} max={18} value={form.frete_parcelas} onChange={(e) => set("frete_parcelas", e.target.value)} placeholder="1" className={inputCls} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {/* CEP */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                  <div key={i} className={`px-4 py-3 border rounded-xl space-y-1 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F5F5F7] border-[#D2D2D7]"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[#1D1D1F] truncate">{p.produto}</span>
                      <div className="ml-3 flex gap-1 flex-shrink-0">
                        <button onClick={() => handleEditFromCart(i)} className="px-2 py-1 rounded-lg text-xs text-blue-500 hover:bg-blue-50 transition-colors" title="Editar produto">✏️</button>
                        <button onClick={() => handleRemoveFromCart(i)} className="px-2 py-1 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors" title="Remover produto">✕</button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[#86868B]">
                      <span>{fmt(pCusto)} custo</span>
                      <span>|</span>
                      <span className="flex items-center gap-1">Vendido: R$
                        <input
                          type="text" inputMode="numeric"
                          value={fmtMil(p.preco_vendido)}
                          onChange={(e) => {
                            const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                            setProdutosCarrinho(prev => prev.map((item, idx) => idx === i ? { ...item, preco_vendido: clean } : item));
                            setForm(f => ({ ...f, valor_total_venda: "" })); // limpa total ao editar manualmente
                          }}
                          className="w-20 px-1.5 py-0.5 text-[11px] font-semibold text-[#1D1D1F] bg-white border border-[#D2D2D7] rounded"
                        />
                      </span>
                      <span>|</span>
                      <span>Lucro: <strong className={pLucro >= 0 ? "text-green-600" : "text-red-500"}>{fmt(pLucro)}</strong></span>
                      {p.fornecedor && <><span>|</span><span>{p.fornecedor}</span></>}
                    </div>
                    {parseFloat(p.produto_na_troca) > 0 && (
                      <span className="text-[10px] text-orange-600 font-medium block">
                        Troca: {p.troca_produto} ({fmt(parseFloat(p.produto_na_troca))})
                      </span>
                    )}
                    {parseFloat(p.produto_na_troca2) > 0 && (
                      <span className="text-[10px] text-orange-600 font-medium block">
                        2ª Troca: {p.troca_produto2} ({fmt(parseFloat(p.produto_na_troca2))})
                      </span>
                    )}
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
            </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><p className={labelCls}>Buscar Serial</p><div className="relative"><input value={serialBusca} onChange={(e) => { setSerialBusca(e.target.value); if (!editandoVendaId) { setEstoqueId(""); set("produto", ""); set("custo", ""); set("fornecedor", ""); set("serial_no", ""); set("imei", ""); } }} placeholder="Digitar serial ou modelo..." className={inputCls} />{serialBusca && <button onClick={() => { setSerialBusca(""); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#86868B] hover:text-red-500">✕</button>}</div></div>
                  <div>
                    <p className={labelCls}>Categoria (opcional)</p>
                    <select value={catSel} onChange={(e) => { setCatSel(e.target.value); if (!editandoVendaId) { setEstoqueId(""); set("produto", ""); set("custo", ""); set("fornecedor", ""); } }} className={selectCls}>
                      <option value="">Todas</option>
                      {categorias.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div><p className={labelCls}>Buscar Serial <span className="text-[10px] text-[#E8740E] font-normal">← bipe aqui</span></p><div className="flex gap-2 items-center"><div className="relative flex-1"><input ref={serialInputRef} autoFocus value={serialBusca} onChange={(e) => { const v = e.target.value; setSerialBusca(v); if (!editandoVendaId) { setEstoqueId(""); set("produto", ""); set("custo", ""); set("fornecedor", ""); set("serial_no", ""); set("imei", ""); } autoSelecionarPorSerial(v); }} placeholder="Apontar pistola aqui e bipar QR..." className={inputCls} />{serialBusca && <button onClick={() => { setSerialBusca(""); if (!editandoVendaId) { setEstoqueId(""); set("produto", ""); set("custo", ""); set("fornecedor", ""); set("serial_no", ""); set("imei", ""); } if (serialInputRef.current) serialInputRef.current.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#86868B] hover:text-red-500">✕</button>}</div><button onClick={handleOpenQRScanner} title="Escanear QR Code com câmera do Mac" className={`flex-shrink-0 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] hover:border-[#E8740E]" : "bg-white border-[#D2D2D7] text-[#1D1D1F] hover:border-[#E8740E]"}`}>📷</button><button onClick={handleOpenIPhoneScan} title="Usar câmera do iPhone" className={`flex-shrink-0 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] hover:border-[#E8740E]" : "bg-white border-[#D2D2D7] text-[#1D1D1F] hover:border-[#E8740E]"}`}>📱</button></div></div>
                </div>

                {/* Produtos agrupados por modelo */}
                {(serialBusca.trim() || catSel) && (() => {
                  const baseList = catSel ? produtosFiltrados : estoque.filter(p => p.qnt > 0 && p.status === "EM ESTOQUE");
                  const filtrados = serialBusca.trim()
                    ? baseList.filter(p => (p.serial_no && p.serial_no.toUpperCase().includes(serialBusca.trim().toUpperCase())) || p.produto.toUpperCase().includes(serialBusca.trim().toUpperCase()))
                    : baseList;
                  // Limpar nome do produto: remover origem e chip
                  const stripOrigemVendas = (nome: string) => nome
                    .replace(/\s+(VC|LL|BE|BR|HN|IN|ZA|BZ)(?=\s|$|\()(\s*\([^)]*\))?/gi, "")
                    .replace(/\s+J(?=\s*\(|\s*$)(\s*\([^)]*\))?/gi, "")
                    .replace(/[-–]\s*(CHIP\s+(F[ÍI]SICO\s*\+\s*)?)?E-?SIM/gi, "")
                    .replace(/[-–]\s*CHIP\s+VIRTUAL/gi, "")
                    .replace(/\s*\(\d+C\s*CPU\/\d+C\s*GPU\)\s*/gi, " ")
                    .replace(/\s{2,}/g, " ")
                    .replace(/\s*[-–]\s*$/, "")
                    .trim();
                  const grupos: Record<string, EstoqueItem[]> = {};
                  for (const p of filtrados) {
                    const key = stripOrigemVendas(p.produto);
                    if (!grupos[key]) grupos[key] = [];
                    grupos[key].push(p);
                  }
                  const grupoKeys = Object.keys(grupos).sort();

                  if (grupoKeys.length === 0) return (
                    <div className={`p-4 rounded-xl text-center text-sm ${dm ? "bg-[#2C2C2E] text-[#636366]" : "bg-[#F5F5F7] text-[#86868B]"}`}>{serialBusca.trim() ? "Nenhum produto com esse serial" : "Nenhum produto disponivel nesta categoria"}</div>
                  );

                  // Extrair cor do nome do produto
                  const extractCor = (nome: string) => {
                    const after = nome.split(/\d+GB\s+/)[1];
                    if (!after) return null;
                    return after.split(/\s+(LL|BE|BR|BZ|CH|ZD|ZP|HN|J|N|VC|AA|E|LZ|QL)\s*/i)[0]?.trim() || null;
                  };

                  // Extrair modelo base (sem cor) pra agrupar cores num card só.
                  // Usa getModeloBase do lib/produto-display (mesma lógica do estoque):
                  // Watch inclui tamanho + conectividade (GPS/GPS+CEL) e corrige SE→Series 11 em 46/49mm;
                  // MacBook inclui RAM+SSD; iPhone/iPad incluem storage.
                  const extractModeloBase = (nome: string, categoria: string, observacao?: string | null) => {
                    return getModeloBase(nome, categoria, observacao);
                  };

                  // Reagrupar: modelo base → cores → itens
                  const porModelo: Record<string, Record<string, EstoqueItem[]>> = {};
                  for (const key of grupoKeys) {
                    const itens = grupos[key];
                    for (const p of itens) {
                      const base = extractModeloBase(stripOrigemVendas(p.produto), p.categoria || "", p.observacao);
                      const cor = p.cor || extractCor(p.produto) || "—";
                      if (!porModelo[base]) porModelo[base] = {};
                      if (!porModelo[base][cor]) porModelo[base][cor] = [];
                      porModelo[base][cor].push(p);
                    }
                  }
                  const modeloKeys = Object.keys(porModelo).sort();

                  return (
                    <div className={`border rounded-xl overflow-hidden max-h-[450px] overflow-y-auto ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
                      {modeloKeys.map((modeloBase) => {
                        const cores = porModelo[modeloBase];
                        const totalQnt = Object.values(cores).flat().reduce((s, p) => s + p.qnt, 0);
                        const corKeys = Object.keys(cores).sort();
                        return (
                          <div key={modeloBase} className={`border-b last:border-0 ${dm ? "border-[#3A3A3C]" : "border-[#F5F5F7]"}`}>
                            {/* Header: modelo + memória */}
                            <div className={`px-4 py-2.5 flex items-center justify-between ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                              <span className={`text-sm font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{applyCardTitleOverride(modeloBase)}</span>
                              <span className={`text-[10px] ${dm ? "text-[#636366]" : "text-[#86868B]"}`}>{totalQnt} un.</span>
                            </div>
                            {/* Cores como chips */}
                            <div className="px-4 py-2 space-y-1">
                              {corKeys.map((cor) => {
                                const corItems = cores[cor];
                                const corQnt = corItems.reduce((s, p) => s + p.qnt, 0);
                                const hasSelected = corItems.some(p => estoqueId === p.id);
                                const isCorExpanded = hasSelected || expandedVendaCor === `${modeloBase}__${cor}`;
                                return (
                                  <div key={cor}>
                                    <button
                                      onClick={() => setExpandedVendaCor(isCorExpanded && !hasSelected ? "" : `${modeloBase}__${cor}`)}
                                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${isCorExpanded ? (dm ? "bg-[#3A3A3C] text-[#F5F5F7]" : "bg-[#E8E8ED] text-[#1D1D1F]") : (dm ? "text-[#98989D] hover:bg-[#2C2C2E]" : "text-[#86868B] hover:bg-[#F5F5F7]")}`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span className="text-[10px] text-[#86868B]">{isCorExpanded ? "▼" : "▶"}</span>
                                        <span className="font-semibold">{corParaPT(cor)}</span>
                                      </span>
                                      <span className={`text-[10px] ${dm ? "text-[#636366]" : "text-[#C7C7CC]"}`}>{corQnt} un.</span>
                                    </button>
                                    {/* Seriais expandidos */}
                                    {isCorExpanded && (
                                      <div className="pl-6 pr-3 py-2 flex flex-wrap gap-2">
                                        {corItems.map((p) => {
                                          const isSelected = estoqueId === p.id;
                                          return (
                                            <button
                                              key={p.id}
                                              onClick={() => {
                                                if (isSelected) {
                                                  setEstoqueId("");
                                                  set("produto", ""); set("custo", ""); set("fornecedor", ""); set("serial_no", ""); set("imei", "");
                                                } else {
                                                  // Em modo edicao, se o form ja tem um produto DIFERENTE
                                                  // do que estamos clicando, preserva ele no carrinho pra nao
                                                  // sumir (bug: admin selecionava novo produto e o anterior
                                                  // era sobrescrito silenciosamente).
                                                  if (editandoVendaId && form.produto && form.produto !== p.produto) {
                                                    const prodAtual = getCurrentProductFields();
                                                    setProdutosCarrinho(prev => [...prev, prodAtual]);
                                                    // Limpa troca do form/trocaRow pra proximo produto nao
                                                    // herdar (bug: mesma troca contava duas vezes).
                                                    setForm(f => ({
                                                      ...f,
                                                      produto_na_troca: "", troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "",
                                                      troca_obs: "", troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
                                                      troca_serial: "", troca_imei: "",
                                                      produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "",
                                                      troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
                                                      troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
                                                    }));
                                                    setTrocaRow(createEmptyProdutoRow());
                                                    setTrocaRow2(createEmptyProdutoRow());
                                                    setTrocaEnabled(false); setShowSegundaTroca(false);
                                                    setMsg(`Produto anterior movido pro carrinho (com a troca). Selecionando: ${p.produto}`);
                                                  }
                                                  setEstoqueId(p.id);
                                                  set("produto", p.produto);
                                                  set("custo", String(Math.round(p.custo_unitario || 0)));
                                                  if (p.fornecedor) set("fornecedor", p.fornecedor);
                                                  if (p.serial_no) set("serial_no", p.serial_no);
                                                  if (p.imei) set("imei", p.imei);
                                                }
                                              }}
                                              className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                                isSelected
                                                  ? "bg-[#E8740E] text-white shadow-md ring-2 ring-[#E8740E]/30"
                                                  : `${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border border-[#D2D2D7] text-[#1D1D1F]"} hover:border-[#E8740E]`
                                              }`}
                                            >
                                              <span className="flex flex-col items-start gap-0.5">
                                                {p.serial_no ? <span className={`font-mono text-[11px] ${isSelected ? "text-white" : "text-purple-500"}`}>{p.serial_no}</span> : <span>{fmt(p.custo_unitario)}</span>}
                                                {p.reserva_cliente && <span className={`text-[9px] font-semibold ${isSelected ? "text-white/80" : "text-orange-600"}`}>📌 {p.reserva_cliente}</span>}
                                              </span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            {/* Detalhes do produto selecionado */}
                            {Object.values(cores).flat().some((p) => estoqueId === p.id) && (() => {
                              const p = Object.values(cores).flat().find((p) => estoqueId === p.id)!;
                              return (
                                <div className={`mx-4 mb-3 p-4 rounded-xl border text-xs space-y-2 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#FFF8F0] border-[#E8740E]/20 text-[#1D1D1F]"}`}>
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-bold">{p.produto}</p>
                                    <button onClick={() => { setEstoqueId(""); set("produto", ""); set("custo", ""); set("fornecedor", ""); set("serial_no", ""); set("imei", ""); }} className="text-[10px] text-red-500 hover:text-red-700 font-semibold px-2 py-1 rounded-lg hover:bg-red-50">
                                      ✕ Remover
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2">
                                    {p.serial_no && <div><span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Serial</span><p className="font-mono text-purple-500 font-semibold">{p.serial_no}</p></div>}
                                    {p.imei && <div><span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>IMEI</span><p className="font-mono text-[#0071E3] font-semibold">{p.imei}</p></div>}
                                    <div><span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Custo</span><p className="font-semibold text-green-600">{fmt(p.custo_unitario)}</p></div>
                                    {p.fornecedor && <div><span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Fornecedor</span><p className="font-semibold">{p.fornecedor}</p></div>}
                                    <div><span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Condicao</span><p className="font-semibold">{p.tipo === "SEMINOVO" ? "Usado" : "Lacrado"}</p></div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Produto selecionado — editavel.
                    Antes so aparecia quando estoqueId era truthy, mas em edicao de
                    venda (especialmente em andamento) o produto fica em form.produto
                    sem estoqueId, entao a pill nao aparecia. Admin digitava no Buscar
                    Serial, o onChange apagava form.produto silenciosamente, e salvava
                    venda sem nome. Agora: sempre que form.produto OU estoqueId OU
                    editandoVendaId, mostra um INPUT editavel pra ver e ajustar o nome
                    manualmente (recuperacao de corrupcao e input manual). */}
                {(estoqueId || form.produto || editandoVendaId) && (() => {
                  // Se a venda em edicao veio de formulario preenchido, trava o
                  // produto (cliente ja escolheu o que quer) — admin so deve
                  // vincular qual UNIDADE FISICA sai, nao trocar o modelo.
                  const travarProduto = statusPagamentoOriginal === "FORMULARIO_PREENCHIDO";
                  return (
                  <div className="px-4 py-2.5 bg-gradient-to-r from-[#1E1208] to-[#2A1A0F] rounded-xl flex items-center gap-3">
                    <input
                      type="text"
                      value={form.produto}
                      onChange={(e) => {
                        if (travarProduto) return; // produto do formulario nao edita
                        set("produto", e.target.value);
                        // Se admin edita o nome manualmente, desvincula do estoque
                        // (estoque_id anterior sera devolvido no PATCH via estoqueIdOriginal).
                        if (estoqueId) setEstoqueId("");
                        setProdutoManual(true);
                      }}
                      readOnly={travarProduto}
                      placeholder="Nome do produto (ou use Buscar Serial acima)"
                      title={travarProduto ? "Produto escolhido pelo cliente no formulário — só dá pra vincular unidade do estoque" : undefined}
                      className={`flex-1 bg-transparent text-white text-sm font-medium placeholder-white/30 outline-none border-b pb-0.5 ${
                        travarProduto ? "border-white/20 cursor-not-allowed" : "border-white/10 focus:border-[#F5A623]"
                      }`}
                    />
                    {travarProduto && (
                      <span title="Travado — produto do formulário do cliente" className="text-[10px] text-white/60 shrink-0">🔒</span>
                    )}
                    <span className="text-[#F5A623] text-sm font-bold shrink-0">{fmt(parseFloat(form.custo) || 0)}</span>
                    {form.produto && !travarProduto && (
                      <button
                        type="button"
                        onClick={() => {
                          set("produto", ""); set("custo", ""); set("preco_vendido", "");
                          set("fornecedor", ""); set("serial_no", ""); set("imei", "");
                          setEstoqueId(""); setSerialBusca("");
                        }}
                        title="Limpar produto"
                        className="text-white/60 hover:text-red-400 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-white/10 transition-colors shrink-0"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  );
                })()}

                {/* Unidades disponiveis no estoque com mesmo SKU da venda em
                    edicao — aparece quando admin esta convertendo formulario
                    preenchido em venda. Permite clicar pra escolher qual
                    unidade fisica sai (em vez de digitar/bipar manualmente). */}
                {statusPagamentoOriginal === "FORMULARIO_PREENCHIDO" && editandoVendaId && (() => {
                  const vendaEdicao = vendas.find(v => v.id === editandoVendaId);
                  const skuVenda = (vendaEdicao as unknown as { sku?: string | null } | undefined)?.sku;
                  if (!skuVenda) return null;
                  const unidades = estoque.filter(
                    (p) => (p.sku || "").toUpperCase() === skuVenda.toUpperCase()
                      && p.qnt > 0
                      && p.status === "EM ESTOQUE"
                  );
                  if (unidades.length === 0) {
                    return (
                      <div className={`mt-2 px-3 py-2 rounded-xl text-xs ${dm ? "bg-red-900/20 text-red-300 border border-red-900/40" : "bg-red-50 text-red-700 border border-red-200"}`}>
                        ⚠️ Nenhuma unidade desse produto em estoque ainda.
                        Encomende antes de registrar a venda.
                      </div>
                    );
                  }
                  return (
                    <div className={`mt-2 p-3 rounded-xl ${dm ? "bg-[#1C1C1E] border border-[#3A3A3C]" : "bg-[#FFF8F0] border border-[#E8740E]/30"}`}>
                      <p className={`text-xs font-bold mb-2 ${dm ? "text-[#F5A623]" : "text-[#E8740E]"}`}>
                        📦 {unidades.length} {unidades.length === 1 ? "unidade disponível" : "unidades disponíveis"} — clique pra selecionar
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {unidades.map((p) => {
                          const isSelected = estoqueId === p.id;
                          const codigo = p.serial_no || p.imei || p.id.slice(0, 8);
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                // Vincula essa unidade especifica — preenche estoque_id,
                                // custo, fornecedor, serial/imei. Nao mexe no produto
                                // (ta travado em FORMULARIO_PREENCHIDO).
                                setEstoqueId(p.id);
                                set("custo", String(Math.round(p.custo_unitario || 0)));
                                if (p.fornecedor) set("fornecedor", p.fornecedor);
                                if (p.serial_no) { set("serial_no", p.serial_no); setSerialBusca(p.serial_no); }
                                if (p.imei) { set("imei", p.imei); if (!p.serial_no) setSerialBusca(p.imei); }
                              }}
                              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                                isSelected
                                  ? "bg-[#E8740E] text-white"
                                  : dm
                                    ? "bg-[#2C2C2E] text-[#F5F5F7] border border-[#3A3A3C] hover:bg-[#3A3A3C]"
                                    : "bg-white text-[#1D1D1F] border border-[#D2D2D7] hover:border-[#E8740E]"
                              }`}
                              title={`Custo: ${fmt(p.custo_unitario || 0)}${p.fornecedor ? ` · Forn: ${p.fornecedor}` : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                <span>{isSelected ? "✓" : "📱"}</span>
                                <div className="flex flex-col items-start gap-0.5">
                                  <span className="font-mono text-[11px]">{codigo}</span>
                                  {p.fornecedor && (
                                    <span className={`text-[9px] ${isSelected ? "text-white/80" : (dm ? "text-[#98989D]" : "text-[#86868B]")}`}>
                                      {p.fornecedor}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {estoqueId && (
                        <p className={`text-[10px] mt-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                          ✓ Unidade vinculada. Pode registrar a venda.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>

            {/* Serial No. e IMEI movidos para seção de troca */}

            {/* Limpar formulário — aparece quando tem cliente preenchido após uma venda */}
            {lastClienteData && form.cliente && (
              <button
                onClick={() => {
                  setForm({
                    data: hojeBR(),
                    cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF", origem: "", tipo: "", produto: "", fornecedor: "",
                    custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
                    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
                    entrada_pix: "", banco_pix: "ITAU", entrada_pix_2: "", banco_pix_2: "INFINITE", entrada_especie: "", banco_2nd: "", banco_alt: "",
                    forma_alt: "", parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "", forma_sinal: "PIX",
                    entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
                    valor_total_venda: "",
                    troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "", troca_obs: "",
                    troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
                    troca_serial: "", troca_imei: "",
                    produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
                    troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
                    serial_no: "", imei: "",
                    cep: "", bairro: "", cidade: "", uf: "",
                    frete_valor: "", frete_recebido: false, frete_forma: "", frete_banco: "", frete_parcelas: "", frete_bandeira: "", usar_credito_loja: "", codigo_rastreio: "",
                    is_brinde: false,
                  });
                  setShowSegundaTroca(false); setTrocaEnabled(false);
                  setLastClienteData(null);
                  setCatSel("");
                  setEstoqueId("");
                  setProdutoManual(false);
                  setProdutosCarrinho([]);
                  setTrocaRow(createEmptyProdutoRow()); setTrocaRow2(createEmptyProdutoRow());
                  setSerialBusca(""); setScanMsg("");
                  setEditandoVendaId(null); setEstoqueIdOriginal(null); setStatusPagamentoOriginal(null); setEditandoGrupoIds([]); setDuplicadoInfo(null);
                  setVendaProgramada(false); setProgramadaJaPago(false); setProgramadaComSinal(false); setDataProgramada(""); setMultiDatePagamento(false); setPagEntries([]);
                  setMsg("");
                  localStorage.removeItem("tigrao_venda_draft");
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
            <div><p className={labelCls}>Preco Vendido Liquido (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.preco_vendido)} onChange={(e) => setMoney("preco_vendido", e.target.value)} placeholder="Valor que voce recebe" className={inputCls} /></div>
            <div><p className={labelCls}>Custo (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.custo)} onChange={(e) => setMoney("custo", e.target.value)} placeholder="Quanto voce pagou" className={inputCls} /></div>
          </div>

          {/* FORMA DE PAGAMENTO */}
          {produtosCarrinho.length === 0 && (
          <div className="border border-[#D2D2D7] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-bold text-[#1D1D1F]">Como o cliente pagou?</p>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiDatePagamento}
                    onChange={(e) => {
                      setMultiDatePagamento(e.target.checked);
                      if (e.target.checked && pagEntries.length === 0) {
                        setPagEntries([{ data: form.data || hojeBR(), valor: "", forma: "PIX", banco: "ITAU", parcelas: "", bandeira: "", obs: "" }]);
                      }
                    }}
                    className="accent-blue-500 w-3.5 h-3.5"
                  />
                  <span className={`text-[11px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Datas diferentes</span>
                </label>
                {!podeVerHistorico && (
                  <span className="text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 px-2 py-1 rounded-lg">
                    Deixe em branco → André ou Nicolas completam depois
                  </span>
                )}
              </div>
            </div>

            {multiDatePagamento ? (
              <div className="space-y-3">
                {pagEntries.map((entry, idx) => {
                  const entryFormaLabel = entry.forma === "CARTAO" ? "Cartão" : entry.forma === "DEBITO" ? "Débito" : entry.forma === "LINK" ? "Link MP" : entry.forma === "ESPECIE" ? "Espécie" : entry.forma || "—";
                  return (
                    <div key={idx} className={`p-3 rounded-xl border space-y-2 ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E0E0E5]"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${dm ? "text-blue-400" : "text-blue-600"}`}>Pagamento {idx + 1}</span>
                        {pagEntries.length > 1 && (
                          <button onClick={() => setPagEntries(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-red-400 hover:text-red-600">✕ Remover</button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <p className={labelCls}>Data</p>
                          <input type="date" value={entry.data} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, data: e.target.value } : p))} className={inputCls} />
                        </div>
                        <div>
                          <p className={labelCls}>Valor (R$)</p>
                          <input type="text" inputMode="decimal" value={entry.valor} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, valor: e.target.value } : p))} placeholder="0" className={inputCls} />
                        </div>
                        <div>
                          <p className={labelCls}>Forma</p>
                          <select value={entry.forma} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, forma: e.target.value, parcelas: "", bandeira: "", banco: e.target.value === "ESPECIE" ? "ESPECIE" : e.target.value === "LINK" ? "MERCADO_PAGO" : p.banco || "ITAU" } : p))} className={selectCls}>
                            <option value="PIX">PIX</option>
                            <option value="CARTAO">Cartão Crédito</option>
                            <option value="DEBITO">Débito</option>
                            <option value="LINK">Link Mercado Pago</option>
                            <option value="ESPECIE">Espécie (Dinheiro)</option>
                          </select>
                        </div>
                        {entry.forma !== "ESPECIE" && (
                          <div>
                            <p className={labelCls}>{entry.forma === "PIX" ? "Banco do PIX" : entry.forma === "LINK" ? "Plataforma" : "Máquina"}</p>
                            <select value={entry.banco} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, banco: e.target.value } : p))} className={selectCls}>
                              {entry.forma === "LINK" ? (
                                <option value="MERCADO_PAGO">Mercado Pago</option>
                              ) : (
                                <>
                                  <option value="ITAU">Itaú</option>
                                  <option value="INFINITE">InfinitePay</option>
                                  <option value="MERCADO_PAGO">Mercado Pago</option>
                                </>
                              )}
                            </select>
                          </div>
                        )}
                        {(entry.forma === "CARTAO" || entry.forma === "LINK") && (
                          <div>
                            <p className={labelCls}>Parcelas</p>
                            <select value={entry.parcelas} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, parcelas: e.target.value } : p))} className={selectCls}>
                              <option value="">—</option>
                              {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={String(n)}>{n}x</option>)}
                            </select>
                          </div>
                        )}
                        {(entry.forma === "CARTAO" || entry.forma === "DEBITO") && (
                          <div>
                            <p className={labelCls}>Bandeira</p>
                            <select value={entry.bandeira} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, bandeira: e.target.value } : p))} className={selectCls}>
                              <option value="">—</option>
                              <option value="VISA">Visa</option>
                              <option value="MASTERCARD">Mastercard</option>
                              <option value="ELO">Elo</option>
                              <option value="AMEX">Amex</option>
                            </select>
                          </div>
                        )}
                      </div>
                      {entry.valor && (
                        <p className={`text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                          {fmt(parseFloat(entry.valor.replace(/\./g, "").replace(",", ".")) || 0)} via {entryFormaLabel}
                          {entry.parcelas ? ` ${entry.parcelas}x` : ""}
                          {entry.bandeira ? ` ${entry.bandeira}` : ""}
                          {entry.forma !== "ESPECIE" ? ` — ${(entry.forma === "LINK" ? "MERCADO_PAGO" : entry.banco || "ITAU").replace("_", " ")}` : ""}
                          {entry.data ? ` em ${entry.data.split("-").reverse().join("/")}` : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
                <button
                  onClick={() => setPagEntries(prev => [...prev, { data: form.data || hojeBR(), valor: "", forma: "PIX", banco: "ITAU", parcelas: "", bandeira: "", obs: "" }])}
                  className={`w-full py-2 rounded-xl border-2 border-dashed text-xs font-semibold transition-colors ${dm ? "border-[#3A3A3C] text-[#98989D] hover:border-blue-500 hover:text-blue-400" : "border-[#D2D2D7] text-[#86868B] hover:border-blue-400 hover:text-blue-500"}`}
                >
                  + Adicionar outro pagamento
                </button>
                {(() => {
                  const totalEntries = pagEntries.reduce((s, e) => s + (parseFloat(e.valor.replace(/\./g, "").replace(",", ".")) || 0), 0);
                  const precoVendido = parseFloat(form.preco_vendido) || 0;
                  const diff = precoVendido - totalEntries;
                  return totalEntries > 0 ? (
                    <div className={`rounded-xl px-4 py-2.5 text-xs flex flex-wrap gap-3 items-center ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                      <span>Total pagamentos: <strong className="text-green-600">{fmt(totalEntries)}</strong></span>
                      {precoVendido > 0 && (
                        <>
                          <span>Preço vendido: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(precoVendido)}</strong></span>
                          {Math.abs(diff) > 1 && (
                            <span className={diff > 0 ? "text-amber-600" : "text-red-500"}>
                              {diff > 0 ? `Falta: ${fmt(diff)}` : `Excede: ${fmt(Math.abs(diff))}`}
                            </span>
                          )}
                          {Math.abs(diff) <= 1 && <span className="text-green-600 font-bold">✓ Valor batido</span>}
                        </>
                      )}
                    </div>
                  ) : null;
                })()}
              </div>
            ) : (
            <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className={labelCls}>Forma principal</p><select value={form.forma} onChange={(e) => set("forma", e.target.value)} className={selectCls}>
                <option value="">— Definir depois —</option>
                <option value="PIX">PIX</option>
                <option value="CARTAO">Maquina Cartao</option>
                <option value="DEBITO">Debito</option>
                <option value="LINK">Link Mercado Pago</option>
                <option value="ESPECIE">Especie (Dinheiro)</option>
                <option value="FIADO">Fiado</option>
              </select></div>

              {form.forma === "FIADO" && (
                <>
                <div><p className={labelCls}>Data do recebimento</p><input type="date" value={form.fiado_data_inicio || ""} onChange={(e) => setForm(f => ({ ...f, fiado_data_inicio: e.target.value }))} className={inputCls} /></div>
                <div><p className={labelCls}>Forma de recebimento</p><select value={form.banco || ""} onChange={(e) => set("banco", e.target.value)} className={selectCls}>
                  <option value="">— Selecionar —</option>
                  <option value="PIX_ITAU">PIX Itau</option>
                  <option value="PIX_INFINITE">PIX Infinite</option>
                  <option value="PIX_MP">PIX Mercado Pago</option>
                  <option value="CARTAO">Cartao</option>
                  <option value="ESPECIE">Especie</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                </select></div>
                <div><p className={labelCls}>Valor (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => { setMoney("valor_comprovante_input", e.target.value); }} placeholder="Valor total" className={inputCls} /></div>
                </>
              )}

              {form.forma === "PIX" && (
                <>
                <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                  <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                </select></div>
                <div><p className={labelCls}>Valor do PIX (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => {
                  const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                  setMoney("valor_comprovante_input", e.target.value);
                  const newVendido = recalcVendido({ comp: clean });
                  if (produtosCarrinho.length === 0 && newVendido) {
                    setForm(f => ({ ...f, valor_comprovante_input: clean, preco_vendido: newVendido }));
                  }
                }} placeholder="Valor transferido" className={inputCls} /></div>
                </>
              )}

              {form.forma === "DEBITO" && (
                <>
                  <div><p className={labelCls}>Maquina</p><select value={form.banco} onChange={(e) => set("banco", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option>
                  </select></div>
                  <div><p className={labelCls}>Valor no Comprovante (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => {
                    const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                    setMoney("valor_comprovante_input", e.target.value);
                    const newVendido = recalcVendido({ comp: clean });
                    if (produtosCarrinho.length === 0 && newVendido) {
                      setForm(f => ({ ...f, valor_comprovante_input: clean, preco_vendido: newVendido }));
                    }
                  }} placeholder="Valor da maquina" className={inputCls} /></div>
                  <div className={`col-span-2 md:col-span-3 rounded-lg px-3 py-2 text-xs flex flex-wrap gap-3 ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                    <span>Taxa: <strong className="text-[#E8740E]">0.75%</strong></span>
                    <span>Recebimento: <strong className="text-blue-600">D+1</strong></span>
                    {(parseFloat(form.valor_comprovante_input) || 0) > 0 && (
                      <>
                        <span>Liquido debito: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, 0.75))}</strong></span>
                        {entradaPix > 0 && <span>+ PIX: <strong>{fmt(entradaPix)}</strong></span>}
                        {entradaEspecie > 0 && <span>+ Especie: <strong>{fmt(entradaEspecie)}</strong></span>}
                        {valorTroca > 0 && <span>+ Troca: <strong>{fmt(valorTroca)}</strong></span>}
                        <span>= Vendido: <strong className="text-green-600">{fmt(Math.round(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, 0.75) + entradaPix + entradaEspecie + valorTroca))}</strong></span>
                      </>
                    )}
                  </div>
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
                      <div><p className={labelCls}>Valor no Comprovante (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => {
                        const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                        setMoney("valor_comprovante_input", e.target.value);
                        // Só auto-calcular preco_vendido se NÃO tem produtos no carrinho (venda simples)
                        if (produtosCarrinho.length === 0) {
                          const compVal = parseFloat(clean) || 0;
                          if (compVal > 0 && taxa > 0) {
                            const liquidoCartao = calcularLiquido(compVal, taxa);
                            const totalLiq = Math.round(liquidoCartao + entradaPix + entradaEspecie + valorTroca);
                            setForm(f => ({ ...f, valor_comprovante_input: clean, preco_vendido: String(totalLiq) }));
                          }
                        }
                      }} placeholder="Valor da maquina" className={inputCls} /></div>
                      {(() => {
                        const compPrincDisp = parseFloat(form.valor_comprovante_input) || 0;
                        const liqPrincDisp = compPrincDisp > 0 ? calcularLiquido(compPrincDisp, taxa) : 0;
                        const compAltDisp = parseFloat(form.comp_alt) || 0;
                        const formaAlt = (form.forma_alt || form.forma || "CARTAO") as "CARTAO" | "LINK";
                        const bancoAlt = formaAlt === "LINK" ? "MERCADO_PAGO" : (form.banco_alt || "ITAU");
                        const taxaAltDisp = compAltDisp > 0 ? getTaxa(bancoAlt, form.band_alt || null, parseInt(form.parc_alt) || 0, formaAlt) : 0;
                        const liqAltDisp = compAltDisp > 0 ? (taxaAltDisp > 0 ? calcularLiquido(compAltDisp, taxaAltDisp) : compAltDisp) : 0;
                        const bancoPrincLabel = (form.banco || "ITAU").replace("_", " ");
                        const parcPrinc = parseInt(form.qnt_parcelas) || 1;
                        const parcAlt = parseInt(form.parc_alt) || 1;
                        const bancoAltLabel = formaAlt === "LINK" ? "Mercado Pago" : (form.banco_alt || "ITAU").replace("_", " ");
                        const totalVendido = Math.round(liqPrincDisp + liqAltDisp + entradaPix + entradaEspecie + valorTroca);
                        return (
                          <div className={`col-span-2 md:col-span-3 rounded-lg px-3 py-2.5 text-xs ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span>💳 <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{bancoPrincLabel} {form.bandeira ? `(${form.bandeira})` : ""} {parcPrinc}x</strong></span>
                                <span>• Taxa <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                                {compPrincDisp > 0 && <span>• Bruto {fmt(compPrincDisp)}</span>}
                                {compPrincDisp > 0 && <span>→ Líquido <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(liqPrincDisp)}</strong></span>}
                              </div>
                              {compAltDisp > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>{formaAlt === "LINK" ? "🔗" : "💳"} <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{formaAlt === "LINK" ? "Link Mercado Pago" : bancoAltLabel} {form.band_alt && formaAlt !== "LINK" ? `(${form.band_alt})` : ""} {parcAlt}x</strong></span>
                                  {taxaAltDisp > 0 && <span>• Taxa <strong className="text-[#E8740E]">{taxaAltDisp.toFixed(2)}%</strong></span>}
                                  <span>• Bruto {fmt(compAltDisp)}</span>
                                  <span>→ Líquido <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(liqAltDisp)}</strong></span>
                                </div>
                              )}
                              {entradaPix > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2"><span>💸 <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>Pix</strong></span><span>• Valor {fmt(entradaPix)}</span></div>
                              )}
                              {entradaEspecie > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2"><span>💵 <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>Espécie</strong></span><span>• Valor {fmt(entradaEspecie)}</span></div>
                              )}
                              {valorTroca > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2"><span>🔄 <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>Troca</strong></span><span>• Valor {fmt(valorTroca)}</span></div>
                              )}
                              {compPrincDisp > 0 && (
                                <div className={`pt-1.5 border-t ${dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"} flex items-center gap-2`}>
                                  <span>✅ <strong>Total Vendido:</strong></span>
                                  <strong className="text-green-600 text-sm">{fmt(totalVendido)}</strong>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </>
              )}

              {form.forma === "LINK" && (
                <>
                  <div><p className={labelCls}>Parcelas no Link</p><input type="number" value={form.qnt_parcelas} onChange={(e) => set("qnt_parcelas", e.target.value)} placeholder="1" className={inputCls} /></div>
                  {taxa > 0 && (
                    <>
                      <div><p className={labelCls}>Valor no Link (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => {
                        const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                        setMoney("valor_comprovante_input", e.target.value);
                        if (produtosCarrinho.length === 0) {
                          const compVal = parseFloat(clean) || 0;
                          if (compVal > 0 && taxa > 0) {
                            const liquidoLink = calcularLiquido(compVal, taxa);
                            const totalLiq = Math.round(liquidoLink + entradaPix + entradaEspecie + valorTroca);
                            setForm(f => ({ ...f, valor_comprovante_input: clean, preco_vendido: String(totalLiq) }));
                          }
                        }
                      }} placeholder="Valor total do link" className={inputCls} /></div>
                      {(() => {
                        const compPrincDisp = parseFloat(form.valor_comprovante_input) || 0;
                        const liqPrincDisp = compPrincDisp > 0 ? calcularLiquido(compPrincDisp, taxa) : 0;
                        const compAltDisp = parseFloat(form.comp_alt) || 0;
                        const formaAlt = (form.forma_alt || "CARTAO") as "CARTAO" | "LINK";
                        const bancoAlt = formaAlt === "LINK" ? "MERCADO_PAGO" : (form.banco_alt || "ITAU");
                        const taxaAltDisp = compAltDisp > 0 ? getTaxa(bancoAlt, form.band_alt || null, parseInt(form.parc_alt) || 0, formaAlt) : 0;
                        const liqAltDisp = compAltDisp > 0 ? (taxaAltDisp > 0 ? calcularLiquido(compAltDisp, taxaAltDisp) : compAltDisp) : 0;
                        const parcPrinc = parseInt(form.qnt_parcelas) || 1;
                        const parcAlt = parseInt(form.parc_alt) || 1;
                        const bancoAltLabel = formaAlt === "LINK" ? "Mercado Pago" : (form.banco_alt || "ITAU").replace("_", " ");
                        const totalVendido = Math.round(liqPrincDisp + liqAltDisp + entradaPix + entradaEspecie + valorTroca);
                        return (
                          <div className={`col-span-2 md:col-span-3 rounded-lg px-3 py-2.5 text-xs ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span>🔗 <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>Link Mercado Pago {parcPrinc}x</strong></span>
                                <span>• Taxa <strong className="text-[#E8740E]">{taxa.toFixed(2)}%</strong></span>
                                {compPrincDisp > 0 && <span>• Bruto {fmt(compPrincDisp)}</span>}
                                {compPrincDisp > 0 && <span>→ Líquido <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(liqPrincDisp)}</strong></span>}
                              </div>
                              {compAltDisp > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>{formaAlt === "LINK" ? "🔗" : "💳"} <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{formaAlt === "LINK" ? "Link Mercado Pago" : bancoAltLabel} {form.band_alt && formaAlt !== "LINK" ? `(${form.band_alt})` : ""} {parcAlt}x</strong></span>
                                  {taxaAltDisp > 0 && <span>• Taxa <strong className="text-[#E8740E]">{taxaAltDisp.toFixed(2)}%</strong></span>}
                                  <span>• Bruto {fmt(compAltDisp)}</span>
                                  <span>→ Líquido <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(liqAltDisp)}</strong></span>
                                </div>
                              )}
                              {entradaPix > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2"><span>💸 <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>Pix</strong></span><span>• Valor {fmt(entradaPix)}</span></div>
                              )}
                              {entradaEspecie > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2"><span>💵 <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>Espécie</strong></span><span>• Valor {fmt(entradaEspecie)}</span></div>
                              )}
                              {valorTroca > 0 && (
                                <div className="flex flex-wrap items-center gap-x-2"><span>🔄 <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>Troca</strong></span><span>• Valor {fmt(valorTroca)}</span></div>
                              )}
                              {compPrincDisp > 0 && (
                                <div className={`pt-1.5 border-t ${dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]"} flex items-center gap-2`}>
                                  <span>✅ <strong>Total Vendido:</strong></span>
                                  <strong className="text-green-600 text-sm">{fmt(totalVendido)}</strong>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Destaque do valor na forma principal quando é PIX ou ESPECIE
                 (nesses casos não existe campo próprio — o valor sai do Preço Vendido Líquido
                 menos as entradas mistas). Deixa explícito pra vendedora não ficar perdida. */}
            {(form.forma === "ESPECIE" || form.forma === "PIX") && preco > 0 && (
              <div className="mt-3 rounded-xl border-2 border-[#E8740E]/40 bg-[#FFF7ED] px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#E8740E]">
                    {form.forma === "ESPECIE" ? "💵 Valor em Espécie (Dinheiro)" : "💸 Valor em PIX"}
                  </p>
                  <p className="text-xl font-bold text-[#1D1D1F]">R$ {fmt(Math.max(0, valorCartao))}</p>
                </div>
                <p className="text-[10px] text-[#86868B] max-w-[280px] text-right">
                  Calculado do Preço Vendido Líquido menos entradas mistas e troca. Pra mudar, ajuste o &quot;Preço Vendido Líquido&quot; acima.
                </p>
              </div>
            )}

            {/* Pagamento misto — combinações extras */}
            {form.forma && form.forma !== "FIADO" && (
            <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
              <p className="text-xs text-[#86868B] font-semibold">Pagamento misto? (combine valores abaixo)</p>

              {/* Entrada PIX */}
              {form.forma !== "PIX" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelCls}>Entrada PIX (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.entrada_pix)} onChange={(e) => {
                  const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                  const newVendido = recalcVendido({ pix: clean });
                  setForm(f => ({ ...f, entrada_pix: clean, ...(newVendido ? { preco_vendido: newVendido } : {}), ...(parseFloat(clean) > 0 && !f.banco_pix ? { banco_pix: "ITAU" } : {}) }));
                }} placeholder="0" className={inputCls} /></div>
                {entradaPix > 0 && (
                  <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                  </select></div>
                )}
              </div>
              )}

              {/* 2o PIX opcional — usa-se quando o cliente divide o pagamento
                  entre dois bancos. Valor sai do banco principal e entra no
                  banco_pix_2. Sempre visível pra que o operador lembre que
                  pode dividir; fica inerte se deixado zerado. */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelCls}>2º PIX (R$) — opcional</p><input type="text" inputMode="numeric" value={fmtMil(form.entrada_pix_2)} onChange={(e) => {
                  const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                  const newVendido = recalcVendido({ pix2: clean });
                  setForm(f => ({ ...f, entrada_pix_2: clean, ...(newVendido ? { preco_vendido: newVendido } : {}), ...(parseFloat(clean) > 0 && !f.banco_pix_2 ? { banco_pix_2: "INFINITE" } : {}) }));
                }} placeholder="0" className={inputCls} /></div>
                {parseFloat(form.entrada_pix_2) > 0 && (
                  <div><p className={labelCls}>Banco do 2º PIX</p><select value={form.banco_pix_2} onChange={(e) => set("banco_pix_2", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                  </select></div>
                )}
              </div>

              {/* Entrada Especie */}
              {form.forma !== "ESPECIE" && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelCls}>Entrada Especie (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.entrada_especie)} onChange={(e) => {
                  const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                  const newVendido = recalcVendido({ especie: clean });
                  setForm(f => ({ ...f, entrada_especie: clean, ...(newVendido ? { preco_vendido: newVendido } : {}) }));
                }} placeholder="0" className={inputCls} /></div>
              </div>
              )}

              {/* Parte Fiado */}
              <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-[#86868B]">
                  <input type="checkbox" checked={parseFloat(form.entrada_fiado) > 0} onChange={(e) => {
                    if (!e.target.checked) { setForm(f => ({ ...f, entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "" })); }
                    else { setForm(f => ({ ...f, entrada_fiado: f.entrada_fiado || "1", fiado_qnt_parcelas: f.fiado_qnt_parcelas || "1" })); }
                  }} className="accent-[#E8740E]" />
                  <span className="font-semibold">Parte Fiado?</span>
                </label>
                {parseFloat(form.entrada_fiado) > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className={labelCls}>Valor Total Fiado (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.entrada_fiado)} onChange={(e) => { setMoney("entrada_fiado", e.target.value); }} placeholder="0" className={inputCls} /></div>
                    <div><p className={labelCls}>Nº Parcelas</p><select value={form.fiado_qnt_parcelas || "1"} onChange={(e) => setForm(f => ({ ...f, fiado_qnt_parcelas: e.target.value }))} className={selectCls}>
                      {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x de R$ {((parseFloat(form.entrada_fiado)||0)/n).toFixed(0)}</option>)}
                    </select></div>
                    <div><p className={labelCls}>Data 1ª Parcela</p><input type="date" value={form.fiado_data_inicio || ""} onChange={(e) => setForm(f => ({ ...f, fiado_data_inicio: e.target.value }))} className={inputCls} /></div>
                    <div><p className={labelCls}>Intervalo</p><select value={form.fiado_intervalo || "7"} onChange={(e) => setForm(f => ({ ...f, fiado_intervalo: e.target.value }))} className={selectCls}>
                      <option value="7">Semanal</option>
                      <option value="14">Quinzenal</option>
                      <option value="30">Mensal</option>
                    </select></div>
                  </div>
                )}
              </div>

              {/* Resumo misto */}
              {(entradaPix > 0 || entradaEspecie > 0) && (
                <div className={`rounded-lg px-3 py-2 text-xs flex flex-wrap gap-3 ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                  {entradaPix > 0 && <span>PIX: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(entradaPix)}</strong></span>}
                  {entradaEspecie > 0 && <span>Especie: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(entradaEspecie)}</strong></span>}
                  {valorTroca > 0 && <span>Troca: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(valorTroca)}</strong></span>}
                  <span>Restante ({form.forma}): <strong className="text-[#E8740E]">{fmt(Math.max(0, valorCartao))}</strong></span>
                </div>
              )}
            </div>
            )}

            {/* Segundo cartão/link (opcional) */}
            {(form.forma === "CARTAO" || form.forma === "LINK") && (
            <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-[#86868B]">
                <input type="checkbox" checked={!!form.banco_alt} onChange={(e) => {
                  if (!e.target.checked) { set("banco_alt", ""); set("parc_alt", ""); set("band_alt", ""); set("comp_alt", ""); set("forma_alt", ""); }
                  else { set("banco_alt", form.forma === "LINK" ? "MERCADO_PAGO" : "ITAU"); set("forma_alt", form.forma); }
                }} className="accent-[#E8740E]" />
                <span className="font-semibold">Cliente pagou com 2° {form.forma === "LINK" ? "link/cartão" : "cartão/link"}?</span>
              </label>
              {form.banco_alt && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className={labelCls}>Forma (2°)</p><select value={form.forma_alt || form.forma} onChange={(e) => { const v = e.target.value; setForm(f => ({ ...f, forma_alt: v, banco_alt: v === "LINK" ? "MERCADO_PAGO" : (f.banco_alt === "MERCADO_PAGO" ? "ITAU" : f.banco_alt || "ITAU") })); }} className={selectCls}>
                    <option value="CARTAO">Maquina Cartão</option>
                    <option value="LINK">Link Mercado Pago</option>
                  </select></div>
                  {(form.forma_alt || form.forma) !== "LINK" && (
                    <div><p className={labelCls}>Maquina</p><select value={form.banco_alt} onChange={(e) => set("banco_alt", e.target.value)} className={selectCls}>
                      <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                    </select></div>
                  )}
                  <div><p className={labelCls}>Parcelas</p><input type="number" value={form.parc_alt} onChange={(e) => set("parc_alt", e.target.value)} placeholder="1" className={inputCls} /></div>
                  {(form.forma_alt || form.forma) !== "LINK" && (
                    <div><p className={labelCls}>Bandeira</p><select value={form.band_alt} onChange={(e) => set("band_alt", e.target.value)} className={selectCls}>
                      <option value="">Selecionar</option><option>VISA</option><option>MASTERCARD</option><option>ELO</option><option>AMEX</option>
                    </select></div>
                  )}
                  <div><p className={labelCls}>Valor no comprovante (R$)</p><input type="number" value={form.comp_alt} onChange={(e) => set("comp_alt", e.target.value)} placeholder="0" className={inputCls} /></div>
                </div>
              )}
            </div>
            )}
            </>
            )}
          </div>
          )}

          {/* Seção de troca movida para antes do botão "Adicionar ao Carrinho" */}

          {/* ===== PAGAMENTO + TROCA SEPARADOS (cart mode: produtosCarrinho >= 1) ===== */}
          {produtosCarrinho.length > 0 && (
          <div className="space-y-4">
            <div className="border-t-2 border-[#E8740E] pt-4">
              <p className="text-sm font-bold text-[#1D1D1F] mb-1">Pagamento (para todos os produtos)</p>
              <p className="text-[10px] text-[#86868B] mb-3">Preencha o pagamento uma unica vez — vale para todos os {produtosCarrinho.length} produto{produtosCarrinho.length > 1 ? "s" : ""} no carrinho.</p>

              {/* Valor total da venda — distribui proporcional ao custo */}
              {(() => {
                const multiProduto = produtosCarrinho.length > 1;
                const allHavePrice = produtosCarrinho.every(p => parseFloat(p.preco_vendido) > 0);
                const isOpen = multiProduto || !!form.valor_total_venda || !allHavePrice;
                return isOpen ? (
                  <div className="border border-green-300 bg-green-50 rounded-xl p-4 space-y-2">
                    <p className={labelCls}>Valor total da venda (R$)</p>
                    <p className="text-[10px] text-[#86868B] -mt-1">
                      {multiProduto
                        ? "Quanto o cliente pagou no total? (PIX + cartao + troca). O sistema distribui entre os produtos."
                        : "Preencha o total recebido. Ou edite o preco vendido manualmente acima."
                      }
                    </p>
                    <input
                      type="text" inputMode="numeric"
                      value={fmtMil(form.valor_total_venda)}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                        setForm(f => ({ ...f, valor_total_venda: clean }));
                        distribuirValorTotal(clean);
                      }}
                      placeholder="Ex: 13000"
                      className={inputCls + " font-bold text-lg"}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, valor_total_venda: "0" }))}
                    className="text-[11px] text-[#86868B] underline"
                  >
                    Distribuir por valor total?
                  </button>
                );
              })()}
            </div>

            {/* FORMA DE PAGAMENTO — cart mode */}
            <div className="border border-[#D2D2D7] rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[#1D1D1F]">Como o cliente pagou?</p>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={multiDatePagamento}
                    onChange={(e) => {
                      setMultiDatePagamento(e.target.checked);
                      if (e.target.checked && pagEntries.length === 0) {
                        setPagEntries([{ data: form.data || hojeBR(), valor: "", forma: "PIX", banco: "ITAU", parcelas: "", bandeira: "", obs: "" }]);
                      }
                    }}
                    className="accent-blue-500 w-3.5 h-3.5"
                  />
                  <span className={`text-[11px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Pagamentos em datas diferentes</span>
                </label>
              </div>

              {/* ── MULTI-DATE PAYMENT MODE ── */}
              {multiDatePagamento ? (
                <div className="space-y-3">
                  {pagEntries.map((entry, idx) => {
                    const entryFormaLabel = entry.forma === "CARTAO" ? "Cartão" : entry.forma === "DEBITO" ? "Débito" : entry.forma === "LINK" ? "Link MP" : entry.forma === "ESPECIE" ? "Espécie" : entry.forma || "—";
                    return (
                      <div key={idx} className={`p-3 rounded-xl border space-y-2 ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E0E0E5]"}`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${dm ? "text-blue-400" : "text-blue-600"}`}>Pagamento {idx + 1}</span>
                          {pagEntries.length > 1 && (
                            <button onClick={() => setPagEntries(prev => prev.filter((_, i) => i !== idx))} className="text-xs text-red-400 hover:text-red-600">✕ Remover</button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <p className={labelCls}>Data</p>
                            <input type="date" value={entry.data} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, data: e.target.value } : p))} className={inputCls} />
                          </div>
                          <div>
                            <p className={labelCls}>Valor (R$)</p>
                            <input type="text" inputMode="decimal" value={entry.valor} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, valor: e.target.value } : p))} placeholder="0" className={inputCls} />
                          </div>
                          <div>
                            <p className={labelCls}>Forma</p>
                            <select value={entry.forma} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, forma: e.target.value, parcelas: "", bandeira: "", banco: e.target.value === "ESPECIE" ? "ESPECIE" : e.target.value === "LINK" ? "MERCADO_PAGO" : p.banco || "ITAU" } : p))} className={selectCls}>
                              <option value="PIX">PIX</option>
                              <option value="CARTAO">Cartão Crédito</option>
                              <option value="DEBITO">Débito</option>
                              <option value="LINK">Link Mercado Pago</option>
                              <option value="ESPECIE">Espécie (Dinheiro)</option>
                            </select>
                          </div>
                          {entry.forma !== "ESPECIE" && (
                            <div>
                              <p className={labelCls}>{entry.forma === "PIX" ? "Banco do PIX" : entry.forma === "LINK" ? "Plataforma" : "Máquina"}</p>
                              <select value={entry.banco} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, banco: e.target.value } : p))} className={selectCls}>
                                {entry.forma === "LINK" ? (
                                  <option value="MERCADO_PAGO">Mercado Pago</option>
                                ) : (
                                  <>
                                    <option value="ITAU">Itaú</option>
                                    <option value="INFINITE">InfinitePay</option>
                                    <option value="MERCADO_PAGO">Mercado Pago</option>
                                  </>
                                )}
                              </select>
                            </div>
                          )}
                          {(entry.forma === "CARTAO" || entry.forma === "LINK") && (
                            <div>
                              <p className={labelCls}>Parcelas</p>
                              <select value={entry.parcelas} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, parcelas: e.target.value } : p))} className={selectCls}>
                                <option value="">—</option>
                                {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={String(n)}>{n}x</option>)}
                              </select>
                            </div>
                          )}
                          {(entry.forma === "CARTAO" || entry.forma === "DEBITO") && (
                            <div>
                              <p className={labelCls}>Bandeira</p>
                              <select value={entry.bandeira} onChange={e => setPagEntries(prev => prev.map((p, i) => i === idx ? { ...p, bandeira: e.target.value } : p))} className={selectCls}>
                                <option value="">—</option>
                                <option value="VISA">Visa</option>
                                <option value="MASTERCARD">Mastercard</option>
                                <option value="ELO">Elo</option>
                                <option value="AMEX">Amex</option>
                              </select>
                            </div>
                          )}
                        </div>
                        {entry.valor && (
                          <p className={`text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                            {fmt(parseFloat(entry.valor.replace(/\./g, "").replace(",", ".")) || 0)} via {entryFormaLabel}
                            {entry.parcelas ? ` ${entry.parcelas}x` : ""}
                            {entry.bandeira ? ` ${entry.bandeira}` : ""}
                            {entry.forma !== "ESPECIE" ? ` — ${(entry.forma === "LINK" ? "MERCADO_PAGO" : entry.banco || "ITAU").replace("_", " ")}` : ""}
                            {entry.data ? ` em ${entry.data.split("-").reverse().join("/")}` : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}

                  {/* Add new entry button */}
                  <button
                    onClick={() => setPagEntries(prev => [...prev, { data: form.data || hojeBR(), valor: "", forma: "PIX", banco: "ITAU", parcelas: "", bandeira: "", obs: "" }])}
                    className={`w-full py-2 rounded-xl border-2 border-dashed text-xs font-semibold transition-colors ${dm ? "border-[#3A3A3C] text-[#98989D] hover:border-blue-500 hover:text-blue-400" : "border-[#D2D2D7] text-[#86868B] hover:border-blue-400 hover:text-blue-500"}`}
                  >
                    + Adicionar outro pagamento
                  </button>

                  {/* Summary */}
                  {(() => {
                    const totalEntries = pagEntries.reduce((s, e) => s + (parseFloat(e.valor.replace(/\./g, "").replace(",", ".")) || 0), 0);
                    const precoVendido = parseFloat(form.preco_vendido) || 0;
                    const diff = precoVendido - totalEntries;
                    return totalEntries > 0 ? (
                      <div className={`rounded-xl px-4 py-2.5 text-xs flex flex-wrap gap-3 items-center ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                        <span>Total pagamentos: <strong className="text-green-600">{fmt(totalEntries)}</strong></span>
                        {precoVendido > 0 && (
                          <>
                            <span>Preço vendido: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(precoVendido)}</strong></span>
                            {Math.abs(diff) > 1 && (
                              <span className={diff > 0 ? "text-amber-600" : "text-red-500"}>
                                {diff > 0 ? `Falta: ${fmt(diff)}` : `Excede: ${fmt(Math.abs(diff))}`}
                              </span>
                            )}
                            {Math.abs(diff) <= 1 && <span className="text-green-600 font-bold">✓ Valor batido</span>}
                          </>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
              /* ── NORMAL SINGLE-DATE PAYMENT MODE ── */
              <>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div><p className={labelCls}>Forma principal</p><select value={form.forma} onChange={(e) => set("forma", e.target.value)} className={selectCls}>
                  <option value="">— Definir depois —</option>
                  <option value="PIX">PIX</option>
                  <option value="CARTAO">Maquina Cartao</option>
                  <option value="DEBITO">Debito</option>
                  <option value="LINK">Link Mercado Pago</option>
                  <option value="ESPECIE">Especie (Dinheiro)</option>
                  <option value="FIADO">Fiado</option>
                </select></div>

                {form.forma === "PIX" && (
                  <>
                  <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                    <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                  </select></div>
                  <div><p className={labelCls}>Valor transferido (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => {
                    const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                    setMoney("valor_comprovante_input", e.target.value);
                    recalcVendido({ comp: clean });
                  }} placeholder="Valor do PIX" className={inputCls} /></div>
                  {(parseFloat(form.valor_comprovante_input) || 0) > 0 && (
                    <div className={`col-span-2 md:col-span-3 rounded-lg px-3 py-2 text-xs flex flex-wrap gap-3 ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                      {entradaEspecie > 0 && <span>+ Especie: <strong>{fmt(entradaEspecie)}</strong></span>}
                      {valorTroca > 0 && <span>+ Troca: <strong>{fmt(valorTroca)}</strong></span>}
                      <span>= Vendido: <strong className="text-green-600">{fmt(Math.round((parseFloat(form.valor_comprovante_input) || 0) + entradaEspecie + valorTroca))}</strong></span>
                    </div>
                  )}
                  </>
                )}

                {form.forma === "DEBITO" && (
                  <>
                    <div><p className={labelCls}>Maquina</p><select value={form.banco} onChange={(e) => set("banco", e.target.value)} className={selectCls}>
                      <option>ITAU</option><option>INFINITE</option>
                    </select></div>
                    <div><p className={labelCls}>Valor no Comprovante (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => {
                      const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                      setMoney("valor_comprovante_input", e.target.value);
                      recalcVendido({ comp: clean });
                    }} placeholder="Valor da maquina" className={inputCls} /></div>
                    <div className={`col-span-2 md:col-span-3 rounded-lg px-3 py-2 text-xs flex flex-wrap gap-3 ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                      <span>Taxa: <strong className="text-[#E8740E]">0.75%</strong></span>
                      <span>Recebimento: <strong className="text-blue-600">D+1</strong></span>
                      {(parseFloat(form.valor_comprovante_input) || 0) > 0 && (
                        <>
                          <span>Liquido debito: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, 0.75))}</strong></span>
                          {entradaPix > 0 && <span>+ PIX: <strong>{fmt(entradaPix)}</strong></span>}
                          {entradaEspecie > 0 && <span>+ Especie: <strong>{fmt(entradaEspecie)}</strong></span>}
                          {valorTroca > 0 && <span>+ Troca: <strong>{fmt(valorTroca)}</strong></span>}
                          <span>= Vendido: <strong className="text-green-600">{fmt(Math.round(calcularLiquido(parseFloat(form.valor_comprovante_input) || 0, 0.75) + entradaPix + entradaEspecie + valorTroca))}</strong></span>
                        </>
                      )}
                    </div>
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
                        <div><p className={labelCls}>Valor no Comprovante (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => {
                          const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                          setMoney("valor_comprovante_input", e.target.value);
                          recalcVendido({ comp: clean });
                        }} placeholder="Valor da maquina" className={inputCls} /></div>
                        <div className={`col-span-2 md:col-span-3 rounded-lg px-3 py-2 text-xs flex flex-wrap gap-3 ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
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
                        <div><p className={labelCls}>Valor no Link (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.valor_comprovante_input)} onChange={(e) => {
                          const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                          setMoney("valor_comprovante_input", e.target.value);
                          recalcVendido({ comp: clean });
                        }} placeholder="Valor total do link" className={inputCls} /></div>
                        <div className={`col-span-2 md:col-span-3 rounded-lg px-3 py-2 text-xs flex flex-wrap gap-3 ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
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

              {/* Destaque do valor na forma principal quando é PIX ou ESPECIE — modo carrinho */}
              {(form.forma === "ESPECIE" || form.forma === "PIX") && preco > 0 && (
                <div className="mt-3 rounded-xl border-2 border-[#E8740E]/40 bg-[#FFF7ED] px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#E8740E]">
                      {form.forma === "ESPECIE" ? "💵 Valor em Espécie (Dinheiro)" : "💸 Valor em PIX"}
                    </p>
                    <p className="text-xl font-bold text-[#1D1D1F]">R$ {fmt(Math.max(0, valorCartao))}</p>
                  </div>
                  <p className="text-[10px] text-[#86868B] max-w-[280px] text-right">
                    Calculado do Preço Vendido Líquido menos entradas mistas e troca.
                  </p>
                </div>
              )}

              {/* Pagamento misto — cart mode */}
              {form.forma && form.forma !== "FIADO" && (
              <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
                <p className="text-xs text-[#86868B] font-semibold">Pagamento misto? (combine valores abaixo)</p>

                {/* Entrada PIX */}
                {form.forma !== "PIX" && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><p className={labelCls}>Entrada PIX (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.entrada_pix)} onChange={(e) => {
                    const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                    setForm(f => ({ ...f, entrada_pix: clean, ...(parseFloat(clean) > 0 && !f.banco_pix ? { banco_pix: "ITAU" } : {}) }));
                    recalcVendido({ pix: clean });
                  }} placeholder="0" className={inputCls} /></div>
                  {entradaPix > 0 && (
                    <div><p className={labelCls}>Banco do PIX</p><select value={form.banco_pix} onChange={(e) => set("banco_pix", e.target.value)} className={selectCls}>
                      <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                    </select></div>
                  )}
                </div>
                )}

                {/* 2o PIX opcional — cart mode. Espelha o bloco do single-produto. */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><p className={labelCls}>2º PIX (R$) — opcional</p><input type="text" inputMode="numeric" value={fmtMil(form.entrada_pix_2)} onChange={(e) => {
                    const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                    setForm(f => ({ ...f, entrada_pix_2: clean, ...(parseFloat(clean) > 0 && !f.banco_pix_2 ? { banco_pix_2: "INFINITE" } : {}) }));
                    recalcVendido({ pix2: clean });
                  }} placeholder="0" className={inputCls} /></div>
                  {parseFloat(form.entrada_pix_2) > 0 && (
                    <div><p className={labelCls}>Banco do 2º PIX</p><select value={form.banco_pix_2} onChange={(e) => set("banco_pix_2", e.target.value)} className={selectCls}>
                      <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                    </select></div>
                  )}
                </div>

                {/* Entrada Especie */}
                {form.forma !== "ESPECIE" && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><p className={labelCls}>Entrada Especie (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.entrada_especie)} onChange={(e) => {
                    const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                    setMoney("entrada_especie", e.target.value);
                    recalcVendido({ especie: clean });
                  }} placeholder="0" className={inputCls} /></div>
                </div>
                )}

                {/* Parte Fiado — cart mode */}
                <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
                  <label className="flex items-center gap-2 text-sm text-[#86868B]">
                    <input type="checkbox" checked={parseFloat(form.entrada_fiado) > 0} onChange={(e) => {
                      if (!e.target.checked) { setForm(f => ({ ...f, entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "" })); }
                      else { setForm(f => ({ ...f, fiado_qnt_parcelas: f.fiado_qnt_parcelas || "1" })); }
                    }} className="accent-[#E8740E]" />
                    <span className="font-semibold">Parte Fiado?</span>
                  </label>
                  {parseFloat(form.entrada_fiado) > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div><p className={labelCls}>Valor Total Fiado (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.entrada_fiado)} onChange={(e) => { setMoney("entrada_fiado", e.target.value); }} placeholder="0" className={inputCls} /></div>
                      <div><p className={labelCls}>Nº Parcelas</p><select value={form.fiado_qnt_parcelas || "1"} onChange={(e) => setForm(f => ({ ...f, fiado_qnt_parcelas: e.target.value }))} className={selectCls}>
                        {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}x de R$ {((parseFloat(form.entrada_fiado)||0)/n).toFixed(0)}</option>)}
                      </select></div>
                      <div><p className={labelCls}>Data 1ª Parcela</p><input type="date" value={form.fiado_data_inicio || ""} onChange={(e) => setForm(f => ({ ...f, fiado_data_inicio: e.target.value }))} className={inputCls} /></div>
                      <div><p className={labelCls}>Intervalo</p><select value={form.fiado_intervalo || "7"} onChange={(e) => setForm(f => ({ ...f, fiado_intervalo: e.target.value }))} className={selectCls}>
                        <option value="7">Semanal</option><option value="14">Quinzenal</option><option value="30">Mensal</option>
                      </select></div>
                    </div>
                  )}
                </div>

                {/* Resumo misto */}
                {(entradaPix > 0 || entradaEspecie > 0) && (
                  <div className={`rounded-lg px-3 py-2 text-xs flex flex-wrap gap-3 ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                    {entradaPix > 0 && <span>PIX: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(entradaPix)}</strong></span>}
                    {entradaEspecie > 0 && <span>Especie: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(entradaEspecie)}</strong></span>}
                    {valorTroca > 0 && <span>Troca: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(valorTroca)}</strong></span>}
                    <span>Restante ({form.forma}): <strong className="text-[#E8740E]">{fmt(Math.max(0, valorCartao))}</strong></span>
                  </div>
                )}
              </div>
              )}

              {/* Segundo cartão/link (opcional) — cart mode */}
              {(form.forma === "CARTAO" || form.forma === "LINK") && (
              <div className="border-t border-[#E8E8ED] pt-3 space-y-3">
                <label className="flex items-center gap-2 text-sm text-[#86868B]">
                  <input type="checkbox" checked={!!form.banco_alt} onChange={(e) => {
                    if (!e.target.checked) { set("banco_alt", ""); set("parc_alt", ""); set("band_alt", ""); set("comp_alt", ""); set("forma_alt", ""); }
                    else { set("banco_alt", form.forma === "LINK" ? "MERCADO_PAGO" : "ITAU"); set("forma_alt", form.forma); }
                  }} className="accent-[#E8740E]" />
                  <span className="font-semibold">Cliente pagou com 2° {form.forma === "LINK" ? "link/cartão" : "cartão/link"}?</span>
                </label>
                {form.banco_alt && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div><p className={labelCls}>Forma (2°)</p><select value={form.forma_alt || form.forma} onChange={(e) => { const v = e.target.value; setForm(f => ({ ...f, forma_alt: v, banco_alt: v === "LINK" ? "MERCADO_PAGO" : (f.banco_alt === "MERCADO_PAGO" ? "ITAU" : f.banco_alt || "ITAU") })); }} className={selectCls}>
                      <option value="CARTAO">Maquina Cartão</option>
                      <option value="LINK">Link Mercado Pago</option>
                    </select></div>
                    {(form.forma_alt || form.forma) !== "LINK" && (
                      <div><p className={labelCls}>Maquina</p><select value={form.banco_alt} onChange={(e) => set("banco_alt", e.target.value)} className={selectCls}>
                        <option>ITAU</option><option>INFINITE</option><option>MERCADO_PAGO</option>
                      </select></div>
                    )}
                    <div><p className={labelCls}>Parcelas</p><input type="number" value={form.parc_alt} onChange={(e) => set("parc_alt", e.target.value)} placeholder="1" className={inputCls} /></div>
                    {(form.forma_alt || form.forma) !== "LINK" && (
                      <div><p className={labelCls}>Bandeira</p><select value={form.band_alt} onChange={(e) => set("band_alt", e.target.value)} className={selectCls}>
                        <option value="">Selecionar</option><option>VISA</option><option>MASTERCARD</option><option>ELO</option><option>AMEX</option>
                      </select></div>
                    )}
                    <div><p className={labelCls}>Valor no comprovante (R$)</p><input type="number" value={form.comp_alt} onChange={(e) => set("comp_alt", e.target.value)} placeholder="0" className={inputCls} /></div>
                  </div>
                )}
              </div>
              )}
              </>
              )}
            </div>

          </div>
          )}

          {/* PRODUTO NA TROCA */}
          <div className="border border-[#D2D2D7] rounded-xl p-4 space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={trocaEnabled} onChange={(e) => {
                setTrocaEnabled(e.target.checked);
                if (!e.target.checked) {
                  // Limpar dados de troca ao desmarcar
                  setForm(f => ({ ...f, produto_na_troca: "", troca_produto: "", troca_cor: "", troca_bateria: "", troca_obs: "", troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "", troca_serial: "", troca_imei: "", troca_categoria: "", troca_condicao: "SEMINOVO" }));
                  setTrocaRow(createEmptyProdutoRow());
                  const newVendido = recalcVendido({ troca: "0" });
                  if (newVendido) setForm(f => ({ ...f, preco_vendido: newVendido }));
                }
              }} className="w-4 h-4 accent-orange-500" />
              <span className="text-sm font-bold text-[#1D1D1F]">🔄 Produto na troca? (para o produto acima)</span>
            </label>
            {trocaEnabled && <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><p className={labelCls}>Valor da troca (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.produto_na_troca)} onChange={(e) => {
                const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                const newVendido = recalcVendido({ troca: clean });
                setForm(f => ({ ...f, produto_na_troca: clean, ...(newVendido ? { preco_vendido: newVendido } : {}) }));
              }} placeholder="0" className={inputCls} /></div>
              {temTroca && (() => {
                const isLacrado = form.troca_condicao === "LACRADO";
                return (<>
                  {/* Toggle Lacrado/Seminovo — define se o produto entregue na troca
                      eh lacrado (novo, sem uso) ou seminovo (usado). Lacrado esconde
                      campos especificos de seminovo (bateria, grade, acessorios). */}
                  <div className="col-span-2 md:col-span-3">
                    <p className={labelCls}>Condição do produto na troca</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => set("troca_condicao", "SEMINOVO")}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${form.troca_condicao !== "LACRADO" ? "bg-yellow-100 border-yellow-400 text-yellow-800" : "bg-white border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"}`}>
                        🟡 Seminovo (usado)
                      </button>
                      <button type="button" onClick={() => set("troca_condicao", "LACRADO")}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${isLacrado ? "bg-blue-100 border-blue-400 text-blue-800" : "bg-white border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"}`}>
                        🔵 Lacrado (novo)
                      </button>
                    </div>
                  </div>
                  <div className="col-span-2 md:col-span-3">
                    <ProdutoSpecFields
                      row={trocaRow}
                      onChange={setTrocaRow}
                      onRemove={() => {}}
                      fornecedores={fornecedores}
                      inputCls={inputCls}
                      labelCls={labelCls}
                      darkMode={dm}
                      index={0}
                      compactMode
                    />
                  </div>
                  {!isLacrado && <div><p className={labelCls}>Bateria (%)</p><input type="number" value={form.troca_bateria} onChange={(e) => set("troca_bateria", e.target.value)} placeholder="Ex: 87" className={inputCls} /></div>}
                  <div><p className={labelCls}>Garantia</p><input value={form.troca_garantia || ""} onChange={(e) => set("troca_garantia", e.target.value)} placeholder="DD/MM/AAAA ou MM/AAAA" className={inputCls} /></div>
                  {!isLacrado && <div><p className={labelCls}>Grade</p><select value={form.troca_grade} onChange={(e) => set("troca_grade", e.target.value)} className={selectCls}>
                    <option value="">Selecionar</option><option value="A+">A+ (Impecável)</option><option value="A">A (Ótimo)</option><option value="AB">AB (Muito bom)</option><option value="B">B (Bom)</option><option value="C">C (Marcas visíveis)</option>
                  </select></div>}
                  {!isLacrado && (() => {
                    const tCat = form.troca_categoria || "";
                    const tShowCabo = ["IPHONES", "MACBOOK", "IPADS", "APPLE_WATCH"].includes(tCat);
                    const tShowFonte = ["MACBOOK", "IPADS"].includes(tCat);
                    const tShowPulseira = tCat === "APPLE_WATCH";
                    const tShowCiclos = tCat === "MACBOOK";
                    return (<>
                      <div className="flex gap-3 items-center flex-wrap">
                        <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_caixa === "SIM"} onChange={(e) => set("troca_caixa", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Caixa</label>
                        {tShowCabo && <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_cabo === "SIM"} onChange={(e) => set("troca_cabo", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Cabo</label>}
                        {tShowFonte && <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_fonte === "SIM"} onChange={(e) => set("troca_fonte", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Fonte</label>}
                        {tShowPulseira && <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_pulseira === "SIM"} onChange={(e) => set("troca_pulseira", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Pulseira</label>}
                      </div>
                      {tShowCiclos && <div><p className={labelCls}>Ciclos</p><input type="number" value={form.troca_ciclos} onChange={(e) => set("troca_ciclos", e.target.value)} placeholder="Ex: 120" className={inputCls} /></div>}
                    </>);
                  })()}
                  <div className="col-span-2 md:col-span-3"><p className={labelCls}>{isLacrado ? "Obs do produto" : "Obs do seminovo"}</p><input value={form.troca_obs} onChange={(e) => set("troca_obs", e.target.value)} placeholder="Detalhes adicionais..." className={inputCls} /></div>
                  <div><p className={labelCls}>Serial</p><input value={form.troca_serial} onChange={(e) => set("troca_serial", e.target.value.toUpperCase())} placeholder="Ex: F2LX..." className={inputCls} /></div>
                  <div><p className={labelCls}>IMEI</p><input value={form.troca_imei} onChange={(e) => set("troca_imei", e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="Ex: 35938..." className={inputCls} inputMode="numeric" /></div>
                </>);
              })()}
            </div>}
            {temTroca && <p className="text-xs text-orange-500">O produto na troca será adicionado como PENDENTE (aguardando recebimento)</p>}

            {/* Botão para adicionar 2º produto na troca */}
            {temTroca && !showSegundaTroca && (
              <button
                type="button"
                onClick={() => setShowSegundaTroca(true)}
                className="w-full py-2 rounded-lg text-xs font-semibold text-orange-600 border border-orange-300 hover:bg-orange-50 transition-colors"
              >
                + Adicionar 2º produto na troca
              </button>
            )}

            {/* 2º PRODUTO NA TROCA */}
            {showSegundaTroca && (
              <div className="mt-4 pt-4 border-t border-dashed border-orange-300">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-[#1D1D1F]">🔄 2º Produto na troca</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSegundaTroca(false); setTrocaEnabled(false);
                      setForm(f => ({ ...f, produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "", troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao2: "SEMINOVO" }));
                    }}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remover
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div><p className={labelCls}>Valor da 2ª troca (R$)</p><input type="text" inputMode="numeric" value={fmtMil(form.produto_na_troca2)} onChange={(e) => {
                    const clean = e.target.value.replace(/\./g, "").replace(/\D/g, "");
                    setForm(f => ({ ...f, produto_na_troca2: clean }));
                  }} placeholder="0" className={inputCls} /></div>
                  {(parseFloat(form.produto_na_troca2) || 0) > 0 && (() => {
                    const isLacrado2 = form.troca_condicao2 === "LACRADO";
                    return (<>
                      <div className="col-span-2 md:col-span-3">
                        <p className={labelCls}>Condição do 2º produto na troca</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => set("troca_condicao2", "SEMINOVO")}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${form.troca_condicao2 !== "LACRADO" ? "bg-yellow-100 border-yellow-400 text-yellow-800" : "bg-white border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"}`}>
                            🟡 Seminovo (usado)
                          </button>
                          <button type="button" onClick={() => set("troca_condicao2", "LACRADO")}
                            className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${isLacrado2 ? "bg-blue-100 border-blue-400 text-blue-800" : "bg-white border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"}`}>
                            🔵 Lacrado (novo)
                          </button>
                        </div>
                      </div>
                      <div className="col-span-2 md:col-span-3">
                        <ProdutoSpecFields
                          row={trocaRow2}
                          onChange={setTrocaRow2}
                          onRemove={() => {}}
                          fornecedores={fornecedores}
                          inputCls={inputCls}
                          labelCls={labelCls}
                          darkMode={dm}
                          index={1}
                          compactMode
                        />
                      </div>
                      {!isLacrado2 && <div><p className={labelCls}>Bateria (%)</p><input type="number" value={form.troca_bateria2} onChange={(e) => set("troca_bateria2", e.target.value)} placeholder="Ex: 85" className={inputCls} /></div>}
                      <div><p className={labelCls}>Garantia</p><input value={form.troca_garantia2 || ""} onChange={(e) => set("troca_garantia2", e.target.value)} placeholder="DD/MM/AAAA ou MM/AAAA" className={inputCls} /></div>
                      {!isLacrado2 && <div><p className={labelCls}>Grade</p><select value={form.troca_grade2} onChange={(e) => set("troca_grade2", e.target.value)} className={selectCls}>
                        <option value="">Selecionar</option><option value="A+">A+ (Impecável)</option><option value="A">A (Ótimo)</option><option value="AB">AB (Muito bom)</option><option value="B">B (Bom)</option><option value="C">C (Marcas visíveis)</option>
                      </select></div>}
                      {!isLacrado2 && (() => {
                        const t2Cat = form.troca_categoria2 || "";
                        const t2ShowCabo = ["IPHONES", "MACBOOK", "IPADS", "APPLE_WATCH"].includes(t2Cat);
                        const t2ShowFonte = ["MACBOOK", "IPADS"].includes(t2Cat);
                        const t2ShowPulseira = t2Cat === "APPLE_WATCH";
                        const t2ShowCiclos = t2Cat === "MACBOOK";
                        return (<>
                          <div className="flex gap-3 items-center flex-wrap">
                            <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_caixa2 === "SIM"} onChange={(e) => set("troca_caixa2", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Caixa</label>
                            {t2ShowCabo && <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_cabo2 === "SIM"} onChange={(e) => set("troca_cabo2", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Cabo</label>}
                            {t2ShowFonte && <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_fonte2 === "SIM"} onChange={(e) => set("troca_fonte2", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Fonte</label>}
                            {t2ShowPulseira && <label className="flex items-center gap-1 text-xs text-[#86868B]"><input type="checkbox" checked={form.troca_pulseira2 === "SIM"} onChange={(e) => set("troca_pulseira2", e.target.checked ? "SIM" : "")} className="accent-[#E8740E]" /> Pulseira</label>}
                          </div>
                          {t2ShowCiclos && <div><p className={labelCls}>Ciclos</p><input type="number" value={form.troca_ciclos2} onChange={(e) => set("troca_ciclos2", e.target.value)} placeholder="Ex: 120" className={inputCls} /></div>}
                        </>);
                      })()}
                      <div className="col-span-2 md:col-span-3"><p className={labelCls}>{isLacrado2 ? "Obs do 2º produto" : "Obs do 2º seminovo"}</p><input value={form.troca_obs2} onChange={(e) => set("troca_obs2", e.target.value)} placeholder="Detalhes adicionais..." className={inputCls} /></div>
                      <div><p className={labelCls}>Serial</p><input value={form.troca_serial2} onChange={(e) => set("troca_serial2", e.target.value.toUpperCase())} placeholder="Ex: F2LX..." className={inputCls} /></div>
                      <div><p className={labelCls}>IMEI</p><input value={form.troca_imei2} onChange={(e) => set("troca_imei2", e.target.value.replace(/\D/g, "").slice(0, 15))} placeholder="Ex: 35938..." className={inputCls} inputMode="numeric" /></div>
                    </>);
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Botão Adicionar Produto ao Carrinho — visível quando tem produto selecionado */}
          {form.produto && (
            <button
              onClick={handleAddToCart}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm bg-green-500 text-white hover:bg-green-600"
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
            const gTrocaEProds = allProds.reduce((s, p) => s + (parseFloat(p.produto_na_troca) || 0), 0);
            const gTrocaE = gTrocaEProds || valorTroca; // fallback: form global troca (cart mode)
            // Receita real = líquido cartão principal + líquido cartão alt + pix + espécie + troca
            let receitaReal = totalVendido; // fallback: soma dos preços vendidos
            if (gComp > 0 && taxa > 0) {
              const liqPrincipal = calcularLiquido(gComp, taxa);
              const taxaAlt = gCompAlt > 0 ? getTaxa((form.forma_alt || form.forma) === "LINK" ? "MERCADO_PAGO" : (form.banco_alt || "ITAU"), form.band_alt || null, parseInt(form.parc_alt) || 0, (form.forma_alt || form.forma || "CARTAO") as "CARTAO" | "LINK") : 0;
              const liqAlt = gCompAlt > 0 ? (taxaAlt > 0 ? calcularLiquido(gCompAlt, taxaAlt) : gCompAlt) : 0;
              receitaReal = liqPrincipal + liqAlt + gPixE + gEspecieE + gTrocaE;
            }
            const totalLucroAll = receitaReal - totalCusto;
            const totalMargemAll = receitaReal > 0 ? (totalLucroAll / receitaReal) * 100 : 0;

            // Conferencia: comprovante + comp_alt + pix + especie + troca should roughly match total vendido
            const gComprovante = parseFloat(form.valor_comprovante_input) || 0;
            const gCompAltConf = parseFloat(form.comp_alt) || 0;
            const gPix = parseFloat(form.entrada_pix) || 0;
            const gEspecie = parseFloat(form.entrada_especie) || 0;
            const gTrocaProds = allProds.reduce((s, p) => s + (parseFloat(p.produto_na_troca) || 0), 0);
            const gTroca = gTrocaProds || valorTroca;
            const somaFormas = gComprovante + gCompAltConf + gPix + gEspecie + gTroca;
            // Conferencia: somaFormas (gross) deve ser >= receitaReal (líquido). Comparar com receitaReal.
            const temConferencia = somaFormas > 0 && receitaReal > 0;
            const diffConferencia = Math.abs(somaFormas - receitaReal);
            // Tolerância maior para acomodar taxas de cartão (até 25% do gross)
            const confOk = diffConferencia <= Math.max(somaFormas * 0.25, 50);

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
                    {temCartao && valorCartao > 0 && <span>+ {form.forma === "LINK" ? "Link MP" : form.forma === "DEBITO" ? `Debito ${form.banco}` : `Cartao ${form.banco}`}: {fmt(valorCartao)}</span>}
                  </div>
                )}
                {temConferencia && (
                  <div className={`mt-2 pt-2 border-t border-white/10 text-xs text-center ${confOk ? "text-green-400" : "text-yellow-400"}`}>
                    {confOk ? "Conferencia OK" : `Conferencia: soma formas (${fmt(somaFormas)}) vs receita liquida (${fmt(receitaReal)}) — diferenca: ${fmt(diffConferencia)}`}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Toggle Programar Venda */}
          {!editandoVendaId && (
            <div className={`p-3 rounded-xl border space-y-3 ${vendaProgramada ? (dm ? "border-purple-500 bg-purple-900/20" : "border-purple-400 bg-purple-50") : dm ? "border-[#3A3A3C] bg-[#1C1C1E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={vendaProgramada}
                  onChange={(e) => {
                    setVendaProgramada(e.target.checked);
                    if (!e.target.checked) {
                      setProgramadaJaPago(false);
                      setProgramadaComSinal(false);
                      setDataProgramada("");
                      setForm(f => ({ ...f, sinal_antecipado: "", banco_sinal: "" }));
                    } else {
                      // Default: amanhã
                      const amanha = new Date(); amanha.setDate(amanha.getDate() + 1);
                      setDataProgramada(amanha.toISOString().split("T")[0]);
                    }
                  }}
                  className="w-4 h-4 rounded accent-purple-500"
                />
                <span className={`text-sm font-semibold ${vendaProgramada ? (dm ? "text-purple-300" : "text-purple-700") : dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                  📅 Programar venda
                </span>
              </label>
              {vendaProgramada && (
                <div className="space-y-2 pl-6">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={!programadaJaPago && !programadaComSinal}
                        onChange={() => {
                          setProgramadaJaPago(false);
                          setProgramadaComSinal(false);
                          setForm(f => ({ ...f, sinal_antecipado: "", banco_sinal: "" }));
                        }}
                        className="accent-purple-500"
                      />
                      <span className={`text-xs font-medium ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>⏳ Aguardando pagamento</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={programadaComSinal}
                        onChange={() => {
                          setProgramadaComSinal(true);
                          setProgramadaJaPago(false);
                          setForm(f => ({ ...f, banco_sinal: f.banco_sinal || "ITAU" }));
                        }}
                        className="accent-amber-500"
                      />
                      <span className={`text-xs font-medium ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>💰 Sinal pago — saldo na retirada</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        checked={programadaJaPago}
                        onChange={() => {
                          setProgramadaJaPago(true);
                          setProgramadaComSinal(false);
                          setForm(f => ({ ...f, sinal_antecipado: "", banco_sinal: "" }));
                        }}
                        className="accent-green-500"
                      />
                      <span className={`text-xs font-medium ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>✅ Já pago — entrega futura</span>
                    </label>
                  </div>
                  {programadaComSinal && (
                    <div className={`flex flex-wrap gap-3 items-center p-2 rounded-lg ${dm ? "bg-amber-900/20 border border-amber-700/40" : "bg-amber-50 border border-amber-200"}`}>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Valor do sinal:</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={form.sinal_antecipado}
                          onChange={(e) => setForm(f => ({ ...f, sinal_antecipado: e.target.value }))}
                          className={`w-28 px-2 py-1 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`}
                        />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Forma:</span>
                        <select
                          value={form.forma_sinal || "PIX"}
                          onChange={(e) => setForm(f => ({ ...f, forma_sinal: e.target.value }))}
                          className={`px-2 py-1 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`}
                        >
                          <option value="PIX">PIX</option>
                          <option value="CARTAO">Cartão</option>
                          <option value="LINK">Link MP</option>
                          <option value="DINHEIRO">Dinheiro</option>
                          <option value="DEBITO">Débito</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Banco:</span>
                        <select
                          value={form.banco_sinal}
                          onChange={(e) => setForm(f => ({ ...f, banco_sinal: e.target.value }))}
                          className={`px-2 py-1 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`}
                        >
                          <option value="ITAU">ITAU</option>
                          <option value="INFINITE">INFINITE</option>
                          <option value="MERCADO_PAGO">MERCADO_PAGO</option>
                          <option value="ESPECIE">ESPECIE</option>
                        </select>
                      </div>
                      {(parseFloat(form.sinal_antecipado) || 0) > 0 && (parseFloat(form.preco_vendido) || 0) > 0 && (
                        <span className={`text-[11px] ${dm ? "text-amber-300" : "text-amber-700"}`}>
                          Saldo restante: R$ {((parseFloat(form.preco_vendido) || 0) - (parseFloat(form.sinal_antecipado) || 0)).toFixed(2)}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-3 items-center">
                    <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Data programada:</span>
                    <input
                      type="date"
                      value={dataProgramada}
                      onChange={(e) => setDataProgramada(e.target.value)}
                      className={`px-2 py-1 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={saving}
              className={`flex-1 py-3 rounded-xl font-semibold transition-colors disabled:opacity-50 ${vendaProgramada && !editandoVendaId ? (programadaJaPago ? "bg-green-600 text-white hover:bg-green-700" : programadaComSinal ? "bg-amber-600 text-white hover:bg-amber-700" : "bg-purple-600 text-white hover:bg-purple-700") : "bg-[#E8740E] text-white hover:bg-[#F5A623]"}`}
            >
              {saving ? "Salvando..." : editandoVendaId ? "Salvar Alteracoes" : vendaProgramada ? `📅 ${programadaJaPago ? "Finalizar e Programar" : programadaComSinal ? `Programar c/ Sinal R$ ${parseFloat(form.sinal_antecipado || "0").toFixed(2)}` : "Programar Venda"} para ${dataProgramada || form.data}` : produtosCarrinho.length > 0 ? `Registrar ${produtosCarrinho.length + (form.produto ? 1 : 0)} Vendas` : "Registrar Venda"}
            </button>
            {form.cliente && (
              <button
                onClick={() => {
                  setForm((f) => ({ ...f, cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF" as "PF" | "PJ", cep: "", bairro: "", cidade: "", uf: "", local: "" }));
                  setLastClienteData(null);
                }}
                className={`px-4 py-3 rounded-xl border text-sm transition-colors ${dm ? "border-[#3A3A3C] text-[#98989D] hover:bg-[#2C2C2E]" : "border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"}`}
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
          const hoje = hojeStr;
          // Mapa grupo_id -> vendas do mesmo grupo (venda em conjunto).
          // Usado por isNFPendente pra tratar o grupo como uma unica pendencia
          // (uma NF cobre todos os produtos da transacao).
          const grupoPorId = new Map<string, typeof vendas>();
          for (const vx of vendas) {
            if (!vx.grupo_id) continue;
            const list = grupoPorId.get(vx.grupo_id) || [];
            list.push(vx);
            grupoPorId.set(vx.grupo_id, list);
          }
          // Helpers de pendencia: NF (nao anexada ou anexada sem envio) e Termo (troca sem termo assinado)
          const isNFPendente = (v: typeof vendas[number]): boolean => {
            if (v.is_brinde) return false;
            // Atacado nao emite NF (revendedor emite na ponta). Nunca considerar pendente.
            if (v.tipo === "ATACADO") return false;
            // Venda em conjunto: trata o grupo como uma unica NF. Soh o primeiro
            // item carrega a pendencia — senao cada item do grupo conta/avisa
            // duas vezes o mesmo NF. E se qualquer venda do grupo tem NF
            // anexada/enviada, todas consideram atendida.
            const irmaos = v.grupo_id ? grupoPorId.get(v.grupo_id) : null;
            if (irmaos && irmaos.length > 1) {
              if (irmaos[0].id !== v.id) return false;
              const anyNF = irmaos.some(g => g.nota_fiscal_url);
              if (!anyNF) return true;
              const anySent = irmaos.some(g => (g as unknown as { nota_fiscal_enviada?: boolean }).nota_fiscal_enviada);
              return !!(v.email && !anySent);
            }
            if (!v.nota_fiscal_url) return true;
            const enviada = (v as unknown as { nota_fiscal_enviada?: boolean }).nota_fiscal_enviada;
            return !!(v.email && !enviada);
          };
          const isTermoPendente = (v: typeof vendas[number]): boolean => {
            const temTroca = !!(v.troca_produto || v.produto_na_troca);
            if (!temTroca) return false;
            const termo = termosPorVenda[v.id];
            return !termo || termo.status !== "ASSINADO";
          };
          const filteredRawSemPendencia = (tab === "andamento"
            ? vendas.filter(v => v.status_pagamento === "AGUARDANDO")
            : tab === "formularios"
            ? vendas.filter(v => v.status_pagamento === "FORMULARIO_PREENCHIDO")
            : tab === "programadas"
            ? vendas.filter(v => v.status_pagamento === "PROGRAMADA")
            : tab === "hoje"
            ? vendas.filter(v => (v.status_pagamento === "FINALIZADO" || !v.status_pagamento) && (v.data_programada || v.data) === hoje)
            : tab === "correios"
            ? vendas.filter(v => v.local === "CORREIO" && v.codigo_rastreio)
            : vendas.filter(v => v.status_pagamento === "FINALIZADO" || !v.status_pagamento)
          ).filter(v => !filtroBrinde || v.is_brinde);
          // Aplicar filtro de pendencia (se ativo)
          const filteredRaw = filteredRawSemPendencia.filter(v => {
            // Filtro SKU via URL (?sku=X) tem prioridade — restringe tudo
            if (skuFilter) {
              const vSku = ((v as unknown as { sku?: string | null }).sku || "").toUpperCase();
              if (vSku !== skuFilter) return false;
            }
            if (pendenciaFilter === "nf") return isNFPendente(v);
            if (pendenciaFilter === "termo") return isTermoPendente(v);
            return true;
          });
          // Contagens para os chips (baseadas na aba atual, sem o filtro de pendencia)
          const countNFPendente = filteredRawSemPendencia.filter(isNFPendente).length;
          const countTermoPendente = filteredRawSemPendencia.filter(isTermoPendente).length;
          const tipoOrder = (t: string) => t === "UPGRADE" ? 0 : t === "VENDA" ? 1 : t === "ATACADO" ? 2 : 3;
          const filtered = [...filteredRaw].sort((a, b) => {
            if (ordenar === "origem") return (a.origem || "").localeCompare(b.origem || "");
            if (ordenar === "cliente") return (a.cliente || "").localeCompare(b.cliente || "");
            // 1. Tipo: UPGRADE → VENDA → ATACADO
            const tDiff = tipoOrder(a.tipo) - tipoOrder(b.tipo);
            if (tDiff !== 0) return tDiff;
            // 2. Agrupa mesmo cliente junto
            const cDiff = (a.cliente || "").localeCompare(b.cliente || "");
            if (cDiff !== 0) return cDiff;
            // 3. Mesmo grupo_id fica colado
            if (a.grupo_id && b.grupo_id && a.grupo_id === b.grupo_id) return 0;
            // 4. Data
            if (ordenar === "antigo") return (a.created_at || "").localeCompare(b.created_at || "");
            return (b.created_at || "").localeCompare(a.created_at || "");
          });

          // Mapa de grupo_id → vendas do mesmo grupo
          const grupoMap = new Map<string, Venda[]>();
          for (const v of filtered) {
            if (v.grupo_id) {
              const list = grupoMap.get(v.grupo_id) || [];
              list.push(v);
              grupoMap.set(v.grupo_id, list);
            }
          }

          // Agrupar vendas por data para exibição com divisórias
          const vendasPorData = new Map<string, Venda[]>();
          for (const v of filtered) {
            const d = v.data_programada || v.data || "sem-data";
            const list = vendasPorData.get(d) || [];
            list.push(v);
            vendasPorData.set(d, list);
          }
          const datasOrdenadas = [...vendasPorData.keys()].sort((a, b) => b.localeCompare(a));

          const titulo = tab === "andamento" ? "Vendas em Andamento" : tab === "formularios" ? "📝 Formulários Preenchidos pelo Cliente" : tab === "hoje" ? "Finalizadas Hoje" : tab === "correios" ? "📦 Envios pelos Correios" : tab === "programadas" ? "Vendas Programadas" : "Histórico de Vendas";
          const filteredFinanceiro = filtered.filter(v => v.status_pagamento !== "PROGRAMADA");
          const totalVendido = filteredFinanceiro.reduce((s, v) => s + (v.preco_vendido || 0), 0);
          const totalLucro = filteredFinanceiro.reduce((s, v) => s + (v.lucro || 0), 0);

          return (
            <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl overflow-hidden shadow-sm`}>
              <div className="px-5 py-4 border-b border-[#D2D2D7] flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <h2 className="font-bold text-[#1D1D1F]">{titulo}</h2>
                  <select
                    value={ordenar}
                    onChange={(e) => setOrdenar(e.target.value as typeof ordenar)}
                    className={`text-[10px] px-2 py-1 rounded-lg border focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#98989D]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#86868B]"}`}
                  >
                    <option value="recente">⏰ Mais recente</option>
                    <option value="antigo">⏰ Mais antigo</option>
                    <option value="origem">📌 Origem</option>
                    <option value="cliente">👤 Cliente</option>
                  </select>
                </div>
                <div className="flex gap-3 items-center flex-wrap text-xs text-[#86868B]">
                  <span>{filtered.length} vendas</span>
                  {/* Chips de pendencias — clicar filtra a lista, clicar de novo remove filtro.
                      Soh aparecem nas abas onde a pendencia faz sentido (vendas finalizaveis/finalizadas). */}
                  {(tab === "andamento" || tab === "hoje" || tab === "finalizadas") && (countNFPendente > 0 || countTermoPendente > 0) && (
                    <div className="flex gap-2 items-center">
                      <span className="text-[10px] uppercase tracking-wider font-semibold">Pendências:</span>
                      {countNFPendente > 0 && (
                        <button
                          onClick={() => setPendenciaFilter(pendenciaFilter === "nf" ? null : "nf")}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors inline-flex items-center gap-1 ${pendenciaFilter === "nf" ? "bg-amber-500 text-white border-amber-500" : "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"}`}
                          title="Vendas sem NF anexada, ou com NF anexa aguardando envio por email"
                        >
                          📄 {countNFPendente} NF pendente{countNFPendente > 1 ? "s" : ""}
                        </button>
                      )}
                      {countTermoPendente > 0 && (
                        <button
                          onClick={() => setPendenciaFilter(pendenciaFilter === "termo" ? null : "termo")}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors inline-flex items-center gap-1 ${pendenciaFilter === "termo" ? "bg-purple-500 text-white border-purple-500" : "bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100"}`}
                          title="Vendas com troca cujo termo ainda nao foi assinado pelo cliente"
                        >
                          📝 {countTermoPendente} Termo{countTermoPendente > 1 ? "s" : ""} pendente{countTermoPendente > 1 ? "s" : ""}
                        </button>
                      )}
                      {pendenciaFilter !== null && (
                        <button
                          onClick={() => setPendenciaFilter(null)}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                        >
                          ✕ Limpar filtro
                        </button>
                      )}
                    </div>
                  )}
                  {/* Botao de envio em massa de NFs pendentes — aparece quando
                      ha vendas no filtro atual com NF anexa + email + ainda nao
                      enviada. Confirma antes, mostra contagem e erros. */}
                  {(() => {
                    const pendentesNF = filtered.filter(v =>
                      v.tipo !== "ATACADO"
                      && v.nota_fiscal_url
                      && v.email
                      && !((v as unknown as { nota_fiscal_enviada?: boolean }).nota_fiscal_enviada)
                    );
                    if (pendentesNF.length === 0) return null;
                    return (
                      <button
                        onClick={async () => {
                          if (!confirm(`Enviar ${pendentesNF.length} NF(s) pendente(s) por email?\n\nVai disparar email pra cada cliente dessa lista. Quem ja recebeu nao sera reenviado.`)) return;
                          const ids = pendentesNF.map(v => v.id);
                          try {
                            const res = await fetch("/api/vendas", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                              body: JSON.stringify({ action: "enviar_nf_bulk", ids }),
                            });
                            const j = await res.json().catch(() => ({}));
                            console.log("[Bulk NF] status=", res.status, "body=", j);
                            if (res.ok && j.ok) {
                              const errTxt = j.erros && j.erros.length
                                ? ` (${j.erros.length} erro${j.erros.length > 1 ? "s" : ""}: ${j.erros.slice(0, 3).map((e: { cliente: string }) => e.cliente).join(", ")}${j.erros.length > 3 ? "..." : ""})`
                                : "";
                              setMsg(`${j.enviadas}/${j.total} NF(s) enviada(s)${errTxt}`);
                              if (j.erros && j.erros.length) {
                                console.error("[Bulk NF] erros detalhados:", j.erros);
                                alert(`${j.enviadas}/${j.total} enviadas.\n\n${j.erros.length} falharam — ver console (F12) pra detalhes.`);
                              }
                              await fetchVendas();
                            } else {
                              const erro = `Erro no envio em massa (HTTP ${res.status}): ${j.error || "sem detalhe"}`;
                              setMsg(erro);
                              alert(erro);
                            }
                          } catch (err) {
                            console.error("[Bulk NF] excecao:", err);
                            alert(`Erro de rede: ${String(err)}`);
                          }
                          setTimeout(() => setMsg(""), 6000);
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 transition-colors inline-flex items-center gap-1"
                        title="Envia todas as NFs anexadas que ainda nao foram enviadas por email"
                      >
                        📧 Enviar {pendentesNF.length} NF{pendentesNF.length > 1 ? "s" : ""} pendente{pendentesNF.length > 1 ? "s" : ""}
                      </button>
                    );
                  })()}
                  {selecionadas.size > 0 && (
                    <div className="flex gap-2">
                      {tab === "formularios" && (
                        <button
                          disabled={finalizandoLote}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ids = Array.from(selecionadas);
                            if (ids.length === 0) return;
                            if (!confirm(`Enviar ${ids.length} venda(s) para "Vendas Pendentes"?\n\nDepois disso cada venda vai aparecer na aba "Em Andamento" para finalização.`)) return;
                            setFinalizandoLote(true);
                            let ok = 0, fail = 0;
                            for (const id of ids) {
                              try {
                                const res = await fetch("/api/vendas", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                  body: JSON.stringify({ id, status_pagamento: "AGUARDANDO" }),
                                });
                                if (res.ok) ok++; else fail++;
                              } catch { fail++; }
                            }
                            setVendas(prev => prev.map(v => ids.includes(v.id) ? { ...v, status_pagamento: "AGUARDANDO" } : v));
                            setSelecionadas(new Set());
                            setFinalizandoLote(false);
                            setMsg(fail > 0 ? `${ok} enviada(s), ${fail} falha(s)` : `${ok} venda(s) enviada(s) para Pendentes!`);
                          }}
                          className="px-4 py-1.5 rounded-lg bg-yellow-500 text-white font-semibold hover:bg-yellow-600 transition-colors"
                        >
                          {finalizandoLote ? "Enviando..." : `➡️ Enviar ${selecionadas.size} para Pendentes`}
                        </button>
                      )}
                      {tab === "andamento" && (
                        <button
                          disabled={finalizandoLote}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ids = Array.from(selecionadas);
                            if (ids.length === 0) return;
                            if (!confirm(`Finalizar ${ids.length} venda(s) selecionada(s)?`)) return;
                            setFinalizandoLote(true);
                            let ok = 0, fail = 0;
                            const erros: string[] = [];
                            for (const id of ids) {
                              try {
                                const res = await fetch("/api/vendas", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                  body: JSON.stringify({ id, status_pagamento: "FINALIZADO" }),
                                });
                                if (res.ok) ok++;
                                else { fail++; const t = await res.text().catch(() => ""); erros.push(`${id}: HTTP ${res.status} ${t.slice(0, 100)}`); }
                              } catch (err) {
                                fail++;
                                erros.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
                              }
                            }
                            if (erros.length) console.error("[Finalizar Lote] erros:", erros);
                            setVendas(prev => prev.map(v => ids.includes(v.id) ? { ...v, status_pagamento: "FINALIZADO" } : v));
                            setSelecionadas(new Set());
                            setFinalizandoLote(false);
                            setMsg(fail > 0 ? `${ok} finalizada(s), ${fail} falha(s) — veja console` : `${ok} venda(s) finalizada(s)!`);
                          }}
                          className="px-4 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors"
                        >
                          {finalizandoLote ? "Finalizando..." : `✅ Finalizar ${selecionadas.size} selecionada(s)`}
                        </button>
                      )}
                      {/* Cancelar/Excluir selecionadas — disponível em todas as tabs */}
                      <button
                        disabled={finalizandoLote}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const ids = Array.from(selecionadas);
                          if (ids.length === 0) return;
                          if (!confirm(`⚠️ EXCLUIR ${ids.length} venda(s) selecionada(s)?\n\nIsso vai remover permanentemente do sistema e devolver produtos ao estoque.`)) return;
                          setFinalizandoLote(true);
                          let ok = 0, fail = 0;
                          const erros: string[] = [];
                          for (const id of ids) {
                            try {
                              const res = await fetch("/api/vendas", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                body: JSON.stringify({ id }),
                              });
                              if (res.ok) ok++;
                              else { fail++; const t = await res.text().catch(() => ""); erros.push(`${id}: HTTP ${res.status} ${t.slice(0, 100)}`); }
                            } catch (err) {
                              fail++;
                              erros.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
                            }
                          }
                          if (erros.length) console.error("[Excluir Lote] erros:", erros);
                          setVendas(prev => prev.filter(v => !ids.includes(v.id)));
                          setSelecionadas(new Set());
                          setFinalizandoLote(false);
                          setMsg(fail > 0 ? `${ok} excluída(s), ${fail} falha(s) — veja console` : `${ok} venda(s) excluída(s)!`);
                        }}
                        className="px-4 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors"
                      >
                        {finalizandoLote ? "Excluindo..." : `🗑️ Excluir ${selecionadas.size} selecionada(s)`}
                      </button>
                      {(tab === "finalizadas" || tab === "hoje") && (
                        <button
                          disabled={finalizandoLote}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const ids = Array.from(selecionadas);
                            if (ids.length === 0) return;
                            if (!confirm(`Mover ${ids.length} venda(s) para Pendentes?`)) return;
                            setFinalizandoLote(true);
                            let ok = 0, fail = 0;
                            const erros: string[] = [];
                            for (const id of ids) {
                              try {
                                const res = await fetch("/api/vendas", {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                  body: JSON.stringify({ id, status_pagamento: "AGUARDANDO" }),
                                });
                                if (res.ok) ok++;
                                else { fail++; const t = await res.text().catch(() => ""); erros.push(`${id}: HTTP ${res.status} ${t.slice(0, 100)}`); }
                              } catch (err) {
                                fail++;
                                erros.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
                              }
                            }
                            if (erros.length) console.error("[Mover Lote] erros:", erros);
                            setVendas(prev => prev.map(v => ids.includes(v.id) ? { ...v, status_pagamento: "AGUARDANDO" } : v));
                            setSelecionadas(new Set());
                            setFinalizandoLote(false);
                            setMsg(fail > 0 ? `${ok} movida(s), ${fail} falha(s) — veja console` : `${ok} venda(s) movida(s) para Pendentes!`);
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
                <div>
                  {filtered.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[#86868B]">Nenhuma venda {tab === "andamento" ? "em andamento" : tab === "formularios" ? "com formulário preenchido aguardando conferência" : tab === "hoje" ? "finalizada hoje" : tab === "correios" ? "com rastreio dos Correios" : "finalizada"}</div>
                  ) : datasOrdenadas.map((dataKey) => {
                    const vendasDoDia = vendasPorData.get(dataKey) || [];
                    const vendasDoDiaFinanceiro = vendasDoDia.filter(v => v.status_pagamento !== "PROGRAMADA");
                    const lucroDia = vendasDoDiaFinanceiro.reduce((s, v) => s + (v.lucro || 0), 0);
                    const vendidoDia = vendasDoDiaFinanceiro.reduce((s, v) => s + (v.preco_vendido || 0), 0);
                    const qtdDia = vendasDoDia.length;
                    const [y, m, d] = (dataKey || "").split("-");
                    const dataLabel = d && m && y ? `${d}/${m}/${y}` : dataKey;
                    const diaSemana = (() => {
                      try {
                        return new Date(dataKey + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long" });
                      } catch { return ""; }
                    })();

                    return (
                      <div key={dataKey}>
                        {/* Header do dia — FORA da tabela para não ser cortado */}
                        <div className="bg-[#E8740E] px-4 py-2.5 flex items-center gap-4 flex-wrap">
                          <span className="text-white font-semibold text-sm">
                            {dataLabel} <span className="text-white/70 font-normal capitalize text-xs ml-1">{diaSemana}</span>
                          </span>
                          <span className="text-white/80 text-xs">{qtdDia} vendas</span>
                          <span className="text-white/80 text-xs">Vendido: <strong className="text-white">{fmt(vendidoDia)}</strong></span>
                          <span className="bg-white/20 px-2 py-0.5 rounded text-white font-bold text-xs">Lucro: {fmt(lucroDia)}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#D2D2D7] bg-[#F5F5F7]"}`}>
                                {(tab === "andamento" || tab === "finalizadas" || tab === "hoje") && (
                                  <th className="px-3 py-2 w-8">
                                    <input
                                      type="checkbox"
                                      checked={vendasDoDia.length > 0 && vendasDoDia.every(v => selecionadas.has(v.id))}
                                      onChange={() => {
                                        const allSel = vendasDoDia.every(v => selecionadas.has(v.id));
                                        setSelecionadas(prev => {
                                          const next = new Set(prev);
                                          vendasDoDia.forEach(v => allSel ? next.delete(v.id) : next.add(v.id));
                                          return next;
                                        });
                                      }}
                                      className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                                    />
                                  </th>
                                )}
                                {["Data", "Cliente", "Origem", "Tipo", "Produto", "Custo", "Vendido", "Lucro", "Margem", "Pagamento", "Status", ""].map((h) => (
                                  <th key={h} className="px-3 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase tracking-wider whitespace-nowrap">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {vendasDoDia.map((v) => {
                        const temTrocaV = (v.produto_na_troca && v.produto_na_troca !== "-" && v.produto_na_troca !== "null") || !!v.troca_produto || !!(v as unknown as Record<string, string>).troca_produto2;
                        const temEntrada = v.entrada_pix && v.entrada_pix > 0;
                        const valorTrocaV = temTrocaV ? parseFloat(String(v.produto_na_troca)) || 0 : 0;
                        const valorTrocaV2 = parseFloat(String((v as unknown as Record<string, string>).produto_na_troca2 || 0)) || 0;
                        const valorTrocaTotal = valorTrocaV + valorTrocaV2;
                        const isExpanded = expandedId === v.id;
                        const grupoItens = v.grupo_id ? grupoMap.get(v.grupo_id) : null;
                        const isGrupo = grupoItens && grupoItens.length > 1;
                        const isFirstInGrupo = isGrupo && grupoItens[0].id === v.id;

                        const pagParts: string[] = [];
                        // Multi-data: quando ha pagamento_historia, lista cada pagamento
                        // individualmente (PIX + Cartao + etc) em vez de so mostrar o primeiro.
                        const pagHist = (v as unknown as { pagamento_historia?: Array<{ valor: number; forma: string; banco: string; data?: string; parcelas?: number; bandeira?: string }> }).pagamento_historia;
                        const hasMultiData = Array.isArray(pagHist) && pagHist.length > 1;
                        if (hasMultiData) {
                          if (valorTrocaTotal > 0) pagParts.push(`Troca: ${fmt(valorTrocaTotal)}`);
                          for (const entry of pagHist) {
                            if (!entry || !entry.valor) continue;
                            if (entry.forma === "PIX") pagParts.push(`💸 PIX ${entry.banco || "ITAU"}: ${fmt(entry.valor)}`);
                            else if (entry.forma === "CARTAO") pagParts.push(`${entry.banco || "CARTAO"}${entry.parcelas ? ` ${entry.parcelas}x` : ""}${entry.bandeira ? ` ${entry.bandeira}` : ""}: ${fmt(entry.valor)}`);
                            else if (entry.forma === "LINK") pagParts.push(`Link MP${entry.parcelas ? ` ${entry.parcelas}x` : ""}: ${fmt(entry.valor)}`);
                            else if (entry.forma === "DEBITO") pagParts.push(`Débito ${entry.banco || ""}: ${fmt(entry.valor)}`);
                            else if (entry.forma === "ESPECIE" || entry.forma === "DINHEIRO") pagParts.push(`💵 Espécie: ${fmt(entry.valor)}`);
                            else if (entry.forma === "FIADO") pagParts.push(`Fiado: ${fmt(entry.valor)}`);
                            else pagParts.push(`${entry.forma}: ${fmt(entry.valor)}`);
                          }
                        }
                        if (valorTrocaTotal > 0 && !hasMultiData) pagParts.push(`Troca: ${fmt(valorTrocaTotal)}`);
                        if (temEntrada && !hasMultiData) pagParts.push(`PIX ${v.banco_pix || "ITAU"}: ${fmt(v.entrada_pix)}`);
                        // 2o PIX (se presente) — mostra banco correto e valor.
                        const entradaPix2Val = parseFloat(String((v as unknown as { entrada_pix_2?: number }).entrada_pix_2 || 0)) || 0;
                        const bancoPix2Val = (v as unknown as { banco_pix_2?: string }).banco_pix_2 || "";
                        if (entradaPix2Val > 0 && !hasMultiData) pagParts.push(`PIX ${bancoPix2Val || "?"}: ${fmt(entradaPix2Val)}`);
                        if (v.entrada_especie && v.entrada_especie > 0 && !hasMultiData) pagParts.push(`Especie: ${fmt(v.entrada_especie)}`);
                        const entradaVal = parseFloat(String(v.entrada_pix || 0)) || 0;
                        const espVal = parseFloat(String(v.entrada_especie || 0)) || 0;
                        const compVal = parseFloat(String(v.valor_comprovante || 0)) || 0;
                        const creditoVal = parseFloat(String(v.credito_lojista_usado || 0)) || 0;
                        const precoTotal = parseFloat(String(v.preco_vendido || 0)) || 0;
                        if (creditoVal > 0 && !hasMultiData) pagParts.push(`Crédito: ${fmt(creditoVal)}`);
                        // resto = parte paga via forma principal (cartao/PIX principal/etc). Subtrai pix2
                        // pra nao contar em dobro: pix2 tem sua propria linha acima.
                        const resto = hasMultiData ? 0 : Math.max(0, Math.round(precoTotal - valorTrocaTotal - entradaVal - entradaPix2Val - espVal - compVal - creditoVal));
                        const formaLabel = (f: string | null | undefined) => {
                          if (!f) return "";
                          if (f === "DINHEIRO" || f === "ESPECIE") return "💵 Espécie";
                          if (f === "PIX") return "💸 PIX";
                          if (f === "LINK") return "Link MP";
                          if (f === "CARTAO") return "Cartão";
                          if (f === "DEBITO") return "Débito";
                          if (f === "FIADO") return "Fiado";
                          return f;
                        };
                        if (!hasMultiData) {
                          if (v.forma === "CARTAO" && v.qnt_parcelas) {
                            pagParts.push(`${v.banco} ${v.qnt_parcelas}x${v.bandeira ? ` ${v.bandeira}` : ""}${v.valor_comprovante ? ` (${fmt(v.valor_comprovante)})` : ""}`);
                          } else if (v.banco === "MERCADO_PAGO") {
                            pagParts.push(`Link MP${v.qnt_parcelas ? ` ${v.qnt_parcelas}x` : ""}${v.valor_comprovante ? ` (${fmt(v.valor_comprovante)})` : ""}`);
                          } else if (v.forma && v.forma !== "CARTAO") {
                            const lbl = formaLabel(v.forma);
                            const banco = v.banco && v.banco !== v.forma ? ` ${v.banco}` : "";
                            const valorForma = resto > 0 ? resto : (compVal > 0 ? compVal : 0);
                            if (valorForma > 0) pagParts.push(`${lbl}${banco}: ${fmt(valorForma)}`);
                          } else if (!v.forma && compVal > 0) {
                            // Forma não definida mas tem comprovante — exibe como PIX (fallback mais comum)
                            const banco = v.banco_pix || v.banco || "ITAU";
                            pagParts.push(`💸 PIX ${banco}: ${fmt(compVal)}`);
                          }
                          // Sem forma definida mas tem complemento a pagar
                          if (!v.forma && resto > 0 && compVal <= 0) {
                            pagParts.push(`Complemento: ${fmt(resto)}`);
                          }
                          if (v.banco_alt) {
                            pagParts.push(`2o: ${v.banco_alt} ${v.parc_alt || 0}x${v.band_alt ? ` ${v.band_alt}` : ""}${v.comp_alt ? ` (${fmt(v.comp_alt)})` : ""}`);
                          }
                        }

                        return (
                          <React.Fragment key={v.id}>
                            <tr
                              className={`border-b transition-colors cursor-pointer ${dm ? `border-[#3A3A3C] hover:bg-[#2C2C2E] ${isExpanded ? "bg-[#2C2C2E]" : ""}` : `border-[#F5F5F7] hover:bg-[#F5F5F7] ${isExpanded ? "bg-[#F5F5F7]" : ""}`} ${selecionadas.has(v.id) ? "bg-[#E8740E]/10" : ""} ${isGrupo ? "border-l-4 border-l-[#E8740E]" : ""}`}
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
                                  const efetiva = v.data_programada || v.data || "";
                                  const [y, m, d] = efetiva.split("-");
                                  return d && m ? `${d}/${m}` : efetiva;
                                })()}
                                {/* Badge HOJE/AMANHA/ATRASADO baseado em data_programada (facilita
                                    escaneamento da aba "Formularios" — saber se a visita do cliente
                                    e pra hoje/amanha sem abrir a venda). */}
                                {(() => {
                                  const efetiva = v.data_programada || v.data || "";
                                  if (!efetiva) return null;
                                  const amanhaStr = (() => { const d = new Date(hojeStr + "T12:00:00"); d.setDate(d.getDate() + 1); return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); })();
                                  if (efetiva === hojeStr) return <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-300">HOJE</span>;
                                  if (efetiva === amanhaStr) return <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-300">AMANHÃ</span>;
                                  if (efetiva < hojeStr) return <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-200 text-gray-700 border border-gray-300" title="Data ja passou">ATRASADO</span>;
                                  return null;
                                })()}
                                {v.data_programada && v.data_programada !== v.data && (
                                  <span className="block text-[10px] text-blue-500">
                                    Criado: {(() => { const [, m2, d2] = (v.data || "").split("-"); return d2 && m2 ? `${d2}/${m2}` : v.data; })()}
                                  </span>
                                )}
                                {v.created_at && !v.data_programada && (
                                  <span className="block text-[10px] text-[#B0B0B0]">
                                    {new Date(v.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 font-medium whitespace-nowrap text-sm uppercase">
                                {v.cliente}
                                {/* Badges de pendencia — mini icones ao lado do cliente. Mostram mesmo sem filtro. */}
                                {isNFPendente(v) && <span className="ml-1.5 text-xs" title="NF pendente (nao anexada ou nao enviada)">📄</span>}
                                {isTermoPendente(v) && <span className="ml-1 text-xs" title="Termo pendente (nao assinado)">📝</span>}
                              </td>
                              <td className="px-3 py-2.5"><span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>{v.origem}</span></td>
                              <td className="px-3 py-2.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.tipo === "UPGRADE" ? "bg-purple-100 text-purple-700" : v.tipo === "ATACADO" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>{v.tipo}</span>
                                {v.is_brinde && <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-pink-100 text-pink-700">BRINDE</span>}
                              </td>
                              <td className="px-3 py-2.5 max-w-[220px] text-xs">
                                <span className="truncate block whitespace-nowrap">{normalizarCoresNoTexto(buildProdutoDisplay(v))}</span>
                                {isFirstInGrupo && (
                                  <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#E8740E]/10 text-[#E8740E]">📦 {grupoItens.length} itens</span>
                                )}
                                {v.troca_produto && (
                                  <span className="block mt-0.5 text-[10px] text-purple-600 truncate whitespace-nowrap">🔄 {normalizarCoresNoTexto(v.troca_produto)}</span>
                                )}
                                {tab === "correios" && v.codigo_rastreio && (
                                  <a href={`https://www.linkcorreios.com.br/${v.codigo_rastreio}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white transition-colors">📦 {v.codigo_rastreio}</a>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-[#86868B] text-xs">{fmt(v.custo)}</td>
                              <td className="px-3 py-2.5 font-medium text-xs">{fmt(v.preco_vendido)}</td>
                              {v.status_pagamento === "PROGRAMADA" ? (
                                <>
                                  <td className="px-3 py-2.5 text-xs"><span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold text-[10px]">Programada</span></td>
                                  <td className="px-3 py-2.5 text-xs"><span className="text-amber-600 text-[10px]">—</span></td>
                                </>
                              ) : (
                                <>
                                  <td className={`px-3 py-2.5 font-bold text-xs ${v.lucro >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(v.lucro)}</td>
                                  <td className="px-3 py-2.5 text-[#86868B] text-xs">{Number(v.margem_pct || 0).toFixed(1)}%</td>
                                </>
                              )}
                              <td className="px-3 py-2.5 text-xs max-w-[250px]">
                                <div className="space-y-0.5">
                                  {pagParts.map((p, i) => (
                                    <span key={i} className="block text-[11px] text-[#1D1D1F]">{p}</span>
                                  ))}
                                </div>
                                <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.recebimento === "D+0" ? "bg-green-100 text-green-700" : v.recebimento === "D+1" ? "bg-blue-100 text-blue-700" : "bg-yellow-100 text-yellow-700"}`}>{v.recebimento}</span>
                                {Number(v.sinal_antecipado || 0) > 0 && v.status_pagamento === "PROGRAMADA" && (
                                  <span className="block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
                                    💰 Sinal {v.banco_sinal ? `${v.banco_sinal}` : ""}: {fmt(Number(v.sinal_antecipado))} — saldo {fmt((Number(v.preco_vendido) || 0) - Number(v.sinal_antecipado || 0))}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-semibold ${
                                  v.status_pagamento === "AGUARDANDO" ? "bg-yellow-100 text-yellow-700" :
                                  v.status_pagamento === "CANCELADO" ? "bg-red-100 text-red-600" :
                                  v.status_pagamento === "PROGRAMADA" ? (Number(v.sinal_antecipado || 0) > 0 ? "bg-amber-100 text-amber-700" : "bg-purple-100 text-purple-700") :
                                  "bg-green-100 text-green-700"
                                }`}>
                                  {v.status_pagamento === "AGUARDANDO" ? "⏳ Pendente" :
                                    v.status_pagamento === "CANCELADO" ? "❌ Cancelado" :
                                    v.status_pagamento === "PROGRAMADA" ? (Number(v.sinal_antecipado || 0) > 0 ? "💰 Sinal pago" : "📅 Programada") :
                                    "✅ Finalizado"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-[#86868B]">{isExpanded ? "▲" : "▼"}</td>
                            </tr>

                            {/* Linha expandida */}
                            {isExpanded && (
                              <tr className={dm ? "bg-[#1C1C1E]" : "bg-[#FAFAFA]"}>
                                <td colSpan={13} className="px-5 py-4">
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
                                                  troca_produto: ef.troca_produto || null,
                                                  troca_cor: ef.troca_cor || null,
                                                  troca_bateria: ef.troca_bateria ? parseInt(ef.troca_bateria) : null,
                                                  troca_obs: ef.troca_obs || null,
                                                  troca_serial: ef.troca_serial || null,
                                                  valor_comprovante: parseFloat(ef.valor_comprovante) || null,
                                                  banco_alt: ef.banco_alt || null,
                                                  parc_alt: parseInt(ef.parc_alt) || null,
                                                  band_alt: ef.band_alt || null,
                                                  comp_alt: parseFloat(ef.comp_alt) || null,
                                                  entrada_fiado: parseFloat(ef.entrada_fiado) || 0,
                                                };
                                                const res = await fetch("/api/vendas", {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
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
                                              className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${dm ? "text-[#98989D] border-[#3A3A3C] hover:bg-[#2C2C2E]" : "text-[#86868B] border-[#D2D2D7] hover:bg-[#F5F5F7]"}`}
                                            >
                                              Cancelar
                                            </button>
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Cliente</span>
                                            <input value={ef.cliente} onChange={e => setEf("cliente", e.target.value.toUpperCase())} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
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
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Valor Fiado</span>
                                            <input type="number" value={ef.entrada_fiado} onChange={e => setEf("entrada_fiado", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                          {/* Parcelas fiado são gerenciadas na aba Recebíveis */}
                                          <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                            <span className="text-[10px] font-bold text-[#86868B] uppercase">Valor Troca</span>
                                            <input type="number" value={ef.produto_na_troca} onChange={e => setEf("produto_na_troca", e.target.value)} className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                          </label>
                                        </div>
                                        {/* Detalhes do produto na troca — mostra se tem valor OU nome OU se é upgrade */}
                                        {((parseFloat(ef.produto_na_troca) || 0) > 0 || !!ef.troca_produto || v.tipo === "UPGRADE") && (
                                          <div className={`mt-3 p-3 rounded-lg border ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#E8E8ED] bg-[#F9F9FB]"}`}>
                                            <p className="text-[10px] font-bold text-[#86868B] uppercase mb-2">🔄 Produto na Troca</p>
                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                              <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                                <span className="text-[10px] font-bold text-[#86868B] uppercase">Produto</span>
                                                <input type="text" value={ef.troca_produto} onChange={e => setEf("troca_produto", e.target.value)} placeholder="Ex: iPhone 13 Pro" className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                              </label>
                                              <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                                <span className="text-[10px] font-bold text-[#86868B] uppercase">Cor</span>
                                                <input type="text" value={ef.troca_cor} onChange={e => setEf("troca_cor", e.target.value)} placeholder="Ex: Preto" className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                              </label>
                                              <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                                <span className="text-[10px] font-bold text-[#86868B] uppercase">Bateria %</span>
                                                <input type="number" value={ef.troca_bateria} onChange={e => setEf("troca_bateria", e.target.value)} placeholder="Ex: 85" className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                              </label>
                                              <label className="space-y-1" onClick={e => e.stopPropagation()}>
                                                <span className="text-[10px] font-bold text-[#86868B] uppercase">Serial</span>
                                                <input type="text" value={ef.troca_serial} onChange={e => setEf("troca_serial", e.target.value)} placeholder="Serial / IMEI" className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                              </label>
                                              <label className="space-y-1 col-span-2" onClick={e => e.stopPropagation()}>
                                                <span className="text-[10px] font-bold text-[#86868B] uppercase">Observações</span>
                                                <input type="text" value={ef.troca_obs} onChange={e => setEf("troca_obs", e.target.value)} placeholder="Arranhões, detalhes da condição..." className={`w-full px-2 py-1.5 border rounded-lg text-xs ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`} />
                                              </label>
                                            </div>
                                          </div>
                                        )}
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
                                        {(ef.forma === "CARTAO" || ef.forma === "LINK" || ef.forma === "DEBITO") && (() => {
                                          const efParcelas = parseInt(ef.qnt_parcelas) || 0;
                                          const efTaxa = ef.forma === "CARTAO"
                                            ? getTaxa(ef.banco, ef.bandeira || null, efParcelas, ef.forma)
                                            : ef.forma === "LINK" ? getTaxa("MERCADO_PAGO", null, efParcelas, "CARTAO")
                                            : ef.forma === "DEBITO" ? 0.75
                                            : 0;
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
                                                <div className={`rounded-lg px-3 py-2 text-[10px] flex flex-wrap gap-2 w-full ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
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
                                        {podeVerHistorico && <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            // Detectar se faz parte de um grupo
                                            const grupoVendas = v.grupo_id ? vendas.filter(gv => gv.grupo_id === v.grupo_id) : [v];
                                            const primaryVenda = grupoVendas[0]; // dados do cliente/pagamento vêm da primeira
                                            // Buscar dados do seminovo na troca (PENDENCIA/SEMINOVO) se a venda tem produto_na_troca (só para venda simples)
                                            let trocaProd = "", trocaCor = "", trocaBat = "", trocaObs = "", trocaGrade = "", trocaCaixa = "", trocaCabo = "", trocaFonte = "";
                                            let trocaSerial = "", trocaImei = "", trocaCategoria = "", trocaValorPend = 0;
                                            const hasTrocaPend = primaryVenda.produto_na_troca || primaryVenda.troca_produto;
                                            if (grupoVendas.length === 1 && hasTrocaPend) {
                                              try {
                                                const res = await fetch("/api/estoque", {
                                                  headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                });
                                                if (res.ok) {
                                                  const estoqueData = await res.json();
                                                  const allItems = estoqueData.data || estoqueData || [];
                                                  const firstName = v.cliente.toUpperCase().split(" ")[0];
                                                  const trocaVal = parseFloat(String(primaryVenda.produto_na_troca || "0"));
                                                  const pendencia = allItems.find((p: { custo_unitario: number; cliente: string | null; tipo: string; produto: string; cor: string | null; bateria: number | null; observacao: string | null; serial_no?: string | null; imei?: string | null; categoria?: string | null }) =>
                                                    (p.tipo === "PENDENCIA" || p.tipo === "SEMINOVO") &&
                                                    (p.cliente || "").toUpperCase().includes(firstName) &&
                                                    (trocaVal === 0 || Math.abs(Number(p.custo_unitario) - trocaVal) < 50)
                                                  );
                                                  if (pendencia) {
                                                    trocaProd = pendencia.produto || "";
                                                    trocaCor = pendencia.cor || "";
                                                    trocaBat = String(pendencia.bateria || "");
                                                    trocaObs = pendencia.observacao || "";
                                                    trocaSerial = (pendencia.serial_no as string) || "";
                                                    trocaImei = (pendencia.imei as string) || "";
                                                    trocaCategoria = (pendencia.categoria as string) || "";
                                                    trocaValorPend = Number(pendencia.custo_unitario) || 0;
                                                    // Extrair tags da observacao
                                                    const obsRaw = pendencia.observacao || "";
                                                    const gradeMatch = obsRaw.match(/\[GRADE_(A\+|A|B|C)\]/);
                                                    if (gradeMatch) trocaGrade = gradeMatch[1];
                                                    if (/\[COM_CAIXA\]/.test(obsRaw)) trocaCaixa = "SIM";
                                                    if (/\[COM_CABO\]/.test(obsRaw)) trocaCabo = "SIM";
                                                    if (/\[COM_FONTE\]/.test(obsRaw)) trocaFonte = "SIM";
                                                    // Obs limpo (sem tags)
                                                    trocaObs = obsRaw.replace(/\[GRADE_[^\]]+\]|\[COM_[^\]]+\]|\[CICLOS:[^\]]+\]/g, "").trim();
                                                  }
                                                  // Fallback: usar dados salvos na própria venda se estoque não retornou
                                                  if (!trocaProd) trocaProd = primaryVenda.troca_produto || "";
                                                  if (!trocaCor) trocaCor = primaryVenda.troca_cor || "";
                                                  if (!trocaBat) trocaBat = String(primaryVenda.troca_bateria || "");
                                                  if (!trocaObs) trocaObs = primaryVenda.troca_obs || "";
                                                }
                                              } catch { /* ignore */ }
                                            }
                                            // Garantir fallback dos dados da troca da própria venda
                                            if (!trocaProd) trocaProd = primaryVenda.troca_produto || "";
                                            if (!trocaCor) trocaCor = primaryVenda.troca_cor || "";
                                            if (!trocaBat) trocaBat = String(primaryVenda.troca_bateria || "");
                                            if (!trocaObs) trocaObs = primaryVenda.troca_obs || "";

                                            // Preencher formulário Nova Venda com dados da venda para edição completa
                                            setForm({
                                              data: primaryVenda.data || hojeBR(),
                                              cliente: primaryVenda.cliente,
                                              cpf: primaryVenda.cpf || "",
                                              cnpj: primaryVenda.cnpj || "",
                                              email: primaryVenda.email || "",
                                              telefone: primaryVenda.telefone || "",
                                              endereco: primaryVenda.endereco || "",
                                              pessoa: (primaryVenda.pessoa === "PJ" ? "PJ" : "PF") as "PF" | "PJ",
                                              origem: primaryVenda.origem || "",
                                              tipo: primaryVenda.tipo || "",
                                              produto: grupoVendas.length > 1 ? "" : v.produto,
                                              fornecedor: grupoVendas.length > 1 ? "" : (v.fornecedor || ""),
                                              custo: grupoVendas.length > 1 ? "" : String(v.custo || ""),
                                              preco_vendido: grupoVendas.length > 1 ? "" : String(v.preco_vendido || ""),
                                              valor_comprovante_input: String(grupoVendas.reduce((s, gv) => s + (gv.valor_comprovante || 0), 0) || ""),
                                              banco: primaryVenda.banco || "ITAU",
                                              forma: primaryVenda.forma || "",
                                              qnt_parcelas: String(primaryVenda.qnt_parcelas || ""),
                                              bandeira: primaryVenda.bandeira || "",
                                              local: primaryVenda.local || "",
                                              produto_na_troca: grupoVendas.length > 1 ? "" : String(primaryVenda.produto_na_troca || trocaValorPend || ""),
                                              entrada_pix: String(grupoVendas.reduce((s, gv) => s + (gv.entrada_pix || 0), 0) || ""),
                                              banco_pix: primaryVenda.banco_pix || "ITAU",
                                              entrada_pix_2: String(grupoVendas.reduce((s, gv) => s + (gv.entrada_pix_2 || 0), 0) || ""),
                                              // pix_2 fica so na row 0 do payload, mas a ordem retornada pelo banco
                                              // pode nao bater com primaryVenda — busca qualquer row do grupo com
                                              // banco_pix_2 setado.
                                              banco_pix_2: (grupoVendas.find(gv => gv.banco_pix_2)?.banco_pix_2) || "INFINITE",
                                              entrada_especie: String(grupoVendas.reduce((s, gv) => s + (gv.entrada_especie || 0), 0) || ""),
                                              entrada_fiado: String(primaryVenda.entrada_fiado || ""),
                                              fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
                                              valor_total_venda: "",
                                              banco_2nd: primaryVenda.banco_2nd || "",
                                              banco_alt: primaryVenda.banco_alt || "",
                                              forma_alt: (primaryVenda as unknown as Record<string, string>).forma_alt || "",
                                              parc_alt: String(primaryVenda.parc_alt || ""),
                                              band_alt: primaryVenda.band_alt || "",
                                              comp_alt: String(primaryVenda.comp_alt || ""),
                                              sinal_antecipado: String(primaryVenda.sinal_antecipado || ""),
                                              banco_sinal: primaryVenda.banco_sinal || "",
                                              forma_sinal: (primaryVenda as unknown as Record<string, string>).forma_sinal || "PIX",
                                              troca_produto: grupoVendas.length > 1 ? "" : trocaProd,
                                              troca_cor: grupoVendas.length > 1 ? "" : trocaCor,
                                              troca_categoria: grupoVendas.length > 1 ? "" : (trocaCategoria || (primaryVenda as unknown as Record<string, string>).troca_categoria || ""),
                                              troca_bateria: grupoVendas.length > 1 ? "" : trocaBat,
                                              troca_obs: grupoVendas.length > 1 ? "" : trocaObs,
                                              troca_grade: grupoVendas.length > 1 ? "" : (trocaGrade || (primaryVenda as unknown as Record<string, string>).troca_grade || ""),
                                              troca_caixa: grupoVendas.length > 1 ? "" : (trocaCaixa || (primaryVenda as unknown as Record<string, string>).troca_caixa || ""),
                                              troca_cabo: grupoVendas.length > 1 ? "" : (trocaCabo || (primaryVenda as unknown as Record<string, string>).troca_cabo || ""),
                                              troca_fonte: grupoVendas.length > 1 ? "" : (trocaFonte || (primaryVenda as unknown as Record<string, string>).troca_fonte || ""),
                                              troca_pulseira: grupoVendas.length > 1 ? "" : ((primaryVenda as unknown as Record<string, string>).troca_pulseira || ""),
                                              troca_ciclos: grupoVendas.length > 1 ? "" : ((primaryVenda as unknown as Record<string, string>).troca_ciclos || ""),
                                              troca_garantia: grupoVendas.length > 1 ? "" : ((primaryVenda as unknown as Record<string, string>).troca_garantia || ""),
                                              troca_serial: grupoVendas.length > 1 ? "" : (trocaSerial || (primaryVenda as unknown as Record<string, string>).troca_serial || ""),
                                              troca_imei: grupoVendas.length > 1 ? "" : (trocaImei || (primaryVenda as unknown as Record<string, string>).troca_imei || ""),
                                              produto_na_troca2: String((primaryVenda as unknown as Record<string, unknown>).produto_na_troca2 || ""),
                                              troca_produto2: (primaryVenda as unknown as Record<string, string>).troca_produto2 || "",
                                              troca_cor2: (primaryVenda as unknown as Record<string, string>).troca_cor2 || "",
                                              troca_categoria2: (primaryVenda as unknown as Record<string, string>).troca_categoria2 || "",
                                              troca_bateria2: (primaryVenda as unknown as Record<string, string>).troca_bateria2 || "",
                                              troca_obs2: (primaryVenda as unknown as Record<string, string>).troca_obs2 || "",
                                              troca_grade2: (primaryVenda as unknown as Record<string, string>).troca_grade2 || "",
                                              troca_caixa2: (primaryVenda as unknown as Record<string, string>).troca_caixa2 || "",
                                              troca_cabo2: (primaryVenda as unknown as Record<string, string>).troca_cabo2 || "",
                                              troca_fonte2: (primaryVenda as unknown as Record<string, string>).troca_fonte2 || "",
                                              troca_serial2: (primaryVenda as unknown as Record<string, string>).troca_serial2 || "",
                                              troca_imei2: (primaryVenda as unknown as Record<string, string>).troca_imei2 || "",
                                              troca_garantia2: (primaryVenda as unknown as Record<string, string>).troca_garantia2 || "",
                                              troca_pulseira2: (primaryVenda as unknown as Record<string, string>).troca_pulseira2 || "",
                                              troca_ciclos2: (primaryVenda as unknown as Record<string, string>).troca_ciclos2 || "",
                                              troca_condicao: (primaryVenda as unknown as Record<string, string>).troca_condicao || "SEMINOVO",
                                              troca_condicao2: (primaryVenda as unknown as Record<string, string>).troca_condicao2 || "SEMINOVO",
                                              serial_no: grupoVendas.length > 1 ? "" : (v.serial_no || ""),
                                              imei: grupoVendas.length > 1 ? "" : (v.imei || ""),
                                              cep: primaryVenda.cep || "",
                                              bairro: primaryVenda.bairro || "",
                                              cidade: primaryVenda.cidade || "",
                                              uf: primaryVenda.uf || "",
                                              frete_valor: primaryVenda.frete_valor != null ? String(primaryVenda.frete_valor) : "",
                                              frete_recebido: !!primaryVenda.frete_recebido,
                                              frete_forma: (() => { const f = primaryVenda.frete_forma || ""; return f.split(" ")[0] || ""; })(),
                                              frete_banco: primaryVenda.frete_banco || "",
                                              frete_parcelas: (() => { const m = (primaryVenda.frete_forma || "").match(/(\d+)x/); return m ? m[1] : ""; })(),
                                              frete_bandeira: (() => { const parts = (primaryVenda.frete_forma || "").split(" "); return parts.find(p => ["VISA","MASTERCARD","ELO","AMEX"].includes(p)) || ""; })(),
                                              usar_credito_loja: "",
                                              is_brinde: !!primaryVenda.is_brinde,
                                              codigo_rastreio: primaryVenda.codigo_rastreio || "",
                                            });
                                            setProdutoManual(true);
                                            // Ativar checkbox de troca somente se a venda realmente tem troca
                                            const temTrocaNaVenda = !!(trocaProd || (parseFloat(String(primaryVenda.produto_na_troca)) || 0) > 0);
                                            setTrocaEnabled(temTrocaNaVenda);

                                            // Popular trocaRow/trocaRow2 para o ProdutoSpecFields mostrar os dados
                                            if (grupoVendas.length === 1) {
                                              const trocaCat = (primaryVenda as unknown as Record<string, string>).troca_categoria || "";
                                              const trocaCat2 = (primaryVenda as unknown as Record<string, string>).troca_categoria2 || "";
                                              const pv = primaryVenda as unknown as Record<string, string>;
                                              setTrocaRow({
                                                ...createEmptyProdutoRow(),
                                                produto: trocaProd || "",
                                                cor: trocaCor || "",
                                                categoria: trocaCategoria || trocaCat || "",
                                                serial_no: trocaSerial || "",
                                                imei: trocaImei || "",
                                                grade: trocaGrade || "",
                                                caixa: trocaCaixa === "SIM",
                                                custo_unitario: String(primaryVenda.produto_na_troca || trocaValorPend || ""),
                                              });
                                              setTrocaRow2({
                                                ...createEmptyProdutoRow(),
                                                produto: pv.troca_produto2 || "",
                                                cor: pv.troca_cor2 || "",
                                                categoria: trocaCat2 || "",
                                                serial_no: pv.troca_serial2 || "",
                                                imei: pv.troca_imei2 || "",
                                                custo_unitario: String((primaryVenda as unknown as Record<string, unknown>).produto_na_troca2 || ""),
                                              });
                                            } else {
                                              setTrocaRow(createEmptyProdutoRow());
                                              setTrocaRow2(createEmptyProdutoRow());
                                            }

                                            // Se grupo: carregar outros produtos no carrinho
                                            if (grupoVendas.length > 1) {
                                              const cartItems: ProdutoCarrinho[] = grupoVendas.map(gv => ({
                                                produto: gv.produto,
                                                fornecedor: gv.fornecedor || "",
                                                custo: String(gv.custo || ""),
                                                preco_vendido: String(gv.preco_vendido || ""),
                                                local: gv.local || "",
                                                serial_no: gv.serial_no || "",
                                                imei: gv.imei || "",
                                                _estoqueId: "",
                                                _catSel: "",
                                                _produtoManual: true,
                                                produto_na_troca: String(gv.produto_na_troca || ""),
                                                troca_produto: gv.troca_produto || "",
                                                troca_cor: gv.troca_cor || "",
                                                troca_categoria: "",
                                                troca_bateria: gv.troca_bateria || "",
                                                troca_obs: gv.troca_obs || "",
                                                troca_grade: "",
                                                troca_caixa: "",
                                                troca_cabo: "",
                                                troca_fonte: "",
                                                troca_pulseira: "",
                                                troca_ciclos: "",
                                                troca_serial: "", troca_imei: "",
                                                troca_garantia: "",
                                                produto_na_troca2: String((gv as unknown as Record<string, unknown>).produto_na_troca2 || ""),
                                                troca_produto2: (gv as unknown as Record<string, string>).troca_produto2 || "",
                                                troca_cor2: (gv as unknown as Record<string, string>).troca_cor2 || "",
                                                troca_categoria2: "",
                                                troca_bateria2: (gv as unknown as Record<string, string>).troca_bateria2 || "",
                                                troca_obs2: (gv as unknown as Record<string, string>).troca_obs2 || "",
                                                troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
                                              }));
                                              setProdutosCarrinho(cartItems);
                                              setEditandoGrupoIds(grupoVendas.map(gv => gv.id));
                                              setEditandoVendaId(grupoVendas[0].id); // sinaliza modo edição
                                              // Campos de produto/troca já foram limpos no setForm acima (grupoVendas.length > 1 ? "" : ...)
                                            } else {
                                              setProdutosCarrinho([]);
                                              // Venda unica: registra o id em editandoGrupoIds pra
                                              // habilitar o ramo multi-produto caso o admin adicione
                                              // um 2o produto durante a edicao (antes era [] e o
                                              // 2o produto era silenciosamente descartado).
                                              setEditandoGrupoIds([v.id]);
                                              setEditandoVendaId(v.id);
                                            }
                                            // Guarda o estoque_id ORIGINAL da venda (pra detectar se trocou produto no submit)
                                            setEstoqueIdOriginal((primaryVenda as unknown as { estoque_id?: string | null }).estoque_id || null);
                                            // Guarda o status_pagamento ORIGINAL — preservado em buildPayload
                                            // pra edicao de venda FINALIZADA nao voltar pra AGUARDANDO
                                            // (bug que disparava reenvio de NF ao finalizar de novo).
                                            setStatusPagamentoOriginal(primaryVenda.status_pagamento || null);
                                            // Preservar flag de venda programada no form — senao o PATCH
                                            // zerava data_programada e mudava status pra AGUARDANDO ao salvar.
                                            if (primaryVenda.status_pagamento === "PROGRAMADA" || primaryVenda.data_programada) {
                                              setVendaProgramada(true);
                                              setDataProgramada(primaryVenda.data_programada || "");
                                              setProgramadaJaPago(primaryVenda.status_pagamento === "FINALIZADO");
                                              setProgramadaComSinal(Number(primaryVenda.sinal_antecipado) > 0);
                                            } else {
                                              setVendaProgramada(false);
                                              setDataProgramada("");
                                              setProgramadaJaPago(false);
                                              setProgramadaComSinal(false);
                                            }
                                            setTab("nova");
                                            window.scrollTo({ top: 0, behavior: "smooth" });
                                          }}
                                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 transition-colors"
                                        >
                                          ✏️ Editar
                                        </button>}
                                        {/* Enviar pra Assinar Digital — so quando ha troca. Botao "Gerar Termo (PDF)" foi
                                            removido pois a assinatura digital via ZapSign substituiu o fluxo de papel. */}
                                        {(v.troca_produto || (v.produto_na_troca && parseFloat(String(v.produto_na_troca)) > 0)) && (<>
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              // Montar aparelhos com IMEI/serial (reusa dados ja salvos na venda)
                                              const aparelhos: { modelo: string; capacidade?: string; cor: string; imei: string; serial: string; condicao: string }[] = [];
                                              if (v.troca_produto) {
                                                aparelhos.push({
                                                  modelo: v.troca_produto,
                                                  capacidade: "",
                                                  cor: v.troca_cor || "",
                                                  imei: v.troca_imei || "",
                                                  serial: v.troca_serial || "",
                                                  condicao: [
                                                    v.troca_bateria ? `Bateria ${v.troca_bateria}%` : "",
                                                    v.troca_grade ? `Grade ${v.troca_grade}` : "",
                                                  ].filter(Boolean).join(", "),
                                                });
                                              }
                                              if (v.troca_produto2) {
                                                aparelhos.push({
                                                  modelo: v.troca_produto2,
                                                  cor: v.troca_cor2 || "",
                                                  imei: v.troca_imei2 || "",
                                                  serial: v.troca_serial2 || "",
                                                  condicao: [
                                                    v.troca_bateria2 ? `Bateria ${v.troca_bateria2}%` : "",
                                                    v.troca_grade2 ? `Grade ${v.troca_grade2}` : "",
                                                  ].filter(Boolean).join(", "),
                                                });
                                              }
                                              if (aparelhos.length === 0) { setMsg("Sem aparelhos de troca"); return; }

                                              let whatsapp = v.telefone || "";
                                              if (!whatsapp) {
                                                const val = prompt(`WhatsApp de ${v.cliente} (DDD + numero):`);
                                                if (val === null) return;
                                                whatsapp = val.trim();
                                              }
                                              if (!/^\d{10,11}$/.test(whatsapp.replace(/\D/g, ""))) {
                                                setMsg("WhatsApp invalido");
                                                return;
                                              }

                                              if (!confirm(`Enviar termo para ${v.cliente} assinar no WhatsApp ${whatsapp}?\n\nCliente vai receber link + codigo SMS pra autenticar.`)) return;

                                              try {
                                                const res = await fetch("/api/admin/termo-procedencia", {
                                                  method: "POST",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                  body: JSON.stringify({
                                                    cliente_nome: v.cliente,
                                                    cliente_cpf: v.cpf || "",
                                                    cliente_whatsapp: whatsapp,
                                                    aparelhos,
                                                    venda_id: v.id,
                                                    enviar_para_assinatura: true,
                                                  }),
                                                });
                                                const json = await res.json();
                                                if (json.ok) {
                                                  setMsg(`Termo enviado! Cliente vai receber link no WhatsApp pra assinar.`);
                                                  if (json.data?.id) {
                                                    setTermosPorVenda((prev) => ({
                                                      ...prev,
                                                      [v.id]: { id: json.data.id, status: "ENVIADO", zapsign_sign_url: json.sign_url ?? json.data?.zapsign_sign_url, signed_pdf_url: null },
                                                    }));
                                                  }
                                                } else {
                                                  setMsg("Erro: " + (json.error || "falha ao enviar"));
                                                }
                                              } catch { setMsg("Erro ao enviar termo para assinatura"); }
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors"
                                            title="Envia termo pro cliente assinar digitalmente via WhatsApp + SMS (ZapSign)"
                                          >
                                            📱 Enviar pra Assinar Digital
                                          </button>
                                          {/* Preview do Termo (PDF) — gera sem registrar, pra conferir dados antes de enviar */}
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              const aparelhosPrev: { modelo: string; capacidade?: string; cor: string; imei: string; serial: string; condicao: string }[] = [];
                                              if (v.troca_produto) {
                                                aparelhosPrev.push({
                                                  modelo: v.troca_produto,
                                                  capacidade: "",
                                                  cor: v.troca_cor || "",
                                                  imei: v.troca_imei || "",
                                                  serial: v.troca_serial || "",
                                                  condicao: [
                                                    v.troca_bateria ? `Bateria ${v.troca_bateria}%` : "",
                                                    v.troca_grade ? `Grade ${v.troca_grade}` : "",
                                                  ].filter(Boolean).join(", "),
                                                });
                                              }
                                              if (v.troca_produto2) {
                                                aparelhosPrev.push({
                                                  modelo: v.troca_produto2,
                                                  cor: v.troca_cor2 || "",
                                                  imei: v.troca_imei2 || "",
                                                  serial: v.troca_serial2 || "",
                                                  condicao: [
                                                    v.troca_bateria2 ? `Bateria ${v.troca_bateria2}%` : "",
                                                    v.troca_grade2 ? `Grade ${v.troca_grade2}` : "",
                                                  ].filter(Boolean).join(", "),
                                                });
                                              }
                                              if (aparelhosPrev.length === 0) { setMsg("Sem aparelhos de troca"); return; }
                                              try {
                                                const res = await fetch("/api/admin/termo-procedencia", {
                                                  method: "POST",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                  body: JSON.stringify({
                                                    cliente_nome: v.cliente,
                                                    cliente_cpf: v.cpf || "",
                                                    aparelhos: aparelhosPrev,
                                                    venda_id: v.id,
                                                    preview: true,
                                                  }),
                                                });
                                                if (res.headers.get("content-type")?.includes("pdf")) {
                                                  const blob = await res.blob();
                                                  const url = URL.createObjectURL(blob);
                                                  window.open(url, "_blank");
                                                  setTimeout(() => URL.revokeObjectURL(url), 60000);
                                                } else {
                                                  const json = await res.json();
                                                  setMsg("Erro: " + (json.error || "falha ao gerar preview"));
                                                }
                                              } catch { setMsg("Erro ao gerar preview do termo"); }
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                            title="Gera PDF do termo sem enviar nem registrar — so pra conferir dados"
                                          >
                                            👁️ Preview Termo
                                          </button>
                                          {/* Badge de status do termo de procedencia (aparece se foi enviado) */}
                                          {(() => {
                                            const termo = termosPorVenda[v.id];
                                            if (!termo || (termo.status !== "ENVIADO" && termo.status !== "ASSINADO" && termo.status !== "RECUSADO")) return null;
                                            if (termo.status === "ASSINADO") {
                                              return (
                                                <a
                                                  href={termo.signed_pdf_url || "#"}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 text-green-700 border border-green-300 hover:bg-green-200 transition-colors"
                                                  title="Termo assinado pelo cliente — clique para baixar o PDF assinado"
                                                >
                                                  ✅ Termo Assinado
                                                </a>
                                              );
                                            }
                                            if (termo.status === "RECUSADO") {
                                              return (
                                                <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 border border-red-300">
                                                  ⚠️ Termo Recusado
                                                </span>
                                              );
                                            }
                                            // ENVIADO — aguardando cliente
                                            return (
                                              <a
                                                href={termo.zapsign_sign_url || "#"}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 transition-colors"
                                                title="Aguardando cliente assinar — clique para abrir o link"
                                              >
                                                ⏳ Aguardando Assinatura
                                              </a>
                                            );
                                          })()}
                                          {/* Colar/trocar link do PDF assinado — caso webhook ZapSign tenha falhado
                                              (reenvio de termo, link bugado, etc). Aparece sempre que a venda
                                              tem troca; se ja tem link assinado, pede confirmacao pra trocar. */}
                                          {(() => {
                                            const termo = termosPorVenda[v.id];
                                            const jaAssinado = termo?.status === "ASSINADO";
                                            return (
                                              <button
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  if (jaAssinado && !confirm("Ja existe link do termo assinado. Substituir pelo novo link?")) return;
                                                  const link = prompt("Cole o link do PDF assinado (copiado do ZapSign ou grupo do WhatsApp):", jaAssinado ? (termo?.signed_pdf_url || "") : "");
                                                  if (link === null) return;
                                                  const url = link.trim();
                                                  if (!url) return;
                                                  if (!/^https?:\/\//i.test(url)) { setMsg("Link invalido — precisa comecar com http(s)://"); return; }
                                                  const signedAt = new Date().toISOString();
                                                  try {
                                                    let termoId = termo?.id || null;
                                                    if (!termoId) {
                                                      // Nao existia termo — cria um minimo, ja como ASSINADO
                                                      const aparelhos: { modelo: string; cor: string; imei: string; serial: string; condicao: string }[] = [];
                                                      if (v.troca_produto) aparelhos.push({
                                                        modelo: v.troca_produto, cor: v.troca_cor || "",
                                                        imei: v.troca_imei || "", serial: v.troca_serial || "",
                                                        condicao: v.troca_bateria ? `Bateria ${v.troca_bateria}%` : "",
                                                      });
                                                      if (v.troca_produto2) aparelhos.push({
                                                        modelo: v.troca_produto2, cor: v.troca_cor2 || "",
                                                        imei: v.troca_imei2 || "", serial: v.troca_serial2 || "",
                                                        condicao: v.troca_bateria2 ? `Bateria ${v.troca_bateria2}%` : "",
                                                      });
                                                      if (aparelhos.length === 0) aparelhos.push({ modelo: "Produto da troca", cor: "", imei: "", serial: "", condicao: "" });
                                                      const resCreate = await fetch("/api/admin/termo-procedencia", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                        body: JSON.stringify({ venda_id: v.id, aparelhos, gerar_pdf: false }),
                                                      });
                                                      const jsonCreate = await resCreate.json();
                                                      if (!resCreate.ok || !jsonCreate.data?.id) { setMsg("Erro ao criar termo: " + (jsonCreate.error || "falha")); return; }
                                                      termoId = jsonCreate.data.id;
                                                    }
                                                    const resPatch = await fetch("/api/admin/termo-procedencia", {
                                                      method: "PATCH",
                                                      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                      body: JSON.stringify({ id: termoId, signed_pdf_url: url, status: "ASSINADO", signed_at: signedAt, venda_id: v.id }),
                                                    });
                                                    const jsonPatch = await resPatch.json();
                                                    if (!resPatch.ok) { setMsg("Erro ao salvar: " + (jsonPatch.error || "falha")); return; }
                                                    setTermosPorVenda(prev => ({ ...prev, [v.id]: { id: termoId!, status: "ASSINADO", zapsign_sign_url: prev[v.id]?.zapsign_sign_url || null, signed_pdf_url: url } }));
                                                    setMsg("Link do termo assinado vinculado!");
                                                  } catch {
                                                    setMsg("Erro ao vincular link");
                                                  }
                                                }}
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 border border-purple-300 hover:bg-purple-200 transition-colors"
                                                title={jaAssinado ? "Trocar o link do PDF assinado (ex: link atual bugado)" : "Se o cliente ja assinou mas o link nao ficou na venda (ex: reenvio), cole aqui o PDF assinado"}
                                              >
                                                🔗 {jaAssinado ? "Trocar Link Assinado" : "Colar Link Assinado"}
                                              </button>
                                            );
                                          })()}
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (!confirm("Recriar pendência da troca no estoque?")) return;
                                              fetch("/api/vendas", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                body: JSON.stringify({ id: v.id, troca_produto: v.troca_produto, produto_na_troca: v.produto_na_troca, _recriar_pendencia: true }),
                                              }).then(r => { if (r.ok) setMsg("Pendência recriada!"); else r.json().then(j => setMsg("Erro: " + (j.error || "falha"))); }).catch(() => setMsg("Erro ao recriar"));
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-500 text-white hover:bg-yellow-600 transition-colors"
                                          >
                                            🔄 Recriar Pendência
                                          </button>
                                        </>)}
                                      </div>
                                      {/* Nota Fiscal — drop zone + botão (esconde pra ATACADO, pra quem só tem vendas_andamento
                                          e para itens nao-primeiros de uma venda em conjunto: uma unica NF cobre o grupo todo,
                                          entao so o primeiro item mostra o upload/envio). */}
                                      {podeVerHistorico && v.origem !== "ATACADO" && (!isGrupo || isFirstInGrupo) && <div className="flex gap-2 flex-wrap items-center">
                                        {v.nota_fiscal_url ? (
                                          <>
                                            <a href={v.nota_fiscal_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-green-600 border border-green-200 hover:bg-green-50 transition-colors inline-flex items-center gap-1">
                                              📄 Ver NF
                                            </a>
                                            {/* Badge de status do envio + botao Enviar (substitui o envio
                                                automatico que spamava cliente a cada edicao de venda). */}
                                            {(v as unknown as { nota_fiscal_enviada?: boolean }).nota_fiscal_enviada ? (
                                              <span
                                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-green-700 bg-green-50 border border-green-200 inline-flex items-center gap-1"
                                                title={(v as unknown as { nota_fiscal_enviada_em?: string }).nota_fiscal_enviada_em || ""}
                                              >
                                                ✅ NF enviada
                                              </span>
                                            ) : (
                                              <>
                                                {v.email ? (
                                                  <button
                                                    onClick={async (e) => {
                                                      e.stopPropagation();
                                                      if (!confirm(`Enviar NF por email pra ${v.email}?`)) return;
                                                      try {
                                                        const res = await fetch("/api/vendas", {
                                                          method: "PATCH",
                                                          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                          body: JSON.stringify({ action: "enviar_nf", id: v.id }),
                                                        });
                                                        const j = await res.json().catch(() => ({}));
                                                        console.log("[Enviar NF] status=", res.status, "body=", j);
                                                        if (res.ok && j.ok) {
                                                          setMsg(`✅ NF enviada para ${v.email}`);
                                                          // Sync com DB pra garantir que o estado local bate com servidor
                                                          await fetchVendas();
                                                        } else {
                                                          const erro = `Erro ao enviar NF (HTTP ${res.status}): ${j.error || "sem detalhe"}`;
                                                          setMsg(erro);
                                                          alert(erro + "\n\nVerifique console (F12) pra detalhes.\n\nSe o erro persistir, use 'Marcar como enviada' pra dispensar a pendencia manualmente.");
                                                        }
                                                      } catch (err) {
                                                        const erro = `Erro de rede ao enviar NF: ${String(err)}`;
                                                        console.error("[Enviar NF] excecao:", err);
                                                        setMsg(erro);
                                                        alert(erro);
                                                      }
                                                      setTimeout(() => setMsg(""), 6000);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 transition-colors inline-flex items-center gap-1"
                                                    title={`Enviar por email pra ${v.email}`}
                                                  >
                                                    📧 Enviar NF (pendente)
                                                  </button>
                                                ) : (
                                                  <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 inline-flex items-center gap-1" title="Venda sem email do cliente">
                                                    ⚠️ Sem email
                                                  </span>
                                                )}
                                                {/* Fallback: marca como enviada sem disparar email — util quando
                                                    vendedor ja enviou pelo WhatsApp ou o servico de email ta com
                                                    problema e so quer dispensar a pendencia. */}
                                                <button
                                                  onClick={async (e) => {
                                                    e.stopPropagation();
                                                    if (!confirm("Marcar essa NF como enviada SEM disparar email?\n\nUse quando ja enviou por outro canal (WhatsApp, etc) e so quer dispensar a pendencia.")) return;
                                                    try {
                                                      const res = await fetch("/api/vendas", {
                                                        method: "PATCH",
                                                        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                        body: JSON.stringify({ action: "enviar_nf", id: v.id, skipEmail: true }),
                                                      });
                                                      const j = await res.json().catch(() => ({}));
                                                      console.log("[Marcar NF enviada] status=", res.status, "body=", j);
                                                      if (res.ok && j.ok) {
                                                        setMsg("✅ NF marcada como enviada");
                                                        await fetchVendas();
                                                      } else {
                                                        const erro = `Erro ao marcar NF: ${j.error || res.status}`;
                                                        setMsg(erro);
                                                        alert(erro);
                                                      }
                                                    } catch (err) {
                                                      console.error("[Marcar NF enviada] excecao:", err);
                                                      alert(`Erro de rede: ${String(err)}`);
                                                    }
                                                    setTimeout(() => setMsg(""), 4000);
                                                  }}
                                                  className="px-2 py-1.5 rounded-lg text-[10px] font-semibold text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 transition-colors inline-flex items-center gap-1"
                                                  title="Marcar como enviada sem disparar email (fallback)"
                                                >
                                                  ✓ Marcar enviada
                                                </button>
                                              </>
                                            )}
                                            <button
                                              onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!confirm("Remover nota fiscal atual? Depois pode anexar outra.")) return;
                                                await fetch("/api/vendas", {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                  body: JSON.stringify({ id: v.id, nota_fiscal_url: null, nota_fiscal_enviada: false, nota_fiscal_enviada_em: null }),
                                                });
                                                setVendas(prev => prev.map(r => r.id === v.id ? { ...r, nota_fiscal_url: "", nota_fiscal_enviada: false, nota_fiscal_enviada_em: null } as typeof r : r));
                                                setMsg("NF removida. Agora pode anexar a correta.");
                                              }}
                                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 border border-red-200 hover:bg-red-50 transition-colors inline-flex items-center gap-1"
                                            >🔄 Trocar NF</button>
                                          </>
                                        ) : (
                                          <label
                                            onClick={(e) => e.stopPropagation()}
                                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add("ring-2", "ring-purple-400", "bg-purple-50"); }}
                                            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.remove("ring-2", "ring-purple-400", "bg-purple-50"); }}
                                            onDrop={async (e) => {
                                              e.preventDefault(); e.stopPropagation();
                                              e.currentTarget.classList.remove("ring-2", "ring-purple-400", "bg-purple-50");
                                              const file = e.dataTransfer.files?.[0];
                                              if (!file || !file.name.toLowerCase().endsWith(".pdf")) { setMsg("Apenas arquivos PDF"); return; }
                                              setUploadingId(v.id + "-nf");
                                              const formData = new FormData();
                                              formData.append("file", file);
                                              formData.append("venda_id", v.id);
                                              try {
                                                const res = await fetch("/api/vendas/nota-fiscal", {
                                                  method: "POST",
                                                  headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                  body: formData,
                                                });
                                                const json = await res.json();
                                                if (json.url) {
                                                  setVendas(prev => prev.map(r => r.id === v.id ? { ...r, nota_fiscal_url: json.url } : r));
                                                  setMsg("Nota fiscal salva!");
                                                } else { setMsg("Erro: " + (json.error || "falha")); }
                                              } catch { setMsg("Erro ao enviar"); }
                                              setUploadingId(null);
                                            }}
                                            className="px-4 py-2 rounded-lg text-xs font-semibold text-purple-600 border-2 border-dashed border-purple-300 hover:bg-purple-50 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                                          >
                                            {uploadingId === v.id + "-nf" ? "⏳ Enviando..." : "📄 Anexar NF (arraste PDF aqui)"}
                                            <input type="file" accept=".pdf" className="hidden" onChange={async (e) => {
                                              e.stopPropagation();
                                              const file = e.target.files?.[0];
                                              if (!file) return;
                                              setUploadingId(v.id + "-nf");
                                              const formData = new FormData();
                                              formData.append("file", file);
                                              formData.append("venda_id", v.id);
                                              try {
                                                const res = await fetch("/api/vendas/nota-fiscal", {
                                                  method: "POST",
                                                  headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                  body: formData,
                                                });
                                                const json = await res.json();
                                                if (json.url) {
                                                  setVendas(prev => prev.map(r => r.id === v.id ? { ...r, nota_fiscal_url: json.url } : r));
                                                  setMsg("Nota fiscal salva!");
                                                } else { setMsg("Erro: " + (json.error || "falha")); }
                                              } catch { setMsg("Erro ao enviar"); }
                                              setUploadingId(null);
                                            }} />
                                          </label>
                                        )}
                                      </div>}
                                      <div className="flex gap-2 flex-wrap">
                                        {podeVerHistorico && (v.status_pagamento === "AGUARDANDO" || v.status_pagamento === "PROGRAMADA") && (
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              // Finalizar todas as vendas do grupo (multi-produto)
                                              const grupoIds = (v.grupo_id ? vendas.filter(gv => gv.grupo_id === v.grupo_id).map(gv => gv.id) : [v.id]);
                                              let allOk = true;
                                              for (const vid of grupoIds) {
                                                const res = await fetch("/api/vendas", {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                  body: JSON.stringify({ id: vid, status_pagamento: "FINALIZADO" }),
                                                });
                                                if (!res.ok) {
                                                  const txt = await res.text().catch(() => "");
                                                  console.error(`[Finalizar] Erro ao finalizar ${vid}:`, res.status, txt);
                                                  allOk = false;
                                                }
                                              }
                                              if (allOk) {
                                                setVendas(prev => prev.map(r => grupoIds.includes(r.id) ? { ...r, status_pagamento: "FINALIZADO" } : r));
                                                setMsg("Venda finalizada!");
                                              } else {
                                                setMsg("❌ Erro ao finalizar — verifique o console");
                                              }
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors"
                                          >
                                            ✅ Finalizar Venda
                                          </button>
                                        )}
                                        {podeVerHistorico && v.status_pagamento !== "CANCELADO" && (
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              const isLojista = v.tipo === "ATACADO" || v.origem === "ATACADO";
                                              // Cancelar TODAS as vendas do grupo (multi-produto)
                                              const grupoIds = (v.grupo_id ? vendas.filter(gv => gv.grupo_id === v.grupo_id).map(gv => gv.id) : [v.id]);
                                              const qtdProdutos = grupoIds.length;
                                              const pluralTxt = qtdProdutos > 1 ? `de ${qtdProdutos} produtos` : "";
                                              let devolverComoCredito = false;
                                              if (isLojista) {
                                                const valorTotal = vendas.filter(gv => grupoIds.includes(gv.id)).reduce((s, gv) => s + Number(gv.preco_vendido || 0), 0);
                                                const r = confirm(`Cancelar venda ${pluralTxt} de ${v.cliente}?\n\n✅ OK = Manter valor como CRÉDITO para o lojista (R$ ${valorTotal.toLocaleString("pt-BR")})\n❌ Cancelar = apenas cancelar SEM creditar`);
                                                if (r) devolverComoCredito = true;
                                                else {
                                                  if (!confirm(`Cancelar ${pluralTxt} SEM creditar?\n\nIsso vai:\n- Marcar como cancelada\n- Devolver produto(s) ao estoque\n- Remover o seminovo do estoque (se houver troca)`)) return;
                                                }
                                              } else {
                                                if (!confirm(`Cancelar venda ${pluralTxt} de ${v.cliente}?\n\nIsso vai:\n- Marcar como cancelada\n- Devolver produto(s) ao estoque\n- Remover o seminovo do estoque (se houver troca)`)) return;
                                              }
                                              let allOk = true;
                                              for (const vid of grupoIds) {
                                                const res = await fetch("/api/vendas", {
                                                  method: "DELETE",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                  body: JSON.stringify({ id: vid, devolver_como_credito: devolverComoCredito }),
                                                });
                                                if (!res.ok) {
                                                  const txt = await res.text().catch(() => "");
                                                  console.error(`[Cancelar] Erro ao cancelar ${vid}:`, res.status, txt);
                                                  allOk = false;
                                                }
                                              }
                                              setVendas(prev => prev.filter(r => !grupoIds.includes(r.id)));
                                              if (allOk) {
                                                setMsg(devolverComoCredito
                                                  ? `${qtdProdutos > 1 ? `${qtdProdutos} vendas canceladas` : "Venda cancelada"}! Valor creditado ao lojista.`
                                                  : `${qtdProdutos > 1 ? `${qtdProdutos} vendas canceladas` : "Venda cancelada"}!`);
                                              } else {
                                                setMsg("⚠️ Algumas vendas não foram canceladas — verifique o console");
                                              }
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs text-red-500 border border-red-200 hover:bg-red-50 transition-colors"
                                          >
                                            ❌ Cancelar Venda
                                          </button>
                                        )}
                                        {/* Botão Encaminhar Entrega — SO aparece se ainda nao tem entrega vinculada */}
                                        {!v.entrega_id && (v.status_pagamento === "AGUARDANDO" || v.status_pagamento === "PROGRAMADA" || (v.status_pagamento === "FINALIZADO" && v.data_programada)) && (v.local === "ENTREGA" || v.local === "RETIRADA") && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEncaminharVenda(v);
                                            }}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-600 border border-purple-200 hover:bg-purple-50 transition-colors"
                                          >
                                            📦 {v.status_pagamento === "PROGRAMADA" || v.data_programada ? "Agendar Entrega" : "Encaminhar Entrega"}
                                          </button>
                                        )}
                                        {/* Botao 'Ver entrega' quando ja tem entrega vinculada */}
                                        {v.entrega_id && (
                                          <a
                                            href={`/admin/entregas?destacar=${v.entrega_id}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 transition-colors inline-flex items-center gap-1"
                                            title="Abrir entrega vinculada"
                                          >
                                            🚚 Ver entrega
                                          </a>
                                        )}
                                        {/* Botão Reajuste — só admin */}
                                        {podeVerHistorico && <button
                                          onClick={(e) => { e.stopPropagation(); setReajusteId(reajusteId === v.id ? null : v.id); setReajForm({ valor: "", motivo: "", banco: "ITAU", forma: "PIX", observacao: "" }); }}
                                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-600 border border-amber-200 hover:bg-amber-50 transition-colors"
                                        >
                                          💲 Reajuste
                                        </button>}
                                        {podeVerHistorico && (v.status_pagamento === "FINALIZADO" || v.status_pagamento === "FORMULARIO_PREENCHIDO") && (
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              await fetch("/api/vendas", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
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

                                      {/* Campo de rastreio inline para vendas CORREIO */}
                                      {v.local === "CORREIO" && (
                                        <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                          <span className="text-xs font-semibold text-blue-500">📦 Rastreio:</span>
                                          {v.codigo_rastreio ? (
                                            <a href={`https://www.linkcorreios.com.br/${v.codigo_rastreio}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-blue-500 hover:underline">{v.codigo_rastreio}</a>
                                          ) : (
                                            <span className={`text-xs ${dm ? "text-[#6E6E73]" : "text-[#86868B]"}`}>Não informado</span>
                                          )}
                                          <input
                                            id={`rastreio-input-${v.id}`}
                                            defaultValue={v.codigo_rastreio || ""}
                                            placeholder="BR123456789BR"
                                            className={`px-2 py-1 border rounded font-mono text-xs uppercase w-40 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}
                                          />
                                          <button
                                            onClick={async () => {
                                              const input = document.getElementById(`rastreio-input-${v.id}`) as HTMLInputElement;
                                              const codigo = input?.value?.trim().toUpperCase() || "";
                                              if (!codigo) return;
                                              const res = await fetch("/api/vendas", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                body: JSON.stringify({ id: v.id, codigo_rastreio: codigo }),
                                              });
                                              if (res.ok) {
                                                setVendas(prev => prev.map(r => r.id === v.id ? { ...r, codigo_rastreio: codigo } : r));
                                                setMsg(`Rastreio ${codigo} salvo! Venda movida para aba Correios.`);
                                              }
                                            }}
                                            className="px-2 py-1 rounded text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                                          >
                                            Salvar
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {/* Histórico de pagamentos (vendas programadas) */}
                                    {(v.status_pagamento === "PROGRAMADA" || (Array.isArray((v as unknown as Record<string, unknown>).pagamento_historia) && ((v as unknown as Record<string, unknown>).pagamento_historia as unknown[]).length > 0)) && (() => {
                                      const hist = (Array.isArray((v as unknown as Record<string, unknown>).pagamento_historia) ? (v as unknown as Record<string, unknown>).pagamento_historia : []) as { tipo: string; valor: number; data: string; forma: string; banco: string; obs?: string }[];
                                      const totalPago = hist.reduce((s, p) => s + (p.valor || 0), 0);
                                      const totalVenda = v.preco_vendido || 0;
                                      const saldoRestante = Math.max(0, totalVenda - totalPago);
                                      return (
                                        <div className="space-y-2" onClick={e => e.stopPropagation()}>
                                          <h4 className="text-xs font-bold text-amber-600 uppercase">💰 Pagamentos</h4>
                                          <div className="flex gap-4 text-xs mb-2">
                                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Total: <strong className={dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}>{fmt(totalVenda)}</strong></span>
                                            <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Pago: <strong className="text-green-600">{fmt(totalPago)}</strong></span>
                                            {saldoRestante > 0 && <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>Restante: <strong className="text-amber-600">{fmt(saldoRestante)}</strong></span>}
                                          </div>
                                          {hist.length > 0 && (
                                            <div className="space-y-1">
                                              {hist.map((p, i) => (
                                                <div key={i} className={`flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs ${dm ? "bg-[#2C2C2E]" : "bg-[#F0F0F5]"}`}>
                                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${p.tipo === "SINAL" ? "bg-blue-100 text-blue-700" : p.tipo === "FINAL" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>{p.tipo}</span>
                                                  <span className="font-bold text-green-600">{fmt(p.valor)}</span>
                                                  <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>{p.forma} {p.banco}</span>
                                                  <span className={dm ? "text-[#98989D]" : "text-[#86868B]"}>{p.data?.split("-").reverse().join("/")}</span>
                                                  {p.obs && <span className={dm ? "text-[#6E6E73]" : "text-[#86868B]"}>({p.obs})</span>}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          {hist.length === 0 && v.sinal_antecipado > 0 && (
                                            <div className={`px-3 py-1.5 rounded-lg text-xs ${dm ? "bg-[#2C2C2E]" : "bg-[#F0F0F5]"}`}>
                                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700">SINAL</span>
                                              <span className="ml-2 font-bold text-green-600">{fmt(v.sinal_antecipado)}</span>
                                              <span className={`ml-2 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{v.banco_sinal || "—"}</span>
                                            </div>
                                          )}
                                          {saldoRestante > 0 && (
                                            <div className="mt-2">
                                              {pagFormId !== v.id ? (
                                                <button
                                                  onClick={() => {
                                                    setPagFormId(v.id);
                                                    setPagForm({ valor: String(saldoRestante), data: hojeBR(), forma: "PIX", banco: "ITAU", parcelas: "", bandeira: "", obs: "" });
                                                  }}
                                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-green-600 border border-green-300 hover:bg-green-50 transition-colors"
                                                >
                                                  + Registrar Pagamento
                                                </button>
                                              ) : (
                                                <div className={`p-3 rounded-xl border space-y-3 ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`} onClick={e => e.stopPropagation()}>
                                                  <div className="flex items-center justify-between">
                                                    <h5 className="text-xs font-bold text-green-600">Registrar Pagamento</h5>
                                                    <button onClick={() => setPagFormId(null)} className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"} hover:text-red-500`}>✕</button>
                                                  </div>
                                                  <div className="grid grid-cols-2 gap-2">
                                                    {/* Data */}
                                                    <div>
                                                      <label className={`text-[10px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Data</label>
                                                      <input type="date" value={pagForm.data} onChange={e => setPagForm(f => ({ ...f, data: e.target.value }))}
                                                        className={`w-full px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`} />
                                                    </div>
                                                    {/* Valor */}
                                                    <div>
                                                      <label className={`text-[10px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Valor (restante: {fmt(saldoRestante)})</label>
                                                      <input type="text" inputMode="decimal" value={pagForm.valor} onChange={e => setPagForm(f => ({ ...f, valor: e.target.value }))}
                                                        placeholder={saldoRestante.toLocaleString("pt-BR")}
                                                        className={`w-full px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`} />
                                                    </div>
                                                    {/* Forma */}
                                                    <div>
                                                      <label className={`text-[10px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Forma</label>
                                                      <select value={pagForm.forma} onChange={e => setPagForm(f => ({ ...f, forma: e.target.value, parcelas: "", bandeira: "" }))}
                                                        className={`w-full px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`}>
                                                        <option value="PIX">PIX</option>
                                                        <option value="CARTAO">Cartão Crédito</option>
                                                        <option value="DEBITO">Cartão Débito</option>
                                                        <option value="LINK">Link Pagamento</option>
                                                        <option value="ESPECIE">Espécie</option>
                                                        <option value="DINHEIRO">Dinheiro</option>
                                                      </select>
                                                    </div>
                                                    {/* Banco */}
                                                    {pagForm.forma !== "ESPECIE" && pagForm.forma !== "DINHEIRO" && (
                                                      <div>
                                                        <label className={`text-[10px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Banco</label>
                                                        <select value={pagForm.banco} onChange={e => setPagForm(f => ({ ...f, banco: e.target.value }))}
                                                          className={`w-full px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`}>
                                                          <option value="ITAU">Itaú</option>
                                                          <option value="INFINITE">InfinitePay</option>
                                                          <option value="MERCADO_PAGO">Mercado Pago</option>
                                                        </select>
                                                      </div>
                                                    )}
                                                    {/* Parcelas (Cartão / Link) */}
                                                    {(pagForm.forma === "CARTAO" || pagForm.forma === "LINK") && (
                                                      <div>
                                                        <label className={`text-[10px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Parcelas</label>
                                                        <select value={pagForm.parcelas} onChange={e => setPagForm(f => ({ ...f, parcelas: e.target.value }))}
                                                          className={`w-full px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`}>
                                                          <option value="">—</option>
                                                          {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={String(n)}>{n}x</option>)}
                                                        </select>
                                                      </div>
                                                    )}
                                                    {/* Bandeira (Cartão Crédito / Débito) */}
                                                    {(pagForm.forma === "CARTAO" || pagForm.forma === "DEBITO") && (
                                                      <div>
                                                        <label className={`text-[10px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Bandeira</label>
                                                        <select value={pagForm.bandeira} onChange={e => setPagForm(f => ({ ...f, bandeira: e.target.value }))}
                                                          className={`w-full px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`}>
                                                          <option value="">—</option>
                                                          <option value="VISA">Visa</option>
                                                          <option value="MASTERCARD">Mastercard</option>
                                                          <option value="ELO">Elo</option>
                                                          <option value="AMEX">Amex</option>
                                                        </select>
                                                      </div>
                                                    )}
                                                  </div>
                                                  {/* Observação */}
                                                  <div>
                                                    <label className={`text-[10px] font-medium ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Observação (opcional)</label>
                                                    <input type="text" value={pagForm.obs} onChange={e => setPagForm(f => ({ ...f, obs: e.target.value }))}
                                                      placeholder="Ex: pagou via transferência da mãe"
                                                      className={`w-full px-2 py-1.5 rounded-lg border text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`} />
                                                  </div>
                                                  {/* Botões */}
                                                  <div className="flex gap-2">
                                                    <button
                                                      onClick={() => {
                                                        const valor = parseFloat(pagForm.valor.replace(/\./g, "").replace(",", ".")) || 0;
                                                        if (valor <= 0) { alert("Informe um valor válido."); return; }
                                                        const formaStr = [pagForm.forma, pagForm.parcelas ? `${pagForm.parcelas}x` : "", pagForm.bandeira].filter(Boolean).join(" ");
                                                        const bancoStr = (pagForm.forma === "ESPECIE" || pagForm.forma === "DINHEIRO") ? "ESPECIE" : pagForm.banco;
                                                        const tipo = valor >= saldoRestante ? "FINAL" : "PARCIAL";
                                                        const novoPag = { tipo, valor, data: pagForm.data, forma: formaStr, banco: bancoStr, ...(pagForm.obs ? { obs: pagForm.obs } : {}) };
                                                        const novaHist = [...hist, novoPag];
                                                        const novoTotalPago = novaHist.reduce((s, p) => s + (p.valor || 0), 0);
                                                        const updates: Record<string, unknown> = { id: v.id, pagamento_historia: novaHist };
                                                        if (novoTotalPago >= totalVenda) {
                                                          updates.status_pagamento = "FINALIZADO";
                                                          updates.forma = pagForm.forma;
                                                          updates.banco = bancoStr;
                                                        }
                                                        fetch("/api/vendas", {
                                                          method: "PATCH",
                                                          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                          body: JSON.stringify(updates),
                                                        }).then(r => r.json()).then(json => {
                                                          if (json.ok || json.data) {
                                                            setVendas(prev => prev.map(r => r.id === v.id ? { ...r, ...updates, pagamento_historia: novaHist } as typeof r : r));
                                                            setMsg(novoTotalPago >= totalVenda ? `Pagamento final registrado! Venda finalizada.` : `Pagamento de ${fmt(valor)} registrado.`);
                                                            setPagFormId(null);
                                                          } else {
                                                            alert("Erro: " + (json.error || "falha"));
                                                          }
                                                        }).catch(() => alert("Erro de conexão"));
                                                      }}
                                                      className="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-colors"
                                                    >
                                                      ✓ Confirmar
                                                    </button>
                                                    <button onClick={() => setPagFormId(null)}
                                                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${dm ? "border-[#3A3A3C] text-[#98989D] hover:bg-[#2C2C2E]" : "border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"} transition-colors`}>
                                                      Cancelar
                                                    </button>
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}

                                    {/* Detalhes da venda */}
                                    <div className="space-y-2">
                                      <h4 className="text-xs font-bold text-[#86868B] uppercase">Detalhes</h4>
                                      <div className="text-xs space-y-1">
                                        <p><strong>Produto:</strong> {normalizarCoresNoTexto(buildProdutoDisplay(v))}</p>
                                        <p>
                                          <strong>Serial No.:</strong>{" "}
                                          {editingId === v.id + "-serial" ? (
                                            <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                              <input
                                                autoFocus
                                                defaultValue={v.serial_no || ""}
                                                id={`serial-input-${v.id}`}
                                                className={`px-1.5 py-0.5 border rounded font-mono text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}
                                                placeholder="Ex: C39XXXXX"
                                              />
                                              <button
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  const input = document.getElementById(`serial-input-${v.id}`) as HTMLInputElement;
                                                  const newVal = input?.value.trim() || null;
                                                  await fetch("/api/vendas", {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                    body: JSON.stringify({ id: v.id, serial_no: newVal }),
                                                  });
                                                  setVendas(prev => prev.map(r => r.id === v.id ? { ...r, serial_no: newVal || "" } : r));
                                                  setEditingId(null);
                                                }}
                                                className="px-2 py-0.5 rounded text-[10px] bg-blue-500 text-white font-semibold hover:bg-blue-600"
                                              >OK</button>
                                              <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="px-2 py-0.5 rounded text-[10px] border border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]">✕</button>
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1.5">
                                              <span className={`font-mono ${v.serial_no ? "" : "text-[#86868B]"}`}>{v.serial_no || "—"}</span>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setEditingId(v.id + "-serial"); }}
                                                className="text-[10px] text-[#86868B] hover:text-[#E8740E] transition-colors"
                                                title="Editar Serial"
                                              >✏️</button>
                                            </span>
                                          )}
                                        </p>
                                        <p>
                                          <strong>IMEI:</strong>{" "}
                                          {editingId === v.id + "-imei" ? (
                                            <span className="inline-flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                              <input
                                                autoFocus
                                                defaultValue={v.imei || ""}
                                                id={`imei-input-${v.id}`}
                                                className={`px-1.5 py-0.5 border rounded font-mono text-xs ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}
                                                placeholder="Ex: 35XXXXXXXXXXXXXXX"
                                              />
                                              <button
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  const input = document.getElementById(`imei-input-${v.id}`) as HTMLInputElement;
                                                  const newVal = input?.value.trim() || null;
                                                  await fetch("/api/vendas", {
                                                    method: "PATCH",
                                                    headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                    body: JSON.stringify({ id: v.id, imei: newVal }),
                                                  });
                                                  setVendas(prev => prev.map(r => r.id === v.id ? { ...r, imei: newVal || "" } : r));
                                                  setEditingId(null);
                                                }}
                                                className="px-2 py-0.5 rounded text-[10px] bg-blue-500 text-white font-semibold hover:bg-blue-600"
                                              >OK</button>
                                              <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="px-2 py-0.5 rounded text-[10px] border border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]">✕</button>
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1.5">
                                              <span className={`font-mono ${v.imei ? "" : "text-[#86868B]"}`}>{v.imei || "—"}</span>
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setEditingId(v.id + "-imei"); }}
                                                className="text-[10px] text-[#86868B] hover:text-[#E8740E] transition-colors"
                                                title="Editar IMEI"
                                              >✏️</button>
                                            </span>
                                          )}
                                        </p>
                                        <p><strong>Fornecedor:</strong> {v.fornecedor || "—"}</p>
                                        <p><strong>Local:</strong> {v.local || "—"}</p>
                                        {v.codigo_rastreio && (
                                          <p className="flex items-center gap-2">
                                            <strong>📦 Rastreio:</strong>
                                            <a href={`https://www.linkcorreios.com.br/${v.codigo_rastreio}`} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-500 hover:text-blue-700 underline">{v.codigo_rastreio}</a>
                                          </p>
                                        )}
                                        {(v.frete_valor ?? 0) > 0 && (
                                          <p>
                                            <strong>🚚 Taxa Entrega:</strong> R$ {Number(v.frete_valor).toLocaleString("pt-BR")}{" "}
                                            {v.frete_forma && <span className={`text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>({v.frete_forma}{v.frete_banco ? ` — ${v.frete_banco}` : ""})</span>}
                                            {" "}
                                            <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.frete_recebido ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                                              {v.frete_recebido ? "RECEBIDO" : "PENDENTE"}
                                            </span>
                                          </p>
                                        )}
                                        {(v as unknown as Record<string, string>).notas && <p><strong>Notas:</strong> {(v as unknown as Record<string, string>).notas}</p>}
                                      </div>
                                    </div>

                                    {/* Reajustes existentes */}
                                    {Array.isArray(v.reajustes) && v.reajustes.length > 0 && (
                                      <div className="md:col-span-3 space-y-2">
                                        <h4 className="text-xs font-bold text-amber-600 uppercase">💲 Reajustes</h4>
                                        {v.reajustes.map((r: { valor: number; motivo: string; banco: string; data: string; forma?: string; observacao?: string | null }, i: number) => (
                                          <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${dm ? "bg-amber-900/20" : "bg-amber-50"}`}>
                                            <span className="text-sm font-bold text-amber-600">+R$ {r.valor.toLocaleString("pt-BR")}</span>
                                            <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{r.motivo}{r.observacao ? ` (${r.observacao})` : ""}</span>
                                            <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{r.forma || "PIX"} {r.banco}</span>
                                            <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{r.data?.split("-").reverse().join("/")}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Estornos vinculados (gastos categoria=ESTORNO com venda_id = v.id) */}
                                    {Array.isArray(v.estornos) && v.estornos.length > 0 && (
                                      <div className="md:col-span-3 space-y-2">
                                        <h4 className="text-xs font-bold text-red-600 uppercase">↩️ Estornos</h4>
                                        {v.estornos.map((e) => (
                                          <div key={e.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${dm ? "bg-red-900/20" : "bg-red-50"}`}>
                                            <span className="text-sm font-bold text-red-600">-R$ {Number(e.valor).toLocaleString("pt-BR")}</span>
                                            <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{e.descricao || "Estorno"}{e.observacao ? ` (${e.observacao})` : ""}</span>
                                            {e.banco && <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{e.banco}</span>}
                                            <span className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{e.data?.split("-").reverse().join("/")}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Formulário de reajuste inline */}
                                    {reajusteId === v.id && (
                                      <div className="md:col-span-3 space-y-3 p-4 rounded-xl border-2 border-amber-300 bg-amber-50">
                                        <h4 className="text-sm font-bold text-amber-700">Adicionar Reajuste</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                          <div>
                                            <p className="text-xs font-bold text-[#86868B] uppercase mb-1">Valor (R$)</p>
                                            <input type="number" placeholder="100" value={reajForm.valor} onChange={e => setReajForm(f => ({ ...f, valor: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
                                          </div>
                                          <div>
                                            <p className="text-xs font-bold text-[#86868B] uppercase mb-1">Motivo</p>
                                            <select value={reajForm.motivo} onChange={e => setReajForm(f => ({ ...f, motivo: e.target.value, ...(e.target.value !== "Outro" ? {} : {}) }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                                              <option value="">Selecionar...</option>
                                              <option value="Sem caixa original">Sem caixa original</option>
                                              <option value="Sem cabo">Sem cabo</option>
                                              <option value="Sem fonte">Sem fonte</option>
                                              <option value="Arranhão na tela">Arranhão na tela</option>
                                              <option value="Marca de uso">Marca de uso</option>
                                              <option value="Bateria abaixo do informado">Bateria abaixo do informado</option>
                                              <option value="Peça trocada">Peça trocada</option>
                                              <option value="Outro">Outro</option>
                                            </select>
                                          </div>
                                          <div>
                                            <p className="text-xs font-bold text-[#86868B] uppercase mb-1">Forma</p>
                                            <select value={reajForm.forma} onChange={e => setReajForm(f => ({ ...f, forma: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                                              <option value="PIX">PIX</option>
                                              <option value="CARTAO">Cartão de Crédito</option>
                                              <option value="ESPECIE">Dinheiro</option>
                                            </select>
                                          </div>
                                          <div>
                                            <p className="text-xs font-bold text-[#86868B] uppercase mb-1">Banco</p>
                                            <select value={reajForm.banco} onChange={e => setReajForm(f => ({ ...f, banco: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                                              <option value="ITAU">Itaú</option>
                                              <option value="INFINITE">Infinite</option>
                                              <option value="MERCADO_PAGO">Mercado Pago</option>
                                              <option value="ESPECIE">Espécie</option>
                                            </select>
                                          </div>
                                        </div>
                                        {reajForm.motivo && (
                                          <div>
                                            <p className="text-xs font-bold text-[#86868B] uppercase mb-1">
                                              Observação do reajuste {reajForm.motivo === "Outro" && <span className="text-red-500">*</span>}
                                            </p>
                                            <input
                                              type="text"
                                              placeholder={reajForm.motivo === "Outro" ? "Ex: Cliente informou detalhe não previsto inicialmente" : "Detalhamento adicional (opcional)"}
                                              value={reajForm.observacao}
                                              onChange={e => setReajForm(f => ({ ...f, observacao: e.target.value }))}
                                              className="w-full px-3 py-2 border rounded-lg text-sm"
                                            />
                                          </div>
                                        )}
                                        <div className="flex gap-2">
                                          <button
                                            onClick={async (e) => {
                                              e.stopPropagation();
                                              try {
                                              const valor = parseFloat(reajForm.valor);
                                              if (!valor || !reajForm.motivo) { alert("Preencha valor e motivo"); return; }
                                              if (reajForm.motivo === "Outro" && !reajForm.observacao.trim()) { alert("Informe o motivo do reajuste"); return; }
                                              const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
                                              const novoReajuste = { valor, motivo: reajForm.motivo, banco: reajForm.banco, forma: reajForm.forma || "PIX", data: hoje, observacao: reajForm.observacao.trim() || null };
                                              const reajustesAtuais = Array.isArray(v.reajustes) ? [...v.reajustes] : [];
                                              const novosReajustes = [...reajustesAtuais, novoReajuste];
                                              const res = await fetch("/api/vendas", {
                                                method: "PATCH",
                                                headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                                                body: JSON.stringify({ id: v.id, reajustes: novosReajustes }),
                                              });
                                              const json = await res.json();
                                              if (json.ok) {
                                                setVendas(prev => prev.map(r => r.id === v.id ? { ...r, reajustes: novosReajustes } : r));
                                                setReajusteId(null);
                                                setMsg(`Reajuste de R$ ${valor} registrado!`);
                                              } else {
                                                alert("Erro: " + (json.error || "falha ao salvar"));
                                              }
                                              } catch (err) { alert("Erro de conexão: " + err); }
                                            }}
                                            className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                                          >
                                            Salvar Reajuste
                                          </button>
                                          <button onClick={(e) => { e.stopPropagation(); setReajusteId(null); }} className="px-4 py-2 rounded-lg text-sm text-[#86868B] hover:bg-gray-100 transition-colors">
                                            Cancelar
                                          </button>
                                        </div>
                                      </div>
                                    )}


                                    {/* Produto na troca */}
                                    {(() => {
                                      const vx = v as unknown as Record<string, string | number | null>;
                                      const tProd = vx.troca_produto ? String(vx.troca_produto) : "";
                                      const tCor = vx.troca_cor ? String(vx.troca_cor) : "";
                                      const tBat = vx.troca_bateria ? String(vx.troca_bateria) : "";
                                      const tObs = vx.troca_obs ? String(vx.troca_obs) : "";
                                      const tSerial = vx.troca_serial ? String(vx.troca_serial) : "";
                                      const tImei = vx.troca_imei ? String(vx.troca_imei) : "";
                                      const tValor = vx.produto_na_troca ? Number(vx.produto_na_troca) : 0;
                                      if (!tProd && !tValor) return null;
                                      return (
                                        <div className="space-y-2">
                                          <h4 className="text-xs font-bold text-[#86868B] uppercase">🔄 Produto na Troca</h4>
                                          <div className="text-xs space-y-1 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                            {tProd && <p><strong>Modelo:</strong> {tProd}</p>}
                                            {tCor && <p><strong>Cor:</strong> {corParaPT(tCor)}</p>}
                                            {tBat && <p><strong>Bateria:</strong> {tBat}%</p>}
                                            {tSerial && <p><strong>Serial:</strong> {tSerial}</p>}
                                            {tImei && <p><strong>IMEI:</strong> {tImei}</p>}
                                            {tValor > 0 && <p><strong>Valor da troca:</strong> R$ {tValor.toLocaleString("pt-BR")}</p>}
                                            {tObs && <p><strong>Obs:</strong> {tObs}</p>}
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* 2º Produto na troca */}
                                    {(() => {
                                      const vx = v as unknown as Record<string, string | number | null>;
                                      const t2Prod = vx.troca_produto2 ? String(vx.troca_produto2) : "";
                                      const t2Cor = vx.troca_cor2 ? String(vx.troca_cor2) : "";
                                      const t2Bat = vx.troca_bateria2 ? String(vx.troca_bateria2) : "";
                                      const t2Obs = vx.troca_obs2 ? String(vx.troca_obs2) : "";
                                      const t2Serial = vx.troca_serial2 ? String(vx.troca_serial2) : "";
                                      const t2Imei = vx.troca_imei2 ? String(vx.troca_imei2) : "";
                                      const t2Valor = vx.produto_na_troca2 ? Number(vx.produto_na_troca2) : 0;
                                      if (!t2Prod && !t2Valor) return null;
                                      return (
                                        <div className="space-y-2">
                                          <h4 className="text-xs font-bold text-[#86868B] uppercase">🔄 2º Produto na Troca</h4>
                                          <div className="text-xs space-y-1 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                            {t2Prod && <p><strong>Modelo:</strong> {t2Prod}</p>}
                                            {t2Cor && <p><strong>Cor:</strong> {corParaPT(t2Cor)}</p>}
                                            {t2Bat && <p><strong>Bateria:</strong> {t2Bat}%</p>}
                                            {t2Serial && <p><strong>Serial:</strong> {t2Serial}</p>}
                                            {t2Imei && <p><strong>IMEI:</strong> {t2Imei}</p>}
                                            {t2Valor > 0 && <p><strong>Valor da troca:</strong> R$ {t2Valor.toLocaleString("pt-BR")}</p>}
                                            {t2Obs && <p><strong>Obs:</strong> {t2Obs}</p>}
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* NF: botão inline na fileira de STATUS acima */}
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()
      )}
      {/* Modal Nota Fiscal PDF */}
      {notaFiscalVendaIds.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"} border rounded-2xl p-6 shadow-xl max-w-md w-full mx-4 space-y-4`}>
            <h3 className={`text-lg font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>Deseja incluir nota fiscal em PDF?</h3>
            <div
              onDragOver={(e) => { e.preventDefault(); setNotaFiscalDragOver(true); }}
              onDragLeave={() => setNotaFiscalDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setNotaFiscalDragOver(false);
                const file = e.dataTransfer.files[0];
                if (file?.type === "application/pdf") setNotaFiscalFile(file);
                else setMsg("Apenas arquivos PDF sao aceitos");
              }}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                notaFiscalDragOver ? "border-[#E8740E] bg-orange-50/10" : dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"
              }`}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pdf";
                input.onchange = (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file?.type === "application/pdf") setNotaFiscalFile(file);
                };
                input.click();
              }}
            >
              {notaFiscalFile ? (
                <div className="space-y-1">
                  <p className="text-2xl">📄</p>
                  <p className={`text-sm font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{notaFiscalFile.name}</p>
                  <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{(notaFiscalFile.size / 1024).toFixed(0)} KB</p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-3xl">📎</p>
                  <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Arraste o PDF aqui ou clique para selecionar</p>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                disabled={!notaFiscalFile || notaFiscalUploading}
                onClick={async () => {
                  if (!notaFiscalFile) return;
                  setNotaFiscalUploading(true);
                  try {
                    for (const vendaId of notaFiscalVendaIds) {
                      const fd = new FormData();
                      fd.append("file", notaFiscalFile);
                      fd.append("venda_id", vendaId);
                      await fetch("/api/vendas/nota-fiscal", {
                        method: "POST",
                        headers: { "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
                        body: fd,
                      });
                    }
                    setMsg("Nota fiscal salva com sucesso!");
                  } catch {
                    setMsg("Erro ao salvar nota fiscal");
                  }
                  setNotaFiscalUploading(false);
                  setNotaFiscalVendaIds([]);
                  setNotaFiscalFile(null);
                  // Limpar formulário completo após nota fiscal
                  setForm({
                    data: hojeBR(),
                    cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF", origem: "", tipo: "", produto: "", fornecedor: "",
                    custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
                    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
                    entrada_pix: "", banco_pix: "ITAU", entrada_pix_2: "", banco_pix_2: "INFINITE", entrada_especie: "", banco_2nd: "", banco_alt: "",
                    forma_alt: "", parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "", forma_sinal: "PIX",
                    entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
                    valor_total_venda: "",
                    troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "", troca_obs: "",
                    troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
                    troca_serial: "", troca_imei: "",
                    produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
                    troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
                    serial_no: "", imei: "",
                    cep: "", bairro: "", cidade: "", uf: "",
                    frete_valor: "", frete_recebido: false, frete_forma: "", frete_banco: "", frete_parcelas: "", frete_bandeira: "", usar_credito_loja: "", codigo_rastreio: "",
                    is_brinde: false,
                  });
                  setShowSegundaTroca(false); setTrocaEnabled(false);
                  setLastClienteData(null);
                  setCatSel("");
                  setEstoqueId("");
                  setProdutoManual(false);
                  setProdutosCarrinho([]);
                  localStorage.removeItem("tigrao_venda_draft");
                }}
                className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
              >
                {notaFiscalUploading ? "Enviando..." : "Enviar"}
              </button>
              <button
                onClick={() => {
                  setNotaFiscalVendaIds([]);
                  setNotaFiscalFile(null);
                  // Limpar formulário completo ao pular nota fiscal
                  setForm({
                    data: hojeBR(),
                    cliente: "", cpf: "", cnpj: "", email: "", telefone: "", endereco: "", pessoa: "PF", origem: "", tipo: "", produto: "", fornecedor: "",
                    custo: "", preco_vendido: "", valor_comprovante_input: "", banco: "ITAU", forma: "",
                    qnt_parcelas: "", bandeira: "", local: "", produto_na_troca: "",
                    entrada_pix: "", banco_pix: "ITAU", entrada_pix_2: "", banco_pix_2: "INFINITE", entrada_especie: "", banco_2nd: "", banco_alt: "",
                    forma_alt: "", parc_alt: "", band_alt: "", comp_alt: "", sinal_antecipado: "", banco_sinal: "", forma_sinal: "PIX",
                    entrada_fiado: "", fiado_qnt_parcelas: "1", fiado_data_inicio: "", fiado_intervalo: "7",
                    valor_total_venda: "",
                    troca_produto: "", troca_cor: "", troca_categoria: "", troca_bateria: "", troca_obs: "",
                    troca_grade: "", troca_caixa: "", troca_cabo: "", troca_fonte: "", troca_pulseira: "", troca_ciclos: "", troca_garantia: "",
                    troca_serial: "", troca_imei: "",
                    produto_na_troca2: "", troca_produto2: "", troca_cor2: "", troca_categoria2: "", troca_bateria2: "", troca_obs2: "", troca_grade2: "", troca_caixa2: "", troca_cabo2: "", troca_fonte2: "",
                    troca_serial2: "", troca_imei2: "", troca_garantia2: "", troca_pulseira2: "", troca_ciclos2: "", troca_condicao: "SEMINOVO", troca_condicao2: "SEMINOVO",
                    serial_no: "", imei: "",
                    cep: "", bairro: "", cidade: "", uf: "",
                    frete_valor: "", frete_recebido: false, frete_forma: "", frete_banco: "", frete_parcelas: "", frete_bandeira: "", usar_credito_loja: "", codigo_rastreio: "",
                    is_brinde: false,
                  });
                  setShowSegundaTroca(false); setTrocaEnabled(false);
                  setLastClienteData(null);
                  setCatSel("");
                  setEstoqueId("");
                  setProdutoManual(false);
                  setProdutosCarrinho([]);
                  localStorage.removeItem("tigrao_venda_draft");
                  setMsg("");
                }}
                className={`flex-1 py-3 rounded-xl font-semibold transition-colors ${dm ? "bg-[#3A3A3C] text-[#F5F5F7] hover:bg-[#4A4A4C]" : "bg-[#E5E5EA] text-[#1D1D1F] hover:bg-[#D2D2D7]"}`}
              >
                Pular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Encaminhar Entrega (com select de vendedor) */}
      {encaminharVenda && (
        <EncaminharEntregaModal
          venda={encaminharVenda}
          vendedores={vendedoresList}
          password={password}
          userNome={user?.nome || "sistema"}
          onClose={() => setEncaminharVenda(null)}
          onSaved={(entregaId) => {
            setVendas(prev => prev.map(x => x.id === encaminharVenda.id ? { ...x, entrega_id: entregaId } : x));
            setMsg("📦 Entrega criada com sucesso!");
            setEncaminharVenda(null);
          }}
          onConflito={() => {
            setMsg("⚠️ Esta venda já tem uma entrega vinculada.");
            fetchVendas();
            setEncaminharVenda(null);
          }}
        />
      )}
    </div>
  );
}

// ====================================================================
// Modal: Encaminhar Entrega (data + horario + vendedor + observacao)
// ====================================================================

function EncaminharEntregaModal({
  venda,
  vendedores,
  password,
  userNome,
  onClose,
  onSaved,
  onConflito,
}: {
  venda: Venda;
  vendedores: Array<{ nome: string; numero?: string; ativo?: boolean }>;
  password: string;
  userNome: string;
  onClose: () => void;
  onSaved: (entregaId: string) => void;
  onConflito: () => void;
}) {
  // Data default: data_programada se houver, senao hoje
  const defaultData = venda.data_programada || new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  // Vendedor default: Bianca (principal responsavel pelos formularios).
  // Operador pode sobrescrever pelo select se for outra pessoa atendendo.
  const defaultVendedor = "Bianca";
  const [dataEntrega, setDataEntrega] = useState(defaultData);
  const [horario, setHorario] = useState("");
  const [vendedor, setVendedor] = useState(defaultVendedor);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const vendedoresAtivos = vendedores.filter(v => v.ativo !== false).map(v => v.nome);
  // Garantir que o default apareca na lista mesmo se for admin/sistema
  const opcoesVendedor = Array.from(new Set([defaultVendedor, ...vendedoresAtivos].filter(Boolean)));

  const salvar = async () => {
    setErro(null);
    if (!dataEntrega) { setErro("Informe a data"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/vendas/encaminhar-entrega", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userNome) },
        body: JSON.stringify({
          venda_id: venda.id,
          data_entrega: dataEntrega,
          horario: horario || undefined,
          vendedor: vendedor || undefined,
          observacao: observacao || undefined,
        }),
      });
      const json = await res.json();
      if (res.status === 409) { onConflito(); return; }
      if (!res.ok) { setErro(json.error || "Falha ao criar entrega"); setSaving(false); return; }
      onSaved(json.entrega?.id || "");
    } catch (e) {
      setErro(String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#1D1D1F]">📦 Encaminhar Entrega</h2>
          <button onClick={onClose} className="text-2xl text-[#86868B] hover:text-[#1D1D1F]">×</button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4">
          <p className="text-sm font-medium text-[#1D1D1F]">{venda.cliente}</p>
          <p className="text-xs text-[#6E6E73] mt-0.5">{venda.produto}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wide block mb-1">Data da entrega</label>
            <input
              type="date"
              value={dataEntrega}
              onChange={(e) => setDataEntrega(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] focus:outline-none focus:border-[#E8740E] text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wide block mb-1">Horário (opcional)</label>
            <input
              type="text"
              value={horario}
              onChange={(e) => setHorario(e.target.value)}
              placeholder="Ex: 14:00 ou 14h a 16h"
              className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] focus:outline-none focus:border-[#E8740E] text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wide block mb-1">Vendedor responsável</label>
            <select
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] focus:outline-none focus:border-[#E8740E] text-sm"
            >
              {opcoesVendedor.map((nome) => (
                <option key={nome} value={nome}>{nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-[#86868B] mt-1">Vendedor responsável pelo contato com o cliente</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#86868B] uppercase tracking-wide block mb-1">Observação (opcional)</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Algo especial pro motoboy..."
              className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] focus:outline-none focus:border-[#E8740E] text-sm resize-none"
            />
          </div>

          {erro && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-[#E5E5EA]">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-lg text-sm text-[#1D1D1F] hover:bg-[#F5F5F7] font-medium">Cancelar</button>
          <button onClick={salvar} disabled={saving} className="px-4 py-2 rounded-lg text-sm bg-[#E8740E] text-white font-bold hover:bg-[#D06A0D] disabled:opacity-50">
            {saving ? "Criando..." : "📦 Criar entrega"}
          </button>
        </div>
      </div>
    </div>
  );
}
