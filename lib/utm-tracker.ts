// lib/utm-tracker.ts
// Captura UTM parameters da URL de entrada e persiste em localStorage por 30
// dias. Usado pra atribuir cada simulacao/venda a uma origem (Meta Ads,
// Instagram, Google, indicacao etc.).
//
// Fluxo:
//   1. Cliente chega via /troca?utm_source=meta&utm_campaign=lookalike
//   2. <UTMCapture/> roda no layout e chama captureAndPersistUTMs() que:
//      - Le UTMs da URL atual
//      - Se tem ao menos 1 UTM, salva no localStorage (sobrescreve qualquer
//        UTM antigo — atribuicao "last touch")
//   3. Em qualquer ponto (ao submeter simulacao, fechar venda etc.) chama
//      getStoredUTMs() pra incluir no payload da API.

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type UTMKey = typeof UTM_KEYS[number];
export type UTMs = Partial<Record<UTMKey, string>>;

const STORAGE_KEY = "tigrao_utm_v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

interface StoredUTMs {
  utms: UTMs;
  capturedAt: number; // timestamp ms
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function captureFromURL(search?: string): UTMs {
  if (!isBrowser() && !search) return {};
  const query = search ?? window.location.search;
  const params = new URLSearchParams(query);
  const utms: UTMs = {};
  for (const key of UTM_KEYS) {
    const v = params.get(key);
    if (v && v.trim()) utms[key] = v.trim().slice(0, 200); // trunca por seguranca
  }
  return utms;
}

export function getStoredUTMs(): UTMs {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredUTMs;
    if (!parsed || typeof parsed !== "object") return {};
    if (Date.now() - parsed.capturedAt > TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }
    return parsed.utms || {};
  } catch {
    return {};
  }
}

export function setStoredUTMs(utms: UTMs): void {
  if (!isBrowser()) return;
  if (Object.keys(utms).length === 0) return;
  const payload: StoredUTMs = { utms, capturedAt: Date.now() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch { /* quota / safari private mode */ }
}

/**
 * Captura UTMs da URL atual. Se houver, sobrescreve o que estava salvo
 * (atribuicao last-touch). Se a URL nao tiver UTMs, mantem o valor antigo.
 * Retorna o conjunto efetivo (nova URL ou o que ja estava salvo).
 */
export function captureAndPersistUTMs(): UTMs {
  if (!isBrowser()) return {};
  const fromURL = captureFromURL();
  if (Object.keys(fromURL).length > 0) {
    setStoredUTMs(fromURL);
    return fromURL;
  }
  return getStoredUTMs();
}

/**
 * Helper para includar UTMs no body de uma chamada de API. Filtra undefined
 * pra nao mandar campos vazios.
 */
export function withUTMs<T extends object>(body: T): T & UTMs {
  const utms = getStoredUTMs();
  const filtered: UTMs = {};
  for (const k of UTM_KEYS) {
    const v = utms[k];
    if (v) filtered[k] = v;
  }
  return { ...body, ...filtered };
}
