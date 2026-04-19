import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

// Ordem de prioridade para filtrar fontes (Apple oficial primeiro).
const PRIORIDADE: Array<{ pattern: RegExp; peso: number; label: string }> = [
  { pattern: /apple\.com\/br\/(?:iphone|mac|ipad|watch|airpods|vision)/i, peso: 110, label: "Apple Brasil (produto)" },
  { pattern: /apple\.com\/(?:iphone|mac|ipad|watch|airpods|vision)(?!\/newsroom)/i, peso: 105, label: "Apple (produto)" },
  { pattern: /apple\.com\/br\/newsroom/i, peso: 100, label: "Apple Newsroom BR" },
  { pattern: /apple\.com\/newsroom/i, peso: 95, label: "Apple Newsroom" },
  { pattern: /apple\.com\/br\//i, peso: 90, label: "Apple Brasil" },
  // Apple Support / Help / Guides: tem og:image util mas o HTML esta cheio de
  // icones de categoria e setas de navegacao. Peso baixo e scrap limitado.
  // IMPORTANTE: esses patterns precisam vir ANTES do generico apple.com.
  { pattern: /(?:support|help)\.apple\.com/i, peso: 25, label: "Apple Support" },
  { pattern: /apple\.com\/(?:[a-z-]+\/)?(?:support|guide|help)/i, peso: 25, label: "Apple Support" },
  { pattern: /apple\.com\//i, peso: 80, label: "Apple" },
  { pattern: /9to5mac\.com/i, peso: 60, label: "9to5Mac" },
  { pattern: /macrumors\.com/i, peso: 55, label: "MacRumors" },
  { pattern: /theverge\.com/i, peso: 50, label: "The Verge" },
  { pattern: /arstechnica\.com/i, peso: 48, label: "Ars Technica" },
  { pattern: /tecnoblog\.net/i, peso: 45, label: "Tecnoblog" },
  { pattern: /techtudo\.com\.br/i, peso: 43, label: "TechTudo" },
  { pattern: /canaltech\.com\.br/i, peso: 40, label: "Canaltech" },
  { pattern: /olhardigital\.com\.br/i, peso: 38, label: "Olhar Digital" },
  { pattern: /meiobit\.com/i, peso: 35, label: "Meio Bit" },
];

function pesoDaFonte(url: string): { peso: number; label: string } {
  for (const p of PRIORIDADE) {
    if (p.pattern.test(url)) return { peso: p.peso, label: p.label };
  }
  return { peso: 0, label: new URL(url).hostname };
}

// Mapeamento produto mencionado no tema → URLs oficiais Apple com hero shots.
// Ordem: mais específico primeiro (iphone 17 pro antes de iphone).
const PRODUTOS_APPLE: Array<{ match: RegExp; urls: string[] }> = [
  { match: /iphone\s*17\s*pro/i, urls: ["https://www.apple.com/br/iphone-17-pro/", "https://www.apple.com/br/shop/buy-iphone/iphone-17-pro"] },
  { match: /iphone\s*17/i, urls: ["https://www.apple.com/br/iphone-17/", "https://www.apple.com/br/shop/buy-iphone/iphone-17"] },
  { match: /iphone\s*16\s*pro/i, urls: ["https://www.apple.com/br/iphone-16-pro/"] },
  { match: /iphone\s*16/i, urls: ["https://www.apple.com/br/iphone-16/"] },
  { match: /iphone\s*15\s*pro/i, urls: ["https://www.apple.com/br/iphone-15-pro/"] },
  { match: /iphone\s*15/i, urls: ["https://www.apple.com/br/iphone-15/"] },
  { match: /iphone\s*14\s*pro/i, urls: ["https://www.apple.com/br/shop/buy-iphone/iphone-14-pro"] },
  { match: /iphone\s*14/i, urls: ["https://www.apple.com/br/shop/buy-iphone/iphone-14"] },
  { match: /iphone\s*13/i, urls: ["https://www.apple.com/br/shop/buy-iphone/iphone-13"] },
  { match: /iphone/i, urls: ["https://www.apple.com/br/iphone/"] },

  { match: /macbook\s*air/i, urls: ["https://www.apple.com/br/macbook-air/", "https://www.apple.com/br/shop/buy-mac/macbook-air"] },
  { match: /macbook\s*pro/i, urls: ["https://www.apple.com/br/macbook-pro/", "https://www.apple.com/br/shop/buy-mac/macbook-pro"] },
  { match: /macbook|mac\s*book/i, urls: ["https://www.apple.com/br/mac/", "https://www.apple.com/br/macbook-air/", "https://www.apple.com/br/macbook-pro/"] },
  { match: /imac/i, urls: ["https://www.apple.com/br/imac/"] },
  { match: /mac\s*studio/i, urls: ["https://www.apple.com/br/mac-studio/"] },
  { match: /mac\s*mini/i, urls: ["https://www.apple.com/br/mac-mini/"] },
  { match: /mac\s*pro/i, urls: ["https://www.apple.com/br/mac-pro/"] },

  { match: /apple\s*watch\s*ultra/i, urls: ["https://www.apple.com/br/apple-watch-ultra-2/"] },
  { match: /apple\s*watch\s*se/i, urls: ["https://www.apple.com/br/apple-watch-se/"] },
  { match: /apple\s*watch/i, urls: ["https://www.apple.com/br/apple-watch/"] },

  { match: /airpods\s*pro/i, urls: ["https://www.apple.com/br/airpods-pro/"] },
  { match: /airpods\s*max/i, urls: ["https://www.apple.com/br/airpods-max/"] },
  { match: /airpods/i, urls: ["https://www.apple.com/br/airpods/"] },

  { match: /ipad\s*pro/i, urls: ["https://www.apple.com/br/ipad-pro/"] },
  { match: /ipad\s*air/i, urls: ["https://www.apple.com/br/ipad-air/"] },
  { match: /ipad\s*mini/i, urls: ["https://www.apple.com/br/ipad-mini/"] },
  { match: /ipad/i, urls: ["https://www.apple.com/br/ipad/"] },

  { match: /vision\s*pro/i, urls: ["https://www.apple.com/br/apple-vision-pro/"] },
];

function detectarProdutoUrls(texto: string): string[] {
  // Conta ocorrências de cada pattern no texto (case-insensitive, global).
  // Vence o produto com mais matches; empate → mais específico (primeiro da lista).
  let melhorIdx = -1;
  let melhorCount = 0;
  for (let i = 0; i < PRODUTOS_APPLE.length; i++) {
    const globalRe = new RegExp(PRODUTOS_APPLE[i].match.source, "gi");
    const matches = texto.match(globalRe);
    const count = matches ? matches.length : 0;
    if (count > melhorCount) {
      melhorCount = count;
      melhorIdx = i;
    }
  }
  if (melhorIdx < 0) return [];
  return PRODUTOS_APPLE[melhorIdx].urls;
}

// Extrai og:image, twitter:image e imagens grandes de uma pagina.
async function extrairImagens(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });
    if (!res.ok) return [];
    const html = await res.text();

    const candidatos: string[] = [];

    // og:image (frequentemente a hero image da pagina)
    const ogMatch = html.match(
      /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi
    );
    if (ogMatch) {
      for (const m of ogMatch) {
        const content = m.match(/content=["']([^"']+)/i)?.[1];
        if (content) candidatos.push(content);
      }
    }

    // twitter:image
    const twMatch = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/gi);
    if (twMatch) {
      for (const m of twMatch) {
        const content = m.match(/content=["']([^"']+)/i)?.[1];
        if (content) candidatos.push(content);
      }
    }

    // Scan agressivo de URLs apple.com: SÓ em páginas de produto da Apple
    // (newsroom, /mac, /iphone, /watch, /airpods, /ipad). Support nao entra
    // porque o HTML tem icones de categoria, setas de navegacao, social cards
    // minusculos — que viram lixo quando esticados no preview quadrado.
    const ePaginaDeProduto =
      /apple\.com\/(?:[a-z-]+\/)?(?:newsroom|iphone|mac(?:book|-studio|-mini|-pro)?|imac|watch|airpods|ipad|vision)/i.test(
        url
      );
    if (ePaginaDeProduto) {
      const imgs = html.match(/https?:\/\/[^"'\s)]*apple\.com[^"'\s)]*?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\s)]*)?/gi);
      if (imgs) candidatos.push(...imgs.slice(0, 15));
    }

    // Dedup + resolve URLs relativas
    const base = new URL(url);
    const seen = new Set<string>();
    const resolvidas: string[] = [];
    for (const c of candidatos) {
      try {
        const abs = new URL(c, base).toString();
        if (!seen.has(abs)) {
          seen.add(abs);
          resolvidas.push(abs);
        }
      } catch {
        // ignora URLs malformadas
      }
    }
    return resolvidas;
  } catch {
    return [];
  }
}

interface Candidato {
  url: string;
  source: string;
  sourceUrl: string;
  peso: number;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { postId, fontes: fontesBody } = body || {};

  let fontes: string[] = [];
  let textoPost = "";

  if (Array.isArray(fontesBody) && fontesBody.length > 0) {
    fontes = fontesBody;
  } else if (postId) {
    const supabase = getSupabase();
    const { data: post, error } = await supabase
      .from("instagram_posts")
      .select("tema, slides_json, pesquisa_json")
      .eq("id", postId)
      .single();
    if (error || !post) {
      return NextResponse.json({ error: error?.message || "post não encontrado" }, { status: 404 });
    }
    const fs = post.pesquisa_json?.fontes;
    if (Array.isArray(fs)) fontes = fs;
    // Monta texto pra detectar produto mencionado (tema + todos os textos dos slides).
    textoPost = post.tema || "";
    if (Array.isArray(post.slides_json)) {
      for (const s of post.slides_json) {
        textoPost += " " + (s?.titulo || "") + " " + (s?.texto || "");
      }
    }
  } else {
    return NextResponse.json({ error: "postId ou fontes obrigatório" }, { status: 400 });
  }

  // Páginas oficiais Apple do produto detectado — entram no topo da lista.
  const urlsProduto = detectarProdutoUrls(textoPost);
  const fontesCombinadas = [...urlsProduto, ...fontes.filter((u) => !urlsProduto.includes(u))];

  if (fontesCombinadas.length === 0) {
    return NextResponse.json({ ok: true, imagens: [], aviso: "Nenhuma fonte disponível" });
  }

  // Ordena por prioridade (Apple produto > newsroom > outras Apple > tech sites).
  const fontesOrdenadas = fontesCombinadas
    .map((u) => ({ url: u, ...pesoDaFonte(u) }))
    .sort((a, b) => b.peso - a.peso);

  const todos: Candidato[] = [];
  await Promise.all(
    fontesOrdenadas.slice(0, 12).map(async (f) => {
      const imgs = await extrairImagens(f.url);
      for (const img of imgs) {
        todos.push({
          url: img,
          source: f.label,
          sourceUrl: f.url,
          peso: f.peso,
        });
      }
    })
  );

  // Dedup global: ignora query string (Apple usa ?v= como cache-buster). Preserva o primeiro.
  const seen = new Set<string>();
  const unicos = todos.filter((c) => {
    const chave = c.url.split("?")[0];
    if (seen.has(chave)) return false;
    seen.add(chave);
    return true;
  });

  // Filtra imagens obviamente ruins: icons, logos genéricos, sprites, SVGs pequenos.
  const filtrados = unicos.filter((c) => {
    if (/\/favicon/i.test(c.url)) return false;
    if (/\/logo(-|_|\.)/i.test(c.url)) return false;
    if (/sprite/i.test(c.url)) return false;
    if (/\/(icons?|glyph)\//i.test(c.url)) return false;
    if (/knowledge_graph/i.test(c.url)) return false;
    if (/structured-data/i.test(c.url)) return false;
    if (/apple-touch-icon/i.test(c.url)) return false;
    // Apple Support: filtra cards de categoria, setas, ícones sociais genéricos.
    if (/support-app-.*-general/i.test(c.url)) return false;
    if (/social-card/i.test(c.url)) return false;
    if (/arrow|chevron|caret|button/i.test(c.url)) return false;
    if (/category|categor[íi]a/i.test(c.url)) return false;
    // help.apple.com/assets/ sao screenshots pequenos do user guide
    // (setinhas verdes, ícones de menu, capturas de 200x150 etc). Nunca prestam.
    if (/help\.apple\.com\/assets/i.test(c.url)) return false;
    if (/cdsassets\.apple\.com\/live\/[A-Z0-9]+\/images\/social/i.test(c.url)) return false;
    // Apple usa nomes tipo "hero_large", "overview_hero" — prioriza esses.
    return true;
  });

  // Ordena: primeiro por peso da fonte, depois hero shots (apple.com/v/...) no topo.
  filtrados.sort((a, b) => {
    if (a.peso !== b.peso) return b.peso - a.peso;
    const aHero = /hero|overview|gallery/i.test(a.url) ? 1 : 0;
    const bHero = /hero|overview|gallery/i.test(b.url) ? 1 : 0;
    return bHero - aHero;
  });

  return NextResponse.json({
    ok: true,
    imagens: filtrados.slice(0, 24),
    totalFontes: fontesCombinadas.length,
    produtoDetectado: urlsProduto.length > 0 ? urlsProduto[0] : null,
  });
}
