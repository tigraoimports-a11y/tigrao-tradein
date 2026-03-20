"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

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
}

interface Fornecedor {
  id: string;
  nome: string;
  contato: string | null;
  observacao: string | null;
}

const CATEGORIAS = ["IPHONES", "IPADS", "MACBOOK", "MAC_MINI", "APPLE_WATCH", "AIRPODS", "ACESSORIOS", "OUTROS"] as const;
const STATUS_OPTIONS = ["EM ESTOQUE", "A CAMINHO", "PENDENTE", "ESGOTADO"] as const;

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const CAT_LABELS: Record<string, string> = {
  IPHONES: "iPhones",
  IPADS: "iPads",
  MACBOOK: "MacBooks",
  MAC_MINI: "Mac Mini",
  APPLE_WATCH: "Apple Watch",
  AIRPODS: "AirPods",
  ACESSORIOS: "Acessorios",
  OUTROS: "Outros",
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

  if (categoria === "APPLE_WATCH") {
    if (p.includes("ULTRA")) return "Apple Watch Ultra";
    if (p.includes("SE")) return "Apple Watch SE";
    if (p.includes("S11") || p.includes("SERIES 11")) return "Apple Watch Series 11";
    if (p.includes("S10") || p.includes("SERIES 10")) return "Apple Watch Series 10";
    return "Apple Watch";
  }
  if (categoria === "IPHONES") {
    const match = p.match(/IPHONE\s*(\d+)\s*(PRO\s*MAX|PRO|PLUS)?/i);
    if (match) return `iPhone ${match[1]}${match[2] ? " " + match[2].trim() : ""}`;
    return produto;
  }
  if (categoria === "IPADS") {
    if (p.includes("MINI")) return "iPad Mini";
    if (p.includes("AIR")) return "iPad Air";
    if (p.includes("PRO")) return "iPad Pro";
    return "iPad";
  }
  if (categoria === "MAC_MINI") {
    return "Mac Mini";
  }
  if (categoria === "MACBOOK") {
    if (p.includes("AIR") && (p.includes("15") || p.includes("15\""))) return "MacBook Air 15\"";
    if (p.includes("AIR")) return "MacBook Air 13\"";
    if (p.includes("PRO") && (p.includes("16") || p.includes("16\""))) return "MacBook Pro 16\"";
    if (p.includes("PRO") && (p.includes("14") || p.includes("14\""))) return "MacBook Pro 14\"";
    if (p.includes("PRO")) return "MacBook Pro";
    return "MacBook";
  }
  if (categoria === "AIRPODS") {
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
  const { password, user } = useAdmin();
  const userName = user?.nome ?? "sistema";
  const [estoque, setEstoque] = useState<ProdutoEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"estoque" | "seminovos" | "pendencias" | "acaminho" | "esgotados" | "acabando" | "novo">("estoque");
  const [filterCat, setFilterCat] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [editingCusto, setEditingCusto] = useState<Record<string, string>>({});
  const [editingQnt, setEditingQnt] = useState<Record<string, string>>({});
  const [editingCat, setEditingCat] = useState<Record<string, string>>({});
  const [importingInitial, setImportingInitial] = useState(false);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [showNovoFornecedor, setShowNovoFornecedor] = useState(false);
  const [novoFornecedorNome, setNovoFornecedorNome] = useState("");

  const [form, setForm] = useState({
    produto: "", categoria: "IPHONES", qnt: "1", custo_unitario: "",
    status: "EM ESTOQUE", cor: "", observacao: "", tipo: "NOVO",
    bateria: "", cliente: "", fornecedor: "",
  });

  // Campos estruturados por categoria
  const [spec, setSpec] = useState({
    // IPHONES
    ip_modelo: "16", ip_linha: "", ip_storage: "128GB",
    // MACBOOK
    mb_modelo: "AIR", mb_tela: "13\"", mb_chip: "M4", mb_ram: "16GB", mb_storage: "256GB",
    // MAC_MINI
    mm_chip: "M4", mm_ram: "16GB", mm_storage: "256GB",
    // IPADS
    ipad_modelo: "AIR", ipad_tela: "11\"", ipad_storage: "128GB", ipad_conn: "WIFI",
    // APPLE_WATCH
    aw_modelo: "SERIES 10", aw_tamanho: "42mm", aw_conn: "GPS",
    // AIRPODS
    air_modelo: "AIRPODS 4",
  });
  const setS = (field: string, value: string) => setSpec((s) => ({ ...s, [field]: value }));

  // Gerar nome do produto automaticamente a partir dos campos estruturados
  const buildProdutoName = (cat: string): string => {
    switch (cat) {
      case "IPHONES": {
        const linha = spec.ip_linha ? ` ${spec.ip_linha}` : "";
        return `IPHONE ${spec.ip_modelo}${linha} ${spec.ip_storage}`;
      }
      case "MAC_MINI":
        return `MAC MINI ${spec.mm_chip} ${spec.mm_ram} ${spec.mm_storage}`;
      case "MACBOOK": {
        const tipo = spec.mb_modelo === "AIR" ? "MACBOOK AIR" : "MACBOOK PRO";
        return `${tipo} ${spec.mb_chip} ${spec.mb_tela} ${spec.mb_ram} ${spec.mb_storage}`;
      }
      case "IPADS": {
        const modelo = spec.ipad_modelo === "IPAD" ? "IPAD" : `IPAD ${spec.ipad_modelo}`;
        const conn = spec.ipad_conn === "WIFI+CELL" ? " WIFI+CELLULAR" : "";
        return `${modelo} ${spec.ipad_tela} ${spec.ipad_storage}${conn}`;
      }
      case "APPLE_WATCH": {
        const conn = spec.aw_conn === "GPS+CELL" ? " GPS+CELLULAR" : " GPS";
        return `APPLE WATCH ${spec.aw_modelo} ${spec.aw_tamanho}${conn}`;
      }
      case "AIRPODS":
        return spec.air_modelo;
      default:
        return "";
    }
  };

  // Verificar se a categoria tem campos estruturados
  const hasStructuredFields = ["IPHONES", "MACBOOK", "MAC_MINI", "IPADS", "APPLE_WATCH", "AIRPODS"].includes(form.categoria);

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": userName } });
      if (res.ok) { const json = await res.json(); setEstoque(json.data ?? []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  const fetchFornecedores = useCallback(async () => {
    try {
      const res = await fetch("/api/fornecedores", { headers: { "x-admin-password": password } });
      if (res.ok) { const json = await res.json(); setFornecedores(json.data ?? []); }
    } catch { /* ignore */ }
  }, [password]);

  useEffect(() => { fetchEstoque(); fetchFornecedores(); }, [fetchEstoque, fetchFornecedores]);

  const handleAddFornecedor = async () => {
    if (!novoFornecedorNome.trim()) return;
    const res = await fetch("/api/fornecedores", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
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
    await fetch("/api/estoque", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": userName },
      body: JSON.stringify({ id, ...fields }),
    });
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

  const handleMoverParaEstoque = async (item: ProdutoEstoque) => {
    const novoTipo = item.tipo === "PENDENCIA" ? "SEMINOVO" : "NOVO";
    await apiPatch(item.id, { tipo: novoTipo, status: "EM ESTOQUE" });
    setEstoque((prev) => prev.map((p) => p.id === item.id ? { ...p, tipo: novoTipo, status: "EM ESTOQUE" } : p));
    setMsg(`${item.produto} movido para estoque${novoTipo === "SEMINOVO" ? " (seminovo)" : ""}!`);
  };

  const handleSubmit = async () => {
    const nomeProduto = hasStructuredFields ? buildProdutoName(form.categoria) : form.produto;
    if (!nomeProduto) { setMsg("Preencha o nome do produto"); return; }
    const res = await fetch("/api/estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": userName },
      body: JSON.stringify({
        produto: nomeProduto, categoria: form.categoria,
        qnt: parseInt(form.qnt) || 0, custo_unitario: parseFloat(form.custo_unitario) || 0,
        status: form.tipo === "A_CAMINHO" ? "A CAMINHO" : form.tipo === "PENDENCIA" ? "PENDENTE" : "EM ESTOQUE",
        cor: form.cor || null, observacao: form.observacao || null,
        tipo: form.tipo, bateria: form.bateria ? parseInt(form.bateria) : null,
        cliente: form.cliente || null, fornecedor: form.fornecedor || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Produto adicionado!");
      setForm((f) => ({ ...f, produto: "", qnt: "1", custo_unitario: "", cor: "", observacao: "", bateria: "", cliente: "", fornecedor: "" }));
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
        headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": userName },
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
  const emEstoque = novos.filter((p) => p.qnt > 0);
  const seminovos = estoque.filter((p) => p.tipo === "SEMINOVO");
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
      if (!p.produto.toLowerCase().includes(s) && !(p.cor?.toLowerCase().includes(s))) return false;
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

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";

  const isPendenciasTab = tab === "pendencias";

  // renderProductRow removido — agora renderizado inline com agrupamento por produto/cor

  return (
    <div className="space-y-6">
      {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

      {estoque.length === 0 && !loading && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-8 text-center shadow-sm">
          <p className="text-[#86868B] mb-4">Estoque vazio. Importar produtos da planilha ESTOQUE 2026?</p>
          <button onClick={handleImportInitial} disabled={importingInitial} className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {importingInitial ? "Importando..." : "Importar Estoque da Planilha"}
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Produtos", value: totalProdutos, color: "#E8740E" },
          { label: "Unidades", value: totalUnidades, color: "#3498DB" },
          { label: "Valor Estoque", value: fmt(valorEstoque), color: "#2ECC71" },
          { label: "Seminovos", value: `${seminovos.length} (${fmt(valorSeminovos)})`, color: "#9B59B6" },
          { label: "Pendencias", value: pendencias.length, color: "#F39C12" },
          { label: "A Caminho", value: `${aCaminho.length} (${fmt(valorACaminho)})`, color: "#3498DB" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-[#D2D2D7] rounded-2xl p-3 shadow-sm">
            <p className="text-[#86868B] text-[10px] uppercase tracking-wider">{kpi.label}</p>
            <p className="text-lg font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <div className="flex gap-2 items-center">
          {([
            { key: "estoque", label: `Estoque (${emEstoque.length})`, color: "" },
            { key: "acabando", label: `Acabando (${acabando.length})`, color: "yellow" },
            { key: "esgotados", label: `Esgotados (${esgotados.length})`, color: "red" },
            { key: "seminovos", label: `Seminovos (${seminovos.length})`, color: "" },
            { key: "pendencias", label: `Pendencias (${pendencias.length})`, color: "" },
            { key: "acaminho", label: `A Caminho (${aCaminho.length})`, color: "" },
            { key: "novo", label: "Adicionar", color: "" },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              tab === t.key
                ? t.color === "red" ? "bg-red-500 text-white" : t.color === "yellow" ? "bg-yellow-500 text-white" : "bg-[#E8740E] text-white"
                : t.color === "red" && esgotados.length > 0 ? "bg-white border border-red-300 text-red-500 hover:border-red-500"
                : t.color === "yellow" && acabando.length > 0 ? "bg-white border border-yellow-300 text-yellow-600 hover:border-yellow-500"
                : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"
            }`}>
              {t.label}
            </button>
          ))}
        </div>
        {tab !== "novo" && (
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs">
              <option value="">Todas categorias</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="px-3 py-1.5 rounded-lg border border-[#D2D2D7] text-xs w-40 focus:outline-none focus:border-[#E8740E]" />
          </div>
        )}
      </div>

      {tab === "novo" ? (
        /* FORMULÁRIO */
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-[#1D1D1F]">Adicionar Produto</h2>

          {/* Row 1: Categoria + Tipo */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className={labelCls}>Categoria</p><select value={form.categoria} onChange={(e) => { set("categoria", e.target.value); set("produto", ""); }} className={inputCls}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select></div>
            <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
              <option value="NOVO">Novo (Lacrado)</option>
              <option value="SEMINOVO">Seminovo</option>
              <option value="A_CAMINHO">A Caminho</option>
            </select></div>
          </div>

          {/* Campos específicos por categoria */}
          {form.categoria === "IPHONES" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-[#F5F5F7] rounded-xl">
              <div><p className={labelCls}>Modelo</p><select value={spec.ip_modelo} onChange={(e) => setS("ip_modelo", e.target.value)} className={inputCls}>
                {["11", "11 PRO", "11 PRO MAX", "12", "12 PRO", "12 PRO MAX", "13", "13 PRO", "13 PRO MAX", "14", "14 PLUS", "14 PRO", "14 PRO MAX", "15", "15 PLUS", "15 PRO", "15 PRO MAX", "16", "16 PLUS", "16 PRO", "16 PRO MAX", "17 PRO", "17 PRO MAX"].map((m) => <option key={m} value={m}>{`iPhone ${m}`}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.ip_storage} onChange={(e) => setS("ip_storage", e.target.value)} className={inputCls}>
                {["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
            </div>
          )}

          {form.categoria === "MACBOOK" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-[#F5F5F7] rounded-xl">
              <div><p className={labelCls}>Modelo</p><select value={spec.mb_modelo} onChange={(e) => setS("mb_modelo", e.target.value)} className={inputCls}>
                <option value="AIR">MacBook Air</option>
                <option value="PRO">MacBook Pro</option>
              </select></div>
              <div><p className={labelCls}>Tela</p><select value={spec.mb_tela} onChange={(e) => setS("mb_tela", e.target.value)} className={inputCls}>
                {spec.mb_modelo === "AIR"
                  ? [<option key='13"' value='13"'>13 polegadas</option>, <option key='15"' value='15"'>15 polegadas</option>]
                  : [<option key='14"' value='14"'>14 polegadas</option>, <option key='16"' value='16"'>16 polegadas</option>]
                }
              </select></div>
              <div><p className={labelCls}>Chip</p><select value={spec.mb_chip} onChange={(e) => setS("mb_chip", e.target.value)} className={inputCls}>
                {["M1", "M2", "M3", "M4", "M4 PRO", "M4 MAX"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
              <div><p className={labelCls}>RAM</p><select value={spec.mb_ram} onChange={(e) => setS("mb_ram", e.target.value)} className={inputCls}>
                {["8GB", "16GB", "18GB", "24GB", "32GB", "36GB", "48GB", "64GB", "128GB"].map((r) => <option key={r}>{r}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.mb_storage} onChange={(e) => setS("mb_storage", e.target.value)} className={inputCls}>
                {["256GB", "512GB", "1TB", "2TB", "4TB", "8TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
            </div>
          )}

          {form.categoria === "MAC_MINI" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-[#F5F5F7] rounded-xl">
              <div><p className={labelCls}>Chip</p><select value={spec.mm_chip} onChange={(e) => setS("mm_chip", e.target.value)} className={inputCls}>
                {["M1", "M2", "M2 PRO", "M4", "M4 PRO"].map((c) => <option key={c}>{c}</option>)}
              </select></div>
              <div><p className={labelCls}>RAM</p><select value={spec.mm_ram} onChange={(e) => setS("mm_ram", e.target.value)} className={inputCls}>
                {["8GB", "16GB", "24GB", "32GB", "48GB", "64GB"].map((r) => <option key={r}>{r}</option>)}
              </select></div>
              <div><p className={labelCls}>Armazenamento</p><select value={spec.mm_storage} onChange={(e) => setS("mm_storage", e.target.value)} className={inputCls}>
                {["256GB", "512GB", "1TB", "2TB"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
            </div>
          )}

          {form.categoria === "IPADS" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-[#F5F5F7] rounded-xl">
              <div><p className={labelCls}>Modelo</p><select value={spec.ipad_modelo} onChange={(e) => setS("ipad_modelo", e.target.value)} className={inputCls}>
                <option value="IPAD">iPad</option>
                <option value="MINI">iPad Mini</option>
                <option value="AIR">iPad Air</option>
                <option value="PRO">iPad Pro</option>
              </select></div>
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

          {form.categoria === "APPLE_WATCH" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-[#F5F5F7] rounded-xl">
              <div><p className={labelCls}>Modelo</p><select value={spec.aw_modelo} onChange={(e) => setS("aw_modelo", e.target.value)} className={inputCls}>
                {["SE", "SERIES 10", "SERIES 11", "ULTRA", "ULTRA 2"].map((m) => <option key={m}>{m}</option>)}
              </select></div>
              <div><p className={labelCls}>Tamanho</p><select value={spec.aw_tamanho} onChange={(e) => setS("aw_tamanho", e.target.value)} className={inputCls}>
                {["40mm", "42mm", "44mm", "45mm", "46mm", "49mm"].map((t) => <option key={t}>{t}</option>)}
              </select></div>
              <div><p className={labelCls}>Conectividade</p><select value={spec.aw_conn} onChange={(e) => setS("aw_conn", e.target.value)} className={inputCls}>
                <option value="GPS">GPS</option>
                <option value="GPS+CELL">GPS + Cellular</option>
              </select></div>
            </div>
          )}

          {form.categoria === "AIRPODS" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-[#F5F5F7] rounded-xl">
              <div><p className={labelCls}>Modelo</p><select value={spec.air_modelo} onChange={(e) => setS("air_modelo", e.target.value)} className={inputCls}>
                {["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX", "AIRPODS MAX 2"].map((m) => <option key={m}>{m}</option>)}
              </select></div>
            </div>
          )}

          {/* Categorias sem campos estruturados: texto livre */}
          {!hasStructuredFields && (
            <div><p className={labelCls}>Nome do Produto</p><input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: Cabo USB-C Lightning 1m" className={inputCls} /></div>
          )}

          {/* Preview do nome gerado */}
          {hasStructuredFields && (
            <div className="px-4 py-3 bg-gradient-to-r from-[#1E1208] to-[#2A1A0F] rounded-xl">
              <p className="text-xs text-white/60 mb-1">Nome do produto (gerado automaticamente)</p>
              <p className="text-white font-semibold">{buildProdutoName(form.categoria)}</p>
            </div>
          )}

          {/* Row: Cor, Qtd, Custo, Fornecedor */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelCls}>Cor</p><input value={form.cor} onChange={(e) => set("cor", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Quantidade</p><input type="number" value={form.qnt} onChange={(e) => set("qnt", e.target.value)} className={inputCls} /></div>
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
                  <button onClick={() => setShowNovoFornecedor(false)} className="px-2 py-2 rounded-xl border border-[#D2D2D7] text-[#86868B] text-xs shrink-0">X</button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <select value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls}>
                    <option value="">— Selecionar —</option>
                    {fornecedores.map((f) => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                  </select>
                  <button onClick={() => setShowNovoFornecedor(true)} className="px-3 py-2 rounded-xl border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E] text-xs font-bold shrink-0" title="Cadastrar novo fornecedor">+</button>
                </div>
              )}
            </div>
          </div>
          {form.tipo === "SEMINOVO" && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-[#F5F5F7] rounded-xl">
              <div><p className={labelCls}>Bateria %</p><input type="number" value={form.bateria} onChange={(e) => set("bateria", e.target.value)} placeholder="Ex: 92" className={inputCls} /></div>
              <div><p className={labelCls}>Cliente (comprado de)</p><input value={form.cliente} onChange={(e) => set("cliente", e.target.value)} className={inputCls} /></div>
              <div><p className={labelCls}>Observacoes</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} placeholder="Grade, caixa, garantia..." className={inputCls} /></div>
            </div>
          )}
          {form.tipo !== "SEMINOVO" && (
            <div><p className={labelCls}>Observacao</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} className={inputCls} /></div>
          )}
          <button onClick={handleSubmit} className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors">Adicionar</button>
        </div>
      ) : (
        /* LISTA */
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 text-center text-[#86868B]">Carregando...</div>
          ) : Object.keys(byCat).length === 0 ? (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
              <p className="text-[#86868B]">Nenhum produto encontrado.</p>
            </div>
          ) : (
            Object.entries(byCat).sort(([a], [b]) => a.localeCompare(b)).map(([cat, modelos]) => (
              <div key={cat} className="space-y-3">
                <h2 className="text-lg font-bold text-[#1D1D1F] flex items-center gap-2">
                  {CAT_LABELS[cat] || cat}
                  <span className="text-xs font-normal text-[#86868B]">
                    {Object.values(modelos).flat().length} produtos | {Object.values(modelos).flat().reduce((s, p) => s + p.qnt, 0)} un.
                  </span>
                </h2>

                {Object.entries(modelos).sort(([a], [b]) => a.localeCompare(b)).map(([modelo, items]) => {
                  // Sub-agrupar por nome do produto (sem cor)
                  const byProduto: Record<string, ProdutoEstoque[]> = {};
                  items.forEach((p) => {
                    if (!byProduto[p.produto]) byProduto[p.produto] = [];
                    byProduto[p.produto].push(p);
                  });
                  const produtoEntries = Object.entries(byProduto).sort(([a], [b]) => a.localeCompare(b));

                  return (
                  <div key={modelo} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-5 py-2.5 bg-[#F5F5F7] border-b border-[#D2D2D7] flex items-center justify-between">
                      <h3 className="font-semibold text-[#1D1D1F] text-sm">{modelo}</h3>
                      <span className="text-[10px] text-[#86868B]">{items.length} var. | {items.reduce((s, p) => s + p.qnt, 0)} un. | {fmt(items.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0))}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {produtoEntries.map(([prodNome, prodItems]) => {
                            const showObs = tab === "seminovos" || isPendenciasTab;
                            const showMover = tab === "acaminho" || isPendenciasTab;
                            const prodTotal = prodItems.reduce((s, p) => s + p.qnt, 0);
                            const prodValor = prodItems.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0);

                            return (
                              <React.Fragment key={prodNome}>
                                {/* Header do produto — sempre mostra */}
                                <tr className="bg-[#FAFAFA] border-b border-[#E8E8ED]">
                                  <td className="px-4 py-2.5 font-semibold text-sm text-[#1D1D1F]" colSpan={2}>{prodNome}</td>
                                  <td className="px-4 py-2 text-right">
                                    <span className="text-xs font-bold text-[#1D1D1F]">{prodTotal} un.</span>
                                  </td>
                                  <td className="px-4 py-2 text-xs text-[#86868B]">{prodItems[0]?.custo_unitario ? fmt(prodItems[0].custo_unitario) : ""}</td>
                                  <td className="px-4 py-2 text-xs font-semibold text-[#1D1D1F]">{fmt(prodValor)}</td>
                                  <td></td>
                                  <td></td>
                                </tr>
                                {/* Linhas de cada cor */}
                                {prodItems.map((p) => {
                                  const isEditCusto = editingCusto[p.id] !== undefined;
                                  const isEditQnt = editingQnt[p.id] !== undefined;
                                  return (
                                    <tr key={p.id} className={`border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors ${p.qnt === 0 ? "bg-red-50/50" : p.qnt === 1 ? "bg-yellow-50/50" : ""}`}>
                                      <td className="px-4 py-2.5 text-sm whitespace-nowrap" colSpan={isPendenciasTab ? 1 : 1}>
                                        <span className="text-[#86868B] ml-3">• {p.cor || "—"}</span>
                                      </td>
                                      {isPendenciasTab && <td className="px-4 py-2.5 text-xs font-medium">{p.cliente || "—"}{p.data_compra ? <span className="text-[#86868B] ml-1">({p.data_compra})</span> : ""}</td>}
                                      {showObs && <td className="px-4 py-2.5 text-[#86868B] text-xs max-w-[200px]">{p.observacao || "—"}{p.bateria ? ` | Bat: ${p.bateria}%` : ""}</td>}
                                      <td className="px-4 py-2.5">
                                        {isEditQnt ? (
                                          <div className="flex items-center gap-1">
                                            <input type="number" value={editingQnt[p.id]} onChange={(e) => setEditingQnt({ ...editingQnt, [p.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") handleUpdateQnt(p, parseInt(editingQnt[p.id]) || 0); if (e.key === "Escape") { const eq = { ...editingQnt }; delete eq[p.id]; setEditingQnt(eq); } }} className="w-14 px-1 py-0.5 rounded border border-[#0071E3] text-xs text-center" autoFocus />
                                            <button onClick={() => handleUpdateQnt(p, parseInt(editingQnt[p.id]) || 0)} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                          </div>
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <button onClick={() => { if (p.qnt > 0) handleUpdateQnt(p, p.qnt - 1); }} className="w-5 h-5 rounded bg-[#F5F5F7] text-[#86868B] hover:bg-red-100 hover:text-red-500 text-xs font-bold">-</button>
                                            <span className={`font-bold min-w-[24px] text-center cursor-pointer hover:text-[#E8740E] ${p.qnt === 0 ? "text-red-500" : p.qnt === 1 ? "text-yellow-600" : "text-[#1D1D1F]"}`} onClick={() => setEditingQnt({ ...editingQnt, [p.id]: String(p.qnt) })}>{p.qnt}</span>
                                            <button onClick={() => handleUpdateQnt(p, p.qnt + 1)} className="w-5 h-5 rounded bg-[#F5F5F7] text-[#86868B] hover:bg-green-100 hover:text-green-600 text-xs font-bold">+</button>
                                          </div>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {isEditCusto ? (
                                          <div className="flex items-center gap-1">
                                            <input type="number" value={editingCusto[p.id]} onChange={(e) => setEditingCusto({ ...editingCusto, [p.id]: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") handleSaveCusto(p); if (e.key === "Escape") { const ec = { ...editingCusto }; delete ec[p.id]; setEditingCusto(ec); } }} className="w-20 px-1 py-0.5 rounded border border-[#0071E3] text-xs text-right" autoFocus />
                                            <button onClick={() => handleSaveCusto(p)} className="text-[10px] text-[#E8740E] font-bold">OK</button>
                                          </div>
                                        ) : (
                                          <span className="text-xs cursor-pointer hover:text-[#E8740E] flex items-center gap-1" onClick={() => setEditingCusto({ ...editingCusto, [p.id]: String(p.custo_unitario || "") })}>
                                            {p.custo_unitario ? fmt(p.custo_unitario) : "—"}
                                            <svg className="w-3 h-3 text-[#86868B]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5 text-xs font-medium">{p.custo_unitario && p.qnt ? fmt(p.custo_unitario * p.qnt) : "—"}</td>
                                      <td className="px-4 py-2.5">
                                        <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-700"}`}>{p.status}</span>
                                        {p.qnt === 0 && produtosACaminho.has(p.produto.toUpperCase()) && (
                                          <span className="ml-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-100 text-blue-700">Ja a caminho</span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <div className="flex gap-1 items-center">
                                        {showMover && (
                                          <button onClick={() => handleMoverParaEstoque(p)} className="px-2 py-1 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors">{p.tipo === "PENDENCIA" ? "Recebido" : "Mover"}</button>
                                        )}
                                        {/* Alterar categoria */}
                                        {editingCat[p.id] !== undefined ? (
                                          <select
                                            value={editingCat[p.id]}
                                            onChange={async (e) => {
                                              const newCat = e.target.value;
                                              if (newCat && newCat !== p.categoria) {
                                                await fetch("/api/estoque", {
                                                  method: "PATCH",
                                                  headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": userName },
                                                  body: JSON.stringify({ id: p.id, categoria: newCat }),
                                                });
                                                setEstoque((prev) => prev.map((r) => r.id === p.id ? { ...r, categoria: newCat } : r));
                                                setMsg(`${p.produto} movido para ${newCat}`);
                                              }
                                              const ec = { ...editingCat }; delete ec[p.id]; setEditingCat(ec);
                                            }}
                                            onBlur={() => { const ec = { ...editingCat }; delete ec[p.id]; setEditingCat(ec); }}
                                            className="px-1 py-0.5 rounded border border-[#E8740E] text-[10px] bg-white"
                                            autoFocus
                                          >
                                            <option value="">Selecionar...</option>
                                            {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                                          </select>
                                        ) : (
                                          <button
                                            onClick={() => setEditingCat({ ...editingCat, [p.id]: p.categoria })}
                                            className="text-[#86868B] hover:text-[#E8740E] text-[10px] px-1"
                                            title="Alterar categoria"
                                          >📁</button>
                                        )}
                                        <button onClick={async () => {
                                          if (!confirm(`Excluir ${p.produto}${p.cor ? ` ${p.cor}` : ""}?`)) return;
                                          await fetch("/api/estoque", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": userName }, body: JSON.stringify({ id: p.id }) });
                                          setEstoque((prev) => prev.filter((r) => r.id !== p.id));
                                        }} className="text-[#86868B] hover:text-red-500 text-xs px-1">X</button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
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
            ))
          )}
        </div>
      )}
    </div>
  );
}
