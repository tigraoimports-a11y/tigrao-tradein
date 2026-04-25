"use client";

import { useState, useEffect, useRef } from "react";
import { useAdmin } from "./AdminShell";

// Editor da landing /troca — 4 secoes: LOGO, TEXTOS, INFLUENCERS, FEEDBACKS.
// Salva no campo labels JSONB de tradein_config (chaves _site_*), padrao
// igual ao do _whatsapp_*.
//
// Upload via /api/admin/site-upload (Supabase Storage bucket product-images
// com prefix site-). Fallback robusto: se config vazia, landing usa as fotos
// e textos hardcoded (compatibilidade).
//
// Fase 1 (Abr/2026): logo + influencers
// Fase 2 (Abr/2026): textos editaveis + feedbacks de clientes

interface Influencer {
  handle: string;
  foto_url: string;
}

interface Feedback {
  foto_url: string;
  nome: string;     // opcional, pode ser vazio
  texto: string;    // opcional, pode ser vazio
}

interface SiteConfig {
  // Logo
  site_logo_url: string | null;
  site_logo_position: string;
  // Header
  site_header_title: string;
  site_header_tagline: string;
  // Headline (3 partes — meio fica destacado em laranja)
  site_headline_p1: string;
  site_headline_destaque: string;
  site_headline_p2: string;
  // Subtitulo
  site_subtitle: string;
  // CTA
  site_cta_text: string;
  // Trust badges (3)
  site_trust_1: string;
  site_trust_2: string;
  site_trust_3: string;
  // Social proof (perto das estrelas)
  site_social_proof_text: string;
  // Footer
  site_footer_line1: string;
  site_footer_cnpj: string;
  // Influencers
  site_influencers_enabled: boolean;
  site_influencers: Influencer[];
  // Feedbacks (Fase 2 — prints WhatsApp)
  site_feedbacks_enabled: boolean;
  site_feedbacks: Feedback[];
  // Fase 4 — cor da marca + toggles de visibilidade
  site_brand_color: string;          // hex, ex: "#E8740E"
  site_show_tagline: boolean;
  site_show_subtitle: boolean;
  site_show_trust_badges: boolean;
  site_show_social_proof: boolean;
  site_show_footer_cnpj: boolean;
}

// Defaults sensatos — se admin nunca editou, esses valores sao usados como
// preview e tambem como o que vai pro banco no primeiro save. Refletem o
// que esta hoje hardcoded no TradeInCalculatorMulti.tsx.
const DEFAULT_CONFIG: SiteConfig = {
  site_logo_url: null,
  site_logo_position: "center 15%",
  site_header_title: "TigrãoImports",
  site_header_tagline: "Trade-In Apple",
  site_headline_p1: "Troque seu iPhone usado por um",
  site_headline_destaque: "NOVO",
  site_headline_p2: "pagando só a diferença",
  site_subtitle: "Descubra em 30 segundos quanto vale seu aparelho na troca por um novo com garantia Apple.",
  site_cta_text: "Descobrir o valor do meu aparelho",
  site_trust_1: "Lacrado",
  site_trust_2: "Nota fiscal",
  site_trust_3: "Garantia Apple",
  site_social_proof_text: "+1.730 trocas realizadas",
  site_footer_line1: "+5 anos no Rio de Janeiro · +1.730 trocas realizadas",
  site_footer_cnpj: "CNPJ 50.139.554/0001-42",
  site_influencers_enabled: true,
  site_influencers: [],
  site_feedbacks_enabled: false,
  site_feedbacks: [],
  site_brand_color: "#E8740E", // laranja TigraoImports atual
  site_show_tagline: true,
  site_show_subtitle: true,
  site_show_trust_badges: true,
  site_show_social_proof: true,
  site_show_footer_cnpj: true,
};

const FALLBACK_LOGO = "/images/andre.png";

export default function SiteConfigEditor() {
  const { apiHeaders } = useAdmin();
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingInfluencer, setUploadingInfluencer] = useState<number | null>(null);
  const [uploadingFeedback, setUploadingFeedback] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchConfig(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tradein-config", { headers: apiHeaders() });
      const json = await res.json();
      const d = json?.data || {};
      // Merge com DEFAULT_CONFIG — chaves nao existentes no banco usam default
      setConfig({
        site_logo_url: d.site_logo_url ?? null,
        site_logo_position: d.site_logo_position ?? DEFAULT_CONFIG.site_logo_position,
        site_header_title: d.site_header_title ?? DEFAULT_CONFIG.site_header_title,
        site_header_tagline: d.site_header_tagline ?? DEFAULT_CONFIG.site_header_tagline,
        site_headline_p1: d.site_headline_p1 ?? DEFAULT_CONFIG.site_headline_p1,
        site_headline_destaque: d.site_headline_destaque ?? DEFAULT_CONFIG.site_headline_destaque,
        site_headline_p2: d.site_headline_p2 ?? DEFAULT_CONFIG.site_headline_p2,
        site_subtitle: d.site_subtitle ?? DEFAULT_CONFIG.site_subtitle,
        site_cta_text: d.site_cta_text ?? DEFAULT_CONFIG.site_cta_text,
        site_trust_1: d.site_trust_1 ?? DEFAULT_CONFIG.site_trust_1,
        site_trust_2: d.site_trust_2 ?? DEFAULT_CONFIG.site_trust_2,
        site_trust_3: d.site_trust_3 ?? DEFAULT_CONFIG.site_trust_3,
        site_social_proof_text: d.site_social_proof_text ?? DEFAULT_CONFIG.site_social_proof_text,
        site_footer_line1: d.site_footer_line1 ?? DEFAULT_CONFIG.site_footer_line1,
        site_footer_cnpj: d.site_footer_cnpj ?? DEFAULT_CONFIG.site_footer_cnpj,
        site_influencers_enabled: d.site_influencers_enabled === undefined || d.site_influencers_enabled === null
          ? DEFAULT_CONFIG.site_influencers_enabled
          : (d.site_influencers_enabled === true || d.site_influencers_enabled === "true"),
        site_influencers: Array.isArray(d.site_influencers) ? d.site_influencers : [],
        site_feedbacks_enabled: d.site_feedbacks_enabled === true || d.site_feedbacks_enabled === "true",
        site_feedbacks: Array.isArray(d.site_feedbacks) ? d.site_feedbacks : [],
        // Fase 4 — toggles defaultam pra TRUE quando undefined (preserva
        // landing v2 atual onde tudo esta visivel).
        site_brand_color: d.site_brand_color || DEFAULT_CONFIG.site_brand_color,
        site_show_tagline: d.site_show_tagline === undefined || d.site_show_tagline === null
          ? true : (d.site_show_tagline === true || d.site_show_tagline === "true"),
        site_show_subtitle: d.site_show_subtitle === undefined || d.site_show_subtitle === null
          ? true : (d.site_show_subtitle === true || d.site_show_subtitle === "true"),
        site_show_trust_badges: d.site_show_trust_badges === undefined || d.site_show_trust_badges === null
          ? true : (d.site_show_trust_badges === true || d.site_show_trust_badges === "true"),
        site_show_social_proof: d.site_show_social_proof === undefined || d.site_show_social_proof === null
          ? true : (d.site_show_social_proof === true || d.site_show_social_proof === "true"),
        site_show_footer_cnpj: d.site_show_footer_cnpj === undefined || d.site_show_footer_cnpj === null
          ? true : (d.site_show_footer_cnpj === true || d.site_show_footer_cnpj === "true"),
      });
    } catch (err) {
      flash("error", "Erro ao carregar: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function flash(type: "success" | "error", text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3500);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tradein-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...apiHeaders() },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erro ao salvar");
      flash("success", "Salvo com sucesso! Mudanças aparecem na landing /troca em segundos.");
    } catch (err) {
      flash("error", (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadFile(file: File, kind: "logo" | "influencer" | "misc"): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    try {
      const res = await fetch("/api/admin/site-upload", {
        method: "POST",
        headers: apiHeaders(),
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        flash("error", "Upload falhou: " + (json.error || "erro desconhecido"));
        return null;
      }
      return json.url as string;
    } catch (err) {
      flash("error", "Upload falhou: " + (err as Error).message);
      return null;
    }
  }

  async function deleteUploaded(url: string) {
    try {
      await fetch("/api/admin/site-upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...apiHeaders() },
        body: JSON.stringify({ url }),
      });
    } catch { /* ignore */ }
  }

  // === LOGO ===
  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const newUrl = await uploadFile(file, "logo");
      if (newUrl) {
        if (config.site_logo_url) await deleteUploaded(config.site_logo_url);
        setConfig({ ...config, site_logo_url: newUrl });
        flash("success", "Logo carregada. Clique em SALVAR pra publicar.");
      }
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  }
  async function restaurarLogoPadrao() {
    if (!confirm("Restaurar logo padrao? A logo customizada sera removida.")) return;
    if (config.site_logo_url) await deleteUploaded(config.site_logo_url);
    setConfig({ ...config, site_logo_url: null });
    flash("success", "Logo restaurada. Clique em SALVAR pra publicar.");
  }

  // === INFLUENCERS ===
  function addInfluencer() {
    setConfig({ ...config, site_influencers: [...config.site_influencers, { handle: "@novo", foto_url: "" }] });
  }
  function updateInfluencer(idx: number, patch: Partial<Influencer>) {
    setConfig({ ...config, site_influencers: config.site_influencers.map((inf, i) => (i === idx ? { ...inf, ...patch } : inf)) });
  }
  async function removeInfluencer(idx: number) {
    const inf = config.site_influencers[idx];
    if (!confirm(`Remover ${inf.handle}?`)) return;
    if (inf.foto_url) await deleteUploaded(inf.foto_url);
    setConfig({ ...config, site_influencers: config.site_influencers.filter((_, i) => i !== idx) });
  }
  function moveInfluencer(idx: number, dir: "up" | "down") {
    const newList = [...config.site_influencers];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newList.length) return;
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    setConfig({ ...config, site_influencers: newList });
  }
  async function handleInfluencerPhotoChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingInfluencer(idx);
    try {
      const newUrl = await uploadFile(file, "influencer");
      if (newUrl) {
        const old = config.site_influencers[idx].foto_url;
        if (old) await deleteUploaded(old);
        updateInfluencer(idx, { foto_url: newUrl });
        flash("success", "Foto carregada. Clique em SALVAR pra publicar.");
      }
    } finally {
      setUploadingInfluencer(null);
      e.target.value = "";
    }
  }

  // === FEEDBACKS ===
  function addFeedback() {
    setConfig({ ...config, site_feedbacks: [...config.site_feedbacks, { foto_url: "", nome: "", texto: "" }] });
  }
  function updateFeedback(idx: number, patch: Partial<Feedback>) {
    setConfig({ ...config, site_feedbacks: config.site_feedbacks.map((fb, i) => (i === idx ? { ...fb, ...patch } : fb)) });
  }
  async function removeFeedback(idx: number) {
    if (!confirm("Remover este feedback?")) return;
    const fb = config.site_feedbacks[idx];
    if (fb.foto_url) await deleteUploaded(fb.foto_url);
    setConfig({ ...config, site_feedbacks: config.site_feedbacks.filter((_, i) => i !== idx) });
  }
  function moveFeedback(idx: number, dir: "up" | "down") {
    const newList = [...config.site_feedbacks];
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= newList.length) return;
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    setConfig({ ...config, site_feedbacks: newList });
  }
  async function handleFeedbackPhotoChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFeedback(idx);
    try {
      const newUrl = await uploadFile(file, "misc");
      if (newUrl) {
        const old = config.site_feedbacks[idx].foto_url;
        if (old) await deleteUploaded(old);
        updateFeedback(idx, { foto_url: newUrl });
        flash("success", "Foto carregada. Clique em SALVAR pra publicar.");
      }
    } finally {
      setUploadingFeedback(null);
      e.target.value = "";
    }
  }

  if (loading) return <p className="text-[#86868B]">Carregando configuração…</p>;

  const logoPreview = config.site_logo_url || FALLBACK_LOGO;

  // Estilos compartilhados
  const sectionStyle = "bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED]";
  const sectionTitle = "text-[18px] font-semibold text-[#1D1D1F] mb-1";
  const sectionDesc = "text-[13px] text-[#86868B] mb-4";
  const labelStyle = "block text-[12px] font-medium text-[#86868B] mb-1";
  const inputStyle = "w-full px-3 py-2 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[13px] focus:outline-none focus:border-[#E8740E] transition-colors";

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-[14px] sticky top-2 z-10 shadow-sm ${
          msg.type === "success" ? "bg-green-50 text-green-800 border border-green-200"
                                  : "bg-red-50 text-red-800 border border-red-200"
        }`}>{msg.text}</div>
      )}

      {/* === SECAO LOGO === */}
      <section className={sectionStyle}>
        <h2 className={sectionTitle}>1. Logo do site</h2>
        <p className={sectionDesc}>Foto que aparece no avatar circular do topo da landing (/troca).</p>
        <div className="flex items-start gap-5">
          <div className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0"
            style={{ border: "2px solid #E8740E", backgroundColor: "#FFF5EC" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoPreview} alt="Logo preview" className="w-full h-full object-cover"
              style={{ objectPosition: config.site_logo_position }}
              onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center px-4 py-2 rounded-lg text-[13px] font-medium text-white cursor-pointer transition-colors"
                style={{ backgroundColor: uploadingLogo ? "#86868B" : "#E8740E" }}>
                {uploadingLogo ? "Enviando…" : (config.site_logo_url ? "Trocar foto" : "Subir foto")}
                <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  disabled={uploadingLogo} onChange={handleLogoChange} />
              </label>
              {config.site_logo_url && (
                <button onClick={restaurarLogoPadrao}
                  className="px-4 py-2 rounded-lg text-[13px] font-medium border border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors">
                  Restaurar padrão
                </button>
              )}
            </div>
            <div>
              <label className={labelStyle}>Posicionamento da foto (CSS object-position)</label>
              <input type="text" value={config.site_logo_position}
                onChange={(e) => setConfig({ ...config, site_logo_position: e.target.value })}
                placeholder="center 15%" className={inputStyle} />
              <p className="text-[11px] text-[#AEAEB2] mt-1">
                &ldquo;center 5%&rdquo; mostra mais o topo · &ldquo;center&rdquo; centraliza · &ldquo;center 30%&rdquo; mostra mais o meio.
              </p>
            </div>
            <p className="text-[12px] text-[#86868B]">
              {config.site_logo_url ? "✅ Foto customizada" : "ℹ️ Foto padrão (/public/images/andre.png)"}
            </p>
          </div>
        </div>
      </section>

      {/* === SECAO TEXTOS === */}
      <section className={sectionStyle}>
        <h2 className={sectionTitle}>2. Textos da landing</h2>
        <p className={sectionDesc}>Edite todos os textos que aparecem em /troca. Mudanças refletem em segundos.</p>

        <div className="space-y-5">
          {/* Header */}
          <div className="grid grid-cols-2 gap-3 pb-4 border-b border-[#E8E8ED]">
            <div>
              <label className={labelStyle}>Nome no header</label>
              <input type="text" value={config.site_header_title}
                onChange={(e) => setConfig({ ...config, site_header_title: e.target.value })}
                className={inputStyle} placeholder="TigrãoImports" />
            </div>
            <div>
              <label className={labelStyle}>Tagline (em laranja, abaixo do nome)</label>
              <input type="text" value={config.site_header_tagline}
                onChange={(e) => setConfig({ ...config, site_header_tagline: e.target.value })}
                className={inputStyle} placeholder="Trade-In Apple" />
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-3 pb-4 border-b border-[#E8E8ED]">
            <p className="text-[12px] font-semibold text-[#1D1D1F]">Headline (3 partes — meio fica destacado em laranja)</p>
            <div>
              <label className={labelStyle}>Início</label>
              <input type="text" value={config.site_headline_p1}
                onChange={(e) => setConfig({ ...config, site_headline_p1: e.target.value })}
                className={inputStyle} placeholder="Troque seu iPhone usado por um" />
            </div>
            <div>
              <label className={labelStyle}>Palavra em destaque (LARANJA)</label>
              <input type="text" value={config.site_headline_destaque}
                onChange={(e) => setConfig({ ...config, site_headline_destaque: e.target.value })}
                className={inputStyle + " font-semibold"} placeholder="NOVO"
                style={{ color: "#E8740E" }} />
            </div>
            <div>
              <label className={labelStyle}>Final (aparece em nova linha)</label>
              <input type="text" value={config.site_headline_p2}
                onChange={(e) => setConfig({ ...config, site_headline_p2: e.target.value })}
                className={inputStyle} placeholder="pagando só a diferença" />
            </div>
            {/* Preview da headline */}
            <div className="p-4 rounded-lg bg-[#FAFAFA] border border-[#E8E8ED] text-center">
              <p className="text-[11px] text-[#86868B] mb-2 uppercase tracking-wider">Preview:</p>
              <p className="text-[18px] font-bold leading-tight text-[#1D1D1F]">
                {config.site_headline_p1} <span style={{ color: "#E8740E" }}>{config.site_headline_destaque}</span><br />
                {config.site_headline_p2}
              </p>
            </div>
          </div>

          {/* Subtitulo */}
          <div className="pb-4 border-b border-[#E8E8ED]">
            <label className={labelStyle}>Subtítulo (abaixo da headline)</label>
            <textarea value={config.site_subtitle}
              onChange={(e) => setConfig({ ...config, site_subtitle: e.target.value })}
              className={inputStyle + " min-h-[60px] resize-y"}
              placeholder="Descubra em 30 segundos quanto vale seu aparelho..." />
          </div>

          {/* CTA */}
          <div className="pb-4 border-b border-[#E8E8ED]">
            <label className={labelStyle}>Texto do botão verde (CTA)</label>
            <input type="text" value={config.site_cta_text}
              onChange={(e) => setConfig({ ...config, site_cta_text: e.target.value })}
              className={inputStyle} placeholder="Descobrir o valor do meu aparelho" />
          </div>

          {/* Social proof */}
          <div className="pb-4 border-b border-[#E8E8ED]">
            <label className={labelStyle}>Texto do social proof (perto das estrelas ⭐)</label>
            <input type="text" value={config.site_social_proof_text}
              onChange={(e) => setConfig({ ...config, site_social_proof_text: e.target.value })}
              className={inputStyle} placeholder="+1.730 trocas realizadas" />
          </div>

          {/* Trust badges */}
          <div className="pb-4 border-b border-[#E8E8ED]">
            <label className={labelStyle}>Trust badges (3 itens com ✓ laranja)</label>
            <div className="grid grid-cols-3 gap-2">
              <input type="text" value={config.site_trust_1}
                onChange={(e) => setConfig({ ...config, site_trust_1: e.target.value })}
                className={inputStyle} placeholder="Lacrado" />
              <input type="text" value={config.site_trust_2}
                onChange={(e) => setConfig({ ...config, site_trust_2: e.target.value })}
                className={inputStyle} placeholder="Nota fiscal" />
              <input type="text" value={config.site_trust_3}
                onChange={(e) => setConfig({ ...config, site_trust_3: e.target.value })}
                className={inputStyle} placeholder="Garantia Apple" />
            </div>
          </div>

          {/* Footer */}
          <div className="space-y-3">
            <p className="text-[12px] font-semibold text-[#1D1D1F]">Footer</p>
            <div>
              <label className={labelStyle}>Linha 1 (credibilidade)</label>
              <input type="text" value={config.site_footer_line1}
                onChange={(e) => setConfig({ ...config, site_footer_line1: e.target.value })}
                className={inputStyle} placeholder="+5 anos no Rio · +1.730 trocas" />
            </div>
            <div>
              <label className={labelStyle}>CNPJ (linha 2)</label>
              <input type="text" value={config.site_footer_cnpj}
                onChange={(e) => setConfig({ ...config, site_footer_cnpj: e.target.value })}
                className={inputStyle} placeholder="CNPJ 50.139.554/0001-42" />
            </div>
          </div>
        </div>
      </section>

      {/* === SECAO INFLUENCERS === */}
      <section className={sectionStyle}>
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="flex-1">
            <h2 className={sectionTitle}>3. Influencers (seção &ldquo;Quem comprou aqui&rdquo;)</h2>
            <p className={sectionDesc + " mb-0"}>Fotos circulares que aparecem como social proof. Cada @ vira link clicável.</p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={config.site_influencers_enabled}
              onChange={(e) => setConfig({ ...config, site_influencers_enabled: e.target.checked })}
              className="w-4 h-4 accent-[#E8740E]" />
            <span className="text-[13px] font-medium text-[#1D1D1F]">Mostrar na landing</span>
          </label>
        </div>

        {config.site_influencers.length === 0 ? (
          <div className="border-2 border-dashed border-[#D2D2D7] rounded-lg p-6 text-center">
            <p className="text-[14px] text-[#86868B] mb-3">Nenhum influencer cadastrado.</p>
            <button onClick={addInfluencer}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-white" style={{ backgroundColor: "#E8740E" }}>
              + Adicionar influencer
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {config.site_influencers.map((inf, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-[#E8E8ED] bg-[#FAFAFA]">
                  <div className="flex flex-col gap-1">
                    <button onClick={() => moveInfluencer(idx, "up")} disabled={idx === 0}
                      className="text-[14px] px-2 py-0.5 rounded hover:bg-[#E8E8ED] disabled:opacity-30">▲</button>
                    <button onClick={() => moveInfluencer(idx, "down")} disabled={idx === config.site_influencers.length - 1}
                      className="text-[14px] px-2 py-0.5 rounded hover:bg-[#E8E8ED] disabled:opacity-30">▼</button>
                  </div>
                  <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-[#F5F5F7]"
                    style={{ border: "2px solid #E8740E" }}>
                    {inf.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={inf.foto_url} alt={inf.handle} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-[#86868B] text-center px-1">sem foto</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <input type="text" value={inf.handle}
                      onChange={(e) => {
                        let v = e.target.value.trim();
                        if (v && !v.startsWith("@")) v = "@" + v;
                        updateInfluencer(idx, { handle: v });
                      }}
                      placeholder="@usuario"
                      className="w-full px-3 py-1.5 bg-white border border-[#D2D2D7] rounded text-[13px]" />
                    <label className="inline-flex items-center px-3 py-1.5 rounded text-[12px] font-medium border border-[#D2D2D7] hover:bg-[#F5F5F7] cursor-pointer"
                      style={uploadingInfluencer === idx ? { opacity: 0.6 } : {}}>
                      {uploadingInfluencer === idx ? "Enviando…" : (inf.foto_url ? "Trocar foto" : "Subir foto")}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        disabled={uploadingInfluencer === idx}
                        onChange={(e) => handleInfluencerPhotoChange(idx, e)} />
                    </label>
                  </div>
                  <button onClick={() => removeInfluencer(idx)}
                    className="text-[12px] text-red-600 hover:text-red-800 font-medium px-3 py-2 flex-shrink-0">
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addInfluencer}
              className="mt-4 px-4 py-2 rounded-lg text-[13px] font-medium border-2 border-dashed border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors w-full">
              + Adicionar mais um influencer
            </button>
          </>
        )}
      </section>

      {/* === SECAO FEEDBACKS DE CLIENTES === */}
      <section className={sectionStyle}>
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="flex-1">
            <h2 className={sectionTitle}>4. Feedbacks de clientes (prints WhatsApp)</h2>
            <p className={sectionDesc + " mb-0"}>
              Depoimentos reais de clientes — print do WhatsApp + nome (opcional) + texto do depoimento.
              Aparece na landing entre &ldquo;Quem comprou aqui&rdquo; e o footer.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer flex-shrink-0">
            <input type="checkbox" checked={config.site_feedbacks_enabled}
              onChange={(e) => setConfig({ ...config, site_feedbacks_enabled: e.target.checked })}
              className="w-4 h-4 accent-[#E8740E]" />
            <span className="text-[13px] font-medium text-[#1D1D1F]">Mostrar na landing</span>
          </label>
        </div>

        {config.site_feedbacks.length === 0 ? (
          <div className="border-2 border-dashed border-[#D2D2D7] rounded-lg p-6 text-center">
            <p className="text-[14px] text-[#86868B] mb-3">Nenhum feedback cadastrado.</p>
            <p className="text-[12px] text-[#AEAEB2] mb-3">
              💡 Dica: toda vez que fechar uma troca e cliente elogiar, peça permissão e tire print do WhatsApp.
              Em 2 semanas você tem 5-10 prints autênticos pra colocar aqui.
            </p>
            <button onClick={addFeedback}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-white" style={{ backgroundColor: "#E8740E" }}>
              + Adicionar primeiro feedback
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {config.site_feedbacks.map((fb, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border border-[#E8E8ED] bg-[#FAFAFA]">
                  <div className="flex flex-col gap-1 pt-1">
                    <button onClick={() => moveFeedback(idx, "up")} disabled={idx === 0}
                      className="text-[14px] px-2 py-0.5 rounded hover:bg-[#E8E8ED] disabled:opacity-30">▲</button>
                    <button onClick={() => moveFeedback(idx, "down")} disabled={idx === config.site_feedbacks.length - 1}
                      className="text-[14px] px-2 py-0.5 rounded hover:bg-[#E8E8ED] disabled:opacity-30">▼</button>
                  </div>

                  <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-[#F5F5F7] border border-[#D2D2D7]">
                    {fb.foto_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fb.foto_url} alt="Print" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-[#86868B] text-center px-1">sem print</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <input type="text" value={fb.nome}
                      onChange={(e) => updateFeedback(idx, { nome: e.target.value })}
                      placeholder="Nome do cliente (opcional, ex: Carlos M.)"
                      className="w-full px-3 py-1.5 bg-white border border-[#D2D2D7] rounded text-[13px]" />
                    <textarea value={fb.texto}
                      onChange={(e) => updateFeedback(idx, { texto: e.target.value })}
                      placeholder="Depoimento (opcional, ex: 'Trocou meu iPhone 13 por 16 Pro, paguei só R$ 2.300!')"
                      className="w-full px-3 py-1.5 bg-white border border-[#D2D2D7] rounded text-[13px] min-h-[50px] resize-y" />
                    <label className="inline-flex items-center px-3 py-1.5 rounded text-[12px] font-medium border border-[#D2D2D7] hover:bg-[#F5F5F7] cursor-pointer"
                      style={uploadingFeedback === idx ? { opacity: 0.6 } : {}}>
                      {uploadingFeedback === idx ? "Enviando…" : (fb.foto_url ? "Trocar print/foto" : "Subir print/foto")}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        disabled={uploadingFeedback === idx}
                        onChange={(e) => handleFeedbackPhotoChange(idx, e)} />
                    </label>
                  </div>

                  <button onClick={() => removeFeedback(idx)}
                    className="text-[12px] text-red-600 hover:text-red-800 font-medium px-3 py-2 flex-shrink-0">
                    Remover
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addFeedback}
              className="mt-4 px-4 py-2 rounded-lg text-[13px] font-medium border-2 border-dashed border-[#D2D2D7] text-[#86868B] hover:border-[#E8740E] hover:text-[#E8740E] transition-colors w-full">
              + Adicionar mais um feedback
            </button>
          </>
        )}
      </section>

      {/* === SECAO 5 — CORES & VISIBILIDADE === */}
      <section className={sectionStyle}>
        <h2 className={sectionTitle}>5. Cores e visibilidade</h2>
        <p className={sectionDesc}>
          Personalize a cor da marca e ative/desative seções secundárias da landing.
          Use com cuidado — esses elementos foram pensados pra maximizar conversão.
        </p>

        {/* Color picker */}
        <div className="pb-5 border-b border-[#E8E8ED] mb-5">
          <label className={labelStyle + " mb-2"}>Cor primária da marca</label>
          <div className="flex items-center gap-3">
            <input type="color" value={config.site_brand_color}
              onChange={(e) => setConfig({ ...config, site_brand_color: e.target.value })}
              className="w-14 h-14 rounded-lg cursor-pointer border-2 border-[#D2D2D7]" />
            <input type="text" value={config.site_brand_color}
              onChange={(e) => {
                const v = e.target.value.trim();
                // Aceita hex com ou sem # — adiciona se faltar
                const normalized = v.startsWith("#") ? v : (v ? "#" + v : "");
                setConfig({ ...config, site_brand_color: normalized });
              }}
              placeholder="#E8740E"
              className={inputStyle + " w-32 font-mono"} />
            <button onClick={() => setConfig({ ...config, site_brand_color: DEFAULT_CONFIG.site_brand_color })}
              className="px-3 py-2 text-[12px] text-[#86868B] hover:text-[#1D1D1F] underline">
              Restaurar padrão
            </button>
          </div>
          <p className="text-[11px] text-[#AEAEB2] mt-2">
            Cor usada em destaques: palavra da headline, ✓ trust badges, borders dos avatares,
            tagline, etc. <strong>O CTA verde NÃO muda</strong> (verde converte mais que
            laranja em botões de ação).
          </p>

          {/* Preview de elementos com a nova cor */}
          <div className="mt-3 p-4 rounded-lg bg-[#FAFAFA] border border-[#E8E8ED]">
            <p className="text-[11px] text-[#86868B] mb-2 uppercase tracking-wider">Preview:</p>
            <div className="space-y-2">
              <p className="text-[15px] text-[#1D1D1F]">
                Texto com <span style={{ color: config.site_brand_color, fontWeight: "bold" }}>palavra destacada</span> em laranja.
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full" style={{ border: `2px solid ${config.site_brand_color}`, backgroundColor: config.site_brand_color + "15" }} />
                <div className="flex gap-2 text-[12px] text-[#86868B]">
                  <span><span style={{ color: config.site_brand_color }}>✓</span> Trust badge 1</span>
                  <span><span style={{ color: config.site_brand_color }}>✓</span> Trust badge 2</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Toggles de secoes */}
        <div className="space-y-3">
          <p className="text-[12px] font-semibold text-[#1D1D1F] mb-2">
            Seções secundárias (mostrar / esconder)
          </p>
          {[
            { key: "site_show_tagline" as const, label: "Tagline (\"Trade-In Apple\" abaixo do nome)", warning: false },
            { key: "site_show_subtitle" as const, label: "Subtítulo (texto abaixo da headline)", warning: true },
            { key: "site_show_trust_badges" as const, label: "Trust badges (✓ Lacrado / ✓ NF / ✓ Garantia)", warning: true },
            { key: "site_show_social_proof" as const, label: "Social proof (estrelas + número de trocas)", warning: true },
            { key: "site_show_footer_cnpj" as const, label: "CNPJ no footer", warning: false },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-lg border border-[#E8E8ED] bg-[#FAFAFA]">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#1D1D1F]">{item.label}</p>
                {item.warning && !config[item.key] && (
                  <p className="text-[11px] text-amber-700 mt-0.5">⚠️ Esconder isso pode reduzir confiança/conversão</p>
                )}
              </div>
              <label className="inline-flex items-center cursor-pointer flex-shrink-0 ml-3">
                <input type="checkbox" checked={config[item.key]}
                  onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
                  className="sr-only peer" />
                <div className="w-10 h-5 bg-[#D2D2D7] peer-checked:bg-[#E8740E] rounded-full transition-colors relative">
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config[item.key] ? "left-5" : "left-0.5"}`} />
                </div>
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* === BOTAO SALVAR === */}
      <div className="sticky bottom-4 flex justify-end">
        <button onClick={save} disabled={saving}
          className="px-6 py-3 rounded-lg text-[15px] font-semibold text-white transition-colors shadow-lg disabled:opacity-60"
          style={{ backgroundColor: saving ? "#86868B" : "#E8740E" }}>
          {saving ? "Salvando…" : "Salvar e publicar"}
        </button>
      </div>
    </div>
  );
}
