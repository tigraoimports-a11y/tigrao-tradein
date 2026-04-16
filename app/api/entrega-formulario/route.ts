import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { rateLimitSubmission, checkHoneypot } from "@/lib/rate-limit";

// API pública para criar entrega a partir do formulário de compra
// Usa um token simples pra evitar spam + rate limit + honeypot.
export async function POST(req: NextRequest) {
  const limited = rateLimitSubmission(req, "entrega");
  if (limited) return limited;

  const body = await req.json();

  const honeypot = checkHoneypot(body);
  if (honeypot) return honeypot;

  const { token, cliente, telefone, endereco, bairro, produto, forma_pagamento, valor, horario, tipo, vendedor, observacao } = body;

  // Token simples pra evitar abuso (não precisa de auth admin)
  if (token !== "tigrao-form-2026") {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 });
  }

  if (!cliente) {
    return NextResponse.json({ error: "Cliente obrigatório" }, { status: 400 });
  }

  // Data de entrega: se tem horário com data, extrair. Senão, usar amanhã
  const hoje = new Date();
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const dataEntrega = amanha.toISOString().slice(0, 10);

  const { data, error } = await supabase.from("entregas").insert({
    cliente,
    telefone: telefone || null,
    endereco: endereco || null,
    bairro: bairro || null,
    data_entrega: dataEntrega,
    horario: horario || null,
    status: "PENDENTE",
    produto: produto || null,
    tipo: tipo || null,
    forma_pagamento: forma_pagamento || null,
    valor: valor || null,
    vendedor: vendedor || null,
    observacao: observacao || null,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
