import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ImagemCandidata {
  url: string;
  source: string;
  sourceUrl?: string;
}

interface SlideInput {
  titulo: string;
  texto: string;
  destaque?: string;
  imagem_url?: string | null;
}

interface Atribuicao {
  slide_index: number;
  imagem_index: number | null;
  motivo: string;
}

const SYSTEM_PROMPT = `Você é editor visual de carrossel do Instagram da @tigraoimports, loja Apple no Rio de Janeiro.

TAREFA
Dada uma lista de slides (título + texto + destaque opcional) e uma lista numerada de imagens candidatas, escolha a melhor imagem pra cada slide — ou marque null se nenhuma encaixa bem.

REGRAS
1. Slide CAPA (index 0): priorize sempre uma imagem forte que represente o tema (hero shot do produto). Deve ter imagem na maioria dos casos.
2. Slides com DESTAQUE grande tipo "2 vs 3", "8x", "120fps", "R$ 6.999" — a tipografia já domina. SÓ atribua imagem se for realmente relevante (ex: destaque "8x" + imagem mostrando zoom). Senão, null.
3. Slide CTA (último): normalmente null. Exceção: um closeup bonito do produto pode funcionar.
4. NÃO repita a mesma imagem em slides consecutivos. Se tiver imagens suficientes, varie.
5. Prefira Apple oficial (source começando com "Apple") > sites tech > outros. Evite screenshots de UI do iOS como slide principal.
6. Se slide fala de cor específica (ex: "iPhone 17 Pro laranja"), escolha imagem que mostra a cor. Se fala de câmera, escolha imagem que destaca o sistema traseiro.
7. Se uma imagem for obviamente ruim (logo, thumbnail minúsculo), use null em vez de forçar.

Chame a ferramenta 'atribuir' com o mapping completo. Uma atribuição por slide. O motivo deve ser uma linha curta explicando a escolha.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "atribuir",
    description: "Retorna o mapping de slide → imagem escolhida (ou null). Chame uma única vez com todas as atribuições.",
    input_schema: {
      type: "object" as const,
      properties: {
        atribuicoes: {
          type: "array",
          description: "Uma atribuição pra cada slide (na ordem dos slides).",
          items: {
            type: "object",
            properties: {
              slide_index: { type: "integer", description: "Índice do slide (0-based)." },
              imagem_index: {
                type: ["integer", "null"] as unknown as "integer",
                description: "Índice da imagem escolhida (0-based), ou null se nenhuma encaixa.",
              },
              motivo: { type: "string", description: "Linha curta explicando a escolha." },
            },
            required: ["slide_index", "imagem_index", "motivo"],
          },
        },
      },
      required: ["atribuicoes"],
    },
  },
];

function buildUserMessage(slides: SlideInput[], imagens: ImagemCandidata[]): Anthropic.MessageParam {
  const slidesTxt = slides
    .map((s, i) => {
      const tag = i === 0 ? "CAPA" : i === slides.length - 1 ? "CTA" : `SLIDE ${i + 1}`;
      const dest = s.destaque ? ` [DESTAQUE: "${s.destaque}"]` : "";
      return `${i}. (${tag})${dest}\n   Título: ${s.titulo}\n   Texto: ${s.texto}`;
    })
    .join("\n\n");

  const imgsTxt = imagens.map((im, i) => `[${i}] ${im.source}`).join("\n");

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: `SLIDES (${slides.length}):\n\n${slidesTxt}\n\nIMAGENS DISPONÍVEIS (${imagens.length}):\n${imgsTxt}\n\nAnalise cada imagem abaixo e chame 'atribuir' com uma atribuição pra cada slide (na ordem 0..${slides.length - 1}).`,
    },
  ];
  for (let i = 0; i < imagens.length; i++) {
    content.push({ type: "text", text: `Imagem [${i}] — ${imagens[i].source}:` });
    content.push({
      type: "image",
      source: { type: "url", url: imagens[i].url },
    });
  }
  return { role: "user", content };
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { postId, imagens } = body || {};
  if (!postId) return NextResponse.json({ error: "postId obrigatório" }, { status: 400 });
  if (!Array.isArray(imagens) || imagens.length === 0) {
    return NextResponse.json({ error: "imagens obrigatório (use /api/instagram/buscar-imagem primeiro)" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data: post, error: postErr } = await supabase
    .from("instagram_posts")
    .select("*")
    .eq("id", postId)
    .single();
  if (postErr || !post) {
    return NextResponse.json({ error: postErr?.message || "post não encontrado" }, { status: 404 });
  }
  const slides: SlideInput[] = post.slides_json;
  if (!Array.isArray(slides) || slides.length === 0) {
    return NextResponse.json({ error: "post sem slides" }, { status: 400 });
  }

  // Limita a 15 imagens pra não estourar tokens de vision.
  const imgs: ImagemCandidata[] = imagens.slice(0, 15);

  const message = buildUserMessage(slides, imgs);

  let atribuicoes: Atribuicao[] = [];
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      tool_choice: { type: "tool", name: "atribuir" },
      messages: [message],
    });

    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "atribuir");
    if (!toolUse) {
      return NextResponse.json({ error: "Claude não chamou a ferramenta 'atribuir'" }, { status: 500 });
    }
    const input = toolUse.input as { atribuicoes: Atribuicao[] };
    atribuicoes = input.atribuicoes || [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Falha na chamada ao Claude: " + msg }, { status: 500 });
  }

  // Aplica as atribuições aos slides.
  const slidesNovos = slides.map((s, i) => {
    const a = atribuicoes.find((x) => x.slide_index === i);
    if (!a) return s;
    const idx = a.imagem_index;
    if (idx === null || idx === undefined || idx < 0 || idx >= imgs.length) {
      return { ...s, imagem_url: null };
    }
    return { ...s, imagem_url: imgs[idx].url };
  });

  const { error: updErr } = await supabase
    .from("instagram_posts")
    .update({ slides_json: slidesNovos, updated_at: new Date().toISOString() })
    .eq("id", postId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    slides: slidesNovos,
    atribuicoes,
  });
}
