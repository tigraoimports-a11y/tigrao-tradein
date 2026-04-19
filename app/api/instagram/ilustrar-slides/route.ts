import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface SlideData {
  titulo: string;
  texto: string;
  destaque?: string;
  imagem_url?: string | null;
}

interface AtribuicaoClaude {
  slide_index: number;
  image_url?: string | null;
  page_url?: string | null;
  motivo: string;
}

const SYSTEM_PROMPT = `Você é editor visual do Instagram da @tigraoimports, loja Apple no Rio de Janeiro.

TAREFA
Pra cada slide do carrossel, use web_search pra achar a MELHOR imagem que ilustre o conceito do texto. Depois chame a ferramenta 'definir_imagens' uma única vez com as atribuições de todos os slides.

REGRAS
1. Busca orientada ao CONCEITO do slide, não só ao produto.
   - Slide "Command é o novo Ctrl" → buscar imagem de teclado Mac mostrando tecla ⌘, atalho ⌘+C em uso, etc.
   - Slide "Configure Time Machine" → buscar screenshot/foto de Time Machine em Mac, backup para HD externo.
   - Slide "Câmera iPhone 17 Pro" → buscar foto do módulo de câmera traseira do iPhone 17 Pro.

2. Priorize:
   - Páginas oficiais Apple (apple.com/br, newsroom) pra produtos específicos.
   - 9to5Mac, MacRumors, The Verge, Tecnoblog, TechTudo pra reviews / imagens conceituais.
   - Wikipedia, blogs tech confiáveis pra imagens com licença aberta.

3. NÃO use:
   - Ícones pequenos, sprites, logos.
   - Imagens de site de afiliado/cupom.
   - Screenshots de apresentação/slide (meta).
   - Foto que aparece em 2 slides (nunca repita).

4. Formato da URL:
   - Prefira URL DIRETA de imagem (.jpg/.png/.webp) quando conseguir.
   - Se só tiver URL de página, passe em \`page_url\` — eu extraio o og:image no backend.
   - Se não encontrar imagem decente depois de 2 buscas, use null com motivo claro.

5. Faça buscas específicas. Use o título + texto do slide pra montar o query, não termos genéricos.

6. Slide CTA (último) normalmente não precisa imagem. Marque null.

SAÍDA
Só chame 'definir_imagens'. Não escreva texto narrativo.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "definir_imagens",
    description: "Retorna o mapping final de slide → imagem. Chame UMA vez com todos os slides.",
    input_schema: {
      type: "object" as const,
      properties: {
        atribuicoes: {
          type: "array",
          description: "Uma atribuição por slide (na ordem 0..N-1).",
          items: {
            type: "object",
            properties: {
              slide_index: { type: "integer", description: "Índice do slide (0-based)." },
              image_url: { type: "string", description: "URL direta da imagem (.jpg/.png/.webp). Opcional — use page_url se só tiver link de página." },
              page_url: { type: "string", description: "URL da página web. O backend extrai og:image dela." },
              motivo: { type: "string", description: "Linha curta explicando a escolha." },
            },
            required: ["slide_index", "motivo"],
          },
        },
      },
      required: ["atribuicoes"],
    },
  },
];

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 15,
} as unknown as Anthropic.Tool;

function buildUserMessage(
  slides: SlideData[],
  tema: string,
  tipo: string,
  slideAlvo?: number
): string {
  const slidesTxt = slides
    .map((s, i) => {
      if (slideAlvo !== undefined && i !== slideAlvo) return null;
      const tag = i === 0 ? "CAPA" : i === slides.length - 1 ? "CTA" : `SLIDE ${i + 1}`;
      const dest = s.destaque ? ` [destaque: "${s.destaque}"]` : "";
      return `${i}. ${tag}${dest}\n   Título: ${s.titulo}\n   Texto: ${s.texto}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const contexto = slideAlvo !== undefined
    ? `Re-ilustre APENAS o slide ${slideAlvo}. Ignore os outros.`
    : `Ilustre todos os ${slides.length} slides. Faça 1-2 web_searches por slide (max_uses=15 total).`;

  return `Tema do post: "${tema}" (tipo: ${tipo})

${contexto}

SLIDES:
${slidesTxt}

Busque a melhor imagem pra cada slide e chame 'definir_imagens' no final.`;
}

async function extrairOgImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    const og = html.match(
      /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i
    )?.[1];
    if (og) return new URL(og, pageUrl).toString();
    const tw = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i)?.[1];
    if (tw) return new URL(tw, pageUrl).toString();
    return null;
  } catch {
    return null;
  }
}

function ehImagemValida(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/\/favicon/i.test(url)) return false;
  if (/\/logo(-|_|\.)/i.test(url)) return false;
  if (/sprite/i.test(url)) return false;
  if (/\/(icons?|glyph)\//i.test(url)) return false;
  if (/knowledge_graph/i.test(url)) return false;
  if (/help\.apple\.com\/assets/i.test(url)) return false;
  return true;
}

async function resolverImagem(
  image_url?: string | null,
  page_url?: string | null
): Promise<string | null> {
  if (image_url && ehImagemValida(image_url)) return image_url;
  if (page_url) {
    const og = await extrairOgImage(page_url);
    if (og && ehImagemValida(og)) return og;
  }
  return null;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { postId, slideIndex } = body || {};
  if (!postId) return NextResponse.json({ error: "postId obrigatório" }, { status: 400 });

  const supabase = getSupabase();
  const { data: post, error: postErr } = await supabase
    .from("instagram_posts")
    .select("*")
    .eq("id", postId)
    .single();
  if (postErr || !post) {
    return NextResponse.json({ error: postErr?.message || "post não encontrado" }, { status: 404 });
  }

  const slides: SlideData[] = Array.isArray(post.slides_json) ? post.slides_json : [];
  if (slides.length === 0) {
    return NextResponse.json({ error: "post sem slides" }, { status: 400 });
  }
  if (slideIndex !== undefined && (slideIndex < 0 || slideIndex >= slides.length)) {
    return NextResponse.json({ error: "slideIndex fora do range" }, { status: 400 });
  }

  const userMsg = buildUserMessage(slides, post.tema, post.tipo, slideIndex);

  let atribuicoes: AtribuicaoClaude[] = [];
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 6000,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, ...TOOLS],
      messages: [{ role: "user", content: userMsg }],
    });
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "definir_imagens"
    );
    if (!toolUse) {
      return NextResponse.json(
        { error: "Claude não chamou 'definir_imagens'. Tente novamente." },
        { status: 500 }
      );
    }
    const input = toolUse.input as { atribuicoes: AtribuicaoClaude[] };
    atribuicoes = input.atribuicoes || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Falha na chamada ao Claude: " + msg }, { status: 500 });
  }

  // Resolve cada atribuição → URL final de imagem.
  const resolvidas = await Promise.all(
    atribuicoes.map(async (a) => ({
      slide_index: a.slide_index,
      imagem_final: await resolverImagem(a.image_url, a.page_url),
      motivo: a.motivo,
    }))
  );

  // Aplica: se slideIndex foi especificado, só mexe naquele slide.
  const slidesNovos = slides.map((s, i) => {
    if (slideIndex !== undefined && i !== slideIndex) return s;
    const r = resolvidas.find((x) => x.slide_index === i);
    if (!r) return s;
    return { ...s, imagem_url: r.imagem_final };
  });

  const { error: updErr } = await supabase
    .from("instagram_posts")
    .update({ slides_json: slidesNovos, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    slides: slidesNovos,
    atribuicoes: resolvidas,
  });
}
