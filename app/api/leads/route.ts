import { NextRequest, NextResponse } from "next/server";

async function notificarTelegram(body: { nome?: string }, mensagem: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: mensagem }),
    });
    const json = await res.json();
    console.log("[telegram] resposta:", JSON.stringify(json));
  } catch (err) {
    console.error("[telegram] erro:", err);
  }
}

async function notificarZAPI(mensagem: string) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const destinatario = process.env.ZAPI_DESTINATARIO; // número do André com DDI

  if (!instanceId || !token || !destinatario) return;

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  try {
    const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone: destinatario, message: mensagem }),
    });
    const json = await res.json();
    console.log("[zapi] resposta:", JSON.stringify(json));
  } catch (err) {
    console.error("[zapi] erro:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Monta mensagem de notificação
    const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
    const instagramLine = body.instagram ? `\nInstagram: ${body.instagram}` : "";
    const condicaoBlock = body.condicaoLinhas?.length
      ? `\n${body.condicaoLinhas.join("\n")}`
      : "";
    const whatsappNumero = (body.whatsapp || "").replace(/\D/g, "");
    const whatsappNumeroFull = whatsappNumero.startsWith("55") ? whatsappNumero : `55${whatsappNumero}`;
    const textoFollowUp = encodeURIComponent(
      `Olá ${body.nome}! 😊 Vi que você fez uma simulação de trade-in no site da TigrãoImports.\n\n` +
      `📱 *Simulação:*\n` +
      `🆕 Novo: ${body.modeloNovo} ${body.storageNovo}\n` +
      `🔄 Usado: ${body.modeloUsado} ${body.storageUsado}${condicaoBlock}\n` +
      `💰 Diferença: ${fmt(body.diferenca)}\n\n` +
      `Posso te fazer uma proposta especial? 🐯`
    );
    const whatsappLink = `https://wa.me/${whatsappNumeroFull}?text=${textoFollowUp}`;

    const mensagemNotif =
      `🚨 LEAD SAIU SEM FECHAR!\n\n` +
      `👤 Nome: ${body.nome}\n` +
      `📱 WhatsApp: ${body.whatsapp}` +
      instagramLine + `\n\n` +
      `🆕 Queria: ${body.modeloNovo} ${body.storageNovo}\n` +
      `🔄 Usado: ${body.modeloUsado} ${body.storageUsado}` +
      condicaoBlock + `\n` +
      `💰 Diferença: ${fmt(body.diferenca)}\n\n` +
      `👉 Entre em contato e tente fechar!\n` +
      `💬 ${whatsappLink}`;

    // Notifica via Telegram e WhatsApp (Z-API) em paralelo
    await Promise.all([
      notificarTelegram(body, mensagemNotif),
      notificarZAPI(mensagemNotif),
    ]);

    // Salva no Supabase (se configurado)
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("[leads] Supabase não configurado — lead ignorado:", body);
      return NextResponse.json({ ok: true });
    }

    const { supabase } = await import("@/lib/supabase");

    const { error } = await supabase.from("leads_saiu").insert([
      {
        nome: body.nome,
        whatsapp: body.whatsapp,
        instagram: body.instagram || null,
        modelo_novo: body.modeloNovo,
        storage_novo: body.storageNovo,
        preco_novo: body.precoNovo,
        modelo_usado: body.modeloUsado,
        storage_usado: body.storageUsado,
        avaliacao_usado: body.avaliacaoUsado,
        diferenca: body.diferenca,
      },
    ]);

    if (error) {
      console.error("[leads] Erro Supabase:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[leads] Erro inesperado:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
