import { NextResponse } from "next/server";

// ============================================================
// MP Checkout Pro — gera link de pagamento (preference)
// ============================================================
// Fluxo:
//   Front envia { titulo, valor, maxParcelas } →
//   Chamamos POST https://api.mercadopago.com/checkout/preferences →
//   Devolvemos { init_point } pro front copiar/compartilhar.
//
// Comportamento de parcelamento (igual ao app MP atual):
//   - Usuário escolhe "até X parcelas sem acréscimo" no form.
//   - Cliente abre o link e pode escolher 1..X (sem acréscimo)
//     ou mais do que X (MP cobra acréscimo automaticamente).
//   - O valor já vem com a taxa embutida (é o mesmo que o
//     vendedor anuncia no Instagram).
// ============================================================

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

interface MpPrefBody {
  titulo?: string;
  valor?: number;
  maxParcelas?: number;
  externalRef?: string;
  shortCode?: string; // Se informado, após pagamento redireciona pra /c/{shortCode}?pago=mp
}

export async function POST(request: Request) {
  if (!auth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "MP_ACCESS_TOKEN não configurado no servidor." },
      { status: 500 }
    );
  }

  let body: MpPrefBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const titulo = (body.titulo || "").trim();
  const valor = Number(body.valor);
  const maxParcelas = Math.max(1, Math.min(12, Number(body.maxParcelas) || 1));

  if (!titulo) {
    return NextResponse.json({ error: "titulo obrigatório" }, { status: 400 });
  }
  if (!Number.isFinite(valor) || valor <= 0) {
    return NextResponse.json({ error: "valor inválido" }, { status: 400 });
  }

  // URL base para back_urls (produção no Vercel)
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://tigrao-tradein.vercel.app";

  // Se veio shortCode, redireciona pro formulário de pedido após pagamento aprovado.
  // MP automaticamente anexa ?payment_id=X&status=Y&external_reference=Z na back_url.
  // Isso permite o cliente continuar o preenchimento (endereço, data entrega, etc)
  // direto no /compra, já com flag "pago via MP".
  // Query param `pp=mp` mapeia pra `pagamento_pago=mp` no /compra via KEY_MAP.
  // MP automaticamente anexa payment_id, status, external_reference, merchant_order_id
  // na URL ao redirecionar — repassamos tudo isso pro /compra via /c/[d].
  const shortCode = (body.shortCode || "").trim();
  const successUrl = shortCode
    ? `${baseUrl}/c/${shortCode}?pp=mp`
    : `${baseUrl}/pagamento/sucesso`;

  const payload = {
    items: [
      {
        title: titulo.slice(0, 250), // MP limita título
        quantity: 1,
        unit_price: Math.round(valor * 100) / 100,
        currency_id: "BRL",
      },
    ],
    payment_methods: {
      installments: maxParcelas,
      default_installments: maxParcelas,
      // Excluir boleto (só cartão e PIX/crédito)
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
    },
    back_urls: {
      success: successUrl,
      pending: `${baseUrl}/pagamento/pendente`,
      failure: `${baseUrl}/pagamento/erro`,
    },
    auto_return: "approved",
    ...(body.externalRef ? { external_reference: body.externalRef } : {}),
    statement_descriptor: "TIGRAOIMPORTS",
  };

  try {
    const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("MP preference error:", data);
      return NextResponse.json(
        { error: data?.message || "Falha ao criar link MP", details: data },
        { status: res.status }
      );
    }

    return NextResponse.json({
      init_point: data.init_point,
      preference_id: data.id,
      sandbox_init_point: data.sandbox_init_point,
    });
  } catch (err) {
    console.error("MP fetch error:", err);
    return NextResponse.json(
      { error: "Erro de rede ao contatar MP" },
      { status: 502 }
    );
  }
}
