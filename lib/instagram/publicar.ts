// Publicacao de carrossel no Instagram via Graph API (login do Instagram).
// Usado pelo endpoint /api/instagram/publicar (admin) e pelo cron de agendados.
// Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing/

import { createClient } from "@supabase/supabase-js";

const GRAPH_BASE = "https://graph.instagram.com/v22.0";

type GraphResp = { id?: string; status_code?: string; permalink?: string; error?: { message?: string } };

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

async function graphJson(url: string, init?: RequestInit): Promise<GraphResp> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.error?.message || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return j as GraphResp;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Instagram demora alguns segundos pra preparar cada container. O status_code
// comeca como IN_PROGRESS e vira FINISHED quando fica pronto pra publicar.
async function waitFinished(containerId: string, token: string, timeoutMs = 90_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const r = await graphJson(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`
    );
    if (r.status_code === "FINISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") {
      throw new Error(`container ${containerId} com status ${r.status_code}`);
    }
    await sleep(3000);
  }
  throw new Error(`container ${containerId} não ficou FINISHED em ${Math.round(timeoutMs / 1000)}s`);
}

function buildCaption(legenda: string | null, hashtags: string[] | null): string {
  const parts: string[] = [];
  if (legenda?.trim()) parts.push(legenda.trim());
  if (hashtags && hashtags.length > 0) {
    parts.push(hashtags.map((h) => `#${h.replace(/^#+/, "")}`).join(" "));
  }
  return parts.join("\n\n").slice(0, 2200);
}

export async function publicarPostNoInstagram(postId: string) {
  const token = process.env.META_ACCESS_TOKEN;
  const igUserId = process.env.IG_BUSINESS_ACCOUNT_ID;
  if (!token || !igUserId) {
    throw new Error("META_ACCESS_TOKEN ou IG_BUSINESS_ACCOUNT_ID não configurados no Vercel");
  }

  const supabase = getSupabase();
  const { data: post, error: postErr } = await supabase
    .from("instagram_posts")
    .select("*")
    .eq("id", postId)
    .single();
  if (postErr || !post) {
    throw new Error(postErr?.message || "post não encontrado");
  }

  const urls = Array.isArray(post.imagens_urls) ? (post.imagens_urls as string[]) : [];
  if (urls.length < 2) {
    throw new Error("post precisa ter pelo menos 2 imagens renderizadas (carrossel)");
  }
  if (urls.length > 10) {
    throw new Error(`carrossel aceita no máximo 10 imagens (tem ${urls.length})`);
  }

  const caption = buildCaption(post.legenda, post.hashtags);

  // 1. Cria child containers (um por imagem).
  const childIds: string[] = [];
  for (const url of urls) {
    const params = new URLSearchParams({
      image_url: url,
      is_carousel_item: "true",
      access_token: token,
    });
    const r = await graphJson(`${GRAPH_BASE}/${igUserId}/media?${params.toString()}`, { method: "POST" });
    if (!r.id) throw new Error("sem id retornado pro child container");
    childIds.push(String(r.id));
  }

  // 2. Aguarda todos os children ficarem FINISHED.
  for (const childId of childIds) {
    await waitFinished(childId, token);
  }

  // 3. Cria container parent do tipo CAROUSEL.
  const parentParams = new URLSearchParams({
    media_type: "CAROUSEL",
    children: childIds.join(","),
    caption,
    access_token: token,
  });
  const parent = await graphJson(`${GRAPH_BASE}/${igUserId}/media?${parentParams.toString()}`, { method: "POST" });
  if (!parent.id) throw new Error("sem id retornado pro container CAROUSEL");

  // 4. Aguarda parent FINISHED.
  await waitFinished(parent.id, token);

  // 5. Publica.
  const publishParams = new URLSearchParams({
    creation_id: parent.id,
    access_token: token,
  });
  const pub = await graphJson(
    `${GRAPH_BASE}/${igUserId}/media_publish?${publishParams.toString()}`,
    { method: "POST" }
  );
  if (!pub.id) throw new Error("sem id retornado ao publicar");

  // 6. Busca permalink (best-effort).
  let permalink: string | null = null;
  try {
    const r = await graphJson(
      `${GRAPH_BASE}/${pub.id}?fields=permalink&access_token=${encodeURIComponent(token)}`
    );
    permalink = r.permalink ?? null;
  } catch {
    // permalink eh best-effort, nao derruba o publish.
  }

  // 7. Marca como POSTADO.
  await supabase
    .from("instagram_posts")
    .update({
      status: "POSTADO",
      postado_em: new Date().toISOString(),
      instagram_post_id: String(pub.id),
      instagram_permalink: permalink,
      erro: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", postId);

  return { instagram_post_id: String(pub.id), permalink };
}
