import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

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

interface PromptGerado {
  slide_index: number;
  prompt: string;
}

const SYSTEM_PROMPT_CLAUDE = `Você é um diretor de arte pra carrosséis do Instagram da @tigraoimports (loja Apple no Rio de Janeiro).

Sua tarefa: ler os slides de um carrossel (em português) e gerar um PROMPT em INGLÊS pra cada slide (exceto o último CTA). Esse prompt vai ser enviado pro modelo Gemini 2.5 Flash Image (Nano Banana) gerar a imagem.

REGRAS DO PROMPT:
1. EM INGLÊS, estilo product photography / editorial Apple.
2. DESCREVA: o objeto/conceito principal, ambiente, iluminação, estilo visual, paleta. Curto (1-3 frases), específico.
3. SEM TEXTO NA IMAGEM. Adicione sempre ao final: "no text, no words, no logos overlay".
4. Estética Apple oficial: minimalista, fundo limpo (branco ou gradiente sutil), iluminação de estúdio, alto detalhe.
5. Pra slides de comparativo multi-produto, gere UM prompt com os 2-3 produtos lado a lado.
6. Pra slides de tutorial/passo-a-passo ("Ajustes > X > Y"), pede MOCKUP de tela iOS/macOS SEM texto específico — ex: "clean mockup of iOS Settings screen with rows of menu items, minimalist UI, no specific labels, soft gradient background".
7. NUNCA REPITA prompts idênticos. Varie ângulo, contexto, iluminação entre slides.
8. Produtos Apple: sempre use o nome exato (iPhone 17 Pro, MacBook Air M4, iPad Pro M5, Apple Watch Ultra 3 etc).

EXEMPLOS:
- Slide "Seu MacBook usa 30% do poder" → "Professional product photography of a silver MacBook Air M4 open on a clean white desk, screen glowing softly showing abstract colorful wallpaper, minimalist studio lighting, high detail, Apple-style editorial shot, no text, no words, no logos overlay"
- Slide "Apple Watch SE 3 a partir de R$ 3.299" → "Studio photography of Apple Watch SE 3 silver aluminum case with midnight sport band, front view, clean white background, soft shadow, high detail, commercial product shot, no text, no words, no logos overlay"
- Slide "Ajustes > Câmera > Formatos" → "Clean minimalist mockup of iOS Settings screen, light mode, rows of generic menu items with icons, no specific labels, soft gradient background, Apple-style UI design, no English text, no words, no overlay"

SAÍDA:
Chame a ferramenta 'gerar_prompts' uma vez com array de { slide_index, prompt }. NÃO inclua o último slide (CTA).`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "gerar_prompts",
    description: "Retorna os prompts pra Imagen gerar cada imagem.",
    input_schema: {
      type: "object" as const,
      properties: {
        prompts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              slide_index: { type: "integer", description: "Índice 0-based do slide." },
              prompt: { type: "string", description: "Prompt em inglês pra Imagen gerar a imagem." },
            },
            required: ["slide_index", "prompt"],
          },
        },
      },
      required: ["prompts"],
    },
  },
];

function buildUserMessage(slides: SlideData[], tema: string, tipo: string, estilo: string): string {
  const slidesTxt = slides
    .map((s, i) => {
      const tag = i === 0 ? "CAPA" : i === slides.length - 1 ? "CTA (PULE)" : `SLIDE ${i + 1}`;
      const dest = s.destaque ? ` [destaque: "${s.destaque}"]` : "";
      return `${i}. ${tag}${dest}\n   Título: ${s.titulo}\n   Texto: ${s.texto}`;
    })
    .join("\n\n");

  return `Tema do post: "${tema}" (tipo: ${tipo}, estilo: ${estilo})

Gere um prompt em inglês pra cada slide (PULE o último, que é CTA).

SLIDES:
${slidesTxt}

Chame 'gerar_prompts' com a lista completa.`;
}

async function gerarPromptsDeImagem(
  slides: SlideData[],
  tema: string,
  tipo: string,
  estilo: string
): Promise<PromptGerado[]> {
  const userMsg = buildUserMessage(slides, tema, tipo, estilo);
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4000,
    system: SYSTEM_PROMPT_CLAUDE,
    tools: TOOLS,
    messages: [{ role: "user", content: userMsg }],
  });
  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "gerar_prompts"
  );
  if (!toolUse) return [];
  const input = toolUse.input as { prompts: PromptGerado[] };
  return input.prompts || [];
}

// Chama Gemini 2.5 Flash Image (Nano Banana) com um prompt, recebe PNG em base64
// e sobe no Supabase Storage. Retorna URL publica.
async function gerarImagemViaGemini(
  prompt: string,
  postId: string,
  slideIndex: number,
  supabase: ReturnType<typeof getSupabase>
): Promise<{ url: string | null; erro: string | null }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { url: null, erro: "GOOGLE_AI_API_KEY não configurada" };

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { url: null, erro: `Gemini HTTP ${res.status}: ${txt.slice(0, 200)}` };
    }
    const j = await res.json();
    const parts = j?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find(
      (p: { inlineData?: { mimeType?: string; data?: string } }) =>
        p?.inlineData?.mimeType?.startsWith("image/") && p?.inlineData?.data
    );
    const base64 = imgPart?.inlineData?.data;
    const mimeType = imgPart?.inlineData?.mimeType || "image/png";
    if (!base64) return { url: null, erro: "Gemini não retornou imagem" };

    const buffer = Buffer.from(base64, "base64");
    const ext = mimeType.includes("png") ? "png" : "jpg";
    const path = `gemini/${postId}/${Date.now()}-${slideIndex}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: mimeType, upsert: true });
    if (upErr) return { url: null, erro: "Supabase upload: " + upErr.message };
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, erro: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { url: null, erro: "Exception: " + msg };
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

  // 1. Claude gera prompts em ingles pra cada slide (exceto CTA).
  let prompts: PromptGerado[];
  try {
    prompts = await gerarPromptsDeImagem(slides, post.tema, post.tipo, post.estilo || "PADRAO");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Claude falhou ao gerar prompts: " + msg }, { status: 500 });
  }

  if (prompts.length === 0) {
    return NextResponse.json({ error: "Claude não retornou prompts" }, { status: 500 });
  }

  // Se slideIndex especificado, filtra pra so ele.
  const promptsAlvo =
    slideIndex !== undefined
      ? prompts.filter((p) => p.slide_index === slideIndex)
      : prompts;

  // 2. Paraleliza geracao via Gemini (ate 5 em paralelo pra nao estourar rate limit).
  const resultados: { slide_index: number; url: string | null; erro: string | null; prompt: string }[] = [];
  const CONCURRENCY = 5;
  for (let i = 0; i < promptsAlvo.length; i += CONCURRENCY) {
    const batch = promptsAlvo.slice(i, i + CONCURRENCY);
    const batchRes = await Promise.all(
      batch.map(async (p) => {
        const { url, erro } = await gerarImagemViaGemini(p.prompt, postId, p.slide_index, supabase);
        return { slide_index: p.slide_index, url, erro, prompt: p.prompt };
      })
    );
    resultados.push(...batchRes);
  }

  // 3. Aplica nos slides.
  const slidesNovos = slides.map((s, i) => {
    if (slideIndex !== undefined && i !== slideIndex) return s;
    const r = resultados.find((x) => x.slide_index === i);
    if (!r || !r.url) return s;
    return { ...s, imagem_url: r.url };
  });

  const { error: updErr } = await supabase
    .from("instagram_posts")
    .update({ slides_json: slidesNovos, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const sucesso = resultados.filter((r) => !!r.url).length;
  const falhas = resultados.filter((r) => !r.url);
  return NextResponse.json({
    ok: true,
    slides: slidesNovos,
    sucesso,
    total: resultados.length,
    falhas: falhas.map((f) => ({ slide_index: f.slide_index, erro: f.erro })),
    prompts: resultados.map((r) => ({ slide_index: r.slide_index, prompt: r.prompt })),
  });
}
