"use client";

import { useEffect, useState, useCallback } from "react";
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

const CATEGORIAS = ["IPHONES", "IPADS", "MACBOOK", "APPLE_WATCH", "AIRPODS", "ACESSORIOS", "OUTROS"] as const;
const STATUS_OPTIONS = ["EM ESTOQUE", "A CAMINHO", "PENDENTE", "ESGOTADO"] as const;

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

const CAT_LABELS: Record<string, string> = {
  IPHONES: "iPhones",
  IPADS: "iPads",
  MACBOOK: "MacBooks",
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
  if (categoria === "MACBOOK") {
    if (p.includes("MAC MINI")) return "Mac Mini";
    if (p.includes("AIR")) return "MacBook Air";
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
  const [tab, setTab] = useState<"estoque" | "seminovos" | "pendencias" | "acaminho" | "novo">("estoque");
  const [filterCat, setFilterCat] = useState("");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [editingCusto, setEditingCusto] = useState<Record<string, string>>({});
  const [editingQnt, setEditingQnt] = useState<Record<string, string>>({});
  const [importingInitial, setImportingInitial] = useState(false);

  const [form, setForm] = useState({
    produto: "", categoria: "IPHONES", qnt: "1", custo_unitario: "",
    status: "EM ESTOQUE", cor: "", observacao: "", tipo: "NOVO",
    bateria: "", cliente: "", fornecedor: "",
  });

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password, "x-admin-user": userName } });
      if (res.ok) { const json = await res.json(); setEstoque(json.data ?? []); }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

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
    if (!form.produto) { setMsg("Preencha o nome do produto"); return; }
    const res = await fetch("/api/estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": userName },
      body: JSON.stringify({
        produto: form.produto, categoria: form.categoria,
        qnt: parseInt(form.qnt) || 0, custo_unitario: parseFloat(form.custo_unitario) || 0,
        status: form.status, cor: form.cor || null, observacao: form.observacao || null,
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
  const seminovos = estoque.filter((p) => p.tipo === "SEMINOVO");
  const pendencias = estoque.filter((p) => p.tipo === "PENDENCIA");
  const aCaminho = estoque.filter((p) => p.tipo === "A_CAMINHO");

  const currentList = tab === "seminovos" ? seminovos : tab === "acaminho" ? aCaminho : tab === "pendencias" ? pendencias : novos;

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
  const totalProdutos = novos.length;
  const totalUnidades = novos.reduce((s, p) => s + p.qnt, 0);
  const valorEstoque = novos.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
  const zerados = novos.filter((p) => p.qnt === 0).length;
  const acabando = novos.filter((p) => p.qnt === 1).length;
  const valorSeminovos = seminovos.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);
  const valorACaminho = aCaminho.reduce((s, p) => s + (p.qnt * (p.custo_unitario || 0)), 0);

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";

  const isPendenciasTab = tab === "pendencias";

  const renderProductRow = (p: ProdutoEstoque, showObs: boolean, showMover: boolean) => {
    const isEditCusto = editingCusto[p.id] !== undefined;
    const isEditQnt = editingQnt[p.id] !== undefined;

    return (
      <tr key={p.id} className={`border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors ${p.qnt === 0 ? "bg-red-50/50" : p.qnt === 1 ? "bg-yellow-50/50" : ""}`}>
        <td className="px-4 py-2.5 font-medium text-sm whitespace-nowrap">{p.produto}</td>
        <td className="px-4 py-2.5 text-[#86868B] text-xs">{p.cor || "—"}</td>
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
        </td>
        <td className="px-4 py-2.5 flex gap-1">
          {showMover && (
            <button onClick={() => handleMoverParaEstoque(p)} className="px-2 py-1 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors">{p.tipo === "PENDENCIA" ? "Recebido" : "Mover"}</button>
          )}
          <button onClick={async () => {
            if (!confirm(`Excluir ${p.produto}?`)) return;
            await fetch("/api/estoque", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password, "x-admin-user": userName }, body: JSON.stringify({ id: p.id }) });
            setEstoque((prev) => prev.filter((r) => r.id !== p.id));
          }} className="text-[#86868B] hover:text-red-500 text-xs px-1">X</button>
        </td>
      </tr>
    );
  };

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
        <div className="flex gap-2">
          {([
            { key: "estoque", label: `Estoque (${novos.length})` },
            { key: "seminovos", label: `Seminovos (${seminovos.length})` },
            { key: "pendencias", label: `Pendencias (${pendencias.length})` },
            { key: "acaminho", label: `A Caminho (${aCaminho.length})` },
            { key: "novo", label: "Adicionar" },
          ] as const).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t.key ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><p className={labelCls}>Produto</p><input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: iPhone 16 Pro Max 256GB" className={inputCls} /></div>
            <div><p className={labelCls}>Categoria</p><select value={form.categoria} onChange={(e) => set("categoria", e.target.value)} className={inputCls}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select></div>
            <div><p className={labelCls}>Tipo</p><select value={form.tipo} onChange={(e) => set("tipo", e.target.value)} className={inputCls}>
              <option value="NOVO">Novo (Lacrado)</option>
              <option value="SEMINOVO">Seminovo</option>
              <option value="A_CAMINHO">A Caminho</option>
            </select></div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelCls}>Cor</p><input value={form.cor} onChange={(e) => set("cor", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Quantidade</p><input type="number" value={form.qnt} onChange={(e) => set("qnt", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Custo unitario (R$)</p><input type="number" value={form.custo_unitario} onChange={(e) => set("custo_unitario", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Fornecedor</p><input value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls} /></div>
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

                {Object.entries(modelos).sort(([a], [b]) => a.localeCompare(b)).map(([modelo, items]) => (
                  <div key={modelo} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                    <div className="px-5 py-2.5 bg-[#F5F5F7] border-b border-[#D2D2D7] flex items-center justify-between">
                      <h3 className="font-semibold text-[#1D1D1F] text-sm">{modelo}</h3>
                      <span className="text-[10px] text-[#86868B]">{items.length} var. | {items.reduce((s, p) => s + p.qnt, 0)} un. | {fmt(items.reduce((s, p) => s + p.qnt * (p.custo_unitario || 0), 0))}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#F5F5F7]">
                            <th className="px-4 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase">Produto</th>
                            <th className="px-4 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase">Cor</th>
                            {isPendenciasTab && <th className="px-4 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase">Cliente</th>}
                            {(tab === "seminovos" || isPendenciasTab) && <th className="px-4 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase">Obs / Bateria</th>}
                            <th className="px-4 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase">Qnt</th>
                            <th className="px-4 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase">Custo Un.</th>
                            <th className="px-4 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase">Total</th>
                            <th className="px-4 py-2 text-left text-[#86868B] font-medium text-[10px] uppercase">Status</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((p) => renderProductRow(p, tab === "seminovos" || isPendenciasTab, tab === "acaminho" || isPendenciasTab))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
