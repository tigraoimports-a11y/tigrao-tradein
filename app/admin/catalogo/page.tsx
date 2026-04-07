"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { corParaPT } from "@/lib/cor-pt";

// Traduz valores de specs em inglês pra português no display (não altera o banco).
// A chave continua sendo a string original, então selecionar/comparar funciona igual.
const COR_PT: Record<string, string> = {
  "alpine green": "Verde Alpino",
  "black": "Preto",
  "black titanium": "Titânio Preto",
  "blue": "Azul",
  "blue titanium": "Titânio Azul",
  "blush": "Rosa Claro",
  "citrus": "Amarelo Cítrico",
  "cloud white": "Branco Nuvem",
  "cosmic orange": "Laranja Cósmico",
  "deep blue": "Azul Profundo",
  "deep purple": "Roxo Profundo",
  "desert titanium": "Titânio Deserto",
  "gold": "Dourado",
  "graphite": "Grafite",
  "green": "Verde",
  "indigo": "Índigo",
  "lavender": "Lavanda",
  "light gold": "Dourado Claro",
  "midnight": "Meia-Noite",
  "midnight green": "Verde Meia-Noite",
  "orange": "Laranja",
  "mist blue": "Azul Névoa",
  "natural titanium": "Titânio Natural",
  "pacific blue": "Azul Pacífico",
  "pink": "Rosa",
  "purple": "Roxo",
  "red": "Vermelho",
  "sage": "Sálvia",
  "sierra blue": "Azul Serra",
  "silver": "Prata",
  "sky blue": "Azul Céu",
  "space black": "Preto Espacial",
  "space gray": "Cinza Espacial",
  "starlight": "Estelar",
  "teal": "Verde Água",
  "ultramarine": "Azul Ultramarino",
  "white": "Branco",
  "white titanium": "Titânio Branco",
  "yellow": "Amarelo",
};

function traduzirValor(valor: string, tipoChave?: string): string {
  // Para cores: mostra EN + PT simplificado lado a lado, ex: "Sky Blue  Azul"
  if (tipoChave === "cores") {
    const pt = corParaPT(valor);
    if (pt && pt !== valor && pt !== "—") return `${valor}  ${pt}`;
    return valor;
  }
  const pt = COR_PT[valor.toLowerCase().trim()];
  return pt || valor;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Categoria {
  id: string;
  key: string;
  nome: string;
  emoji: string;
  usa_imei: boolean;
  usa_cor: boolean;
  tem_specs: boolean;
  ordem: number;
  ativo: boolean;
}

interface Modelo {
  id: string;
  categoria_key: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

interface SpecTipo {
  id: string;
  chave: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

interface SpecValor {
  id: string;
  tipo_chave: string;
  valor: string;
  ordem: number;
  ativo: boolean;
}

interface CategoriaSpec {
  id: string;
  categoria_key: string;
  tipo_chave: string;
  obrigatoria: boolean;
  ordem: number;
}

interface CatalogoData {
  categorias: Categoria[];
  modelos: Modelo[];
  specTipos: SpecTipo[];
  specValores: SpecValor[];
  categoriaSpecs: CategoriaSpec[];
}

type TabKey = "categorias" | "modelos" | "especificacoes";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BASE = "/api/admin/catalogo";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CatalogoPage() {
  const { password } = useAdmin();
  const [tab, setTab] = useState<TabKey>("categorias");
  const [data, setData] = useState<CatalogoData>({
    categorias: [],
    modelos: [],
    specTipos: [],
    specValores: [],
    categoriaSpecs: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(
    () => ({ "Content-Type": "application/json", "x-admin-password": password }),
    [password]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(BASE, { headers: headers() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    load();
  }, [load]);

  const tabCls = (t: TabKey) =>
    `px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
      tab === t
        ? "bg-[#E8740E] text-white"
        : "text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
    }`;

  return (
    <div className="min-h-screen bg-[#F5F5F7] p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1D1D1F]">📋 Catálogo de Produtos</h1>
            <p className="text-sm text-[#86868B] mt-0.5">
              Gerencie categorias, modelos e especificações dinamicamente
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] transition-colors disabled:opacity-50"
          >
            {loading ? "Carregando..." : "↺ Atualizar"}
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            <strong>Erro:</strong> {error}
            {error.includes("does not exist") || error.includes("tablesNotFound") ? (
              <span className="ml-2 text-red-500">
                — Execute a migration SQL no Supabase primeiro.
              </span>
            ) : null}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm p-2 flex gap-1">
          <button className={tabCls("categorias")} onClick={() => setTab("categorias")}>
            Categorias
          </button>
          <button className={tabCls("modelos")} onClick={() => setTab("modelos")}>
            Modelos
          </button>
          <button className={tabCls("especificacoes")} onClick={() => setTab("especificacoes")}>
            Especificações
          </button>
        </div>

        {/* Tab content */}
        {tab === "categorias" && (
          <CategoriasTab data={data} setData={setData} headers={headers} reload={load} />
        )}
        {tab === "modelos" && (
          <ModelosTab data={data} setData={setData} headers={headers} reload={load} />
        )}
        {tab === "especificacoes" && (
          <EspecificacoesTab data={data} setData={setData} headers={headers} reload={load} />
        )}
      </div>
    </div>
  );
}

// ─── Shared types ─────────────────────────────────────────────────────────────

interface TabProps {
  data: CatalogoData;
  setData: React.Dispatch<React.SetStateAction<CatalogoData>>;
  headers: () => Record<string, string>;
  reload: () => void;
}

// ─── Categorias Tab ───────────────────────────────────────────────────────────

function CategoriasTab({ data, headers, reload }: TabProps) {
  const [selectedCat, setSelectedCat] = useState<Categoria | null>(null);
  const [localSpecs, setLocalSpecs] = useState<CategoriaSpec[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newCat, setNewCat] = useState({ key: "", nome: "", emoji: "📦", usa_imei: false, usa_cor: true, tem_specs: true });
  const [editingCat, setEditingCat] = useState<Categoria | null>(null);
  const [editForm, setEditForm] = useState({ nome: "", emoji: "" });
  const [savingCat, setSavingCat] = useState<string | null>(null);

  const inputCls = "border border-[#E8E8ED] rounded-lg px-3 py-1.5 text-sm text-[#1D1D1F] bg-white focus:outline-none focus:ring-2 focus:ring-[#E8740E]/40";

  useEffect(() => {
    if (selectedCat) {
      const specs = data.categoriaSpecs
        .filter((cs) => cs.categoria_key === selectedCat.key)
        .sort((a, b) => a.ordem - b.ordem);
      setLocalSpecs(specs);
    }
  }, [data.categoriaSpecs, selectedCat?.key]);

  function selectCat(cat: Categoria) {
    setSelectedCat(cat);
    setSavedMsg(false);
    const specs = data.categoriaSpecs
      .filter((cs) => cs.categoria_key === cat.key)
      .sort((a, b) => a.ordem - b.ordem);
    setLocalSpecs(specs);
  }

  function toggleSpec(tipoChave: string) {
    const existing = localSpecs.find((cs) => cs.tipo_chave === tipoChave);
    if (existing) {
      setLocalSpecs((prev) => prev.filter((cs) => cs.tipo_chave !== tipoChave));
    } else {
      const maxOrdem = localSpecs.length > 0 ? Math.max(...localSpecs.map((cs) => cs.ordem)) + 1 : 1;
      setLocalSpecs((prev) => [
        ...prev,
        { id: `temp_${tipoChave}`, categoria_key: selectedCat!.key, tipo_chave: tipoChave, obrigatoria: false, ordem: maxOrdem },
      ]);
    }
  }

  function toggleObrigatoria(tipoChave: string) {
    setLocalSpecs((prev) => prev.map((cs) => cs.tipo_chave === tipoChave ? { ...cs, obrigatoria: !cs.obrigatoria } : cs));
  }

  function handleDrop(targetIdx: number) {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setOverIdx(null); return; }
    const next = [...localSpecs];
    const [removed] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, removed);
    setLocalSpecs(next.map((cs, i) => ({ ...cs, ordem: i + 1 })));
    setDragIdx(null);
    setOverIdx(null);
  }

  async function saveConfig() {
    if (!selectedCat) return;
    setSaving(true);
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          resource: "categoria_specs_config",
          categoria_key: selectedCat.key,
          specs: localSpecs.map((cs, i) => ({ tipo_chave: cs.tipo_chave, obrigatoria: cs.obrigatoria, ordem: i + 1 })),
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCat(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.key || !newCat.nome) return;
    setSavingCat("new");
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ resource: "categorias", ...newCat, ordem: data.categorias.length + 1 }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setShowNewForm(false);
      setNewCat({ key: "", nome: "", emoji: "📦", usa_imei: false, usa_cor: true, tem_specs: true });
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSavingCat(null);
    }
  }

  async function handleDeleteCat(cat: Categoria) {
    if (!confirm(`Remover "${cat.nome}"?`)) return;
    setSavingCat(cat.id);
    try {
      const res = await fetch(BASE, {
        method: "DELETE",
        headers: headers(),
        body: JSON.stringify({ resource: "categorias", id: cat.id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (selectedCat?.id === cat.id) setSelectedCat(null);
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSavingCat(null);
    }
  }

  async function handleSaveEdit(cat: Categoria) {
    setSavingCat(cat.id);
    try {
      const res = await fetch(BASE, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ resource: "categorias", id: cat.id, nome: editForm.nome, emoji: editForm.emoji }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setEditingCat(null);
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSavingCat(null);
    }
  }

  const sortedCats = [...data.categorias].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="flex gap-4" style={{ minHeight: 600 }}>
      {/* Left: Category list */}
      <div className="w-80 shrink-0 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#F5F5F7] flex items-center justify-between">
          <h2 className="font-semibold text-[#1D1D1F]">Categorias</h2>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors"
          >
            + Nova Categoria
          </button>
        </div>

        {showNewForm && (
          <form onSubmit={handleCreateCat} className="p-3 bg-[#FFF5EB] border-b border-[#E8740E]/20 space-y-2">
            <div className="flex gap-2">
              <input value={newCat.emoji} onChange={(e) => setNewCat((p) => ({ ...p, emoji: e.target.value }))} className={`${inputCls} w-12 text-center`} placeholder="📦" />
              <input value={newCat.nome} onChange={(e) => setNewCat((p) => ({ ...p, nome: e.target.value }))} placeholder="Nome" className={`${inputCls} flex-1`} required />
            </div>
            <input value={newCat.key} onChange={(e) => setNewCat((p) => ({ ...p, key: e.target.value.toUpperCase().replace(/\s/g, "_") }))} placeholder="CHAVE_UNICA" className={`${inputCls} w-full font-mono text-xs`} required />
            <div className="flex gap-3 text-xs text-[#1D1D1F]">
              {[["usa_imei","IMEI"],["usa_cor","Cor"],["tem_specs","Specs"]].map(([k, l]) => (
                <label key={k} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={newCat[k as keyof typeof newCat] as boolean} onChange={(e) => setNewCat((p) => ({ ...p, [k]: e.target.checked }))} className="accent-[#E8740E]" />
                  {l}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={savingCat === "new"} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white disabled:opacity-50">{savingCat === "new" ? "..." : "Criar"}</button>
              <button type="button" onClick={() => setShowNewForm(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F5F5F7] text-[#1D1D1F]">Cancelar</button>
            </div>
          </form>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-[#F5F5F7]">
          {sortedCats.map((cat) => (
            <div key={cat.id}>
              <button
                onClick={() => selectCat(cat)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                  selectedCat?.id === cat.id ? "bg-blue-50 border-l-4 border-blue-500" : "hover:bg-[#F5F5F7]"
                }`}
              >
                <div className="min-w-0 flex-1">
                  {editingCat?.id === cat.id ? (
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <input value={editForm.emoji} onChange={(e) => setEditForm((p) => ({ ...p, emoji: e.target.value }))} className="w-10 border border-[#E8E8ED] rounded px-1 text-sm text-center bg-white text-[#1D1D1F]" />
                      <input value={editForm.nome} onChange={(e) => setEditForm((p) => ({ ...p, nome: e.target.value }))} className="flex-1 border border-[#E8E8ED] rounded px-2 text-sm bg-white text-[#1D1D1F]" autoFocus />
                      <button onClick={() => handleSaveEdit(cat)} disabled={savingCat === cat.id} className="px-2 py-0.5 rounded text-xs bg-green-500 text-white disabled:opacity-50">✓</button>
                      <button onClick={() => setEditingCat(null)} className="px-2 py-0.5 rounded text-xs bg-[#F5F5F7] text-[#1D1D1F]">✕</button>
                    </div>
                  ) : (
                    <>
                      <div className={`font-semibold text-sm ${selectedCat?.id === cat.id ? "text-blue-700" : "text-[#1D1D1F]"}`}>{cat.emoji} {cat.nome}</div>
                      <div className="text-xs text-[#86868B] font-mono mt-0.5">{cat.key}</div>
                    </>
                  )}
                </div>
                {editingCat?.id !== cat.id && (
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => { setEditingCat(cat); setEditForm({ nome: cat.nome, emoji: cat.emoji }); }} className="p-1.5 rounded text-[#86868B] hover:text-[#1D1D1F] hover:bg-[#F5F5F7] transition-colors text-xs">✏️</button>
                    <button onClick={() => handleDeleteCat(cat)} disabled={savingCat === cat.id} className="p-1.5 rounded text-[#C7C7CC] hover:text-red-500 hover:bg-[#F5F5F7] transition-colors text-xs disabled:opacity-50">🗑️</button>
                  </div>
                )}
              </button>
            </div>
          ))}
          {sortedCats.length === 0 && (
            <div className="text-center py-8 text-[#86868B] text-sm">Nenhuma categoria.</div>
          )}
        </div>
      </div>

      {/* Right: Spec assignment panel */}
      <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
        {!selectedCat && (
          <div className="flex flex-col items-center justify-center flex-1 text-[#86868B]">
            <div className="text-5xl mb-3">📋</div>
            <p className="text-sm font-medium">Selecione uma categoria</p>
            <p className="text-xs mt-1">para configurar suas especificações</p>
          </div>
        )}

        {selectedCat && (
          <>
            <div className="p-4 border-b border-[#F5F5F7] flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg text-[#1D1D1F]">Especificações - {selectedCat.nome}</h2>
                <p className="text-sm text-[#86868B] mt-0.5">Selecione quais especificações pertencem a esta categoria</p>
              </div>
              <button
                onClick={saveConfig}
                disabled={saving}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 ${
                  savedMsg ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {savedMsg ? "✓ Salvo!" : saving ? "Salvando..." : "💾 Salvar Configuração"}
              </button>
            </div>

            <div className="p-5 space-y-6 overflow-y-auto flex-1">
              {/* Especificações Disponíveis */}
              <div>
                <h3 className="font-bold text-[#1D1D1F] mb-1">Especificações Disponíveis</h3>
                <p className="text-sm text-[#86868B] mb-3">Selecione quais especificações pertencem a esta categoria</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {[...data.specTipos].sort((a, b) => a.nome.localeCompare(b.nome)).map((tipo) => {
                    const checked = localSpecs.some((cs) => cs.tipo_chave === tipo.chave);
                    return (
                      <label key={tipo.id} className="flex items-center gap-2 cursor-pointer group select-none">
                        <div
                          onClick={() => toggleSpec(tipo.chave)}
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                            checked ? "border-blue-500 bg-blue-500" : "border-[#C7C7CC] group-hover:border-blue-400"
                          }`}
                        >
                          {checked && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <span className="text-sm text-[#1D1D1F]">{tipo.nome}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Ordem de Exibição */}
              {localSpecs.length > 0 && (
                <div>
                  <h3 className="font-bold text-[#1D1D1F] mb-1">Ordem de Exibição</h3>
                  <p className="text-sm text-[#86868B] mb-3">Arraste para reordenar como as especificações aparecerão no formulário</p>
                  <div className="space-y-1">
                    {localSpecs.map((cs, i) => {
                      const tipo = data.specTipos.find((t) => t.chave === cs.tipo_chave);
                      return (
                        <div
                          key={cs.tipo_chave}
                          draggable
                          onDragStart={() => setDragIdx(i)}
                          onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                          onDrop={() => handleDrop(i)}
                          onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors cursor-grab active:cursor-grabbing ${
                            overIdx === i && dragIdx !== i ? "border-blue-400 bg-blue-50" : "border-[#E8E8ED] bg-white hover:bg-[#FAFAFA]"
                          }`}
                        >
                          <span className="text-[#C7C7CC] text-sm select-none">⠿⠿</span>
                          <span className="flex-1 text-sm font-medium text-[#1D1D1F]">{tipo?.nome ?? cs.tipo_chave}</span>
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <div
                              onClick={() => toggleObrigatoria(cs.tipo_chave)}
                              className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                cs.obrigatoria ? "border-orange-500 bg-orange-500" : "border-[#C7C7CC] hover:border-orange-400"
                              }`}
                            >
                              {cs.obrigatoria && <div className="w-2 h-2 rounded-sm bg-white" />}
                            </div>
                            <span className={`text-xs font-medium ${cs.obrigatoria ? "text-orange-600" : "text-[#86868B]"}`}>
                              Obrigatória{cs.obrigatoria ? " *" : ""}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modelos Tab ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

function ModelosTab({ data, headers, reload }: TabProps) {
  const [search, setSearch] = useState("");
  const [filtroCat, setFiltroCat] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selectedModelo, setSelectedModelo] = useState<Modelo | null>(null);
  const [configs, setConfigs] = useState<Set<string>>(new Set());
  const [loadingConfigs, setLoadingConfigs] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newNome, setNewNome] = useState("");
  const [newCat, setNewCat] = useState(data.categorias[0]?.key ?? "IPHONES");

  const inputCls =
    "border border-[#E8E8ED] rounded-lg px-3 py-1.5 text-sm text-[#1D1D1F] bg-white focus:outline-none focus:ring-2 focus:ring-[#E8740E]/40";

  function getCatNome(key: string) {
    return data.categorias.find((c) => c.key === key)?.nome ?? key;
  }

  const filteredModelos = data.modelos
    .filter((m) => !filtroCat || m.categoria_key === filtroCat)
    .filter(
      (m) =>
        m.nome.toLowerCase().includes(search.toLowerCase()) ||
        getCatNome(m.categoria_key).toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (a.categoria_key !== b.categoria_key) {
        const catOrdemA = data.categorias.find((c) => c.key === a.categoria_key)?.ordem ?? 999;
        const catOrdemB = data.categorias.find((c) => c.key === b.categoria_key)?.ordem ?? 999;
        return catOrdemA - catOrdemB;
      }
      return a.ordem - b.ordem;
    });

  const totalPages = Math.ceil(filteredModelos.length / PAGE_SIZE);
  const pagedModelos = filteredModelos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
  }

  async function loadConfigs(modelo: Modelo) {
    setSelectedModelo(modelo);
    setLoadingConfigs(true);
    setSavedMsg(false);
    try {
      const res = await fetch(`${BASE}?modelo_id=${modelo.id}`, { headers: headers() });
      const json = await res.json();
      if (json.configs) {
        setConfigs(new Set(json.configs.map((c: { tipo_chave: string; valor: string }) => `${c.tipo_chave}:${c.valor}`)));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingConfigs(false);
    }
  }

  async function saveConfigs() {
    if (!selectedModelo) return;
    setSaving("configs");
    try {
      const configList = Array.from(configs).map((k) => {
        const idx = k.indexOf(":");
        return { tipo_chave: k.slice(0, idx), valor: k.slice(idx + 1) };
      });
      const res = await fetch(BASE, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ resource: "modelo_configs", modelo_id: selectedModelo.id, configs: configList }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2500);
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(null);
    }
  }

  function toggleConfig(tipoChave: string, valor: string) {
    const key = `${tipoChave}:${valor}`;
    setConfigs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleAddModelo(e: React.FormEvent) {
    e.preventDefault();
    if (!newNome.trim()) return;
    setSaving("new");
    try {
      const catModelos = data.modelos.filter((m) => m.categoria_key === newCat);
      const maxOrdem = catModelos.length > 0 ? Math.max(...catModelos.map((m) => m.ordem)) + 1 : 1;
      const res = await fetch(BASE, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ resource: "modelos", categoria_key: newCat, nome: newNome.trim(), ordem: maxOrdem }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setNewNome("");
      setShowNewForm(false);
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleDelete(m: Modelo) {
    if (!confirm(`Remover "${m.nome}"?`)) return;
    setSaving(m.id);
    try {
      const res = await fetch(BASE, {
        method: "DELETE",
        headers: headers(),
        body: JSON.stringify({ resource: "modelos", id: m.id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (selectedModelo?.id === m.id) setSelectedModelo(null);
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(null);
    }
  }

  const catSpecs = selectedModelo
    ? data.categoriaSpecs
        .filter((cs) => cs.categoria_key === selectedModelo.categoria_key)
        .sort((a, b) => a.ordem - b.ordem)
    : [];

  return (
    <div className="flex gap-4" style={{ minHeight: 600 }}>
      {/* Left: Model list */}
      <div className="w-80 shrink-0 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#F5F5F7] flex items-center justify-between">
          <h2 className="font-semibold text-[#1D1D1F]">Modelos</h2>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors"
          >
            + Novo Modelo
          </button>
        </div>

        {showNewForm && (
          <form onSubmit={handleAddModelo} className="p-3 bg-[#FFF5EB] border-b border-[#E8740E]/20 space-y-2">
            <select value={newCat} onChange={(e) => setNewCat(e.target.value)} className={`${inputCls} w-full`}>
              {data.categorias.map((c) => (
                <option key={c.key} value={c.key}>{c.emoji} {c.nome}</option>
              ))}
            </select>
            <input
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              placeholder="Nome do modelo"
              className={`${inputCls} w-full`}
              required
            />
            <div className="flex gap-2">
              <button type="submit" disabled={saving === "new"} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white disabled:opacity-50">
                {saving === "new" ? "..." : "Criar"}
              </button>
              <button type="button" onClick={() => setShowNewForm(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F5F5F7] text-[#1D1D1F]">
                Cancelar
              </button>
            </div>
          </form>
        )}

        <div className="p-3 border-b border-[#F5F5F7] space-y-2">
          <select
            value={filtroCat}
            onChange={(e) => { setFiltroCat(e.target.value); setPage(1); }}
            className={`${inputCls} w-full`}
          >
            <option value="">Todas as categorias ({data.modelos.length})</option>
            {data.categorias
              .slice()
              .sort((a, b) => a.ordem - b.ordem)
              .map((c) => {
                const count = data.modelos.filter((m) => m.categoria_key === c.key).length;
                return (
                  <option key={c.key} value={c.key}>
                    {c.emoji} {c.nome} ({count})
                  </option>
                );
              })}
          </select>
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar modelos..."
            className={`${inputCls} w-full`}
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#F5F5F7]">
          {pagedModelos.map((m) => (
            <button
              key={m.id}
              onClick={() => loadConfigs(m)}
              className={`w-full text-left px-4 py-3 flex items-start justify-between gap-2 transition-colors ${
                selectedModelo?.id === m.id
                  ? "bg-blue-600 text-white"
                  : "hover:bg-[#F5F5F7] text-[#1D1D1F]"
              }`}
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{m.nome}</div>
                <div className={`text-xs mt-0.5 ${selectedModelo?.id === m.id ? "text-blue-200" : "text-[#86868B]"}`}>
                  {getCatNome(m.categoria_key)}
                </div>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                  selectedModelo?.id === m.id
                    ? "bg-blue-500 text-white"
                    : m.ativo
                    ? "bg-blue-100 text-blue-600"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {m.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(m); }}
                disabled={saving === m.id}
                className={`shrink-0 mt-1 text-xs p-1 disabled:opacity-50 ${
                  selectedModelo?.id === m.id ? "text-blue-200 hover:text-white" : "text-[#C7C7CC] hover:text-red-500"
                }`}
              >
                🗑️
              </button>
            </button>
          ))}
          {filteredModelos.length === 0 && (
            <div className="text-center py-8 text-[#86868B] text-sm">Nenhum modelo encontrado.</div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-3 py-2 border-t border-[#F5F5F7] flex items-center justify-between gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 rounded text-xs font-semibold text-[#6E6E73] hover:bg-[#F5F5F7] disabled:opacity-30 transition-colors"
            >
              ‹ Ant
            </button>
            <span className="text-xs text-[#86868B]">
              {page} / {totalPages} &nbsp;·&nbsp; {filteredModelos.length} modelos
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 rounded text-xs font-semibold text-[#6E6E73] hover:bg-[#F5F5F7] disabled:opacity-30 transition-colors"
            >
              Próx ›
            </button>
          </div>
        )}
      </div>

      {/* Right: Config panel */}
      <div className="flex-1 bg-white rounded-xl shadow-sm overflow-hidden flex flex-col">
        {!selectedModelo && (
          <div className="flex flex-col items-center justify-center flex-1 text-[#86868B]">
            <div className="text-5xl mb-3">📦</div>
            <p className="text-sm font-medium">Selecione um modelo</p>
            <p className="text-xs mt-1">para configurar suas especificações</p>
          </div>
        )}

        {selectedModelo && (
          <>
            <div className="p-4 border-b border-[#F5F5F7] flex items-center justify-between">
              <div>
                <h2 className="font-bold text-lg text-[#1D1D1F]">Configuração - {selectedModelo.nome}</h2>
                <p className="text-sm text-[#86868B] mt-0.5">Categoria: {getCatNome(selectedModelo.categoria_key)}</p>
              </div>
              <button
                onClick={saveConfigs}
                disabled={saving === "configs" || loadingConfigs}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 ${
                  savedMsg ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {savedMsg ? "✓ Salvo!" : saving === "configs" ? "Salvando..." : "💾 Salvar Configuração"}
              </button>
            </div>

            {loadingConfigs && (
              <div className="flex items-center justify-center flex-1 text-[#86868B] text-sm">
                Carregando configurações...
              </div>
            )}

            {!loadingConfigs && catSpecs.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 text-[#86868B] text-sm">
                <p>Esta categoria não tem specs atribuídas.</p>
              </div>
            )}

            {!loadingConfigs && catSpecs.length > 0 && (
              <div className="p-5 space-y-6 overflow-y-auto flex-1">
                {catSpecs.map((cs) => {
                  const tipo = data.specTipos.find((t) => t.chave === cs.tipo_chave);
                  const valores = data.specValores
                    .filter((v) => v.tipo_chave === cs.tipo_chave)
                    .sort((a, b) => a.ordem - b.ordem);
                  if (!tipo || valores.length === 0) return null;
                  const selectedCount = valores.filter((v) => configs.has(`${cs.tipo_chave}:${v.valor}`)).length;
                  return (
                    <div key={cs.tipo_chave} className="bg-[#FAFAFA] rounded-xl p-4">
                      <h3 className="font-bold text-[#1D1D1F] mb-3">
                        {tipo.nome} Disponíveis{" "}
                        <span className="font-normal text-[#86868B] text-sm">
                          ({selectedCount} de {valores.length} selecionados)
                        </span>
                      </h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {valores.map((v) => {
                          const checked = configs.has(`${cs.tipo_chave}:${v.valor}`);
                          return (
                            <label key={v.id} className="flex items-center gap-2 cursor-pointer group select-none">
                              <div
                                onClick={() => toggleConfig(cs.tipo_chave, v.valor)}
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                  checked
                                    ? "border-blue-500 bg-blue-500"
                                    : "border-[#C7C7CC] group-hover:border-blue-400"
                                }`}
                              >
                                {checked && <div className="w-2 h-2 rounded-full bg-white" />}
                              </div>
                              <span className="text-sm text-[#1D1D1F]">{traduzirValor(v.valor, cs.tipo_chave)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Especificacoes Tab ───────────────────────────────────────────────────────

function EspecificacoesTab({ data, headers, reload }: TabProps) {
  const [selectedTipo, setSelectedTipo] = useState<SpecTipo | null>(null);
  const [newTipoForm, setNewTipoForm] = useState(false);
  const [newTipo, setNewTipo] = useState({ chave: "", nome: "" });
  const [newValor, setNewValor] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const inputCls =
    "border border-[#E8E8ED] rounded-lg px-3 py-1.5 text-sm text-[#1D1D1F] bg-white focus:outline-none focus:ring-2 focus:ring-[#E8740E]/40";

  const selectedValores = selectedTipo
    ? data.specValores.filter((v) => v.tipo_chave === selectedTipo.chave).sort((a, b) => a.ordem - b.ordem)
    : [];

  async function handleAddTipo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTipo.chave || !newTipo.nome) return;
    setSaving("new_tipo");
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          resource: "spec_tipos",
          chave: newTipo.chave.toLowerCase().replace(/\s/g, "_"),
          nome: newTipo.nome,
          ordem: data.specTipos.length + 1,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setNewTipoForm(false);
      setNewTipo({ chave: "", nome: "" });
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleAddValor(e: React.FormEvent) {
    e.preventDefault();
    if (!newValor.trim() || !selectedTipo) return;
    setSaving("new_valor");
    try {
      const maxOrdem =
        selectedValores.length > 0
          ? Math.max(...selectedValores.map((v) => v.ordem)) + 1
          : 1;
      const res = await fetch(BASE, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          resource: "spec_valores",
          tipo_chave: selectedTipo.chave,
          valor: newValor.trim(),
          ordem: maxOrdem,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setNewValor("");
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteTipo(tipo: SpecTipo) {
    if (!confirm(`Remover o tipo "${tipo.nome}" e todos os seus valores?`)) return;
    setSaving(`tipo-${tipo.id}`);
    try {
      const res = await fetch(BASE, {
        method: "DELETE",
        headers: headers(),
        body: JSON.stringify({ resource: "spec_tipos", id: tipo.id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (selectedTipo?.id === tipo.id) setSelectedTipo(null);
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteValor(id: string) {
    if (!confirm("Remover este valor?")) return;
    setSaving(id);
    try {
      const res = await fetch(BASE, {
        method: "DELETE",
        headers: headers(),
        body: JSON.stringify({ resource: "spec_valores", id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Two panel layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Spec Tipos */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-[#F5F5F7] flex items-center justify-between">
            <h2 className="font-semibold text-[#1D1D1F]">Tipos de Spec</h2>
            <button
              onClick={() => setNewTipoForm(!newTipoForm)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors"
            >
              + Tipo
            </button>
          </div>

          {newTipoForm && (
            <form onSubmit={handleAddTipo} className="p-3 bg-[#FFF5EB] border-b border-[#E8740E]/20 space-y-2">
              <input
                value={newTipo.chave}
                onChange={(e) =>
                  setNewTipo((p) => ({ ...p, chave: e.target.value.toLowerCase().replace(/\s/g, "_") }))
                }
                placeholder="chave_unica"
                className={`${inputCls} w-full`}
                required
              />
              <input
                value={newTipo.nome}
                onChange={(e) => setNewTipo((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Nome legível"
                className={`${inputCls} w-full`}
                required
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving === "new_tipo"}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white disabled:opacity-50"
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setNewTipoForm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F5F5F7] text-[#1D1D1F]"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-[#F5F5F7]">
            {data.specTipos.map((tipo) => (
              <div
                key={tipo.id}
                className={`flex items-center justify-between px-4 py-3 transition-colors ${
                  selectedTipo?.id === tipo.id ? "bg-[#FFF5EB]" : "hover:bg-[#F5F5F7]"
                }`}
              >
                <button
                  onClick={() => setSelectedTipo(tipo)}
                  className="flex-1 text-left"
                >
                  <div>
                    <span className={`text-sm font-semibold ${selectedTipo?.id === tipo.id ? "text-[#E8740E]" : "text-[#1D1D1F]"}`}>{tipo.nome}</span>
                    <span className="ml-2 text-xs text-[#86868B] font-mono">{tipo.chave}</span>
                  </div>
                  <span className="text-xs text-[#86868B]">
                    {data.specValores.filter((v) => v.tipo_chave === tipo.chave).length} valores
                  </span>
                </button>
                <button
                  onClick={() => handleDeleteTipo(tipo)}
                  disabled={saving === `tipo-${tipo.id}`}
                  className="p-1.5 rounded text-[#C7C7CC] hover:text-red-500 hover:bg-[#F5F5F7] transition-colors text-xs disabled:opacity-50 shrink-0"
                >
                  🗑️
                </button>
              </div>
            ))}
            {data.specTipos.length === 0 && (
              <div className="text-center py-6 text-[#86868B] text-sm">
                Nenhum tipo de spec. Execute a migration SQL.
              </div>
            )}
          </div>
        </div>

        {/* Right: Valores for selected Tipo */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-[#F5F5F7]">
            <h2 className="font-semibold text-[#1D1D1F]">
              {selectedTipo ? `Valores: ${selectedTipo.nome}` : "Selecione um tipo →"}
            </h2>
          </div>

          {selectedTipo && (
            <>
              <form onSubmit={handleAddValor} className="p-3 border-b border-[#F5F5F7] flex gap-2">
                <input
                  value={newValor}
                  onChange={(e) => setNewValor(e.target.value)}
                  placeholder={`Novo valor para ${selectedTipo.nome}`}
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="submit"
                  disabled={saving === "new_valor" || !newValor.trim()}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#E8740E] text-white disabled:opacity-50"
                >
                  + Add
                </button>
              </form>

              <div className="p-3 flex flex-wrap gap-2">
                {selectedValores.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#F5F5F7] text-sm text-[#1D1D1F] border border-[#E8E8ED]"
                  >
                    <span>{traduzirValor(v.valor, selectedTipo.chave)}</span>
                    <button
                      onClick={() => handleDeleteValor(v.id)}
                      disabled={saving === v.id}
                      className="text-red-400 hover:text-red-600 text-xs ml-0.5 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {selectedValores.length === 0 && (
                  <span className="text-[#86868B] text-sm">Nenhum valor ainda.</span>
                )}
              </div>
            </>
          )}

          {!selectedTipo && (
            <div className="p-6 text-center text-[#86868B] text-sm">
              Clique em um tipo à esquerda para ver e editar seus valores.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ─── Small reusable components ────────────────────────────────────────────────

function EditableCell({
  value,
  onSave,
  disabled,
}: {
  value: string;
  onSave: (v: string) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);

  function commit() {
    setEditing(false);
    if (local !== value) onSave(local);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setLocal(value);
            setEditing(false);
          }
        }}
        className="border border-[#E8740E] rounded px-2 py-0.5 text-sm w-full focus:outline-none"
        disabled={disabled}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-left text-sm text-[#1D1D1F] hover:text-[#E8740E] hover:underline transition-colors w-full"
      disabled={disabled}
      title="Clique para editar"
    >
      {value}
    </button>
  );
}

function ToggleCell({
  value,
  onToggle,
  disabled,
}: {
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`text-base transition-opacity disabled:opacity-50 ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
      title={value ? "Sim (clique para alterar)" : "Não (clique para alterar)"}
    >
      {value ? "✅" : "⬜"}
    </button>
  );
}
