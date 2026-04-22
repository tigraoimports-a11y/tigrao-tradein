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
  DICA: `dica prática pra dono de iPhone/Mac/Apple Watch (ex: "5 ajustes pra economizar bateria", "5 dicas pra quem nunca teve MacBook"). Foco em utilidade imediata.

REGRA IMPORTANTE de DICA:
Cada dica (cada slide do meio) precisa ter DOIS elementos no texto:
1. O QUE é a dica (frase curta explicando o conceito/atalho/ajuste).
2. COMO fazer — passo a passo concreto, com nome exato do botão/menu/tecla quando aplicável.

Exemplo BOM (slide sobre Command+C no Mac):
Título: "Command é o novo Ctrl"
Texto: "No Mac, ⌘ substitui o Ctrl do Windows. Copiar: selecione o texto e aperte ⌘+C. Colar: ⌘+V. Salvar: ⌘+S. Option equivale ao Alt."

Exemplo RUIM (só descreve, não ensina):
"No Mac, a tecla Command faz o papel do Ctrl. Atalhos são diferentes do Windows."

Use setas de ação: "Ajustes > Geral > Time Machine", "Mission Control (3 dedos pra cima)", "selecione > ⌘+I". Nada de vago ("vá nas configurações").`,
  COMPARATIVO: `comparativo entre modelos (ex: 'iPhone 17 vs 17 Pro — vale pagar mais?').

REGRA IMPORTANTE de comparativo entre 2 modelos Apple:
Mesmo que o tema enfatize UMA dimensão (ex: 'câmera iPhone 17 vs 17 Pro'), SEMPRE cubra o quadro completo pra dono de loja ajudar o cliente a decidir. Dedique slides a:
1. Câmera (sensores, lentes, zoom, vídeo)
2. Tela (ProMotion 120Hz, Always-On, brilho nits)
3. Chip / performance (A-Pro vs A-base, Neural Engine, GPU cores)
4. Bateria (horas vídeo, carga rápida)
5. Design e materiais (titânio vs alumínio, peso, botões Action/Camera Control)
6. Preço oficial Apple BR + valor de revenda / trade-in (quem trocar em 1-2 anos o Pro segura mais valor?)
7. Veredito honesto: "pro vale se você usa X; 17 base entrega Y pra maioria".

Se o tema for estreito (só câmera), ainda distribua slides: 2 ou 3 aprofundando a dimensão do tema + 1 "além da câmera, o Pro também tem..." cobrindo as outras dimensões em 1 slide de resumo.

Não romantize o Pro sem motivo. Se pro base cobre a maioria dos casos, diga.`,
  NOTICIA: "novidade, lançamento ou rumor do ecossistema Apple. Data, fonte e o que muda na prática pro consumidor.",
  ANALISE_PROFUNDA: `análise profunda estilo carrossel didático longo (10-14 slides). Constrói uma tese destrinchando um fenômeno do mercado Apple/tech que o leitor SENTE mas não entende.

ESTRUTURA NARRATIVA OBRIGATÓRIA (inspirada em carrosséis do @emanuel.pessoa):
Os slides devem seguir esta arquitetura de construção de argumento:

Slide 1 (HOOK EMOCIONAL): Uma frase curta que captura uma dor/observação que o leitor reconhece. Ex: "O iPhone usado virou item de luxo no Brasil." Termina com reviravolta em negrito: "A culpa não é da Apple."
Slide 2 (DADO CHOCANTE): Um número concreto + comparativo histórico. Ex: "R$ 6.500 por um iPhone 13 usado. Preço recorde desde que o mercado começou a ser medido."
Slide 3 (QUEBRA DE PARADIGMA): Descarta os vilões óbvios. "Você culpa a Apple. O dólar. O imposto. Desta vez, todos são coadjuvantes."
Slide 4 (ESCALA DO PROBLEMA): Mostra o tamanho do fenômeno com números.
Slide 5 (CAUSA ESTRUTURAL): Explica o "por quê" de fundo.
Slide 6 (COMPARATIVO): Brasil vs outros mercados.
Slide 7 (MECANISMO): Como o mecanismo econômico/social funciona na prática.
Slide 8 (PARADOXO): Algo contra-intuitivo que piora a situação.
Slide 9 (SÍNTESE): "Três forças. Simultâneas. Não é tendência, é convergência rara."
Slide 10 (NUANCE EXCLUSIVA): "E aqui tem o detalhe que a maioria não percebe..." — revela dado que aprofunda.
Slide 11 (PREVISÃO): O que vem depois.
Slide 12 (HEDGE): Admite os limites da própria tese. "Mas pode não ser tão simples assim."
Slide 13 (FRASE DE EFEITO): Síntese colável, memorável. Ex: "O iPhone caro é made in shortage."
Slide 14 (CTA MULTI-CAMADA): Compartilha com família/amigos + Comenta + Salva + Segue + Link na bio.

Adapte o número de slides ao solicitado (se 7, condensa; se 14, expande). SEMPRE termine com CTA multi-camada forte.

TEMAS POSSÍVEIS: preço de iPhone no Brasil, mercado de seminovos, ciclo de obsolescência, valor de revenda, Apple Care, vida útil real de bateria, dólar e Apple Brasil, Zona Franca de Manaus, etc. Conecta economia macro a comportamento de consumo real.`,
};

const ESTILO_GUIA: Record<string, string> = {
  PADRAO: `TOM DE VOZ (misto descontraído + técnico + formal)
- Descontraído sem ser coloquial demais. Nada de "mano", "brother", "tá ligado". Nada de "ademais", "outrossim", "cumpre ressaltar".
- Técnico quando ajuda: pode falar "chip A17 Pro", "ProMotion 120Hz", "USB-C 2.0", "câmera de 48MP" sem explicar se for óbvio. Se for detalhe menos conhecido, explica em 1 linha.
- Formal no sentido de correção gramatical e precisão. Nunca clickbait ("você não vai acreditar", "descubra agora").
- Português brasileiro. Você pode usar "você" / "seu".

FORMATAÇÃO DO TEXTO
- Texto corrido normal, sem marcação markdown.
- Sem **negrito** inline.`,

  EMANUEL_PESSOA: `TOM DE VOZ — ESTILO EMANUEL PESSOA (analítico-didático impactante)
Inspirado no carrossel investigativo de mercado do @emanuel.pessoa. Linguagem direta, quase telegráfica, como se você estivesse explicando pra um amigo inteligente em uma mesa de bar — mas com dado concreto por trás de cada frase.

REGRAS DE ESCRITA:
1. Frases CURTAS. Muitas vezes uma única frase por linha. Pontuação marcada (ponto final em frase curta = impacto).
2. Parágrafos SEPARADOS por linha em branco — muito ar entre ideias. Cada parágrafo respira sozinho.
3. **Use **negrito** (com asteriscos duplos, estilo markdown) em frases-chave que você quer que grudem na memória do leitor.** Tipicamente 1-3 blocos de negrito por slide. Nunca negrito no slide inteiro — a força está no contraste.
4. Conversa DIRETA com leitor: "Você culpa a Apple". "De onde você compraria?". Usa "você" / "seu" livremente.
5. Perguntas RETÓRICAS pra engajar antes de revelar a tese.
6. Frases de efeito COLÁVEIS: curtas, memoráveis, compartilháveis. Ex: "A culpa é da China." / "O iPhone caro é made in shortage." / "A Apple não invadiu o Brasil. Ela só vendeu iPhone."
7. Termos técnicos usados com naturalidade (arroba, câmbio, ciclo, obsolescência) sem parecer arrogante. Se for termo menos comum, explica em 1 linha.
8. Ego-ping positivo ao leitor: "Você acabou de entender o que a maioria vai descobrir meses depois."
9. NUNCA clickbait tipo "você não vai acreditar". O impacto vem do dado + construção lógica, não da manipulação.

ESTRUTURA DE SLIDE MÉDIO (exemplo):
---
O preço do iPhone 13 no mercado brasileiro está em recorde histórico.

**R$ 6.800 num aparelho lançado em 2021.**

Isso não é inflação.
É escassez programada.

E tem um motivo que quase ninguém te conta.
---

Note: parágrafos curtos, frase em **negrito** no meio, pergunta/afirmação direta no final que puxa pro próximo slide.

CTA FINAL (último slide) deve ter CAMADAS:
- "Manda esse carrossel pra [alguém específico]"
- "Comenta aqui: [pergunta concreta]"
- "Salva. Quando [evento futuro], você vai querer lembrar."
- "Me siga pra saber quando [desfecho]."
- "Link na bio: [oferta concreta]."

FORMATAÇÃO (IMPORTANTE):
- No campo 'texto' de cada slide, use \\n\\n (dupla quebra de linha) pra separar parágrafos.
- Use **palavra ou frase** (com asteriscos duplos) pra marcar negrito. O sistema renderiza isso como texto em negrito real.
- Não use emoji no texto — o visual fica limpo, seco, texto-primeiro.`,
};

function buildSystemPrompt(tipo: string, numeroSlides: number, estilo: string = "PADRAO"): string {
  const estiloGuia = ESTILO_GUIA[estilo] || ESTILO_GUIA.PADRAO;
  const isEmanuel = estilo === "EMANUEL_PESSOA";

  return `Você é o editor de conteúdo do Instagram da @tigraoimports, loja de eletrônicos Apple no Rio de Janeiro. Nicho: iPhone, Mac, Apple Watch, AirPods — novos, seminovos e trade-in.

TAREFA
Criar um carrossel de ${numeroSlides} slides sobre o tema solicitado. Tipo: ${tipo} — ${TIPO_GUIA[tipo] || ""}.

${estiloGuia}

ESTRUTURA DO CARROSSEL
${isEmanuel ? `- Slide 1 (HOOK): frase curta e forte que captura dor do leitor + reviravolta em **negrito** no final. Título máx 50 chars, texto até 280 chars com parágrafos separados por \\n\\n.
- Slides do meio: 1 ideia central por slide. Pode ter título curto (máx 40 chars) ou só texto corrido. Texto com 2-4 parágrafos curtos, algumas frases em **negrito** pra pontuar, até 400 chars.
- Último slide (CTA MULTI-CAMADA): manda/comenta/salva/segue/link — como detalhado acima.
- Campo 'destaque' (opcional): número/dado isolado que merece tipografia gigante.` : `- Slide 1 (capa): título curto e impactante (máx 50 caracteres) + uma linha de chamada (máx 80 caracteres). Sem emoji na capa.
- Slides do meio: 1 ideia central por slide. Título curto (máx 40 caracteres) + texto corrido (máx 220 caracteres).
- Último slide: CTA suave. Ex: "Salva pra consultar depois", "Comenta sua dúvida", "Compartilha com quem vai comprar iPhone".
- Campo 'destaque' (opcional): 1 número/dado que merece virar tipografia grande no slide. Ex: "48MP", "30%", "R$ 6.999". Só usa se for realmente impactante.`}

REGRA DE OURO — FACT-CHECK
1. Use web_search pra pesquisar o tema. Mínimo 2 buscas com ângulos diferentes.
2. Para CADA fato que for parar no carrossel (número, data, specs, preço, nome de chip, etc), confirme em pelo menos 2 fontes independentes.
3. Se um fato relevante não pôde ser confirmado em 2+ fontes, NÃO coloque no post. Prefira silêncio a erro.
4. Preços em reais: só inclua se for preço oficial Apple Brasil. Nunca invente.
5. Data de lançamento: só inclua se for confirmada (Apple Newsroom, site oficial ou 2 veículos grandes).

HIERARQUIA DE FONTES — consulte nesta ordem
PRIMÁRIA (sempre tentar primeiro):
- apple.com (apple.com/br, newsroom.apple.com, support.apple.com, developer.apple.com)
- Página oficial do produto (ex: apple.com/br/iphone-16-pro/specs/) e a tabela de comparação (apple.com/br/iphone/compare/) — obrigatória pra posts do tipo COMPARATIVO.

SECUNDÁRIA (use pra contexto, opinião e "no mundo real"):
- 9to5mac.com, macrumors.com, theverge.com, arstechnica.com, wired.com
- Em português: tecnoblog.net, techtudo.com.br, canaltech.com.br, olhardigital.com.br, meiobit.com

EVITAR:
- Blogs pessoais sem autoria, sites de afiliado/cupom, fóruns do Reddit como fonte única, páginas de "top 10" agregadoras sem fonte primária.
- Rumores não confirmados por 2+ veículos grandes (ex: só um tweet ou só um leaker).

YOUTUBE:
- web_search pode trazer vídeos do YouTube. Você pode usar o TÍTULO + DESCRIÇÃO + TRANSCRIÇÃO (quando disponível) como fonte secundária, mas NÃO presuma o conteúdo do vídeo só pelo thumbnail ou título. Se a informação só existe em vídeo sem transcrição acessível, considere não confirmada.

PROTOCOLO DE BUSCA POR TIPO DE POST:
- DICA: 1 busca em apple.com/support + 1 em fonte secundária pt-BR pra linguagem do dia a dia.
- COMPARATIVO: SEMPRE abra apple.com/compare ou as páginas /specs/ dos dois modelos ANTES de qualquer review. Depois confirma impressões práticas em 2 fontes secundárias.
- NOTICIA: 1 busca em newsroom.apple.com + 1 em 9to5mac/MacRumors/Verge. Data e número de modelo só do site oficial.

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
    const { postId, detalhesExtras } = body as { postId?: string; detalhesExtras?: string };
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

    const systemPrompt = buildSystemPrompt(post.tipo, post.numero_slides, post.estilo || "PADRAO");

    const detalhesTrim = (detalhesExtras || "").trim();
    const temDetalhes = detalhesTrim.length > 0 && !!post.slides_json && Array.isArray(post.slides_json) && post.slides_json.length > 0;

    const userPrompt = temDetalhes
      ? `Tema do post: "${post.tema}"

CARROSSEL ATUAL (já gerado anteriormente — use como base, mantenha o que está bom):
${JSON.stringify({ slides: post.slides_json, legenda: post.legenda, hashtags: post.hashtags }, null, 2)}

INFORMAÇÕES ADICIONAIS QUE O USUÁRIO QUER INCLUIR (OBRIGATÓRIO incorporar no carrossel refeito — não omita):
"""
${detalhesTrim}
"""

Refaça o carrossel incorporando as informações adicionais acima. Mantenha a estrutura, tom e fatos já verificados, mas ajuste/expanda o conteúdo para incluir os pontos trazidos pelo usuário. Pode reorganizar slides se fizer sentido. Continue seguindo as regras de fact-check (web_search se precisar validar algum fato novo trazido pelo usuário). Chame salvar_post no final.`
      : `Tema do post: "${post.tema}"\n\nPesquise, verifique os fatos e monte o carrossel. Chame salvar_post no final.`;

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
