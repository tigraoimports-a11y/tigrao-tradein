import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Se Supabase não estiver configurado, retorna sucesso silencioso
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
