import { NextRequest, NextResponse } from "next/server";
import { rateLimitSubmission } from "@/lib/rate-limit";

async function notificarZAPI(mensagem: string) {
  const instanceId = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const destinatario = process.env.ZAPI_DESTINATARIO;

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
  const limited = rateLimitSubmission(req);
  if (limited) return limited;

  try {
    const body = await req.json();
    const status: "GOSTEI" | "SAIR" = body.status ?? "SAIR";

    const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
    const instagramLine = body.instagram ? `\nInstagram: ${body.instagram}` : "";
    const vendedorLine = body.vendedor ? `\nVendedor: ${body.vendedor}` : "";
    const condicaoBlock = body.condicaoLinhas?.length
      ? `\n${body.condicaoLinhas.join("\n")}`
      : "";
    const whatsappNumero = (body.whatsapp || "").replace(/\D/g, "");
    const whatsappNumeroFull = whatsappNumero.startsWith("55")
      ? whatsappNumero
      : `55${whatsappNumero}`;

    const textoFollowUp = encodeURIComponent(
      `Olá ${body.nome}! 😊 Vi que você fez uma simulação de trade-in no site da TigrãoImports.\n\n` +
      `📱 *Simulação:*\n` +
      `🆕 Novo: ${body.modeloNovo} ${body.storageNovo} (${fmt(body.precoNovo)})\n` +
      `🔄 Usado: ${body.modeloUsado} ${body.storageUsado} — Avaliado em ${fmt(body.avaliacaoUsado)}\n` +
      `💵 Diferença no PIX: ${fmt(body.diferenca)}\n\n` +
      `Posso te fazer uma proposta especial? 🐯`
    );
    const whatsappLink = `https://wa.me/${whatsappNumeroFull}?text=${textoFollowUp}`;

    // Only notify André when lead SAIR
    if (status === "SAIR") {
      const mensagemNotif =
        `🚨 LEAD SAIU SEM FECHAR!\n\n` +
        `👤 Nome: ${body.nome}\n` +
        `📱 WhatsApp: ${body.whatsapp}` +
        instagramLine + vendedorLine + `\n\n` +
        `🆕 Queria: ${body.modeloNovo} ${body.storageNovo} — ${fmt(body.precoNovo)}\n` +
        `🔄 Usado: ${body.modeloUsado} ${body.storageUsado}` +
        condicaoBlock + `\n` +
        `💱 Avaliação do usado: ${fmt(body.avaliacaoUsado)}\n` +
        `💵 Diferença no PIX: ${fmt(body.diferenca)}\n\n` +
        `👉 Entre em contato e tente fechar!\n` +
        `💬 ${whatsappLink}`;

      await notificarZAPI(mensagemNotif);
    } else {
      const mensagemGostei =
        `✅ LEAD FECHOU!\n\n` +
        `👤 Nome: ${body.nome}\n` +
        `📱 WhatsApp: ${body.whatsapp}` +
        instagramLine + vendedorLine + `\n\n` +
        `🆕 Produto: ${body.modeloNovo} ${body.storageNovo} — ${fmt(body.precoNovo)}\n` +
        `🔄 Usado: ${body.modeloUsado} ${body.storageUsado}\n` +
        `💱 Avaliação: ${fmt(body.avaliacaoUsado)}\n` +
        `💵 Diferença PIX: ${fmt(body.diferenca)}\n` +
        (body.formaPagamento ? `💳 Pagamento: ${body.formaPagamento}` : "");

      await notificarZAPI(mensagemGostei);
    }

    // Salva no Supabase
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("[leads] Supabase não configurado");
      return NextResponse.json({ ok: true });
    }

    const { supabase } = await import("@/lib/supabase");

    const { error } = await supabase.from("simulacoes").insert([{
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
      status,
      forma_pagamento: body.formaPagamento || null,
      condicao_linhas: body.condicaoLinhas || [],
      vendedor: body.vendedor || null,
    }]);

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
