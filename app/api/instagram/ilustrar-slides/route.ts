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
Pra CADA slide do carrossel (incluindo capa, excluindo apenas o último slide de CTA), ache a MELHOR imagem que ilustre o conceito do texto via web_search. Depois chame a ferramenta 'definir_imagens' UMA VEZ com as atribuições.

REGRAS CRÍTICAS (⚠️ não quebre)
⚠️ COBERTURA TOTAL: nenhum slide pode ficar sem imagem, exceto o ÚLTIMO (CTA). Se o conceito é abstrato (ex: "Tela", "Conectividade", "Apple Intelligence"), busque foto CONCRETA que materialize o conceito (ex: close de tela iPad ligada, ícones Wi-Fi/USB-C num iPad, logo "Apple Intelligence" oficial). INSISTA com 2-3 buscas diferentes antes de desistir.

⚠️ NUNCA REPITA URL: a mesma imagem NÃO PODE aparecer em 2 slides. Antes de atribuir, cheque mentalmente a lista de URLs que você já usou nos slides anteriores. O backend vai deduplicar e ZERAR slides com URL repetida — então se você repetir, o operador vai ficar com slide vazio e precisar corrigir manual. Busque uma foto DIFERENTE pra cada slide.

⚠️ COERÊNCIA TEMÁTICA: a imagem DEVE refletir o texto do slide. Se o slide fala de "Veredito honesto", busque foto de balança, iPads enfileirados, ou comparação lado-a-lado — NÃO foto aleatória de revista, meme ou coisa não relacionada.

REGRAS GERAIS
1. Busca orientada ao CONCEITO do slide, não só ao produto.
   - Slide "Command é o novo Ctrl" → imagem de teclado Mac mostrando tecla ⌘.
   - Slide "Configure Time Machine" → screenshot/foto de Time Machine em Mac.
   - Slide "Câmera iPhone 17 Pro" → foto do módulo de câmera traseira do iPhone 17 Pro.
   - Slide "Tela OLED ProMotion" → close-up de tela iPad Pro mostrando cor vibrante.
   - Slide "Conectividade Wi-Fi 7" → iPad com indicador de rede, ou ícone Wi-Fi 7 oficial.
   - Slide "Tamanhos e peso" → iPads enfileirados por tamanho, ou foto comparativa de 11" vs 13".

2. COMPARATIVO entre 2 ou 3 modelos — use COMPOSIÇÃO:
   Se o texto do slide cita N modelos específicos (ex: "iPad 11, Air M4 ou Pro M5"), em vez de buscar uma imagem com todos juntos (raro ter boa), faça N buscas individuais — UMA foto oficial de cada modelo — e retorne no campo \`composicao: [url1, url2, url3]\`. O backend vai compor as N imagens lado a lado automaticamente.
   - Ideal: fotos de produto em fundo BRANCO (ex: apple.com/br/ipad, product photos).
   - Todas em mesma "perspectiva" se possível (ex: todas frontais, todas com ângulo).
   - Máximo 3 URLs em composição.
   - ⚠️ COMPOSIÇÕES TAMBÉM NÃO PODEM REPETIR: se 3 slides falam dos mesmos modelos, NÃO mande a mesma lista de URLs nos 3. Varie — ex: slide A usa foto frontal dos 3, slide B usa foto lateral, slide C usa detalhe de câmera. O backend detecta composições visualmente iguais (mesma lista de URLs ordenada) e ZERA as duplicatas.

3. Priorize fontes:
   - apple.com/br, apple.com, newsroom Apple pra produtos específicos.
   - 9to5Mac, MacRumors, The Verge, Tecnoblog, TechTudo pra reviews.
   - Wikipedia commons pra imagens com licença aberta.

4. NÃO use:
   - Ícones pequenos, sprites, logos de favicon.
   - Sites de afiliado/cupom.
   - Screenshots de slide/apresentação (meta).
   - Imagens de capa de revista ou trending TikTok (CORECORE, coisas do tipo — sem relação).
   - Imagem que já apareceu em outro slide (VER REGRA CRÍTICA acima).

REGRA ESPECIAL — ESTILO EMANUEL_PESSOA (análise profunda narrativa):
Quando o post é estilo EMANUEL_PESSOA, as imagens devem ser FOTOS REAIS que conectam emocional/contextualmente com o texto — NÃO apenas fotos de produto limpas.
Exemplos que funcionam:
- Slide sobre "preço de iPhone no Brasil" → foto de loja Apple em shopping lotada, filas, ou foto de consumidor segurando caixa de iPhone.
- Slide sobre "mercado de seminovos" → foto de loja de celulares, balcão com vários aparelhos.
- Slide sobre "cobrança de imposto" → foto de porto/contêiner, caminhão de importação, alfândega.
- Slide sobre "Zona Franca de Manaus" → foto real da ZFM, fábricas, operários.
- Slide com citação/fala de executivo → foto real do executivo (CEO Apple, ministro, analista) em situação pública.
Busque em: agências de notícia (Reuters, AFP, AP, G1, UOL, Folha), newsroom da Apple com executivos, imagens de redação, Wikipedia commons.
Evite: ícones vetoriais, mockups de celular em fundo branco pra posts Emanuel Pessoa — ficam sem alma.

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
  max_uses: 40,
} as unknown as Anthropic.Tool;

function buildUserMessage(
  slides: SlideData[],
  tema: string,
  tipo: string,
  estilo: string,
  slideAlvo?: number,
  alvosMultiplos?: number[],
  urlsProibidas?: string[]
): string {
  const alvosSet = slideAlvo !== undefined
    ? new Set([slideAlvo])
    : alvosMultiplos && alvosMultiplos.length > 0
      ? new Set(alvosMultiplos)
      : null;

  const slidesTxt = slides
    .map((s, i) => {
      if (alvosSet && !alvosSet.has(i)) return null;
      const tag = i === 0 ? "CAPA" : i === slides.length - 1 ? "CTA" : `SLIDE ${i + 1}`;
      const dest = s.destaque ? ` [destaque: "${s.destaque}"]` : "";
      return `${i}. ${tag}${dest}\n   Título: ${s.titulo}\n   Texto: ${s.texto}`;
    })
    .filter(Boolean)
    .join("\n\n");

  let contexto: string;
  if (slideAlvo !== undefined) {
    contexto = `Re-ilustre APENAS o slide ${slideAlvo}. Ignore os outros. IMPORTANTE: sua imagem não pode ser igual à de nenhum outro slide já existente.`;
  } else if (alvosMultiplos && alvosMultiplos.length > 0) {
    contexto = `⚠️ RETRY: esses slides ficaram SEM imagem na 1ª tentativa (URL inválida ou duplicada). Re-ilustre APENAS eles (${alvosMultiplos.length} slide${alvosMultiplos.length === 1 ? "" : "s"}). Busque imagens DIFERENTES das que já estão em uso nos outros slides.`;
  } else {
    contexto = `Ilustre TODOS os ${slides.length} slides (exceto o último CTA). Faça 2-3 web_searches por slide se necessário (max_uses=40 total). NENHUM slide pode ficar sem imagem. NENHUMA URL pode repetir entre slides.`;
  }

  const estiloNota = estilo === "EMANUEL_PESSOA"
    ? "\n\n⚠️ ESTILO EMANUEL_PESSOA: busque FOTOS REAIS de contexto (pessoas, cenas, situações, executivos, locais) em vez de mockups de produto. Ver regra especial no system prompt."
    : "";

  const blacklistTxt = urlsProibidas && urlsProibidas.length > 0
    ? `\n\nURLS JÁ USADAS NOS OUTROS SLIDES (NÃO REPITA NENHUMA):\n${urlsProibidas.map((u) => `- ${u}`).join("\n")}`
    : "";

  return `Tema do post: "${tema}" (tipo: ${tipo}, estilo: ${estilo})${estiloNota}

${contexto}${blacklistTxt}

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

  async function chamarClaude(
    userMsg: string
  ): Promise<{ atribuicoes: AtribuicaoClaude[]; erro: string | null }> {
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
        return { atribuicoes: [], erro: "Claude não chamou 'definir_imagens'." };
      }
      const input = toolUse.input as { atribuicoes: AtribuicaoClaude[] };
      return { atribuicoes: input.atribuicoes || [], erro: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { atribuicoes: [], erro: "Falha na chamada ao Claude: " + msg };
    }
  }

  const userMsg = buildUserMessage(slides, post.tema, post.tipo, post.estilo || "PADRAO", slideIndex);
  const { atribuicoes, erro } = await chamarClaude(userMsg);
  if (erro && atribuicoes.length === 0) {
    return NextResponse.json({ error: erro }, { status: 500 });
  }

  // Dedup de composições visualmente iguais: mesma lista de URLs gera PNG
  // distinto (timestamp), mas visualmente idêntico. Marca duplicatas ANTES
  // de gerar pra nao desperdicar Satori render.
  const composicoesKeys = new Set<string>();
  function composicaoKey(urls: string[]): string {
    return urls.slice(0, 3).map((u) => u.trim()).sort().join("|");
  }
  const atribuicoesAnotadas = atribuicoes.map((a) => {
    const composicaoValida =
      Array.isArray(a.composicao) &&
      a.composicao.filter((u) => typeof u === "string" && u.length > 0).length >= 2;
    let composicaoDuplicada = false;
    if (composicaoValida) {
      const key = composicaoKey(a.composicao!);
      if (composicoesKeys.has(key)) composicaoDuplicada = true;
      else composicoesKeys.add(key);
    }
    return { ...a, composicaoValida, composicaoDuplicada };
  });

  // Resolve cada atribuição → URL final de imagem.
  // Se tem `composicao` e nao e duplicada, compoe as N imagens em uma so via Satori.
  const resolvidas = await Promise.all(
    atribuicoesAnotadas.map(async (a) => {
      const usarComposicao = a.composicaoValida && !a.composicaoDuplicada;
      const imagem_final = usarComposicao
        ? (await comporImagens(a.composicao!, postId, a.slide_index, supabase)) || (await resolverImagem(a.image_url, a.page_url))
        : await resolverImagem(a.image_url, a.page_url);
      return {
        slide_index: a.slide_index,
        imagem_final: imagem_final as string | null,
        motivo: a.motivo,
        composto: !!(usarComposicao && imagem_final && imagem_final.includes("/composto/")),
        duplicada: a.composicaoDuplicada,
      };
    })
  );

  // Deduplicacao: uma mesma URL nao pode aparecer em 2+ slides.
  // - Quando ilustrando TODOS: mantem primeira ocorrencia (por slide_index),
  //   zera as demais. Operador troca manualmente nos vazios via "🔄 Trocar".
  // - Quando ilustrando UM slide (re-busca): rejeita se URL ja esta em outro.
  // Composicoes (/composto/) sao sempre unicas (timestamp no path), entao
  // nao entram no dedup.
  const urlsJaUsadas = new Set<string>();
  if (slideIndex !== undefined) {
    // Re-ilustrando 1 slide — coleta URLs dos OUTROS slides pra nao repetir
    for (let i = 0; i < slides.length; i++) {
      if (i === slideIndex) continue;
      const u = slides[i].imagem_url;
      if (u && !u.includes("/composto/")) urlsJaUsadas.add(u);
    }
    for (const r of resolvidas) {
      if (r.imagem_final && !r.imagem_final.includes("/composto/") && urlsJaUsadas.has(r.imagem_final)) {
        r.imagem_final = null;
        r.duplicada = true;
      }
    }
  } else {
    // Ilustrando tudo — dedup interno, mantem primeira ocorrencia
    const porOrdem = [...resolvidas].sort((a, b) => a.slide_index - b.slide_index);
    for (const r of porOrdem) {
      if (!r.imagem_final) continue;
      if (r.imagem_final.includes("/composto/")) continue; // composicoes sao unicas
      if (urlsJaUsadas.has(r.imagem_final)) {
        r.imagem_final = null;
        r.duplicada = true;
      } else {
        urlsJaUsadas.add(r.imagem_final);
      }
    }
  }

  // Aplica: se slideIndex foi especificado, só mexe naquele slide.
  const slidesNovos = slides.map((s, i) => {
    if (slideIndex !== undefined && i !== slideIndex) return s;
    const r = resolvidas.find((x) => x.slide_index === i);
    if (!r) return s;
    return { ...s, imagem_url: r.imagem_final };
  });

  // Fallback: quando ilustrando tudo, re-ilustra slides não-CTA que ficaram
  // sem imagem (Claude não atribuiu, URL inválida, ou zerada pelo dedup).
  // Passa blacklist de URLs já usadas pra evitar repetir.
  let retries = 0;
  if (slideIndex === undefined) {
    const ultimoIdx = slides.length - 1;
    const faltando = slidesNovos
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => i !== ultimoIdx && !s.imagem_url)
      .map(({ i }) => i);

    if (faltando.length > 0) {
      retries = faltando.length;
      const urlsProibidas = Array.from(urlsJaUsadas);
      const retryMsg = buildUserMessage(
        slides,
        post.tema,
        post.tipo,
        post.estilo || "PADRAO",
        undefined,
        faltando,
        urlsProibidas
      );
      const { atribuicoes: retryAtrib } = await chamarClaude(retryMsg);

      const retryAnotadas = retryAtrib.map((a) => {
        const composicaoValida =
          Array.isArray(a.composicao) &&
          a.composicao.filter((u) => typeof u === "string" && u.length > 0).length >= 2;
        let composicaoDuplicada = false;
        if (composicaoValida) {
          const key = composicaoKey(a.composicao!);
          if (composicoesKeys.has(key)) composicaoDuplicada = true;
          else composicoesKeys.add(key);
        }
        return { ...a, composicaoValida, composicaoDuplicada };
      });
      const retryResolvidas = await Promise.all(
        retryAnotadas.map(async (a) => {
          const usarComposicao = a.composicaoValida && !a.composicaoDuplicada;
          const imagem_final = usarComposicao
            ? (await comporImagens(a.composicao!, postId, a.slide_index, supabase)) ||
              (await resolverImagem(a.image_url, a.page_url))
            : await resolverImagem(a.image_url, a.page_url);
          return { slide_index: a.slide_index, imagem_final: imagem_final as string | null };
        })
      );

      // Aplica só em slides que ainda estão sem imagem, evitando repetir URLs.
      for (const r of retryResolvidas) {
        if (!r.imagem_final) continue;
        if (r.slide_index < 0 || r.slide_index >= slidesNovos.length) continue;
        if (r.slide_index === ultimoIdx) continue;
        if (slidesNovos[r.slide_index].imagem_url) continue; // já tem, não sobrescreve
        const ehComposicao = r.imagem_final.includes("/composto/");
        if (!ehComposicao && urlsJaUsadas.has(r.imagem_final)) continue; // evita duplicar
        slidesNovos[r.slide_index] = { ...slidesNovos[r.slide_index], imagem_url: r.imagem_final };
        if (!ehComposicao) urlsJaUsadas.add(r.imagem_final);
      }
    }
  }

  const { error: updErr } = await supabase
    .from("instagram_posts")
    .update({ slides_json: slidesNovos, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const duplicadas = resolvidas.filter((r) => r.duplicada).length;
  return NextResponse.json({
    ok: true,
    slides: slidesNovos,
    atribuicoes: resolvidas,
    duplicadas,
    retries,
  });
}
