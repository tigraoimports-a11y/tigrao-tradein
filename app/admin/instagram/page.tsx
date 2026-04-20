"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdmin } from "@/components/admin/AdminShell";

type Tipo = "DICA" | "COMPARATIVO" | "NOTICIA" | "ANALISE_PROFUNDA";
type Estilo = "PADRAO" | "EMANUEL_PESSOA";

interface Post {
  id: string;
  tema: string;
  tipo: Tipo;
  estilo: Estilo;
  numero_slides: number;
  status: "RASCUNHO" | "GERANDO" | "GERADO" | "APROVADO" | "AGENDADO" | "POSTADO" | "ERRO";
  erro: string | null;
  criado_por: string | null;
  created_at: string;
  agendado_para: string | null;
  postado_em: string | null;
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
  ANALISE_PROFUNDA: "🔍 Análise profunda",
};

const ESTILO_LABEL: Record<Post["estilo"], string> = {
  PADRAO: "Padrão Tigrão",
  EMANUEL_PESSOA: "Emanuel Pessoa",
};

export default function InstagramListPage() {
  const { password, apiHeaders } = useAdmin();
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"TODOS" | Post["status"]>("TODOS");
  const [novoOpen, setNovoOpen] = useState(false);
  const [form, setForm] = useState({ tema: "", tipo: "DICA" as Post["tipo"], estilo: "PADRAO" as Post["estilo"], numero_slides: 7 });
  const [saving, setSaving] = useState(false);
  const [refinando, setRefinando] = useState(false);
  const [motivoRefino, setMotivoRefino] = useState("");
  const [msg, setMsg] = useState("");

  const fetchPosts = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/instagram-posts", { headers: apiHeaders() });
      if (res.ok) {
        const j = await res.json();
        setPosts(j.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [password, apiHeaders]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const criar = async () => {
    if (!form.tema.trim()) {
      setMsg("Preencha o tema");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/instagram-posts", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(form),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setMsg("Erro: " + (j.error || "falha ao criar"));
        return;
      }
      router.push(`/admin/instagram/${j.data.id}`);
    } finally {
      setSaving(false);
    }
  };

  const refinarTema = async () => {
    if (!form.tema.trim()) {
      setMsg("Escreve uma ideia (pode ser curta) antes de refinar.");
      return;
    }
    setRefinando(true);
    setMsg("");
    setMotivoRefino("");
    try {
      const res = await fetch("/api/instagram/refinar-tema", {
        method: "POST",
        headers: apiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ideia: form.tema }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setMsg("Erro ao refinar: " + (j.error || "falha"));
        return;
      }
      setForm(prev => ({ ...prev, tema: j.tema, tipo: j.tipo, numero_slides: j.numero_slides }));
      setMotivoRefino(j.motivo || "");
    } finally {
      setRefinando(false);
    }
  };

  const remover = async (id: string, tema: string) => {
    if (!confirm(`Remover o post "${tema}"?`)) return;
    await fetch(`/api/admin/instagram-posts?id=${id}`, { method: "DELETE", headers: apiHeaders() });
    fetchPosts();
  };

  const filtrados = filtro === "TODOS" ? posts : posts.filter(p => p.status === filtro);
  const contagem: Record<string, number> = {
    TODOS: posts.length,
    RASCUNHO: posts.filter(p => p.status === "RASCUNHO").length,
    GERADO: posts.filter(p => p.status === "GERADO").length,
    APROVADO: posts.filter(p => p.status === "APROVADO").length,
    AGENDADO: posts.filter(p => p.status === "AGENDADO").length,
    POSTADO: posts.filter(p => p.status === "POSTADO").length,
    ERRO: posts.filter(p => p.status === "ERRO").length,
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1D1D1F]">📸 Instagram</h1>
          <p className="text-sm text-[#86868B] mt-1">Posts automatizados em carrossel com pesquisa + fact-check</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/instagram/configuracoes"
            className="px-4 py-2 rounded-xl border border-[#D2D2D7] text-sm text-[#6E6E73] hover:bg-[#F5F5F7] transition-colors"
          >
            ⚙️ Configurações
          </Link>
          <button
            onClick={() => setNovoOpen(true)}
            className="px-4 py-2 rounded-xl bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] transition-colors"
          >
            + Novo post
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["TODOS", "RASCUNHO", "GERADO", "APROVADO", "AGENDADO", "POSTADO", "ERRO"] as const).map(s => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
              filtro === s
                ? "bg-[#FFF5EB] text-[#E8740E] border-[#E8740E]/30"
                : "bg-white text-[#6E6E73] border-[#D2D2D7] hover:bg-[#F5F5F7]"
            }`}
          >
            {s === "TODOS" ? "Todos" : STATUS_LABEL[s as Post["status"]]} <span className="opacity-60">({contagem[s] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Modal novo post */}
      {novoOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setNovoOpen(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 text-[#1D1D1F]">Novo post</h2>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-[#6E6E73]">Tema</label>
                  <button
                    type="button"
                    onClick={refinarTema}
                    disabled={refinando || !form.tema.trim()}
                    className="text-xs px-2 py-1 rounded bg-[#E8740E] text-white font-semibold hover:bg-[#F5A623] disabled:opacity-40"
                    title="IA expande sua ideia curta pra tema completo + sugere tipo e nº de slides"
                  >
                    {refinando ? "Refinando..." : "✨ Refinar com IA"}
                  </button>
                </div>
                <textarea
                  value={form.tema}
                  onChange={e => { setForm({ ...form, tema: e.target.value }); if (motivoRefino) setMotivoRefino(""); }}
                  placeholder={
                    form.tipo === "COMPARATIVO"
                      ? 'ex: "iPhone 17 vs 17 Pro — vale pagar mais pelo Pro?" ou só "comparativo iPad" + Refinar'
                      : form.tipo === "NOTICIA"
                      ? 'ex: "Lançamento do Apple Watch Ultra 3 — o que mudou?" ou só "watch novo" + Refinar'
                      : form.tipo === "ANALISE_PROFUNDA"
                      ? 'ex: "Por que o iPhone usado no Brasil virou item de luxo" ou só "análise preço Apple BR" + Refinar'
                      : 'ex: "5 dicas pra economizar bateria no iPhone 15" ou só "dica MacBook" + Refinar'
                  }
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                />
                {motivoRefino && (
                  <p className="text-xs text-[#2ECC71] mt-1">✨ IA: {motivoRefino}</p>
                )}
                {!motivoRefino && form.tipo === "COMPARATIVO" && (
                  <p className="text-xs text-[#86868B] mt-1">
                    Dica: comparativos cobrem câmera + tela + chip + bateria + design + preço + revenda.
                  </p>
                )}
                {!motivoRefino && form.tipo === "ANALISE_PROFUNDA" && (
                  <p className="text-xs text-[#86868B] mt-1">
                    Dica: análise profunda funciona melhor em 10-14 slides e com estilo &quot;Emanuel Pessoa&quot; (narrativa didática + negrito + foto real).
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-[#6E6E73] mb-1 block">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={e => {
                    const novoTipo = e.target.value as Post["tipo"];
                    setForm(prev => ({
                      ...prev,
                      tipo: novoTipo,
                      numero_slides: novoTipo === "ANALISE_PROFUNDA" && prev.numero_slides < 10 ? 12 : prev.numero_slides,
                      estilo: novoTipo === "ANALISE_PROFUNDA" ? "EMANUEL_PESSOA" : prev.estilo,
                    }));
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                >
                  <option value="DICA">💡 Dica prática</option>
                  <option value="COMPARATIVO">⚖️ Comparativo</option>
                  <option value="NOTICIA">📰 Notícia / lançamento</option>
                  <option value="ANALISE_PROFUNDA">🔍 Análise profunda</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-[#6E6E73] mb-1 block">Estilo de escrita + visual</label>
                <select
                  value={form.estilo}
                  onChange={e => setForm({ ...form, estilo: e.target.value as Post["estilo"] })}
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                >
                  <option value="PADRAO">Padrão Tigrão (descontraído + técnico, layout capa/meio/CTA)</option>
                  <option value="EMANUEL_PESSOA">Emanuel Pessoa (narrativa didática, negrito, foto real no rodapé)</option>
                </select>
                <p className="text-xs text-[#86868B] mt-1">
                  {form.estilo === "EMANUEL_PESSOA"
                    ? "Frases curtas, parágrafos separados, **negrito** em frases-chave, header tipo tweet + imagem real ocupando metade do slide."
                    : "Estilo original da loja com capa, slides de meio e CTA final."}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-[#6E6E73] mb-1 block">Nº de slides</label>
                <select
                  value={form.numero_slides}
                  onChange={e => setForm({ ...form, numero_slides: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-[#D2D2D7] text-sm focus:outline-none focus:border-[#E8740E]"
                >
                  {[5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(n => (
                    <option key={n} value={n}>{n} slides</option>
                  ))}
                </select>
              </div>
              {msg && <p className="text-sm text-[#E74C3C]">{msg}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => { setNovoOpen(false); setMsg(""); }}
                  className="flex-1 px-4 py-2 rounded-xl border border-[#D2D2D7] text-sm text-[#6E6E73] hover:bg-[#F5F5F7]"
                >
                  Cancelar
                </button>
                <button
                  onClick={criar}
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-xl bg-[#E8740E] text-white text-sm font-semibold hover:bg-[#F5A623] disabled:opacity-50"
                >
                  {saving ? "Criando..." : "Criar e gerar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[#86868B] text-sm">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="p-8 text-center text-[#86868B] text-sm">
            {filtro === "TODOS" ? "Nenhum post ainda. Clique em \"+ Novo post\" pra começar." : "Nenhum post nesse status."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-[#F5F5F7] text-[#6E6E73] text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Tipo</th>
                <th className="text-left px-4 py-3">Tema</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Criado</th>
                <th className="text-right px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id} className="border-t border-[#E8E8ED] hover:bg-[#FAFAFA]">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div>{TIPO_LABEL[p.tipo]}</div>
                    {p.estilo === "EMANUEL_PESSOA" && (
                      <div className="text-[10px] text-[#86868B] mt-0.5">{ESTILO_LABEL[p.estilo]}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/instagram/${p.id}`} className="text-[#E8740E] hover:underline">
                      {p.tema}
                    </Link>
                    {p.erro && <div className="text-xs text-[#E74C3C] mt-1 truncate max-w-md" title={p.erro}>{p.erro}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs">{STATUS_LABEL[p.status]}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-[#86868B]">
                    {new Date(p.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    {p.criado_por && <span className="ml-1">· {p.criado_por}</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link href={`/admin/instagram/${p.id}`} className="text-xs text-[#E8740E] hover:underline mr-3">Abrir</Link>
                    <button onClick={() => remover(p.id, p.tema)} className="text-xs text-[#E74C3C] hover:underline">Remover</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-6 p-4 rounded-xl bg-[#FFF5EB] border border-[#E8740E]/20 text-xs text-[#6E6E73]">
        <strong className="text-[#1D1D1F]">Fase 1 de 3:</strong> geração de texto com pesquisa + fact-check.
        Renderização de imagem e postagem automática vêm nos próximos PRs.
      </div>
    </div>
  );
}
