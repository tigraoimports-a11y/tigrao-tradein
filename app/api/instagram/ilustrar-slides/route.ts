import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { composicaoJSX, COMPOSICAO_W, COMPOSICAO_H } from "@/lib/instagram/composicao-layout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const BUCKET = "instagram-assets";

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
  composicao?: string[] | null;
  motivo: string;
}

const SYSTEM_PROMPT = `Você é editor visual do Instagram da @tigraoimports, loja Apple no Rio de Janeiro.

TAREFA
Pra cada slide do carrossel (exceto CTA), ache a MELHOR imagem que ilustre o conceito do texto via web_search. Todo slide de conteúdo PRECISA sair com imagem. Depois chame a ferramenta 'definir_imagens' UMA VEZ com as atribuições.

REGRAS
1. Busca orientada ao CONCEITO do slide, não só ao produto.
   - Slide "Command é o novo Ctrl" → imagem de teclado Mac mostrando tecla ⌘.
   - Slide "Configure Time Machine" → screenshot/foto de Time Machine em Mac.
   - Slide "Câmera iPhone 17 Pro" → foto do módulo de câmera traseira do iPhone 17 Pro.

2. COMPARATIVO entre 2 ou 3 modelos — use COMPOSIÇÃO:
   Se o texto do slide cita N modelos específicos (ex: "iPad 11, Air M4 ou Pro M5"), em vez de buscar uma imagem com todos juntos (raro ter boa), faça N buscas individuais — UMA foto oficial de cada modelo — e retorne no campo \`composicao: [url1, url2, url3]\`. O backend vai compor as N imagens lado a lado automaticamente.
   - Ideal: fotos de produto em fundo BRANCO (ex: apple.com/br/ipad, product photos).
   - Todas em mesma "perspectiva" se possível (ex: todas frontais, todas com ângulo).
   - Máximo 3 URLs em composição.

3. Priorize fontes:
   - apple.com/br, apple.com, newsroom Apple pra produtos específicos.
   - 9to5Mac, MacRumors, The Verge, Tecnoblog, TechTudo pra reviews.
   - Wikipedia commons pra imagens com licença aberta.

4. NÃO use:
   - Ícones pequenos, sprites, logos.
   - Sites de afiliado/cupom.
   - Screenshots de slide/apresentação (meta).
   - Imagem que já apareceu em outro slide (nunca repita).

5. Formato da URL:
   - Prefira URL DIRETA de imagem (.jpg/.png/.webp).
   - Se só tiver URL de página, passe em \`page_url\` — backend extrai og:image.
   - Pra composição, use \`composicao\` (array de 2-3 URLs diretas ou de página).

6. INSISTA até achar. Se a 1ª busca não trouxer nada, reformule o query (mais específico OU mais genérico). Cada slide tem que sair com imagem — use null SÓ no CTA (último slide). Se travou mesmo após 2 buscas, use imagem ilustrativa do produto da linha (ex: foto genérica de um MacBook em vez de nada).

7. Use título + texto do slide pra montar o query. Não seja genérico.

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
              image_url: { type: "string", description: "URL direta da imagem (.jpg/.png/.webp). Use para slide com 1 produto/conceito." },
              page_url: { type: "string", description: "URL da página web. Backend extrai og:image dela." },
              composicao: {
                type: "array",
                items: { type: "string" },
                description: "Array de 2-3 URLs (diretas ou de página) pra comparativo multi-produto. Backend compõe as N imagens lado a lado automaticamente. Use EM VEZ de image_url quando o slide compara modelos.",
              },
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
  max_uses: 25,
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

// Baixa a imagem e retorna como data URL (base64) — Satori nao faz fetch
// externo confiavel em runtime serverless; embutir evita timeout/CORS.
async function baixarComoDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 2000 || buf.byteLength > 5_000_000) return null;
    const base64 = Buffer.from(buf).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

// Compoe 2-3 imagens lado a lado em um PNG 1080x540, sobe no Storage
// e retorna URL publica. Retorna null se nao conseguir compor 2+ validas.
async function comporImagens(
  urls: string[],
  postId: string,
  slideIndex: number,
  supabase: ReturnType<typeof getSupabase>
): Promise<string | null> {
  // Claude pode mandar URL direta de imagem OU URL de pagina.
  // Pra cada, tenta resolver (se for pagina, extrai og:image).
  const urlsResolvidas = await Promise.all(
    urls.map(async (u) => {
      if (/\.(jpe?g|png|webp)(\?|$)/i.test(u) && ehImagemValida(u)) return u;
      return resolverImagem(null, u);
    })
  );
  const urlsFinais = urlsResolvidas.filter((u): u is string => !!u);
  if (urlsFinais.length < 2) return null;

  const dataUrls = await Promise.all(urlsFinais.map(baixarComoDataUrl));
  const validos = dataUrls.filter((d): d is string => !!d);
  if (validos.length < 2) return null;

  try {
    const img = new ImageResponse(composicaoJSX(validos.slice(0, 3)), {
      width: COMPOSICAO_W,
      height: COMPOSICAO_H,
    });
    const pngBuffer = Buffer.from(await img.arrayBuffer());
    const path = `composto/${postId}/${Date.now()}-${slideIndex}.png`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, pngBuffer, { contentType: "image/png", upsert: true });
    if (upErr) return null;
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return pub.publicUrl;
  } catch {
    return null;
  }
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
  // Se tem `composicao`, compoe as N imagens em uma so via Satori e sobe.
  const resolvidas = await Promise.all(
    atribuicoes.map(async (a) => {
      const composicaoValida = Array.isArray(a.composicao) && a.composicao.filter((u) => typeof u === "string" && u.length > 0).length >= 2;
      const imagem_final = composicaoValida
        ? (await comporImagens(a.composicao!, postId, a.slide_index, supabase)) || (await resolverImagem(a.image_url, a.page_url))
        : await resolverImagem(a.image_url, a.page_url);
      return {
        slide_index: a.slide_index,
        imagem_final,
        motivo: a.motivo,
        composto: !!(composicaoValida && imagem_final && imagem_final.includes("/composto/")),
      };
    })
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
