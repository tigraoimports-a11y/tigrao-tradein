import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

function diasAtras(dateStr: string): number {
  const now = new Date();
  const created = new Date(dateStr);
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function primeiroNome(nome: string): string {
  return (nome || "").split(" ")[0] || "Cliente";
}

// Roda todo dia as 14h — verifica simulacoes dos ultimos 3 dias que nao converteram
export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chatId = process.env.TELEGRAM_CHAT_ID ?? "";

  try {
    // Buscar simulacoes dos ultimos 3 dias
    const tresDiasAtras = new Date();
    tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
    const dataLimite = tresDiasAtras.toISOString();

    const { data: sims, error } = await supabase
      .from("simulacoes")
      .select("id, created_at, nome, whatsapp, modelo_novo, storage_novo, preco_novo, modelo_usado, storage_usado, avaliacao_usado, diferenca, status, contatado, follow_up_enviado, vendedor")
      .gte("created_at", dataLimite)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Followup] Query error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!sims || sims.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma simulacao nos ultimos 3 dias" });
    }

    // Filtrar: status SAIR (nao fechou) OU GOSTEI mas sem follow-up
    // Prioridade: quem saiu sem fechar e nao foi contatado
    const naoConvertidas = sims.filter(s =>
      s.status === "SAIR" && !s.follow_up_enviado
    );

    const gosteiFaltaContato = sims.filter(s =>
      s.status === "GOSTEI" && !s.contatado
    );

    if (naoConvertidas.length === 0 && gosteiFaltaContato.length === 0) {
      return NextResponse.json({ ok: true, message: "Todas simulacoes ja foram acompanhadas" });
    }

    // Montar mensagem Telegram
    const lines: string[] = [
      `<b>FOLLOW-UP SIMULACOES</b>`,
      `<i>${sims.length} simulacoes nos ultimos 3 dias</i>`,
      ``,
    ];

    // Quem saiu sem fechar (prioridade alta)
    if (naoConvertidas.length > 0) {
      lines.push(`<b>NAO FECHARAM (${naoConvertidas.length}):</b>`);
      for (const s of naoConvertidas) {
        const dias = diasAtras(s.created_at);
        const diasTxt = dias === 0 ? "hoje" : dias === 1 ? "ontem" : `ha ${dias} dias`;
        const fone = s.whatsapp ? s.whatsapp.replace(/\D/g, "") : "";
        const waLink = fone ? `https://wa.me/55${fone.replace(/^55/, "")}` : "";

        lines.push(`  <b>${s.nome || "Sem nome"}</b> (${diasTxt})`);
        lines.push(`  Quer: ${s.modelo_novo || "?"} ${s.storage_novo || ""}`);
        lines.push(`  Troca: ${s.modelo_usado || "?"} ${s.storage_usado || ""}`);
        lines.push(`  Diferenca: ${fmtBRL(Number(s.diferenca || 0))}`);
        if (waLink) lines.push(`  WhatsApp: ${waLink}`);
        lines.push(``);
      }
    }

    // Gostaram mas nao foram contatados
    if (gosteiFaltaContato.length > 0) {
      lines.push(`<b>GOSTARAM MAS NAO FORAM CONTATADOS (${gosteiFaltaContato.length}):</b>`);
      for (const s of gosteiFaltaContato) {
        const dias = diasAtras(s.created_at);
        const diasTxt = dias === 0 ? "hoje" : dias === 1 ? "ontem" : `ha ${dias} dias`;
        const fone = s.whatsapp ? s.whatsapp.replace(/\D/g, "") : "";
        const waLink = fone ? `https://wa.me/55${fone.replace(/^55/, "")}` : "";

        lines.push(`  <b>${s.nome || "Sem nome"}</b> (${diasTxt})`);
        lines.push(`  Quer: ${s.modelo_novo || "?"} ${s.storage_novo || ""}`);
        lines.push(`  Diferenca: ${fmtBRL(Number(s.diferenca || 0))}`);
        if (waLink) lines.push(`  WhatsApp: ${waLink}`);
        lines.push(``);
      }
    }

    // Mensagens prontas pra Bianca copiar (top 3 mais recentes que sairam)
    const top3 = naoConvertidas.slice(0, 3);
    if (top3.length > 0) {
      lines.push(`<b>MENSAGENS PRONTAS PRA ENVIAR:</b>`);
      lines.push(``);
      for (const s of top3) {
        const nome = primeiroNome(s.nome);
        const modeloNovo = s.modelo_novo || "o produto";
        const diferenca = fmtBRL(Number(s.diferenca || 0));
        const msg = `Oi ${nome}! Tudo bem? Vi que voce fez uma simulacao de trade-in aqui na TigraoImports pro ${modeloNovo}. A diferenca ficou em ${diferenca}. Consigo melhorar essa condicao pra voce! Quer que eu veja?`;
        lines.push(`<b>Para ${s.nome}:</b>`);
        lines.push(`<code>${msg}</code>`);
        lines.push(``);
      }
    }

    // Resumo final
    const totalPotencial = naoConvertidas.reduce((s, sim) => s + Number(sim.diferenca || 0), 0);
    lines.push(`<b>Potencial de receita: ${fmtBRL(totalPotencial)}</b>`);

    await sendTelegramMessage(lines.join("\n"), chatId);

    return NextResponse.json({
      ok: true,
      total_simulacoes: sims.length,
      nao_convertidas: naoConvertidas.length,
      gostei_sem_contato: gosteiFaltaContato.length,
      potencial: totalPotencial,
    });
  } catch (err) {
    console.error("[Followup] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
