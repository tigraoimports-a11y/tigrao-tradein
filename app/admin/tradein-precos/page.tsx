"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

interface UsadoRow {
  id: string;
  modelo: string;
  armazenamento: string;
  valor_base: number;
  ativo: boolean;
}

const DEVICE_TABS = [
  { key: "iphone", label: "iPhones", prefix: "iPhone" },
  { key: "ipad", label: "iPads", prefix: "iPad" },
  { key: "macbook", label: "MacBooks", prefix: "Mac" },
  { key: "watch", label: "Apple Watch", prefix: "Apple Watch" },
];

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

export default function TradeInPrecosPage() {
  const { password, apiHeaders, darkMode: dm } = useAdmin();
  const [data, setData] = useState<UsadoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [deviceTab, setDeviceTab] = useState("iphone");
  const [search, setSearch] = useState("");

  // Novo modelo form
  const [showAdd, setShowAdd] = useState(false);
  const [newModelo, setNewModelo] = useState("");
  const [newArm, setNewArm] = useState("");
  const [newValor, setNewValor] = useState("");

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValor, setEditValor] = useState("");
  const [editArm, setEditArm] = useState("");

  // Adicionar variação inline
  const [addingVariacao, setAddingVariacao] = useState<string | null>(null);
  const [varArm, setVarArm] = useState("");
  const [varRam, setVarRam] = useState("");
  const [varSsd, setVarSsd] = useState("");
  const [varValor, setVarValor] = useState("");

  // Copiar variações
  const [copyingTo, setCopyingTo] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!password) return;
    try {
      const res = await fetch("/api/admin/usados", { headers: apiHeaders() });
      const json = await res.json();
      setData(json.valores || []);
    } catch { setMsg("Erro ao carregar dados"); }
    setLoading(false);
  }, [password]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    const tab = DEVICE_TABS.find(t => t.key === deviceTab);
    if (!tab) return [];
    let items = data.filter(d => d.modelo.startsWith(tab.prefix));
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(d => d.modelo.toLowerCase().includes(s) || d.armazenamento.toLowerCase().includes(s));
    }
    return items.sort((a, b) => a.modelo.localeCompare(b.modelo) || a.armazenamento.localeCompare(b.armazenamento));
  }, [data, deviceTab, search]);

  // Agrupar por modelo base (ex: "iPhone 15 Pro" agrupa "128GB", "256GB", etc.)
  const grouped = useMemo(() => {
    const g: Record<string, UsadoRow[]> = {};
    for (const item of filtered) {
      if (!g[item.modelo]) g[item.modelo] = [];
      g[item.modelo].push(item);
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const totalModelos = filtered.length;
  const totalAtivos = filtered.filter(d => d.ativo).length;

  async function handleSave(id: string, valor: number) {
    setSaving(id);
    try {
      const item = data.find(d => d.id === id);
      if (!item) return;
      await fetch("/api/admin/usados", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert_valor", modelo: item.modelo, armazenamento: item.armazenamento, valor_base: valor }),
      });
      setData(prev => prev.map(d => d.id === id ? { ...d, valor_base: valor } : d));
      setEditingId(null);
      setMsg("Salvo!");
      setTimeout(() => setMsg(""), 2000);
    } catch { setMsg("Erro ao salvar"); }
    setSaving(null);
  }

  async function handleToggleAtivo(item: UsadoRow) {
    const newAtivo = !item.ativo;
    try {
      await fetch("/api/admin/usados", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert_valor", modelo: item.modelo, armazenamento: item.armazenamento, valor_base: item.valor_base }),
      });
      // Toggle ativo diretamente no Supabase
      const { supabase } = await import("@/lib/supabase");
      await supabase.from("avaliacao_usados").update({ ativo: newAtivo }).eq("id", item.id);
      setData(prev => prev.map(d => d.id === item.id ? { ...d, ativo: newAtivo } : d));
    } catch { setMsg("Erro ao atualizar"); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este modelo?")) return;
    try {
      await fetch("/api/admin/usados", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_valor", id }),
      });
      setData(prev => prev.filter(d => d.id !== id));
      setMsg("Excluido!");
      setTimeout(() => setMsg(""), 2000);
    } catch { setMsg("Erro ao excluir"); }
  }

  async function handleSaveEdit(id: string, valor: number, armazenamento: string) {
    setSaving(id);
    try {
      const item = data.find(d => d.id === id);
      if (!item) return;
      // Se armazenamento mudou, deletar o antigo e criar novo
      if (armazenamento !== item.armazenamento) {
        await fetch("/api/admin/usados", { method: "POST", headers: { ...apiHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete_valor", id }) });
        await fetch("/api/admin/usados", { method: "POST", headers: { ...apiHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert_valor", modelo: item.modelo, armazenamento, valor_base: valor }) });
      } else {
        await fetch("/api/admin/usados", { method: "POST", headers: { ...apiHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert_valor", modelo: item.modelo, armazenamento, valor_base: valor }) });
      }
      setEditingId(null);
      setMsg("Salvo!");
      setTimeout(() => setMsg(""), 2000);
      fetchData();
    } catch { setMsg("Erro ao salvar"); }
    setSaving(null);
  }

  async function handleCopyVariacoes(fromModelo: string, toModelo: string) {
    const fromItems = data.filter(d => d.modelo === fromModelo);
    if (fromItems.length === 0) { setMsg("Modelo de origem sem variações"); return; }
    setSaving("copy");
    let copied = 0;
    for (const item of fromItems) {
      // Verificar se já existe no destino
      const exists = data.find(d => d.modelo === toModelo && d.armazenamento === item.armazenamento);
      if (exists) continue;
      await fetch("/api/admin/usados", { method: "POST", headers: { ...apiHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ action: "upsert_valor", modelo: toModelo, armazenamento: item.armazenamento, valor_base: item.valor_base }) });
      copied++;
    }
    setCopyingTo(null);
    setMsg(`${copied} variações copiadas de ${fromModelo}!`);
    setTimeout(() => setMsg(""), 3000);
    fetchData();
    setSaving(null);
  }

  async function handleAddVariacao(modelo: string) {
    // MacBook: combinar RAM + SSD no formato "SSD/RAM" (ex: "512GB/16GB")
    const isMac = deviceTab === "macbook";
    const armFinal = isMac ? (varRam && varSsd ? `${varSsd}/${varRam}` : varArm) : varArm;
    if (!armFinal || !varValor) return;
    const varArmToSave = armFinal;
    setSaving("var");
    try {
      await fetch("/api/admin/usados", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert_valor", modelo, armazenamento: varArmToSave.trim(), valor_base: Number(varValor) }),
      });
      setVarArm(""); setVarRam(""); setVarSsd(""); setVarValor(""); setAddingVariacao(null);
      setMsg("Variacao adicionada!");
      setTimeout(() => setMsg(""), 2000);
      fetchData();
    } catch { setMsg("Erro ao adicionar"); }
    setSaving(null);
  }

  async function handleAdd() {
    if (!newModelo || !newArm || !newValor) { setMsg("Preencha todos os campos"); return; }
    setSaving("new");
    try {
      await fetch("/api/admin/usados", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upsert_valor", modelo: newModelo.trim(), armazenamento: newArm.trim(), valor_base: Number(newValor) }),
      });
      setNewModelo(""); setNewArm(""); setNewValor("");
      setShowAdd(false);
      setMsg("Modelo adicionado!");
      setTimeout(() => setMsg(""), 2000);
      fetchData();
    } catch { setMsg("Erro ao adicionar"); }
    setSaving(null);
  }

  const bgCard = dm ? "bg-[#1C1C1E]" : "bg-white";
  const borderCard = dm ? "border-[#3A3A3C]" : "border-[#E5E5EA]";
  const textPrimary = dm ? "text-[#F5F5F7]" : "text-[#1D1D1F]";
  const textSecondary = dm ? "text-[#98989D]" : "text-[#86868B]";
  const inputCls = `w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#E8740E] ${dm ? "bg-[#2C2C2E] border-[#3A3A3C] text-[#F5F5F7]" : "bg-[#F5F5F7] border-[#D2D2D7] text-[#1D1D1F]"} border`;

  if (loading) return <div className="p-8 text-center"><p className={textSecondary}>Carregando...</p></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-bold ${textPrimary}`}>Trade-In — Precos de Avaliacao</h1>
          <p className={`text-sm ${textSecondary}`}>Gerencie os valores base de avaliacao dos aparelhos usados</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors">
          {showAdd ? "Cancelar" : "+ Adicionar Modelo"}
        </button>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm font-medium ${msg.includes("Erro") ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
          {msg}
        </div>
      )}

      {/* Adicionar novo modelo */}
      {showAdd && (
        <div className={`${bgCard} border ${borderCard} rounded-xl p-4 space-y-3`}>
          <p className={`text-sm font-bold ${textPrimary}`}>Novo Modelo</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={`text-xs font-medium ${textSecondary}`}>Modelo</label>
              <input value={newModelo} onChange={e => setNewModelo(e.target.value)} placeholder="Ex: iPad Pro M4 11&quot;" className={inputCls} />
            </div>
            <div>
              <label className={`text-xs font-medium ${textSecondary}`}>Armazenamento</label>
              <input value={newArm} onChange={e => setNewArm(e.target.value)} placeholder="Ex: 256GB" className={inputCls} />
            </div>
            <div>
              <label className={`text-xs font-medium ${textSecondary}`}>Valor Base (R$)</label>
              <input type="number" value={newValor} onChange={e => setNewValor(e.target.value)} placeholder="5500" className={inputCls} />
            </div>
          </div>
          <button onClick={handleAdd} disabled={saving === "new"} className="px-4 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50">
            {saving === "new" ? "Salvando..." : "Adicionar"}
          </button>
        </div>
      )}

      {/* Device tabs */}
      <div className="flex gap-2 flex-wrap">
        {DEVICE_TABS.map(t => {
          const count = data.filter(d => d.modelo.startsWith(t.prefix)).length;
          return (
            <button key={t.key} onClick={() => { setDeviceTab(t.key); setSearch(""); }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${deviceTab === t.key ? "bg-[#E8740E] text-white" : `${bgCard} border ${borderCard} ${textPrimary} hover:border-[#E8740E]`}`}>
              {t.label} <span className="opacity-60 ml-1">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Search + stats */}
      <div className="flex items-center gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar modelo..." className={`${inputCls} max-w-xs`} />
        <span className={`text-xs ${textSecondary}`}>{totalAtivos} ativos / {totalModelos} total</span>
      </div>

      {/* Lista de modelos */}
      <div className="space-y-3">
        {grouped.length === 0 && (
          <div className={`${bgCard} border ${borderCard} rounded-xl p-8 text-center`}>
            <p className={textSecondary}>Nenhum modelo cadastrado pra essa categoria.</p>
            <p className={`text-xs mt-1 ${textSecondary}`}>Use o botao &quot;+ Adicionar Modelo&quot; ou rode o SQL de seed no Supabase.</p>
          </div>
        )}
        {grouped.map(([modelo, items]) => (
          <div key={modelo} className={`${bgCard} border ${borderCard} rounded-xl overflow-hidden`}>
            <div className={`px-4 py-2.5 flex items-center justify-between ${dm ? "bg-[#2C2C2E]" : "bg-[#F5F5F7]"}`}>
              <span className={`text-sm font-bold ${textPrimary}`}>{modelo}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => { setCopyingTo(copyingTo === modelo ? null : modelo); }}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors ${copyingTo === modelo ? (dm ? "bg-blue-900/30 text-blue-400" : "bg-blue-100 text-blue-600") : (dm ? "text-[#98989D] hover:text-blue-400" : "text-[#86868B] hover:text-blue-600")}`}>
                  {copyingTo === modelo ? "Cancelar" : "Copiar de..."}
                </button>
                <button onClick={() => { setAddingVariacao(addingVariacao === modelo ? null : modelo); setVarArm(""); setVarValor(""); }}
                  className={`text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors ${addingVariacao === modelo ? (dm ? "bg-[#3A3A3C] text-[#98989D]" : "bg-[#D2D2D7] text-[#86868B]") : "text-[#E8740E] hover:bg-[#FFF5EB]"}`}>
                  {addingVariacao === modelo ? "Cancelar" : "+ Variacao"}
                </button>
                <span className={`text-xs ${textSecondary}`}>{items.length} {items.length === 1 ? "variacao" : "variacoes"}</span>
              </div>
            </div>
            {copyingTo === modelo && (
              <div className={`px-4 py-2.5 flex items-center gap-2 flex-wrap ${dm ? "bg-blue-900/10 border-b border-blue-800/30" : "bg-blue-50 border-b border-blue-200"}`}>
                <span className={`text-xs font-medium ${dm ? "text-blue-400" : "text-blue-700"}`}>Copiar variacoes de:</span>
                {grouped.filter(([m]) => m !== modelo).map(([m, mItems]) => (
                  <button key={m} onClick={() => handleCopyVariacoes(m, modelo)} disabled={saving === "copy"}
                    className={`px-2 py-1 rounded text-[10px] font-semibold transition-colors ${dm ? "bg-[#2C2C2E] text-[#F5F5F7] hover:bg-blue-900/30" : "bg-white text-[#1D1D1F] hover:bg-blue-100"} border ${dm ? "border-[#3A3A3C]" : "border-[#D2D2D7]"}`}>
                    {m} ({mItems.length})
                  </button>
                ))}
              </div>
            )}
            {addingVariacao === modelo && (
              <div className={`px-4 py-2.5 flex items-center gap-2 flex-wrap ${dm ? "bg-[#1C1C1E] border-b border-[#3A3A3C]" : "bg-[#FFF8F0] border-b border-[#E8740E]/20"}`}>
                {deviceTab === "macbook" ? (
                  <>
                    <input value={varRam} onChange={e => setVarRam(e.target.value)} placeholder="RAM (ex: 16GB)" className={`${inputCls} w-28`} autoFocus />
                    <input value={varSsd} onChange={e => setVarSsd(e.target.value)} placeholder="SSD (ex: 512GB)" className={`${inputCls} w-28`}
                      onKeyDown={e => { if (e.key === "Enter" && varRam && varSsd && varValor) handleAddVariacao(modelo); }} />
                  </>
                ) : (
                  <input value={varArm} onChange={e => setVarArm(e.target.value)} placeholder="Ex: 256GB" className={`${inputCls} w-36`} autoFocus
                    onKeyDown={e => { if (e.key === "Enter" && varArm && varValor) handleAddVariacao(modelo); }} />
                )}
                <span className={`text-sm ${textSecondary}`}>R$</span>
                <input type="number" value={varValor} onChange={e => setVarValor(e.target.value)} placeholder="8500" className={`${inputCls} w-24`}
                  onKeyDown={e => { if (e.key === "Enter" && varValor) handleAddVariacao(modelo); }} />
                <button onClick={() => handleAddVariacao(modelo)} disabled={saving === "var" || (deviceTab === "macbook" ? (!varRam || !varSsd || !varValor) : (!varArm || !varValor))}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {saving === "var" ? "..." : "Adicionar"}
                </button>
              </div>
            )}
            <div className="divide-y divide-[#E5E5EA]">
              {items.map(item => (
                <div key={item.id} className={`px-4 py-2.5 flex items-center gap-3 ${dm ? "divide-[#3A3A3C]" : ""}`}>
                  {/* Toggle ativo */}
                  <button onClick={() => handleToggleAtivo(item)} title={item.ativo ? "Ativo — clique pra desativar" : "Inativo — clique pra ativar"}
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${item.ativo ? "bg-green-500 text-white border-green-500" : (dm ? "bg-[#3A3A3C] text-[#6E6E73] border-[#3A3A3C]" : "bg-[#E5E5EA] text-[#86868B] border-[#D2D2D7]")}`}>
                    {item.ativo ? "✓" : ""}
                  </button>
                  {/* Armazenamento — MacBook mostra RAM + SSD separados */}
                  <span className={`text-sm font-medium w-36 ${item.ativo ? textPrimary : textSecondary} ${!item.ativo ? "line-through opacity-60" : ""}`}>
                    {(() => {
                      const parts = item.armazenamento.split("/");
                      if (parts.length === 2 && deviceTab === "macbook") {
                        return <><span className="block text-xs">{parts[1]} RAM</span><span className="block text-xs opacity-70">{parts[0]} SSD</span></>;
                      }
                      return item.armazenamento;
                    })()}
                  </span>
                  {/* Valor */}
                  {editingId === item.id ? (
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <input type="text" value={editArm} onChange={e => setEditArm(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(item.id, Number(editValor), editArm); if (e.key === "Escape") setEditingId(null); }}
                        className={`${inputCls} w-32`} placeholder="Armazenamento" />
                      <span className={`text-sm ${textSecondary}`}>R$</span>
                      <input type="number" value={editValor} onChange={e => setEditValor(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(item.id, Number(editValor), editArm); if (e.key === "Escape") setEditingId(null); }}
                        className={`${inputCls} w-28`} />
                      <button onClick={() => handleSaveEdit(item.id, Number(editValor), editArm)} disabled={saving === item.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
                        {saving === item.id ? "..." : "Salvar"}
                      </button>
                      <button onClick={() => setEditingId(null)} className={`text-xs ${textSecondary} hover:underline`}>Cancelar</button>
                    </div>
                  ) : (
                    <button onClick={() => { setEditingId(item.id); setEditValor(String(item.valor_base)); setEditArm(item.armazenamento); }}
                      className={`text-sm font-bold flex-1 text-left hover:text-[#E8740E] transition-colors ${item.ativo ? "text-[#E8740E]" : textSecondary}`}>
                      {fmt(item.valor_base)}
                    </button>
                  )}
                  {/* Delete */}
                  <button onClick={() => handleDelete(item.id)} className={`text-xs ${textSecondary} hover:text-red-500 transition-colors`} title="Excluir">🗑️</button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
