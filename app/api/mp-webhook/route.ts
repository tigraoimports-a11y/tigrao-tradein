import { NextResponse } from "next/server";
import { notifyPagamentoAprovado } from "@/lib/zapi";

// ============================================================
// MP Webhook — recebe notificações de mudança de status
// ============================================================
// Endpoint chamado pelo Mercado Pago quando um pagamento muda
// de status (aprovado, recusado, estornado, etc.).
//
// Aponta pra cá via `notification_url` em /api/admin/mp-preference.
//
// Fluxo quando chega notificação de pagamento aprovado:
//   1. MP POST com { type: "payment", data: { id } }
//   2. Buscamos detalhes do pagamento via GET /v1/payments/{id}
//   3. Se status=approved → buscamos link_compras pelo external_reference
//      (que é o short_code).
//   4. Fluxo INVERTIDO (cliente preencheu formulário antes de pagar —
//      cliente_dados_preenchidos existe): NÃO notifica o grupo. O próprio
//      cliente vai abrir o WhatsApp do vendedor via /pagamento-confirmado
//      com a mensagem completa + comprovante.
//   5. Fluxo ANTIGO (Link MP direto, sem formulário): notifica o grupo
//      com formato compacto pra avisar a equipe que um pagamento chegou.
//   6. Tudo é "best-effort": qualquer erro é logado mas não bloqueia a
//      resposta 200 pro MP (se a gente retornasse 500, o MP reagendaria
//      e a gente tomaria notificação duplicada depois).
//
// MP envia 2 tipos de request:
//   1. GET de validação (health-check) — retornar 200
//   2. POST com payload { action, data: { id }, type, ... }
//
// IMPORTANTE: MP exige resposta 200 em <22s ou considera falha.
// ============================================================

// GET: health-check do MP
export async function GET() {
  return NextResponse.json({ ok: true });
}

interface MpPayment {
  id: number | string;
  status: string; // "approved" | "pending" | "rejected" | ...
  external_reference?: string;
  transaction_amount?: number;
  installments?: number;
  payer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: { area_code?: string; number?: string };
  };
  additional_info?: {
    items?: Array<{ title?: string }>;
  };
}

async function fetchPayment(paymentId: string): Promise<MpPayment | null> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error("[mp-webhook] MP_ACCESS_TOKEN não configurado — não consigo buscar pagamento");
    return null;
  }
  try {
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.error("[mp-webhook] erro ao buscar pagamento MP:", res.status, await res.text().catch(() => ""));
      return null;
    }
    return (await res.json()) as MpPayment;
  } catch (err) {
    console.error("[mp-webhook] exceção ao buscar pagamento:", err);
    return null;
  }
}

async function handleApprovedPayment(paymentId: string) {
  const payment = await fetchPayment(paymentId);
  if (!payment) return;
  if (payment.status !== "approved") {
    console.log(`[mp-webhook] payment ${paymentId} status=${payment.status} — ignorando`);
    return;
  }

  const externalRef = payment.external_reference || "";
  if (!externalRef) {
    console.log(`[mp-webhook] payment ${paymentId} sem external_reference — pulando notificação`);
    return;
  }

  // external_reference é o short_code do link_compras (ou um fallback gerado).
  // Buscamos o link_compras COMPLETO — se o cliente preencheu o formulário
  // antes de pagar (fluxo invertido), temos endereço, troca, entrega etc e
  // podemos montar uma notificação idêntica ao que ele enviaria pelo WhatsApp.
  const { supabase } = await import("@/lib/supabase");
  const { data: link } = await supabase
    .from("link_compras")
    .select("*")
    .eq("short_code", externalRef)
    .maybeSingle();

  if (!link) {
    console.log(`[mp-webhook] link_compras não encontrado para ref=${externalRef} — skip`);
    return;
  }

  // Evita notificar 2x o mesmo pagamento (MP pode reenviar webhooks).
  if (link.notificado_pago) {
    console.log(`[mp-webhook] link ${link.id} já notificado — skip`);
    return;
  }

  // Fallback de dados do cliente: se o link_compras ainda não tem nome/telefone
  // (cliente pagou antes de preencher o formulário), usamos o que o MP sabe
  // sobre o pagador (nome do cartão, telefone de cadastro, etc).
  const nomeMp = [payment.payer?.first_name, payment.payer?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const telefoneMp =
    payment.payer?.phone?.area_code && payment.payer?.phone?.number
      ? `(${payment.payer.phone.area_code}) ${payment.payer.phone.number}`
      : null;

  // Fluxo invertido (cliente preencheu formulário ANTES de pagar):
  // NÃO notificamos o grupo aqui — o próprio cliente vai abrir o WhatsApp
  // do vendedor (via /pagamento-confirmado) com a mensagem COMPLETA e o
  // comprovante MP. Notificar o grupo aqui geraria duplicidade e roubaria
  // o pedido do vendedor que gerou o link.
  //
  // Só disparamos notificação pro grupo no fluxo ANTIGO (cliente pagou
  // Link MP sem preencher formulário antes — não sabemos quem ele é).
  const snapshot = (link.cliente_dados_preenchidos ?? null) as Record<string, unknown> | null;
  const temFormularioCompleto = !!snapshot && !!snapshot.cliente;

  let ok = false;

  if (temFormularioCompleto) {
    // Fluxo invertido: cliente já foi redirecionado pro /pagamento-confirmado
    // que abre o WhatsApp do vendedor. Nada pra notificar aqui.
    console.log(
      `[mp-webhook] fluxo invertido: link ${link.id} (short=${link.short_code}) ` +
        `tem formulário preenchido — cliente vai abrir WhatsApp do vendedor direto. ` +
        `Skip notificação do grupo.`
    );
    ok = true; // marcamos como notificado mesmo (não tem o que enviar)
  } else {
    // Fluxo antigo (Link MP direto sem formulário):
    // Usa formato compacto (só cliente/produto/valor) pro grupo — não temos
    // dados completos ainda. A ideia é alertar a equipe que um pagamento
    // chegou e o cliente ainda vai preencher o /compra.
    ok = await notifyPagamentoAprovado({
      cliente: link.cliente_nome || nomeMp || "Cliente (aguardando formulário)",
      telefone: link.cliente_telefone || telefoneMp,
      produto: link.produto || "Produto",
      valor: Number(payment.transaction_amount || link.valor || 0),
      parcelas: payment.installments ? String(payment.installments) : link.parcelas,
      shortCode: link.short_code,
      mpPaymentId: String(payment.id),
    });
  }

  // Marca como notificado no banco pra evitar duplicatas
  if (ok) {
    await supabase
      .from("link_compras")
      .update({
        notificado_pago: true,
        notificado_pago_em: new Date().toISOString(),
        mp_payment_id: String(payment.id),
      })
      .eq("id", link.id);
  }
}

// POST: notificação de evento
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = request.headers.get("x-topic") || body?.type || "unknown";
    const id = body?.data?.id || body?.id || "unknown";

    // Log estruturado pra depuração no Vercel.
    console.log("[mp-webhook]", {
      topic,
      action: body?.action,
      id,
      live_mode: body?.live_mode,
      date_created: body?.date_created,
    });

    // Só processamos eventos de "payment". Outros tipos (merchant_order, etc)
    // só logam e seguem. Processamento é fire-and-forget: respondemos 200 imediato
    // e disparamos notificação em background pra não estourar o timeout de 22s do MP.
    if (topic === "payment" && id && id !== "unknown") {
      handleApprovedPayment(String(id)).catch((err) =>
        console.error("[mp-webhook] erro no handler assíncrono:", err)
      );
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[mp-webhook] erro ao processar:", err);
    // Retornamos 200 mesmo com erro interno pra MP não reagendar —
    // se a gente não conseguiu parsear, reagendar não resolve.
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
