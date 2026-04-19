"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminShell";
import { resizeImageFile } from "@/lib/instagram/image-resize";

interface Slide {
  titulo: string;
  texto: string;
  destaque?: string;
  imagem_url?: string | null;
}

interface Pesquisa {
  fontes?: string[];
  fatos_verificados?: string[];
}

interface Post {
  id: string;
  tema: string;
  tipo: "DICA" | "COMPARATIVO" | "NOTICIA";
  numero_slides: number;
  status: "RASCUNHO" | "GERANDO" | "GERADO" | "APROVADO" | "AGENDADO" | "POSTADO" | "ERRO";
  slides_json: Slide[] | null;
  legenda: string | null;
  hashtags: string[] | null;
  pesquisa_json: Pesquisa | null;
  imagens_urls: string[] | null;
  erro: string | null;
  criado_por: string | null;
  created_at: string;
}

interface ImagemCandidata {
  url: string;
  source: string;
  sourceUrl: string;
}

const STATUS_LABEL: Record<Post["status"], string> = {
  RASCUNHO: "📝 Rascunho",
  GERANDO: "⏳ Gerando...",
  GERADO: "✨ Gerado",
  APROVADO: "👍 Aprovado",
  AGENDADO: "📅 Agendado",
  POSTADO: "✅ Postado",
  ERRO: "❌ Erro",
};

const TIPO_LABEL: Record<Post["tipo"], string> = {
  DICA: "💡 Dica",
  COMPARATIVO: "⚖️ Comparativo",
  NOTICIA: "📰 Notícia",
};

export default function InstagramPostPage() {
  const { id } = useParams<{ id: string }>();
  const { password, apiHeaders } = useAdmin();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [slidesEdit, setSlidesEdit] = useState<Slide[]>([]);
  const [legendaEdit, setLegendaEdit] = useState("");
  const [hashtagsEdit, setHashtagsEdit] = useState("");

  // PR 2: imagens
  const [buscandoImgs, setBuscandoImgs] = useState(false);
  const [renderizando, setRenderizando] = useState(false);
  const [galeria, setGaleria] = useState<ImagemCandidata[]>([]);
  const [slideAlvo, setSlideAlvo] = useState<number | null>(null);
  const [uploadingSlide, setUploadingSlide] = useState<number | null>(null);
  const uploadRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const fetchPost = useCallback(async () => {
    if (!password || !id) return;
    try {
      const res = await fetch(`/api/admin/instagram-posts?id=${id}`, { headers: apiHeaders() });
      if (res.ok) {
        const j = await res.json();
        setPost(j.data);
        if (j.data?.slides_json) setSlidesEdit(j.data.slides_json);
        if (j.data?.legenda) setLegendaEdit(j.data.legenda);
        if (j.data?.hashtags) setHashtagsEdit(j.data.hashtags.join(" "));
      }
    } finally {
      setLoading(false);
    }
  }, [password, id, apiHeaders]);

  useEffect(() => { fetchPost(); }, [fetchPost]);

  const gerar = async () => {
    setGerando(true);
    setMsg("Gerando... isso pode levar até 2 minutos (pesquisa + fact-check).");
    try {
      const res = await fetch("/api/instagram/gerar", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ postId: id }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setMsg("Erro: " + (j.detalhe || j.error || "falha ao gerar"));
        await fetchPost();
        return;
      }
      setPost(j.data);
      if (j.data.slides_json) setSlidesEdit(j.data.slides_json);
      if (j.data.legenda) setLegendaEdit(j.data.legenda);
      if (j.data.hashtags) setHashtagsEdit(j.data.hashtags.join(" "));
      setMsg("Gerado com sucesso.");
    } catch (e) {
      setMsg("Erro de rede: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGerando(false);
    }
  };

  const buscarImagens = async () => {
    setBuscandoImgs(true);
    setMsg("Buscando imagens nas fontes consultadas...");
    try {
      const res = await fetch("/api/instagram/buscar-imagem", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ postId: id }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setMsg("Erro: " + (j.error || "falha na busca"));
        return;
      }
      setGaleria(j.imagens || []);
      if ((j.imagens || []).length === 0) {
        setMsg("Nenhuma imagem encontrada nas fontes. Use upload manual por slide.");
      } else {
        setMsg(`${j.imagens.length} imagens encontradas. Clique em um slide e escolha a imagem.`);
      }
    } finally {
      setBuscandoImgs(false);
    }
  };

  const atribuirImagem = (idx: number, url: string | null) => {
    setSlidesEdit(prev => prev.map((s, i) => (i === idx ? { ...s, imagem_url: url } : s)));
    setMsg("Imagem atribuída. Lembre de salvar a edição.");
  };

  const uploadImagemSlide = async (idx: number, file: File) => {
    setUploadingSlide(idx);
    try {
      setMsg(`Preparando imagem do slide ${idx + 1}...`);
      // Imagens de slide: 1600px eh suficiente pro render em 1080x1350.
      const resized = await resizeImageFile(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.85 });
      const sizeKB = Math.round(resized.size / 1024);
      setMsg(`Enviando slide ${idx + 1} (${sizeKB} KB)...`);

      const form = new FormData();
      form.append("file", resized);
      form.append("kind", "slide");
      form.append("postId", String(id));
      const up = await fetch("/api/admin/instagram-upload", {
        method: "POST",
        headers: apiHeaders(),
        body: form,
      });
      let uj: { ok?: boolean; url?: string; error?: string };
      try {
        uj = await up.json();
      } catch {
        setMsg(`Erro no upload (HTTP ${up.status}): resposta invalida. Use uma imagem menor.`);
        return;
      }
      if (!up.ok || !uj.ok) {
        setMsg("Erro no upload: " + (uj.error || `HTTP ${up.status}`));
        return;
      }
      atribuirImagem(idx, uj.url ?? null);
    } catch (err) {
      setMsg("Erro: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setUploadingSlide(null);
    }
  };

  const renderizar = async () => {
    if (!post) return;
    // Salva slides atualizados (com imagem_url) antes de renderizar.
    setRenderizando(true);
    setMsg("Renderizando PNGs...");
    try {
      await salvarEdicao(undefined, true);
      const res = await fetch("/api/instagram/render-post", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ postId: id }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setMsg("Erro ao renderizar: " + (j.error || "falha"));
        return;
      }
      setMsg(`${j.urls.length} slides renderizados.`);
      fetchPost();
    } finally {
      setRenderizando(false);
    }
  };

  const salvarEdicao = async (novoStatus?: Post["status"], silent = false) => {
    setSalvando(true);
    if (!silent) setMsg("");
    try {
      const hashtags = hashtagsEdit
        .split(/\s+/)
        .map(h => h.replace(/^#+/, "").trim())
        .filter(Boolean);

      const body: Record<string, unknown> = {
        id,
        slides_json: slidesEdit,
        legenda: legendaEdit,
        hashtags,
      };
      if (novoStatus) body.status = novoStatus;

      const res = await fetch("/api/admin/instagram-posts", {
        method: "PATCH",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        if (!silent) setMsg("Erro: " + (j.error || "falha ao salvar"));
        return;
      }
      if (!silent) setMsg(novoStatus === "APROVADO" ? "Aprovado!" : "Salvo.");
      if (!silent) fetchPost();
    } finally {
      setSalvando(false);
    }
  };

  const atualizarSlide = (idx: number, campo: keyof Slide, valor: string) => {
    setSlidesEdit(prev => prev.map((s, i) => i === idx ? { ...s, [campo]: valor } : s));
  };

  if (loading) return <div className="max-w-5xl mx-auto p-6 text-[#86868B]">Carregando...</div>;
  if (!post) return <div className="max-w-5xl mx-auto p-6 text-[#E74C3C]">Post não encontrado.</div>;

  const jaTemConteudo = post.status !== "RASCUNHO" && post.status !== "GERANDO" && slidesEdit.length > 0;
  const podeEditar = ["GERADO", "ERRO"].includes(post.status);
  const temFontes = Array.isArray(post.pesquisa_json?.fontes) && (post.pesquisa_json?.fontes?.length ?? 0) > 0;
  const temImagensRenderizadas = Array.isArray(post.imagens_urls) && post.imagens_urls.length > 0;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <Link href="/admin/instagram" className="text-sm text-[#E8740E] hover:underline">← Voltar</Link>
      </div>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-xs px-2 py-1 rounded-lg bg-[#F5F5F7] text-[#6E6E73]">{TIPO_LABEL[post.tipo]}</span>
            <span className="text-xs px-2 py-1 rounded-lg bg-[#F5F5F7] text-[#6E6E73]">{post.numero_slides} slides</span>
            <span className="text-xs px-2 py-1 rounded-lg bg-[#FFF5EB] text-[#E8740E]">{STATUS_LABEL[post.status]}</span>
          </div>
          <h1 className="text-2xl font-bold text-[#1D1D1F]">{post.tema}</h1>
          <p className="text-xs text-[#86868B] mt-1">
            Criado em {new Date(post.created_at).toLocaleString("pt-BR")}
            {post.criado_por && ` · por ${post.criado_por}`}
          </p>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${
          msg.startsWith("Erro") ? "bg-[#FFF0F0] text-[#E74C3C] border border-[#E74C3C]/20" : "bg-[#F0FFF4] text-[#2ECC71] border border-[#2ECC71]/20"
        }`}>
          {msg}
        </div>
      )}

      {post.erro && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-[#FFF0F0] text-[#E74C3C] border border-[#E74C3C]/20 text-sm">
          <strong>Último erro:</strong> {post.erro}
        </div>
      )}

      {/* Ação principal: gerar */}
      {(post.status === "RASCUNHO" || post.status === "ERRO") && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-6 mb-6 text-center">
          <p className="text-sm text-[#6E6E73] mb-4">
            Clique pra a IA pesquisar o tema, verificar os fatos em múltiplas fontes e montar os {post.numero_slides} slides do carrossel.
          </p>
          <button
            onClick={gerar}
            disabled={gerando}
            className="px-5 py-2.5 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors disabled:opacity-50"
          >
            {gerando ? "⏳ Gerando..." : post.status === "ERRO" ? "🔄 Tentar de novo" : "✨ Gerar conteúdo"}
          </button>
        </div>
      )}

      {post.status === "GERANDO" && (
        <div className="bg-white border border-[#D2D2D7] rounded-2xl p-8 mb-6 text-center text-[#86868B]">
          ⏳ Gerando... (pesquisando, verificando fatos, montando slides)
        </div>
      )}

      {/* Slides */}
      {jaTemConteudo && (
        <>
          <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold text-[#1D1D1F]">Slides</h2>
            {podeEditar && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={gerar}
                  disabled={gerando}
                  className="px-3 py-1.5 rounded-xl border border-[#D2D2D7] text-xs text-[#6E6E73] hover:bg-[#F5F5F7] disabled:opacity-50"
                >
                  {gerando ? "Gerando..." : "🔄 Re-gerar texto"}
                </button>
                <button
                  onClick={() => salvarEdicao()}
                  disabled={salvando}
                  className="px-3 py-1.5 rounded-xl border border-[#D2D2D7] text-xs text-[#6E6E73] hover:bg-[#F5F5F7] disabled:opacity-50"
                >
                  {salvando ? "Salvando..." : "💾 Salvar edição"}
                </button>
                <button
                  onClick={() => salvarEdicao("APROVADO")}
                  disabled={salvando}
                  className="px-3 py-1.5 rounded-xl bg-[#2ECC71] text-white text-xs font-semibold hover:bg-[#27AE60] disabled:opacity-50"
                >
                  👍 Aprovar
                </button>
              </div>
            )}
          </div>

          {/* Galeria de imagens */}
          {podeEditar && (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#1D1D1F]">Imagens dos slides</h3>
                  <p className="text-xs text-[#86868B] mt-1">
                    Busca nas fontes do fact-check (Apple oficial primeiro). Se a imagem não for ideal, faça upload manual em cada slide.
                  </p>
                </div>
                {temFontes && (
                  <button
                    onClick={buscarImagens}
                    disabled={buscandoImgs}
                    className="px-3 py-1.5 rounded-xl bg-[#1D1D1F] text-white text-xs font-semibold hover:bg-[#333] disabled:opacity-50"
                  >
                    {buscandoImgs ? "Buscando..." : "🔍 Buscar nas fontes"}
                  </button>
                )}
              </div>

              {galeria.length > 0 && (
                <>
                  <div className="text-xs text-[#6E6E73] mb-2">
                    {slideAlvo === null
                      ? "Clique em um slide abaixo (ícone 🖼️) e depois na imagem que quiser atribuir."
                      : <>Slide <strong>{slideAlvo + 1}</strong> selecionado. Clique numa imagem pra atribuir · <button onClick={() => setSlideAlvo(null)} className="text-[#E8740E] hover:underline">cancelar</button></>
                    }
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-64 overflow-y-auto pr-1">
                    {galeria.map((img, i) => (
                      <button
                        key={i}
                        disabled={slideAlvo === null}
                        onClick={() => { if (slideAlvo !== null) { atribuirImagem(slideAlvo, img.url); setSlideAlvo(null); } }}
                        title={`${img.source} · ${img.sourceUrl}`}
                        className={`relative aspect-square rounded-lg overflow-hidden border-2 ${
                          slideAlvo !== null ? "border-[#E8740E]/30 hover:border-[#E8740E] cursor-pointer" : "border-[#E8E8ED] cursor-default"
                        } bg-[#F5F5F7]`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt={img.source} className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate">
                          {img.source}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Cards de edição de slide */}
          <div className="grid gap-3 mb-6">
            {slidesEdit.map((slide, idx) => (
              <div key={idx} className={`bg-white border rounded-2xl p-4 ${slideAlvo === idx ? "border-[#E8740E] ring-2 ring-[#E8740E]/20" : "border-[#D2D2D7]"}`}>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs px-2 py-1 rounded bg-[#1D1D1F] text-white font-mono">{idx + 1}</span>
                  <span className="text-xs text-[#86868B]">
                    {idx === 0 ? "Capa" : idx === slidesEdit.length - 1 ? "CTA" : "Slide"}
                  </span>
                  {slide.destaque && (
                    <span className="text-xs px-2 py-1 rounded bg-[#FFF5EB] text-[#E8740E] font-bold">
                      💥 {slide.destaque}
                    </span>
                  )}
                  {podeEditar && (
                    <div className="ml-auto flex items-center gap-2">
                      <button
                        onClick={() => setSlideAlvo(slideAlvo === idx ? null : idx)}
                        disabled={galeria.length === 0}
                        title={galeria.length === 0 ? "Busque imagens primeiro" : "Atribuir imagem da galeria"}
                        className={`text-xs px-2 py-1 rounded ${
                          slideAlvo === idx
                            ? "bg-[#E8740E] text-white"
                            : "bg-[#F5F5F7] text-[#6E6E73] hover:bg-[#E8E8ED]"
                        } disabled:opacity-40`}
                      >
                        🖼️ Galeria
                      </button>
                      <button
                        onClick={() => uploadRefs.current[idx]?.click()}
                        disabled={uploadingSlide === idx}
                        className="text-xs px-2 py-1 rounded bg-[#F5F5F7] text-[#6E6E73] hover:bg-[#E8E8ED] disabled:opacity-40"
                      >
                        {uploadingSlide === idx ? "Enviando..." : "📤 Upload"}
                      </button>
                      <input
                        ref={el => { uploadRefs.current[idx] = el; }}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0];
                          if (f) uploadImagemSlide(idx, f);
                          e.target.value = "";
                        }}
                      />
                      {slide.imagem_url && (
                        <button
                          onClick={() => atribuirImagem(idx, null)}
                          title="Remover imagem"
                          className="text-xs px-2 py-1 rounded bg-[#FFF0F0] text-[#E74C3C] hover:bg-[#FFE0E0]"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {slide.imagem_url && (
                  <div className="mb-3 rounded-lg overflow-hidden border border-[#E8E8ED] bg-[#F5F5F7]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={slide.imagem_url} alt="" className="w-full max-h-48 object-contain" />
                  </div>
                )}
                <input
                  value={slide.titulo}
                  onChange={e => atualizarSlide(idx, "titulo", e.target.value)}
                  disabled={!podeEditar}
                  placeholder="Título"
                  className="w-full mb-2 px-3 py-2 rounded-lg border border-[#E8E8ED] text-base font-semibold focus:outline-none focus:border-[#E8740E]"
                />
                <textarea
                  value={slide.texto}
                  onChange={e => atualizarSlide(idx, "texto", e.target.value)}
                  disabled={!podeEditar}
                  placeholder="Texto"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-[#E8E8ED] text-sm focus:outline-none focus:border-[#E8740E]"
                />
                <div className="text-xs text-[#86868B] mt-1 flex gap-4 flex-wrap">
                  <span>Título: {slide.titulo.length} chars</span>
                  <span>Texto: {slide.texto.length} chars</span>
                  {slide.imagem_url && <span className="text-[#2ECC71]">✓ Imagem</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Render final */}
          {podeEditar && (
            <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 mb-6">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#1D1D1F]">Renderizar PNGs</h3>
                  <p className="text-xs text-[#86868B] mt-1">
                    Gera os {slidesEdit.length} slides em 1080×1350 (ratio 4:5). Salva edição antes.
                  </p>
                </div>
                <button
                  onClick={renderizar}
                  disabled={renderizando || salvando}
                  className="px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] disabled:opacity-50"
                >
                  {renderizando ? "⏳ Renderizando..." : temImagensRenderizadas ? "🔄 Re-renderizar" : "🎨 Renderizar slides"}
                </button>
              </div>
              {temImagensRenderizadas && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
                  {post.imagens_urls!.map((url, i) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="block relative aspect-[4/5] rounded-lg overflow-hidden border border-[#E8E8ED] bg-[#F5F5F7] hover:border-[#E8740E] transition-colors">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                      <span className="absolute top-2 left-2 text-[10px] font-mono bg-black/60 text-white px-1.5 py-0.5 rounded">{i + 1}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Legenda + hashtags */}
          <div className="bg-white border border-[#D2D2D7] rounded-2xl p-4 mb-6">
            <h3 className="text-sm font-semibold text-[#1D1D1F] mb-3">Legenda</h3>
            <textarea
              value={legendaEdit}
              onChange={e => setLegendaEdit(e.target.value)}
              disabled={!podeEditar}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-[#E8E8ED] text-sm mb-3 focus:outline-none focus:border-[#E8740E]"
            />
            <h3 className="text-sm font-semibold text-[#1D1D1F] mb-2">Hashtags</h3>
            <input
              value={hashtagsEdit}
              onChange={e => setHashtagsEdit(e.target.value)}
              disabled={!podeEditar}
              placeholder="separadas por espaço"
              className="w-full px-3 py-2 rounded-lg border border-[#E8E8ED] text-sm focus:outline-none focus:border-[#E8740E]"
            />
            <div className="text-xs text-[#86868B] mt-2">
              {hashtagsEdit.split(/\s+/).filter(Boolean).length} hashtags
            </div>
          </div>

          {/* Fact-check */}
          {post.pesquisa_json && (
            <details className="bg-[#F5F5F7] border border-[#E8E8ED] rounded-2xl p-4 mb-6">
              <summary className="cursor-pointer text-sm font-semibold text-[#1D1D1F]">
                🔍 Pesquisa e fact-check
              </summary>
              <div className="mt-3 space-y-3">
                {post.pesquisa_json.fatos_verificados && post.pesquisa_json.fatos_verificados.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-[#6E6E73] mb-2">Fatos verificados</h4>
                    <ul className="text-sm text-[#1D1D1F] space-y-1 list-disc list-inside">
                      {post.pesquisa_json.fatos_verificados.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {post.pesquisa_json.fontes && post.pesquisa_json.fontes.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-[#6E6E73] mb-2">Fontes consultadas</h4>
                    <ul className="text-sm space-y-1">
                      {post.pesquisa_json.fontes.map((url, i) => (
                        <li key={i}>
                          <a href={url} target="_blank" rel="noreferrer" className="text-[#E8740E] hover:underline break-all">
                            {url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          )}
        </>
      )}

      <div className="text-xs text-[#86868B] text-center py-4">
        Após aprovar: próximo PR adiciona agendamento + postagem automática.
      </div>
    </div>
  );
}
