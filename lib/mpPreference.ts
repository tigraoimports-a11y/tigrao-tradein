// ============================================================
// Mercado Pago — Helper pra criar preference (link de pagamento)
// ============================================================
// Função compartilhada entre:
//   • /api/admin/mp-preference       — admin gera link manualmente
//   • /api/create-mp-from-form       — cliente clica "Pagar" após preencher /compra
//
// Não faz auth nem validação de body — quem chama é responsável por isso.
// ============================================================

export interface MpPreferenceInput {
  titulo: string;
  valor: number; // em reais
  shortCode?: string; // se fornecido, back_url success aponta pra /c/{shortCode}?pp=mp
  externalRef?: string; // default: shortCode, senão timestamp único
  // Dados opcionais do pagador pra pré-preencher o checkout MP
  payer?: {
    name?: string;
    surname?: string;
    email?: string;
    phone?: { area_code?: string; number?: string };
    identification?: { type: "CPF" | "CNPJ"; number: string };
    address?: {
      zip_code?: string;
      street_name?: string;
      street_number?: string;
    };
  };
}

export interface MpPreferenceResult {
  init_point: string;
  preference_id: string;
  sandbox_init_point?: string;
}

export async function createMpPreference(
  input: MpPreferenceInput
): Promise<{ ok: true; data: MpPreferenceResult } | { ok: false; error: string; status: number; details?: unknown }> {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, error: "MP_ACCESS_TOKEN não configurado", status: 500 };
  }

  const titulo = (input.titulo || "").trim();
  const valor = Number(input.valor);

  if (!titulo) return { ok: false, error: "titulo obrigatório", status: 400 };
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, error: "valor inválido", status: 400 };
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://tigrao-tradein.vercel.app";

  const shortCode = (input.shortCode || "").trim();
  // Quando o cliente paga via fluxo invertido (formulário preenchido antes),
  // ele volta direto pra tela "Pedido confirmado!" em vez de /c/{shortCode}
  // (que hoje redireciona de volta pro formulário — desnecessário já que
  // os dados já foram enviados).
  const successUrl = shortCode
    ? `${baseUrl}/pagamento-confirmado?short=${encodeURIComponent(shortCode)}`
    : `${baseUrl}/pagamento/sucesso`;

  const itemId = `TIGRAO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const externalReference = input.externalRef || shortCode || itemId;

  // Monta payer (só inclui campos que vieram)
  const payer: Record<string, unknown> = {};
  if (input.payer?.name) payer.name = input.payer.name;
  if (input.payer?.surname) payer.surname = input.payer.surname;
  if (input.payer?.email) payer.email = input.payer.email;
  if (input.payer?.phone?.area_code && input.payer?.phone?.number) {
    payer.phone = {
      area_code: input.payer.phone.area_code,
      number: input.payer.phone.number,
    };
  }
  if (input.payer?.identification?.type && input.payer?.identification?.number) {
    payer.identification = input.payer.identification;
  }
  if (input.payer?.address?.zip_code || input.payer?.address?.street_name) {
    payer.address = {
      ...(input.payer.address.zip_code ? { zip_code: input.payer.address.zip_code } : {}),
      ...(input.payer.address.street_name ? { street_name: input.payer.address.street_name } : {}),
      ...(input.payer.address.street_number ? { street_number: input.payer.address.street_number } : {}),
    };
  }

  const payload: Record<string, unknown> = {
    items: [
      {
        id: itemId,
        title: titulo.slice(0, 250),
        description: titulo.slice(0, 600),
        category_id: "electronics",
        quantity: 1,
        unit_price: Math.round(valor * 100) / 100,
        currency_id: "BRL",
      },
    ],
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
    },
    back_urls: {
      success: successUrl,
      pending: `${baseUrl}/pagamento/pendente`,
      failure: `${baseUrl}/pagamento/erro`,
    },
    auto_return: "approved",
    external_reference: externalReference,
    notification_url: `${baseUrl}/api/mp-webhook`,
    statement_descriptor: "TIGRAOIMPORTS",
  };
  if (Object.keys(payer).length > 0) {
    payload.payer = payer;
  }

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
      console.error("[mpPreference] MP erro:", data);
      return {
        ok: false,
        error: data?.message || "Falha ao criar link MP",
        status: res.status,
        details: data,
      };
    }
    return {
      ok: true,
      data: {
        init_point: data.init_point,
        preference_id: data.id,
        sandbox_init_point: data.sandbox_init_point,
      },
    };
  } catch (err) {
    console.error("[mpPreference] fetch err:", err);
    return { ok: false, error: "Erro de rede ao contatar MP", status: 502 };
  }
}
