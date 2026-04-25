"use client";

import { useState, useEffect, useRef } from "react";
import { useAdmin } from "./AdminShell";

// Editor da landing /troca — gerencia LOGO (avatar do dono) e secao
// INFLUENCERS (foto + @ + ordem + on/off). Salva no campo labels JSONB de
// tradein_config (chaves _site_*), padrao igual ao do _whatsapp_*.
//
// Upload via /api/admin/site-upload (Supabase Storage bucket product-images
// com prefix site-). Fallback robusto: se config vazia, landing usa as fotos
// hardcoded em /public/images/ (compatibilidade com versao anterior).

interface Influencer {
  handle: string;
  foto_url: string;
}

interface SiteConfig {
  site_logo_url: string | null;
  site_logo_position: string;
  site_influencers_enabled: boolean;
  site_influencers: Influencer[];
}

const DEFAULT_CONFIG: SiteConfig = {
  site_logo_url: null,
  site_logo_position: "center 15%",
  site_influencers_enabled: false,
  site_influencers: [],
};

// URL pra mostrar na preview quando NAO tem upload customizado — aponta pro
// asset hardcoded em /public/images/ que continua funcionando como fallback.
const FALLBACK_LOGO = "/images/andre.png";

export default function SiteConfigEditor() {
  const { apiHeaders } = useAdmin();
  const [config, setConfig] = useState<SiteConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingInfluencer, setUploadingInfluencer] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetchConfig(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function fetchConfig() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/tradein-config", { headers: apiHeaders() });
      const json = await res.json();
      const d = json?.data || {};
      setConfig({
        site_logo_url: d.site_logo_url ?? null,
        site_logo_position: d.site_logo_position ?? "center 15%",
        site_influencers_enabled: d.site_influencers_enabled === true || d.site_influencers_enabled === "true",
        site_influencers: Array.isArray(d.site_influencers) ? d.site_influencers : [],
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
        body: JSON.stringify({
          site_logo_url: config.site_logo_url,
          site_logo_position: config.site_logo_position,
          site_influencers_enabled: config.site_influencers_enabled,
          site_influencers: config.site_influencers,
        }),
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

  async function uploadFile(file: File, kind: "logo" | "influencer"): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("kind", kind);
    try {
      const res = await fetch("/api/admin/site-upload", {
        method: "POST",
        headers: apiHeaders(), // FormData define o Content-Type sozinho
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
    // Best-effort — nao bloqueia se falhar (storage cleanup nao critico)
    try {
      await fetch("/api/admin/site-upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...apiHeaders() },
        body: JSON.stringify({ url }),
      });
    } catch {
      /* ignore */
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const newUrl = await uploadFile(file, "logo");
      if (newUrl) {
        // Limpa upload antigo (se for de upload, nao do fallback)
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
    if (!confirm("Restaurar logo padrao (foto que estava antes)? A logo customizada sera removida.")) return;
    if (config.site_logo_url) await deleteUploaded(config.site_logo_url);
    setConfig({ ...config, site_logo_url: null });
    flash("success", "Logo restaurada. Clique em SALVAR pra publicar.");
  }

  function addInfluencer() {
    setConfig({
      ...config,
      site_influencers: [...config.site_influencers, { handle: "@novo", foto_url: "" }],
    });
  }

  function updateInfluencer(idx: number, patch: Partial<Influencer>) {
    setConfig({
      ...config,
      site_influencers: config.site_influencers.map((inf, i) => (i === idx ? { ...inf, ...patch } : inf)),
    });
  }

  async function removeInfluencer(idx: number) {
    const inf = config.site_influencers[idx];
    if (!confirm(`Remover ${inf.handle}?`)) return;
    if (inf.foto_url) await deleteUploaded(inf.foto_url);
    setConfig({
      ...config,
      site_influencers: config.site_influencers.filter((_, i) => i !== idx),
    });
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

  if (loading) return <p className="text-[#86868B]">Carregando configuração…</p>;

  const logoPreview = config.site_logo_url || FALLBACK_LOGO;

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-[14px] ${
          msg.type === "success" ? "bg-green-50 text-green-800 border border-green-200"
                                  : "bg-red-50 text-red-800 border border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      {/* === SECAO LOGO === */}
      <section className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED]">
        <h2 className="text-[18px] font-semibold text-[#1D1D1F] mb-1">Logo do site</h2>
        <p className="text-[13px] text-[#86868B] mb-4">
          Foto que aparece no avatar circular do topo da landing (/troca). Recomendado: foto quadrada, mín 200×200px.
        </p>
        <div className="flex items-start gap-5">
          <div
            className="w-24 h-24 rounded-full overflow-hidden flex-shrink-0"
            style={{ border: "2px solid #E8740E", backgroundColor: "#FFF5EC" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoPreview}
              alt="Logo preview"
              className="w-full h-full object-cover"
              style={{ objectPosition: config.site_logo_position }}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
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
              <label className="block text-[12px] font-medium text-[#86868B] mb-1">Posicionamento da foto (CSS object-position)</label>
              <input type="text" value={config.site_logo_position}
                onChange={(e) => setConfig({ ...config, site_logo_position: e.target.value })}
                placeholder="center 15%"
                className="w-full px-3 py-2 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[13px]" />
              <p className="text-[11px] text-[#AEAEB2] mt-1">
                Use &ldquo;center 15%&rdquo; (mostra mais o topo da foto), &ldquo;center&rdquo; (centraliza) ou &ldquo;center 30%&rdquo; (mostra mais o meio).
              </p>
            </div>

            <p className="text-[12px] text-[#86868B]">
              {config.site_logo_url
                ? "✅ Usando foto customizada (upload)"
                : "ℹ️ Usando foto padrão (/public/images/andre.png)"}
            </p>
          </div>
        </div>
      </section>

      {/* === SECAO INFLUENCERS === */}
      <section className="bg-white rounded-xl p-5 shadow-sm border border-[#E8E8ED]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-[18px] font-semibold text-[#1D1D1F] mb-1">Influencers (seção &ldquo;Quem comprou aqui&rdquo;)</h2>
            <p className="text-[13px] text-[#86868B]">
              Fotos circulares que aparecem na landing como social proof. Cada @ vira link clicável pro Instagram.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer ml-4 flex-shrink-0">
            <input type="checkbox" checked={config.site_influencers_enabled}
              onChange={(e) => setConfig({ ...config, site_influencers_enabled: e.target.checked })}
              className="w-4 h-4 accent-[#E8740E]" />
            <span className="text-[13px] font-medium text-[#1D1D1F]">Mostrar na landing</span>
          </label>
        </div>

        {config.site_influencers.length === 0 && (
          <div className="border-2 border-dashed border-[#D2D2D7] rounded-lg p-6 text-center">
            <p className="text-[14px] text-[#86868B] mb-3">Nenhum influencer cadastrado.</p>
            <button onClick={addInfluencer}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-white transition-colors"
              style={{ backgroundColor: "#E8740E" }}>
              + Adicionar influencer
            </button>
          </div>
        )}

        {config.site_influencers.length > 0 && (
          <>
            <div className="space-y-3">
              {config.site_influencers.map((inf, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-[#E8E8ED] bg-[#FAFAFA]">
                  <div className="flex flex-col gap-1">
                    <button onClick={() => moveInfluencer(idx, "up")} disabled={idx === 0}
                      className="text-[14px] px-2 py-0.5 rounded hover:bg-[#E8E8ED] disabled:opacity-30 disabled:cursor-not-allowed">
                      ▲
                    </button>
                    <button onClick={() => moveInfluencer(idx, "down")} disabled={idx === config.site_influencers.length - 1}
                      className="text-[14px] px-2 py-0.5 rounded hover:bg-[#E8E8ED] disabled:opacity-30 disabled:cursor-not-allowed">
                      ▼
                    </button>
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
                    <label className="inline-flex items-center px-3 py-1.5 rounded text-[12px] font-medium border border-[#D2D2D7] hover:bg-[#F5F5F7] cursor-pointer transition-colors"
                      style={uploadingInfluencer === idx ? { opacity: 0.6 } : {}}>
                      {uploadingInfluencer === idx ? "Enviando…" : (inf.foto_url ? "Trocar foto" : "Subir foto")}
                      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        disabled={uploadingInfluencer === idx}
                        onChange={(e) => handleInfluencerPhotoChange(idx, e)} />
                    </label>
                  </div>

                  <button onClick={() => removeInfluencer(idx)}
                    className="text-[12px] text-red-600 hover:text-red-800 font-medium px-3 py-2 transition-colors flex-shrink-0">
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
