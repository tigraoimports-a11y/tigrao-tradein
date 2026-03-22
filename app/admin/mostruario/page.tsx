"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { TEMAS, TEMA_KEYS, getTemaKey } from "@/lib/temas";
import type { TemaKey } from "@/lib/temas";
import { TEMAS_TRADEIN, TEMA_TRADEIN_KEYS, getTemaTI } from "@/lib/temas-tradein";

/* ── Types ── */

interface Categoria {
  id: string;
  nome: string;
  slug: string;
  emoji: string;
  ordem: number;
  visivel: boolean;
}

interface Variacao {
  id: string;
  produto_id: string;
  nome: string;
  atributos: Record<string, string>;
  preco: number;
  preco_parcelado: number | null;
  imagem_url: string | null;
  visivel: boolean;
  ordem: number;
}

interface Produto {
  id: string;
  nome: string;
  slug: string;
  categoria_id: string;
  descricao: string | null;
  descricao_curta: string | null;
  imagem_url: string | null;
  tags: string[] | null;
  destaque: boolean;
  visivel: boolean;
  ordem: number;
  variacoes: Variacao[];
}

interface MostruarioConfig {
  banner_titulo: string;
  banner_subtitulo: string;
  banner_image_url: string | null;
  accent_color: string;
  whatsapp_numero: string;
  tema: string;
  tema_tradein: string;
  tema_tradein_noite: string;
  manutencao?: boolean;
}

/* ── Constants ── */

const DEFAULT_TAGS = ["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal", "eSIM only"];
const COLOR_SWATCHES = ["#E8740E", "#34C759", "#007AFF", "#FF3B30", "#5856D6"];

/* ── Helpers ── */

function formatBRL(value: number): string {
  if (!value) return "R$ 0";
  return `R$ ${Number(value).toLocaleString("pt-BR")}`;
}

/* ══════════════════════════════════════════════ */
/* ── Main Page                                ── */
/* ══════════════════════════════════════════════ */

export default function MostruarioPage() {
  const { password } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [config, setConfig] = useState<MostruarioConfig>({
    banner_titulo: "Produtos Apple Originais",
    banner_subtitulo: "Nota fiscal no seu nome | Lacrados | 1 ano garantia Apple",
    banner_image_url: null,
    accent_color: "#E8740E",
    whatsapp_numero: "5521999999999",
    tema: "tigrao",
    tema_tradein: "tigrao",
    tema_tradein_noite: "tigrao",
    manutencao: false,
  });

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const [showNewProduct, setShowNewProduct] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [showNewVariacao, setShowNewVariacao] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Categoria | null>(null);
  const [editingProduct, setEditingProduct] = useState<Produto | null>(null);
  const [editingVariacao, setEditingVariacao] = useState<Variacao | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const apiCall = useCallback(
    async (method: string, body?: unknown) => {
      const res = await fetch("/api/admin/mostruario", {
        method,
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return res.json();
    },
    [password]
  );

  const fetchData = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mostruario", {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setCategorias(json.categorias ?? []);
        setProdutos(json.produtos ?? []);
        if (json.config) setConfig(json.config);
        if (!activeCategory && json.categorias?.length > 0) {
          setActiveCategory(json.categorias[0].id);
        }
      }
    } catch {
      showToast("Erro ao carregar dados");
    }
    setLoading(false);
  }, [password, activeCategory, showToast]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  const saveConfig = useCallback(async () => {
    setSavingConfig(true);
    await apiCall("PATCH", { action: "update_config", ...config });
    showToast("Config salva!");
    setSavingConfig(false);
  }, [apiCall, config, showToast]);

  const uploadImage = useCallback(
    async (targetType: "produto_id" | "variacao_id", targetId: string, file: File) => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append(targetType, targetId);
        const res = await fetch("/api/admin/mostruario/upload", {
          method: "POST",
          headers: { "x-admin-password": password },
          body: formData,
        });
        const json = await res.json();
        if (json.ok) {
          showToast("Imagem salva!");
          await fetchData();
        } else {
          showToast(json.error || "Erro no upload");
        }
      } catch {
        showToast("Erro no upload");
      }
    },
    [password, showToast, fetchData]
  );

  const filteredProducts = produtos.filter(
    (p) => !activeCategory || p.categoria_id === activeCategory
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#86868B]">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-2 rounded-xl bg-[#1D1D1F] text-white text-sm font-medium shadow-lg animate-fadeIn">
          {toast}
        </div>
      )}

      <div>
        <h2 className="text-lg font-bold text-[#1D1D1F]">Mostruario V2</h2>
        <p className="text-[#86868B] text-xs">Gerencie categorias, produtos e variacoes do mostruario independente.</p>
      </div>

      <ConfigSection config={config} setConfig={setConfig} configOpen={configOpen} setConfigOpen={setConfigOpen} saveConfig={saveConfig} savingConfig={savingConfig} onToggleManutencao={async () => { const newVal = !config.manutencao; setConfig({ ...config, manutencao: newVal }); const res = await apiCall("PATCH", { action: "update_config", manutencao: newVal }); console.log("Toggle manutencao response:", res); if (res?.error) { showToast("ERRO: " + res.error); } else { showToast(newVal ? "Mostruario DESATIVADO (manutencao ativa)" : "Mostruario ATIVADO"); } }} />

      <div className="flex gap-6">
        <div className="w-56 shrink-0 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-[#86868B] uppercase">Categorias</span>
            <button onClick={() => setShowNewCategory(true)} className="text-[11px] font-semibold text-[#E8740E] hover:text-[#F5A623]">+ Nova</button>
          </div>

          <button
            onClick={() => setActiveCategory(null)}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${!activeCategory ? "bg-[#E8740E] text-white" : "bg-white border border-[#E8E8ED] text-[#86868B] hover:border-[#E8740E]"}`}
          >
            Todos ({produtos.length})
          </button>

          {categorias.map((cat) => {
            const count = produtos.filter((p) => p.categoria_id === cat.id).length;
            return (
              <div
                key={cat.id}
                className={`group flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${activeCategory === cat.id ? "bg-[#E8740E] text-white" : "bg-white border border-[#E8E8ED] text-[#86868B] hover:border-[#E8740E]"}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <span className="text-sm">{cat.emoji}</span>
                <span className="flex-1 truncate">{cat.nome}</span>
                <span className="text-[10px] opacity-70">({count})</span>
                <button onClick={(e) => { e.stopPropagation(); setEditingCategory(cat); }} className="opacity-0 group-hover:opacity-100 text-[10px] ml-1" title="Editar">✏️</button>
              </div>
            );
          })}
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1D1D1F]">Produtos ({filteredProducts.length})</h3>
            <button onClick={() => setShowNewProduct(true)} className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-xs font-semibold hover:bg-[#F5A623] transition-colors">+ Novo Produto</button>
          </div>

          {filteredProducts.length === 0 && <div className="text-center py-12 text-[#86868B] text-sm">Nenhum produto nesta categoria.</div>}

          {filteredProducts.map((produto) => (
            <ProductCard
              key={produto.id}
              produto={produto}
              categorias={categorias}
              expanded={expandedProduct === produto.id}
              onToggleExpand={() => setExpandedProduct(expandedProduct === produto.id ? null : produto.id)}
              onToggleField={async (field, value) => { await apiCall("PATCH", { action: "update_produto", id: produto.id, [field]: value }); await fetchData(); showToast("Salvo!"); }}
              onDelete={async () => { if (!confirm(`Deletar "${produto.nome}" e todas suas variacoes?`)) return; await apiCall("DELETE", { action: "delete_produto", id: produto.id }); await fetchData(); showToast("Produto deletado!"); }}
              onEdit={() => setEditingProduct(produto)}
              onUploadImage={(file) => uploadImage("produto_id", produto.id, file)}
              onAddVariacao={() => setShowNewVariacao(produto.id)}
              onEditVariacao={(v) => setEditingVariacao(v)}
              onDeleteVariacao={async (varId) => { if (!confirm("Deletar esta variacao?")) return; await apiCall("DELETE", { action: "delete_variacao", id: varId }); await fetchData(); showToast("Variacao deletada!"); }}
              onUploadVariacaoImage={(varId, file) => uploadImage("variacao_id", varId, file)}
            />
          ))}
        </div>
      </div>

      {showNewCategory && <NewCategoryModal onClose={() => setShowNewCategory(false)} onSave={async (data) => { await apiCall("POST", { action: "create_categoria", ...data }); setShowNewCategory(false); await fetchData(); showToast("Categoria criada!"); }} />}
      {editingCategory && <EditCategoryModal categoria={editingCategory} onClose={() => setEditingCategory(null)} onSave={async (data) => { await apiCall("PATCH", { action: "update_categoria", id: editingCategory.id, ...data }); setEditingCategory(null); await fetchData(); showToast("Categoria atualizada!"); }} onDelete={async () => { if (!confirm(`Deletar categoria "${editingCategory.nome}" e todos seus produtos?`)) return; await apiCall("DELETE", { action: "delete_categoria", id: editingCategory.id }); setEditingCategory(null); if (activeCategory === editingCategory.id) setActiveCategory(null); await fetchData(); showToast("Categoria deletada!"); }} />}
      {showNewProduct && <NewProductModal categorias={categorias} defaultCategoryId={activeCategory} onClose={() => setShowNewProduct(false)} onSave={async (data) => { await apiCall("POST", { action: "create_produto", ...data }); setShowNewProduct(false); await fetchData(); showToast("Produto criado!"); }} />}
      {editingProduct && <EditProductModal produto={editingProduct} categorias={categorias} onClose={() => setEditingProduct(null)} onSave={async (data) => { await apiCall("PATCH", { action: "update_produto", id: editingProduct.id, ...data }); setEditingProduct(null); await fetchData(); showToast("Produto atualizado!"); }} />}
      {showNewVariacao && <NewVariacaoModal produtoId={showNewVariacao} onClose={() => setShowNewVariacao(null)} onSave={async (data) => { await apiCall("POST", { action: "create_variacao", ...data }); setShowNewVariacao(null); await fetchData(); showToast("Variacao criada!"); }} />}
      {editingVariacao && <EditVariacaoModal variacao={editingVariacao} onClose={() => setEditingVariacao(null)} onSave={async (data) => { await apiCall("PATCH", { action: "update_variacao", id: editingVariacao.id, ...data }); setEditingVariacao(null); await fetchData(); showToast("Variacao atualizada!"); }} />}
    </div>
  );
}

/* ── Config Section ── */
function ConfigSection({ config, setConfig, configOpen, setConfigOpen, saveConfig, savingConfig, onToggleManutencao }: { config: MostruarioConfig; setConfig: (c: MostruarioConfig) => void; configOpen: boolean; setConfigOpen: (v: boolean) => void; saveConfig: () => void; savingConfig: boolean; onToggleManutencao: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-[#E8E8ED] overflow-hidden">
      <button onClick={() => setConfigOpen(!configOpen)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#F5F5F7] transition-colors">
        <span className="font-semibold text-sm text-[#1D1D1F]">Configuracoes Globais</span>
        <span className="text-[#86868B] text-lg">{configOpen ? "−" : "+"}</span>
      </button>
      {configOpen && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#E8E8ED]">
          <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Banner Titulo</label><input value={config.banner_titulo} onChange={(e) => setConfig({ ...config, banner_titulo: e.target.value })} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" /></div>
            <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Banner Subtitulo</label><input value={config.banner_subtitulo} onChange={(e) => setConfig({ ...config, banner_subtitulo: e.target.value })} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" /></div>
            <div>
              <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Cor Destaque</label>
              <div className="flex items-center gap-2">
                {COLOR_SWATCHES.map((color) => (<button key={color} onClick={() => setConfig({ ...config, accent_color: color })} className={`w-8 h-8 rounded-lg border-2 transition-all ${config.accent_color === color ? "border-[#1D1D1F] scale-110" : "border-transparent hover:scale-105"}`} style={{ backgroundColor: color }} />))}
                <input type="text" value={config.accent_color} onChange={(e) => setConfig({ ...config, accent_color: e.target.value })} className="w-24 px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs font-mono" />
              </div>
            </div>
            <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">WhatsApp Numero</label><input value={config.whatsapp_numero} onChange={(e) => setConfig({ ...config, whatsapp_numero: e.target.value })} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" placeholder="5521999999999" /></div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onToggleManutencao} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${config.manutencao ? "bg-[#FF3B30]/10 text-[#FF3B30]" : "bg-[#F5F5F7] text-[#86868B]"}`}>
              <span>{config.manutencao ? "🔧" : "✅"}</span> Modo Manutencao: {config.manutencao ? "ATIVO" : "Desativado"}
            </button>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-2">Tema do Mostruario</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TEMA_KEYS.map((key) => { const t = TEMAS[key]; const isActive = getTemaKey(config.tema) === key; return (
                <button key={key} onClick={() => setConfig({ ...config, tema: key })} className={`relative p-3 rounded-xl border-2 text-left transition-all ${isActive ? "border-[#E8740E] shadow-md" : "border-[#E8E8ED] hover:border-[#D2D2D7]"}`}>
                  {isActive && <span className="absolute top-2 right-2 text-[10px] font-bold text-[#E8740E] uppercase">Ativo</span>}
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">{t.preview}</span><span className="text-xs font-bold text-[#1D1D1F]">{t.nome}</span></div>
                  <p className="text-[10px] text-[#86868B] leading-snug mb-2">{t.descricao}</p>
                  <div className="flex gap-1 h-4 rounded overflow-hidden">
                    <div className="flex-1 rounded-sm" style={{ backgroundColor: t.heroBg }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.accent }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.bg }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.btnComprar }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}` }} />
                  </div>
                </button>
              ); })}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-2">Tema do Trade-In (Diurno — 5h ate 19h)</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TEMA_TRADEIN_KEYS.map((key) => { const t = TEMAS_TRADEIN[key]; const isActive = config.tema_tradein === key; return (
                <button key={key} onClick={() => setConfig({ ...config, tema_tradein: key })} className={`relative p-3 rounded-xl border-2 text-left transition-all ${isActive ? "border-[#E8740E] shadow-md" : "border-[#E8E8ED] hover:border-[#D2D2D7]"}`}>
                  {isActive && <span className="absolute top-2 right-2 text-[10px] font-bold text-[#E8740E] uppercase">Ativo</span>}
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">{t.preview}</span><span className="text-xs font-bold text-[#1D1D1F]">{t.nome}</span></div>
                  <p className="text-[10px] text-[#86868B] leading-snug mb-2">{t.descricao}</p>
                  <div className="flex gap-1 h-4 rounded overflow-hidden">
                    <div className="flex-1 rounded-sm" style={{ backgroundColor: t.pageBg, border: `1px solid ${t.cardBorder}` }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.accent }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}` }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.ctaBg }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.success }} />
                  </div>
                </button>
              ); })}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-2">Tema do Trade-In (Noturno — 19h ate 5h) 🌙</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TEMA_TRADEIN_KEYS.map((key) => { const t = TEMAS_TRADEIN[key]; const isActive = config.tema_tradein_noite === key; return (
                <button key={key} onClick={() => setConfig({ ...config, tema_tradein_noite: key })} className={`relative p-3 rounded-xl border-2 text-left transition-all ${isActive ? "border-[#7C5CFC] shadow-md" : "border-[#E8E8ED] hover:border-[#D2D2D7]"}`}>
                  {isActive && <span className="absolute top-2 right-2 text-[10px] font-bold text-[#7C5CFC] uppercase">Ativo</span>}
                  <div className="flex items-center gap-2 mb-2"><span className="text-lg">{t.preview}</span><span className="text-xs font-bold text-[#1D1D1F]">{t.nome}</span></div>
                  <p className="text-[10px] text-[#86868B] leading-snug mb-2">{t.descricao}</p>
                  <div className="flex gap-1 h-4 rounded overflow-hidden">
                    <div className="flex-1 rounded-sm" style={{ backgroundColor: t.pageBg, border: `1px solid ${t.cardBorder}` }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.accent }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}` }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.ctaBg }} /><div className="flex-1 rounded-sm" style={{ backgroundColor: t.success }} />
                  </div>
                </button>
              ); })}
            </div>
          </div>
          <div className="flex justify-end"><button onClick={saveConfig} disabled={savingConfig} className="px-5 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50">{savingConfig ? "Salvando..." : "Salvar Config"}</button></div>
        </div>
      )}
    </div>
  );
}

/* ── Product Card ── */
function ProductCard({ produto, categorias, expanded, onToggleExpand, onToggleField, onDelete, onEdit, onUploadImage, onAddVariacao, onEditVariacao, onDeleteVariacao, onUploadVariacaoImage }: { produto: Produto; categorias: Categoria[]; expanded: boolean; onToggleExpand: () => void; onToggleField: (field: string, value: unknown) => void; onDelete: () => void; onEdit: () => void; onUploadImage: (file: File) => void; onAddVariacao: () => void; onEditVariacao: (v: Variacao) => void; onDeleteVariacao: (id: string) => void; onUploadVariacaoImage: (varId: string, file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cat = categorias.find((c) => c.id === produto.categoria_id);
  const minPreco = produto.variacoes.length > 0 ? Math.min(...produto.variacoes.map((v) => Number(v.preco)).filter((p) => p > 0)) : 0;

  return (
    <div className="bg-white rounded-2xl border border-[#E8E8ED] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[#F5F5F7] transition-colors" onClick={onToggleExpand}>
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#F5F5F7] flex items-center justify-center shrink-0">
          {produto.imagem_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={produto.imagem_url} alt="" className="w-full h-full object-cover" />
          ) : <span className="text-xl">{cat?.emoji || "📦"}</span>}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-[#1D1D1F] truncate">{produto.nome}</h3>
          <p className="text-[11px] text-[#86868B]">{cat?.emoji} {cat?.nome || "Sem categoria"} &middot; {produto.variacoes.length} variacoes{minPreco > 0 && <> &middot; a partir de {formatBRL(minPreco)}</>}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {produto.destaque && <span className="px-2 py-0.5 rounded-full bg-[#FF9500]/10 text-[#FF9500] text-[10px] font-semibold">Destaque</span>}
          {!produto.visivel && <span className="px-2 py-0.5 rounded-full bg-[#FF3B30]/10 text-[#FF3B30] text-[10px] font-semibold">Oculto</span>}
          <span className="text-[#86868B]">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#E8E8ED]">
          <div className="pt-4 flex gap-4">
            <div className="w-32 h-32 rounded-xl overflow-hidden bg-[#F5F5F7] flex items-center justify-center cursor-pointer group relative shrink-0" onClick={() => fileRef.current?.click()}>
              {produto.imagem_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={produto.imagem_url} alt="" className="w-full h-full object-cover" />
              ) : <span className="text-4xl">{cat?.emoji || "📦"}</span>}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center"><span className="text-white text-xs font-medium opacity-0 group-hover:opacity-100">{produto.imagem_url ? "Trocar" : "Adicionar"}</span></div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); e.target.value = ""; }} className="hidden" />
            </div>
            <div className="flex-1 space-y-2">
              {produto.descricao && <p className="text-xs text-[#86868B]">{produto.descricao}</p>}
              {produto.tags && produto.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">{produto.tags.map((tag) => <span key={tag} className="px-2 py-0.5 rounded-full bg-[#F5F5F7] text-[10px] font-medium text-[#86868B]">{tag}</span>)}</div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => onToggleField("visivel", !produto.visivel)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${produto.visivel ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#F5F5F7] text-[#AEAEB2]"}`}>{produto.visivel ? "👁️ Visivel" : "👁️‍🗨️ Oculto"}</button>
                <button onClick={() => onToggleField("destaque", !produto.destaque)} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${produto.destaque ? "bg-[#FF9500]/10 text-[#FF9500]" : "bg-[#F5F5F7] text-[#AEAEB2]"}`}>{produto.destaque ? "⭐ Destaque" : "☆ Destaque"}</button>
                <button onClick={onEdit} className="px-2 py-1 rounded-lg text-[11px] font-medium bg-[#F5F5F7] text-[#86868B] hover:text-[#1D1D1F]">✏️ Editar</button>
                <button onClick={onDelete} className="px-2 py-1 rounded-lg text-[11px] font-medium bg-[#F5F5F7] text-[#FF3B30] hover:bg-[#FF3B30]/10">🗑️ Deletar</button>
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#1D1D1F]">Variacoes ({produto.variacoes.length})</span>
              <button onClick={onAddVariacao} className="text-[11px] font-semibold text-[#E8740E] hover:text-[#F5A623]">+ Adicionar Variacao</button>
            </div>
            {produto.variacoes.length === 0 && <p className="text-xs text-[#AEAEB2] py-2">Nenhuma variacao cadastrada.</p>}
            <div className="space-y-1">{produto.variacoes.map((v) => <VariacaoRow key={v.id} variacao={v} onEdit={() => onEditVariacao(v)} onDelete={() => onDeleteVariacao(v.id)} onUploadImage={(file) => onUploadVariacaoImage(v.id, file)} />)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Variacao Row ── */
function VariacaoRow({ variacao, onEdit, onDelete, onUploadImage }: { variacao: Variacao; onEdit: () => void; onDelete: () => void; onUploadImage: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const parcela12 = Number(variacao.preco) > 0 ? Math.round((Number(variacao.preco) * 1.13) / 12) : 0;
  return (
    <div className="group flex items-center gap-3 px-3 py-2 rounded-xl bg-[#F9F9FB] hover:bg-[#F5F5F7] transition-colors">
      <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#E8E8ED] flex items-center justify-center cursor-pointer shrink-0" onClick={() => fileRef.current?.click()} title="Upload imagem">
        {variacao.imagem_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={variacao.imagem_url} alt="" className="w-full h-full object-cover" />
        ) : <span className="text-[10px] text-[#AEAEB2]">📷</span>}
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadImage(f); e.target.value = ""; }} className="hidden" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-[#1D1D1F]">{variacao.nome}</span>
        {Object.keys(variacao.atributos || {}).length > 0 && <span className="text-[10px] text-[#86868B] ml-2">{Object.entries(variacao.atributos).map(([k, v]) => `${k}: ${v}`).join(", ")}</span>}
      </div>
      <div className="text-right shrink-0">
        <span className="text-xs font-bold text-[#1D1D1F]">{formatBRL(Number(variacao.preco))}</span>
        {parcela12 > 0 && <span className="text-[10px] text-[#86868B] ml-1">12x {formatBRL(parcela12)}</span>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={onEdit} className="text-[11px] text-[#86868B] hover:text-[#1D1D1F]" title="Editar">✏️</button>
        <button onClick={onDelete} className="text-[11px] text-[#FF3B30]" title="Deletar">🗑️</button>
      </div>
    </div>
  );
}

/* ── Modal ── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E8ED]"><h3 className="text-sm font-bold text-[#1D1D1F]">{title}</h3><button onClick={onClose} className="text-[#86868B] hover:text-[#1D1D1F] text-lg">×</button></div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Emoji Picker Grid ── */
const EMOJI_GRID = [
  "📱", "💻", "🖥️", "⌨️", "🖨️", "⌚", "🎧", "🎵",
  "📦", "🔌", "🔋", "💾", "📷", "📹", "🎮", "🕹️",
  "📺", "💡", "🔧", "🎬", "🛒", "💎", "🎁", "🏷️",
  "⭐", "🔥", "❤️", "💰", "🎯", "🏆", "👑", "🌟",
];

function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Emoji</label>
      <div className="grid grid-cols-8 gap-1.5">
        {EMOJI_GRID.map((e) => (
          <button key={e} onClick={() => onChange(e)} type="button"
            className={`w-9 h-9 flex items-center justify-center text-lg rounded-lg transition-all ${value === e ? "bg-[#E8740E]/15 ring-2 ring-[#E8740E] scale-110" : "bg-[#F5F5F7] hover:bg-[#E8E8ED]"}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-[#86868B]">Ou digite:</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-14 px-2 py-1 border border-[#D2D2D7] rounded-lg text-sm text-center" />
      </div>
    </div>
  );
}

/* ── New Category Modal ── */
function NewCategoryModal({ onClose, onSave }: { onClose: () => void; onSave: (data: { nome: string; emoji: string }) => void }) {
  const [nome, setNome] = useState("");
  const [emoji, setEmoji] = useState("📦");
  return (
    <Modal title="Nova Categoria" onClose={onClose}>
      <div className="space-y-4">
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" placeholder="Ex: iPhone" autoFocus /></div>
        <EmojiPicker value={emoji} onChange={setEmoji} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[#86868B]">Cancelar</button>
          <button onClick={() => nome.trim() && onSave({ nome: nome.trim(), emoji })} disabled={!nome.trim()} className="px-5 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold disabled:opacity-50">Criar</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Edit Category Modal ── */
function EditCategoryModal({ categoria, onClose, onSave, onDelete }: { categoria: Categoria; onClose: () => void; onSave: (data: { nome: string; emoji: string; visivel: boolean }) => void; onDelete: () => void }) {
  const [nome, setNome] = useState(categoria.nome);
  const [emoji, setEmoji] = useState(categoria.emoji);
  const [visivel, setVisivel] = useState(categoria.visivel);
  return (
    <Modal title="Editar Categoria" onClose={onClose}>
      <div className="space-y-4">
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" /></div>
        <EmojiPicker value={emoji} onChange={setEmoji} />
        <div><button onClick={() => setVisivel(!visivel)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${visivel ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#F5F5F7] text-[#AEAEB2]"}`}>{visivel ? "👁️ Visivel" : "👁️‍🗨️ Oculta"}</button></div>
        <div className="flex items-center justify-between">
          <button onClick={onDelete} className="text-xs text-[#FF3B30] font-medium hover:underline">Deletar Categoria</button>
          <div className="flex gap-2"><button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[#86868B]">Cancelar</button><button onClick={() => onSave({ nome, emoji, visivel })} className="px-5 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold">Salvar</button></div>
        </div>
      </div>
    </Modal>
  );
}

/* ── New Product Modal ── */
function NewProductModal({ categorias, defaultCategoryId, onClose, onSave }: { categorias: Categoria[]; defaultCategoryId: string | null; onClose: () => void; onSave: (data: { nome: string; categoria_id: string; descricao?: string; descricao_curta?: string; tags?: string[] }) => void }) {
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState(defaultCategoryId || categorias[0]?.id || "");
  const [descricao, setDescricao] = useState("");
  const [descricaoCurta, setDescricaoCurta] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>(["Novo", "Lacrado", "1 ano garantia", "Nota Fiscal"]);
  const [customTag, setCustomTag] = useState("");
  const toggleTag = (tag: string) => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  const addCustomTag = () => { if (customTag.trim() && !selectedTags.includes(customTag.trim())) { setSelectedTags((prev) => [...prev, customTag.trim()]); setCustomTag(""); } };

  return (
    <Modal title="Novo Produto" onClose={onClose}>
      <div className="space-y-4">
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Nome do Produto</label><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" placeholder="Ex: iPhone 16 Pro" autoFocus /></div>
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Categoria</label><select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm bg-white">{categorias.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}</select></div>
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Descricao</label><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm resize-none" rows={3} placeholder="Descricao detalhada..." /></div>
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Descricao Curta</label><input value={descricaoCurta} onChange={(e) => setDescricaoCurta(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" placeholder="Resumo para card..." /></div>
        <div>
          <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Tags</label>
          <div className="flex flex-wrap gap-2 mb-2">{DEFAULT_TAGS.map((tag) => <button key={tag} onClick={() => toggleTag(tag)} className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${selectedTags.includes(tag) ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED]"}`}>{tag}</button>)}</div>
          <div className="flex flex-wrap gap-2 mb-2">{selectedTags.filter((t) => !DEFAULT_TAGS.includes(t)).map((tag) => <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#E8740E] text-white text-[11px] font-medium">{tag}<button onClick={() => toggleTag(tag)} className="ml-1 opacity-70 hover:opacity-100">×</button></span>)}</div>
          <div className="flex gap-2"><input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustomTag()} className="flex-1 px-3 py-1.5 border border-[#D2D2D7] rounded-lg text-xs" placeholder="Tag personalizada..." /><button onClick={addCustomTag} className="px-3 py-1.5 rounded-lg bg-[#F5F5F7] text-xs font-medium text-[#86868B]">Adicionar</button></div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[#86868B]">Cancelar</button>
          <button onClick={() => nome.trim() && categoriaId && onSave({ nome: nome.trim(), categoria_id: categoriaId, descricao: descricao || undefined, descricao_curta: descricaoCurta || undefined, tags: selectedTags.length > 0 ? selectedTags : undefined })} disabled={!nome.trim() || !categoriaId} className="px-5 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold disabled:opacity-50">Criar Produto</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Edit Product Modal ── */
function EditProductModal({ produto, categorias, onClose, onSave }: { produto: Produto; categorias: Categoria[]; onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [nome, setNome] = useState(produto.nome);
  const [categoriaId, setCategoriaId] = useState(produto.categoria_id);
  const [descricao, setDescricao] = useState(produto.descricao || "");
  const [descricaoCurta, setDescricaoCurta] = useState(produto.descricao_curta || "");
  const [selectedTags, setSelectedTags] = useState<string[]>(produto.tags || []);
  const [customTag, setCustomTag] = useState("");
  const toggleTag = (tag: string) => setSelectedTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  const addCustomTag = () => { if (customTag.trim() && !selectedTags.includes(customTag.trim())) { setSelectedTags((prev) => [...prev, customTag.trim()]); setCustomTag(""); } };

  return (
    <Modal title="Editar Produto" onClose={onClose}>
      <div className="space-y-4">
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" /></div>
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Categoria</label><select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm bg-white">{categorias.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}</select></div>
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Descricao</label><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm resize-none" rows={3} /></div>
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Descricao Curta</label><input value={descricaoCurta} onChange={(e) => setDescricaoCurta(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" /></div>
        <div>
          <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Tags</label>
          <div className="flex flex-wrap gap-2 mb-2">{DEFAULT_TAGS.map((tag) => <button key={tag} onClick={() => toggleTag(tag)} className={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors ${selectedTags.includes(tag) ? "bg-[#E8740E] text-white" : "bg-[#F5F5F7] text-[#86868B] hover:bg-[#E8E8ED]"}`}>{tag}</button>)}</div>
          <div className="flex flex-wrap gap-2 mb-2">{selectedTags.filter((t) => !DEFAULT_TAGS.includes(t)).map((tag) => <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#E8740E] text-white text-[11px] font-medium">{tag}<button onClick={() => toggleTag(tag)} className="ml-1 opacity-70 hover:opacity-100">×</button></span>)}</div>
          <div className="flex gap-2"><input value={customTag} onChange={(e) => setCustomTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustomTag()} className="flex-1 px-3 py-1.5 border border-[#D2D2D7] rounded-lg text-xs" placeholder="Tag personalizada..." /><button onClick={addCustomTag} className="px-3 py-1.5 rounded-lg bg-[#F5F5F7] text-xs font-medium text-[#86868B]">Adicionar</button></div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[#86868B]">Cancelar</button>
          <button onClick={() => onSave({ nome, categoria_id: categoriaId, descricao: descricao || null, descricao_curta: descricaoCurta || null, tags: selectedTags })} className="px-5 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold">Salvar</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── New Variacao Modal ── */
function NewVariacaoModal({ produtoId, onClose, onSave }: { produtoId: string; onClose: () => void; onSave: (data: { produto_id: string; nome: string; atributos: Record<string, string>; preco: number }) => void }) {
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [attrPairs, setAttrPairs] = useState<{ key: string; value: string }[]>([{ key: "storage", value: "" }, { key: "cor", value: "" }]);
  const updateAttr = (i: number, field: "key" | "value", val: string) => setAttrPairs((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const addAttr = () => setAttrPairs((prev) => [...prev, { key: "", value: "" }]);
  const removeAttr = (i: number) => setAttrPairs((prev) => prev.filter((_, idx) => idx !== i));
  const buildAtributos = () => { const obj: Record<string, string> = {}; for (const { key, value } of attrPairs) { if (key.trim() && value.trim()) obj[key.trim()] = value.trim(); } return obj; };
  const autoNome = attrPairs.filter((p) => p.value.trim()).map((p) => p.value.trim()).join(" ");

  return (
    <Modal title="Nova Variacao" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Atributos</label>
          {attrPairs.map((pair, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={pair.key} onChange={(e) => updateAttr(i, "key", e.target.value)} className="w-28 px-3 py-1.5 border border-[#D2D2D7] rounded-lg text-xs" placeholder="Campo (storage, cor...)" />
              <input value={pair.value} onChange={(e) => updateAttr(i, "value", e.target.value)} className="flex-1 px-3 py-1.5 border border-[#D2D2D7] rounded-lg text-xs" placeholder="Valor (256GB, Titanio Natural...)" />
              {attrPairs.length > 1 && <button onClick={() => removeAttr(i)} className="text-[#FF3B30] text-xs">×</button>}
            </div>
          ))}
          <button onClick={addAttr} className="text-[11px] text-[#E8740E] font-medium">+ Adicionar campo</button>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Nome da Variacao</label>
          <input value={nome || autoNome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" placeholder="Ex: 256GB Titanio Natural" />
          {autoNome && !nome && <p className="text-[10px] text-[#86868B] mt-0.5">Gerado automaticamente dos atributos</p>}
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Preco PIX (R$)</label>
          <input type="number" value={preco} onChange={(e) => setPreco(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" placeholder="8197" />
          {Number(preco) > 0 && <p className="text-[10px] text-[#86868B] mt-0.5">12x de {formatBRL(Math.round((Number(preco) * 1.13) / 12))} (total: {formatBRL(Math.round(Number(preco) * 1.13))})</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[#86868B]">Cancelar</button>
          <button onClick={() => { const finalNome = nome.trim() || autoNome; if (!finalNome) return; onSave({ produto_id: produtoId, nome: finalNome, atributos: buildAtributos(), preco: Number(preco) || 0 }); }} disabled={!(nome.trim() || autoNome)} className="px-5 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold disabled:opacity-50">Criar Variacao</button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Edit Variacao Modal ── */
function EditVariacaoModal({ variacao, onClose, onSave }: { variacao: Variacao; onClose: () => void; onSave: (data: Record<string, unknown>) => void }) {
  const [nome, setNome] = useState(variacao.nome);
  const [preco, setPreco] = useState(String(variacao.preco));
  const [attrPairs, setAttrPairs] = useState<{ key: string; value: string }[]>(() => { const entries = Object.entries(variacao.atributos || {}); return entries.length > 0 ? entries.map(([key, value]) => ({ key, value })) : [{ key: "", value: "" }]; });
  const [visivel, setVisivel] = useState(variacao.visivel);
  const updateAttr = (i: number, field: "key" | "value", val: string) => setAttrPairs((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p));
  const addAttr = () => setAttrPairs((prev) => [...prev, { key: "", value: "" }]);
  const removeAttr = (i: number) => setAttrPairs((prev) => prev.filter((_, idx) => idx !== i));
  const buildAtributos = () => { const obj: Record<string, string> = {}; for (const { key, value } of attrPairs) { if (key.trim() && value.trim()) obj[key.trim()] = value.trim(); } return obj; };

  return (
    <Modal title="Editar Variacao" onClose={onClose}>
      <div className="space-y-4">
        <div><label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" /></div>
        <div>
          <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Atributos</label>
          {attrPairs.map((pair, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={pair.key} onChange={(e) => updateAttr(i, "key", e.target.value)} className="w-28 px-3 py-1.5 border border-[#D2D2D7] rounded-lg text-xs" placeholder="Campo" />
              <input value={pair.value} onChange={(e) => updateAttr(i, "value", e.target.value)} className="flex-1 px-3 py-1.5 border border-[#D2D2D7] rounded-lg text-xs" placeholder="Valor" />
              {attrPairs.length > 1 && <button onClick={() => removeAttr(i)} className="text-[#FF3B30] text-xs">×</button>}
            </div>
          ))}
          <button onClick={addAttr} className="text-[11px] text-[#E8740E] font-medium">+ Adicionar campo</button>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">Preco PIX (R$)</label>
          <input type="number" value={preco} onChange={(e) => setPreco(e.target.value)} className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm" />
          {Number(preco) > 0 && <p className="text-[10px] text-[#86868B] mt-0.5">12x de {formatBRL(Math.round((Number(preco) * 1.13) / 12))}</p>}
        </div>
        <div><button onClick={() => setVisivel(!visivel)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${visivel ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#F5F5F7] text-[#AEAEB2]"}`}>{visivel ? "👁️ Visivel" : "👁️‍🗨️ Oculta"}</button></div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-[#86868B]">Cancelar</button>
          <button onClick={() => onSave({ nome, atributos: buildAtributos(), preco: Number(preco) || 0, visivel })} className="px-5 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold">Salvar</button>
        </div>
      </div>
    </Modal>
  );
}
