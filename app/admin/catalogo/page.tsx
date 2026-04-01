"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAdmin } from "@/components/admin/AdminShell";

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
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [newCat, setNewCat] = useState({
    key: "",
    nome: "",
    emoji: "📦",
    usa_imei: false,
    usa_cor: true,
    tem_specs: true,
  });

  const inputCls =
    "w-full border border-[#E8E8ED] rounded-lg px-3 py-1.5 text-sm text-[#1D1D1F] bg-white focus:outline-none focus:ring-2 focus:ring-[#E8740E]/40";

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.key || !newCat.nome) return;
    setSaving("new");
    try {
      const res = await fetch(BASE, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ resource: "categorias", ...newCat, ordem: data.categorias.length + 1 }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setShowForm(false);
      setNewCat({ key: "", nome: "", emoji: "📦", usa_imei: false, usa_cor: true, tem_specs: true });
      reload();
    } catch (e) {
      alert(String(e));
    } finally {
      setSaving(null);
    }
  }

  async function toggleAtivo(cat: Categoria) {
    setSaving(cat.id);
    try {
      const res = await fetch(BASE, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ resource: "categorias", id: cat.id, ativo: !cat.ativo }),
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

  async function updateField(cat: Categoria, field: string, value: string | boolean) {
    setSaving(cat.id);
    try {
      const res = await fetch(BASE, {
        method: "PATCH",
        headers: headers(),
        body: JSON.stringify({ resource: "categorias", id: cat.id, [field]: value }),
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
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[#F5F5F7] flex items-center justify-between">
        <h2 className="font-semibold text-[#1D1D1F]">Categorias ({data.categorias.length})</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] transition-colors"
        >
          + Nova Categoria
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="p-4 bg-[#FFF5EB] border-b border-[#E8740E]/20 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#86868B] mb-1 block">Chave (KEY)</label>
              <input
                value={newCat.key}
                onChange={(e) => setNewCat((p) => ({ ...p, key: e.target.value.toUpperCase().replace(/\s/g, "_") }))}
                placeholder="EX: TABLETS"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#86868B] mb-1 block">Nome</label>
              <input
                value={newCat.nome}
                onChange={(e) => setNewCat((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Tablets"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-[#86868B] mb-1 block">Emoji</label>
              <input
                value={newCat.emoji}
                onChange={(e) => setNewCat((p) => ({ ...p, emoji: e.target.value }))}
                placeholder="📦"
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCat.usa_imei}
                  onChange={(e) => setNewCat((p) => ({ ...p, usa_imei: e.target.checked }))}
                  className="w-4 h-4 accent-[#E8740E]"
                />
                Usa IMEI
              </label>
              <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCat.usa_cor}
                  onChange={(e) => setNewCat((p) => ({ ...p, usa_cor: e.target.checked }))}
                  className="w-4 h-4 accent-[#E8740E]"
                />
                Usa Cor
              </label>
              <label className="flex items-center gap-2 text-sm text-[#1D1D1F] cursor-pointer">
                <input
                  type="checkbox"
                  checked={newCat.tem_specs}
                  onChange={(e) => setNewCat((p) => ({ ...p, tem_specs: e.target.checked }))}
                  className="w-4 h-4 accent-[#E8740E]"
                />
                Tem Specs
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving === "new"}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#E8740E] text-white hover:bg-[#D06A0D] disabled:opacity-50 transition-colors"
            >
              {saving === "new" ? "Salvando..." : "Criar Categoria"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#F5F5F7] text-[#1D1D1F] hover:bg-[#E8E8ED] transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F5F5F7] text-xs text-[#86868B] font-semibold">
              <th className="text-left px-4 py-2">Emoji</th>
              <th className="text-left px-4 py-2">Key</th>
              <th className="text-left px-4 py-2">Nome</th>
              <th className="text-center px-4 py-2">IMEI</th>
              <th className="text-center px-4 py-2">Cor</th>
              <th className="text-center px-4 py-2">Specs</th>
              <th className="text-center px-4 py-2">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {data.categorias.map((cat) => (
              <tr key={cat.id} className="border-t border-[#F5F5F7] hover:bg-[#FAFAFA]">
                <td className="px-4 py-2">
                  <EditableCell
                    value={cat.emoji}
                    onSave={(v) => updateField(cat, "emoji", v)}
                    disabled={saving === cat.id}
                  />
                </td>
                <td className="px-4 py-2 font-mono text-xs text-[#6E6E73]">{cat.key}</td>
                <td className="px-4 py-2">
                  <EditableCell
                    value={cat.nome}
                    onSave={(v) => updateField(cat, "nome", v)}
                    disabled={saving === cat.id}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <ToggleCell
                    value={cat.usa_imei}
                    onToggle={() => updateField(cat, "usa_imei", !cat.usa_imei)}
                    disabled={saving === cat.id}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <ToggleCell
                    value={cat.usa_cor}
                    onToggle={() => updateField(cat, "usa_cor", !cat.usa_cor)}
                    disabled={saving === cat.id}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <ToggleCell
                    value={cat.tem_specs}
                    onToggle={() => updateField(cat, "tem_specs", !cat.tem_specs)}
                    disabled={saving === cat.id}
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleAtivo(cat)}
                    disabled={saving === cat.id}
                    className={`w-12 h-6 rounded-full text-xs font-bold transition-colors disabled:opacity-50 ${
                      cat.ativo
                        ? "bg-green-500 text-white"
                        : "bg-[#E8E8ED] text-[#86868B]"
                    }`}
                  >
                    {cat.ativo ? "ON" : "OFF"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.categorias.length === 0 && (
          <div className="text-center py-8 text-[#86868B] text-sm">
            Nenhuma categoria. Execute a migration SQL primeiro.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modelos Tab ──────────────────────────────────────────────────────────────

function ModelosTab({ data, headers, reload }: TabProps) {
  const [search, setSearch] = useState("");
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
    .filter(
      (m) =>
        m.nome.toLowerCase().includes(search.toLowerCase()) ||
        getCatNome(m.categoria_key).toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (a.categoria_key !== b.categoria_key) return a.categoria_key.localeCompare(b.categoria_key);
      return a.ordem - b.ordem;
    });

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
      if (next.has(key)) next.delete(key);
      else next.add(key);
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

        <div className="p-3 border-b border-[#F5F5F7]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar modelos..."
            className={`${inputCls} w-full`}
          />
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-[#F5F5F7]">
          {filteredModelos.map((m) => (
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
                              <span className="text-sm text-[#1D1D1F]">{v.valor}</span>
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

  // Toggle category-spec assignment via supabase direct (using the API)
  async function toggleCatSpec(catKey: string, tipoChave: string, currentlyOn: boolean) {
    setSaving(`catspec-${catKey}-${tipoChave}`);
    try {
      if (currentlyOn) {
        // find the id and delete
        const existing = data.categoriaSpecs.find(
          (cs) => cs.categoria_key === catKey && cs.tipo_chave === tipoChave
        );
        if (existing) {
          // Use DELETE on the catalogo endpoint but we need to go direct;
          // Since categoriaSpecs is not a managed resource in this route, we use supabase
          // For now, use a workaround: PATCH to ativo=false isn't available for categoria_specs
          // We'll just show an info toast and recommend direct SQL
          alert("Para remover atribuições de spec, edite diretamente no Supabase por enquanto.");
        }
      } else {
        // add via POST to categories_specs - need a direct approach
        alert("Para adicionar atribuições de spec, edite diretamente no Supabase por enquanto.");
      }
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
              <button
                key={tipo.id}
                onClick={() => setSelectedTipo(tipo)}
                className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                  selectedTipo?.id === tipo.id
                    ? "bg-[#FFF5EB] text-[#E8740E]"
                    : "hover:bg-[#F5F5F7] text-[#1D1D1F]"
                }`}
              >
                <div>
                  <span className="text-sm font-semibold">{tipo.nome}</span>
                  <span className="ml-2 text-xs text-[#86868B] font-mono">{tipo.chave}</span>
                </div>
                <span className="text-xs text-[#86868B]">
                  {data.specValores.filter((v) => v.tipo_chave === tipo.chave).length} valores
                </span>
              </button>
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
                    <span>{v.valor}</span>
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

      {/* Category-Spec assignments grid */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-[#F5F5F7]">
          <h2 className="font-semibold text-[#1D1D1F]">Atribuições por Categoria</h2>
          <p className="text-xs text-[#86868B] mt-0.5">
            Quais specs cada categoria utiliza (leitura). Para modificar, edite a tabela{" "}
            <code className="font-mono bg-[#F5F5F7] px-1 rounded">catalogo_categoria_specs</code> no Supabase.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#F5F5F7]">
                <th className="text-left px-4 py-2 font-semibold text-[#86868B]">Categoria</th>
                {data.specTipos.map((t) => (
                  <th key={t.id} className="text-center px-2 py-2 font-semibold text-[#86868B] whitespace-nowrap">
                    {t.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.categorias.map((cat) => (
                <tr key={cat.id} className="border-t border-[#F5F5F7] hover:bg-[#FAFAFA]">
                  <td className="px-4 py-2 font-medium text-[#1D1D1F]">
                    {cat.emoji} {cat.nome}
                  </td>
                  {data.specTipos.map((tipo) => {
                    const assigned = data.categoriaSpecs.some(
                      (cs) => cs.categoria_key === cat.key && cs.tipo_chave === tipo.chave
                    );
                    const obrigatoria = data.categoriaSpecs.some(
                      (cs) =>
                        cs.categoria_key === cat.key &&
                        cs.tipo_chave === tipo.chave &&
                        cs.obrigatoria
                    );
                    return (
                      <td key={tipo.id} className="text-center px-2 py-2">
                        <button
                          onClick={() => toggleCatSpec(cat.key, tipo.chave, assigned)}
                          disabled={saving === `catspec-${cat.key}-${tipo.chave}`}
                          className={`w-6 h-6 rounded text-xs font-bold transition-colors ${
                            assigned
                              ? obrigatoria
                                ? "bg-[#E8740E] text-white"
                                : "bg-green-100 text-green-700 border border-green-300"
                              : "bg-[#F5F5F7] text-[#C7C7CC]"
                          }`}
                          title={
                            assigned
                              ? obrigatoria
                                ? "Obrigatória"
                                : "Opcional"
                              : "Não atribuída"
                          }
                        >
                          {assigned ? (obrigatoria ? "●" : "○") : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {data.categorias.length === 0 && (
            <div className="text-center py-6 text-[#86868B] text-sm">
              Sem dados. Execute a migration SQL no Supabase.
            </div>
          )}
        </div>
        <div className="px-4 py-2 bg-[#F5F5F7] text-xs text-[#86868B] flex gap-4">
          <span><span className="inline-block w-4 h-4 rounded bg-[#E8740E] mr-1"></span>Obrigatória</span>
          <span><span className="inline-block w-4 h-4 rounded bg-green-100 border border-green-300 mr-1"></span>Opcional</span>
          <span><span className="inline-block w-4 h-4 rounded bg-[#F5F5F7] border border-[#E8E8ED] mr-1"></span>Não atribuída</span>
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
