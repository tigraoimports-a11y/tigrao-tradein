"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminShell";

interface Slide {
  titulo: string;
  texto: string;
  destaque?: string;
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
  erro: string | null;
  criado_por: string | null;
  created_at: string;
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

  const salvarEdicao = async (novoStatus?: Post["status"]) => {
    setSalvando(true);
    setMsg("");
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
        setMsg("Erro: " + (j.error || "falha ao salvar"));
        return;
      }
      setMsg(novoStatus === "APROVADO" ? "Aprovado!" : "Salvo.");
      fetchPost();
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
              <div className="flex gap-2">
                <button
                  onClick={gerar}
                  disabled={gerando}
                  className="px-3 py-1.5 rounded-xl border border-[#D2D2D7] text-xs text-[#6E6E73] hover:bg-[#F5F5F7] disabled:opacity-50"
                >
                  {gerando ? "Gerando..." : "🔄 Re-gerar"}
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

          <div className="grid gap-3 mb-6">
            {slidesEdit.map((slide, idx) => (
              <div key={idx} className="bg-white border border-[#D2D2D7] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs px-2 py-1 rounded bg-[#1D1D1F] text-white font-mono">{idx + 1}</span>
                  <span className="text-xs text-[#86868B]">
                    {idx === 0 ? "Capa" : idx === slidesEdit.length - 1 ? "CTA" : "Slide"}
                  </span>
                  {slide.destaque && (
                    <span className="text-xs px-2 py-1 rounded bg-[#FFF5EB] text-[#E8740E] font-bold">
                      💥 {slide.destaque}
                    </span>
                  )}
                </div>
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
                <div className="text-xs text-[#86868B] mt-1 flex gap-4">
                  <span>Título: {slide.titulo.length} chars</span>
                  <span>Texto: {slide.texto.length} chars</span>
                </div>
              </div>
            ))}
          </div>

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
        Após aprovar: próximo PR adiciona renderização de imagem + postagem automática.
      </div>
    </div>
  );
}
