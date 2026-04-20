/**
 * Retorna a URL base canonica do site (sem trailing slash).
 *
 * Prioridade:
 * 1. NEXT_PUBLIC_SITE_URL (se nao for preview do Vercel)
 * 2. window.location.origin (se nao for preview do Vercel)
 * 3. Fallback: "https://www.tigraoimports.com"
 *
 * Motivacao: links de compra/pagamento gerados na UI nao podem usar URLs de
 * preview (tigrao-tradein.vercel.app) — o cliente precisa abrir o link no
 * dominio de producao. Quando admin acessa via preview pra testar, o link
 * gerado deve continuar apontando pro dominio real.
 */
const CANONICAL_FALLBACK = "https://www.tigraoimports.com";

function isPreviewUrl(url: string): boolean {
  return /\.vercel\.app(\/|$)/i.test(url);
}

export function getPublicBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl && !isPreviewUrl(envUrl)) {
    return envUrl.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    if (!isPreviewUrl(origin)) return origin;
  }
  return CANONICAL_FALLBACK;
}
