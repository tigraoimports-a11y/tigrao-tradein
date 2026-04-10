import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

function primeiroNome(nome: string): string {
  return (nome || "").split(" ")[0] || "Cliente";
}

function fmtBRL(v: number): string {
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
}

// Envia mensagem via Z-API (instancia de follow-up)
async function enviarWhatsApp(phone: string, message: string): Promise<boolean> {
  const instanceId = process.env.ZAPI_FOLLOWUP_INSTANCE_ID;
  const token = process.env.ZAPI_FOLLOWUP_TOKEN;
  const clientToken = process.env.ZAPI_CLIENT_TOKEN ?? "";

  if (!instanceId || !token) {
    console.log("[AlertaPreco] Z-API nao configurado");
    return false;
  }

  const url = `https://api.z-api.io/instances/${instanceId}/token/${token}/send-text`;

  try {
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
    console.log(`[AlertaPreco] WhatsApp enviado para ${fone}:`, JSON.stringify(json));
    return res.ok;
  } catch (err) {
    console.error(`[AlertaPreco] Erro ao enviar WhatsApp para ${phone}:`, err);
    return false;
  }
}

// Roda todo dia as 11h — verifica se algum produto baixou de preco
// e avisa o cliente que simulou aquele produto
export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Buscar precos atuais da tabela precos
    const { data: precos, error: errPrecos } = await supabase
      .from("precos")
      .select("modelo, armazenamento, preco_pix")
      .neq("status", "esgotado");

    if (errPrecos || !precos) {
      console.error("[AlertaPreco] Erro ao buscar precos:", errPrecos);
      return NextResponse.json({ error: "Erro ao buscar precos" }, { status: 500 });
    }

    // Montar mapa de precos atuais: "iPhone 16 Pro|256GB" → 5797
    const precoAtualMap = new Map<string, number>();
    for (const p of precos) {
      const key = `${p.modelo}|${p.armazenamento}`;
      precoAtualMap.set(key, Number(p.preco_pix));
    }

    // 2. Buscar simulacoes dos ultimos 30 dias que sairam sem fechar
    //    e ainda nao receberam alerta de preco
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);
    const dataLimite = trintaDiasAtras.toISOString();

    const { data: sims, error: errSims } = await supabase
      .from("simulacoes")
      .select("id, nome, whatsapp, modelo_novo, storage_novo, preco_novo, modelo_usado, storage_usado, diferenca, status, alerta_preco_enviado")
      .gte("created_at", dataLimite)
      .eq("status", "SAIR")
      .or("alerta_preco_enviado.is.null,alerta_preco_enviado.eq.false")
      .order("created_at", { ascending: false });

    if (errSims) {
      console.error("[AlertaPreco] Erro ao buscar simulacoes:", errSims);
      return NextResponse.json({ error: errSims.message }, { status: 500 });
    }

    if (!sims || sims.length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhuma simulacao elegivel" });
    }

    // 3. Comparar precos e enviar alertas
    let alertasEnviados = 0;
    const erros: string[] = [];
    const QUEDA_MINIMA = 100; // so avisa se baixou pelo menos R$100

    for (const s of sims) {
      if (!s.whatsapp || !s.modelo_novo || !s.storage_novo || !s.preco_novo) continue;

      const key = `${s.modelo_novo}|${s.storage_novo}`;
      const precoAtual = precoAtualMap.get(key);

      if (!precoAtual) continue; // produto nao existe mais no catalogo

      const precoOriginal = Number(s.preco_novo);
      const queda = precoOriginal - precoAtual;

      if (queda < QUEDA_MINIMA) continue; // nao baixou o suficiente

      // Calcular nova diferenca (preco novo - avaliacao usado)
      const avaliacaoUsado = Number(s.diferenca || 0) > 0
        ? precoOriginal - Number(s.diferenca)
        : 0;
      const novaDiferenca = avaliacaoUsado > 0 ? precoAtual - avaliacaoUsado : precoAtual;

      const nome = primeiroNome(s.nome);
      const modeloUsado = s.modelo_usado
        ? `${s.modelo_usado}${s.storage_usado ? ` ${s.storage_usado}` : ""}`
        : "seu aparelho";

      const msg = `Oi ${nome}! Tenho uma boa notícia! 🎉\n\nO *${s.modelo_novo} ${s.storage_novo}* que você pesquisou aqui na TIGRÃO IMPORTS *baixou ${fmtBRL(queda)}*!\n\nDando seu ${modeloUsado} na troca, a diferença agora fica em *${fmtBRL(novaDiferenca)}*.\n\nQuer aproveitar essa condição? Estou à disposição! 🐯`;

      const enviou = await enviarWhatsApp(s.whatsapp, msg);

      if (enviou) {
        alertasEnviados++;
        await supabase
          .from("simulacoes")
          .update({ alerta_preco_enviado: true })
          .eq("id", s.id);
      } else {
        erros.push(s.nome || "Sem nome");
      }

      // Delay de 3s entre mensagens
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return NextResponse.json({
      ok: true,
      simulacoes_analisadas: sims.length,
      alertas_enviados: alertasEnviados,
      erros,
    });
  } catch (err) {
    console.error("[AlertaPreco] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
