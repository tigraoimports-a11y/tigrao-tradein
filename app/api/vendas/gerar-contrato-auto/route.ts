import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimitSubmission } from "@/lib/rate-limit";
import { dispararContratoAuto } from "@/lib/contrato-auto";

// ============================================================
// POST /api/vendas/gerar-contrato-auto
// ============================================================
// Normalmente o contrato é disparado DENTRO do from-formulario, logo
// após a venda ser criada. Essa rota existe pra casos de retry manual:
//   - Admin clica "Tentar de novo" numa venda com termo em status ERRO
//   - Debug manual
//
// Body: { shortCode: string }
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const limited = rateLimitSubmission(req, "gerar-contrato-auto");
  if (limited) return limited;

  let body: { shortCode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  if (!body.shortCode) {
    return NextResponse.json({ error: "shortCode obrigatório" }, { status: 400 });
  }

  const supabase = getSupabase();
  const result = await dispararContratoAuto(supabase, body.shortCode);
  if (!result.ok) {
    return NextResponse.json(result, { status: 500 });
  }
  return NextResponse.json(result);
}
