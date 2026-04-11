// Webhook Z-API — recebe cliques de botões do follow-up
// Quando cliente clica "Não tenho interesse" → marca opt_out_whatsapp
// Quando cliente clica "Tenho interesse" → notifica vendedor via Telegram

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[ZAPI Webhook] Recebido:", JSON.stringify(body));

    // Z-API envia o buttonId quando o cliente clica num botão
    // Formato: { phone, buttonId, ... } ou { button: { id, text }, ... }
    const buttonId = body.buttonId || body.button?.id || body.buttonPayload || "";
    const phone = body.phone || body.from || "";

    if (!buttonId) {
      // Não é um clique de botão, pode ser mensagem normal — ignorar
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Extrair ação e ID da simulação do buttonId
    // Formato: "SIM_{simId}" ou "NAO_{simId}"
    const parts = buttonId.split("_");
    const acao = parts[0]; // SIM ou NAO
    const simId = parts.slice(1).join("_"); // UUID da simulação

    if (!simId || (acao !== "SIM" && acao !== "NAO")) {
      console.log("[ZAPI Webhook] ButtonId não reconhecido:", buttonId);
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Buscar dados da simulação
    const { data: sim } = await supabase
      .from("simulacoes")
      .select("id, nome, whatsapp, modelo_novo, storage_novo, modelo_usado, storage_usado, vendedor")
      .eq("id", simId)
      .single();

    if (!sim) {
      console.log("[ZAPI Webhook] Simulação não encontrada:", simId);
      return NextResponse.json({ ok: true, error: "sim not found" });
    }

    if (acao === "NAO") {
      // Cliente não tem interesse → marcar opt-out em TODAS as simulações desse número
      const foneNorm = (sim.whatsapp || phone).replace(/\D/g, "");
      await supabase
        .from("simulacoes")
        .update({ opt_out_whatsapp: true, follow_up_enviado: true, alerta_preco_enviado: true })
        .eq("whatsapp", foneNorm);

      // Também tenta com o formato que pode estar salvo
      if (foneNorm.length === 11) {
        await supabase
          .from("simulacoes")
          .update({ opt_out_whatsapp: true, follow_up_enviado: true, alerta_preco_enviado: true })
          .eq("whatsapp", `55${foneNorm}`);
      }

      console.log(`[ZAPI Webhook] Opt-out: ${sim.nome} (${foneNorm})`);

      // Notificar no Telegram
      const chatId = process.env.TELEGRAM_VENDAS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";
      if (chatId) {
        await sendTelegramMessage(
          `🚫 <b>Cliente não tem interesse</b>\n\n` +
          `<b>${sim.nome}</b> clicou "Não tenho interesse" no follow-up.\n` +
          `Modelo: ${sim.modelo_usado || "?"} → ${sim.modelo_novo || "?"}\n` +
          `Removido de todas as listas automáticas.`,
          chatId
        );
      }

      return NextResponse.json({ ok: true, action: "opt_out", nome: sim.nome });
    }

    if (acao === "SIM") {
      // Cliente tem interesse → notificar vendedor pra dar continuidade
      const chatId = process.env.TELEGRAM_VENDAS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";
      const vendedor = sim.vendedor || "Equipe";
      const modeloUsado = sim.modelo_usado ? `${sim.modelo_usado}${sim.storage_usado ? ` ${sim.storage_usado}` : ""}` : "?";
      const modeloNovo = sim.modelo_novo ? `${sim.modelo_novo}${sim.storage_novo ? ` ${sim.storage_novo}` : ""}` : "?";
      const fone = (sim.whatsapp || "").replace(/\D/g, "");
      const foneFormatado = fone.startsWith("55") ? fone.slice(2) : fone;

      if (chatId) {
        await sendTelegramMessage(
          `🟢 <b>Cliente tem interesse!</b>\n\n` +
          `<b>${sim.nome}</b> clicou "Tenho interesse" no follow-up!\n` +
          `📱 ${modeloUsado} → ${modeloNovo}\n` +
          `📞 ${foneFormatado}\n` +
          `👤 Vendedor: ${vendedor}\n\n` +
          `⚡ Entrem em contato agora!`,
          chatId
        );
      }

      console.log(`[ZAPI Webhook] Interesse: ${sim.nome} (${fone})`);
      return NextResponse.json({ ok: true, action: "interested", nome: sim.nome });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ZAPI Webhook] Erro:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
