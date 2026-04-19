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
  { pattern: /apple\.com\/br\/newsroom/i, peso: 100, label: "Apple Newsroom BR" },
  { pattern: /apple\.com\/newsroom/i, peso: 95, label: "Apple Newsroom" },
  { pattern: /apple\.com\/br\//i, peso: 90, label: "Apple Brasil" },
  { pattern: /apple\.com\//i, peso: 80, label: "Apple" },
  { pattern: /support\.apple\.com/i, peso: 70, label: "Apple Support" },
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

    // Apple newsroom tem galeria com <img src=".../download-gallery/...">
    if (/apple\.com\/.*newsroom/i.test(url)) {
      const imgs = html.match(/https:\/\/[^"']+apple\.com[^"']+\.(?:jpg|jpeg|png|webp)(?:\?[^"']*)?/gi);
      if (imgs) candidatos.push(...imgs.slice(0, 5));
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

  if (Array.isArray(fontesBody) && fontesBody.length > 0) {
    fontes = fontesBody;
  } else if (postId) {
    const supabase = getSupabase();
    const { data: post, error } = await supabase
      .from("instagram_posts")
      .select("pesquisa_json")
      .eq("id", postId)
      .single();
    if (error || !post) {
      return NextResponse.json({ error: error?.message || "post não encontrado" }, { status: 404 });
    }
    const fs = post.pesquisa_json?.fontes;
    if (Array.isArray(fs)) fontes = fs;
  } else {
    return NextResponse.json({ error: "postId ou fontes obrigatório" }, { status: 400 });
  }

  if (fontes.length === 0) {
    return NextResponse.json({ ok: true, imagens: [], aviso: "Nenhuma fonte disponível" });
  }

  // Ordena fontes por prioridade (Apple > tech sites > outros).
  const fontesOrdenadas = [...fontes]
    .map((u) => ({ url: u, ...pesoDaFonte(u) }))
    .sort((a, b) => b.peso - a.peso);

  const todos: Candidato[] = [];
  await Promise.all(
    fontesOrdenadas.slice(0, 10).map(async (f) => {
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

  // Dedup global por URL da imagem, preservando o primeiro (que tem maior peso).
  const seen = new Set<string>();
  const unicos = todos.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  // Filtra imagens obviamente ruins: icons, logos genericos, muito pequenas conhecidas.
  const filtrados = unicos.filter((c) => {
    if (/\/favicon/i.test(c.url)) return false;
    if (/\/logo(-|_|\.)/i.test(c.url)) return false;
    if (/sprite/i.test(c.url)) return false;
    return true;
  });

  // Reordena por peso da fonte (Apple primeiro).
  filtrados.sort((a, b) => b.peso - a.peso);

  return NextResponse.json({
    ok: true,
    imagens: filtrados.slice(0, 20),
    totalFontes: fontes.length,
  });
}
