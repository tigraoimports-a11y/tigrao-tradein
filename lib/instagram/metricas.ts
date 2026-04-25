// Buscar metricas pos-publicacao do Instagram via Graph API.
//
// Item #25 — apos um post estar POSTADO no Instagram, queremos saber o
// quanto ele performou (curtidas, alcance, salvamentos) sem precisar
// abrir o app do Instagram a cada hora.
//
// Endpoint Graph API: /{ig-media-id}/insights?metric=...
// Doc: https://developers.facebook.com/docs/instagram-api/reference/ig-media/insights
//
// Reusa META_ACCESS_TOKEN ja configurado no Vercel (mesmo usado por
// lib/instagram/publicar.ts). Se token nao existir, retorna ERRO sem
// chamar a API — graceful degradation, equipe vê "—" na UI.

const GRAPH_BASE = "https://graph.facebook.com/v22.0";

export type MetricasStatus = "OK" | "ERRO";

export interface MetricasInstagram {
  status: MetricasStatus;
  likes: number | null;
  comments: number | null;
  reach: number | null;
  saves: number | null;
  shares: number | null;
  views: number | null;          // so pra Reels/Video
  atualizadoEm: string;          // ISO timestamp
  erro?: string;                 // mensagem human-readable se status=ERRO
}

interface GraphInsightItem {
  name: string;
  values?: Array<{ value: number }>;
}

interface GraphInsightResponse {
  data?: GraphInsightItem[];
  error?: { message?: string; code?: number };
}

const TIMEOUT_MS = 10000;

/**
 * Busca metricas de um post Instagram via Graph API.
 *
 * @param igMediaId — o instagram_post_id (ex: "17841234567890123") salvo
 *                    em instagram_posts.instagram_post_id quando o post foi
 *                    publicado.
 *
 * Comportamento:
 * - Token nao configurado → ERRO
 * - igMediaId vazio/null → ERRO
 * - Timeout 10s → ERRO
 * - Graph API erro (ex: post deletado, sem permissao) → ERRO
 * - Sucesso → OK + valores (alguns podem ser null se metric nao se aplica
 *   ao tipo de midia, ex: views so existe pra video/reel)
 *
 * Nunca lanca exception — sempre retorna objeto. Caller decide o que fazer.
 */
export async function buscarMetricasInstagram(igMediaId: string): Promise<MetricasInstagram> {
  const atualizadoEm = new Date().toISOString();
  const empty: Omit<MetricasInstagram, "status" | "atualizadoEm" | "erro"> = {
    likes: null, comments: null, reach: null, saves: null, shares: null, views: null,
  };

  if (!igMediaId || !igMediaId.trim()) {
    return { status: "ERRO", ...empty, atualizadoEm, erro: "instagram_post_id vazio (post nao foi publicado ainda?)" };
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return { status: "ERRO", ...empty, atualizadoEm, erro: "META_ACCESS_TOKEN nao configurado no servidor" };
  }

  // Lista de metricas que pedimos. Algumas podem nao retornar dependendo do
  // tipo de midia (ex: views so pra video). A API ignora silenciosamente as
  // metricas nao aplicaveis em vez de retornar erro.
  const metrics = ["likes", "comments", "reach", "saved", "shares", "views"].join(",");
  const url = `${GRAPH_BASE}/${encodeURIComponent(igMediaId)}/insights?metric=${metrics}&access_token=${encodeURIComponent(token)}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
    clearTimeout(timeoutId);

    const json: GraphInsightResponse = await res.json().catch(() => ({}));

    if (!res.ok || json.error) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      return { status: "ERRO", ...empty, atualizadoEm, erro: msg.slice(0, 200) };
    }

    // Mapeia retorno: array de { name, values: [{ value }] }
    const valueOf = (name: string): number | null => {
      const item = json.data?.find((d) => d.name === name);
      const v = item?.values?.[0]?.value;
      return typeof v === "number" ? v : null;
    };

    return {
      status: "OK",
      likes: valueOf("likes"),
      comments: valueOf("comments"),
      reach: valueOf("reach"),
      saves: valueOf("saved"),
      shares: valueOf("shares"),
      views: valueOf("views"),
      atualizadoEm,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    return {
      status: "ERRO",
      ...empty,
      atualizadoEm,
      erro: isAbort
        ? `Timeout (${TIMEOUT_MS / 1000}s) — Graph API lenta`
        : err instanceof Error ? err.message.slice(0, 200) : "Erro desconhecido",
    };
  }
}
