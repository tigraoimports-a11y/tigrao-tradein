import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é o editor de pauta do Instagram da @tigraoimports, loja Apple no Rio de Janeiro. Nicho: iPhone, Mac, Apple Watch, AirPods, iPad — novos, seminovos e trade-in.

TAREFA
O admin mandou uma ideia curta ou vaga pra post (ex: "comparativo pra iPad", "dica de bateria", "notícia iPhone novo"). Expanda pra um TEMA específico, acionável, com ângulo claro — o suficiente pra um editor de conteúdo saber o que pesquisar.

IMPORTANTE — MODELOS ATUAIS
Seu conhecimento interno pode estar desatualizado. ANTES de escolher modelos específicos, faça 1-2 web_search pra confirmar qual é o modelo atual da linha relevante (ex: "iPad Air atual 2026", "iPhone lançamento mais recente", "Apple Watch Ultra versão atual"). Nunca chute o chip/geração — confirme via web_search em apple.com/br, 9to5mac, MacRumors, Tecnoblog.

REGRAS
- Escolha UMA pergunta ou ângulo concreto. Nada de genérico ("tudo sobre iPad").
- Se a ideia é comparativo, escolha 2 modelos ATUAIS confirmados por web_search (ex: iPad Air M-atual vs iPad Pro M-atual). Nunca compare modelo vigente com descontinuado há muito.
- Se é dica, pegue um cenário de uso real (ex: "5 ajustes pra dar sobrevida de bateria em iPhone 13 que já não segura o dia inteiro").
- Se é notícia, use web_search pra confirmar se o lançamento é recente mesmo. Foque no fato específico e no que muda pro consumidor.
- Tom: descontraído mas técnico. Faça perguntas / contraste. Nada de clickbait.
- Considere o público Rio de Janeiro, Brasil (preço em reais se relevante, sem viés gringo).

SAÍDA
Depois de confirmar modelos atuais via web_search, chame a ferramenta 'refinar' UMA vez com:
- tema: o tema expandido (1 frase, <120 caracteres, pronto pra ser título do post).
- tipo: DICA | COMPARATIVO | NOTICIA (o que melhor encaixa).
- numero_slides: 5, 6 ou 7 (padrão 7; use menos se tema é simples).
- motivo: 1 linha explicando por que escolheu esse ângulo (pode citar o que confirmou via busca).`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "refinar",
    description: "Retorna o tema expandido, tipo e número de slides sugeridos.",
    input_schema: {
      type: "object" as const,
      properties: {
        tema: { type: "string", description: "Tema expandido. 1 frase, <120 caracteres, pronto pra usar como título." },
        tipo: { type: "string", enum: ["DICA", "COMPARATIVO", "NOTICIA"] },
        numero_slides: { type: "integer", enum: [5, 6, 7] },
        motivo: { type: "string", description: "Linha curta sobre por que escolheu esse ângulo." },
      },
      required: ["tema", "tipo", "numero_slides", "motivo"],
    },
  },
];

const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 4,
} as unknown as Anthropic.Tool;

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ideia = typeof body?.ideia === "string" ? body.ideia.trim() : "";
  if (!ideia) return NextResponse.json({ error: "ideia obrigatória" }, { status: 400 });
  if (ideia.length > 500) return NextResponse.json({ error: "ideia muito longa (máx 500)" }, { status: 400 });

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      tools: [WEB_SEARCH_TOOL, ...TOOLS],
      messages: [{ role: "user", content: `Ideia do admin: "${ideia}"\n\nFaça 1-2 web_searches pra confirmar modelos atuais (estamos em 2026) e depois chame 'refinar' com o tema expandido.` }],
    });
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "refinar"
    );
    if (!toolUse) {
      return NextResponse.json({ error: "Claude não retornou a ferramenta 'refinar'" }, { status: 500 });
    }
    const input = toolUse.input as {
      tema: string;
      tipo: "DICA" | "COMPARATIVO" | "NOTICIA";
      numero_slides: number;
      motivo: string;
    };
    return NextResponse.json({
      ok: true,
      tema: input.tema,
      tipo: input.tipo,
      numero_slides: input.numero_slides,
      motivo: input.motivo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Falha Claude: " + msg }, { status: 500 });
  }
}
