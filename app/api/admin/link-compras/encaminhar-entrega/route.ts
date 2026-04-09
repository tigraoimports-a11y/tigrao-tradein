import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}
function getUser(request: Request) {
  const r = request.headers.get("x-admin-user") || "Sistema";
  try { return decodeURIComponent(r); } catch { return r; }
}

// POST { link_id, data_entrega, horario?, entregador?, observacao? }
// Lê o link_compras, cria uma entrega usando os dados do cliente (preferindo os preenchidos pelo cliente),
// e vincula o link à entrega via entrega_id + status=ENCAMINHADO.
export async function POST(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { link_id, data_entrega, horario, entregador, observacao } = body || {};
  if (!link_id || !data_entrega) {
    return NextResponse.json({ error: "link_id e data_entrega obrigatórios" }, { status: 400 });
  }
  const { supabase } = await import("@/lib/supabase");

  const { data: link, error: e1 } = await supabase
    .from("link_compras")
    .select("*")
    .eq("id", link_id)
    .single();
  if (e1 || !link) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 });
  if (link.entrega_id) {
    // Verifica se a entrega ainda existe; se foi apagada, libera o link automaticamente.
    const { data: ex } = await supabase.from("entregas").select("id").eq("id", link.entrega_id).maybeSingle();
    if (ex) return NextResponse.json({ error: "Este link já foi encaminhado para uma entrega." }, { status: 409 });
    await supabase.from("link_compras").update({ entrega_id: null, status: "PREENCHIDO" }).eq("id", link_id);
    link.entrega_id = null;
  }

  const preench = link.cliente_dados_preenchidos || {};
  const cliente = preench.nome || link.cliente_nome || "";
  const telefone = preench.telefone || link.cliente_telefone || null;
  const endereco = preench.endereco_completo
    || (preench.endereco ? `${preench.endereco}${preench.numero ? `, ${preench.numero}` : ""}${preench.complemento ? ` - ${preench.complemento}` : ""}` : null);
  const bairro = preench.bairro || null;

  if (!cliente) return NextResponse.json({ error: "Nome do cliente ausente — cliente ainda não preencheu?" }, { status: 400 });

  // Combinar produto principal + extras (multi-produto)
  const prods = [link.produto];
  if (link.produtos_extras) {
    try {
      const extras = typeof link.produtos_extras === "string"
        ? JSON.parse(link.produtos_extras)
        : link.produtos_extras;
      if (Array.isArray(extras)) prods.push(...extras);
    } catch { /* ignore */ }
  }
  const produtoTxt = prods.join(" + ");

  const { data: entrega, error: e2 } = await supabase
    .from("entregas")
    .insert({
      cliente,
      telefone,
      endereco,
      bairro,
      data_entrega,
      horario: horario || null,
      status: "PENDENTE",
      entregador: entregador || null,
      observacao: observacao || `Encaminhada do link ${link.short_code}`,
      produto: produtoTxt,
      tipo: link.tipo === "TROCA" ? "TROCA" : null,
      forma_pagamento: link.forma_pagamento || null,
      valor: link.valor != null ? Number(link.valor) - Number(link.desconto || 0) : null,
      entrada: link.entrada != null ? link.entrada : null,
      parcelas: link.parcelas != null ? Number(link.parcelas) : null,
      valor_total: link.valor != null ? Number(link.valor) - Number(link.desconto || 0) : null,
      vendedor: link.vendedor || null,
    })
    .select()
    .single();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  const { error: e3 } = await supabase
    .from("link_compras")
    .update({ entrega_id: entrega.id, status: "ENCAMINHADO", updated_at: new Date().toISOString() })
    .eq("id", link_id);
  if (e3) return NextResponse.json({ error: e3.message }, { status: 500 });

  logActivity(getUser(request), "Encaminhou link para entrega", `${link.short_code} → entrega ${entrega.id}`, "link_compras", link_id).catch(() => {});
  return NextResponse.json({ ok: true, entrega });
}
