import { NextRequest, NextResponse, after } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getAccounts } from "@/lib/pluggy";

export const runtime = "nodejs";
export const maxDuration = 60;

// Webhook do Pluggy — recebe notificacao quando item muda de status, login
// expira, ou um auto-sync (a cada 8h por default) atualiza saldos.
//
// Configurar no painel Pluggy (https://dashboard.pluggy.ai → Webhooks):
// - URL:    https://<seu-dominio>/api/webhooks/pluggy
// - Event:  all (ou selecione item/* events)
// - Headers: Authorization = Bearer <PLUGGY_WEBHOOK_TOKEN>
//   (gerar token aleatorio no Vercel env vars: openssl rand -hex 32)
//
// Eventos tratados:
// - item/created          — log + atualiza atualizado_em
// - item/updated          — sync automatico de saldos (em background via after())
// - item/login_succeeded  — sync automatico
// - item/error            — marca status=LOGIN_ERROR + grava ultimo_sync_erro
// - item/waiting_user_input — marca status=WAITING_USER_INPUT (admin precisa MFA)
// - item/deleted          — marca ativo=false
//
// Eventos desconhecidos retornam 200 ok pra evitar Pluggy ficar reentando.
//
// Pluggy faz timeout em 5s. Por isso sync de saldos roda em background com
// after() — devolve 200 imediatamente e processa depois (ate maxDuration=60).
//
// Doc: https://docs.pluggy.ai/docs/webhooks

interface PluggyWebhookPayload {
  event: string;
  eventId?: string;
  itemId?: string;
  clientUserId?: string;
  triggeredBy?: string;
  error?: { code?: string; message?: string };
}

function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Valida o header Authorization contra PLUGGY_WEBHOOK_TOKEN.
 * Se a env var nao estiver configurada, aceita (modo dev) e loga warning.
 * Usa comparacao timing-safe pra nao vazar caractere a caractere via timing.
 */
function authValido(req: NextRequest): boolean {
  const expected = process.env.PLUGGY_WEBHOOK_TOKEN;
  if (!expected) {
    console.warn("[pluggy webhook] PLUGGY_WEBHOOK_TOKEN nao configurado — aceitando sem auth (DEV)");
    return true;
  }
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) {
    diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Sync de saldos pra um item. Executa apos o response do webhook ja ter
 * sido enviado (via after()) — Pluggy nao espera, e a gente tem ate
 * maxDuration=60s pra terminar.
 */
async function syncBancoEmBackground(
  supabase: SupabaseClient,
  conexaoId: number,
  itemId: string
): Promise<void> {
  try {
    const accounts = await getAccounts(itemId);
    const inserts = accounts.map((acc) => ({
      conexao_id: conexaoId,
      pluggy_account_id: acc.id,
      account_type: acc.type,
      account_subtype: acc.subtype,
      account_name: acc.marketingName || acc.name,
      saldo: acc.balance,
      credit_limite: acc.creditData?.creditLimit || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      raw: acc as any,
    }));
    if (inserts.length > 0) {
      const { error: insErr } = await supabase
        .from("bancos_saldos_historico")
        .insert(inserts);
      if (insErr) throw new Error(insErr.message);
    }
    await supabase
      .from("bancos_conexoes")
      .update({
        status: "UPDATED",
        ultimo_sync_em: new Date().toISOString(),
        ultimo_sync_status: "OK",
        ultimo_sync_erro: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", conexaoId);
    console.log(
      `[pluggy webhook] sync OK conexao=${conexaoId} item=${itemId} contas=${inserts.length}`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[pluggy webhook] sync FALHOU conexao=${conexaoId} item=${itemId}:`,
      msg
    );
    await supabase
      .from("bancos_conexoes")
      .update({
        ultimo_sync_em: new Date().toISOString(),
        ultimo_sync_status: "ERRO",
        ultimo_sync_erro: msg.slice(0, 500),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", conexaoId);
  }
}

export async function POST(req: NextRequest) {
  if (!authValido(req)) {
    console.warn("[pluggy webhook] unauthorized — header Authorization invalido");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PluggyWebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const event = payload.event || "";
  const itemId = payload.itemId || "";

  if (!event) {
    return NextResponse.json({ ok: true, ignored: "sem event" });
  }

  // Eventos sem itemId (ex: payment_intent/*) nao usamos no MVP.
  if (!itemId) {
    console.log(`[pluggy webhook] event=${event} sem itemId — ignorando`);
    return NextResponse.json({ ok: true, ignored: "sem itemId" });
  }

  const supabase = getSupabase();
  const { data: conexao } = await supabase
    .from("bancos_conexoes")
    .select("id, banco_nome")
    .eq("pluggy_item_id", itemId)
    .maybeSingle();

  if (!conexao) {
    // Pode ser um item criado direto no dashboard Pluggy (teste manual).
    // Retorna 200 pra Pluggy nao retentar.
    console.log(
      `[pluggy webhook] item ${itemId} nao registrado no banco (event=${event})`
    );
    return NextResponse.json({ ok: true, ignored: "item nao registrado" });
  }

  console.log(
    `[pluggy webhook] event=${event} item=${itemId} conexao=${conexao.id} (${conexao.banco_nome})`
  );

  try {
    if (event === "item/updated" || event === "item/login_succeeded") {
      // Sync EM BACKGROUND — Pluggy precisa de resposta em <5s.
      // after() executa o callback depois do response ser enviado.
      after(async () => {
        await syncBancoEmBackground(supabase, conexao.id, itemId);
      });
    } else if (event === "item/error") {
      await supabase
        .from("bancos_conexoes")
        .update({
          status: "LOGIN_ERROR",
          ultimo_sync_status: "ERRO",
          ultimo_sync_erro: (payload.error?.message || "Erro reportado pelo Pluggy").slice(0, 500),
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", conexao.id);
    } else if (event === "item/waiting_user_input") {
      await supabase
        .from("bancos_conexoes")
        .update({
          status: "WAITING_USER_INPUT",
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", conexao.id);
    } else if (event === "item/deleted") {
      await supabase
        .from("bancos_conexoes")
        .update({
          ativo: false,
          status: "DELETED",
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", conexao.id);
    } else if (event === "item/created") {
      // Normalmente registramos via /api/admin/bancos/connections (POST do front
      // logo apos o widget devolver itemId). Se Pluggy mandar antes, so toca
      // atualizado_em pra audit.
      await supabase
        .from("bancos_conexoes")
        .update({ atualizado_em: new Date().toISOString() })
        .eq("id", conexao.id);
    } else {
      // Eventos nao tratados (connector/status_updated, transactions/*, etc).
      // Loga e ignora — sempre retorna 200 pra Pluggy nao retentar.
      console.log(`[pluggy webhook] event=${event} nao tratado — ignorado`);
    }
  } catch (err) {
    console.error(`[pluggy webhook] erro processando event=${event}:`, err);
    // Mesmo em erro retorna 200 — Pluggy retry pode causar duplicate inserts.
    // Erros ja sao logados acima; admin pode fazer sync manual depois.
  }

  return NextResponse.json({ ok: true, event, itemId, conexao_id: conexao.id });
}

// GET pra testar que o endpoint esta vivo (Pluggy NAO usa GET, so debug humano)
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "pluggy-webhook",
    docs: "POST com payload Pluggy. Header 'Authorization: Bearer <PLUGGY_WEBHOOK_TOKEN>' obrigatorio em prod.",
    eventos_tratados: [
      "item/created",
      "item/updated",
      "item/login_succeeded",
      "item/error",
      "item/waiting_user_input",
      "item/deleted",
    ],
  });
}
