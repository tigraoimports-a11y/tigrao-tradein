import { NextResponse } from "next/server";

// ============================================================
// MP Webhook — recebe notificações de mudança de status
// ============================================================
// Endpoint chamado pelo Mercado Pago quando um pagamento muda
// de status (aprovado, recusado, estornado, etc.).
//
// Requerido pela "Qualidade da Integração" do MP (ação obrigatória).
// Aponta pra cá via `notification_url` em /api/admin/mp-preference.
//
// Por enquanto só loga o evento e retorna 200. Futuramente podemos:
//   - Registrar em activity_log
//   - Atualizar status de pedido em vendas
//   - Enviar notificação pro vendedor via WhatsApp/Telegram
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

// POST: notificação de evento
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const topic = request.headers.get("x-topic") || body?.type || "unknown";
    const id = body?.data?.id || body?.id || "unknown";

    // Log estruturado pra depuração no Vercel. Sem ações ainda —
    // só confirmamos recebimento pro MP não marcar como falha.
    console.log("[mp-webhook]", {
      topic,
      action: body?.action,
      id,
      live_mode: body?.live_mode,
      date_created: body?.date_created,
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[mp-webhook] erro ao processar:", err);
    // Retornamos 200 mesmo com erro interno pra MP não reagendar —
    // se a gente não conseguiu parsear, reagendar não resolve.
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
