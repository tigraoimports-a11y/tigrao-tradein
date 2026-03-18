import { NextRequest, NextResponse } from "next/server";

async function notificarTelegram(body: {
  nome: string;
  whatsapp: string;
  instagram: string;
  modeloNovo: string;
  storageNovo: string;
  modeloUsado: string;
  storageUsado: string;
  diferenca: number;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  console.log("[telegram] token presente:", !!token, "chatId presente:", !!chatId);

  if (!token || !chatId) {
    console.log("[telegram] env vars ausentes — pulando notificação");
    return;
  }

  const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  const instagramLine = body.instagram ? `\nInstagram: ${body.instagram}` : "";

  const mensagem =
    `🚨 LEAD SAIU SEM FECHAR!\n\n` +
    `👤 Nome: ${body.nome}\n` +
    `📱 WhatsApp: ${body.whatsapp}` +
    instagramLine + `\n\n` +
    `🆕 Queria: ${body.modeloNovo} ${body.storageNovo}\n` +
    `🔄 Usado: ${body.modeloUsado} ${body.storageUsado}\n` +
    `💰 Diferença: ${fmt(body.diferenca)}\n\n` +
    `👉 Entre em contato e tente fechar!`;

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
    console.error("[telegram] erro ao chamar API:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Notifica André via Telegram — funciona independente do Supabase
    await notificarTelegram(body);

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
