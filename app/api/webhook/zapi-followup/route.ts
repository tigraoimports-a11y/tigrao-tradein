// Webhook Z-API — recebe respostas de texto do follow-up
// Cliente responde "SIM" → envia resumo da simulação, notifica vendedor
// Cliente responde "NAO" → marca opt_out_whatsapp automaticamente
// Ignora mensagens de grupo e mensagens enviadas por nós (fromMe)

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

// Log para debug — salva todo payload recebido no Supabase
async function logWebhook(payload: Record<string, unknown>) {
  try {
    await supabase.from("webhook_logs").insert({
      source: "zapi-followup",
      payload: JSON.stringify(payload),
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[ZAPI Webhook] Erro ao salvar log:", e);
  }
}

// Normaliza texto pra comparação: remove acentos, espaços, uppercase
function normalizar(texto: string): string {
  return (texto || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/g, "");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[ZAPI Webhook] Recebido:", JSON.stringify(body));

    // Salvar log de TUDO que chega
    await logWebhook(body);

    // Ignorar mensagens de grupo
    if (body.isGroup) {
      return NextResponse.json({ ok: true, ignored: "group" });
    }

    // Ignorar mensagens enviadas por nós mesmos
    if (body.fromMe) {
      return NextResponse.json({ ok: true, ignored: "fromMe" });
    }

    // Ignorar callbacks de status/delivery (não são mensagens)
    if (body.type === "MessageStatusCallback" || body.type === "DeliveryCallback") {
      return NextResponse.json({ ok: true, ignored: "status" });
    }

    // Pegar texto da mensagem e telefone
    const texto = body.text?.message || "";
    const phone = body.phone || "";

    if (!texto || !phone) {
      return NextResponse.json({ ok: true, ignored: "no_text_or_phone" });
    }

    const textoNorm = normalizar(texto);

    // Detectar intenção: SIM ou NAO
    const respostaSim = ["SIM", "SIMM", "SIMMM", "TENHO", "TENHOINTERESSE", "QUERO", "INTERESSE"].includes(textoNorm);
    const respostaNao = ["NAO", "NAOO", "NAOQUERO", "SEMINTERESSE", "PARA", "PARAR", "SAIR", "CANCELAR", "REMOVER"].includes(textoNorm);

    if (!respostaSim && !respostaNao) {
      // Não é uma resposta ao follow-up, ignorar
      return NextResponse.json({ ok: true, ignored: "not_followup_response" });
    }

    // Normalizar telefone pra buscar simulação
    let foneNorm = phone.replace(/\D/g, "");

    // Buscar simulação mais recente desse telefone que teve follow-up enviado
    const { data: sim } = await supabase
      .from("simulacoes")
      .select("*")
      .or(`whatsapp.eq.${foneNorm},whatsapp.eq.${foneNorm.startsWith("55") ? foneNorm.slice(2) : `55${foneNorm}`}`)
      .eq("follow_up_enviado", true)
      .eq("opt_out_whatsapp", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!sim) {
      console.log(`[ZAPI Webhook] Nenhuma simulação com follow-up para ${foneNorm}`);
      return NextResponse.json({ ok: true, ignored: "no_sim_found" });
    }

    // ==================== NÃO TEM INTERESSE ====================
    if (respostaNao) {
      // Marcar opt-out em TODAS as simulações desse número
      await supabase
        .from("simulacoes")
        .update({ opt_out_whatsapp: true })
        .eq("whatsapp", sim.whatsapp);

      // Também tentar com/sem 55
      const foneAlt = sim.whatsapp.startsWith("55") ? sim.whatsapp.slice(2) : `55${sim.whatsapp}`;
      await supabase
        .from("simulacoes")
        .update({ opt_out_whatsapp: true })
        .eq("whatsapp", foneAlt);

      // Enviar mensagem de despedida
      await enviarWhatsApp(
        phone,
        `Entendido, ${(sim.nome || "").split(" ")[0] || ""}! Sem problemas 😊\n\nCaso mude de ideia, estamos sempre à disposição. Um abraço! 🐯`
      );

      // Notificar no Telegram
      const chatId = process.env.TELEGRAM_VENDAS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";
      if (chatId) {
        await sendTelegramMessage(
          `🚫 <b>Cliente não tem interesse</b>\n\n` +
          `<b>${sim.nome}</b> respondeu "NAO" no follow-up.\n` +
          `Modelo: ${sim.modelo_usado || "?"} → ${sim.modelo_novo || "?"}\n` +
          `Removido de todas as listas automáticas.`,
          chatId
        );
      }

      console.log(`[ZAPI Webhook] Opt-out: ${sim.nome} (${foneNorm})`);
      return NextResponse.json({ ok: true, action: "opt_out", nome: sim.nome });
    }

    // ==================== TEM INTERESSE ====================
    if (respostaSim) {
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
      const difNum = Number(sim.diferenca) || 0;
      const diferenca = difNum > 0
        ? `R$ ${difNum.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
        : "—";

      // Calcular parcelas com juros (mesma tabela do sistema)
      const parcela12x = difNum > 0 ? Math.round((difNum * 1.13) / 12) : 0;
      const parcela21x = difNum > 0 ? Math.round((difNum * 1.22) / 21) : 0;

      const opcoesPagamento = difNum > 0
        ? `${diferenca} à vista no PIX\n12x de R$ ${parcela12x.toLocaleString("pt-BR")} no cartão\n21x de R$ ${parcela21x.toLocaleString("pt-BR")} no cartão`
        : diferenca;

      // Montar mensagem completa
      const resumo = `Que ótimo, ${nome}! 😄\n\nAqui está o resumo da sua simulação:\n\n` +
        `📱 *Seu aparelho:*\n${modeloUsado}${corUsado}\n${condicoes}\nAvaliado em: *${avaliacaoUsado}*` +
        `${segundoAparelho}\n\n` +
        `🆕 *Produto desejado:*\n${modeloNovo}\nValor: *${precoNovo}*\n\n` +
        `💰 *Valor da troca:*\n${opcoesPagamento}\n\n` +
        `As informações estão corretas mesmo? 🐯`;

      // Enviar resumo após 5 segundos
      await new Promise(resolve => setTimeout(resolve, 5000));

      await enviarWhatsApp(phone, resumo);

      // Notificar vendedor no Telegram
      const chatId = process.env.TELEGRAM_VENDAS_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "";
      const vendedor = sim.vendedor || "Equipe";
      const foneFormatado = foneNorm.startsWith("55") ? foneNorm.slice(2) : foneNorm;

      if (chatId) {
        await sendTelegramMessage(
          `🟢 <b>Cliente tem interesse!</b>\n\n` +
          `<b>${sim.nome}</b> respondeu "SIM" no follow-up!\n` +
          `📱 ${modeloUsado} → ${modeloNovo}\n` +
          `💰 Diferença: ${diferenca}\n` +
          `📞 ${foneFormatado}\n` +
          `👤 Vendedor: ${vendedor}\n\n` +
          `⚡ Resumo já foi enviado pro cliente. Entrem em contato agora!`,
          chatId
        );
      }

      console.log(`[ZAPI Webhook] Interesse + resumo enviado: ${sim.nome} (${foneNorm})`);
      return NextResponse.json({ ok: true, action: "interested_summary_sent", nome: sim.nome });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[ZAPI Webhook] Erro:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
