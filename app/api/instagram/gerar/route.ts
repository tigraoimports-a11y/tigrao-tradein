import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TIPO_GUIA: Record<string, string> = {
  DICA: "dica prática pra dono de iPhone/Mac/Apple Watch (ex: '5 ajustes pra economizar bateria'). Foco em utilidade imediata.",
  COMPARATIVO: "comparativo entre modelos ou features (ex: 'iPhone 15 vs 16 — vale a pena trocar?'). Traga números concretos (chip, bateria, tela) e veredito honesto.",
  NOTICIA: "novidade, lançamento ou rumor do ecossistema Apple. Data, fonte e o que muda na prática pro consumidor.",
};

function buildSystemPrompt(tipo: string, numeroSlides: number): string {
  return `Você é o editor de conteúdo do Instagram da @tigraoimports, loja de eletrônicos Apple no Rio de Janeiro. Nicho: iPhone, Mac, Apple Watch, AirPods — novos, seminovos e trade-in.

TAREFA
Criar um carrossel de ${numeroSlides} slides sobre o tema solicitado. Tipo: ${tipo} — ${TIPO_GUIA[tipo] || ""}.

TOM DE VOZ (misto descontraído + técnico + formal)
- Descontraído sem ser coloquial demais. Nada de "mano", "brother", "tá ligado". Nada de "ademais", "outrossim", "cumpre ressaltar".
- Técnico quando ajuda: pode falar "chip A17 Pro", "ProMotion 120Hz", "USB-C 2.0", "câmera de 48MP" sem explicar se for óbvio. Se for detalhe menos conhecido, explica em 1 linha.
- Formal no sentido de correção gramatical e precisão. Nunca clickbait ("você não vai acreditar", "descubra agora").
- Português brasileiro. Você pode usar "você" / "seu".

ESTRUTURA DO CARROSSEL
- Slide 1 (capa): título curto e impactante (máx 50 caracteres) + uma linha de chamada (máx 80 caracteres). Sem emoji na capa.
- Slides do meio: 1 ideia central por slide. Título curto (máx 40 caracteres) + texto corrido (máx 220 caracteres).
- Último slide: CTA suave. Ex: "Salva pra consultar depois", "Comenta sua dúvida", "Compartilha com quem vai comprar iPhone".
- Campo 'destaque' (opcional): 1 número/dado que merece virar tipografia grande no slide. Ex: "48MP", "30%", "R$ 6.999". Só usa se for realmente impactante.

REGRA DE OURO — FACT-CHECK
1. Use web_search pra pesquisar o tema. Mínimo 2 buscas com ângulos diferentes.
2. Para CADA fato que for parar no carrossel (número, data, specs, preço, nome de chip, etc), confirme em pelo menos 2 fontes independentes.
3. Se um fato relevante não pôde ser confirmado em 2+ fontes, NÃO coloque no post. Prefira silêncio a erro.
4. Preços em reais: só inclua se for preço oficial Apple Brasil. Nunca invente.
5. Data de lançamento: só inclua se for confirmada (Apple Newsroom, site oficial ou 2 veículos grandes).

LEGENDA
- 2-4 frases. Começa com um gancho (pergunta, observação ou contraste). Termina com um CTA coerente com o último slide.
- Hashtags separadas no campo próprio. Retorne 10-15 hashtags em português/inglês relevantes ao nicho Apple + loja (ex: iphone, apple, rio, tradein, tigraoimports). Sem '#' — o sistema adiciona.

SAÍDA
Quando tiver a pesquisa completa e o conteúdo pronto, chame a ferramenta 'salvar_post' UMA vez com o JSON final. Não escreva texto narrativo — só a chamada da ferramenta.`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "salvar_post",
    description: "Salva o post finalizado após pesquisa e verificação de fatos. Chame UMA única vez quando tiver tudo pronto.",
    input_schema: {
      type: "object" as const,
      properties: {
        slides: {
          type: "array",
          description: "Array ordenado de slides do carrossel (capa no índice 0, CTA no último).",
          items: {
            type: "object",
            properties: {
              titulo: { type: "string", description: "Título do slide. Capa: máx 50 caracteres; outros: máx 40." },
              texto: { type: "string", description: "Corpo do slide. Capa: máx 80 caracteres; outros: máx 220." },
              destaque: { type: "string", description: "Opcional. Número/dado curto que vira tipografia grande. Ex: '48MP', 'R$ 6.999'." },
            },
            required: ["titulo", "texto"],
          },
        },
        legenda: { type: "string", description: "Legenda do post (2-4 frases, com CTA no final). Sem hashtags." },
        hashtags: {
          type: "array",
          items: { type: "string" },
          description: "10-15 hashtags sem '#'. Ex: ['iphone', 'apple', 'rio'].",
        },
        fontes: {
          type: "array",
          items: { type: "string" },
          description: "URLs das fontes consultadas no fact-check.",
        },
        fatos_verificados: {
          type: "array",
          items: { type: "string" },
          description: "Lista dos principais fatos que foram confirmados em 2+ fontes (um por linha).",
        },
      },
      required: ["slides", "legenda", "hashtags", "fontes", "fatos_verificados"],
    },
  },
];

// Server-side web_search tool do Anthropic
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
} as unknown as Anthropic.Tool;

interface SlideOutput {
  titulo: string;
  texto: string;
  destaque?: string;
}

interface PostOutput {
  slides: SlideOutput[];
  legenda: string;
  hashtags: string[];
  fontes: string[];
  fatos_verificados: string[];
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabase();
  try {
    const body = await req.json();
    const { postId } = body;
    if (!postId) return NextResponse.json({ error: "postId obrigatório" }, { status: 400 });

    const { data: post, error: fetchErr } = await supabase
      .from("instagram_posts")
      .select("*")
      .eq("id", postId)
      .single();
    if (fetchErr || !post) {
      return NextResponse.json({ error: fetchErr?.message || "post não encontrado" }, { status: 404 });
    }

    await supabase.from("instagram_posts").update({ status: "GERANDO", erro: null, updated_at: new Date().toISOString() }).eq("id", postId);

    const systemPrompt = buildSystemPrompt(post.tipo, post.numero_slides);
    const userPrompt = `Tema do post: "${post.tema}"\n\nPesquise, verifique os fatos e monte o carrossel. Chame salvar_post no final.`;

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

    const MAX_ITER = 12;
    let iter = 0;
    let resultado: PostOutput | null = null;

    let response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 6000,
      system: systemPrompt,
      tools: [WEB_SEARCH_TOOL, ...TOOLS],
      messages,
    });

    while (response.stop_reason === "tool_use" && iter < MAX_ITER && !resultado) {
      iter++;
      const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (tu.name === "salvar_post") {
          resultado = tu.input as unknown as PostOutput;
          toolResults.push({
            type: "tool_result",
            tool_use_id: tu.id,
            content: "Post salvo. Não chame mais nenhuma ferramenta.",
          });
        }
        // web_search é server-side: respostas vêm automaticamente no próximo turno, não precisa responder aqui.
      }

      if (resultado) break;

      // Se não houve salvar_post, deixa o loop continuar — web_search já foi processado pelo servidor.
      // Mas se não há tool_results (só web_search), o loop para — Claude vai voltar com texto ou outra tool_use.
      messages.push({ role: "assistant", content: response.content });
      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }

      response = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 6000,
        system: systemPrompt,
        tools: [WEB_SEARCH_TOOL, ...TOOLS],
        messages,
      });
    }

    if (!resultado) {
      const msg = "Claude não chamou salvar_post após " + iter + " iterações";
      await supabase.from("instagram_posts").update({ status: "ERRO", erro: msg, updated_at: new Date().toISOString() }).eq("id", postId);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const { error: updErr } = await supabase.from("instagram_posts").update({
      status: "GERADO",
      slides_json: resultado.slides,
      legenda: resultado.legenda,
      hashtags: resultado.hashtags,
      pesquisa_json: {
        fontes: resultado.fontes,
        fatos_verificados: resultado.fatos_verificados,
      },
      erro: null,
      updated_at: new Date().toISOString(),
    }).eq("id", postId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    const { data: atualizado } = await supabase.from("instagram_posts").select("*").eq("id", postId).single();
    return NextResponse.json({ ok: true, data: atualizado });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[instagram/gerar]", msg);
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.postId) {
        await supabase.from("instagram_posts").update({ status: "ERRO", erro: msg, updated_at: new Date().toISOString() }).eq("id", body.postId);
      }
    } catch { /* noop */ }
    return NextResponse.json({ error: "Erro ao gerar post", detalhe: msg }, { status: 500 });
  }
}
