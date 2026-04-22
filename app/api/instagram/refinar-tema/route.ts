import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ESTILO_TITULO_GUIA: Record<string, string> = {
  PADRAO: `TÍTULO — estilo padrão Tigrão
Escreva um tema descritivo, claro, direto. Ex: "5 ajustes pra bateria do iPhone 15 durar mais", "iPad Air M4 vs iPad Pro M5: qual comprar em 2026".`,

  EMANUEL_PESSOA: `TÍTULO — estilo Emanuel Pessoa (narrativa impactante)
Escreva o tema como um HOOK curto e impactante — uma frase que crie tensão ou curiosidade, não um "sobre o que é o post".

Padrões que funcionam:
- Afirmação direta + reviravolta: "O iPhone 13 usado no Brasil bate recorde de preço. E a culpa não é da Apple."
- Paradoxo: "O iPhone que menos cai de valor no Brasil é o modelo que a Apple parou de vender."
- Pergunta provocadora: "Por que o iPad Air M4 sumiu dos estoques do Brasil em março?"
- Frase colável: "Seu iPhone virou poupança. Em dólar."
- "Made in algo inesperado": "O preço do MacBook é decidido em Taiwan — não em Cupertino."

Evite: títulos genéricos ("5 dicas..."), "tudo que você precisa saber...", lista seca.
Prefira: 1 tese afirmativa ou 1 paradoxo, máx 110 caracteres, sem clickbait mas com gancho.

Mesmo para DICA, COMPARATIVO ou NOTICIA em estilo Emanuel Pessoa, o título deve ter essa voz:
- DICA + Emanuel Pessoa: "A bateria do seu iPhone morre às 18h. Tem solução — e não é carregador novo."
- COMPARATIVO + Emanuel Pessoa: "iPhone 17 vs 17 Pro: o Pro é superior. Só que não pro que você faz com o celular."
- NOTICIA + Emanuel Pessoa: "Apple Watch Ultra 3 chegou. E tem um motivo pra Apple não ter feito alarde."`,

  CARIOCA_DESCONTRAIDO: `TÍTULO — estilo carioca descontraído (papo de balcão)
Escreva como um balconista gente-boa no shopping do Rio conversando com o cliente. Soa humano, levemente irreverente, sem forçar gíria. Humor leve é bem-vindo.

Padrões que funcionam:
- Conversa direta: "Chegou o 17 Pro Max, mano — e a história desse aparelho é boa."
- Convite casual: "Passa aqui que eu te mostro o iPhone que tá saindo mais esse mês."
- Humor leve: "iPad pro estudante: comprei pra anotar aula, virei YouTuber."
- Opinião pessoal: "Minha opinião? O 16 seminovo ainda é o melhor negócio de 2026."

Evite: gíria forçada ("bora", "top demais", "manin maneirinho"), palavrão, formalismo.
Prefira: leveza + autoridade de quem vende iPhone há anos. Máx 110 caracteres.`,

  STORYTELLING_PREMIUM: `TÍTULO — estilo storytelling premium (narrativa cinematográfica)
Escreva como se fosse narração de comercial Apple. Tom aspiracional, emocional, evocativo. Fala do produto pelo que ele MUDA na vida, não pelas specs.

Padrões que funcionam:
- Tempo suspenso: "Três anos depois, ele ainda te pergunta: vale a pena trocar?"
- Promessa implícita: "Um iPhone não é sobre o chip. É sobre o que você deixa de perder."
- Contemplativo: "A câmera do 17 Pro não foi feita pra postar. Foi feita pra lembrar."
- Pergunta íntima: "Quando foi a última vez que seu celular te surpreendeu?"

Evite: specs no título ("48MP", "A19 Pro"), dados secos, clickbait.
Prefira: emoção > razão. Concreto e curto. Máx 100 caracteres.`,

  COMPARATIVO_TECNICO: `TÍTULO — estilo comparativo técnico (direto ao número)
Escreva como um review de canal sério de tecnologia. Título declarativo, com número específico, sem floreio. Promete dado útil.

Padrões que funcionam:
- X vs Y em N pontos: "16 Pro vs 17 Pro: 4 diferenças que importam, 3 que não"
- Veredicto curto: "iPad Air M4 vs iPad Pro M5: pro freelancer, qual compra?"
- Pergunta objetiva: "Trocar do 15 pro 17 vale os R$ 4 mil de diferença?"
- Dado isolado: "Bateria do 17 Pro Max: 38% a mais que o 16 Pro Max em uso real"

Evite: adjetivos ("incrível", "impressionante"), emoção, gíria.
Prefira: número no título + 1 pergunta de decisão. Máx 95 caracteres.`,

  VIRAL_POLEMICO: `TÍTULO — estilo viral polêmico (hot-take com contexto)
Escreva um hot-take que faz o leitor parar. Controvérsia calculada — precisa ter tese defensável no post, não é clickbait vazio. Frases curtíssimas, PONTO FINAL marcado.

Padrões que funcionam:
- Negação provocadora: "Você NÃO deveria comprar o 17 Pro Max. A não ser que..."
- Tese impopular: "iPhone 16 é melhor que iPhone 17. Em 2026, pelo menos."
- Declaração absoluta: "Ninguém precisa de iPad Pro M5. Sério."
- Unpopular ranking: "O iPhone mais subestimado da Apple é o 15 Plus."

Evite: "você não vai acreditar", "chocante", "bombou", clickbait barato.
Prefira: tese específica + gancho de "mas tem um motivo". Máx 90 caracteres. Use CAPS em 1 palavra pra enfatizar.`,

  EDUCATIVO_DIDATICO: `TÍTULO — estilo educativo didático (professor gente-boa)
Escreva como um professor passo-a-passo que quer realmente ENSINAR. Título promete um skill/resultado concreto e diz em quanto tempo.

Padrões que funcionam:
- Como + tempo: "Como transferir tudo pro iPhone novo em 15 minutos (passo a passo)"
- Resultado + número: "3 ajustes no iPhone que dobram a bateria no dia-a-dia"
- "Você sabia": "Você sabia que o iPhone salva a localização onde você tirou cada foto?"
- Objetivo claro: "Pra quem vai comprar o primeiro Mac em 2026: 4 coisas a saber antes"

Evite: mistério, gancho emocional, clickbait, frase solta sem promessa.
Prefira: verbo de ação + número + resultado mensurável. Máx 110 caracteres.`,
};

function buildSystemPrompt(estilo: string): string {
  const guiaTitulo = ESTILO_TITULO_GUIA[estilo] || ESTILO_TITULO_GUIA.PADRAO;
  return `Você é o editor de pauta do Instagram da @tigraoimports, loja Apple no Rio de Janeiro. Nicho: iPhone, Mac, Apple Watch, AirPods, iPad — novos, seminovos e trade-in.

TAREFA
O admin mandou uma ideia curta ou vaga pra post (ex: "comparativo pra iPad", "dica de bateria", "notícia iPhone novo"). Expanda pra um TEMA específico, acionável, com ângulo claro — o suficiente pra um editor de conteúdo saber o que pesquisar.

ESTILO JÁ ESCOLHIDO PELO ADMIN: ${estilo}
${guiaTitulo}

IMPORTANTE — MODELOS ATUAIS
Seu conhecimento interno pode estar desatualizado. ANTES de escolher modelos específicos, faça 1-2 web_search pra confirmar qual é o modelo atual da linha relevante (ex: "iPad Air atual 2026", "iPhone lançamento mais recente", "Apple Watch Ultra versão atual"). Nunca chute o chip/geração — confirme via web_search em apple.com/br, 9to5mac, MacRumors, Tecnoblog.

REGRAS
- Escolha UMA pergunta ou ângulo concreto. Nada de genérico ("tudo sobre iPad").
- Se a ideia é comparativo, escolha 2 modelos ATUAIS confirmados por web_search (ex: iPad Air M-atual vs iPad Pro M-atual). Nunca compare modelo vigente com descontinuado há muito.
- Se é dica, pegue um cenário de uso real (ex: "5 ajustes pra dar sobrevida de bateria em iPhone 13 que já não segura o dia inteiro").
- Se é notícia, use web_search pra confirmar se o lançamento é recente mesmo. Foque no fato específico e no que muda pro consumidor.
- Se é análise profunda, escolha um FENÔMENO (preço de iPhone no Brasil, mercado de seminovos, ciclo de obsolescência, dólar x Apple, Zona Franca, etc) que exija narrativa didática longa (10-14 slides) pra destrinchar.
- Considere o público Rio de Janeiro, Brasil (preço em reais se relevante, sem viés gringo).
- Nunca use clickbait ("você não vai acreditar", "descubra agora").

SAÍDA
Depois de confirmar modelos atuais via web_search, chame a ferramenta 'refinar' UMA vez com:
- tema: o tema expandido seguindo o GUIA DE TÍTULO acima pro estilo ${estilo}.
- tipo: DICA | COMPARATIVO | NOTICIA | ANALISE_PROFUNDA (o que melhor encaixa).
- numero_slides: entre 5 e 14 (padrão 7 para DICA/COMPARATIVO/NOTICIA; 12 para ANALISE_PROFUNDA).
- motivo: 1 linha explicando por que escolheu esse ângulo (pode citar o que confirmou via busca).`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "refinar",
    description: "Retorna o tema expandido, tipo e número de slides sugeridos.",
    input_schema: {
      type: "object" as const,
      properties: {
        tema: { type: "string", description: "Tema expandido. 1 frase, <120 caracteres, pronto pra usar como título." },
        tipo: { type: "string", enum: ["DICA", "COMPARATIVO", "NOTICIA", "ANALISE_PROFUNDA"] },
        numero_slides: { type: "integer", minimum: 5, maximum: 14 },
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
  const estiloRaw = typeof body?.estilo === "string" ? body.estilo : "PADRAO";
  const estilo = ["PADRAO", "EMANUEL_PESSOA", "CARIOCA_DESCONTRAIDO", "STORYTELLING_PREMIUM", "COMPARATIVO_TECNICO", "VIRAL_POLEMICO", "EDUCATIVO_DIDATICO"].includes(estiloRaw) ? estiloRaw : "PADRAO";
  if (!ideia) return NextResponse.json({ error: "ideia obrigatória" }, { status: 400 });
  if (ideia.length > 500) return NextResponse.json({ error: "ideia muito longa (máx 500)" }, { status: 400 });

  try {
    const systemPrompt = buildSystemPrompt(estilo);
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4000,
      system: systemPrompt,
      tools: [WEB_SEARCH_TOOL, ...TOOLS],
      messages: [{ role: "user", content: `Ideia do admin: "${ideia}"\nEstilo escolhido: ${estilo}\n\nFaça 1-2 web_searches pra confirmar modelos atuais (estamos em 2026) e depois chame 'refinar' com o tema expandido no estilo ${estilo}.` }],
    });
    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "refinar"
    );
    if (!toolUse) {
      return NextResponse.json({ error: "Claude não retornou a ferramenta 'refinar'" }, { status: 500 });
    }
    const input = toolUse.input as {
      tema: string;
      tipo: "DICA" | "COMPARATIVO" | "NOTICIA" | "ANALISE_PROFUNDA";
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
