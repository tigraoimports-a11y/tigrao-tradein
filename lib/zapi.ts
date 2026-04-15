// ============================================
// Z-API (WhatsApp) — Envio de mensagens
// ============================================
// Helper centralizado pra reutilizar em qualquer rota.
// Usa a instância "principal" (ZAPI_INSTANCE_ID) — a de "followup"
// é separada pra fluxos automatizados de marketing.
//
// Env vars usadas:
//   ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN
//   ZAPI_GRUPO_PAGAMENTOS  — destino pra notificações de pagamento aprovado
//                            (pode ser número pessoal "5521999999999"
//                             OU ID de grupo "120363025xxx@g.us")

/**
 * Envia uma mensagem WhatsApp via Z-API.
 *
 * @param destino  Número (5521999999999) ou ID de grupo (120363025xxx@g.us)
 * @param mensagem Texto da mensagem
 * @returns true se enviou com sucesso
 */
export async function sendZApiMessage(
  destino: string,
  mensagem: string
): Promise<boolean> {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!instanceId || !token) {
    console.warn("[zapi] ZAPI_INSTANCE_ID ou ZAPI_TOKEN não configurado — pulando envio");
    return false;
  }
  if (!destino) {
    console.warn("[zapi] destino vazio — pulando envio");
    return false;
  }

  // Normaliza número (só pra DMs — grupos têm @g.us e passam pelo filtro abaixo)
  let phone = destino;
  if (!destino.includes("@")) {
    phone = destino.replace(/\D/g, "");
    if (!phone.startsWith("55") && phone.length >= 10) phone = `55${phone}`;
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone, message: mensagem }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("[zapi] erro HTTP", res.status, JSON.stringify(json));
      return false;
    }
    console.log("[zapi] enviado:", JSON.stringify(json));
    return true;
  } catch (err) {
    console.error("[zapi] exceção:", err);
    return false;
  }
}

/**
 * Notifica o grupo/número de pagamentos que um cliente pagou via link MP.
 * Usa env var ZAPI_GRUPO_PAGAMENTOS como destino.
 */
export async function notifyPagamentoAprovado(info: {
  cliente: string;
  telefone?: string | null;
  produto: string;
  valor: number;
  parcelas?: string | null;
  shortCode?: string | null;
  mpPaymentId?: string | null;
}): Promise<boolean> {
  const destino = process.env.ZAPI_GRUPO_PAGAMENTOS;
  if (!destino) {
    console.warn("[zapi] ZAPI_GRUPO_PAGAMENTOS não configurado — pulando notificação");
    return false;
  }

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines = [
    `💰 *PAGAMENTO APROVADO — Link MP*`,
    ``,
    `*Cliente:* ${info.cliente}`,
    ...(info.telefone ? [`*Telefone:* ${info.telefone}`] : []),
    `*Produto:* ${info.produto}`,
    `*Valor:* ${fmt(info.valor)}${info.parcelas ? ` em ${info.parcelas}x` : ""}`,
    ...(info.shortCode ? [`*Link:* ${info.shortCode}`] : []),
    ...(info.mpPaymentId ? [`*MP ID:* ${info.mpPaymentId}`] : []),
  ];

  return sendZApiMessage(destino, lines.join("\n"));
}
