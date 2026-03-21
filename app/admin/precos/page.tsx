"use client";

import { useEffect, useState, useCallback, useRef, lazy, Suspense } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { useTabParam } from "@/lib/useTabParam";
import { getCategoriasPrecos, addCategoriaPrecos, removeCategoriaPrecos, EMOJI_OPTIONS } from "@/lib/categorias";
import type { Categoria } from "@/lib/categorias";

const UsadosContent = lazy(() => import("@/app/admin/usados/page").then(m => ({ default: m.UsadosContent })));

interface PrecoProduto {
  id?: string;
  modelo: string;
  armazenamento: string;
  preco_pix: number;
  status: string;
  categoria: string;
  updated_at?: string;
}

// Persistir ordem customizada por categoria
function getSavedOrder(catKey: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(`tigrao_precos_order_${catKey}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveOrder(catKey: string, keys: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`tigrao_precos_order_${catKey}`, JSON.stringify(keys));
}
function applyOrder(rows: PrecoProduto[], catKey: string): PrecoProduto[] {
  const order = getSavedOrder(catKey);
  if (!order.length) return rows;
  return [...rows].sort((a, b) => {
    const ka = `${a.modelo}|${a.armazenamento}`;
    const kb = `${b.modelo}|${b.armazenamento}`;
    const ia = order.indexOf(ka);
    const ib = order.indexOf(kb);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function PrecosContent() {
  const { password } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PrecoProduto[] | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  // Categorias dinâmicas
  const [categorias, setCategorias] = useState<Categoria[]>(() => getCategoriasPrecos());
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCat, setNewCat] = useState({ label: "", emoji: "\u{1F4E6}" });

  const tabKeys = categorias.map((c) => c.key);
  const [tab, setTab] = useTabParam<string>("IPHONE", tabKeys);
  const [showAdd, setShowAdd] = useState(false);
  const [newProd, setNewProd] = useState({ modelo: "", preco_pix: "" });
  // Campos de especificação dinâmicos (label + valor) — combinados com " | " no armazenamento
  const [specFields, setSpecFields] = useState<{ label: string; value: string }[]>([{ label: "", value: "" }]);
  // Drag and drop
  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Defaults por categoria ao abrir formulário
  const BUILTIN_SPECS: Record<string, string[]> = {
    MACBOOK: ["Tela", "RAM", "Armazenamento"],
    IPHONE: ["Armazenamento"],
    IPAD: ["Armazenamento"],
    APPLE_WATCH: ["Tamanho"],
    AIRPODS: ["Modelo"],
  };

  // Salvar/carregar labels customizados por categoria no localStorage
  function getSavedLabels(catKey: string): string[] | null {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(`tigrao_spec_labels_${catKey}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveLabels(catKey: string, labels: string[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(`tigrao_spec_labels_${catKey}`, JSON.stringify(labels));
  }

  function getDefaultSpecs(catKey: string): { label: string; value: string }[] {
    // Primeiro tenta labels salvos (customizados pelo usuário)
    const saved = getSavedLabels(catKey);
    if (saved && saved.length > 0) return saved.map((l) => ({ label: l, value: "" }));
    // Senão usa defaults
    const builtin = BUILTIN_SPECS[catKey] || ["Variação"];
    return builtin.map((l) => ({ label: l, value: "" }));
  }

  function getLabelsForCategory(catKey: string): string[] {
    const saved = getSavedLabels(catKey);
    if (saved && saved.length > 0) return saved;
    return BUILTIN_SPECS[catKey] || ["Variação"];
  }

  function handleAddCategoria() {
    if (!newCat.label.trim()) return;
    const key = newCat.label.trim().toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "");
    if (!key) return;
    const updated = addCategoriaPrecos({ key, label: newCat.label.trim(), emoji: newCat.emoji, custom: true });
    setCategorias(updated);
    setTab(key);
    setNewCat({ label: "", emoji: "\u{1F4E6}" });
    setShowNewCat(false);
  }

  function handleRemoveCategoria(key: string) {
    if (!confirm(`Remover categoria "${categorias.find((c) => c.key === key)?.label}"?`)) return;
    const updated = removeCategoriaPrecos(key);
    setCategorias(updated);
    if (tab === key) setTab("IPHONE");
  }

  const fetchData = useCallback(async (pw: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/precos", {
        headers: { "x-admin-password": pw },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json.data ?? []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (password) fetchData(password);
  }, [password, fetchData]);

  // Inferir categoria pelo nome do modelo
  function inferCategoria(modelo: string): string {
    const m = modelo.toUpperCase();
    if (m.includes("IPHONE") || m.includes("PHONE")) return "IPHONE";
    if (m.includes("MACBOOK") || m.includes("MAC MINI") || m.includes("IMAC")) return "MACBOOK";
    if (m.includes("IPAD")) return "IPAD";
    if (m.includes("WATCH")) return "APPLE_WATCH";
    if (m.includes("AIRPOD")) return "AIRPODS";
    return "ACESSORIOS";
  }

  async function handleSave(row: PrecoProduto) {
    const key = `${row.modelo}|${row.armazenamento}`;
    const newPrice = parseFloat((editing[key] ?? String(row.preco_pix)).replace(",", "."));
    if (isNaN(newPrice) || newPrice <= 0) return;

    setSaving(key);
    await fetch("/api/admin/precos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({
        modelo: row.modelo,
        armazenamento: row.armazenamento,
        preco_pix: newPrice,
        status: row.status,
        categoria: row.categoria || inferCategoria(row.modelo),
      }),
    });
    setData((prev) => prev?.map((r) =>
      r.modelo === row.modelo && r.armazenamento === row.armazenamento
        ? { ...r, preco_pix: newPrice }
        : r
    ) ?? null);
    const newEditing = { ...editing };
    delete newEditing[key];
    setEditing(newEditing);
    setSaving(null);
  }

  async function handleToggleStatus(row: PrecoProduto) {
    const newStatus = row.status === "esgotado" ? "ativo" : "esgotado";
    await fetch("/api/admin/precos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({
        modelo: row.modelo,
        armazenamento: row.armazenamento,
        preco_pix: row.preco_pix,
        status: newStatus,
        categoria: row.categoria || inferCategoria(row.modelo),
      }),
    });
    setData((prev) => prev?.map((r) =>
      r.modelo === row.modelo && r.armazenamento === row.armazenamento
        ? { ...r, status: newStatus }
        : r
    ) ?? null);
  }

  async function handleDelete(row: PrecoProduto) {
    if (!confirm(`Remover ${row.modelo} ${row.armazenamento}?`)) return;
    await fetch("/api/admin/precos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ modelo: row.modelo, armazenamento: row.armazenamento }),
    });
    setData((prev) => prev?.filter((r) =>
      !(r.modelo === row.modelo && r.armazenamento === row.armazenamento)
    ) ?? null);
  }

  async function handleImport() {
    setImporting(true);
    setImportMsg("");
    const res = await fetch("/api/admin/precos", {
      method: "PUT",
      headers: { "x-admin-password": password },
    });
    const json = await res.json();
    if (json.ok) {
      setImportMsg(`${json.imported} produtos importados do Google Sheets`);
      await fetchData(password);
    } else {
      setImportMsg("Erro ao importar: " + json.error);
    }
    setImporting(false);
  }

  async function handleAddProd() {
    const preco = parseFloat(newProd.preco_pix);
    // Combinar campos de spec com " | "
    const filledSpecs = specFields.filter((s) => s.value.trim());
    const armazenamentoFinal = filledSpecs.map((s) => s.value.trim()).join(" | ");
    if (!newProd.modelo || !armazenamentoFinal || isNaN(preco) || preco <= 0) return;
    // Salvar labels dos campos para essa categoria (pra tabela mostrar nomes corretos)
    const currentLabels = specFields.map((s) => s.label || `Spec ${specFields.indexOf(s) + 1}`);
    saveLabels(tab, currentLabels);
    setSaving("new");
    await fetch("/api/admin/precos", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({
        modelo: newProd.modelo.trim(),
        armazenamento: armazenamentoFinal,
        preco_pix: preco,
        status: "ativo",
        categoria: tab,
      }),
    });
    await fetchData(password);
    // Manter labels dos campos, só limpar valores (pra facilitar adicionar variantes do mesmo modelo)
    setNewProd((prev) => ({ ...prev, preco_pix: "" }));
    setSpecFields((prev) => prev.map((s) => ({ ...s, value: "" })));
    setSaving(null);
    // NÃO fechar o form — facilita adicionar múltiplas variantes seguidas
  }

  if (loading && data === null) {
    return <div className="flex items-center justify-center py-20"><p className="text-[#86868B]">Carregando...</p></div>;
  }

  if (!data) return null;

  // Filtrar por categoria da tab e aplicar ordem salva
  const filteredRaw = data.filter((r) => {
    const cat = r.categoria || inferCategoria(r.modelo);
    return cat === tab;
  });
  const filtered = applyOrder(filteredRaw, tab);

  // Handler de drag-and-drop para reordenar
  function handleDragEnd() {
    if (!dragItem.current || !dragOverItem.current || dragItem.current === dragOverItem.current) {
      setDragKey(null);
      return;
    }
    // Reordenar: pegar ordem atual, mover item
    const keys = filtered.map((r) => `${r.modelo}|${r.armazenamento}`);
    const fromIdx = keys.indexOf(dragItem.current);
    const toIdx = keys.indexOf(dragOverItem.current);
    if (fromIdx === -1 || toIdx === -1) { setDragKey(null); return; }
    keys.splice(fromIdx, 1);
    keys.splice(toIdx, 0, dragItem.current);
    saveOrder(tab, keys);
    // Forçar re-render
    setData((prev) => prev ? [...prev] : prev);
    setDragKey(null);
    dragItem.current = null;
    dragOverItem.current = null;
  }

  // Parser MacBook: extrai tela|ram|armazenamento do campo combinado
  function parseMacSpec(spec: string) {
    const parts = spec.split("|").map((s) => s.trim());
    if (parts.length >= 3) {
      return { tela: parts[0], ram: parts[1].replace(/\s*RAM$/i, ""), arm: parts[2] };
    }
    return { tela: "-", ram: "-", arm: spec };
  }

  // Agrupar: MacBooks por tela, demais por modelo
  const grouped: Record<string, PrecoProduto[]> = {};
  if (tab === "MACBOOK") {
    filtered.forEach((r) => {
      const spec = parseMacSpec(r.armazenamento);
      const telaKey = `MacBooks ${spec.tela}`;
      if (!grouped[telaKey]) grouped[telaKey] = [];
      grouped[telaKey].push(r);
    });
    // Ordenar dentro de cada grupo: Air antes de Pro
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => {
        const aIsAir = a.modelo.toUpperCase().includes("AIR") ? 0 : 1;
        const bIsAir = b.modelo.toUpperCase().includes("AIR") ? 0 : 1;
        if (aIsAir !== bIsAir) return aIsAir - bIsAir;
        return a.modelo.localeCompare(b.modelo);
      });
    }
  } else {
    filtered.forEach((r) => {
      if (!grouped[r.modelo]) grouped[r.modelo] = [];
      grouped[r.modelo].push(r);
    });
  }

  // Ordenar chaves: para MacBooks, 13" antes de 15" antes de 16"
  const groupedEntries = Object.entries(grouped).sort(([a], [b]) => {
    if (tab === "MACBOOK") {
      const numA = parseInt(a.replace(/\D/g, "")) || 99;
      const numB = parseInt(b.replace(/\D/g, "")) || 99;
      return numA - numB;
    }
    return a.localeCompare(b);
  });

  const catInfo = categorias.find((c) => c.key === tab) || { key: tab, label: tab, emoji: "\u{1F4E6}" };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#1D1D1F]">Painel de Precos</h2>
          <p className="text-[#86868B] text-xs">Edite os precos diretamente aqui. Alteracoes notificam via Telegram.</p>
        </div>
        <div className="flex gap-2">
          {tab === "IPHONE" && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 rounded-xl bg-white border border-[#D2D2D7] text-[#86868B] text-sm hover:border-[#E8740E] hover:text-[#E8740E] transition-colors disabled:opacity-50"
            >
              {importing ? "Importando..." : "Importar do Sheets"}
            </button>
          )}
          <button
            onClick={() => { setShowAdd(!showAdd); if (!showAdd) setSpecFields(getDefaultSpecs(tab)); }}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
          >
            + Adicionar Produto
          </button>
        </div>
      </div>

      {/* Tabs por categoria */}
      <div className="flex gap-2 flex-wrap items-center">
        {categorias.map((c) => {
          const count = data.filter((r) => (r.categoria || inferCategoria(r.modelo)) === c.key).length;
          return (
            <div key={c.key} className="relative group">
              <button
                onClick={() => { setTab(c.key); setShowAdd(false); setShowNewCat(false); }}
                className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                  tab === c.key
                    ? "bg-[#E8740E] text-white"
                    : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"
                }`}
              >
                {c.emoji} {c.label} {count > 0 ? `(${count})` : ""}
              </button>
              {c.custom && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveCategoria(c.key); }}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remover categoria"
                >
                  x
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => setShowNewCat(!showNewCat)}
          className="px-3 py-2 rounded-xl text-xs font-semibold border border-dashed border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors"
          title="Criar nova categoria"
        >
          + Categoria
        </button>
      </div>

      {/* Modal criar categoria */}
      {showNewCat && (
        <div className="bg-white border border-[#E8740E] rounded-2xl p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-sm text-[#1D1D1F]">Nova Categoria</h3>
          <div className="flex gap-3 items-end">
            <div>
              <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Emoji</p>
              <div className="flex gap-1 flex-wrap max-w-xs">
                {EMOJI_OPTIONS.map((e) => (
                  <button
                    key={e}
                    onClick={() => setNewCat({ ...newCat, emoji: e })}
                    className={`w-8 h-8 rounded-lg text-base flex items-center justify-center transition-colors ${
                      newCat.emoji === e ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] hover:bg-[#E8E8ED]"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Nome da Categoria</p>
              <input
                value={newCat.label}
                onChange={(e) => setNewCat({ ...newCat, label: e.target.value })}
                placeholder="Ex: Cabos, Samsung, etc."
                className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleAddCategoria()}
              />
            </div>
            <button
              onClick={handleAddCategoria}
              className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors"
            >
              Criar
            </button>
            <button
              onClick={() => setShowNewCat(false)}
              className="px-4 py-2 rounded-xl border border-[#D2D2D7] text-[#86868B] text-sm hover:bg-[#F5F5F7] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {importMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
          {importMsg}
        </div>
      )}

      {/* Form adicionar produto */}
      {showAdd && (
        <div className="bg-white border border-[#E8740E] rounded-2xl p-5 space-y-3 shadow-sm">
          <h3 className="font-semibold text-sm text-[#1D1D1F]">Adicionar produto em {catInfo.emoji} {catInfo.label}</h3>
          <div className="flex gap-3 flex-wrap items-end">
            {/* Modelo (sempre presente) */}
            <div className="min-w-[160px] flex-1">
              <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Modelo</p>
              <input
                value={newProd.modelo}
                onChange={(e) => setNewProd({ ...newProd, modelo: e.target.value })}
                placeholder={tab === "IPHONE" ? "iPhone 17 Pro" : tab === "MACBOOK" ? "MacBook Air M4" : tab === "IPAD" ? "iPad Air M3" : "Nome do produto"}
                className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
              />
            </div>
            {/* Campos de spec dinâmicos */}
            {specFields.map((sf, i) => (
              <div key={i} className="min-w-[120px] flex-1">
                <div className="flex items-center gap-1 mb-1">
                  <input
                    value={sf.label}
                    onChange={(e) => { const nf = [...specFields]; nf[i] = { ...nf[i], label: e.target.value }; setSpecFields(nf); }}
                    placeholder="Nome do campo"
                    className="text-[10px] font-bold text-[#86868B] uppercase bg-transparent border-none outline-none w-full placeholder:text-[#C7C7CC]"
                  />
                  {specFields.length > 1 && (
                    <button
                      onClick={() => setSpecFields(specFields.filter((_, j) => j !== i))}
                      className="text-red-400 hover:text-red-600 text-xs leading-none"
                      title="Remover campo"
                    >
                      ×
                    </button>
                  )}
                </div>
                <input
                  value={sf.value}
                  onChange={(e) => { const nf = [...specFields]; nf[i] = { ...nf[i], value: e.target.value }; setSpecFields(nf); }}
                  placeholder={sf.label || "Valor"}
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>
            ))}
            {/* Botão + campo */}
            <button
              onClick={() => setSpecFields([...specFields, { label: "", value: "" }])}
              className="px-3 py-2 rounded-lg border border-dashed border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors text-lg leading-none mb-px"
              title="Adicionar campo"
            >
              +
            </button>
            {/* Preço (sempre presente) */}
            <div className="min-w-[120px]">
              <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Preço PIX (R$)</p>
              <input
                type="number"
                value={newProd.preco_pix}
                onChange={(e) => setNewProd({ ...newProd, preco_pix: e.target.value })}
                placeholder="4.997"
                className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddProd}
              disabled={saving === "new"}
              className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
            >
              {saving === "new" ? "Salvando..." : "Adicionar"}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 rounded-xl border border-[#D2D2D7] text-[#86868B] text-sm hover:bg-[#F5F5F7] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {filtered.length === 0 && !showAdd ? (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-12 text-center shadow-sm">
          <p className="text-[#86868B] mb-4">Nenhum produto em {catInfo.label}.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="px-6 py-3 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors"
          >
            + Adicionar primeiro produto
          </button>
        </div>
      ) : (
        groupedEntries.map(([groupLabel, rows]) => {
          const isMac = tab === "MACBOOK";
          // Detectar colunas dinâmicas: pegar o máximo de " | " partes nos rows
          const maxParts = Math.max(...rows.map((r) => r.armazenamento.split("|").length));
          const hasMultipleCols = maxParts > 1;
          // Para MacBooks agrupados por tela, incluir coluna "Modelo"
          const showModeloCol = isMac;

          // Gerar headers das colunas de spec (usa labels salvos pelo usuário)
          const defaultLabels = getLabelsForCategory(tab);

          return (
          <div key={groupLabel} className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7]">
              <h2 className="font-semibold text-[#1D1D1F]">{groupLabel}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#F5F5F7]">
                  <th className="w-6"></th>
                  {showModeloCol && (
                    <th className="px-4 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Modelo</th>
                  )}
                  {hasMultipleCols ? (
                    Array.from({ length: maxParts }).map((_, i) => (
                      <th key={i} className="px-4 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">
                        {defaultLabels[i] || `Spec ${i + 1}`}
                      </th>
                    ))
                  ) : (
                    <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">
                      {defaultLabels[0] || "Variação"}
                    </th>
                  )}
                  <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Preço PIX</th>
                  <th className="px-5 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Status</th>
                  <th className="px-5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key = `${row.modelo}|${row.armazenamento}`;
                  const isEditing = editing[key] !== undefined;
                  const isSaving = saving === key;
                  const specParts = row.armazenamento.split("|").map((s) => s.trim().replace(/\s*RAM$/i, ""));
                  const isDragging = dragKey === key;
                  return (
                    <tr
                      key={key}
                      draggable
                      onDragStart={() => { dragItem.current = key; setDragKey(key); }}
                      onDragEnter={() => { dragOverItem.current = key; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDragEnd={handleDragEnd}
                      className={`border-b border-[#F5F5F7] last:border-0 transition-colors ${isDragging ? "opacity-40 bg-[#FFF3E8]" : "hover:bg-[#F5F5F7]"}`}
                    >
                      <td className="px-1 py-3 cursor-grab active:cursor-grabbing text-center text-[#C7C7CC] select-none w-6">
                        <span className="text-xs">⠿</span>
                      </td>
                      {showModeloCol && (
                        <td className="px-4 py-3 font-medium">{row.modelo}</td>
                      )}
                      {hasMultipleCols ? (
                        Array.from({ length: maxParts }).map((_, i) => (
                          <td key={i} className="px-4 py-3 font-medium">{specParts[i] || "-"}</td>
                        ))
                      ) : (
                        <td className="px-5 py-3 font-medium">{row.armazenamento}</td>
                      )}
                      <td className="px-5 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[#86868B] text-sm">R$</span>
                            <input
                              type="number"
                              value={editing[key]}
                              onChange={(e) => setEditing({ ...editing, [key]: e.target.value })}
                              onKeyDown={(e) => e.key === "Enter" && handleSave(row)}
                              className="w-32 px-3 py-1.5 rounded-lg border border-[#0071E3] bg-white text-[#1D1D1F] text-sm focus:outline-none"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <span
                            className="cursor-pointer hover:text-[#E8740E] transition-colors font-medium"
                            onClick={() => setEditing({ ...editing, [key]: String(row.preco_pix) })}
                          >
                            R$ {row.preco_pix.toLocaleString("pt-BR")}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          onClick={() => handleToggleStatus(row)}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            row.status === "esgotado"
                              ? "bg-red-100 text-red-600 hover:bg-red-200"
                              : "bg-green-100 text-green-700 hover:bg-green-200"
                          }`}
                        >
                          {row.status === "esgotado" ? "Esgotado" : "Ativo"}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {isEditing ? (
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => { const e = { ...editing }; delete e[key]; setEditing(e); }}
                              className="px-3 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-[#1D1D1F] transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleSave(row)}
                              disabled={isSaving}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#F5A623] transition-colors disabled:opacity-50"
                            >
                              {isSaving ? "Salvando..." : "Salvar"}
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => {
                                // Duplicar: abre form preenchido com dados desse produto
                                const parts = row.armazenamento.split("|").map((s) => s.trim());
                                const labels = getLabelsForCategory(tab);
                                setSpecFields(parts.map((v, idx) => ({ label: labels[idx] || `Spec ${idx + 1}`, value: v.replace(/\s*RAM$/i, "") })));
                                setNewProd({ modelo: row.modelo, preco_pix: String(row.preco_pix) });
                                setShowAdd(true);
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              className="px-2 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-[#0071E3] border border-[#D2D2D7] hover:border-[#0071E3] transition-colors"
                              title="Duplicar produto"
                            >
                              Duplicar
                            </button>
                            <button
                              onClick={() => setEditing({ ...editing, [key]: String(row.preco_pix) })}
                              className="px-2 py-1.5 rounded-lg text-xs text-[#86868B] hover:text-[#E8740E] border border-[#D2D2D7] hover:border-[#E8740E] transition-colors"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => handleDelete(row)}
                              className="px-2 py-1.5 rounded-lg text-xs text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          );
        })
      )}
    </div>
  );
}

// ═══════════ SVG Line Chart Component ═══════════
interface ChartDataset {
  supplier: string;
  color: string;
  prices: (number | null)[];
}

function LineChart({ labels, datasets, height = 250 }: { labels: string[]; datasets: ChartDataset[]; height?: number }) {
  if (!labels.length || !datasets.length) return <p className="text-[#86868B] text-sm text-center py-8">Sem dados para o periodo selecionado.</p>;

  const padding = { top: 20, right: 20, bottom: 40, left: 70 };
  const width = 600;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Calculate Y range from all values
  const allVals = datasets.flatMap((d) => d.prices.filter((p): p is number => p !== null));
  if (allVals.length === 0) return <p className="text-[#86868B] text-sm text-center py-8">Sem dados para o periodo selecionado.</p>;

  const minVal = Math.min(...allVals) * 0.9;
  const maxVal = Math.max(...allVals) * 1.1;
  const range = maxVal - minVal || 1;

  const xStep = labels.length > 1 ? chartW / (labels.length - 1) : chartW;

  function toX(i: number) { return padding.left + (labels.length > 1 ? i * xStep : chartW / 2); }
  function toY(v: number) { return padding.top + chartH - ((v - minVal) / range) * chartH; }

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => Math.round(minVal + (range * i) / (yTicks - 1)));

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[600px] mx-auto" style={{ minWidth: 400 }}>
        {/* Grid lines */}
        {yTickValues.map((v, i) => (
          <g key={i}>
            <line x1={padding.left} y1={toY(v)} x2={width - padding.right} y2={toY(v)} stroke="#E8E8ED" strokeWidth={1} strokeDasharray="4,4" />
            <text x={padding.left - 8} y={toY(v) + 4} textAnchor="end" fontSize={10} fill="#86868B">
              {`R$ ${(v / 1000).toFixed(1)}k`}
            </text>
          </g>
        ))}

        {/* X labels */}
        {labels.map((label, i) => (
          <text key={i} x={toX(i)} y={height - 8} textAnchor="middle" fontSize={10} fill="#86868B">{label}</text>
        ))}

        {/* Data lines */}
        {datasets.map((ds) => {
          const points = ds.prices.map((p, i) => p !== null ? { x: toX(i), y: toY(p), val: p } : null).filter(Boolean) as { x: number; y: number; val: number }[];
          if (points.length < 1) return null;

          const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

          return (
            <g key={ds.supplier}>
              <path d={pathD} fill="none" stroke={ds.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4} fill={ds.color} stroke="white" strokeWidth={2} />
                  <title>{`${ds.supplier}: R$ ${p.val.toLocaleString("pt-BR")}`}</title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex gap-4 justify-center flex-wrap mt-2">
        {datasets.map((ds) => (
          <div key={ds.supplier} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: ds.color }} />
            <span className="text-xs text-[#86868B]">{ds.supplier}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════ Historico de Precos ═══════════
interface HistoricoData {
  labels: string[];
  datasets: ChartDataset[];
  products: string[];
  suppliers: string[];
  stats: { current: number; lowest: number; highest: number; avg: number; trend: string };
  details: { data: string; fornecedor: string; produto: string; cor: string | null; custo: number; qnt: number }[];
}

function HistoricoPrecos() {
  const { password } = useAdmin();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HistoricoData | null>(null);
  const [produto, setProduto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [meses, setMeses] = useState<3 | 6>(3);

  const fetchHistorico = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ meses: String(meses) });
      if (produto) params.set("produto", produto);
      if (fornecedor) params.set("fornecedor", fornecedor);

      const res = await fetch(`/api/admin/historico-precos?${params}`, {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [password, produto, fornecedor, meses]);

  useEffect(() => {
    if (password) fetchHistorico();
  }, [password, fetchHistorico]);

  const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
  const trendIcon = data?.stats.trend === "up" ? "\u2191" : data?.stats.trend === "down" ? "\u2193" : "\u2192";
  const trendColor = data?.stats.trend === "up" ? "text-red-500" : data?.stats.trend === "down" ? "text-green-600" : "text-[#86868B]";

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold text-[#1D1D1F]">Historico de Precos por Fornecedor</h2>
        <p className="text-[#86868B] text-xs">Evolucao dos custos de compra ao longo do tempo.</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="min-w-[200px] flex-1">
          <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Produto</p>
          <input
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            placeholder="Buscar produto... (vazio = todos)"
            className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm focus:outline-none focus:border-[#E8740E]"
          />
        </div>
        <div className="min-w-[160px]">
          <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Fornecedor</p>
          <select
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm focus:outline-none focus:border-[#E8740E]"
          >
            <option value="">Todos</option>
            {data?.suppliers.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[#86868B] uppercase mb-1">Periodo</p>
          <div className="flex gap-1">
            <button
              onClick={() => setMeses(3)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${meses === 3 ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}
            >
              3 meses
            </button>
            <button
              onClick={() => setMeses(6)}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${meses === 6 ? "bg-[#E8740E] text-white" : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"}`}
            >
              6 meses
            </button>
          </div>
        </div>
      </div>

      {loading && <div className="py-8 text-center text-[#86868B]">Carregando...</div>}

      {data && !loading && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Preco Atual", value: fmt(data.stats.current), color: "#1D1D1F" },
              { label: "Menor Preco", value: fmt(data.stats.lowest), color: "#2ECC71" },
              { label: "Maior Preco", value: fmt(data.stats.highest), color: "#E74C3C" },
              { label: "Media", value: fmt(data.stats.avg), color: "#3498DB" },
              { label: "Tendencia", value: trendIcon, color: "" },
            ].map((s) => (
              <div key={s.label} className="bg-white border border-[#D2D2D7] rounded-2xl p-3 shadow-sm">
                <p className="text-[#86868B] text-[10px] uppercase tracking-wider">{s.label}</p>
                <p className={`text-lg font-bold ${s.label === "Tendencia" ? trendColor : ""}`} style={s.color ? { color: s.color } : undefined}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-5 shadow-sm">
            <h3 className="font-semibold text-sm text-[#1D1D1F] mb-3">Evolucao de Precos</h3>
            <LineChart labels={data.labels} datasets={data.datasets} />
          </div>

          {/* Detail table */}
          {data.details.length > 0 && (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-[#F5F5F7] border-b border-[#D2D2D7]">
                <h3 className="font-semibold text-[#1D1D1F] text-sm">Compras Detalhadas ({data.details.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#F5F5F7]">
                      <th className="px-4 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Data</th>
                      <th className="px-4 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Fornecedor</th>
                      <th className="px-4 py-2 text-left text-[#86868B] text-xs uppercase tracking-wider font-medium">Produto</th>
                      <th className="px-4 py-2 text-right text-[#86868B] text-xs uppercase tracking-wider font-medium">Custo</th>
                      <th className="px-4 py-2 text-right text-[#86868B] text-xs uppercase tracking-wider font-medium">Qtd</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.details.slice(0, 50).map((d, i) => (
                      <tr key={i} className="border-b border-[#F5F5F7] last:border-0 hover:bg-[#F5F5F7] transition-colors">
                        <td className="px-4 py-2.5 text-[#86868B]">{d.data}</td>
                        <td className="px-4 py-2.5 font-medium">{d.fornecedor}</td>
                        <td className="px-4 py-2.5">{d.produto}{d.cor ? ` ${d.cor}` : ""}</td>
                        <td className="px-4 py-2.5 text-right font-semibold">{fmt(d.custo)}</td>
                        <td className="px-4 py-2.5 text-right text-[#86868B]">{d.qnt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminPrecosPage() {
  const [modo, setModo] = useState<"valores" | "usados" | "historico">("valores");

  return (
    <div className="space-y-4">
      {/* Seletor de modo */}
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={() => setModo("valores")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            modo === "valores"
              ? "bg-[#E8740E] text-white"
              : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"
          }`}
        >
          Alteracao de Valores
        </button>
        <button
          onClick={() => setModo("usados")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            modo === "usados"
              ? "bg-[#E8740E] text-white"
              : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"
          }`}
        >
          Avaliacao dos Usados
        </button>
        <button
          onClick={() => setModo("historico")}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors ${
            modo === "historico"
              ? "bg-[#E8740E] text-white"
              : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"
          }`}
        >
          Historico de Precos
        </button>
      </div>

      {modo === "valores" && <PrecosContent />}
      {modo === "usados" && (
        <Suspense fallback={<div className="text-center py-8 text-gray-400">Carregando...</div>}>
          <UsadosContent />
        </Suspense>
      )}
      {modo === "historico" && <HistoricoPrecos />}
    </div>
  );
}
