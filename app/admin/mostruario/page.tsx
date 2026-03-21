"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAdmin } from "@/components/admin/AdminShell";
import { TEMAS, TEMA_KEYS, getTemaKey } from "@/lib/temas";
import type { TemaKey } from "@/lib/temas";

/* ── Types ── */

interface ProdutoMostruario {
  id: string;
  modelo: string;
  armazenamento: string;
  preco_pix: number;
  status: string;
  categoria: string;
  image_url: string | null;
  descricao: string | null;
  ordem: number | null;
  visivel: boolean | null;
  destaque: boolean | null;
}

interface MostruarioConfig {
  banner_titulo: string;
  banner_subtitulo: string;
  banner_image_url: string | null;
  accent_color: string;
  whatsapp_numero: string;
  tema: string;
}

/* ── Category config ── */

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  IPHONE: { label: "iPhone", emoji: "📱" },
  MACBOOK: { label: "MacBook", emoji: "💻" },
  IPAD: { label: "iPad", emoji: "📲" },
  APPLE_WATCH: { label: "Apple Watch", emoji: "⌚" },
  AIRPODS: { label: "AirPods", emoji: "🎧" },
  ACESSORIOS: { label: "Acessorios", emoji: "🔌" },
  MAC_MINI: { label: "Mac Mini", emoji: "🖥️" },
  IMAC: { label: "iMac", emoji: "🖥️" },
};

const COLOR_SWATCHES = ["#E8740E", "#34C759", "#007AFF", "#FF3B30", "#5856D6"];

/* ── Helpers ── */

function formatBRL(value: number): string {
  if (!value) return "R$ 0";
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function getCategoryEmoji(categoria: string): string {
  return CATEGORY_META[categoria]?.emoji || "📦";
}

/* ══════════════════════════════════════════════ */
/* ── Main Page Component                     ── */
/* ══════════════════════════════════════════════ */

export default function MostruarioPage() {
  const { password } = useAdmin();
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState<ProdutoMostruario[]>([]);
  const [config, setConfig] = useState<MostruarioConfig>({
    banner_titulo: "Produtos Apple Originais",
    banner_subtitulo: "Nota fiscal no seu nome | Lacrados | 1 ano garantia Apple",
    banner_image_url: null,
    accent_color: "#E8740E",
    whatsapp_numero: "5521999999999",
    tema: "tigrao",
  });
  const [activeTab, setActiveTab] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Drag state
  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  // Saving indicators per product
  const [savingField, setSavingField] = useState<string | null>(null);

  /* ── Toast helper ── */
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  /* ── Fetch data ── */
  const fetchData = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mostruario", {
        headers: { "x-admin-password": password },
      });
      if (res.ok) {
        const json = await res.json();
        setProdutos(json.produtos ?? []);
        if (json.config) setConfig(json.config);
        // Set first tab
        const cats = [...new Set((json.produtos ?? []).map((p: ProdutoMostruario) => p.categoria))];
        if (cats.length > 0 && !activeTab) setActiveTab(cats[0] as string);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [password, activeTab]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password]);

  /* ── Save single field ── */
  const saveField = useCallback(
    async (id: string, field: string, value: unknown) => {
      setSavingField(`${id}-${field}`);
      try {
        await fetch("/api/admin/mostruario", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-admin-password": password },
          body: JSON.stringify({ id, field, value }),
        });
        showToast("Salvo!");
      } catch {
        showToast("Erro ao salvar");
      }
      setSavingField(null);
    },
    [password, showToast]
  );

  /* ── Save config ── */
  const saveConfig = useCallback(async () => {
    setSavingConfig(true);
    try {
      await fetch("/api/admin/mostruario", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(config),
      });
      showToast("Config salva!");
    } catch {
      showToast("Erro ao salvar config");
    }
    setSavingConfig(false);
  }, [password, config, showToast]);

  /* ── Upload image ── */
  const uploadImage = useCallback(
    async (id: string, file: File) => {
      setSavingField(`${id}-image`);
      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("id", id);
        const res = await fetch("/api/admin/mostruario/upload", {
          method: "POST",
          headers: { "x-admin-password": password },
          body: formData,
        });
        const json = await res.json();
        if (json.ok) {
          setProdutos((prev) =>
            prev.map((p) => (p.id === id ? { ...p, image_url: json.url } : p))
          );
          showToast("Imagem salva!");
        } else {
          showToast(json.error || "Erro no upload");
        }
      } catch {
        showToast("Erro no upload");
      }
      setSavingField(null);
    },
    [password, showToast]
  );

  /* ── Toggle ── */
  const handleToggle = useCallback(
    (id: string, field: "visivel" | "destaque", currentValue: boolean | null) => {
      const newValue = !(currentValue ?? (field === "visivel"));
      setProdutos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: newValue } : p))
      );
      saveField(id, field, newValue);
    },
    [saveField]
  );

  /* ── Drag & Drop reorder ── */
  const handleDragEnd = useCallback(() => {
    if (!dragItem.current || !dragOverItem.current || dragItem.current === dragOverItem.current) {
      setDragId(null);
      return;
    }

    const filtered = produtos
      .filter((p) => p.categoria === activeTab)
      .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));

    const ids = filtered.map((p) => p.id);
    const fromIdx = ids.indexOf(dragItem.current);
    const toIdx = ids.indexOf(dragOverItem.current);
    if (fromIdx === -1 || toIdx === -1) {
      setDragId(null);
      return;
    }

    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragItem.current);

    // Update local state with new order
    const reorder = ids.map((id, i) => ({ id, ordem: i }));
    const ordemMap = new Map(reorder.map((r) => [r.id, r.ordem]));
    setProdutos((prev) =>
      prev.map((p) => (ordemMap.has(p.id) ? { ...p, ordem: ordemMap.get(p.id)! } : p))
    );

    // Save to API
    fetch("/api/admin/mostruario", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ reorder }),
    }).then(() => showToast("Ordem salva!"));

    setDragId(null);
    dragItem.current = null;
    dragOverItem.current = null;
  }, [produtos, activeTab, password, showToast]);

  /* ── Categories with products ── */
  const categories = [...new Set(produtos.map((p) => p.categoria))].sort();

  /* ── Filtered products for active tab ── */
  const filtered = produtos
    .filter((p) => p.categoria === activeTab)
    .sort((a, b) => (a.ordem ?? 999) - (b.ordem ?? 999));

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-[#86868B]">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl bg-[#1D1D1F] text-white text-sm font-medium shadow-lg animate-fadeIn">
          {toast}
        </div>
      )}

      {/* ── Header ── */}
      <div>
        <h2 className="text-lg font-bold text-[#1D1D1F]">Mostruario</h2>
        <p className="text-[#86868B] text-xs">Gerencie imagens, descricoes e destaques dos produtos na loja.</p>
      </div>

      {/* ── Global Config (collapsible) ── */}
      <div className="bg-white rounded-2xl border border-[#E8E8ED] overflow-hidden">
        <button
          onClick={() => setConfigOpen(!configOpen)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[#F5F5F7] transition-colors"
        >
          <span className="font-semibold text-sm text-[#1D1D1F]">
            Configuracoes Globais
          </span>
          <span className="text-[#86868B] text-lg">{configOpen ? "−" : "+"}</span>
        </button>

        {configOpen && (
          <div className="px-4 pb-4 space-y-4 border-t border-[#E8E8ED]">
            <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Banner titulo */}
              <div>
                <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">
                  Banner Titulo
                </label>
                <input
                  value={config.banner_titulo}
                  onChange={(e) => setConfig({ ...config, banner_titulo: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>

              {/* Banner subtitulo */}
              <div>
                <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">
                  Banner Subtitulo
                </label>
                <input
                  value={config.banner_subtitulo}
                  onChange={(e) => setConfig({ ...config, banner_subtitulo: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                />
              </div>

              {/* Accent color */}
              <div>
                <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">
                  Cor Destaque
                </label>
                <div className="flex items-center gap-2">
                  {COLOR_SWATCHES.map((color) => (
                    <button
                      key={color}
                      onClick={() => setConfig({ ...config, accent_color: color })}
                      className={`w-8 h-8 rounded-lg border-2 transition-all ${
                        config.accent_color === color
                          ? "border-[#1D1D1F] scale-110"
                          : "border-transparent hover:scale-105"
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                  <input
                    type="text"
                    value={config.accent_color}
                    onChange={(e) => setConfig({ ...config, accent_color: e.target.value })}
                    className="w-24 px-2 py-1.5 border border-[#D2D2D7] rounded-lg text-xs font-mono"
                    placeholder="#E8740E"
                  />
                </div>
              </div>

              {/* WhatsApp numero */}
              <div>
                <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-1">
                  WhatsApp Numero
                </label>
                <input
                  value={config.whatsapp_numero}
                  onChange={(e) => setConfig({ ...config, whatsapp_numero: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D2D2D7] rounded-lg text-sm"
                  placeholder="5521999999999"
                />
              </div>
            </div>

            {/* ── Theme selector ── */}
            <div>
              <label className="block text-[10px] font-bold text-[#86868B] uppercase mb-2">
                Tema do Mostruario
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TEMA_KEYS.map((key) => {
                  const t = TEMAS[key];
                  const isActive = getTemaKey(config.tema) === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setConfig({ ...config, tema: key });
                      }}
                      className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                        isActive
                          ? "border-[#E8740E] shadow-md"
                          : "border-[#E8E8ED] hover:border-[#D2D2D7]"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute top-2 right-2 text-[10px] font-bold text-[#E8740E] uppercase">
                          Ativo
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{t.preview}</span>
                        <span className="text-xs font-bold text-[#1D1D1F]">{t.nome}</span>
                      </div>
                      <p className="text-[10px] text-[#86868B] leading-snug mb-2">{t.descricao}</p>
                      {/* Mini color bar preview */}
                      <div className="flex gap-1 h-4 rounded overflow-hidden">
                        <div className="flex-1 rounded-sm" style={{ backgroundColor: t.heroBg }} />
                        <div className="flex-1 rounded-sm" style={{ backgroundColor: t.accent }} />
                        <div className="flex-1 rounded-sm" style={{ backgroundColor: t.bg }} />
                        <div className="flex-1 rounded-sm" style={{ backgroundColor: t.btnComprar }} />
                        <div className="flex-1 rounded-sm" style={{ backgroundColor: t.cardBg, border: `1px solid ${t.cardBorder}` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={saveConfig}
                disabled={savingConfig}
                className="px-5 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
              >
                {savingConfig ? "Salvando..." : "Salvar Config"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Category Tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat] || { label: cat, emoji: "📦" };
          const count = produtos.filter((p) => p.categoria === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === cat
                  ? "bg-[#E8740E] text-white"
                  : "bg-white border border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E]"
              }`}
            >
              {meta.emoji} {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Product Grid ── */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-[#86868B] text-sm">
          Nenhum produto nesta categoria.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((produto) => (
          <ProductCard
            key={produto.id}
            produto={produto}
            onToggle={handleToggle}
            onUploadImage={uploadImage}
            onSaveField={saveField}
            savingField={savingField}
            dragId={dragId}
            onDragStart={(id) => {
              dragItem.current = id;
              setDragId(id);
            }}
            onDragOver={(id) => {
              dragOverItem.current = id;
            }}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
/* ── Product Card                             ── */
/* ══════════════════════════════════════════════ */

interface ProductCardProps {
  produto: ProdutoMostruario;
  onToggle: (id: string, field: "visivel" | "destaque", current: boolean | null) => void;
  onUploadImage: (id: string, file: File) => void;
  onSaveField: (id: string, field: string, value: unknown) => void;
  savingField: string | null;
  dragId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDragEnd: () => void;
}

function ProductCard({
  produto,
  onToggle,
  onUploadImage,
  onSaveField,
  savingField,
  dragId,
  onDragStart,
  onDragOver,
  onDragEnd,
}: ProductCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [descricao, setDescricao] = useState(produto.descricao ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when produto changes
  useEffect(() => {
    setDescricao(produto.descricao ?? "");
  }, [produto.descricao]);

  const handleDescBlur = () => {
    if (descricao !== (produto.descricao ?? "")) {
      onSaveField(produto.id, "descricao", descricao);
    }
  };

  const handleDescChange = (value: string) => {
    setDescricao(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSaveField(produto.id, "descricao", value);
    }, 1500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadImage(produto.id, file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const isVisible = produto.visivel !== false;
  const isDestaque = produto.destaque === true;
  const isSavingImage = savingField === `${produto.id}-image`;
  const isDragging = dragId === produto.id;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(produto.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(produto.id);
      }}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-2xl border overflow-hidden transition-all ${
        isDragging ? "opacity-50 border-[#E8740E]" : "border-[#E8E8ED] hover:shadow-md"
      }`}
    >
      {/* Image area */}
      <div
        className="relative w-full aspect-square bg-gradient-to-br from-[#F5F5F7] to-[#E8E8ED] flex items-center justify-center cursor-pointer group"
        onClick={() => fileRef.current?.click()}
      >
        {produto.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={produto.image_url}
            alt={produto.modelo}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-[64px] opacity-60">{getCategoryEmoji(produto.categoria)}</span>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity">
            {isSavingImage ? "Enviando..." : produto.image_url ? "Trocar imagem" : "Adicionar imagem"}
          </span>
        </div>

        {isSavingImage && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Drag handle */}
        <div
          className="absolute top-2 left-2 p-1.5 rounded-lg bg-white/80 backdrop-blur cursor-grab active:cursor-grabbing text-[#86868B] hover:text-[#1D1D1F] transition-colors"
          title="Arrastar para reordenar"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        {/* Name (read-only) */}
        <h3 className="text-sm font-bold text-[#1D1D1F] leading-tight">
          {produto.modelo}
        </h3>

        {/* Storage + Price */}
        <p className="text-[11px] text-[#86868B]">
          {produto.armazenamento} &middot; {formatBRL(produto.preco_pix)}
        </p>

        {/* Description textarea */}
        <div className="relative">
          <textarea
            value={descricao}
            onChange={(e) => handleDescChange(e.target.value)}
            onBlur={handleDescBlur}
            placeholder="Descricao do produto..."
            rows={2}
            className="w-full px-2 py-1.5 border border-[#E8E8ED] rounded-lg text-xs text-[#1D1D1F] placeholder:text-[#AEAEB2] resize-none focus:border-[#E8740E] focus:outline-none transition-colors"
          />
          {savingField === `${produto.id}-descricao` && (
            <span className="absolute top-1 right-2 text-[9px] text-[#E8740E] font-medium">
              Salvando...
            </span>
          )}
        </div>

        {/* Toggles */}
        <div className="flex items-center gap-3">
          {/* Visivel toggle */}
          <button
            onClick={() => onToggle(produto.id, "visivel", produto.visivel)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              isVisible
                ? "bg-[#34C759]/10 text-[#34C759]"
                : "bg-[#F5F5F7] text-[#AEAEB2]"
            }`}
          >
            <span>{isVisible ? "👁️" : "👁️‍🗨️"}</span>
            Visivel
          </button>

          {/* Destaque toggle */}
          <button
            onClick={() => onToggle(produto.id, "destaque", produto.destaque)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
              isDestaque
                ? "bg-[#FF9500]/10 text-[#FF9500]"
                : "bg-[#F5F5F7] text-[#AEAEB2]"
            }`}
          >
            <span>{isDestaque ? "⭐" : "☆"}</span>
            Destaque
          </button>
        </div>
      </div>
    </div>
  );
}
