import { NextRequest, NextResponse } from "next/server";
import { rateLimitSubmission } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limited = rateLimitSubmission(req);
  if (limited) return limited;

  try {
    const body = await req.json();
    const status: "GOSTEI" | "SAIR" = body.status ?? "SAIR";

    // Salva no Supabase
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("[leads] Supabase não configurado");
      return NextResponse.json({ ok: true });
    }

    const { supabase } = await import("@/lib/supabase");

    const row: Record<string, unknown> = {
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
    };
    // Cor do usado (campo opcional, só grava se existir a coluna no banco)
    if (body.corUsado != null) row.cor_usado = body.corUsado || null;
    // 2º produto na troca (se existir)
    if (body.modeloUsado2) row.modelo_usado2 = body.modeloUsado2;
    if (body.storageUsado2) row.storage_usado2 = body.storageUsado2;
    if (body.corUsado2 != null) row.cor_usado2 = body.corUsado2 || null;
    if (body.avaliacaoUsado2) row.avaliacao_usado2 = body.avaliacaoUsado2;
    if (body.condicaoLinhas2) row.condicao_linhas2 = body.condicaoLinhas2;
    // Numero de WhatsApp destino: rastreio de para quem foi o formulario
    if (body.whatsappDestino) row.whatsapp_destino = String(body.whatsappDestino).replace(/\D/g, "") || null;

    // Checagem de duplicidade real: mesmo whatsapp + produto novo + produto usado nos últimos 2 minutos
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: existing } = await supabase
      .from("simulacoes")
      .select("id")
      .eq("whatsapp", body.whatsapp || "")
      .eq("modelo_novo", body.modeloNovo || "")
      .eq("storage_novo", body.storageNovo || "")
      .eq("modelo_usado", body.modeloUsado || "")
      .eq("storage_usado", body.storageUsado || "")
      .gte("created_at", twoMinAgo)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log("[leads] Duplicidade detectada, ignorando re-envio");
      return NextResponse.json({ ok: true, duplicate: true });
    }

    let { error } = await supabase.from("simulacoes").insert([row]);

    // Fallback: se colunas cor_usado*/2 ainda não existem no banco, tenta sem elas
    if (error && /column\s+["']?cor_usado/i.test(error.message || "")) {
      console.warn("[leads] coluna cor_usado ausente, retry sem cor");
      delete row.cor_usado;
      delete row.cor_usado2;
      ({ error } = await supabase.from("simulacoes").insert([row]));
    }
    // Fallback: se whatsapp_destino ainda nao existe no banco (migration nao rodou), tenta sem ela
    if (error && /column\s+["']?whatsapp_destino/i.test(error.message || "")) {
      console.warn("[leads] coluna whatsapp_destino ausente, retry sem campo (rodar migration 20260421)");
      delete row.whatsapp_destino;
      ({ error } = await supabase.from("simulacoes").insert([row]));
    }

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
