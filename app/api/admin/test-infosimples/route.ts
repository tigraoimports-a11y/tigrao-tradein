import { NextResponse } from "next/server";
import { consultarImei } from "@/lib/infosimples";

export const runtime = "nodejs";
// Infosimples pode demorar 30-45s em consultas cold. Vercel hobby permite 10s,
// pro 60s. Forcamos maxDuration=60 pra ter margem na chamada raw + helper.
export const maxDuration = 60;

/**
 * Endpoint de diagnostico pra Infosimples (Anatel/Celular Legal).
 *
 * Uso: GET /api/admin/test-infosimples?password=XXX&imei=YYY
 *
 * Retorna JSON verbose com:
 * - se o token esta configurado e tamanho
 * - resposta crua da Infosimples (status HTTP, body)
 * - resultado final do helper consultarImei
 *
 * Util pra debugar quando IMEI volta como ⚠️ Consultar manual em producao.
 *
 * IMPORTANTE: nao loga o token completo, so primeiros 8 chars + tamanho.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const password = url.searchParams.get("password");
  const imei = url.searchParams.get("imei") || "";

  if (password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized — passe ?password=XXX na URL" }, { status: 401 });
  }

  const token = process.env.INFOSIMPLES_TOKEN;
  const tokenInfo = {
    configurado: !!token,
    tamanho: token?.length || 0,
    preview: token ? `${token.slice(0, 8)}...${token.slice(-4)}` : null,
  };

  // Se nao tem IMEI no query, so retorna info do token
  if (!imei) {
    return NextResponse.json({
      step: "token_check",
      token: tokenInfo,
      hint: "Passe ?imei=357999607365980 pra fazer consulta de teste",
    });
  }

  // Faz a consulta usando o helper oficial
  const consultaResult = await consultarImei(imei);

  // Faz tambem uma chamada DIRETA crua pra ver o que a Infosimples retorna,
  // se token estiver configurado. Util quando o helper retorna ERRO sem
  // detalhes claros.
  let rawCall: {
    url?: string;
    status?: number;
    statusText?: string;
    body?: unknown;
    error?: string;
    durationMs?: number;
  } | null = null;

  if (token) {
    const startMs = Date.now();
    try {
      const apiUrl = new URL("https://api.infosimples.com/api/v2/consultas/anatel/celular-legal");
      apiUrl.searchParams.set("token", token);
      // timeout=30 → Infosimples espera no maximo 30s (em vez de 600s) — evita
      // travar a funcao Vercel ate o limite de maxDuration
      apiUrl.searchParams.set("timeout", "30");
      apiUrl.searchParams.set("ignore_site_receipt", "0");
      apiUrl.searchParams.set("imei", imei.replace(/\D/g, ""));

      // URL "publica" (sem expor o token completo nos logs)
      const safeUrl = apiUrl.toString().replace(token, `${token.slice(0, 8)}...REDACTED`);

      // Timeout local de 50s — fica abaixo do maxDuration=60 da rota
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 50000);

      const res = await fetch(apiUrl.toString(), {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const bodyText = await res.text();
      let bodyParsed: unknown = bodyText;
      try {
        bodyParsed = JSON.parse(bodyText);
      } catch {
        // mantem como texto se nao for JSON
      }

      rawCall = {
        url: safeUrl,
        status: res.status,
        statusText: res.statusText,
        body: bodyParsed,
        durationMs: Date.now() - startMs,
      };
    } catch (e) {
      const isAbort = e instanceof Error && e.name === "AbortError";
      rawCall = {
        error: isAbort ? `Timeout apos ${Date.now() - startMs}ms (limite 50s)` : e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startMs,
      };
    }
  }

  return NextResponse.json({
    step: "consulta_completa",
    token: tokenInfo,
    helper: consultaResult,
    rawApiCall: rawCall,
    hint: rawCall?.status === 200
      ? "Resposta veio. Veja rawApiCall.body pra ver o resultado oficial da Anatel."
      : "Veja rawApiCall pra entender o que voltou da Infosimples.",
  });
}
