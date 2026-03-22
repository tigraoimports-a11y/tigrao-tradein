import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const vendasChatId = process.env.TELEGRAM_VENDAS_CHAT_ID;

  const envStatus = {
    TELEGRAM_BOT_TOKEN: botToken ? `OK (${botToken.slice(0, 6)}...)` : "NÃO CONFIGURADO",
    TELEGRAM_CHAT_ID: chatId || "NÃO CONFIGURADO",
    TELEGRAM_VENDAS_CHAT_ID: vendasChatId || "NÃO CONFIGURADO",
  };

  // Tentar enviar para o grupo padrão
  const okDefault = await sendTelegramMessage("🧪 Teste de conexão Telegram — grupo padrão");

  // Tentar enviar para o grupo de vendas (se configurado)
  let okVendas: boolean | null = null;
  if (vendasChatId) {
    okVendas = await sendTelegramMessage("🧪 Teste de conexão Telegram — grupo VENDAS", vendasChatId);
  }

  return NextResponse.json({
    env: envStatus,
    resultado: {
      grupo_padrao: okDefault ? "✅ Enviado" : "❌ Falhou",
      grupo_vendas: okVendas === null ? "⚠️ Não configurado" : okVendas ? "✅ Enviado" : "❌ Falhou",
    },
  });
}
