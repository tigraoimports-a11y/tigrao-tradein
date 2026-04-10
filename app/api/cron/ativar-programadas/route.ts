// Cron: Ativar vendas programadas quando chega o dia
// Roda à meia-noite (3h UTC = 0h BRT)
// Move vendas com status PROGRAMADA e data_programada <= hoje para AGUARDANDO

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function authCron(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  return secret === process.env.CRON_SECRET;
}

export async function GET(req: NextRequest) {
  if (!authCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Pegar data de hoje no fuso de Brasília
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD

    // Buscar vendas PROGRAMADA com data_programada <= hoje
    const { data: vendas, error } = await supabase
      .from("vendas")
      .select("id, cliente, data_programada")
      .eq("status_pagamento", "PROGRAMADA")
      .lte("data_programada", hoje);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!vendas || vendas.length === 0) {
      return NextResponse.json({ message: "Nenhuma venda programada para ativar hoje", count: 0 });
    }

    // Mover todas para AGUARDANDO
    const ids = vendas.map((v) => v.id);
    const { error: updateError } = await supabase
      .from("vendas")
      .update({ status_pagamento: "AGUARDANDO" })
      .in("id", ids);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const nomes = vendas.map((v) => v.cliente).join(", ");
    return NextResponse.json({
      message: `${vendas.length} venda(s) ativada(s): ${nomes}`,
      count: vendas.length,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
