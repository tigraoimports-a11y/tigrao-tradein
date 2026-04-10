import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

function diasAtras(dateStr: string): number {
  const now = new Date();
  const created = new Date(dateStr);
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function primeiroNome(nome: string): string {
  return (nome || "").split(" ")[0] || "Cliente";
}

// Envia mensagem via Z-API (instancia de follow-up)
async function enviarWhatsApp(phone: string, message: string): Promise<boolean> {
  const instanceId = process.env.ZAPI_FOLLOWUP_INSTANCE_ID;
  const token = process.env.ZAPI_FOLLOWUP_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!instanceId || !token) {
    console.log("[Followup] Z-API nao configurado, pulando envio WhatsApp");
    return false;
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  try {
    // Formatar telefone: garantir 55 + DDD + numero
    let fone = phone.replace(/\D/g, "");
    if (!fone.startsWith("55")) fone = `55${fone}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body: JSON.stringify({ phone: fone, message }),
    });
    const json = await res.json();
    console.log(`[Followup] WhatsApp enviado para ${fone}:`, JSON.stringify(json));
    return res.ok;
  } catch (err) {
    console.error(`[Followup] Erro ao enviar WhatsApp para ${phone}:`, err);
    return false;
  }
}

// Roda todo dia as 14h — envia WhatsApp automatico pro cliente que simulou e nao fechou
export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    // Filtrar: status SAIR (nao fechou) E sem follow-up enviado E com whatsapp
    const naoConvertidas = sims.filter(s =>
      s.status === "SAIR" && !s.follow_up_enviado
    );

    if (naoConvertidas.length === 0) {
      return NextResponse.json({ ok: true, message: "Todas simulacoes ja foram acompanhadas" });
    }

    // === ENVIO AUTOMATICO DE WHATSAPP ===
    // Envia pra quem saiu sem fechar, tem whatsapp, e tem pelo menos 1 dia
    const paraEnviarWA = naoConvertidas.filter(s => {
      const dias = diasAtras(s.created_at);
      return s.whatsapp && dias >= 1; // espera pelo menos 24h
    });

    let whatsappEnviados = 0;
    const whatsappErros: string[] = [];

    for (const s of paraEnviarWA) {
      const nome = primeiroNome(s.nome);

      const modeloUsado = s.modelo_usado ? `${s.modelo_usado}${s.storage_usado ? ` ${s.storage_usado}` : ""}` : "seu aparelho";
      const modeloNovoFull = s.modelo_novo ? `${s.modelo_novo}${s.storage_novo ? ` ${s.storage_novo}` : ""}` : "o produto";

      const msg = `Oi ${nome}! Tudo bem? 😊\n\nVi que você fez uma simulação de upgrade aqui na TIGRÃO IMPORTS, dando seu ${modeloUsado} na compra do ${modeloNovoFull}.\n\nFicou alguma dúvida? Posso te ajudar a fechar essa troca ainda hoje! Estou à disposição 🐯`;

      const enviou = await enviarWhatsApp(s.whatsapp, msg);

      if (enviou) {
        whatsappEnviados++;
        // Marcar no banco que o follow-up foi enviado
        await supabase
          .from("simulacoes")
          .update({ follow_up_enviado: true })
          .eq("id", s.id);
      } else {
        whatsappErros.push(s.nome || "Sem nome");
      }

      // Delay de 3s entre mensagens pra nao ser bloqueado
      if (paraEnviarWA.indexOf(s) < paraEnviarWA.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    return NextResponse.json({
      ok: true,
      total_simulacoes: sims.length,
      nao_convertidas: naoConvertidas.length,
      whatsapp_enviados: whatsappEnviados,
      whatsapp_erros: whatsappErros,
    });
  } catch (err) {
    console.error("[Followup] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
