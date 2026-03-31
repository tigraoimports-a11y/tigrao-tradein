"use client";
import { hojeBR } from "@/lib/date-utils";

import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { useTabParam } from "@/lib/useTabParam";
import { getCategoriasEstoque, addCategoriaEstoque, removeCategoriaEstoque, editCategoriaEstoque, EMOJI_OPTIONS } from "@/lib/categorias";
import type { Categoria } from "@/lib/categorias";

import BarcodeScanner from "@/components/BarcodeScanner";
import { buildProdutoName as buildProdutoNameFromSpec, CORES_POR_CATEGORIA, COR_OBRIGATORIA, IPHONE_ORIGENS, WATCH_PULSEIRAS, getIphoneCores, type ProdutoSpec } from "@/lib/produto-specs";
import ProdutoSpecFields, { createEmptyProdutoRow, type ProdutoRowState } from "@/components/admin/ProdutoSpecFields";
import type { Banco } from "@/lib/admin-types";

/* ── OCR: colar imagem → texto no campo serial ── */
let tesseractWorker: import("tesseract.js").Worker | null = null;
async function getOcrWorker() {
  if (tesseractWorker) return tesseractWorker;
  const Tesseract = await import("tesseract.js");
  tesseractWorker = await Tesseract.createWorker("eng");
  return tesseractWorker;
}

async function ocrFromImage(blob: Blob): Promise<string> {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(blob);
  const raw = data.text;

  // Estratégia 1: procurar "Serial No." ou "Serial No" seguido do serial
  const serialMatch = raw.match(/Serial\s*No\.?\s*([A-Za-z0-9]{8,14})/i);
  if (serialMatch) return serialMatch[1].toUpperCase();

  // Estratégia 2: procurar "SN:" ou "S/N:" seguido do serial
  const snMatch = raw.match(/S\/?N[:\s]+([A-Za-z0-9]{8,14})/i);
  if (snMatch) return snMatch[1].toUpperCase();

  // Estratégia 3: procurar qualquer bloco de 10-12 caracteres alfanuméricos (tamanho serial Apple)
  const blocks = raw.match(/\b[A-Za-z][A-Za-z0-9]{9,13}\b/g);
  if (blocks) {
    // Preferir blocos que parecem seriais (mistura de letras e números)
    const serial = blocks.find(b => /[A-Z]/i.test(b) && /[0-9]/.test(b));
    if (serial) return serial.toUpperCase();
  }

  // Fallback: limpar tudo e retornar
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function handleSerialPaste(
  e: React.ClipboardEvent<HTMLInputElement>,
  setValue: (val: string) => void,
  setOcrLoading?: (loading: boolean) => void,
) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith("image/")) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      if (!blob) return;
      if (setOcrLoading) setOcrLoading(true);
      ocrFromImage(blob)
        .then((text) => {
          if (text) setValue(text);
        })
        .catch(() => {})
        .finally(() => { if (setOcrLoading) setOcrLoading(false); });
      return;
    }
  }
}

const EtiquetasContent = lazy(() => import("@/app/admin/etiquetas/page").then(m => ({ default: m.EtiquetasContent })));

interface ProdutoEstoque {
  id: string;
  produto: string;
  categoria: string;
  qnt: number;
  custo_unitario: number;
  status: string;
  cor: string | null;
  observacao: string | null;
  tipo: string;
  bateria: number | null;
  data_compra: string | null;
  cliente: string | null;
  fornecedor: string | null;
  imei: string | null;
  serial_no: string | null;
  data_entrada: string | null;
  preco_sugerido: number | null;
  estoque_minimo: number | null;
}

interface ImeiSearchResult {
  estoque: ProdutoEstoque[];
  vendas: { id: string; produto: string; cliente: string; data: string; preco_vendido: number; fornecedor: string | null; imei: string | null; [key: string]: unknown }[];
}

interface Fornecedor {
  id: string;
  nome: string;
  contato: string | null;
  observacao: string | null;
}

const DEFAULT_CATEGORIAS = ["IPHONES", "IPADS", "MACBOOK", "MAC_MINI", "APPLE_WATCH", "AIRPODS", "ACESSORIOS", "SEMINOVOS"] as const;
const STATUS_OPTIONS = ["EM ESTOQUE", "A CAMINHO", "PENDENTE", "ESGOTADO"] as const;

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
/** Converte YYYY-MM-DD para DD/MM/YYYY */
const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
};

// Mapear categoria customizada para base estruturada (ex: APPLE_WATCH_ATACADO → APPLE_WATCH)
const STRUCTURED_CATS_LIST = ["IPHONES", "MACBOOK", "MAC_MINI", "IPADS", "APPLE_WATCH", "AIRPODS", "SEMINOVOS"];
function getBaseCat(cat: string): string {
  // Seminovos usa mesmos campos de iPhones
  if (cat === "SEMINOVOS") return "IPHONES";
  if (STRUCTURED_CATS_LIST.includes(cat)) return cat;
  const sorted = [...STRUCTURED_CATS_LIST].sort((a, b) => b.length - a.length);
  for (const base of sorted) {
    if (cat.startsWith(base + "_") || cat.startsWith(base)) return base;
  }
  return cat;
}

const CAT_LABELS: Record<string, string> = {
  IPHONES: "iPhones",
  IPADS: "iPads",
  MACBOOK: "MacBooks",
  MAC_MINI: "Mac Mini",
  APPLE_WATCH: "Apple Watch",
  AIRPODS: "AirPods",
  ACESSORIOS: "Acessorios",
  SEMINOVOS: "Seminovos",
};

const STATUS_COLORS: Record<string, string> = {
  "EM ESTOQUE": "bg-green-100 text-green-700",
  "A CAMINHO": "bg-blue-100 text-blue-700",
  "PENDENTE": "bg-yellow-100 text-yellow-700",
  "ESGOTADO": "bg-red-100 text-red-600",
};

/** Extrai o "modelo base" de um produto para agrupar em cards */
function getModeloBase(produto: string, categoria: string): string {
  const p = produto.toUpperCase().trim();
  const baseCat = getBaseCat(categoria);

  if (baseCat === "APPLE_WATCH") {
    if (p.includes("ULTRA")) return "Apple Watch Ultra";
    if (p.includes("SE")) return "Apple Watch SE";
    if (p.includes("S11") || p.includes("SERIES 11")) return "Apple Watch Series 11";
    if (p.includes("S10") || p.includes("SERIES 10")) return "Apple Watch Series 10";
    return "Apple Watch";
  }
  if (baseCat === "IPHONES") {
    const match = p.match(/IPHONE\s*(\d+)\s*(PRO\s*MAX|PRO|PLUS)?/i);
    if (match) return `iPhone ${match[1]}${match[2] ? " " + match[2].trim() : ""}`;
    return produto;
  }
  if (baseCat === "IPADS") {
    if (p.includes("MINI")) return "iPad Mini";
    // Separar por tamanho (11", 13", etc)
    const sizeMatch = p.match(/(\d{2})[""]/);
    const size = sizeMatch ? ` ${sizeMatch[1]}"` : "";
    if (p.includes("AIR")) return `iPad Air${size}`;
    if (p.includes("PRO")) return `iPad Pro${size}`;
    if (p.includes("A16")) return "iPad A16";
    return "iPad";
  }
  if (baseCat === "MAC_MINI") {
    return "Mac Mini";
  }
  if (baseCat === "MACBOOK") {
    if (p.includes("NEO")) return "MacBook Neo 13\"";
    if (p.includes("AIR") && (p.includes("15") || p.includes("15\""))) return "MacBook Air 15\"";
    if (p.includes("AIR")) return "MacBook Air 13\"";
    if (p.includes("PRO") && (p.includes("16") || p.includes("16\""))) return "MacBook Pro 16\"";
    if (p.includes("PRO") && (p.includes("14") || p.includes("14\""))) return "MacBook Pro 14\"";
    if (p.includes("PRO")) return "MacBook Pro";
    return "MacBook";
  }
  if (baseCat === "AIRPODS") {
    if (p.includes("PRO 3")) return "AirPods Pro 3";
    if (p.includes("PRO 2")) return "AirPods Pro 2";
    if (p.includes("PRO")) return "AirPods Pro";
    if (p.includes("MAX")) return "AirPods Max";
    if (p.includes("4")) return "AirPods 4";
    return "AirPods";
  }
  return produto;
}

export default function EstoquePage() {
  const { password, user, darkMode } = useAdmin();
  const userName = user?.nome ?? "sistema";
  const isAdmin = user?.role === "admin";
  const dm = darkMode;
  // Dark mode color helpers
  const bgCard = dm ? "bg-[#1C1C1E]" : "bg-white";
  const bgCardAlt = dm ? "bg-[#1A1A1A]" : "bg-[#F5F5F7]";
  const bgCardHover = dm ? "hover:bg-[#2C2C2E]" : "hover:bg-[#F5F5F7]";
  const borderCard = dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]";
  const borderCardAlt = dm ? "border-[#2C2C2E]" : "border-[#E8E8ED]";
  const borderLight = dm ? "border-[#2C2C2E]" : "border-[#F5F5F7]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const textMuted = dm ? "text-[#6E6E73]" : "text-[#C7C7CC]";
  const bgSection = dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]";
  const bgHoverBtn = dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F5F5F7]";
  const bgInline = dm ? "bg-[#2C2C2E]" : "bg-white";
  const [estoque, setEstoque] = useState<ProdutoEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const ESTOQUE_TABS = ["estoque", "seminovos", "pendencias", "acaminho", "reposicao", "esgotados", "acabando", "novo", "scan", "historico", "etiquetas"] as const;
  const [tab, setTab] = useTabParam<"estoque" | "seminovos" | "pendencias" | "acaminho" | "reposicao" | "esgotados" | "acabando" | "novo" | "scan" | "historico" | "etiquetas">("estoque", ESTOQUE_TABS);
  const [historicoLogs, setHistoricoLogs] = useState<{ id: string; created_at: string; usuario: string; acao: string; produto_nome: string; campo: string; valor_anterior: string; valor_novo: string; detalhes: string }[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [filterCat, setFilterCat] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [editingCusto, setEditingCusto] = useState<Record<string, string>>({});
  const [editingQnt, setEditingQnt] = useState<Record<string, string>>({});
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [editingNome, setEditingNome] = useState<Record<string, string>>({});
  const [editingField, setEditingField] = useState<Record<string, Record<string, string>>>({});
  const [variacoes, setVariacoes] = useState<{ cor: string; qnt: string }[]>([]);
  const [editingCat, setEditingCat] = useState<Record<string, string>>({});
  const [importingInitial, setImportingInitial] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [detailProduct, setDetailProduct] = useState<ProdutoEstoque | null>(null);
  const [entradaView, setEntradaView] = useState<{ data: string; fornecedor: string; produtos: ProdutoEstoque[] } | null>(null);
  const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
  const [novoFornecedorNome, setNovoFornecedorNome] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showDiagnostico, setShowDiagnostico] = useState(false);

  // Balance mode (seminovos)
  const [balanceMode, setBalanceMode] = useState(false);
  const [balanceSelected, setBalanceSelected] = useState<Set<string>>(new Set());
  const [balanceApplying, setBalanceApplying] = useState(false);

  // IMEI search
  const [imeiSearch, setImeiSearch] = useState("");
  const [imeiResult, setImeiResult] = useState<ImeiSearchResult | null>(null);
  const [imeiSearching, setImeiSearching] = useState(false);
  const [showImeiSearch, setShowImeiSearch] = useState(false);

  // Modal de etiqueta obrigatória ao mover
  const [etiquetaModal, setEtiquetaModal] = useState<{
    item: ProdutoEstoque;
    items?: { item: ProdutoEstoque; serial: string }[]; // para múltiplas unidades
    batchItems?: ProdutoEstoque[]; // para mover selecionados em lote
    precoVenda: number | null;
    printed: boolean;
    loading: boolean;
    precoCustom: string;
    tamanho: "pequena" | "media" | "grande";
  } | null>(null);

  // Seleção em lote na aba A Caminho
  const [selectedACaminho, setSelectedACaminho] = useState<Set<string>>(new Set());

  const handleImeiSearch = async () => {
    if (!imeiSearch.trim()) return;
    setImeiSearching(true);
    try {
      const res = await fetch(`/api/estoque?imei=${encodeURIComponent(imeiSearch.trim())}`, {
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      });
      if (res.ok) {
        const json = await res.json();
        setImeiResult(json);
      }
    } catch { /* ignore */ }
    setImeiSearching(false);
  };

  // Bulk select helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} produto(s) selecionado(s)?`)) return;
    setBulkDeleting(true);
    try {
      const ids = Array.from(selectedIds);
      const res = await fetch("/api/estoque", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        setEstoque((prev) => prev.filter((r) => !selectedIds.has(r.id)));
        setMsg(`${selectedIds.size} produto(s) excluído(s)`);
        setSelectedIds(new Set());
        setSelectMode(false);
      } else {
        const json = await res.json();
        setMsg("Erro: " + (json.error || "Falha ao excluir"));
      }
    } catch (err) { setMsg("Erro: " + String(err)); }
    setBulkDeleting(false);
  };

  // Categorias dinâmicas
  const [categoriasState, setCategoriasState] = useState<Categoria[]>(() => getCategoriasEstoque());
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ label: "", emoji: "\u{1F4E6}" });
  const [editingCatName, setEditingCatName] = useState("");
  const [editCatLabel, setEditCatLabel] = useState("");
  const CATEGORIAS = categoriasState.map((c) => c.key);
  const catLabelsFromState: Record<string, string> = {};
  categoriasState.forEach((c) => { catLabelsFromState[c.key] = c.label; });
  // Merge com CAT_LABELS estático para backwards compat
  const dynamicCatLabels: Record<string, string> = { ...CAT_LABELS, ...catLabelsFromState };

  function handleAddCategoriaEstoque() {
    if (!newCat.label.trim()) return;
    const key = newCat.label.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    if (!key) return;
    const updated = addCategoriaEstoque({ key, label: newCat.label.trim(), emoji: newCat.emoji, custom: true });
    setCategoriasState(updated);
    setNewCat({ label: "", emoji: "\u{1F4E6}" });
    setShowNewCat(false);
  }

  function handleRemoveCategoriaEstoque(key: string) {
    const cat = categoriasState.find((c) => c.key === key);
    if (!cat?.custom) return;
    if (!confirm(`Remover categoria "${cat.label}"?`)) return;
    const updated = removeCategoriaEstoque(key);
    setCategoriasState(updated);
    if (filterCat === key) setFilterCat("");
  }

  function handleEditCategoriaEstoque(key: string) {
    if (!editCatLabel.trim()) return;
    const updated = editCategoriaEstoque(key, { label: editCatLabel.trim() });
    setCategoriasState(updated);
    setEditingCatName("");
    setEditCatLabel("");
  }

  // Override de títulos de cards (modelo agrupador)
  const [cardTitleOverrides, setCardTitleOverrides] = useState(() => {
    if (typeof window === "undefined") return {} as Record<string, string>;
    try { return JSON.parse(localStorage.getItem("tigrao_card_title_overrides") || "{}") as Record<string, string>; } catch { return {} as Record<string, string>; }
  });
  const [editingCardTitle, setEditingCardTitle] = useState("");
  const [editCardTitleValue, setEditCardTitleValue] = useState("");
  function saveCardTitleOverride(originalTitle: string, newTitle: string) {
    const updated = { ...cardTitleOverrides, [originalTitle]: newTitle.trim() };
    if (!newTitle.trim() || newTitle.trim() === originalTitle) delete updated[originalTitle];
    setCardTitleOverrides(updated);
    localStorage.setItem("tigrao_card_title_overrides", JSON.stringify(updated));
    setEditingCardTitle("");
    setEditCardTitleValue("");
  }
  function getCardTitle(modelo: string): string {
    return cardTitleOverrides[modelo] || modelo;
  }

  // Drag-and-drop para reordenar
  const dragItemRef = useRef<string | null>(null);
  const dragOverRef = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  function handleEstoqueDragEnd() {
    if (!dragItemRef.current || !dragOverRef.current || dragItemRef.current === dragOverRef.current) {
      setDragId(null); return;
    }
    // Reordenar no state local
    setEstoque((prev) => {
      const arr = [...prev];
      const fromIdx = arr.findIndex((p) => p.id === dragItemRef.current);
      const toIdx = arr.findIndex((p) => p.id === dragOverRef.current);
      if (fromIdx === -1 || toIdx === -1) return arr;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      return arr;
    });
    setDragId(null);
    dragItemRef.current = null;
    dragOverRef.current = null;
  }

  // Drag-and-drop para cards (modelo inteiro)
  const dragCardRef = useRef<string | null>(null);
  const dragOverCardRef = useRef<string | null>(null);
  const [dragCardKey, setDragCardKey] = useState<string | null>(null);
  // Guardar ordem dos cards por categoria em localStorage
  function getCardOrder(cat: string): string[] {
    if (typeof window === "undefined") return [];
    try { const r = localStorage.getItem(`tigrao_estoque_card_order_${cat}`); return r ? JSON.parse(r) : []; } catch { return []; }
  }
  function saveCardOrder(cat: string, keys: string[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`tigrao_estoque_card_order_${cat}`, JSON.stringify(keys));
  }
  function sortByCardOrder(entries: [string, ProdutoEstoque[]][], cat: string): [string, ProdutoEstoque[]][] {
    const order = getCardOrder(cat);
    if (!order.length) return entries;
    return [...entries].sort(([a], [b]) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }
  function handleCardDragEnd(cat: string, modeloEntries: [string, ProdutoEstoque[]][]) {
    if (!dragCardRef.current || !dragOverCardRef.current || dragCardRef.current === dragOverCardRef.current) {
      setDragCardKey(null); return;
    }
    const keys = modeloEntries.map(([m]) => m);
    const fromIdx = keys.indexOf(dragCardRef.current);
    const toIdx = keys.indexOf(dragOverCardRef.current);
    if (fromIdx === -1 || toIdx === -1) { setDragCardKey(null); return; }
    keys.splice(fromIdx, 1);
    keys.splice(toIdx, 0, dragCardRef.current);
    saveCardOrder(cat, keys);
    // Forçar re-render
    setEstoque((prev) => [...prev]);
    setDragCardKey(null);
    dragCardRef.current = null;
    dragOverCardRef.current = null;
  }

  // Duplicar produto do estoque
  // Parsear nome do produto para extrair specs
  function parseProductSpecs(nome: string, cat: string) {
    const baseCat = getBaseCat(cat);
    const n = (nome || "").toUpperCase();
    const storageMatch = n.match(/(\d+(?:TB|GB))/);
    const telaMatch = n.match(/([\d.]+[""])/);
    const storage = storageMatch ? storageMatch[1] : "";
    const tela = telaMatch ? telaMatch[1].replace(/[""]/g, '"') : "";

    if (baseCat === "IPADS") {
      const modelo = n.includes("AIR") ? "AIR" : n.includes("PRO") ? "PRO" : n.includes("MINI") ? "MINI" : "IPAD";
      const conn = n.includes("CELL") ? "WIFI+CELL" : "WIFI";
      return { ipad_modelo: modelo, ipad_tela: tela || "11\"", ipad_storage: storage || "128GB", ipad_conn: conn };
    }
    if (baseCat === "IPHONES") {
      const numMatch = n.match(/IPHONE\s*(\d+)/);
      const modelo = numMatch ? numMatch[1] : "16";
      const linha = n.includes(" PRO MAX") ? "PRO MAX" : n.includes(" PRO") ? "PRO" : n.includes(" PLUS") ? "PLUS" : n.includes(" E") ? "E" : "";
      return { ip_modelo: modelo, ip_linha: linha, ip_storage: storage || "128GB" };
    }
    if (baseCat === "MACBOOK") {
      const tipo = n.includes("PRO") ? "PRO" : "AIR";
      const chipMatch = n.match(/(M\d+(?:\s*PRO|\s*MAX)?)/i);
      const ramMatch = n.match(/(\d+GB)\s/);
      return { mb_modelo: tipo, mb_tela: tela || "13\"", mb_chip: chipMatch ? chipMatch[1] : "M4", mb_ram: ramMatch ? ramMatch[1] : "16GB", mb_storage: storage || "256GB" };
    }
    if (baseCat === "MAC_MINI") {
      const chipMatch = n.match(/(M\d+(?:\s*PRO)?)/i);
      const ramMatch = n.match(/(\d+GB)\s/);
      return { mm_chip: chipMatch ? chipMatch[1] : "M4", mm_ram: ramMatch ? ramMatch[1] : "16GB", mm_storage: storage || "256GB" };
    }
    if (baseCat === "APPLE_WATCH") {
      const modeloMatch = n.match(/(SERIES\s*\d+|SE|ULTRA\s*\d*)/i);
      const tamMatch = n.match(/(\d+mm)/i);
      const conn = n.includes("CELL") ? "GPS+CELL" : "GPS";
      return { aw_modelo: modeloMatch ? modeloMatch[1] : "SERIES 10", aw_tamanho: tamMatch ? tamMatch[1] : "42mm", aw_conn: conn };
    }
    if (baseCat === "AIRPODS") {
      return { air_modelo: n.trim() || "AIRPODS 4" };
    }
    return {};
  }

  // Duplicar produto: abre form pré-preenchido com mesmas cores
  function handleDuplicarProduto(prodItems: ProdutoEstoque[]) {
    const p = prodItems[0];
    const cat = p.categoria || "IPHONES";
    // Primeira cor vai no form principal, demais vão em variações
    const firstItem = prodItems[0];
    const restItems = prodItems.slice(1);
    setForm((f) => ({
      ...f,
      produto: p.produto,
      categoria: cat,
      custo_unitario: String(p.custo_unitario || ""),
      tipo: p.tipo || "NOVO",
      fornecedor: p.fornecedor || "",
      cor: firstItem.cor || "",
      qnt: String(firstItem.qnt || 1),
      imei: "",
      observacao: "",
    }));
    // Parsear nome do produto para preencher specs corretamente
    const parsedSpecs = parseProductSpecs(p.produto, cat);
    setSpec((s) => ({ ...s, ...parsedSpecs }));
    // Demais cores vão como variações
    setVariacoes(
      restItems.map((item) => ({ cor: item.cor || "", qnt: String(item.qnt || 1) }))
    );
    setTab("novo");
    setMsg("Produto duplicado! Altere memoria/custo e clique Adicionar.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const [form, setForm] = useState({
    produto: "", categoria: "IPHONES", qnt: "1", custo_unitario: "",
    status: "EM ESTOQUE", cor: "", observacao: "", tipo: "NOVO",
    bateria: "", cliente: "", fornecedor: "", imei: "", serial_no: "",
  });

  // Campos estruturados por categoria
  const [spec, setSpec] = useState({
    // IPHONES
    ip_modelo: "16", ip_linha: "", ip_storage: "128GB", ip_origem: "",
    // MACBOOK
    mb_modelo: "AIR", mb_tela: "13\"", mb_chip: "M4", mb_nucleos: "", mb_ram: "16GB", mb_storage: "256GB",
    // MAC_MINI
    mm_chip: "M4", mm_ram: "16GB", mm_storage: "256GB",
    // IPADS
    ipad_modelo: "AIR", ipad_tela: "11\"", ipad_storage: "128GB", ipad_conn: "WIFI",
    // APPLE_WATCH
    aw_modelo: "SERIES 11", aw_tamanho: "42mm", aw_conn: "GPS", aw_pulseira: "",
    // AIRPODS
    air_modelo: "AIRPODS 4",
    // SEMINOVOS — subtipo define quais campos mostrar
    semi_subtipo: "IPHONES",
  });
  const setS = (field: string, value: string) => setSpec((s) => ({ ...s, [field]: value }));

  // Estado para modo A_CAMINHO (pedido fornecedor unificado)
  const BANCOS: Banco[] = ["ITAU", "INFINITE", "MERCADO_PAGO", "ESPECIE"];
  type BancoValores = Record<Banco, string>;
  const emptyBancoValores = (): BancoValores => ({ ITAU: "", INFINITE: "", MERCADO_PAGO: "", ESPECIE: "" });
  const [pedidoProdutos, setPedidoProdutos] = useState<ProdutoRowState[]>([createEmptyProdutoRow()]);
  const [bancoValores, setBancoValores] = useState<BancoValores>(emptyBancoValores());
  const [descricaoGasto, setDescricaoGasto] = useState("");
  const totalPagamento = BANCOS.reduce((s, b) => s + (parseFloat(bancoValores[b]) || 0), 0);

  // Gerar nome do produto automaticamente a partir dos campos estruturados
  const buildProdutoName = (cat: string): string => {
    const effectiveCat = cat === "SEMINOVOS" ? spec.semi_subtipo : cat;
    const c = form.cor ? ` ${form.cor}` : "";
    switch (getBaseCat(effectiveCat)) {
      case "IPHONES": {
        const linha = spec.ip_linha ? ` ${spec.ip_linha}` : "";
        const origem = spec.ip_origem ? ` ${spec.ip_origem.split(" ")[0]}` : "";
        return `IPHONE ${spec.ip_modelo}${linha} ${spec.ip_storage}${c}${origem}`.toUpperCase();
      }
      case "MAC_MINI":
        return `MAC MINI ${spec.mm_chip} ${spec.mm_ram} ${spec.mm_storage}`.toUpperCase();
      case "MACBOOK": {
        const tipo = spec.mb_modelo === "AIR" ? "MACBOOK AIR" : "MACBOOK PRO";
        return `${tipo} ${spec.mb_chip} ${spec.mb_tela} ${spec.mb_ram} ${spec.mb_storage}${c}`.toUpperCase();
      }
      case "IPADS": {
        const modelo = spec.ipad_modelo === "IPAD" ? "IPAD" : `IPAD ${spec.ipad_modelo}`;
        const conn = spec.ipad_conn === "WIFI+CELL" ? " WIFI+CELLULAR" : "";
        return `${modelo} ${spec.ipad_tela} ${spec.ipad_storage}${conn}${c}`.toUpperCase();
      }
      case "APPLE_WATCH": {
        const conn = spec.aw_conn === "GPS+CELL" ? " GPS+CELLULAR" : " GPS";
        const pulseira = spec.aw_pulseira ? ` ${spec.aw_pulseira}` : "";
        return `APPLE WATCH ${spec.aw_modelo} ${spec.aw_tamanho}${conn}${c}${pulseira}`.toUpperCase();
      }
      case "AIRPODS":
        return `${spec.air_modelo}${c}`.toUpperCase();
      default:
        return "";
    }
  };

  const formBaseCat = form.categoria === "SEMINOVOS" ? getBaseCat(spec.semi_subtipo) : getBaseCat(form.categoria);
  const hasStructuredFields = STRUCTURED_CATS_LIST.includes(formBaseCat) || form.categoria === "SEMINOVOS";

  // Cores efetivas: para iPhones, filtra por modelo selecionado
  const coresEfetivas = formBaseCat === "IPHONES" ? getIphoneCores(spec.ip_modelo) : CORES_POR_CATEGORIA[formBaseCat];

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) } });
      if (res.ok) { const json = await res.json(); setEstoque(json.data ?? []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  const fetchFornecedores = useCallback(async () => {
    try {
      const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") } });
      if (res.ok) { const json = await res.json(); setFornecedores(json.data ?? []); }
    } catch { /* ignore */ }
  }, [password]);

  useEffect(() => { fetchEstoque(); fetchFornecedores(); }, [fetchEstoque, fetchFornecedores]);

  const handleAddFornecedor = async () => {
    if (!novoFornecedorNome.trim()) return;
    const res = await fetch("/api/fornecedores", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(user?.nome || "sistema") },
      body: JSON.stringify({ nome: novoFornecedorNome }),
    });
    const json = await res.json();
    if (json.ok && json.data) {
      setFornecedores((prev) => [...prev, json.data].sort((a, b) => a.nome.localeCompare(b.nome)));
      set("fornecedor", json.data.nome);
      setNovoFornecedorNome("");
      setShowNovoFornecedor(false);
      setMsg("Fornecedor cadastrado!");
    } else {
      setMsg("Erro: " + (json.error || "Falha ao cadastrar"));
    }
  };

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const apiPatch = async (id: string, fields: Record<string, unknown>) => {
    const res = await fetch("/api/estoque", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      body: JSON.stringify({ id, ...fields }),
    });
    return res;
  };

  const handleApplyBalance = async () => {
    if (balanceSelected.size === 0) return;
    const selectedItems = estoque.filter((p) => balanceSelected.has(p.id));
    const totalCusto = selectedItems.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
    const totalQnt = selectedItems.reduce((s, p) => s + p.qnt, 0);
    if (totalQnt === 0) return;
    const avgCusto = Math.round(totalCusto / totalQnt);
    if (!confirm(`Aplicar custo médio de ${fmt(avgCusto)} a ${balanceSelected.size} item(ns)?`)) return;
    setBalanceApplying(true);
    try {
      for (const item of selectedItems) {
        await apiPatch(item.id, { custo_unitario: avgCusto });
      }
      setEstoque((prev) => prev.map((p) => balanceSelected.has(p.id) ? { ...p, custo_unitario: avgCusto } : p));
      setMsg(`Balanço aplicado: ${balanceSelected.size} item(ns) com custo ${fmt(avgCusto)}`);
      setBalanceSelected(new Set());
      setBalanceMode(false);
    } catch {
      setMsg("Erro ao aplicar balanço");
    } finally {
      setBalanceApplying(false);
    }
  };

  const handleUpdateQnt = async (item: ProdutoEstoque, newQnt: number) => {
    const newStatus = newQnt === 0 ? "ESGOTADO" : item.status === "ESGOTADO" ? "EM ESTOQUE" : item.status;
    await apiPatch(item.id, { qnt: newQnt, status: newStatus });
    setEstoque((prev) => prev.map((p) => p.id === item.id ? { ...p, qnt: newQnt, status: newStatus } : p));
    const e = { ...editingQnt }; delete e[item.id]; setEditingQnt(e);
  };

  const handleSaveCusto = async (item: ProdutoEstoque) => {
    const val = parseFloat((editingCusto[item.id] ?? "").replace(",", "."));
    if (isNaN(val)) return;
    await apiPatch(item.id, { custo_unitario: val });
    setEstoque((prev) => prev.map((p) => p.id === item.id ? { ...p, custo_unitario: val } : p));
    const e = { ...editingCusto }; delete e[item.id]; setEditingCusto(e);
  };

  // Editar preço em massa (todas as unidades de um grupo)
  const [bulkCustoKey, setBulkCustoKey] = useState<string>("");
  const [bulkCustoVal, setBulkCustoVal] = useState<string>("");
  const handleBulkCusto = async (items: ProdutoEstoque[]) => {
    const val = parseFloat(bulkCustoVal.replace(",", "."));
    if (isNaN(val) || val <= 0) return;
    const ids = items.map(p => p.id);
    await Promise.all(ids.map(id => apiPatch(id, { custo_unitario: val })));
    setEstoque(prev => prev.map(p => ids.includes(p.id) ? { ...p, custo_unitario: val } : p));
    setBulkCustoKey(""); setBulkCustoVal("");
    setMsg(`Preco atualizado para ${items.length} unidades: R$ ${val.toLocaleString("pt-BR")}`);
  };

  // Edição genérica de campo inline
  const startEditField = (id: string, field: string, value: string) => {
    setEditingField((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: value } }));
  };
  const cancelEditField = (id: string, field: string) => {
    setEditingField((prev) => {
      const copy = { ...prev };
      if (copy[id]) { delete copy[id][field]; if (Object.keys(copy[id]).length === 0) delete copy[id]; }
      return copy;
    });
  };
  const saveField = async (id: string, field: string) => {
    const val = editingField[id]?.[field] ?? "";
    const dbVal = field === "bateria" ? (val ? parseInt(val) : null) : (val || null);
    await apiPatch(id, { [field]: dbVal });
    setEstoque((prev) => prev.map((p) => p.id === id ? { ...p, [field]: dbVal } : p));
    cancelEditField(id, field);
  };
  const getEditVal = (id: string, field: string) => editingField[id]?.[field];
  const isEditingField = (id: string, field: string) => editingField[id]?.[field] !== undefined;

  const handleSaveNome = async (ids: string[], newNome: string) => {
    if (!newNome.trim()) return;
    for (const id of ids) {
      await apiPatch(id, { produto: newNome.trim() });
    }
    setEstoque((prev) => prev.map((p) => ids.includes(p.id) ? { ...p, produto: newNome.trim() } : p));
    const key = ids[0];
    const e = { ...editingNome }; delete e[key]; setEditingNome(e);
    setMsg(`Nome atualizado para "${newNome.trim()}"`);
  };

  // handleDuplicar referência legada — usa handleDuplicarProduto
  const handleDuplicar = (p: ProdutoEstoque) => handleDuplicarProduto([p]);

  // Abre modal de etiqueta obrigatória antes de mover
  const handleMoverParaEstoque = (item: ProdutoEstoque) => {
    const catsSemSerial = ["MAC_MINI", "ACESSORIOS", "OUTROS"];
    if (!item.serial_no && !catsSemSerial.includes(item.categoria)) {
      setMsg(`Preencha o numero de serie de "${item.produto}" antes de mover para estoque.`);
      return;
    }
    // Etiqueta interna = preço de custo (custo_unitario)
    setEtiquetaModal({ item, precoVenda: null, printed: false, loading: false, precoCustom: "", tamanho: "media" });
  };

  // Abre modal para múltiplas unidades com seriais
  const handleMoverMultiploComEtiqueta = (item: ProdutoEstoque, serials: string[]) => {
    const items = serials.map((s, i) => ({
      item: { ...item, serial_no: s, id: i === 0 ? item.id : `new-${i}` },
      serial: s,
    }));
    setEtiquetaModal({ item, items, precoVenda: null, printed: false, loading: false, precoCustom: "", tamanho: "media" });
  };

  // Mover selecionados em lote
  const handleMoverSelecionados = () => {
    const catsSemSerial = ["MAC_MINI", "ACESSORIOS", "OUTROS"];
    const itens = aCaminho.filter(p => selectedACaminho.has(p.id));
    if (itens.length === 0) { setMsg("Selecione pelo menos 1 produto"); return; }
    // Verificar se todos têm serial (exceto categorias sem serial)
    const semSerial = itens.filter(p => !p.serial_no && !catsSemSerial.includes(p.categoria));
    if (semSerial.length > 0) {
      setMsg(`Preencha o serial de: ${semSerial.map(p => p.produto).join(", ")}`);
      return;
    }
    setEtiquetaModal({ item: itens[0], batchItems: itens, precoVenda: null, printed: false, loading: false, precoCustom: "", tamanho: "media" });
  };

  // Imprimir etiqueta do modal — formato Brother QL-820NWB 62mm continuous tape
  const handlePrintEtiquetaModal = () => {
    if (!etiquetaModal) return;
    const { item, items, batchItems } = etiquetaModal;

    const produtosParaImprimir = batchItems
      ? batchItems
      : items
        ? items.map(i => i.item)
        : [item];

    const total = produtosParaImprimir.length;
    // Up to 3 per row on the 62mm tape; wrap to next row if more
    const perRow = Math.min(total, 3);
    // Each QR cell gets equal percentage width
    const cellWidth = Math.floor(100 / perRow);

    const win = window.open("", "_blank", "width=800,height=400");
    if (!win) return;

    // Build rows of up to 3 QR codes each
    let rowsHtml = "";
    for (let i = 0; i < total; i += 3) {
      const rowItems = produtosParaImprimir.slice(i, i + 3);
      const cellsHtml = rowItems.map((p, idx) => {
        const serial = p.serial_no || "";
        const imei = p.imei || "";
        const qrData = serial || imei || p.id;
        const globalIdx = i + idx;
        return `<td style="width:${cellWidth}%;text-align:center;vertical-align:top;padding:0">
          <canvas id="qr-${globalIdx}" data-qr="${String(qrData).replace(/"/g, "&quot;")}"></canvas>
          <div style="font-size:4pt;font-family:monospace;color:#333;margin-top:0;line-height:1">${serial || imei || ""}</div>
        </td>`;
      }).join("");
      rowsHtml += `<tr>${cellsHtml}</tr>`;
    }

    win.document.write(`<!DOCTYPE html><html><head>
      <title>QR - ${item.produto}</title>
      <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
      <style>
        *{margin:0;padding:0;box-sizing:border-box}
        html,body{margin:0;padding:0;width:100%;height:100%}
        body{font-family:Arial,sans-serif}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        td{padding:0}
        canvas{display:block;margin:0 auto;width:90%;height:auto}
        @page{size:62mm 25mm;margin:0}
        @media print{
          html,body{width:62mm;margin:0;padding:0;overflow:hidden}
          table{width:100%}
          canvas{width:90%;height:auto}
        }
      </style></head><body>
      <table>${rowsHtml}</table>
      <script>
        document.querySelectorAll('canvas[data-qr]').forEach(function(canvas) {
          var data = canvas.getAttribute('data-qr');
          var qr = qrcode(0, 'M');
          qr.addData(data);
          qr.make();
          var size = 200;
          canvas.width = size; canvas.height = size;
          var ctx = canvas.getContext('2d');
          var cells = qr.getModuleCount();
          var cellSize = size / cells;
          ctx.fillStyle = '#fff'; ctx.fillRect(0,0,size,size);
          ctx.fillStyle = '#000';
          for(var r=0;r<cells;r++) for(var c=0;c<cells;c++)
            if(qr.isDark(r,c)) ctx.fillRect(c*cellSize,r*cellSize,cellSize+0.5,cellSize+0.5);
        });
        window.onload=function(){setTimeout(function(){window.print();},300)};
      <\/script></body></html>`);
    win.document.close();

    setEtiquetaModal(prev => prev ? { ...prev, printed: true } : null);
  };

  // Confirmar movimentação após etiqueta impressa
  const handleConfirmarMover = async () => {
    if (!etiquetaModal) return;
    const { item, items, batchItems } = etiquetaModal;

    if (batchItems && batchItems.length > 0) {
      // Lote de produtos selecionados
      for (const p of batchItems) {
        const novoTipo = p.tipo === "PENDENCIA" ? "SEMINOVO" : "NOVO";
        await apiPatch(p.id, { tipo: novoTipo, status: "EM ESTOQUE" });
      }
      setMsg(`${batchItems.length} produtos movidos para estoque com etiquetas!`);
      setSelectedACaminho(new Set());
      fetchEstoque();
    } else if (items && items.length > 1) {
      // Múltiplas unidades (mesmo produto, seriais diferentes)
      const novoTipo = item.tipo === "PENDENCIA" ? "SEMINOVO" : "NOVO";
      await apiPatch(item.id, { serial_no: items[0].serial, qnt: 1, tipo: novoTipo, status: "EM ESTOQUE" });
      for (let i = 1; i < items.length; i++) {
        await fetch("/api/estoque", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
          body: JSON.stringify({
            produto: item.produto, categoria: item.categoria, qnt: 1,
            custo_unitario: item.custo_unitario, cor: item.cor, fornecedor: item.fornecedor,
            serial_no: items[i].serial, tipo: novoTipo, status: "EM ESTOQUE",
          }),
        });
      }
      setMsg(`${items.length} unidades movidas para estoque com etiquetas!`);
      fetchEstoque();
    } else {
      const novoTipo = item.tipo === "PENDENCIA" ? "SEMINOVO" : "NOVO";
      await apiPatch(item.id, { tipo: novoTipo, status: "EM ESTOQUE" });
      setEstoque((prev) => prev.map((p) => p.id === item.id ? { ...p, tipo: novoTipo, status: "EM ESTOQUE" } : p));
      setMsg(`${item.produto} movido para estoque com etiqueta impressa!`);
    }
    setEtiquetaModal(null);
  };

  const handleSubmitMulti = async () => {
    if (pedidoProdutos.length === 0) { setMsg("Adicione pelo menos 1 produto"); return; }

    const status = form.tipo === "A_CAMINHO" ? "A CAMINHO" : "EM ESTOQUE";
    const tipo = form.tipo;
    let successCount = 0;
    let errorMsg = "";
    const mergeMessages: string[] = [];

    for (const p of pedidoProdutos) {
      const nome = (p.produto || (STRUCTURED_CATS_LIST.includes(getBaseCat(p.categoria)) ? buildProdutoNameFromSpec(p.categoria, p.spec, p.cor) : "")).toUpperCase();
      if (!nome) continue;
      const res = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({
          produto: nome,
          categoria: p.categoria,
          qnt: parseInt(p.qnt) || 1,
          custo_unitario: parseFloat(p.custo_unitario) || 0,
          status,
          cor: p.cor || null,
          tipo,
          fornecedor: p.fornecedor || null,
          imei: p.imei || null,
          serial_no: p.serial_no || null,
          data_entrada: hojeBR(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        successCount++;
        if (json.merged && json.mergeDetails) {
          mergeMessages.push(`🔄 ${p.produto || nome}: ${json.mergeDetails.log}`);
        }
      } else { errorMsg = json.error; }
    }

    if (successCount > 0) {
      const mergeInfo = mergeMessages.length > 0 ? ` | ${mergeMessages.join(" | ")}` : "";
      setMsg(`${successCount} produto(s) adicionados${status === "A CAMINHO" ? " como A Caminho" : " ao estoque"}!${mergeInfo}${errorMsg ? ` (${errorMsg})` : ""}`);
      setPedidoProdutos([createEmptyProdutoRow()]);
      fetchEstoque();
      setFilterCat(pedidoProdutos[0]?.categoria || "");
    } else {
      setMsg("Erro: " + (errorMsg || "Nenhum produto adicionado"));
    }
  };

  const handleSubmit = async (keepForm = false) => {
    const nomeProduto = form.produto || (hasStructuredFields ? buildProdutoName(form.categoria) : "");
    if (!nomeProduto) { setMsg("Preencha o nome do produto"); return; }
    const res = await fetch("/api/estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      body: JSON.stringify({
        produto: nomeProduto, categoria: form.categoria,
        qnt: parseInt(form.qnt) || 0, custo_unitario: parseFloat(form.custo_unitario) || 0,
        status: form.tipo === "A_CAMINHO" ? "A CAMINHO" : form.tipo === "PENDENCIA" ? "PENDENTE" : "EM ESTOQUE",
        cor: form.cor || null, observacao: form.observacao || null,
        tipo: form.tipo, bateria: form.bateria ? parseInt(form.bateria) : null,
        cliente: form.cliente || null, fornecedor: form.fornecedor || null,
        imei: form.imei || null, serial_no: form.serial_no || null,
        data_entrada: hojeBR(),
      }),
    });
    const json = await res.json();
    if (json.ok) {
      // Se houve merge (preço médio), mostrar mensagem detalhada
      if (json.merged && json.mergeDetails) {
        const d = json.mergeDetails;
        setMsg(`🔄 Produto mesclado! ${d.log}`);
      } else {
        // Verificar se produto existe no mostruário
        try {
          const lojaRes = await fetch("/api/loja?format=grouped");
          const lojaData = await lojaRes.json();
          const lojaProdutos = lojaData.produtos || [];
          const prodNome = form.produto.toLowerCase();
          const existeNoMostruario = lojaProdutos.some((p: { nome: string }) => prodNome.includes(p.nome.toLowerCase()) || p.nome.toLowerCase().includes(prodNome));
          if (!existeNoMostruario) {
            setMsg(`Produto adicionado! 💡 "${form.produto}" nao esta no mostruario. Deseja publicar no site? Va em Mostruario > + Novo Produto`);
          } else {
            setMsg("Produto adicionado!");
          }
        } catch {
          setMsg("Produto adicionado!");
        }
      }
      // Criar variações de cor adicionais
      const validVariacoes = variacoes.filter((v) => v.cor.trim());
      const varResults: string[] = [];
      for (const v of validVariacoes) {
        try {
          const vRes = await fetch("/api/estoque", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
            body: JSON.stringify({
              produto: nomeProduto, categoria: form.categoria,
              qnt: parseInt(v.qnt) || 1, custo_unitario: parseFloat(form.custo_unitario) || 0,
              status: form.tipo === "A_CAMINHO" ? "A CAMINHO" : form.tipo === "PENDENCIA" ? "PENDENTE" : "EM ESTOQUE",
              cor: v.cor.trim(), observacao: form.observacao || null,
              tipo: form.tipo, fornecedor: form.fornecedor || null,
            }),
          });
          const vJson = await vRes.json();
          if (!vJson.ok) {
            varResults.push(`❌ ${v.cor}: ${vJson.error}`);
          } else if (vJson.merged) {
            varResults.push(`🔄 ${v.cor}: mesclado (ja existia)`);
          } else {
            varResults.push(`✅ ${v.cor}: criado`);
          }
        } catch (e) {
          varResults.push(`❌ ${v.cor}: ${String(e)}`);
        }
      }
      if (validVariacoes.length > 0) {
        const errors = varResults.filter((r) => r.startsWith("❌"));
        if (errors.length > 0) {
          setMsg(`Produto adicionado. Cores: ${varResults.join(" | ")}`);
        } else {
          setMsg(`Produto adicionado com ${validVariacoes.length + 1} variacoes de cor! (${varResults.join(" | ")})`);
        }
      }

      if (keepForm) {
        // Duplicar: mantém specs, cor, fornecedor, custo — limpa só IMEI, Serial e quantidade
        setForm((f) => ({ ...f, imei: "", serial_no: "", qnt: "1" }));
        setMsg("Produto adicionado! Preencha IMEI/Serial do proximo.");
      } else {
        setForm((f) => ({ ...f, produto: "", qnt: "1", custo_unitario: "", cor: "", observacao: "", bateria: "", cliente: "", fornecedor: "", imei: "", serial_no: "" }));
        setSpec({
          ip_modelo: "16", ip_linha: "", ip_storage: "128GB", ip_origem: "",
          mb_modelo: "AIR", mb_tela: "13\"", mb_chip: "M4", mb_nucleos: "", mb_ram: "16GB", mb_storage: "256GB",
          mm_chip: "M4", mm_ram: "16GB", mm_storage: "256GB",
          ipad_modelo: "AIR", ipad_tela: "11\"", ipad_storage: "128GB", ipad_conn: "WIFI",
          aw_modelo: "SERIES 11", aw_tamanho: "42mm", aw_conn: "GPS", aw_pulseira: "",
          air_modelo: "AIRPODS 4",
          semi_subtipo: "IPHONES",
        });
        setTab("estoque");
      }
      setVariacoes([]);
      fetchEstoque();
      setFilterCat(form.categoria);
    } else { setMsg("Erro: " + json.error); }
  };

  // Adicionar variação de cor (mesmo produto, cor diferente)
  const handleAddVariacao = async () => {
    if (!form.cor) { setMsg("Preencha a cor da variacao"); return; }
    const nomeProduto = form.produto || (hasStructuredFields ? buildProdutoName(form.categoria) : "");
    if (!nomeProduto) { setMsg("Preencha o produto primeiro"); return; }
    const res = await fetch("/api/estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
      body: JSON.stringify({
        produto: nomeProduto, categoria: form.categoria,
        qnt: parseInt(form.qnt) || 1, custo_unitario: parseFloat(form.custo_unitario) || 0,
        status: form.tipo === "A_CAMINHO" ? "A CAMINHO" : form.tipo === "PENDENCIA" ? "PENDENTE" : "EM ESTOQUE",
        cor: form.cor, observacao: form.observacao || null,
        tipo: form.tipo, bateria: form.bateria ? parseInt(form.bateria) : null,
        cliente: form.cliente || null, fornecedor: form.fornecedor || null,
        imei: form.imei || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg(`Variacao "${form.cor}" adicionada!`);
      // Limpa só cor, qtd e imei para adicionar outra variação rapidamente
      setForm((f) => ({ ...f, cor: "", qnt: "1", imei: "" }));
      fetchEstoque();
    } else { setMsg("Erro: " + json.error); }
  };

  const handleImportInitial = async () => {
    setImportingInitial(true); setMsg("");
    try {
      const res = await fetch("/estoque-initial.json");
      const rows = await res.json();
      const importRes = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({ action: "import", rows }),
      });
      const json = await importRes.json();
      if (json.ok) { setMsg(`${json.imported} produtos importados!`); fetchEstoque(); }
      else setMsg("Erro: " + json.error);
    } catch (err) { setMsg("Erro: " + String(err)); }
    setImportingInitial(false);
  };

  // Filtrar por tipo
  const novos = estoque.filter((p) => (p.tipo ?? "NOVO") === "NOVO");
  const seminovos = estoque.filter((p) => p.tipo === "SEMINOVO");
  const emEstoque = novos; // Aba Estoque = só lacrados (NOVO)
  const pendencias = estoque.filter((p) => p.tipo === "PENDENCIA");
  const aCaminho = estoque.filter((p) => p.tipo === "A_CAMINHO");
  const acabando = novos.filter((p) => p.qnt === 1);

  // Esgotados: qnt=0 em NOVO. Marcar se já está a caminho
  const produtosACaminho = new Set(aCaminho.map((p) => p.produto.toUpperCase()));
  const esgotados = novos.filter((p) => p.qnt === 0);

  const currentList =
    tab === "seminovos" ? seminovos :
    tab === "acaminho" ? aCaminho :
    tab === "pendencias" ? pendencias :
    tab === "esgotados" ? esgotados :
    tab === "acabando" ? acabando :
    emEstoque;

  const filtered = currentList.filter((p) => {
    if (filterCat && p.categoria !== filterCat) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!p.produto.toLowerCase().includes(s) && !(p.cor?.toLowerCase().includes(s)) && !(p.imei?.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  // Agrupar por categoria, depois por modelo base
  const byCat: Record<string, Record<string, ProdutoEstoque[]>> = {};
  filtered.forEach((p) => {
    if (!byCat[p.categoria]) byCat[p.categoria] = {};
    const modelo = getModeloBase(p.produto, p.categoria);
    if (!byCat[p.categoria][modelo]) byCat[p.categoria][modelo] = [];
    byCat[p.categoria][modelo].push(p);
  });

  // KPIs
  const totalProdutos = emEstoque.length;
  const totalUnidades = emEstoque.reduce((s, p) => s + p.qnt, 0);
  const valorEstoque = emEstoque.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
  const valorSeminovos = seminovos.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
  const valorACaminho = aCaminho.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);

  const inputCls = `w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const qntCls = `w-20 px-3 py-2 rounded-xl border text-sm text-center shrink-0 focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"}`;
  const labelCls = `text-xs font-semibold uppercase tracking-wider mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;

  const isPendenciasTab = tab === "pendencias";
  const isACaminhoTab = tab === "acaminho";
  const isEditableItemTab = isPendenciasTab || isACaminhoTab;

  // renderProductRow removido — agora renderizado inline com agrupamento por produto/cor

  return (
    <div className="space-y-6">
      {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? (dm ? "bg-red-900/30 text-red-400" : "bg-red-50 text-red-700") : (dm ? "bg-green-900/30 text-green-400" : "bg-green-50 text-green-700")}`}>{msg}</div>}
      {ocrLoading && <div className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold shadow-lg animate-pulse">Lendo serial da imagem...</div>}

      {/* Modal Etiqueta Obrigatória */}
      {etiquetaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => {}}>
          <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"} rounded-2xl border shadow-2xl w-full max-w-lg mx-4 overflow-hidden`} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: dm ? "#3A3A3C" : "#E5E5EA" }}>
              <div>
                <h3 className={`text-lg font-bold ${textPrimary}`}>🏷️ Imprimir Etiqueta</h3>
                <p className={`text-xs ${textSecondary}`}>Obrigatorio antes de mover para estoque</p>
              </div>
              <button onClick={() => setEtiquetaModal(null)} className={`p-2 rounded-lg ${bgHoverBtn} ${textSecondary}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 space-y-4">
              {/* Produto(s) info */}
              {etiquetaModal.batchItems ? (
                <div className={`rounded-xl p-4 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"} space-y-1 max-h-48 overflow-y-auto`}>
                  <p className={`font-bold text-sm ${textPrimary} mb-2`}>{etiquetaModal.batchItems.length} produtos — QR codes em grade</p>
                  {etiquetaModal.batchItems.map(p => (
                    <div key={p.id} className={`flex justify-between text-xs ${textSecondary} py-0.5`}>
                      <span className="truncate flex-1">{p.produto} {p.cor ? `(${p.cor})` : ""}</span>
                      <span className="font-mono ml-2 text-[10px]">{p.serial_no || p.imei || "—"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`rounded-xl p-4 ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
                  <p className={`font-bold ${textPrimary}`}>{etiquetaModal.item.produto}</p>
                  <div className={`flex gap-3 mt-1 text-xs ${textSecondary}`}>
                    {etiquetaModal.item.cor && <span>{etiquetaModal.item.cor}</span>}
                    {etiquetaModal.item.serial_no && <span>SN: {etiquetaModal.item.serial_no}</span>}
                    {etiquetaModal.items && <span>{etiquetaModal.items.length} unidades</span>}
                  </div>
                </div>
              )}

              {/* Info impressora */}
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Brother QL-820NWB — {etiquetaModal.batchItems ? "QR codes em grade pra recortar" : "Etiqueta QR 62mm"}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t flex gap-3" style={{ borderColor: dm ? "#3A3A3C" : "#E5E5EA" }}>
              {!etiquetaModal.printed ? (
                <>
                  <button onClick={() => setEtiquetaModal(null)} className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirmarMover}
                    className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Mover sem etiqueta
                  </button>
                  <button
                    onClick={handlePrintEtiquetaModal}
                    disabled={etiquetaModal.loading}
                    className="flex-1 px-4 py-3 rounded-xl font-semibold text-sm bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Imprimir Etiqueta
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handlePrintEtiquetaModal} className={`flex-1 px-4 py-3 rounded-xl font-semibold text-sm ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} flex items-center justify-center gap-1`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Reimprimir
                  </button>
                  <button
                    onClick={handleConfirmarMover}
                    className="flex-[2] px-4 py-3 rounded-xl font-semibold text-sm bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Confirmar — Mover para Estoque
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IMEI Search */}
      <div className="flex gap-2 items-center">
        <button
          onClick={() => { setShowImeiSearch(!showImeiSearch); if (showImeiSearch) { setImeiResult(null); setImeiSearch(""); } }}
          className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center gap-2 ${showImeiSearch ? "bg-[#E8740E] text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-[#E8740E] hover:text-[#E8740E]`}`}
        >
          IMEI
        </button>
        {showImeiSearch && (
          <>
            <input
              value={imeiSearch}
              onChange={(e) => setImeiSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleImeiSearch()}
              placeholder="Buscar por IMEI..."
              className={`flex-1 px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:border-[#E8740E] transition-colors ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder:text-[#6E6E73]" : "border-[#D2D2D7]"}`}
              autoFocus
            />
            <button
              onClick={handleImeiSearch}
              disabled={imeiSearching}
              className="px-4 py-2.5 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {imeiSearching ? "..." : "Buscar"}
            </button>
          </>
        )}
      </div>

      {/* IMEI Search Results */}
      {imeiResult && (
        <div className={`${bgCard} border border-[#E8740E] rounded-2xl p-5 shadow-sm space-y-4`}>
          <div className="flex items-center justify-between">
            <h3 className={`font-bold ${textPrimary}`}>Resultado IMEI: {imeiSearch}</h3>
            <button onClick={() => { setImeiResult(null); setImeiSearch(""); setShowImeiSearch(false); }} className="text-[#86868B] hover:text-red-500 text-sm">Fechar</button>
          </div>

          {imeiResult.estoque.length === 0 && imeiResult.vendas.length === 0 ? (
            <p className={`${textSecondary} text-sm`}>Nenhum registro encontrado para este IMEI.</p>
          ) : (
            <div className="space-y-3">
              {/* Estoque entries */}
              {imeiResult.estoque.map((item) => (
                <div key={item.id} className={`flex items-center gap-3 p-3 ${bgSection} rounded-xl`}>
                  <span className="text-lg">📦</span>
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${textPrimary}`}>{item.produto} {item.cor || ""}</p>
                    <p className={`text-xs ${textSecondary}`}>
                      {item.fornecedor ? `Comprado de ${item.fornecedor}` : "Fornecedor n/a"}
                      {item.data_compra ? ` em ${item.data_compra}` : ""}
                      {item.custo_unitario ? ` por R$ ${Math.round(item.custo_unitario).toLocaleString("pt-BR")}` : ""}
                    </p>
                    <p className={`text-xs ${textSecondary}`}>IMEI: {item.imei} | Status: {item.status} | Tipo: {item.tipo}</p>
                  </div>
                </div>
              ))}

              {/* Vendas entries */}
              {imeiResult.vendas.map((venda) => (
                <div key={venda.id} className={`flex items-center gap-3 p-3 ${dm ? "bg-green-900/20" : "bg-green-50"} rounded-xl`}>
                  <span className="text-lg">💰</span>
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${textPrimary}`}>{venda.produto}</p>
                    <p className={`text-xs ${textSecondary}`}>
                      Vendido para {venda.cliente || "N/A"}
                      {venda.data ? ` em ${venda.data}` : ""}
                      {venda.preco_vendido ? ` por R$ ${Math.round(venda.preco_vendido).toLocaleString("pt-BR")}` : ""}
                    </p>
                    <p className={`text-xs ${textSecondary}`}>IMEI: {venda.imei}</p>
                  </div>
                </div>
              ))}

              {/* Timeline summary */}
              {(imeiResult.estoque.length > 0 || imeiResult.vendas.length > 0) && (
                <div className="p-3 bg-gradient-to-r from-[#1E1208] to-[#2A1A0F] rounded-xl">
                  <p className="text-xs text-white/60 mb-1">Rastreamento</p>
                  <p className="text-white text-sm">
                    {imeiResult.estoque.map((e) =>
                      `${e.fornecedor || "?"} ${e.data_compra ? `(${e.data_compra})` : ""} → R$ ${Math.round(e.custo_unitario || 0).toLocaleString("pt-BR")}`
                    ).join(" | ")}
                    {imeiResult.estoque.length > 0 && imeiResult.vendas.length > 0 && " → "}
                    {imeiResult.vendas.map((v) =>
                      `Vendido para ${v.cliente || "?"} ${v.data ? `(${v.data})` : ""} → R$ ${Math.round(v.preco_vendido || 0).toLocaleString("pt-BR")}`
                    ).join(" | ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {estoque.length === 0 && !loading && (
        <div className={`${bgCard} border ${borderCard} rounded-2xl p-8 text-center shadow-sm`}>
          <p className={`${textSecondary} mb-4`}>Estoque vazio. Importar produtos da planilha ESTOQUE 2026?</p>
          <button onClick={handleImportInitial} disabled={importingInitial} className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {importingInitial ? "Importando..." : "Importar Estoque da Planilha"}
          </button>
        </div>
      )}

      {/* KPIs — Estilo Apple clean */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Produtos", value: totalProdutos, sub: "SKUs cadastrados" },
          { label: "Unidades", value: totalUnidades, sub: "em estoque" },
          { label: "Valor Total", value: fmt(valorEstoque), sub: "investido" },
          { label: "Seminovos", value: seminovos.length, sub: fmt(valorSeminovos) },
          { label: "Pendencias", value: pendencias.length, sub: "aguardando" },
          { label: "A Caminho", value: aCaminho.length, sub: fmt(valorACaminho) },
        ].map((kpi) => (
          <div key={kpi.label} className={`${bgCard} border ${borderCard} rounded-2xl p-4 hover:shadow-md transition-shadow`}>
            <p className={`${textSecondary} text-[11px] font-medium tracking-wide`}>{kpi.label}</p>
            <p className={`text-[22px] font-bold mt-1 ${textPrimary}`}>{kpi.value}</p>
            <p className={`${textMuted} text-[11px] mt-0.5`}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Diagnóstico de valores */}
      <div>
        <button onClick={() => setShowDiagnostico(!showDiagnostico)} className={`text-[11px] font-medium ${textMuted} hover:text-[#E8740E] transition-colors`}>
          {showDiagnostico ? "▼ Fechar diagnóstico" : "▶ Diagnóstico de valores"}
        </button>
        {showDiagnostico && (() => {
          // Valor TOTAL de tudo no banco (todos os tipos)
          const valorTudo = estoque.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
          const valorPendencias = pendencias.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
          // Sem custo
          const semCusto = estoque.filter((p) => !p.custo_unitario && p.qnt > 0);
          // Por categoria
          const porCat: Record<string, { qnt: number; valor: number; items: number }> = {};
          estoque.forEach((p) => {
            if (!porCat[p.categoria]) porCat[p.categoria] = { qnt: 0, valor: 0, items: 0 };
            porCat[p.categoria].qnt += p.qnt;
            porCat[p.categoria].valor += p.qnt * (p.custo_unitario || 0);
            porCat[p.categoria].items++;
          });
          // Por tipo
          const porTipo: Record<string, { qnt: number; valor: number; items: number }> = {};
          estoque.forEach((p) => {
            const t = p.tipo || "NOVO";
            if (!porTipo[t]) porTipo[t] = { qnt: 0, valor: 0, items: 0 };
            porTipo[t].qnt += p.qnt;
            porTipo[t].valor += p.qnt * (p.custo_unitario || 0);
            porTipo[t].items++;
          });
          return (
            <div className={`mt-3 ${bgCard} border ${borderCard} rounded-2xl p-4 space-y-4 text-xs`}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className={`p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
                  <p className={`${textMuted} text-[10px] font-bold`}>DASHBOARD (Novos+Seminovos)</p>
                  <p className={`text-lg font-bold ${textPrimary}`}>{fmt(valorEstoque)}</p>
                  <p className={`${textMuted}`}>{emEstoque.length} SKUs, {totalUnidades} un.</p>
                </div>
                <div className={`p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
                  <p className={`${textMuted} text-[10px] font-bold`}>TUDO (incluindo pendências/a caminho)</p>
                  <p className={`text-lg font-bold text-[#E8740E]`}>{fmt(valorTudo)}</p>
                  <p className={`${textMuted}`}>{estoque.length} SKUs, {estoque.reduce((s, p) => s + p.qnt, 0)} un.</p>
                </div>
                <div className={`p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
                  <p className={`${textMuted} text-[10px] font-bold`}>PENDÊNCIAS</p>
                  <p className={`text-lg font-bold ${textPrimary}`}>{fmt(valorPendencias)}</p>
                  <p className={`${textMuted}`}>{pendencias.length} SKUs</p>
                </div>
                <div className={`p-3 rounded-xl ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
                  <p className={`${textMuted} text-[10px] font-bold`}>A CAMINHO</p>
                  <p className={`text-lg font-bold ${textPrimary}`}>{fmt(valorACaminho)}</p>
                  <p className={`${textMuted}`}>{aCaminho.length} SKUs</p>
                </div>
              </div>

              <div>
                <p className={`${textSecondary} font-bold text-[10px] uppercase mb-2`}>Por Tipo</p>
                <table className={`w-full text-xs ${dm ? "text-[#CCC]" : ""}`}>
                  <thead><tr className={`${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}><th className="text-left px-2 py-1">Tipo</th><th className="text-right px-2 py-1">SKUs</th><th className="text-right px-2 py-1">Unidades</th><th className="text-right px-2 py-1">Valor</th></tr></thead>
                  <tbody>{Object.entries(porTipo).sort((a, b) => b[1].valor - a[1].valor).map(([tipo, d]) => (
                    <tr key={tipo} className={`border-b ${borderLight}`}><td className="px-2 py-1 font-medium">{tipo}</td><td className="text-right px-2 py-1">{d.items}</td><td className="text-right px-2 py-1">{d.qnt}</td><td className="text-right px-2 py-1 font-semibold">{fmt(d.valor)}</td></tr>
                  ))}</tbody>
                </table>
              </div>

              <div>
                <p className={`${textSecondary} font-bold text-[10px] uppercase mb-2`}>Por Categoria</p>
                <table className={`w-full text-xs ${dm ? "text-[#CCC]" : ""}`}>
                  <thead><tr className={`${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}><th className="text-left px-2 py-1">Categoria</th><th className="text-right px-2 py-1">SKUs</th><th className="text-right px-2 py-1">Unidades</th><th className="text-right px-2 py-1">Valor</th></tr></thead>
                  <tbody>{Object.entries(porCat).sort((a, b) => b[1].valor - a[1].valor).map(([cat, d]) => (
                    <tr key={cat} className={`border-b ${borderLight}`}><td className="px-2 py-1 font-medium">{dynamicCatLabels[cat] || cat}</td><td className="text-right px-2 py-1">{d.items}</td><td className="text-right px-2 py-1">{d.qnt}</td><td className="text-right px-2 py-1 font-semibold">{fmt(d.valor)}</td></tr>
                  ))}</tbody>
                </table>
              </div>

              {semCusto.length > 0 && (
                <div>
                  <p className={`text-[10px] font-bold uppercase mb-2 text-red-500`}>⚠ Produtos SEM custo unitário (qnt {'>'} 0)</p>
                  <table className={`w-full text-xs ${dm ? "text-[#CCC]" : ""}`}>
                    <thead><tr className={`${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}><th className="text-left px-2 py-1">Produto</th><th className="text-left px-2 py-1">Cor</th><th className="text-right px-2 py-1">Qnt</th><th className="text-left px-2 py-1">Tipo</th><th className="text-left px-2 py-1">Cat</th></tr></thead>
                    <tbody>{semCusto.map((p) => (
                      <tr key={p.id} className={`border-b ${borderLight}`}><td className="px-2 py-1">{p.produto}</td><td className="px-2 py-1">{p.cor || "—"}</td><td className="text-right px-2 py-1">{p.qnt}</td><td className="px-2 py-1">{p.tipo}</td><td className="px-2 py-1">{p.categoria}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Tabs — Segmented control Apple style */}
      {tab !== "etiquetas" && (
      <div className="space-y-3">
        <div className={`inline-flex items-center gap-1 p-1 rounded-xl overflow-x-auto max-w-full ${dm ? "bg-[#2C2C2E]" : "bg-[#F2F2F7]"}`}>
          {([
            { key: "estoque", label: "Lacrados", count: emEstoque.length },
            { key: "acaminho", label: "Produtos a Caminho", count: aCaminho.length },
            { key: "pendencias", label: "Pendências", count: pendencias.length },
            { key: "reposicao", label: "Reposição", count: esgotados.length + acabando.length },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={`px-3.5 py-2 rounded-lg text-[12px] font-semibold transition-all ${
                tab === t.key
                  ? `${dm ? "bg-[#3A3A3C]" : "bg-white shadow-sm"} ${textPrimary}`
                  : `${textSecondary} hover:${textPrimary}`
              }`}>
              {t.label}
              {t.count > 0 && <span className={`ml-1.5 text-[10px] ${tab === t.key ? "text-[#E8740E]" : textMuted}`}>{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-2 items-center">
          <button onClick={() => setTab("scan")} className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${tab === "scan" ? "bg-[#E8740E] text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-[#E8740E]`}`}>
            Scan
          </button>
          {isAdmin && <button onClick={() => setTab("novo" as typeof tab)} className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${tab === "novo" ? "bg-[#E8740E] text-white" : "bg-[#E8740E]/10 text-[#E8740E] border border-[#E8740E]/20 hover:bg-[#E8740E] hover:text-white"}`}>
            + Adicionar
          </button>}
          <button onClick={() => setTab("historico" as typeof tab)} className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${tab === "historico" ? "bg-[#E8740E] text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-[#E8740E]`}`}>
            Historico
          </button>
          {isAdmin && !["novo", "scan", "historico", "etiquetas"].includes(tab) && (
            <button
              onClick={() => { setSelectMode(!selectMode); if (selectMode) setSelectedIds(new Set()); }}
              className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${selectMode ? "bg-red-500 text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-red-500 hover:text-red-500`}`}
            >
              {selectMode ? "Cancelar" : "Selecionar"}
            </button>
          )}
          {isAdmin && tab === "seminovos" && !selectMode && (
            <button
              onClick={() => { setBalanceMode(!balanceMode); if (balanceMode) setBalanceSelected(new Set()); }}
              className={`px-4 py-2 rounded-xl text-[12px] font-semibold transition-all ${balanceMode ? "bg-blue-500 text-white" : `${bgCard} border ${borderCard} ${textSecondary} hover:border-blue-500 hover:text-blue-500`}`}
            >
              {balanceMode ? "Cancelar Balanço" : "Balancear Preços"}
            </button>
          )}

          <div className="flex-1" />

          {/* Filtros inline */}
          {!["novo", "scan", "historico"].includes(tab) && (<>
            {filterCat && tab === "estoque" ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setFilterCat("")} className={`px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 ${dm ? "bg-[#3A3A3C] text-[#F5F5F7] hover:bg-[#E8740E]" : "bg-[#E5E5EA] text-[#1D1D1F] hover:bg-[#E8740E] hover:text-white"} transition-colors`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                  Voltar
                </button>
                <span className={`text-sm font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{dynamicCatLabels[filterCat] || filterCat}</span>
              </div>
            ) : (
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className={`px-2.5 py-1.5 rounded-lg border text-[11px] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#E5E5EA]"}`}>
                <option value="">Todas categorias</option>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{dynamicCatLabels[c] || c}</option>)}
              </select>
            )}
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className={`px-3 py-1.5 rounded-lg border text-[11px] w-44 focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7] placeholder:text-[#6E6E73]" : "bg-white border-[#E5E5EA]"}`} />
            <button onClick={() => setShowNewCat(!showNewCat)} className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-dashed ${dm ? "border-[#3A3A3C] text-[#98989D]" : "border-[#D2D2D7] text-[#86868B]"} hover:border-[#E8740E] hover:text-[#E8740E] transition-colors`}>
              + Categoria
            </button>
          </>)}
        </div>
      </div>
      )}

      {/* Form criar categoria */}
      {tab !== "etiquetas" && showNewCat && (
        <div className={`${bgCard} border border-[#E8740E] rounded-2xl p-4 shadow-sm space-y-3`}>
          <h3 className={`font-semibold text-sm ${textPrimary}`}>Nova Categoria de Estoque</h3>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <p className={`text-[10px] font-bold ${textSecondary} uppercase mb-1`}>Emoji</p>
              <div className="flex gap-1 flex-wrap max-w-xs">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setNewCat({ ...newCat, emoji: e })}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                      newCat.emoji === e ? "bg-[#E8740E] text-white" : `${bgSection} ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#E8E8ED]"}`
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className={`text-[10px] font-bold ${textSecondary} uppercase mb-1`}>Nome da Categoria</p>
              <input
                value={newCat.label}
                onChange={(e) => setNewCat({ ...newCat, label: e.target.value })}
                placeholder="Ex: Samsung, Cabos, etc."
                className={`w-full px-3 py-2 border rounded-lg text-sm ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "border-[#D2D2D7]"}`}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategoriaEstoque()}
              />
            </div>
            <button onClick={handleAddCategoriaEstoque} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors">Criar</button>
            <button onClick={() => setShowNewCat(false)} className={`px-4 py-2 rounded-xl border ${borderCard} ${textSecondary} text-sm ${bgHoverBtn} transition-colors`}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ===== ABA REPOSIÇÃO ===== */}
      {tab === "reposicao" ? (() => {
        const stripOrigemRepo = (nome: string) => nome
          .replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ)\s*(\([^)]*\))?/gi, "")
          .replace(/[-–]\s*(CHIP\s+(F[ÍI]SICO\s*\+\s*)?)?E-?SIM/gi, "")
          .replace(/[-–]\s*CHIP\s+VIRTUAL/gi, "")
          .replace(/\s*\(\d+C\s*CPU\/\d+C\s*GPU\)\s*/gi, " ")
          .replace(/\s{2,}/g, " ").trim();

        // Extrair modelo base (sem cor): "IPHONE 17 PRO MAX 256GB SILVER" → "IPHONE 17 PRO MAX 256GB"
        const extractBase = (nome: string) => {
          const m = nome.match(/^(.+?\d+\s*(?:GB|TB))/i);
          return m ? m[1].trim() : nome;
        };
        // Extrair cor do nome
        const extractCor = (nome: string) => {
          const base = extractBase(nome);
          const rest = nome.slice(base.length).trim();
          return rest || null;
        };
        // Extrair linha: "IPHONE 17 PRO MAX 256GB" → "LINHA 17", "MACBOOK AIR M4 13"" → "CHIP M4"
        const extractLinha = (nome: string, cat: string) => {
          if (cat === "IPHONE") { const m = nome.match(/IPHONE\s+(\d+)/i); return m ? `LINHA ${m[1]}` : "OUTROS"; }
          if (cat === "IPAD") { const m = nome.match(/IPAD\s+(PRO|AIR|MINI)?/i); return m?.[1] ? `iPad ${m[1]}` : "iPad"; }
          if (cat === "MACBOOK" || cat === "MAC_MINI") { const m = nome.match(/M(\d+)/i); return m ? `CHIP M${m[1]}` : "OUTROS"; }
          if (cat === "APPLE_WATCH") { const m = nome.match(/SERIES\s+(\d+)|ULTRA\s*(\d*)|SE\s*(\d*)/i); return m ? (m[1] ? `SERIES ${m[1]}` : m[2] !== undefined ? "ULTRA" : "SE") : "OUTROS"; }
          return "OUTROS";
        };

        // Filtrar itens para reposição: qnt < estoque_minimo (só itens com mínimo definido)
        const reposicaoItems = novos.filter(p => {
          const min = p.estoque_minimo;
          if (typeof min === "number" && min > 0) return p.qnt < min;
          return false; // sem mínimo definido = não aparece na reposição
        });

        // Estrutura: cat → linha → modelo_base → [{cor, qnt, esgotado}]
        type CorInfo = { cor: string | null; qnt: number; jaCaminho: boolean };
        type ModeloInfo = { base: string; cores: CorInfo[]; totalQnt: number };
        const catOrder = ["IPHONE", "IPAD", "MACBOOK", "MAC_MINI", "APPLE_WATCH", "AIRPODS", "ACESSORIOS"];
        const catLabels: Record<string, string> = { IPHONE: "IPHONES", IPAD: "IPADS", MACBOOK: "MACBOOKS", MAC_MINI: "MAC MINI", APPLE_WATCH: "APPLE WATCH", AIRPODS: "AIRPODS", ACESSORIOS: "ACESSÓRIOS" };

        // Agrupar: cat → modelo_base → [{cor, qnt}]
        const byCatModel: Record<string, Record<string, CorInfo[]>> = {};
        for (const p of reposicaoItems) {
          const cat = p.categoria || "OUTROS";
          const nome = stripOrigemRepo(p.produto);
          const base = extractBase(nome);
          const cor = extractCor(nome) || p.cor || null;
          if (!byCatModel[cat]) byCatModel[cat] = {};
          if (!byCatModel[cat][base]) byCatModel[cat][base] = [];
          const existing = byCatModel[cat][base].find(c => c.cor === cor);
          if (existing) { existing.qnt += p.qnt; }
          else { byCatModel[cat][base].push({ cor, qnt: p.qnt, jaCaminho: produtosACaminho.has(nome.toUpperCase()) }); }
        }

        const sortedCats = Object.keys(byCatModel).sort((a, b) => {
          const ia = catOrder.indexOf(a); const ib = catOrder.indexOf(b);
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });

        // Build copy text
        const buildCopyText = () => {
          const lines: string[] = ["*COMPRAR PRODUTOS*", ""];
          for (const cat of sortedCats) {
            lines.push(`*${catLabels[cat] || cat}*`);
            const modelos = Object.entries(byCatModel[cat]).sort(([a], [b]) => a.localeCompare(b));
            for (const [base, cores] of modelos) {
              lines.push(`\n${base}`);
              for (const c of cores) {
                const label = c.qnt === 0 ? `COMPRAR ${c.cor || "—"}` : `${c.qnt}x ${c.cor || "—"}`;
                lines.push(`${c.qnt === 0 ? "🔴" : "🟡"} ${label}${c.jaCaminho ? " ✈️" : ""}`);
              }
            }
            lines.push("");
          }
          return lines.join("\n");
        };

        return (
          <div className={`${bgCard} border ${borderCard} rounded-2xl p-6 shadow-sm space-y-4`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-[18px] font-bold ${textPrimary}`}>Comprar Produtos</h2>
                <p className={`text-[13px] mt-1 ${textSecondary}`}>Produtos abaixo do estoque mínimo — clique na categoria</p>
              </div>
              <button onClick={() => { navigator.clipboard.writeText(buildCopyText()); setMsg("Lista copiada!"); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors">
                📋 Copiar Lista
              </button>
            </div>
            {sortedCats.length === 0 ? (
              <p className={`text-sm ${textSecondary} text-center py-8`}>Estoque OK! Nenhum produto abaixo do mínimo.</p>
            ) : (
              sortedCats.map(cat => {
                const modelos = Object.entries(byCatModel[cat]).sort(([a], [b]) => a.localeCompare(b));
                const totalItems = modelos.reduce((s, [, cores]) => s + cores.length, 0);
                const isOpen = expandedProducts.has(`repo_${cat}`);
                return (
                  <div key={cat} className={`border rounded-xl overflow-hidden ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
                    <button
                      onClick={() => setExpandedProducts(prev => { const s = new Set(prev); s.has(`repo_${cat}`) ? s.delete(`repo_${cat}`) : s.add(`repo_${cat}`); return s; })}
                      className={`w-full flex items-center justify-between px-5 py-4 font-bold text-[15px] transition-colors ${isOpen ? (dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]") : (dm ? "hover:bg-[#1C1C1E]" : "hover:bg-[#FAFAFA]")}`}
                      style={{ color: isOpen ? "var(--at-accent, #E8740E)" : undefined }}
                    >
                      <span className={`flex items-center gap-2 ${!isOpen ? textPrimary : ""}`}>
                        <span className="text-[12px]">{isOpen ? "▼" : "▶"}</span>
                        {catLabels[cat] || cat}
                      </span>
                      <span className={`text-[12px] font-normal ${textSecondary}`}>{totalItems} itens</span>
                    </button>
                    {isOpen && (
                      <div className={`px-5 pb-4 pt-2 space-y-4 ${dm ? "bg-[#1C1C1E]" : "bg-white"}`}>
                        {modelos.map(([base, cores]) => (
                          <div key={base}>
                            <p className={`text-[13px] font-bold ${textPrimary} mb-1`}>{base}</p>
                            <div className="pl-3 space-y-0.5">
                              {cores.sort((a, b) => (b.qnt - a.qnt) || (a.cor || "").localeCompare(b.cor || "")).map((c, i) => (
                                <p key={i} className={`text-[13px] ${textPrimary}`}>
                                  {c.qnt === 0 ? "🔴" : "🟡"} {c.qnt === 0 ? "COMPRAR" : `${c.qnt}x`} {c.cor || "—"}
                                  {c.jaCaminho && <span className="text-[10px] font-bold text-blue-500 ml-2">A CAMINHO</span>}
                                </p>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })()

      : tab === "novo" ? (
        /* FORMULÁRIO */
        <div className={`${bgCard} border ${borderCard} rounded-2xl p-8 shadow-sm space-y-8`}>
          <div>
            <h2 className={`text-[20px] font-bold ${textPrimary}`}>Adicionar Produto</h2>
            <p className={`text-[13px] mt-1 ${textSecondary}`}>Preencha os dados do produto para cadastrar no estoque</p>
          </div>

          {/* Row 1: Categoria + Tipo */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className={labelCls}>Categoria</p><select value={form.categoria} onChange={(e) => { set("categoria", e.target.value); set("produto", ""); }} className={inputCls}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{dynamicCatLabels[c] || c}</option>)}
            </select></div>
            {form.categoria === "SEMINOVOS" ? (
              <div><p className={labelCls}>Tipo de Seminovo</p><select value={spec.semi_subtipo} onChange={(e) => setS("semi_subtipo", e.target.value)} className={inputCls}>
                <option value="IPHONES">iPhone Seminovo</option>
                <option value="MACBOOK">MacBook Seminovo</option>
                <option value="IPADS">iPad Seminovo</option>
                <option value="APPLE_WATCH">Apple Watch Seminovo</option>
                <option value="ACESSORIOS">Acessórios Seminovo</option>
              </select></div>
            ) : (
              <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
                <option value="NOVO">Novo (Lacrado)</option>
                <option value="SEMINOVO">Seminovo</option>
                <option value="A_CAMINHO">A Caminho</option>
              </select></div>
            )}
          </div>

          {/* MODO MULTI-PRODUTO (NOVO e A_CAMINHO) */}
          {(form.tipo === "NOVO" || form.tipo === "A_CAMINHO") && form.categoria !== "SEMINOVOS" ? (
            <div className="space-y-4">
              {form.tipo === "A_CAMINHO" && (
                <div className={`p-3 rounded-xl border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FFF8F0] border-[#E8740E]/20"}`}>
                  <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>
                    IMEI e serial sao opcionais — preencha quando o produto chegar. Para pagamento, use <strong>Gastos &rarr; FORNECEDOR</strong>.
                  </p>
                </div>
              )}

              {/* Cards de produtos */}
              <div className={`p-4 rounded-xl border-2 border-dashed ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"} space-y-4`}>
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>Produtos</p>
                  {pedidoProdutos.length > 0 && (
                    <p className={`text-xs font-semibold ${textSecondary}`}>
                      {pedidoProdutos.length} produto(s) | Total: <span className="text-[#E8740E]">{fmt(pedidoProdutos.reduce((s, p) => s + (parseFloat(p.custo_unitario) || 0) * (parseInt(p.qnt) || 1), 0))}</span>
                    </p>
                  )}
                </div>
                {pedidoProdutos.map((row, i) => (
                  <ProdutoSpecFields
                    key={i}
                    row={row}
                    onChange={(updated) => {
                      const nv = [...pedidoProdutos];
                      nv[i] = updated;
                      setPedidoProdutos(nv);
                    }}
                    onRemove={() => pedidoProdutos.length > 1 ? setPedidoProdutos(pedidoProdutos.filter((_, j) => j !== i)) : undefined}
                    onDuplicate={() => {
                      const clone = { ...row, spec: { ...row.spec }, imei: "", serial_no: "" };
                      const nv = [...pedidoProdutos];
                      nv.splice(i + 1, 0, clone);
                      setPedidoProdutos(nv);
                    }}
                    fornecedores={fornecedores}
                    inputCls={inputCls}
                    labelCls={labelCls}
                    darkMode={dm}
                    index={i}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setPedidoProdutos([...pedidoProdutos, createEmptyProdutoRow()])}
                  className={`w-full py-3 rounded-xl border-2 border-dashed ${dm ? "border-[#3A3A3C] text-[#636366] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"} text-sm font-semibold transition-colors`}
                >
                  + Adicionar Produto
                </button>
              </div>

              <button onClick={handleSubmitMulti} className="w-full py-4 rounded-2xl bg-[#E8740E] text-white text-[15px] font-semibold hover:bg-[#D06A0D] transition-colors shadow-sm active:scale-[0.99]">
                {form.tipo === "A_CAMINHO" ? `Adicionar ${pedidoProdutos.length} como A Caminho` : `Adicionar ${pedidoProdutos.length} ao Estoque`}
              </button>
            </div>
          ) : (
          <>
          {/* Campos específicos por categoria (SEMINOVO) */}
          {formBaseCat === "IPHONES" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Modelo</p><select value={spec.ip_modelo} onChange={(e) => { setS("ip_modelo", e.target.value); set("cor", ""); }} className={inputCls}>
                {["11", "11 PRO", "11 PRO MAX", "12", "12 PRO", "12 PRO MAX", "13", "13 PRO", "13 PRO MAX", "14", "14 PLUS", "14 PRO", "14 PRO MAX", "15", "15 PLUS", "15 PRO", "15 PRO MAX", "16", "16 PLUS", "16 PRO", "16 PRO MAX", "16E", "17", "17 AIR", "17 PRO", "17 PRO MAX"].map((m) => <option key={m} value={m}>{`iPhone ${m}`}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.ip_storage} onChange={(e) => setS("ip_storage", e.target.value)} className={inputCls}>
                {["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
              <div><p className={labelCls}>Origem</p><select value={spec.ip_origem} onChange={(e) => setS("ip_origem", e.target.value)} className={inputCls}>
                <option value="">— Opcional —</option>
                {IPHONE_ORIGENS.map((o) => <option key={o}>{o}</option>)}
              </select></div>
            </div>
          )}

          {formBaseCat === "MACBOOK" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Modelo</p><select value={["AIR", "PRO"].includes(spec.mb_modelo) ? spec.mb_modelo : "__custom__"} onChange={(e) => setS("mb_modelo", e.target.value === "__custom__" ? "" : e.target.value)} className={inputCls}>
                <option value="AIR">MacBook Air</option>
                <option value="PRO">MacBook Pro</option>
                <option value="__custom__">Outro (digitar)</option>
              </select>
              {!["AIR", "PRO"].includes(spec.mb_modelo) && spec.mb_modelo !== "AIR" && (
                <input value={spec.mb_modelo} onChange={(e) => setS("mb_modelo", e.target.value)} placeholder="Digite o modelo" className={`${inputCls} mt-2`} />
              )}</div>
              <div><p className={labelCls}>Tela</p><select value={spec.mb_tela} onChange={(e) => setS("mb_tela", e.target.value)} className={inputCls}>
                {spec.mb_modelo === "AIR"
                  ? [<option key='13"' value='13"'>13 polegadas</option>, <option key='15"' value='15"'>15 polegadas</option>]
                  : [<option key='14"' value='14"'>14 polegadas</option>, <option key='16"' value='16"'>16 polegadas</option>]
                }
              </select></div>
              <div><p className={labelCls}>Chip</p><select value={spec.mb_chip} onChange={(e) => setS("mb_chip", e.target.value)} className={inputCls}>
                {["M1", "M2", "M3", "M4", "M4 PRO", "M4 MAX", "M5", "M5 PRO"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
              <div><p className={labelCls}>Núcleos</p><select value={spec.mb_nucleos} onChange={(e) => setS("mb_nucleos", e.target.value)} className={inputCls}>
                <option value="" disabled>— Selecionar —</option>
                {["8C CPU/7C GPU", "8C CPU/8C GPU", "8C CPU/10C GPU", "10C CPU/8C GPU", "10C CPU/10C GPU", "12C CPU/16C GPU", "12C CPU/19C GPU", "14C CPU/20C GPU", "14C CPU/32C GPU", "16C CPU/40C GPU"].map((n) => <option key={n}>{n}</option>)}
              </select></div>
              <div><p className={labelCls}>RAM</p><select value={spec.mb_ram} onChange={(e) => setS("mb_ram", e.target.value)} className={inputCls}>
                {["8GB", "16GB", "18GB", "24GB", "32GB", "36GB", "48GB", "64GB", "128GB"].map((r) => <option key={r}>{r}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.mb_storage} onChange={(e) => setS("mb_storage", e.target.value)} className={inputCls}>
                {["256GB", "512GB", "1TB", "2TB", "4TB", "8TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
            </div>
          )}

          {formBaseCat === "MAC_MINI" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Chip</p><select value={spec.mm_chip} onChange={(e) => setS("mm_chip", e.target.value)} className={inputCls}>
                {["M1", "M2", "M2 PRO", "M4", "M4 PRO", "M5", "M5 PRO"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
              <div><p className={labelCls}>RAM</p><select value={spec.mm_ram} onChange={(e) => setS("mm_ram", e.target.value)} className={inputCls}>
                {["8GB", "16GB", "24GB", "32GB", "48GB", "64GB"].map((r) => <option key={r}>{r}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.mm_storage} onChange={(e) => setS("mm_storage", e.target.value)} className={inputCls}>
                {["256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
            </div>
          )}

          {formBaseCat === "IPADS" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Modelo</p><select value={["IPAD", "MINI", "AIR", "PRO"].includes(spec.ipad_modelo) ? spec.ipad_modelo : "__custom__"} onChange={(e) => setS("ipad_modelo", e.target.value === "__custom__" ? "" : e.target.value)} className={inputCls}>
                <option value="IPAD">iPad</option>
                <option value="MINI">iPad Mini</option>
                <option value="AIR">iPad Air</option>
                <option value="PRO">iPad Pro</option>
                <option value="__custom__">Outro (digitar)</option>
              </select>
              {!["IPAD", "MINI", "AIR", "PRO"].includes(spec.ipad_modelo) && spec.ipad_modelo !== "IPAD" && (
                <input value={spec.ipad_modelo} onChange={(e) => setS("ipad_modelo", e.target.value)} placeholder="Digite o modelo" className={`${inputCls} mt-2`} />
              )}</div>
              <div><p className={labelCls}>Tela</p><select value={spec.ipad_tela} onChange={(e) => setS("ipad_tela", e.target.value)} className={inputCls}>
                {['8.3"', '10.9"', '11"', '13"'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.ipad_storage} onChange={(e) => setS("ipad_storage", e.target.value)} className={inputCls}>
                {["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
              <div><p className={labelCls}>Conectividade</p><select value={spec.ipad_conn} onChange={(e) => setS("ipad_conn", e.target.value)} className={inputCls}>
                <option value="WIFI">WiFi</option>
                <option value="WIFI+CELL">WiFi + Cellular (5G)</option>
              </select></div>
            </div>
          )}

          {formBaseCat === "APPLE_WATCH" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Modelo</p><select value={["SE 2", "SE 3", "SERIES 11", "ULTRA 3", "ULTRA 3 MILANES"].includes(spec.aw_modelo) ? spec.aw_modelo : "__custom__"} onChange={(e) => setS("aw_modelo", e.target.value === "__custom__" ? "" : e.target.value)} className={inputCls}>
                {["SE 2", "SE 3", "SERIES 11", "ULTRA 3", "ULTRA 3 MILANES"].map((m) => <option key={m}>{m}</option>)}
                <option value="__custom__">Outro (digitar)</option>
              </select>
              {!["SE 2", "SE 3", "SERIES 11", "ULTRA 3", "ULTRA 3 MILANES"].includes(spec.aw_modelo) && spec.aw_modelo !== "SE 2" && (
                <input value={spec.aw_modelo === "__custom__" ? "" : spec.aw_modelo} onChange={(e) => setS("aw_modelo", e.target.value)} placeholder="Digite o modelo" className={`${inputCls} mt-2`} />
              )}</div>
              <div><p className={labelCls}>Tamanho</p><select value={spec.aw_tamanho} onChange={(e) => setS("aw_tamanho", e.target.value)} className={inputCls}>
                {["40mm", "42mm", "44mm", "45mm", "46mm", "49mm"].map((t) => <option key={t}>{t}</option>)}
              </select></div>
              <div><p className={labelCls}>Conectividade</p><select value={spec.aw_conn} onChange={(e) => setS("aw_conn", e.target.value)} className={inputCls}>
                <option value="GPS">GPS</option>
                <option value="GPS+CELL">GPS + Cellular</option>
              </select></div>
              <div><p className={labelCls}>Pulseira</p><select value={spec.aw_pulseira} onChange={(e) => setS("aw_pulseira", e.target.value)} className={inputCls}>
                <option value="" disabled>— Selecionar —</option>
                {WATCH_PULSEIRAS.map((p) => <option key={p}>{p}</option>)}
              </select></div>
            </div>
          )}

          {formBaseCat === "AIRPODS" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Modelo</p><select value={["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX", "AIRPODS MAX 2"].includes(spec.air_modelo) ? spec.air_modelo : "__custom__"} onChange={(e) => setS("air_modelo", e.target.value === "__custom__" ? "" : e.target.value)} className={inputCls}>
                {["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX", "AIRPODS MAX 2"].map((m) => <option key={m}>{m}</option>)}
                <option value="__custom__">Outro (digitar)</option>
              </select>
              {!["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX", "AIRPODS MAX 2"].includes(spec.air_modelo) && spec.air_modelo !== "AIRPODS 4" && (
                <input value={spec.air_modelo} onChange={(e) => setS("air_modelo", e.target.value)} placeholder="Digite o modelo" className={`${inputCls} mt-2`} />
              )}</div>
            </div>
          )}

          {/* Categorias sem campos estruturados: texto livre */}
          {!hasStructuredFields && (
            <div><p className={labelCls}>Nome do Produto</p><input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: Cabo USB-C Lightning 1m" className={inputCls} /></div>
          )}

          {/* Nome do produto — editável, pré-preenchido automaticamente */}
          {hasStructuredFields && (() => {
            const autoName = buildProdutoName(form.categoria);
            // Se o campo produto está vazio ou igual ao auto-gerado anterior, atualizar
            if (!form.produto && autoName) {
              setTimeout(() => set("produto", autoName), 0);
            }
            return (
              <div className={`px-5 py-4 rounded-2xl border-2 border-[#E8740E]/30 ${dm ? "bg-[#E8740E]/10" : "bg-[#E8740E]/5"} space-y-2`}>
                <div className="flex items-center justify-between">
                  <p className={`text-[11px] font-medium ${textSecondary}`}>Nome do produto</p>
                  <button
                    type="button"
                    onClick={() => set("produto", autoName)}
                    className="text-[11px] text-[#E8740E] hover:text-[#F5A623] font-semibold"
                  >
                    Regenerar
                  </button>
                </div>
                <input
                  value={form.produto}
                  onChange={(e) => set("produto", e.target.value)}
                  className={`w-full px-4 py-3 rounded-xl text-[15px] font-bold focus:outline-none focus:ring-2 focus:ring-[#E8740E]/30 ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#E5E5EA] text-[#1D1D1F]"} border`}
                />
              </div>
            );
          })()}

          {/* IMEI e Serial */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={labelCls}>IMEI</p>
              <input value={form.imei} onChange={(e) => set("imei", e.target.value)} placeholder="Opcional — preencha quando chegar" className={inputCls} />
            </div>
            <div>
              <p className={labelCls}>Serial No {ocrLoading && <span className="text-xs text-orange-500 ml-1">Lendo serial...</span>}</p>
              <input value={form.serial_no} onChange={(e) => set("serial_no", e.target.value)} placeholder="Opcional — cole imagem ou digite" className={inputCls}
                onPaste={(e) => handleSerialPaste(e, (v) => set("serial_no", v), setOcrLoading)} />
            </div>
          </div>

          {/* Custo e Fornecedor */}
          <div className="grid grid-cols-2 gap-4">
            <div><p className={labelCls}>Custo unitario (R$)</p><input type="number" value={form.custo_unitario} onChange={(e) => set("custo_unitario", e.target.value)} className={inputCls} /></div>
            <div>
              <p className={labelCls}>Fornecedor</p>
              {showNovoFornecedor ? (
                <div className="flex gap-1">
                  <input
                    value={novoFornecedorNome}
                    onChange={(e) => setNovoFornecedorNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddFornecedor(); if (e.key === "Escape") setShowNovoFornecedor(false); }}
                    placeholder="Nome do fornecedor"
                    className={inputCls}
                    autoFocus
                  />
                  <button onClick={handleAddFornecedor} className="px-3 py-2 rounded-xl bg-[#E8740E] text-white text-xs font-bold shrink-0">+</button>
                  <button onClick={() => setShowNovoFornecedor(false)} className={`px-2 py-2 rounded-xl border ${borderCard} ${textSecondary} text-xs shrink-0`}>X</button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls}>
                    <option value="">— Selecionar —</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                  </select>
                  <button onClick={() => setShowNovoFornecedor(true)} className={`px-3 py-2 rounded-xl border ${borderCard} ${textSecondary} hover:border-[#E8740E] hover:text-[#E8740E] text-xs font-bold shrink-0`} title="Cadastrar novo fornecedor">+</button>
                </div>
              )}
            </div>
          </div>

          {/* Cores e Quantidades */}
          <div className={`p-4 rounded-xl ${bgSection} space-y-3`}>
            <p className={`text-xs font-bold uppercase tracking-wider ${textSecondary}`}>Cores e Quantidades</p>
            {/* Primeira cor (principal) */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-[#E8740E] flex items-center justify-center shrink-0" title="Cor principal">
                <span className="text-xs">🎨</span>
              </div>
              {coresEfetivas ? (
                <select value={form.cor} onChange={(e) => set("cor", e.target.value)} className={`${inputCls} flex-1`} style={{ width: "auto" }}>
                  {COR_OBRIGATORIA.includes(formBaseCat) ? <option value="" disabled>— Selecionar —</option> : <option value="">— Opcional —</option>}
                  {coresEfetivas.map((c) => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <input value={form.cor} onChange={(e) => set("cor", e.target.value)} placeholder="Ex: Silver, Azul, Preto..." className={`${inputCls} flex-1`} style={{ width: "auto" }} />
              )}
              <input type="number" value={form.qnt} onChange={(e) => set("qnt", e.target.value)} className={qntCls} placeholder="Qtd" />
              <span className={`text-xs ${textSecondary} w-6`}>un.</span>
              <span className="w-5"></span>
            </div>
            {/* Cores adicionais */}
            {variacoes.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                {coresEfetivas ? (
                  <select value={v.cor} onChange={(e) => { const nv = [...variacoes]; nv[i].cor = e.target.value; setVariacoes(nv); }} className={`${inputCls} flex-1`} style={{ width: "auto" }}>
                    {COR_OBRIGATORIA.includes(formBaseCat) ? <option value="" disabled>— Selecionar —</option> : <option value="">— Opcional —</option>}
                    {coresEfetivas.map((c) => <option key={c}>{c}</option>)}
                  </select>
                ) : (
                  <input value={v.cor} onChange={(e) => { const nv = [...variacoes]; nv[i].cor = e.target.value; setVariacoes(nv); }} placeholder="Cor" className={`${inputCls} flex-1`} style={{ width: "auto" }} />
                )}
                <input type="number" value={v.qnt} onChange={(e) => { const nv = [...variacoes]; nv[i].qnt = e.target.value; setVariacoes(nv); }} className={qntCls} placeholder="Qtd" />
                <span className={`text-xs ${textSecondary} w-6`}>un.</span>
                <button onClick={() => setVariacoes(variacoes.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 text-sm font-bold w-5">✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setVariacoes([...variacoes, { cor: "", qnt: "1" }])} className={`w-full py-2 rounded-lg border border-dashed ${dm ? "border-[#3A3A3C] text-[#636366] hover:border-[#E8740E] hover:text-[#E8740E]" : "border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E]"} text-xs font-medium transition-colors`}>
              + Outra cor
            </button>
          </div>
          {form.tipo === "SEMINOVO" && (
            <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 p-4 ${bgSection} rounded-xl`}>
              <div><p className={labelCls}>Bateria %</p><input type="number" value={form.bateria} onChange={(e) => set("bateria", e.target.value)} placeholder="Ex: 92" className={inputCls} /></div>
              <div><p className={labelCls}>Cliente (comprado de)</p><input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} className={inputCls} /></div>
              <div><p className={labelCls}>Observacoes</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Grade, caixa, garantia..." className={inputCls} /></div>
            </div>
          )}
          {form.tipo !== "SEMINOVO" && (
            <div><p className={labelCls}>Observacao</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} className={inputCls} /></div>
          )}
          <button onClick={() => handleSubmit(false)} className="w-full py-4 rounded-2xl bg-[#E8740E] text-white text-[15px] font-semibold hover:bg-[#D06A0D] transition-colors shadow-sm active:scale-[0.99]">
            {variacoes.length > 0 ? `Adicionar ${variacoes.length + 1} cores` : "Adicionar Seminovo"}
          </button>
          </>
          )}
        </div>
      ) : (
        /* LISTA */
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 text-center text-[#86868B]">Carregando...</div>
          ) : !filterCat && ["estoque", "acaminho", "pendencias"].includes(tab) ? (
            /* TELA DE CATEGORIAS */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {categoriasState.map((cat) => {
                const sourceList = tab === "acaminho" ? aCaminho : tab === "pendencias" ? pendencias : emEstoque;
                const count = sourceList.filter((p) => p.categoria === cat.key).length;
                const units = sourceList.filter((p) => p.categoria === cat.key).reduce((s, p) => s + p.qnt, 0);
                if (count === 0) return null;
                const isEditing = editingCatName === cat.key;
                return (
                  <div key={cat.key} className={`${bgCard} border ${borderCard} rounded-2xl p-6 shadow-sm text-left hover:border-[#E8740E] hover:shadow-lg transition-all group relative`}>
                    {/* Edit button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingCatName(cat.key); setEditCatLabel(cat.label); }}
                      className={`absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity ${dm ? "bg-[#3A3A3C] text-[#A1A1A6]" : "bg-[#F5F5F7] text-[#86868B]"} hover:text-[#E8740E]`}
                      title="Editar nome"
                    >
                      ✏️
                    </button>
                    <div className="cursor-pointer" onClick={() => !isEditing && setFilterCat(cat.key)}>
                      <div className="text-[40px] mb-4">{cat.emoji}</div>
                      {isEditing ? (
                        <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            value={editCatLabel}
                            onChange={(e) => setEditCatLabel(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleEditCategoriaEstoque(cat.key); if (e.key === "Escape") setEditingCatName(""); }}
                            className={`w-full px-2 py-1.5 rounded-lg border text-sm font-bold ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "border-[#D2D2D7]"} focus:outline-none focus:border-[#E8740E]`}
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <button onClick={() => handleEditCategoriaEstoque(cat.key)} className="px-2 py-1 rounded text-[11px] font-semibold bg-[#E8740E] text-white">Salvar</button>
                            <button onClick={() => setEditingCatName("")} className={`px-2 py-1 rounded text-[11px] ${textSecondary}`}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <h3 className={`font-bold text-[15px] ${textPrimary} group-hover:text-[#E8740E] transition-colors`}>{cat.label}</h3>
                      )}
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`text-[12px] ${textSecondary}`}>{count} produtos</span>
                        <span className={`text-[12px] ${textMuted}`}>{units} un.</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Card Seminovos — só na aba estoque (lacrados) */}
              {tab === "estoque" && seminovos.length > 0 && (
                <div
                  className={`${bgCard} border ${borderCard} rounded-2xl p-6 shadow-sm text-left hover:border-[#E8740E] hover:shadow-lg transition-all cursor-pointer`}
                  onClick={() => setTab("seminovos")}
                >
                  <div className="text-[40px] mb-4">📱</div>
                  <h3 className={`font-bold text-[15px] ${textPrimary} hover:text-[#E8740E] transition-colors`}>Seminovos</h3>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-[12px] ${textSecondary}`}>{seminovos.length} produtos</span>
                    <span className={`text-[12px] ${textMuted}`}>{seminovos.reduce((s, p) => s + p.qnt, 0)} un.</span>
                  </div>
                </div>
              )}
            </div>
          ) : Object.keys(byCat).length === 0 ? (
            <div className={`${bgCard} border ${borderCard} rounded-2xl p-12 text-center shadow-sm`}>
              <p className={textSecondary}>Nenhum produto encontrado.</p>
            </div>
          ) : (
            <>
            {/* Barra de seleção em lote — A Caminho (admin only) */}
            {isAdmin && tab === "acaminho" && filtered.length > 0 && (
              <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#FFF8F0] border-[#F5D5B0]"} border`}>
                <input
                  type="checkbox"
                  checked={selectedACaminho.size === filtered.length && filtered.length > 0}
                  onChange={() => {
                    if (selectedACaminho.size === filtered.length) {
                      setSelectedACaminho(new Set());
                    } else {
                      setSelectedACaminho(new Set(filtered.map(p => p.id)));
                    }
                  }}
                  className="w-4 h-4 accent-[#E8740E] cursor-pointer"
                />
                <span className={`text-sm ${textPrimary}`}>
                  {selectedACaminho.size > 0 ? `${selectedACaminho.size} selecionado${selectedACaminho.size > 1 ? "s" : ""}` : "Selecionar todos"}
                </span>
                {selectedACaminho.size > 0 && (
                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={handleMoverSelecionados}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      Mover {selectedACaminho.size} → Estoque
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Excluir ${selectedACaminho.size} produto(s) selecionado(s)?`)) return;
                        const ids = [...selectedACaminho];
                        await fetch("/api/estoque", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) }, body: JSON.stringify({ ids }) });
                        setEstoque(prev => prev.filter(e => !selectedACaminho.has(e.id)));
                        setSelectedACaminho(new Set());
                        setMsg(`${ids.length} produto(s) excluído(s)`);
                      }}
                      className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      Excluir {selectedACaminho.size}
                    </button>
                  </div>
                )}
              </div>
            )}
            {Object.entries(byCat).sort(([a], [b]) => a.localeCompare(b)).map(([cat, modelos]) => (
              <div key={cat} className="space-y-3">
                <h2 className={`text-lg font-bold ${textPrimary} flex items-center gap-2`}>
                  {dynamicCatLabels[cat] || cat}
                  <span className={`text-xs font-normal ${textSecondary}`}>
                    {Object.values(modelos).flat().length} produtos | {Object.values(modelos).flat().reduce((s, p) => s + p.qnt, 0)} un.
                  </span>
                </h2>

                {(() => {
                  const modeloEntriesRaw = Object.entries(modelos).sort(([a], [b]) => a.localeCompare(b));
                  const modeloEntries = sortByCardOrder(modeloEntriesRaw, cat);
                  return modeloEntries.map(([modelo, items]) => {
                  // Sub-agrupar por nome do produto (sem origem VC/LL/J/BE/BR/HN/IN/ZA)
                  const stripOrigem = (nome: string) => nome
                    .replace(/\s+(VC|LL|J|BE|BR|HN|IN|ZA|BZ)\s*(\([^)]*\))?/gi, "")
                    .replace(/[-–]\s*(CHIP\s+(F[ÍI]SICO\s*\+\s*)?)?E-?SIM/gi, "")
                    .replace(/[-–]\s*CHIP\s+VIRTUAL/gi, "")
                    .replace(/\s*\(\d+C\s*CPU\/\d+C\s*GPU\)\s*/gi, " ")  // (10C CPU/10C GPU)
                    .replace(/\s{2,}/g, " ")
                    .trim();
                  const byProduto: Record<string, ProdutoEstoque[]> = {};
                  items.forEach((p) => {
                    const groupKey = stripOrigem(p.produto);
                    if (!byProduto[groupKey]) byProduto[groupKey] = [];
                    byProduto[groupKey].push(p);
                  });
                  // Ordenar por storage (64GB < 128GB < 256GB < 512GB < 1TB < 2TB)
                  function storageToNum(name: string): number {
                    const m = name.match(/(\d+)\s*(GB|TB)/i);
                    if (!m) return 0;
                    const val = parseInt(m[1]);
                    return m[2].toUpperCase() === "TB" ? val * 1024 : val;
                  }
                  const produtoEntries = Object.entries(byProduto).sort(([a], [b]) => {
                    const sa = storageToNum(a);
                    const sb = storageToNum(b);
                    if (sa !== sb) return sa - sb;
                    return a.localeCompare(b);
                  });
                  const isCardDragging = dragCardKey === modelo;

                  return (
                  <div
                    key={modelo}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); dragCardRef.current = modelo; setDragCardKey(modelo); }}
                    onDragEnter={(e) => { e.stopPropagation(); dragOverCardRef.current = modelo; }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={(e) => { e.stopPropagation(); handleCardDragEnd(cat, modeloEntries); }}
                    className={`${bgCard} border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all ${isCardDragging ? "opacity-40 border-[#E8740E]" : borderCard}`}
                  >
                    <div className={`px-5 py-3.5 border-b ${borderCard} flex items-center justify-between cursor-grab active:cursor-grabbing group/card`}>
                      <div className="flex items-center gap-3">
                        <span className={`${textMuted} text-xs select-none opacity-40`}>⠿</span>
                        {editingCardTitle === modelo ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              value={editCardTitleValue}
                              onChange={(e) => setEditCardTitleValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") saveCardTitleOverride(modelo, editCardTitleValue); if (e.key === "Escape") setEditingCardTitle(""); }}
                              className={`px-2 py-0.5 rounded border text-sm font-bold ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "border-[#D2D2D7]"} focus:outline-none focus:border-[#E8740E]`}
                              autoFocus
                            />
                            <button onClick={() => saveCardTitleOverride(modelo, editCardTitleValue)} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                            <button onClick={() => setEditingCardTitle("")} className={`text-[10px] ${textSecondary}`}>✕</button>
                          </div>
                        ) : (
                          <h3 className={`font-bold ${textPrimary} text-[15px] flex items-center gap-2`}>
                            {getCardTitle(modelo)}
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingCardTitle(modelo); setEditCardTitleValue(getCardTitle(modelo)); }}
                              className={`w-5 h-5 rounded flex items-center justify-center text-[10px] opacity-0 group-hover/card:opacity-100 transition-opacity ${dm ? "text-[#636366] hover:text-[#E8740E]" : "text-[#86868B] hover:text-[#E8740E]"}`}
                              title="Editar título do card"
                            >✏️</button>
                          </h3>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className={`text-[11px] ${textSecondary}`}>{items.length} variantes</span>
                        <span className={`text-[11px] font-medium ${textPrimary}`}>{items.reduce((s, p) => s + p.qnt, 0)} un.</span>
                        <span className={`text-[11px] font-semibold text-[#E8740E]`}>{fmt(items.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0))}</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {produtoEntries.map(([prodNome, prodItems]) => {
                            const showObs = tab === "seminovos" || isEditableItemTab;
                            const showMover = tab === "acaminho" || isPendenciasTab;
                            const prodTotal = prodItems.reduce((s, p) => s + p.qnt, 0);
                            const prodValor = prodItems.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);

                            return (
                              <React.Fragment key={prodNome}>
                                {/* Espaçador entre produtos */}
                                <tr><td colSpan={10} className="h-2"></td></tr>
                                {/* Header do produto */}
                                {(() => {
                                  const alwaysExpand = isEditableItemTab;
                                  const isExpanded = alwaysExpand || expandedProducts.has(prodNome);
                                  const toggleExpand = () => {
                                    if (alwaysExpand) return;
                                    setExpandedProducts(prev => {
                                      const s = new Set(prev);
                                      s.has(prodNome) ? s.delete(prodNome) : s.add(prodNome);
                                      return s;
                                    });
                                  };
                                  return (<>
                                <tr className={`${dm ? "bg-[#2A2A2A]" : "bg-[#1D1D1F]"} ${!alwaysExpand ? "cursor-pointer" : ""}`} onClick={toggleExpand}>
                                  <td className="w-1" style={{ background: "#E8740E" }}></td>
                                  <td className="px-3 py-3 font-bold text-[13px] text-white" colSpan={1}>
                                    <div className="flex items-center gap-2">
                                      {!alwaysExpand && <span className="text-[10px] text-white/40 w-3">{isExpanded ? "▼" : "▶"}</span>}
                                    {(() => {
                                      const canEditNome = isPendenciasTab || tab === "acaminho";
                                      return editingNome[prodItems[0]?.id] !== undefined && canEditNome ? (
                                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                          <input
                                            value={editingNome[prodItems[0].id]}
                                            onChange={(e) => setEditingNome({ ...editingNome, [prodItems[0].id]: e.target.value })}
                                            onKeyDown={(e) => {
                                              if (e.key === "Enter") handleSaveNome(prodItems.map((x) => x.id), editingNome[prodItems[0].id]);
                                              if (e.key === "Escape") { const en = { ...editingNome }; delete en[prodItems[0].id]; setEditingNome(en); }
                                            }}
                                            className="w-full px-2 py-0.5 rounded border border-[#0071E3] text-sm font-semibold"
                                            autoFocus
                                          />
                                          <button onClick={() => handleSaveNome(prodItems.map((x) => x.id), editingNome[prodItems[0].id])} className="text-[10px] text-[#E8740E] font-bold shrink-0">OK</button>
                                        </div>
                                      ) : (
                                        <span className={`flex items-center gap-1 ${canEditNome ? "cursor-pointer hover:text-[#E8740E]" : ""}`} onClick={(e) => { if (canEditNome) { e.stopPropagation(); setEditingNome({ ...editingNome, [prodItems[0].id]: prodNome }); } }}>
                                          {prodNome}
                                          {canEditNome && <svg className="w-3 h-3 text-[#86868B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
                                        </span>
                                      );
                                    })()}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="text-xs font-bold text-white/90">{prodTotal} un.</span>
                                  </td>
                                  <td className="px-4 py-2 text-xs text-white/50" onClick={e => e.stopPropagation()}>
                                    {bulkCustoKey === prodNome ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-white/30">R$</span>
                                        <input
                                          type="number"
                                          value={bulkCustoVal}
                                          onChange={(e) => setBulkCustoVal(e.target.value)}
                                          onKeyDown={(e) => { if (e.key === "Enter") handleBulkCusto(prodItems); if (e.key === "Escape") { setBulkCustoKey(""); setBulkCustoVal(""); } }}
                                          className="w-20 px-1 py-0.5 rounded border border-[#0071E3] text-xs text-right bg-[#1A1A1A] text-white"
                                          placeholder={String(prodItems[0]?.custo_unitario || "")}
                                          autoFocus
                                        />
                                        <button onClick={() => handleBulkCusto(prodItems)} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                        <button onClick={() => { setBulkCustoKey(""); setBulkCustoVal(""); }} className="text-[10px] text-red-400">✕</button>
                                      </div>
                                    ) : (
                                      <span
                                        className={`flex items-center gap-1 ${isAdmin ? "cursor-pointer hover:text-[#E8740E]" : ""}`}
                                        onClick={() => { if (isAdmin) { setBulkCustoKey(prodNome); setBulkCustoVal(String(prodItems[0]?.custo_unitario || "")); } }}
                                        title={isAdmin ? "Editar preco de todas as unidades" : ""}
                                      >
                                        {prodItems[0]?.custo_unitario ? fmt(prodItems[0].custo_unitario) : "—"}
                                        {isAdmin && <span className="text-[9px] opacity-0 group-hover/card:opacity-50">✏️</span>}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2 text-xs font-semibold text-white/90">{fmt(prodValor)}</td>
                                  <td colSpan={2}></td>
                                </tr>
                                {/* Linhas de cada cor — só quando expandido */}
                                {isExpanded && prodItems.map((p) => {
                                  const isEditCusto = editingCusto[p.id] !== undefined;
                                  const isEditQnt = editingQnt[p.id] !== undefined;
                                  return (
                                    <tr
                                      key={p.id}
                                      draggable={!selectMode && !balanceMode}
                                      onDragStart={(e) => { if (selectMode || balanceMode) return; e.stopPropagation(); dragItemRef.current = p.id; setDragId(p.id); }}
                                      onDragEnter={(e) => { e.stopPropagation(); dragOverRef.current = p.id; }}
                                      onDragOver={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                      onDragEnd={(e) => { e.stopPropagation(); handleEstoqueDragEnd(); }}
                                      onClick={balanceMode ? () => setBalanceSelected(prev => { const s = new Set(prev); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return s; }) : selectMode ? () => toggleSelect(p.id) : () => setDetailProduct(p)}
                                      className={`border-b ${borderLight} last:border-0 transition-colors cursor-pointer ${dragId === p.id ? "opacity-40" : ""} ${balanceMode && balanceSelected.has(p.id) ? (dm ? "bg-blue-500/10" : "bg-blue-50") : selectMode && selectedIds.has(p.id) ? (dm ? "bg-[#E8740E]/10" : "bg-[#FFF5EB]") : ""} ${dm ? "hover:bg-[#252525]" : "hover:bg-[#FAFAFA]"}`}
                                    >
                                      <td className="pl-2 py-2.5 select-none w-4">
                                        {balanceMode && tab === "seminovos" ? (
                                          <input type="checkbox" checked={balanceSelected.has(p.id)} onChange={() => setBalanceSelected(prev => { const s = new Set(prev); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return s; })} className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" onClick={e => e.stopPropagation()} />
                                        ) : isAdmin && tab === "acaminho" ? (
                                          <input type="checkbox" checked={selectedACaminho.has(p.id)} onChange={() => setSelectedACaminho(prev => { const s = new Set(prev); s.has(p.id) ? s.delete(p.id) : s.add(p.id); return s; })} className="w-3.5 h-3.5 accent-[#E8740E] cursor-pointer" onClick={e => e.stopPropagation()} />
                                        ) : selectMode ? (
                                          <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="w-3.5 h-3.5 accent-[#E8740E] cursor-pointer" />
                                        ) : (
                                          <span className="text-[10px] cursor-grab active:cursor-grabbing text-[#C7C7CC]">⠿</span>
                                        )}
                                      </td>
                                      <td className="px-2 py-2.5 text-sm">
                                        <div className="flex flex-col gap-1">
                                          {isEditableItemTab && isEditingField(p.id, "cor") ? (
                                            <div className="flex items-center gap-1">
                                              <input value={getEditVal(p.id, "cor") || ""} onChange={(e) => startEditField(p.id, "cor", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveField(p.id, "cor"); if (e.key === "Escape") cancelEditField(p.id, "cor"); }} className="w-24 px-1 py-0.5 rounded border border-[#0071E3] text-xs" autoFocus placeholder="Cor" />
                                              <button onClick={() => saveField(p.id, "cor")} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                            </div>
                                          ) : (
                                            <span className={`${textSecondary} ${isEditableItemTab ? "cursor-pointer hover:text-[#E8740E]" : ""}`} onClick={(e) => { if (isEditableItemTab) { e.stopPropagation(); startEditField(p.id, "cor", p.cor || ""); } }}>• {p.cor || "—"}</span>
                                          )}
                                          {(p.imei || p.serial_no) && (
                                            <div className={`flex flex-wrap gap-x-3 gap-y-1 mt-0.5 px-2 py-1 rounded-lg ${dm ? "bg-[#1C1C1E]" : "bg-[#F5F5F7]"}`}>
                                              {p.imei && (
                                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(p.imei || ""); setMsg(`IMEI copiado: ${p.imei}`); }} className="flex items-center gap-1 text-[11px] font-mono text-[#0071E3] hover:text-[#E8740E] cursor-pointer" title="Copiar IMEI">
                                                  <span className="text-[9px] font-sans font-bold text-[#86868B]">IMEI</span>{p.imei}
                                                </button>
                                              )}
                                              {p.serial_no && (
                                                <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(p.serial_no || ""); setMsg(`Serial copiado: ${p.serial_no}`); }} className="flex items-center gap-1 text-[11px] font-mono text-purple-600 hover:text-[#E8740E] cursor-pointer" title="Copiar Serial">
                                                  <span className="text-[9px] font-sans font-bold text-[#86868B]">SN</span>{p.serial_no}
                                                </button>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-2 py-2.5 text-xs">
                                        <div className="flex flex-col gap-1">
                                          {isEditableItemTab && <span className="font-medium">{p.cliente || "—"}{p.data_compra ? <span className="text-[#86868B] ml-1">({p.data_compra})</span> : ""}</span>}
                                          <div className="flex flex-wrap gap-1 items-center">
                                            {/* Condição: Lacrado / Usado */}
                                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${p.tipo === "SEMINOVO" || p.tipo === "PENDENCIA" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                                              {p.tipo === "SEMINOVO" || p.tipo === "PENDENCIA" ? "Usado" : "Lacrado"}
                                            </span>
                                            {/* Bateria (só seminovo/pendência) */}
                                            {(p.tipo === "SEMINOVO" || p.tipo === "PENDENCIA") && (
                                              isEditableItemTab && isEditingField(p.id, "bateria") ? (
                                                <div className="flex items-center gap-0.5">
                                                  <input type="number" value={getEditVal(p.id, "bateria") || ""} onChange={(e) => startEditField(p.id, "bateria", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveField(p.id, "bateria"); if (e.key === "Escape") cancelEditField(p.id, "bateria"); }} className="w-14 px-1 py-0.5 rounded border border-[#0071E3] text-[10px]" autoFocus placeholder="%" />
                                                  <button onClick={() => saveField(p.id, "bateria")} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                                </div>
                                              ) : isEditableItemTab ? (
                                                <button onClick={(e) => { e.stopPropagation(); startEditField(p.id, "bateria", String(p.bateria || "")); }} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.bateria ? "bg-green-50 text-green-600" : `${dm ? "bg-[#2C2C2E] text-[#636366]" : "bg-gray-100 text-[#86868B]"}`} hover:ring-1 hover:ring-[#E8740E]`}>
                                                  {p.bateria ? `🔋 ${p.bateria}%` : "+ Bateria"}
                                                </button>
                                              ) : p.bateria ? (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600">🔋 {p.bateria}%</span>
                                              ) : null
                                            )}
                                            {/* Origem/Obs */}
                                            {isEditableItemTab && isEditingField(p.id, "observacao") ? (
                                              <div className="flex items-center gap-0.5">
                                                <input value={getEditVal(p.id, "observacao") || ""} onChange={(e) => startEditField(p.id, "observacao", e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveField(p.id, "observacao"); if (e.key === "Escape") cancelEditField(p.id, "observacao"); }} className="w-32 px-1 py-0.5 rounded border border-[#0071E3] text-[10px]" autoFocus placeholder="Origem..." />
                                                <button onClick={() => saveField(p.id, "observacao")} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                              </div>
                                            ) : isEditableItemTab ? (
                                              <button onClick={(e) => { e.stopPropagation(); startEditField(p.id, "observacao", p.observacao || ""); }} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${p.observacao ? `${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-gray-100 text-[#86868B]"}` : `${dm ? "bg-[#2C2C2E] text-[#636366]" : "bg-gray-100 text-[#86868B]"}`} hover:ring-1 hover:ring-[#E8740E] max-w-[150px] truncate`}>
                                                {p.observacao || "+ Origem"}
                                              </button>
                                            ) : p.observacao ? (
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"} max-w-[150px] truncate`}>{p.observacao}</span>
                                            ) : null}
                                          </div>
                                          {!isEditableItemTab && p.data_entrada && (
                                            <span className={`text-[10px] ${dm ? "text-[#636366]" : "text-[#C7C7CC]"}`}>{p.data_entrada}</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className={`font-bold min-w-[24px] text-center ${p.qnt === 0 ? "text-red-500" : p.qnt === 1 ? "text-yellow-600" : textPrimary}`}>{p.qnt}</span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {isEditCusto ? (
                                          <div className="flex items-center gap-1">
                                            <input type="number" value={editingCusto[p.id]} onChange={(e) => setEditingCusto({ ...editingCusto, [p.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") handleSaveCusto(p); if (e.key === "Escape") { const ec = { ...editingCusto }; delete ec[p.id]; setEditingCusto(ec); } }} className="w-20 px-1 py-0.5 rounded border border-[#0071E3] text-xs text-right" autoFocus />
                                            <button onClick={() => handleSaveCusto(p)} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                          </div>
                                        ) : (
                                          <span className={`text-xs flex items-center gap-1 ${isAdmin ? "cursor-pointer hover:text-[#E8740E]" : ""}`} onClick={() => isAdmin && setEditingCusto({ ...editingCusto, [p.id]: String(p.custo_unitario || "") })}>
                                            {p.custo_unitario ? fmt(p.custo_unitario) : "—"}
                                            {isAdmin && <svg className="w-3 h-3 text-[#86868B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-xs font-medium">{p.custo_unitario && p.qnt ? fmt(p.custo_unitario * p.qnt) : "—"}</td>
                                      <td className="px-4 py-2.5">
                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${dm ? (p.status === "EM ESTOQUE" ? "bg-green-900/30 text-green-400" : p.status === "A CAMINHO" ? "bg-blue-900/30 text-blue-400" : p.status === "PENDENTE" ? "bg-yellow-900/30 text-yellow-400" : p.status === "ESGOTADO" ? "bg-red-900/30 text-red-400" : "bg-[#2C2C2E] text-[#98989D]") : (STATUS_COLORS[p.status] || "bg-gray-100 text-gray-700")}`}>{p.status}</span>
                                        {p.qnt === 0 && produtosACaminho.has(p.produto.toUpperCase()) && (
                                          <span className={`ml-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold ${dm ? "bg-blue-900/30 text-blue-400" : "bg-blue-100 text-blue-700"}`}>Ja a caminho</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <div className="flex gap-2 items-center opacity-40 group-hover/row:opacity-100 transition-opacity">
                                        {showMover && (() => {
                                          const needsSerial = !["MAC_MINI", "ACESSORIOS", "OUTROS", "AIRPODS"].includes(p.categoria);
                                          const qnt = p.qnt || 1;

                                          if (needsSerial && qnt > 1) {
                                            // Múltiplas unidades: inputs de serial + botão Salvar (separa em registros individuais)
                                            return (
                                              <div className="flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                                                <div className="flex gap-1 flex-wrap">
                                                  {Array.from({ length: qnt }, (_, i) => (
                                                    <input key={i} placeholder={`Serial ${i + 1}`} id={`serial-${p.id}-${i}`}
                                                      style={{ textTransform: "uppercase" }}
                                                      className={`px-2 py-1 rounded-lg text-[11px] w-32 border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}
                                                      onPaste={(e) => handleSerialPaste(e, (v) => { const el = document.getElementById(`serial-${p.id}-${i}`) as HTMLInputElement; if (el) { el.value = v; } }, setOcrLoading)} />
                                                  ))}
                                                </div>
                                                <button onClick={async () => {
                                                  const serials: string[] = [];
                                                  for (let i = 0; i < qnt; i++) {
                                                    const el = document.getElementById(`serial-${p.id}-${i}`) as HTMLInputElement;
                                                    const val = el?.value?.trim() || "";
                                                    if (!val && needsSerial) { setMsg(`Preencha o Serial ${i + 1}`); return; }
                                                    serials.push(val.toUpperCase());
                                                  }
                                                  // Separar em registros individuais (garante A_CAMINHO)
                                                  const res1 = await apiPatch(p.id, { serial_no: serials[0], qnt: 1, tipo: "A_CAMINHO", status: "A CAMINHO" });
                                                  let created = 0;
                                                  for (let i = 1; i < serials.length; i++) {
                                                    const res = await fetch("/api/estoque", {
                                                      method: "POST",
                                                      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
                                                      body: JSON.stringify({
                                                        produto: p.produto, categoria: p.categoria, qnt: 1,
                                                        custo_unitario: p.custo_unitario, cor: p.cor, fornecedor: p.fornecedor,
                                                        serial_no: serials[i], tipo: "A_CAMINHO", status: "A CAMINHO",
                                                        data_compra: p.data_compra,
                                                      }),
                                                    });
                                                    if (res.ok) created++;
                                                  }
                                                  setMsg(`✅ ${serials.length} seriais salvos (${created + 1} registros)! Selecione e clique "Mover → Estoque".`);
                                                  await fetchEstoque();
                                                }} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                                                  💾 Salvar {qnt} seriais
                                                </button>
                                              </div>
                                            );
                                          }

                                          // 1 unidade
                                          if (needsSerial && !p.serial_no) {
                                            // Sem serial: input pra digitar + salvar
                                            return (
                                              <div className="flex gap-1 items-center" onClick={e => e.stopPropagation()}>
                                                <input placeholder={ocrLoading ? "Lendo..." : "Serial Number"}
                                                  style={{ textTransform: "uppercase" }}
                                                  className={`px-2 py-1 rounded-lg text-[11px] w-28 border ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7]"}`}
                                                  onKeyDown={async (e) => { if (e.key === "Enter") { const val = (e.target as HTMLInputElement).value.trim().toUpperCase(); if (!val) return; await apiPatch(p.id, { serial_no: val }); setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, serial_no: val } : x)); setMsg(`✅ Serial ${val} salvo!`); } }}
                                                  onBlur={async (e) => { const val = e.target.value.trim().toUpperCase(); if (!val) return; await apiPatch(p.id, { serial_no: val }); setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, serial_no: val } : x)); }}
                                                  onPaste={(e) => handleSerialPaste(e, (v) => { (e.target as HTMLInputElement).value = v; }, setOcrLoading)}
                                                />
                                              </div>
                                            );
                                          }

                                          // Já tem serial ou não precisa: mostra o serial salvo (pronto pra selecionar)
                                          return (
                                            <div className="flex gap-1 items-center">
                                              {p.serial_no && <span className={`text-[10px] font-mono ${dm ? "text-green-400" : "text-green-600"}`}>✅ {p.serial_no}</span>}
                                              {!needsSerial && <span className={`text-[10px] ${dm ? "text-green-400" : "text-green-600"}`}>✅ Pronto</span>}
                                            </div>
                                          );
                                        })()}
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setDetailProduct(p); }}
                                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${dm ? "bg-[#3A3A3C] text-[#F5A623] hover:bg-[#E8740E] hover:text-white" : "bg-[#FFF3E0] text-[#E8740E] hover:bg-[#E8740E] hover:text-white"}`}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                          Ver
                                        </button>
                                        {isAdmin && <button onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!confirm(`Excluir ${p.produto}${p.cor ? ` ${p.cor}` : ""}?`)) return;
                                          await fetch("/api/estoque", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) }, body: JSON.stringify({ id: p.id }) });
                                          setEstoque((prev) => prev.filter((r) => r.id !== p.id));
                                        }} className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all ${dm ? "bg-[#3A3A3C] text-red-400 hover:bg-red-500 hover:text-white" : "bg-red-50 text-red-400 hover:bg-red-500 hover:text-white"}`}
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                          Excluir
                                        </button>}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                                </>);
                                })()}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  );
                });
                })()}
              </div>
            ))}
            </>
          )}
        </div>
      )}

      {/* ═══════════ TAB: HISTORICO ═══════════ */}
      {tab === "historico" && (
        <HistoricoTab password={password} logs={historicoLogs} setLogs={setHistoricoLogs} loading={historicoLoading} setLoading={setHistoricoLoading} />
      )}

      {/* ═══════════ TAB: SCAN (Entrada por Serial Number) ═══════════ */}
      {tab === "scan" && (
        <ScanEntradaTab password={password} userName={userName} onSuccess={() => { fetchEstoque(); setMsg("✅ Produto cadastrado com sucesso!"); }} />
      )}

      {/* ═══════════ TAB: ETIQUETAS (Legacy) ═══════════ */}
      {tab === "etiquetas" && (
        <Suspense fallback={<div className="text-center py-8 text-[#86868B]">Carregando...</div>}>
          <EtiquetasContent embedded />
        </Suspense>
      )}

      {/* Floating bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 rounded-2xl shadow-2xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
          <span className={`text-sm font-semibold ${textPrimary}`}>{selectedIds.size} selecionado(s)</span>
          <button
            onClick={() => { setSelectedIds(new Set(filtered.map((p) => p.id))); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${dm ? "bg-[#2C2C2E] text-[#F5F5F7]" : "bg-[#F2F2F7] text-[#1D1D1F]"} hover:bg-[#E8740E] hover:text-white transition-colors`}
          >
            Selecionar todos ({filtered.length})
          </button>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {bulkDeleting ? "Excluindo..." : `Excluir ${selectedIds.size}`}
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setSelectMode(false); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${textSecondary} hover:${textPrimary} transition-colors`}
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Floating balance bar */}
      {balanceMode && tab === "seminovos" && balanceSelected.size > 0 && (() => {
        const selItems = estoque.filter((p) => balanceSelected.has(p.id));
        const totalCusto = selItems.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);
        const totalQnt = selItems.reduce((s, p) => s + p.qnt, 0);
        const avgCusto = totalQnt > 0 ? Math.round(totalCusto / totalQnt) : 0;
        return (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 px-6 py-3 rounded-2xl shadow-2xl border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#D2D2D7]"}`}>
            <span className={`text-sm font-semibold ${textPrimary}`}>{balanceSelected.size} selecionado(s)</span>
            <span className={`text-sm ${textSecondary}`}>Custo medio: <span className="font-bold text-blue-500">{fmt(avgCusto)}</span></span>
            <button
              onClick={handleApplyBalance}
              disabled={balanceApplying}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {balanceApplying ? "Aplicando..." : "Aplicar Balanço"}
            </button>
            <button
              onClick={() => { setBalanceSelected(new Set()); setBalanceMode(false); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${textSecondary} hover:${textPrimary} transition-colors`}
            >
              Cancelar
            </button>
          </div>
        );
      })()}

      {/* Modal de detalhes do produto */}
      {detailProduct && (() => {
        const p = detailProduct;
        const mBg = dm ? "bg-[#1C1C1E]" : "bg-white";
        const mSec = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
        const mP = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
        const mS = dm ? "text-[#98989D]" : "text-[#86868B]";
        const isLac = p.tipo === "NOVO";
        const dataE = p.data_entrada || p.data_compra;
        const cpIco = <svg className="w-3 h-3 opacity-40 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>;
        const canEdit = isAdmin && (p.tipo === "PENDENCIA" || p.status === "PENDENTE" || p.status === "A CAMINHO");
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailProduct(null)} onKeyDown={(e) => { if (e.key === "Escape") setDetailProduct(null); }} tabIndex={-1} ref={(el) => el?.focus()}>
            <div className={`w-full max-w-lg mx-4 ${mBg} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
              <div className={`flex items-center justify-between px-5 py-4 border-b ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
                <h3 className={`text-sm font-bold ${mP}`}>{canEdit ? "Editar Item" : "Detalhes do Item"} {p.serial_no ? `- ${p.serial_no}` : ""}</h3>
                <button onClick={() => setDetailProduct(null)} className={`w-8 h-8 flex items-center justify-center rounded-full ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F0F0F5]"} ${mS} hover:text-[#E8740E] text-lg`}>✕</button>
              </div>
              {/* Produto — editável para pendências */}
              <div className={`mx-4 mt-4 p-4 rounded-xl border ${mSec}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 mr-3">
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Produto (modelo + memoria)</p>
                    {canEdit ? (
                      <input
                        type="text"
                        defaultValue={p.produto}
                        onBlur={async (e) => {
                          const val = e.target.value.trim().toUpperCase();
                          if (val && val !== p.produto) {
                            await apiPatch(p.id, { produto: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, produto: val } : x));
                            setDetailProduct({ ...p, produto: val });
                            setMsg("Produto atualizado!");
                          }
                        }}
                        className={`w-full text-[15px] font-bold mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                      />
                    ) : (
                      <p className={`text-[16px] font-bold ${mP} mt-0.5`}>{p.produto}</p>
                    )}
                  </div>
                  <div className="text-right"><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Status</p><span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${p.status === "EM ESTOQUE" ? "bg-green-100 text-green-700" : p.status === "A CAMINHO" ? "bg-yellow-100 text-yellow-700" : "bg-orange-100 text-orange-700"}`}>{p.status}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {p.serial_no && <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Numero de Serie</p><button onClick={() => { navigator.clipboard.writeText(p.serial_no || ""); setMsg(`Serial copiado`); }} className={`text-[13px] font-mono ${mP} hover:text-[#E8740E] flex items-center gap-1.5 mt-0.5`}>{p.serial_no} {cpIco}</button></div>}
                  <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Condicao</p><span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold mt-0.5 ${isLac ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>{isLac ? "Lacrado" : "Usado"}</span></div>
                  {/* Cor */}
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Cor</p>
                    {canEdit ? (
                      <input
                        type="text"
                        defaultValue={p.cor || ""}
                        placeholder="Ex: TITANIO NATURAL"
                        onBlur={async (e) => {
                          const val = e.target.value.trim().toUpperCase() || null;
                          if (val !== (p.cor || null)) {
                            await apiPatch(p.id, { cor: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, cor: val } : x));
                            setDetailProduct({ ...p, cor: val });
                            setMsg("Cor atualizada!");
                          }
                        }}
                        className={`w-full text-[13px] mt-0.5 px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                      />
                    ) : p.cor ? (
                      <p className={`text-[13px] ${mP} mt-0.5`}>{p.cor}</p>
                    ) : null}
                  </div>
                  {p.imei && <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>IMEI</p><button onClick={() => { navigator.clipboard.writeText(p.imei || ""); setMsg(`IMEI copiado`); }} className={`text-[13px] font-mono ${mP} hover:text-[#E8740E] flex items-center gap-1.5 mt-0.5`}>{p.imei} {cpIco}</button></div>}
                  {/* Bateria */}
                  <div>
                    <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Bateria (%)</p>
                    {canEdit ? (
                      <input
                        type="number"
                        min={0} max={100}
                        defaultValue={p.bateria || ""}
                        placeholder="Ex: 92"
                        onBlur={async (e) => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          if (val !== p.bateria) {
                            await apiPatch(p.id, { bateria: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, bateria: val } : x));
                            setDetailProduct({ ...p, bateria: val });
                            setMsg("Bateria atualizada!");
                          }
                        }}
                        className={`w-full text-[13px] mt-0.5 px-2 py-1 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none`}
                      />
                    ) : p.bateria ? (
                      <p className={`text-[13px] ${mP} mt-0.5`}>{p.bateria}%</p>
                    ) : null}
                  </div>
                </div>
              </div>
              {/* Financeiro */}
              <div className={`mx-4 mt-3 p-4 rounded-xl border ${mSec}`}>
                <p className={`text-xs font-bold ${mP} mb-3`}>Informacoes Financeiras</p>
                <div className="grid grid-cols-3 gap-3">
                  <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Preco de Compra</p><p className={`text-[14px] font-bold ${mP} mt-0.5`}>{p.custo_unitario ? fmt(p.custo_unitario) : "—"}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Balanco</p><p className="text-[14px] font-bold text-[#E8740E] mt-0.5">{p.custo_unitario ? fmt(p.custo_unitario) : "—"}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Categoria</p><p className={`text-[13px] ${mP} mt-0.5`}>{p.categoria}</p></div>
                </div>
                {/* Estoque mínimo — para lacrados, editável pelo admin */}
                {p.tipo === "NOVO" && isAdmin && (
                  <div className="mt-3 pt-3 border-t border-dashed" style={{ borderColor: dm ? "#3A3A3C" : "#E8E8ED" }}>
                    <p className={`text-[10px] uppercase tracking-wider ${mS} mb-1`}>Estoque Minimo (pra reposicao)</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={0}
                        defaultValue={p.estoque_minimo ?? ""}
                        placeholder="Ex: 3"
                        onBlur={async (e) => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          if (val !== p.estoque_minimo) {
                            await apiPatch(p.id, { estoque_minimo: val });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, estoque_minimo: val } : x));
                            setDetailProduct({ ...p, estoque_minimo: val });
                            setMsg("Estoque minimo atualizado!");
                          }
                        }}
                        className={`w-24 px-3 py-2 rounded-lg border text-[14px] font-bold text-center ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-blue-400" : "bg-white border-[#D2D2D7] text-blue-600"} focus:border-[#E8740E] focus:outline-none`}
                      />
                      <span className={`text-[12px] ${mS}`}>
                        {p.estoque_minimo ? `Atual: ${p.qnt} / Min: ${p.estoque_minimo} ${p.qnt < p.estoque_minimo ? "⚠️ REPOR" : "✅ OK"}` : "Nao definido"}
                      </span>
                    </div>
                  </div>
                )}
                {/* Preço sugerido — só para seminovos, editável pelo admin */}
                {(p.tipo === "SEMINOVO" || p.tipo === "PENDENCIA") && isAdmin && (
                  <div className="mt-3 pt-3 border-t border-dashed" style={{ borderColor: dm ? "#3A3A3C" : "#E8E8ED" }}>
                    <p className={`text-[10px] uppercase tracking-wider ${mS} mb-1`}>Preco Sugerido de Venda</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] ${mS}`}>R$</span>
                      <input
                        type="text" inputMode="numeric"
                        defaultValue={p.preco_sugerido ? String(p.preco_sugerido) : ""}
                        placeholder="Ex: 6500"
                        onBlur={async (e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          const num = val ? parseInt(val) : null;
                          if (num !== p.preco_sugerido) {
                            await apiPatch(p.id, { preco_sugerido: num });
                            setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, preco_sugerido: num } : x));
                            setDetailProduct({ ...p, preco_sugerido: num });
                            setMsg("Preco sugerido atualizado!");
                          }
                        }}
                        className={`flex-1 px-3 py-2 rounded-lg border text-[14px] font-bold ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-green-400" : "bg-white border-[#D2D2D7] text-green-600"} focus:border-[#E8740E] focus:outline-none`}
                      />
                    </div>
                    {p.preco_sugerido && p.custo_unitario ? (
                      <p className={`text-[11px] mt-1 ${p.preco_sugerido > p.custo_unitario ? "text-green-500" : "text-red-500"}`}>
                        Margem: {fmt(p.preco_sugerido - p.custo_unitario)} ({((p.preco_sugerido - p.custo_unitario) / p.preco_sugerido * 100).toFixed(1)}%)
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Datas + Observação */}
              <div className={`mx-4 mt-3 p-4 rounded-xl border ${mSec}`}>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Data de Entrada</p><p className={`text-[13px] ${mP} mt-0.5`}>{fmtDate(dataE)}</p></div>
                  <div><p className={`text-[10px] uppercase tracking-wider ${mS}`}>Fornecedor</p><p className={`text-[13px] ${mP} mt-0.5`}>{p.fornecedor || "Nao informado"}</p></div>
                </div>
                <div className="mt-3">
                  <p className={`text-[10px] uppercase tracking-wider ${mS}`}>Observacao</p>
                  {canEdit ? (
                    <textarea
                      defaultValue={p.observacao || ""}
                      placeholder="Ex: GARANTIA APPLE AGOSTO - LEVES MARCAS NA TELA"
                      rows={2}
                      onBlur={async (e) => {
                        const val = e.target.value.trim() || null;
                        if (val !== (p.observacao || null)) {
                          await apiPatch(p.id, { observacao: val });
                          setEstoque(prev => prev.map(x => x.id === p.id ? { ...x, observacao: val } : x));
                          setDetailProduct({ ...p, observacao: val });
                          setMsg("Observacao atualizada!");
                        }
                      }}
                      className={`w-full text-[13px] mt-0.5 px-2 py-1.5 rounded-lg border ${dm ? "bg-[#1C1C1E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"} focus:border-[#E8740E] focus:outline-none resize-none`}
                    />
                  ) : p.observacao ? (
                    <p className={`text-[13px] ${mP} mt-0.5`}>{p.observacao}</p>
                  ) : <p className={`text-[13px] ${mS} mt-0.5`}>—</p>}
                </div>
              </div>
              {/* Operações Relacionadas */}
              <div className={`mx-4 mt-3 p-4 rounded-xl border ${mSec}`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className={`text-xs font-bold ${mP}`}>Operacoes Relacionadas</p>
                  <div className="flex gap-2 flex-wrap">
                    {(p.status === "PENDENTE" || p.tipo === "PENDENCIA") && (
                      <button
                        onClick={async () => {
                          if (!confirm("Confirmar mover para EM ESTOQUE?")) return;
                          try {
                            const novoTipo = p.tipo === "PENDENCIA" ? "SEMINOVO" : p.tipo;
                            const res = await fetch("/api/estoque", { method: "PATCH", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) }, body: JSON.stringify({ id: p.id, status: "EM ESTOQUE", tipo: novoTipo }) });
                            const json = await res.json();
                            if (json.error) { setMsg("Erro: " + json.error); return; }
                            setMsg("✅ Movido para estoque!");
                            setDetailProduct(null);
                            fetchEstoque();
                          } catch { setMsg("Erro ao mover"); }
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500 text-white text-xs font-semibold hover:bg-green-600 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Mover para Estoque
                      </button>
                    )}
                    <button
                      onClick={() => { setDetailProduct(null); window.location.href = `/admin/vendas?tab=nova&produto=${encodeURIComponent(p.produto)}&custo=${p.custo_unitario || 0}`; }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#E8740E] text-white text-xs font-semibold hover:bg-[#F5A623] transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" /></svg>
                      Criar Venda
                    </button>
                    <button
                      onClick={async () => {
                        // Buscar produtos que entraram junto (mesmo fornecedor + mesma data)
                        const dataRef = p.data_entrada || p.data_compra;
                        const forn = p.fornecedor;
                        if (!dataRef || !forn) { setMsg("Sem dados de entrada para este produto"); return; }
                        try {
                          const res = await fetch(`/api/estoque?action=entrada&data=${dataRef}&fornecedor=${encodeURIComponent(forn)}`, { headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) } });
                          const json = await res.json();
                          if (json.data && json.data.length > 0) {
                            setEntradaView({ data: dataRef, fornecedor: forn, produtos: json.data });
                          } else {
                            setMsg("Nenhum registro de entrada encontrado");
                          }
                        } catch { setMsg("Erro ao buscar entrada"); }
                      }}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border text-xs font-semibold transition-colors ${dm ? "border-[#3A3A3C] text-[#F5F5F7] hover:border-[#E8740E]" : "border-[#D2D2D7] text-[#1D1D1F] hover:border-[#E8740E]"}`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                      Ver Entrada
                    </button>
                  </div>
                </div>
              </div>
              <div className="h-4" />
            </div>
          </div>
        );
      })()}

      {/* Modal Ver Entrada — produtos que entraram juntos */}
      {entradaView && <EntradaModal entradaView={entradaView} setEntradaView={setEntradaView} setDetailProduct={setDetailProduct} setMsg={setMsg} password={password} userName={userName} dm={dm} fetchEstoque={fetchEstoque} />}
    </div>
  );
}

/* ── Modal de Entrada de Produtos ── */
function EntradaModal({ entradaView, setEntradaView, setDetailProduct, setMsg, password, userName, dm, fetchEstoque }: {
  entradaView: { data: string; fornecedor: string; produtos: ProdutoEstoque[] };
  setEntradaView: (v: { data: string; fornecedor: string; produtos: ProdutoEstoque[] } | null) => void;
  setDetailProduct: (p: ProdutoEstoque | null) => void;
  setMsg: (m: string) => void;
  password: string;
  userName: string;
  dm: boolean;
  fetchEstoque: () => void;
}) {
  const { data, fornecedor, produtos: initialProdutos } = entradaView;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [produtos, setProdutos] = useState(initialProdutos);
  const [saving, setSaving] = useState(false);

  const mBg = dm ? "bg-[#1C1C1E]" : "bg-white";
  const mSec = dm ? "bg-[#2C2C2E] border-[#3A3A3C]" : "bg-[#F9F9FB] border-[#E8E8ED]";
  const mP = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const mS = dm ? "text-[#98989D]" : "text-[#86868B]";
  const inputCls = `px-2 py-1 rounded-lg border text-xs focus:outline-none focus:border-[#E8740E] ${dm ? "bg-[#3A3A3C] border-[#4A4A4C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;
  const totalCusto = produtos.reduce((s, p) => s + Number(p.custo_unitario || 0), 0);

  const startEdit = (p: ProdutoEstoque) => {
    setEditingId(p.id);
    setEditFields({
      produto: p.produto,
      serial_no: p.serial_no || "",
      imei: p.imei || "",
      custo_unitario: String(p.custo_unitario || ""),
      cor: p.cor || "",
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    const updates: Record<string, unknown> = {};
    const orig = produtos.find((p) => p.id === editingId);
    if (!orig) { setSaving(false); return; }
    if (editFields.produto !== orig.produto) updates.produto = editFields.produto;
    if (editFields.serial_no !== (orig.serial_no || "")) updates.serial_no = editFields.serial_no || null;
    if (editFields.imei !== (orig.imei || "")) updates.imei = editFields.imei || null;
    if (editFields.cor !== (orig.cor || "")) updates.cor = editFields.cor || null;
    if (editFields.custo_unitario !== String(orig.custo_unitario || "")) updates.custo_unitario = parseFloat(editFields.custo_unitario) || 0;

    if (Object.keys(updates).length > 0) {
      await fetch("/api/estoque", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": encodeURIComponent(userName) },
        body: JSON.stringify({ id: editingId, ...updates }),
      });
      setProdutos((prev) => prev.map((p) => p.id === editingId ? { ...p, ...updates } as ProdutoEstoque : p));
      fetchEstoque();
      setMsg("Produto atualizado!");
    }
    setEditingId(null);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEntradaView(null)} onKeyDown={(e) => { if (e.key === "Escape") { if (editingId) setEditingId(null); else setEntradaView(null); } }} tabIndex={-1} ref={(el: HTMLDivElement | null) => el?.focus()}>
      <div className={`w-full max-w-3xl mx-4 ${mBg} rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className={`flex items-center justify-between px-5 py-4 border-b ${dm ? "border-[#3A3A3C]" : "border-[#E8E8ED]"}`}>
          <div>
            <h3 className={`text-sm font-bold ${mP}`}>Entrada de Produtos</h3>
            <p className={`text-xs ${mS}`}>{fmtDate(data)} — {fornecedor}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs font-semibold ${mS}`}>{produtos.length} itens | {fmt(totalCusto)}</span>
            <button onClick={() => setEntradaView(null)} className={`w-8 h-8 flex items-center justify-center rounded-full ${dm ? "hover:bg-[#3A3A3C]" : "hover:bg-[#F0F0F5]"} ${mS} hover:text-[#E8740E] text-lg`}>✕</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={`border-b ${dm ? "border-[#3A3A3C] bg-[#2C2C2E]" : "border-[#E8E8ED] bg-[#F9F9FB]"}`}>
                <th className={`px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider ${mS}`}>Produto</th>
                <th className={`px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider ${mS}`}>Serial</th>
                <th className={`px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider ${mS}`}>Status</th>
                <th className={`px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider ${mS}`}>Custo</th>
                <th className={`px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-wider ${mS} w-20`}></th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <React.Fragment key={p.id}>
                  <tr className={`border-b ${dm ? "border-[#3A3A3C] hover:bg-[#2C2C2E]" : "border-[#F0F0F5] hover:bg-[#FAFAFA]"} transition-colors ${editingId === p.id ? (dm ? "bg-[#2C2C2E]" : "bg-[#FFF8F0]") : ""}`}>
                    <td className={`px-4 py-3 ${mP}`}>
                      <div className="font-medium text-xs">{p.produto}</div>
                      {p.cor && <span className={`text-[10px] ${mS}`}>{p.cor}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-mono text-purple-500">{p.serial_no || "—"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${p.status === "EM ESTOQUE" ? "bg-green-100 text-green-700" : p.status === "VENDIDO" || p.status === "ESGOTADO" ? "bg-gray-100 text-gray-600" : "bg-yellow-100 text-yellow-700"}`}>{p.status}</span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${mP}`}>{p.custo_unitario ? fmt(p.custo_unitario) : "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${dm ? "text-[#F5A623] hover:bg-[#E8740E]/20" : "text-[#E8740E] hover:bg-[#E8740E]/10"}`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEntradaView(null); setDetailProduct(p); }}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${dm ? "text-[#98989D] hover:bg-[#3A3A3C]" : "text-[#86868B] hover:bg-[#F0F0F5]"}`}
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingId === p.id && (
                    <tr className={`border-b ${dm ? "border-[#E8740E]/30 bg-[#E8740E]/5" : "border-[#E8740E]/20 bg-[#FFF8F0]"}`}>
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          <div><p className={`text-[10px] uppercase ${mS}`}>Produto</p><input value={editFields.produto} onChange={(e) => setEditFields({ ...editFields, produto: e.target.value })} className={`${inputCls} w-full`} /></div>
                          <div><p className={`text-[10px] uppercase ${mS}`}>Serial</p><input value={editFields.serial_no} onChange={(e) => setEditFields({ ...editFields, serial_no: e.target.value })} className={`${inputCls} w-full font-mono`} /></div>
                          <div><p className={`text-[10px] uppercase ${mS}`}>IMEI</p><input value={editFields.imei} onChange={(e) => setEditFields({ ...editFields, imei: e.target.value })} className={`${inputCls} w-full font-mono`} /></div>
                          <div><p className={`text-[10px] uppercase ${mS}`}>Cor</p><input value={editFields.cor} onChange={(e) => setEditFields({ ...editFields, cor: e.target.value })} className={`${inputCls} w-full`} /></div>
                          <div><p className={`text-[10px] uppercase ${mS}`}>Custo (R$)</p><input type="number" value={editFields.custo_unitario} onChange={(e) => setEditFields({ ...editFields, custo_unitario: e.target.value })} className={`${inputCls} w-full`} /></div>
                          <div className="flex items-end gap-2">
                            <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] disabled:opacity-50">{saving ? "..." : "Salvar"}</button>
                            <button onClick={() => setEditingId(null)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Cancelar</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3">
          <button onClick={() => setEntradaView(null)} className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${dm ? "bg-[#3A3A3C] text-[#F5F5F7] hover:bg-[#4A4A4C]" : "bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED]"}`}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

/* ── Histórico de Movimentações ── */
type LogEntry = { id: string; created_at: string; usuario: string; acao: string; produto_nome: string; campo: string; valor_anterior: string; valor_novo: string; detalhes: string };

function HistoricoTab({ password, logs, setLogs, loading, setLoading }: {
  password: string; logs: LogEntry[]; setLogs: (l: LogEntry[]) => void; loading: boolean; setLoading: (b: boolean) => void;
}) {
  const { darkMode: dm } = useAdmin();
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque?action=historico&limit=200", { headers: { "x-admin-password": password, "x-admin-user": "sistema" } });
      const data = await res.json();
      setLogs(data.logs ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }, [password, setLogs, setLoading]);

  useEffect(() => { if (logs.length === 0) fetchLogs(); }, [fetchLogs, logs.length]);

  const ACAO_EMOJI: Record<string, string> = { alteracao: "✏️", exclusao: "🗑️", entrada: "📥", saida: "📤", criacao: "➕" };

  if (loading) return <div className="text-center py-8 text-[#86868B]">Carregando historico...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#86868B] uppercase">{logs.length} movimentacoes</h3>
        <button onClick={fetchLogs} className="px-3 py-1.5 rounded-lg bg-[#E8740E] text-white text-xs font-semibold">🔄 Atualizar</button>
      </div>
      {logs.length === 0 ? (
        <p className="text-center text-[#86868B] py-8">Nenhuma movimentacao registrada</p>
      ) : (
        <div className={`${dm ? "bg-[#1C1C1E]" : "bg-white"} rounded-2xl border ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"} overflow-hidden`}>
          <div className={`divide-y ${dm ? "divide-[#2C2C2E]" : "divide-[#F5F5F7]"}`}>
            {logs.map((log) => (
              <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                <span className="text-lg mt-0.5">{ACAO_EMOJI[log.acao] || "📋"}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-sm font-semibold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{log.produto_nome}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${dm ? "bg-[#2C2C2E] text-[#98989D]" : "bg-[#F5F5F7] text-[#86868B]"} font-medium uppercase`}>{log.acao}</span>
                  </div>
                  {log.campo && (
                    <p className={`text-xs ${dm ? "text-[#98989D]" : "text-[#86868B]"} mt-0.5`}>
                      <span className="font-medium">{log.campo}:</span>{" "}
                      {log.valor_anterior && <span className="line-through text-red-400">{log.valor_anterior}</span>}
                      {log.valor_anterior && log.valor_novo && " → "}
                      {log.valor_novo && <span className={`${dm ? "text-green-400" : "text-green-600"} font-medium`}>{log.valor_novo}</span>}
                    </p>
                  )}
                  {log.detalhes && <p className={`text-[11px] ${dm ? "text-[#98989D]" : "text-[#86868B]"} mt-0.5`}>{log.detalhes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{new Date(log.created_at).toLocaleDateString("pt-BR")}</p>
                  <p className={`text-[10px] ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
                  <p className="text-[10px] font-medium text-[#E8740E] mt-0.5">{log.usuario}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Scan Entrada (Serial Number) ── */
function ScanEntradaTab({ password, userName, onSuccess }: { password: string; userName: string; onSuccess: () => void }) {
  const { darkMode: dm } = useAdmin();
  const [step, setStep] = useState<"scan" | "form" | "result">("scan");
  const [serialNo, setSerialNo] = useState("");
  const [scanResult, setScanResult] = useState<{ found: boolean; status?: string; produto?: Record<string, unknown>; message?: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    categoria: "IPHONES", produto: "", cor: "", armazenamento: "",
    custo_unitario: "", fornecedor: "", data_compra: hojeBR(),
    imei: "", imei2: "", observacao: "",
  });
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    fetch("/api/fornecedores", { headers: { "x-admin-password": password, "x-admin-user": "sistema" } })
      .then(r => r.json()).then(d => setFornecedores(d.data ?? d.fornecedores ?? [])).catch(() => {});
  }, [password]);

  const handleScan = async (code: string) => {
    setError(""); setSuccess("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName), "Content-Type": "application/json" },
        body: JSON.stringify({ serial_no: code }),
      });
      const data = await res.json();
      setScanResult(data);
      setSerialNo(code);

      if (!data.found) {
        // Produto novo — abrir formulário com form resetado
        setForm({
          categoria: "IPHONES", produto: "", cor: "", armazenamento: "",
          custo_unitario: "", fornecedor: "", data_compra: hojeBR(),
          imei: "", imei2: "", observacao: "",
        });
        setStep("form");
      } else if (data.status === "EM_ESTOQUE") {
        setStep("result");
        setSuccess(`⚠️ Produto já em estoque: ${data.produto?.produto || code}`);
      } else if (data.status === "VENDIDO") {
        setStep("result");
        setError(`❌ Produto já vendido: ${data.message || code}`);
      }
    } catch {
      setError("Erro ao consultar. Verifique sua conexão.");
    }
  };

  const handleSave = async () => {
    if (!form.produto && !form.armazenamento) {
      setError("Preencha pelo menos o produto e armazenamento");
      return;
    }
    setSaving(true); setError("");

    // Build product name from specs
    const produtoNome = form.produto || `${form.categoria} ${form.armazenamento}`;

    try {
      const res = await fetch("/api/scan", {
        method: "PUT",
        headers: { "x-admin-password": password, "x-admin-user": encodeURIComponent(userName), "Content-Type": "application/json" },
        body: JSON.stringify({
          serial_no: serialNo,
          imei: form.imei,
          imei2: form.imei2,
          categoria: form.categoria,
          produto: produtoNome,
          cor: form.cor,
          armazenamento: form.armazenamento,
          custo_unitario: form.custo_unitario ? Number(form.custo_unitario) : 0,
          fornecedor: form.fornecedor,
          data_compra: form.data_compra,
          observacao: form.observacao,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setSuccess(`✅ ${data.message}`);
        setStep("result");
        onSuccess();
        // Reset for next scan
        setTimeout(() => {
          setStep("scan");
          setSerialNo("");
          setScanResult(null);
          setSuccess("");
          setForm(f => ({ ...f, produto: "", cor: "", armazenamento: "", custo_unitario: "", imei: "", imei2: "", observacao: "" }));
        }, 2000);
      } else {
        setError(data.error || "Erro ao salvar");
      }
    } catch {
      setError("Erro de conexão");
    }
    setSaving(false);
  };

  const labelCls = `text-xs font-semibold uppercase tracking-wide mb-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`;
  const inputCls = `w-full px-3 py-2.5 border rounded-xl text-sm focus:border-[#E8740E] focus:ring-1 focus:ring-[#E8740E] outline-none ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-white border-[#D2D2D7] text-[#1D1D1F]"}`;
  const selectCls = inputCls + " appearance-none";

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="text-center">
        <h2 className={`text-xl font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>📦 Entrada de Produto</h2>
        <p className={`text-sm mt-1 ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Escaneie o Serial Number da caixa do produto</p>
      </div>

      {error && <div className={`px-4 py-3 rounded-xl text-sm ${dm ? "bg-red-900/30 border border-red-800 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>{error}</div>}
      {success && <div className={`px-4 py-3 rounded-xl text-sm ${dm ? "bg-green-900/30 border border-green-800 text-green-400" : "bg-green-50 border border-green-200 text-green-700"}`}>{success}</div>}

      {/* STEP 1: Scan */}
      {step === "scan" && (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"} rounded-2xl border p-6 space-y-4`}>
          <p className={`text-sm text-center ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Bipe com o leitor USB ou use a câmera do celular</p>
          <BarcodeScanner onScan={handleScan} placeholder="Serial Number..." />
        </div>
      )}

      {/* STEP 2: Formulário de Cadastro */}
      {step === "form" && (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"} rounded-2xl border p-6 space-y-4`}>
          <div className={`px-4 py-3 rounded-xl ${dm ? "bg-[#1C1C1E] border border-[#3A3A3C]" : "bg-green-50 border border-green-200"}`}>
            <p className={`text-sm font-medium ${dm ? "text-[#F5F5F7]" : "text-green-800"}`}>🆕 Produto novo detectado</p>
            <p className={`text-xs font-mono mt-1 ${dm ? "text-[#A1A1A6]" : "text-green-600"}`}>SN: {serialNo}</p>
          </div>

          {/* Categoria */}
          <div>
            <p className={labelCls}>Categoria</p>
            <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} className={selectCls}>
              {DEFAULT_CATEGORIAS.map(c => <option key={c} value={c}>{CAT_LABELS[c] || c}</option>)}
            </select>
          </div>

          {/* Produto (nome completo) */}
          <div>
            <p className={labelCls}>Produto (nome completo)</p>
            <input value={form.produto} onChange={e => setForm(f => ({ ...f, produto: e.target.value }))} placeholder="Ex: IPHONE 17 PRO MAX 256GB" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Armazenamento */}
            <div>
              <p className={labelCls}>Armazenamento</p>
              <select value={form.armazenamento} onChange={e => setForm(f => ({ ...f, armazenamento: e.target.value }))} className={selectCls}>
                <option value="">—</option>
                {["64GB","128GB","256GB","512GB","1TB","2TB"].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {/* Cor */}
            <div>
              <p className={labelCls}>Cor</p>
              <input value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))} placeholder="Ex: Titânio Natural" className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Custo */}
            <div>
              <p className={labelCls}>Custo (R$)</p>
              <input type="number" value={form.custo_unitario} onChange={e => setForm(f => ({ ...f, custo_unitario: e.target.value }))} placeholder="0" className={inputCls} />
            </div>
            {/* Fornecedor */}
            <div>
              <p className={labelCls}>Fornecedor</p>
              <select value={form.fornecedor} onChange={e => setForm(f => ({ ...f, fornecedor: e.target.value }))} className={selectCls}>
                <option value="">— Selecionar —</option>
                {fornecedores.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
              </select>
            </div>
          </div>

          {/* IMEI (só iPhones) */}
          {getBaseCat(form.categoria) === "IPHONES" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={labelCls}>IMEI</p>
                <input value={form.imei} onChange={e => setForm(f => ({ ...f, imei: e.target.value }))} placeholder="Opcional" className={inputCls} />
              </div>
              <div>
                <p className={labelCls}>IMEI 2</p>
                <input value={form.imei2} onChange={e => setForm(f => ({ ...f, imei2: e.target.value }))} placeholder="Opcional" className={inputCls} />
              </div>
            </div>
          )}

          {/* Data compra */}
          <div>
            <p className={labelCls}>Data da Compra</p>
            <input type="date" value={form.data_compra} onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} className={inputCls} />
          </div>

          {/* Observação */}
          <div>
            <p className={labelCls}>Observação</p>
            <input value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))} placeholder="Opcional" className={inputCls} />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => { setStep("scan"); setSerialNo(""); setScanResult(null); setError(""); }}
              className={`flex-1 py-3 rounded-xl border font-medium transition-colors ${dm ? "border-[#3A3A3C] text-[#98989D] hover:bg-[#2C2C2E]" : "border-[#D2D2D7] text-[#86868B] hover:bg-[#F5F5F7]"}`}
            >
              ← Voltar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !form.produto}
              className="flex-1 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-40"
            >
              {saving ? "Salvando..." : "✅ Cadastrar no Estoque"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Resultado */}
      {step === "result" && (
        <div className={`${dm ? "bg-[#1C1C1E] border-[#3A3A3C]" : "bg-white border-[#E5E5EA]"} rounded-2xl border p-6 space-y-4 text-center`}>
          {scanResult?.found && scanResult?.produto && (
            <div className="space-y-2">
              <p className={`text-lg font-bold ${dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]"}`}>{String(scanResult.produto.produto || "")}</p>
              <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>{String(scanResult.produto.cor || "")} — SN: {serialNo}</p>
              <p className={`text-sm ${dm ? "text-[#98989D]" : "text-[#86868B]"}`}>Status: <span className="font-medium">{String(scanResult.produto.status || scanResult.status || "")}</span></p>
            </div>
          )}
          <button
            onClick={() => { setStep("scan"); setSerialNo(""); setScanResult(null); setError(""); setSuccess(""); }}
            className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors"
          >
            📟 Escanear outro produto
          </button>
        </div>
      )}
    </div>
  );
}
