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
  fornecedor: string | null;
  cor: string | null;
  observacao: string | null;
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

export default function EstoquePage() {
  const { password } = useAdmin();
  const [estoque, setEstoque] = useState<ProdutoEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"lista" | "novo">("lista");
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [importingInitial, setImportingInitial] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [editingQnt, setEditingQnt] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    produto: "",
    categoria: "IPHONES",
    qnt: "1",
    custo_unitario: "",
    status: "EM ESTOQUE",
    fornecedor: "",
    cor: "",
    observacao: "",
  });

  const fetchEstoque = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque", { headers: { "x-admin-password": password } });
      if (res.ok) {
        const json = await res.json();
        setEstoque(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchEstoque(); }, [fetchEstoque]);

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async () => {
    if (!form.produto) { setMsg("Preencha o nome do produto"); return; }
    setSaving(true);
    setMsg("");
    const res = await fetch("/api/estoque", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({
        produto: form.produto,
        categoria: form.categoria,
        qnt: parseInt(form.qnt) || 0,
        custo_unitario: parseFloat(form.custo_unitario) || 0,
        status: form.status,
        fornecedor: form.fornecedor || null,
        cor: form.cor || null,
        observacao: form.observacao || null,
      }),
    });
    const json = await res.json();
    if (json.ok) {
      setMsg("Produto adicionado!");
      setForm((f) => ({ ...f, produto: "", qnt: "1", custo_unitario: "", fornecedor: "", cor: "", observacao: "" }));
      fetchEstoque();
    } else {
      setMsg("Erro: " + json.error);
    }
    setSaving(false);
  };

  const handleUpdateQnt = async (item: ProdutoEstoque, newQnt: number) => {
    await fetch("/api/estoque", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ id: item.id, qnt: newQnt, status: newQnt === 0 ? "ESGOTADO" : item.status === "ESGOTADO" ? "EM ESTOQUE" : item.status }),
    });
    setEstoque((prev) => prev.map((p) => p.id === item.id ? { ...p, qnt: newQnt, status: newQnt === 0 ? "ESGOTADO" : p.status === "ESGOTADO" ? "EM ESTOQUE" : p.status } : p));
    const e = { ...editingQnt }; delete e[item.id]; setEditingQnt(e);
  };

  const handleToggleStatus = async (item: ProdutoEstoque) => {
    const idx = STATUS_OPTIONS.indexOf(item.status as typeof STATUS_OPTIONS[number]);
    const next = STATUS_OPTIONS[(idx + 1) % STATUS_OPTIONS.length];
    await fetch("/api/estoque", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ id: item.id, status: next }),
    });
    setEstoque((prev) => prev.map((p) => p.id === item.id ? { ...p, status: next } : p));
  };

  // Filtrar
  const filtered = estoque.filter((p) => {
    if (filterCat && p.categoria !== filterCat) return false;
    if (filterStatus && p.status !== filterStatus) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!p.produto.toLowerCase().includes(s) && !(p.cor?.toLowerCase().includes(s)) && !(p.fornecedor?.toLowerCase().includes(s))) return false;
    }
    return true;
  });

  // Agrupar por categoria
  const grouped: Record<string, ProdutoEstoque[]> = {};
  filtered.forEach((p) => {
    if (!grouped[p.categoria]) grouped[p.categoria] = [];
    grouped[p.categoria].push(p);
  });

  // KPIs
  const totalProdutos = estoque.length;
  const totalUnidades = estoque.reduce((s, p) => s + p.qnt, 0);
  const valorEstoque = estoque.reduce((s, p) => s + (p.qnt * p.custo_unitario), 0);
  const zerados = estoque.filter((p) => p.qnt === 0).length;
  const acabando = estoque.filter((p) => p.qnt === 1).length;

  const inputCls = "w-full px-3 py-2 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-[#1D1D1F] text-sm focus:outline-none focus:border-[#E8740E] transition-colors";
  const labelCls = "text-xs font-semibold text-[#86868B] uppercase tracking-wider mb-1";

  const handleImportInitial = async () => {
    setImportingInitial(true);
    setMsg("");
    try {
      const res = await fetch("/estoque-initial.json");
      const rows = await res.json();
      const importRes = await fetch("/api/estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ action: "import", rows }),
      });
      const json = await importRes.json();
      if (json.ok) {
        setMsg(`${json.imported} produtos importados da planilha!`);
        fetchEstoque();
      } else {
        setMsg("Erro: " + json.error);
      }
    } catch (err) {
      setMsg("Erro: " + String(err));
    }
    setImportingInitial(false);
  };

  return (
    <div className="space-y-6">
      {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

      {/* Import button when empty */}
      {estoque.length === 0 && !loading && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-8 text-center shadow-sm">
          <p className="text-[#86868B] mb-4">Estoque vazio. Importar os 124 produtos da planilha ESTOQUE 2026?</p>
          <button onClick={handleImportInitial} disabled={importingInitial} className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {importingInitial ? "Importando..." : "Importar Estoque da Planilha"}
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Produtos", value: totalProdutos, color: "#E8740E" },
          { label: "Unidades", value: totalUnidades, color: "#3498DB" },
          { label: "Valor estoque", value: fmt(valorEstoque), color: "#2ECC71" },
          { label: "Zerados", value: zerados, color: "#E74C3C" },
          { label: "Acabando (1un)", value: acabando, color: "#F39C12" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-[#D2D2D7] rounded-2xl p-4 shadow-sm">
            <p className="text-[#86868B] text-xs mb-1">{kpi.label}</p>
            <p className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 items-center justify-between flex-wrap">
        <div className="flex gap-2">
          {(["lista", "novo"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${tab === t ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}>
              {t === "lista" ? "Estoque" : "Adicionar Produto"}
            </button>
          ))}
        </div>
        {tab === "lista" && (
          <div className="flex gap-2 items-center flex-wrap">
            <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs">
              <option value="">Todas categorias</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-2 py-1.5 rounded-lg border border-[#D2D2D7] text-xs">
              <option value="">Todos status</option>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto..." className="px-3 py-1.5 rounded-lg border border-[#D2D2D7] text-xs w-48 focus:outline-none focus:border-[#E8740E]" />
          </div>
        )}
      </div>

      {tab === "novo" ? (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-[#1D1D1F]">Adicionar Produto ao Estoque</h2>
          {msg && <div className={`px-4 py-3 rounded-xl text-sm ${msg.includes("Erro") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{msg}</div>}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="col-span-2"><p className={labelCls}>Produto</p><input value={form.produto} onChange={(e) => set("produto", e.target.value)} placeholder="Ex: iPhone 16 Pro Max 256GB" className={inputCls} /></div>
            <div><p className={labelCls}>Categoria</p><select value={form.categoria} onChange={(e) => set("categoria", e.target.value)} className={inputCls}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
            </select></div>
            <div><p className={labelCls}>Cor</p><input value={form.cor} onChange={(e) => set("cor", e.target.value)} placeholder="Ex: Titanio Natural" className={inputCls} /></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className={labelCls}>Quantidade</p><input type="number" value={form.qnt} onChange={(e) => set("qnt", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Custo unitario (R$)</p><input type="number" value={form.custo_unitario} onChange={(e) => set("custo_unitario", e.target.value)} className={inputCls} /></div>
            <div><p className={labelCls}>Status</p><select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
              {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></div>
            <div><p className={labelCls}>Fornecedor</p><input value={form.fornecedor} onChange={(e) => set("fornecedor", e.target.value)} className={inputCls} /></div>
          </div>

          <div><p className={labelCls}>Observacao</p><input value={form.observacao} onChange={(e) => set("observacao", e.target.value)} className={inputCls} /></div>

          <button onClick={handleSubmit} disabled={saving} className="w-full py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">
            {saving ? "Salvando..." : "Adicionar ao Estoque"}
          </button>
        </div>
      ) : (
        /* Lista de estoque agrupada por categoria */
        <div className="space-y-4">
          {loading ? (
            <div className="py-12 text-center text-[#86868B]">Carregando...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
              <p className="text-[#86868B]">Nenhum produto no estoque.</p>
            </div>
          ) : (
            Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => (
              <div key={cat} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7] flex items-center justify-between">
                  <h3 className="font-semibold text-[#1D1D1F]">{CAT_LABELS[cat] || cat}</h3>
                  <span className="text-xs text-[#86868B]">{items.length} produto{items.length !== 1 ? "s" : ""} | {items.reduce((s, p) => s + p.qnt, 0)} un.</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#F5F5F7]">
                        {["Produto", "Cor", "Qnt", "Custo Un.", "Valor Total", "Status", "Fornecedor", ""].map((h) => (
                          <th key={h} className="px-4 py-2 text-left text-[#86868B] font-medium text-xs uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((p) => {
                        const isEditQnt = editingQnt[p.id] !== undefined;
                        return (
                          <tr key={p.id} className={`border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors ${p.qnt === 0 ? "bg-red-50/50" : p.qnt === 1 ? "bg-yellow-50/50" : ""}`}>
                            <td className="px-4 py-3 font-medium whitespace-nowrap">{p.produto}</td>
                            <td className="px-4 py-3 text-[#86868B] text-xs">{p.cor || "—"}</td>
                            <td className="px-4 py-3">
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
                            <td className="px-4 py-3 text-[#86868B] text-xs">{p.custo_unitario ? fmt(p.custo_unitario) : "—"}</td>
                            <td className="px-4 py-3 text-xs font-medium">{p.custo_unitario && p.qnt ? fmt(p.custo_unitario * p.qnt) : "—"}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => handleToggleStatus(p)} className={`px-2 py-0.5 rounded-lg text-xs font-semibold transition-colors ${STATUS_COLORS[p.status] || "bg-gray-100 text-gray-700"}`}>
                                {p.status}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-[#86868B] text-xs">{p.fornecedor || "—"}</td>
                            <td className="px-4 py-3">
                              <button onClick={async () => {
                                if (!confirm(`Excluir ${p.produto}?`)) return;
                                await fetch("/api/estoque", { method: "DELETE", headers: { "Content-Type": "application/json", "x-admin-password": password }, body: JSON.stringify({ id: p.id }) });
                                setEstoque((prev) => prev.filter((r) => r.id !== p.id));
                              }} className="text-[#86868B] hover:text-red-500 text-xs">X</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
