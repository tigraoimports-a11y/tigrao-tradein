// Cliente Pluggy (https://pluggy.ai) — Open Finance BR.
//
// Usado pelo item #28 (sync automatico de saldos bancarios) pra substituir
// digitacao manual em /admin/auditoria.
//
// Fluxo de uso:
// 1. Admin cria conta no Pluggy + pega CLIENT_ID + CLIENT_SECRET
// 2. Configura como env vars no Vercel: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET
// 3. Admin clica "Conectar banco" → backend chama POST /connect_token
// 4. Frontend abre Pluggy Connect Widget com o token → admin autoriza
// 5. Pluggy retorna item_id → guardamos em bancos_conexoes
// 6. Periodicamente (manual via botao ou cron diario) fazemos sync pra
//    pegar saldos atualizados de cada item
//
// Doc: https://docs.pluggy.ai

const PLUGGY_BASE = "https://api.pluggy.ai";
const TIMEOUT_MS = 15000;

// Cache do API key (validade 2h). Pluggy auth nao e Bearer token tradicional —
// gera um "X-API-KEY" usando clientId+secret que vale 2h.
let cachedApiKey: { key: string; expiresAt: number } | null = null;

interface AuthResp {
  apiKey: string;
}

interface PluggyConnector {
  id: number;
  name: string;
  imageUrl?: string;
  primaryColor?: string;
  type?: string;
  country?: string;
}

export interface PluggyItem {
  id: string;
  status: string;
  connector: PluggyConnector;
  createdAt?: string;
  updatedAt?: string;
  lastUpdatedAt?: string;
  executionStatus?: string;
  error?: { code?: string; message?: string };
}

export interface PluggyAccount {
  id: string;
  type: "BANK" | "CREDIT" | string;
  subtype: string;
  name: string;
  marketingName?: string | null;
  number?: string | null;
  balance: number;
  itemId: string;
  currencyCode: string;
  // Pra cartao de credito
  creditData?: {
    creditLimit?: number;
    availableCreditLimit?: number;
    balanceCloseDate?: string;
    balanceDueDate?: string;
  };
}

interface ListResp<T> {
  results: T[];
  total?: number;
}

/**
 * Faz auth na Pluggy e retorna apiKey valida (cacheia por ate 2h).
 * Token e necessario pra TODAS as chamadas da Pluggy API.
 */
async function getApiKey(): Promise<string> {
  if (cachedApiKey && cachedApiKey.expiresAt > Date.now() + 60000) {
    return cachedApiKey.key;
  }

  const clientId = process.env.PLUGGY_CLIENT_ID;
  const clientSecret = process.env.PLUGGY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PLUGGY_CLIENT_ID ou PLUGGY_CLIENT_SECRET nao configurados");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${PLUGGY_BASE}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Pluggy auth HTTP ${res.status}: ${txt.slice(0, 200)}`);
    }

    const json: AuthResp = await res.json();
    if (!json.apiKey) {
      throw new Error("Pluggy auth sem apiKey no response");
    }

    // Pluggy diz que apiKey vale 2h. Pra ser conservador cacheia por 1h45.
    cachedApiKey = { key: json.apiKey, expiresAt: Date.now() + 105 * 60 * 1000 };
    return json.apiKey;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Faz request autenticada na API Pluggy. Lida com expiracao do apiKey
 * (re-auth e tenta de novo 1x se receber 401/403).
 */
async function pluggyFetch(
  path: string,
  init: RequestInit & { _retry?: boolean } = {}
): Promise<Response> {
  const key = await getApiKey();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${PLUGGY_BASE}${path}`, {
      ...init,
      headers: {
        "X-API-KEY": key,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    // Re-auth + retry 1x se token expirou
    if ((res.status === 401 || res.status === 403) && !init._retry) {
      cachedApiKey = null;
      return pluggyFetch(path, { ...init, _retry: true });
    }

    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Cria um connect_token efemero (validade 30min) pro Pluggy Connect Widget
 * abrir no frontend. Cada admin que vai conectar um banco precisa de um.
 *
 * @param itemId — opcional, se passado o widget abre em modo "atualizar
 *                 conexao existente" (pra re-autenticar quando login muda)
 */
export async function criarConnectToken(itemId?: string): Promise<{ accessToken: string }> {
  const body: Record<string, unknown> = {};
  if (itemId) body.itemId = itemId;
  const res = await pluggyFetch(`/connect_token`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Pluggy connect_token HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Busca metadados de um item (status, connector info). Usado depois que o
 * widget retorna um itemId pra registrar no nosso banco.
 */
export async function getItem(itemId: string): Promise<PluggyItem> {
  const res = await pluggyFetch(`/items/${encodeURIComponent(itemId)}`);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Pluggy GET item HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Lista todas accounts (contas) de um item (banco). Um banco pode ter:
 * - Conta corrente (BANK / CHECKING_ACCOUNT)
 * - Poupanca (BANK / SAVINGS_ACCOUNT)
 * - Cartao de credito (CREDIT / CREDIT_CARD)
 */
export async function getAccounts(itemId: string): Promise<PluggyAccount[]> {
  const res = await pluggyFetch(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Pluggy GET accounts HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json: ListResp<PluggyAccount> = await res.json();
  return json.results || [];
}

/**
 * Forca atualizacao do item (pede pra Pluggy reconectar e baixar novos
 * dados). E assincrono — o status fica UPDATING e depois UPDATED.
 *
 * Pra MVP simplesmente chamamos getAccounts logo apos pra pegar o que
 * tiver — Pluggy ja mantem cache fresco se item foi sincronizado nas
 * ultimas horas.
 */
export async function refreshItem(itemId: string): Promise<PluggyItem> {
  const res = await pluggyFetch(`/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Pluggy refresh item HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Mapeia o connector.name do Pluggy pra nosso alias interno (ITAU,
 * INFINITE, MERCADO_PAGO, etc). Se nao reconhecer, devolve "OUTRO".
 *
 * Pluggy connector names sao tipo "Itau", "Itau Personnalite", "Mercado Pago",
 * "Nubank", etc. Lista completa: https://api.pluggy.ai/connectors
 */
export function aliasParaConnectorName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("itau") || n.includes("itaú")) {
    if (n.includes("personnalit") || n.includes("infinite") || n.includes("private")) {
      return "INFINITE";
    }
    return "ITAU";
  }
  if (n.includes("mercado pago") || n.includes("mercadopago") || n.includes("mp ")) return "MERCADO_PAGO";
  if (n.includes("nubank")) return "NUBANK";
  if (n.includes("inter")) return "INTER";
  if (n.includes("bradesco")) return "BRADESCO";
  if (n.includes("caixa")) return "CAIXA";
  if (n.includes("santander")) return "SANTANDER";
  if (n.includes("bb") || n.includes("banco do brasil")) return "BB";
  if (n.includes("c6")) return "C6";
  if (n.includes("safra")) return "SAFRA";
  if (n.includes("xp")) return "XP";
  return "OUTRO";
}
