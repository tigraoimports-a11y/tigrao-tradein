// Cliente da API Infosimples — wrapper pra consulta IMEI/Celular Legal (Anatel).
//
// Usado pelo OCR de print (/api/link-compras/upload-print) pra verificar
// automaticamente se o IMEI extraido tem restricao (roubo/furto/perda)
// antes da equipe aprovar a venda do trade-in.
//
// Doc: https://infosimples.com/consultas/anatel-celular-legal/
// Custo: R$ 0,24/consulta (R$ 100/mes minimo, R$ 100 free pra novas contas).
//
// Token gerenciado via env var INFOSIMPLES_TOKEN (Vercel). Se nao estiver
// configurado, retorna ERRO sem chamar a API (graceful degradation — sistema
// continua funcionando, equipe vê "ERRO" e consulta manual).

export type ImeiStatus = "OK" | "BLOQUEADO" | "ERRO";

export interface ImeiConsultaResult {
  status: ImeiStatus;
  detalhes: string;          // mensagem human-readable pra mostrar pra equipe
  imei: string;              // o IMEI consultado (eco)
  responsavel?: string;      // operadora/responsavel pelo IMEI (quando OK)
  resultadoUrl?: string;     // URL da consulta oficial pra auditoria
  consultadoEm: string;      // ISO timestamp
}

// Endpoint Infosimples — Anatel/Celular Legal
// Padrao de URL: https://api.infosimples.com/api/v2/consultas/anatel/celular-legal
const INFOSIMPLES_ENDPOINT = "https://api.infosimples.com/api/v2/consultas/anatel/celular-legal";

// Timeout por tentativa. Infosimples pode demorar 10-30s em consultas cold
// (primeira chamada do dia ou Anatel lenta). Reduzido de 45s pra 30s pra
// caber em 2 tentativas dentro do maxDuration=90s do upload-print.
//
// Estrategia atual: 1ª tentativa 30s → se timeout, espera 1s → 2ª tentativa
// 30s. Total worst-case 61s, abaixo do maxDuration. Em consultas normais
// (1.5s tipico) nao ha overhead.
const TIMEOUT_MS = 30000;
const RETRY_DELAY_MS = 1000;

/**
 * Consulta um IMEI na API Infosimples (Anatel/Celular Legal).
 *
 * Comportamento:
 * - IMEI valido + sem restricao → status='OK'
 * - IMEI valido COM restricao → status='BLOQUEADO' + detalhes do motivo
 * - Token nao configurado, IMEI invalido, Infosimples fora, timeout → status='ERRO'
 *
 * Nunca lanca exceptions — sempre retorna um objeto. Caller decide o que fazer
 * com 'ERRO' (recomendado: nao bloquear o fluxo, equipe consulta manual).
 */
export async function consultarImei(imei: string): Promise<ImeiConsultaResult> {
  const consultadoEm = new Date().toISOString();
  const imeiNorm = (imei || "").replace(/\D/g, "");

  // Validacao basica — IMEI valido tem 15 digitos
  if (imeiNorm.length !== 15) {
    return {
      status: "ERRO",
      detalhes: `IMEI invalido (${imeiNorm.length} digitos, esperado 15)`,
      imei: imeiNorm,
      consultadoEm,
    };
  }

  const token = process.env.INFOSIMPLES_TOKEN;
  if (!token) {
    console.error("[infosimples] INFOSIMPLES_TOKEN nao configurado");
    return {
      status: "ERRO",
      detalhes: "Token Infosimples nao configurado no servidor",
      imei: imeiNorm,
      consultadoEm,
    };
  }

  // 1ª tentativa
  const primeira = await tentarConsulta(token, imeiNorm, consultadoEm);

  // Retry SO se for falha transitoria (timeout ou HTTP 5xx).
  // Erros "estaveis" tipo IMEI invalido (4xx) nao adianta tentar de novo.
  if (primeira.transitoria) {
    console.log(`[infosimples] retry apos ${primeira.razao} — IMEI=${imeiNorm.slice(-4)}`);
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    const segunda = await tentarConsulta(token, imeiNorm, new Date().toISOString());
    if (segunda.result.status !== "ERRO") {
      console.log(`[infosimples] retry SUCESSO — IMEI=${imeiNorm.slice(-4)}`);
    }
    return segunda.result;
  }

  return primeira.result;
}

// Faz UMA tentativa de consulta. Retorna o resultado + sinalizacao se a
// falha (caso tenha) e transitoria (justifica retry) ou estavel (nao adianta).
async function tentarConsulta(
  token: string,
  imeiNorm: string,
  consultadoEm: string
): Promise<{ result: ImeiConsultaResult; transitoria: boolean; razao?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Infosimples espera token + parametros como QUERY STRING (nao body JSON).
    // Confirmado na area de Testes: a URL gerada e
    //   /api/v2/consultas/anatel/celular-legal?token=...&timeout=N&imei=...
    // timeout=30 → maximo 30s do lado do Infosimples processar (alinhado com
    // o nosso AbortController pra nao ficar pendurado depois do nosso timeout)
    // ignore_site_receipt=0 → grava recibo da consulta no historico (auditoria)
    const url = new URL(INFOSIMPLES_ENDPOINT);
    url.searchParams.set("token", token);
    url.searchParams.set("timeout", String(Math.floor(TIMEOUT_MS / 1000)));
    url.searchParams.set("ignore_site_receipt", "0");
    url.searchParams.set("imei", imeiNorm);

    const res = await fetch(url.toString(), {
      method: "POST",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[infosimples] HTTP ${res.status}: ${txt.slice(0, 200)}`);
      // 5xx geralmente sao transitorios (servidor sobrecarregado, etc).
      // 4xx sao "voce errou" e nao adianta retry.
      const transitoria = res.status >= 500;
      return {
        result: {
          status: "ERRO",
          detalhes: `Infosimples retornou HTTP ${res.status}`,
          imei: imeiNorm,
          consultadoEm,
        },
        transitoria,
        razao: `HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    // Estrutura padrao Infosimples:
    // { code: 200, code_message: "OK", data: [{ imei, responsavel, resultado, resultado_url, ... }] }
    // code 200 = sucesso na consulta. 400+ = erro
    const code = json?.code;
    if (typeof code !== "number" || code >= 400) {
      console.error(`[infosimples] code=${code}, msg=${json?.code_message}`);
      return {
        result: {
          status: "ERRO",
          detalhes: `Infosimples: ${json?.code_message || `code ${code}`}`,
          imei: imeiNorm,
          consultadoEm,
        },
        transitoria: false, // erro de logica/dados, nao adianta retry
      };
    }

    const item = Array.isArray(json?.data) ? json.data[0] : null;
    if (!item) {
      return {
        result: {
          status: "ERRO",
          detalhes: "Infosimples retornou sem dados",
          imei: imeiNorm,
          consultadoEm,
        },
        transitoria: false,
      };
    }

    const resultado: string = String(item.resultado || "").toLowerCase().trim();
    const responsavel: string | undefined = item.responsavel || undefined;
    const resultadoUrl: string | undefined = item.resultado_url || undefined;

    // Heuristica pra interpretar `resultado` da Anatel:
    // "Regular" / "Aparelho regular" / "Sem restricao" → OK
    // "Restricao" / "Bloqueado" / "Roubado" / "Furtado" / "Perda" → BLOQUEADO
    // Outros (texto desconhecido) → tratamos como OK + log pra auditoria depois
    const palavrasBloqueio = ["restric", "bloque", "roub", "furt", "perd", "irregular", "impedid"];
    const isBloqueado = palavrasBloqueio.some((p) => resultado.includes(p));

    if (isBloqueado) {
      return {
        result: {
          status: "BLOQUEADO",
          detalhes: `⚠️ ${item.resultado || "Aparelho com restricao"} — NAO COMPRAR`,
          imei: imeiNorm,
          responsavel,
          resultadoUrl,
          consultadoEm,
        },
        transitoria: false,
      };
    }

    return {
      result: {
        status: "OK",
        detalhes: item.resultado || "Aparelho regular, sem restricao",
        imei: imeiNorm,
        responsavel,
        resultadoUrl,
        consultadoEm,
      },
      transitoria: false,
    };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === "AbortError";
    const msg = isAbort ? `Timeout (${TIMEOUT_MS}ms)` : (err instanceof Error ? err.message : String(err));
    console.error(`[infosimples] Falha: ${msg}`);
    // Timeout e erro de rede sao transitorios — vale a pena tentar de novo.
    return {
      result: {
        status: "ERRO",
        detalhes: isAbort ? `Infosimples nao respondeu em ${TIMEOUT_MS / 1000}s` : `Falha de rede: ${msg.slice(0, 150)}`,
        imei: imeiNorm,
        consultadoEm,
      },
      transitoria: true,
      razao: isAbort ? "timeout" : "rede",
    };
  }
}

/**
 * Helper pra formatar o status visualmente (✅ ❌ ⚠️) pra texto WhatsApp ou UI.
 */
export function formatarStatusImei(status: ImeiStatus | null | undefined): string {
  if (status === "OK") return "✅ Verificado";
  if (status === "BLOQUEADO") return "❌ BLOQUEADO";
  if (status === "ERRO") return "⚠️ Consultar manual";
  return "—";
}
