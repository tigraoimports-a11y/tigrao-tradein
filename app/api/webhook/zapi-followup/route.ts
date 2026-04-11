// Webhook Z-API — recebe cliques de botões do follow-up
// "Tenho interesse" → aguarda 30s, envia resumo da simulação pro cliente, notifica vendedor
// "Sem interesse" → marca opt_out_whatsapp automaticamente

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Envia texto simples via Z-API (instância follow-up)
async function enviarWhatsApp(phone: string, message: string): Promise<boolean> {
  const instanceId = process.env.ZAPI_FOLLOWUP_INSTANCE_ID;
  const token = process.env.ZAPI_FOLLOWUP_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";
  if (!instanceId || !token) return false;

  try {
    let fone = phone.replace(/\D/g, "");
    if (!fone.startsWith("55")) fone = `55${fone}`;

    const res = await fetch(
      `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": clientToken },
        body: JSON.stringify({ phone: fone, message }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[ZAPI Webhook] Recebido:", JSON.stringify(body));

    // Z-API envia o ID da opção selecionada em diferentes formatos
    const buttonId = body.listResponseMessage?.singleSelectReply?.selectedRowId
      || body.buttonId
      || body.button?.id
      || body.buttonPayload
      || body.selectedButtonId
      || "";
    const phone = body.phone || body.from || body.chatId || "";

    if (!buttonId) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Extrair ação e ID da simulação: "SIM_{uuid}" ou "NAO_{uuid}"
    const parts = buttonId.split("_");
    const acao = parts[0];
    const simId = parts.slice(1).join("_");

    if (!simId || (acao !== "SIM" && acao !== "NAO")) {
      console.log("[ZAPI Webhook] ButtonId não reconhecido:", buttonId);
      return NextResponse.json({ ok: true, ignored: true });
    }

    // Buscar dados completos da simulação
    const { data: sim } = await supabase
      .from("simulacoes")
      .select("*")
      .eq("id", simId)
      .single();

    if (!sim) {
      console.log("[ZAPI Webhook] Simulação não encontrada:", simId);
      return NextResponse.json({ ok: true, error: "sim not found" });
    }

    // ==================== NÃO TEM INTERESSE ====================
    if (acao === "NAO") {
      const foneNorm = (sim.whatsapp || phone).replace(/\D/g, "");

      // Marcar opt-out em TODAS as simulações desse número
      await supabase
        .from("simulacoes")
        .update({ opt_out_whatsapp: true, follow_up_enviado: true, alerta_preco_enviado: true })
        .eq("whatsapp", foneNorm);

      if (foneNorm.length === 11) {
        await supabase
          .from("simulacoes")
          .update({ opt_out_whatsapp: true, follow_up_enviado: true, alerta_preco_enviado: true })
          .eq("whatsapp", `55${foneNorm}`);
      }

      // Enviar mensagem de despedida
      await enviarWhatsApp(
        sim.whatsapp || phone,
        `Entendido, ${(sim.nome || "").split(" ")[0] || ""}! Sem problemas 😊\n\nCaso mude de ideia, estamos sempre à disposição. Um abraço! 🐯`
      );

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

      console.log(`[ZAPI Webhook] Opt-out: ${sim.nome} (${foneNorm})`);
      return NextResponse.json({ ok: true, action: "opt_out", nome: sim.nome });
    }

    // ==================== TEM INTERESSE ====================
    if (acao === "SIM") {
      const fone = (sim.whatsapp || phone).replace(/\D/g, "");
      const nome = (sim.nome || "").split(" ")[0] || "Cliente";

      // Montar resumo do aparelho usado
      const modeloUsado = sim.modelo_usado ? `${sim.modelo_usado}${sim.storage_usado ? ` ${sim.storage_usado}` : ""}` : "Seu aparelho";
      const corUsado = sim.cor_usado ? ` – ${sim.cor_usado}` : "";
      const condicoes = Array.isArray(sim.condicao_linhas) && sim.condicao_linhas.length > 0
        ? sim.condicao_linhas.map((c: string) => `  • ${c}`).join("\n")
        : "  • Sem detalhes registrados";
      const avaliacaoUsado = sim.avaliacao_usado
        ? `R$ ${Number(sim.avaliacao_usado).toLocaleString("pt-BR")}`
        : "—";

      // Segundo aparelho (se houver)
      let segundoAparelho = "";
      if (sim.modelo_usado2) {
        const modelo2 = `${sim.modelo_usado2}${sim.storage_usado2 ? ` ${sim.storage_usado2}` : ""}`;
        const cor2 = sim.cor_usado2 ? ` – ${sim.cor_usado2}` : "";
        const cond2 = Array.isArray(sim.condicao_linhas2) && sim.condicao_linhas2.length > 0
          ? sim.condicao_linhas2.map((c: string) => `  • ${c}`).join("\n")
          : "";
        const aval2 = sim.avaliacao_usado2
          ? `R$ ${Number(sim.avaliacao_usado2).toLocaleString("pt-BR")}`
          : "—";
        segundoAparelho = `\n\n📱 *Segundo aparelho na troca:*\n${modelo2}${cor2}\n${cond2}\nAvaliado em: *${aval2}*`;
      }

      // Montar resumo do produto novo
      const modeloNovo = sim.modelo_novo ? `${sim.modelo_novo}${sim.storage_novo ? ` ${sim.storage_novo}` : ""}` : "Produto";
      const precoNovo = sim.preco_novo
        ? `R$ ${Number(sim.preco_novo).toLocaleString("pt-BR")}`
        : "—";
      const diferenca = sim.diferenca
        ? `R$ ${Number(sim.diferenca).toLocaleString("pt-BR")}`
        : "—";
      const formaPagamento = sim.forma_pagamento || "";

      // Montar mensagem completa
      const resumo = `Que ótimo, ${nome}! 😄\n\nAqui está o resumo da sua simulação:\n\n` +
        `📱 *Seu aparelho:*\n${modeloUsado}${corUsado}\n${condicoes}\nAvaliado em: *${avaliacaoUsado}*` +
        `${segundoAparelho}\n\n` +
        `🆕 *Produto desejado:*\n${modeloNovo}\nValor: *${precoNovo}*\n\n` +
        `💰 *Valor da troca:*\n*${diferenca}*` +
        `${formaPagamento ? `\n${formaPagamento}` : ""}\n\n` +
        `As informações estão corretas? Em breve um dos nossos consultores vai te chamar pra finalizar! 🐯`;

      // Aguardar 30 segundos antes de enviar o resumo
      await new Promise(resolve => setTimeout(resolve, 30000));

      await enviarWhatsApp(sim.whatsapp || phone, resumo);

      // Notificar vendedor no Telegram
      const chatId = process.env.TELEGRAM_VENDAS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";
      const vendedor = sim.vendedor || "Equipe";
      const foneFormatado = fone.startsWith("55") ? fone.slice(2) : fone;

      if (chatId) {
        await sendTelegramMessage(
          `🟢 <b>Cliente tem interesse!</b>\n\n` +
          `<b>${sim.nome}</b> clicou "Tenho interesse" no follow-up!\n` +
          `📱 ${modeloUsado} → ${modeloNovo}\n` +
          `💰 Diferença: ${diferenca}\n` +
          `📞 ${foneFormatado}\n` +
          `👤 Vendedor: ${vendedor}\n\n` +
          `⚡ Resumo já foi enviado pro cliente. Entrem em contato agora!`,
          chatId
        );
      }

      console.log(`[ZAPI Webhook] Interesse + resumo enviado: ${sim.nome} (${fone})`);
      return NextResponse.json({ ok: true, action: "interested_summary_sent", nome: sim.nome });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ZAPI Webhook] Erro:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
