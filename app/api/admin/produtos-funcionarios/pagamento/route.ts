import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * POST: registra um pagamento do funcionario.
 * Body: {
 *   produto_funcionario_id, data?, valor, forma, conta?, parcelas?, valor_liquido?, observacao?
 * }
 *
 * Apos registrar: atualiza valor_pago no vinculo e status='QUITADO' se total >= valor_funcionario.
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  try {
    const body = await req.json();
    const { produto_funcionario_id, data, valor, forma, conta, parcelas, valor_liquido, observacao } = body;

    if (!produto_funcionario_id) return NextResponse.json({ error: "produto_funcionario_id obrigatório" }, { status: 400 });
    if (!valor || Number(valor) <= 0) return NextResponse.json({ error: "Valor inválido" }, { status: 400 });
    if (!forma) return NextResponse.json({ error: "Forma de pagamento obrigatória" }, { status: 400 });

    const { data: vinculo } = await supabase
      .from("produtos_funcionarios").select("*").eq("id", produto_funcionario_id).single();
    if (!vinculo) return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });

    const { error: insErr } = await supabase.from("produtos_funcionarios_pagamentos").insert({
      produto_funcionario_id,
      data: data || new Date().toISOString().slice(0, 10),
      valor: Number(valor),
      forma,
      conta: conta || null,
      parcelas: Number(parcelas || 1),
      valor_liquido: valor_liquido != null ? Number(valor_liquido) : Number(valor),
      observacao: observacao || null,
      criado_por: usuario,
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // Recalcula valor_pago somando todos os pagamentos
    const { data: pags } = await supabase
      .from("produtos_funcionarios_pagamentos").select("valor").eq("produto_funcionario_id", produto_funcionario_id);
    const totalPago = (pags || []).reduce((s, p) => s + Number(p.valor || 0), 0);

    const alvo = Number(vinculo.valor_funcionario || 0);
    const novoStatus = alvo > 0 && totalPago >= alvo
      ? "QUITADO"
      : totalPago > 0 && alvo > 0
        ? "PENDENTE_PAGAMENTO"
        : vinculo.status;

    await supabase.from("produtos_funcionarios").update({
      valor_pago: totalPago,
      status: novoStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", produto_funcionario_id);

    await logActivity(
      usuario,
      "Registrou pagamento de funcionario",
      `${vinculo.funcionario} — ${vinculo.produto} — R$ ${Number(valor).toLocaleString("pt-BR")}`,
      "produtos_funcionarios",
      produto_funcionario_id
    );

    return NextResponse.json({ ok: true, totalPago, status: novoStatus });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE: remove um pagamento e recalcula.
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const { data: pag } = await supabase
      .from("produtos_funcionarios_pagamentos").select("*").eq("id", id).single();
    if (!pag) return NextResponse.json({ error: "Pagamento não encontrado" }, { status: 404 });

    const { error } = await supabase.from("produtos_funcionarios_pagamentos").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Recalcula
    const { data: pags } = await supabase
      .from("produtos_funcionarios_pagamentos").select("valor").eq("produto_funcionario_id", pag.produto_funcionario_id);
    const totalPago = (pags || []).reduce((s, p) => s + Number(p.valor || 0), 0);

    const { data: vinculo } = await supabase
      .from("produtos_funcionarios").select("valor_funcionario,status").eq("id", pag.produto_funcionario_id).single();
    const alvo = Number(vinculo?.valor_funcionario || 0);
    const novoStatus = alvo > 0 && totalPago >= alvo ? "QUITADO"
      : totalPago > 0 && alvo > 0 ? "PENDENTE_PAGAMENTO"
      : "ACORDO_ATIVO";

    await supabase.from("produtos_funcionarios").update({
      valor_pago: totalPago,
      status: novoStatus,
      updated_at: new Date().toISOString(),
    }).eq("id", pag.produto_funcionario_id);

    await logActivity(
      usuario,
      "Removeu pagamento de funcionario",
      `R$ ${Number(pag.valor).toLocaleString("pt-BR")}`,
      "produtos_funcionarios",
      pag.produto_funcionario_id
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
