import { NextRequest, NextResponse } from "next/server";
import { rateLimitSubmission } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const limited = rateLimitSubmission(req);
  if (limited) return limited;

  try {
    const body = await req.json();

    const { whatsapp, nome, modelo_usado, modelo_novo, valor_cotacao } = body;

    if (!whatsapp) {
      return NextResponse.json({ ok: false, error: "WhatsApp obrigatorio" }, { status: 400 });
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log("[exit-intent] Supabase nao configurado, ignorando");
      return NextResponse.json({ ok: true });
    }

    const { supabase } = await import("@/lib/supabase");

    const { error } = await supabase.from("tradein_leads").insert([{
      whatsapp,
      nome: nome || null,
      modelo_usado: modelo_usado || null,
      modelo_novo: modelo_novo || null,
      valor_cotacao: valor_cotacao || null,
    }]);

    if (error) {
      console.error("[exit-intent] Erro Supabase:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[exit-intent] Erro inesperado:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
