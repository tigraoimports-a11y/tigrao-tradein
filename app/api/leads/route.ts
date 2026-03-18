import { NextRequest, NextResponse } from "next/server";

async function notificarWhatsApp(body: {
  nome: string;
  whatsapp: string;
  instagram: string;
  modeloNovo: string;
  storageNovo: string;
  modeloUsado: string;
  storageUsado: string;
  diferenca: number;
}) {
  const apiKey = process.env.CALLMEBOT_APIKEY;
  const numero = process.env.WHATSAPP_NUMBER; // número do André

  if (!apiKey || !numero) return; // não configurado, ignora silenciosamente

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

  const url = `https://api.callmebot.com/whatsapp.php?phone=${numero}&text=${encodeURIComponent(mensagem)}&apikey=${apiKey}`;

  try {
    await fetch(url);
  } catch (err) {
    console.error("[leads] Erro ao notificar CallMeBot:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Notifica André via WhatsApp (CallMeBot) — funciona independente do Supabase
    await notificarWhatsApp(body);

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
