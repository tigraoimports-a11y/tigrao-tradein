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

  // Calcular valor com taxa de cartão (mesma tabela do gerar-link)
  const TAXAS: Record<number, number> = {
    1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
    7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
    13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
    19: 20, 20: 21, 21: 22,
  };
  const valorBase = link.valor != null ? Number(link.valor) - Number(link.desconto || 0) : 0;
  const entradaVal = Number(link.entrada || 0);
  const trocaVal = Number(link.troca_valor || 0) + Number(link.troca_valor2 || 0);
  const parcelasNum = Number(link.parcelas || 0);
  const forma = link.forma_pagamento || "";
  const isCartao = forma === "Cartao Credito" || forma === "Link de Pagamento";
  const restante = Math.max(0, valorBase - entradaVal - trocaVal);
  const taxaPct = isCartao && parcelasNum > 0 ? (TAXAS[parcelasNum] || 0) : 0;
  const restanteComTaxa = taxaPct > 0 ? Math.ceil(restante * (1 + taxaPct / 100)) : restante;
  const valorFinal = entradaVal + restanteComTaxa;

  // Monta a observação enriquecida com tudo que a Bia precisa pra entrega:
  // - observação manual do admin (se houver)
  // - produto(s) na troca com cor/condição/valor
  // - local preferido que o cliente marcou no formulário
  // - short_code (fallback de rastreabilidade)
  const obsParts: string[] = [];
  if (observacao) obsParts.push(String(observacao).trim());
  const trocaLinhas: string[] = [];
  if (link.troca_produto) {
    const t1 = [
      link.troca_produto,
      link.troca_cor ? `cor ${link.troca_cor}` : null,
      link.troca_condicao ? link.troca_condicao : null,
      Number(link.troca_valor) ? `R$ ${Number(link.troca_valor).toLocaleString("pt-BR")}` : null,
    ].filter(Boolean).join(" • ");
    trocaLinhas.push(`🔄 Troca 1: ${t1}`);
  }
  if (link.troca_produto2) {
    const t2 = [
      link.troca_produto2,
      link.troca_cor2 ? `cor ${link.troca_cor2}` : null,
      link.troca_condicao2 ? link.troca_condicao2 : null,
      Number(link.troca_valor2) ? `R$ ${Number(link.troca_valor2).toLocaleString("pt-BR")}` : null,
    ].filter(Boolean).join(" • ");
    trocaLinhas.push(`🔄 Troca 2: ${t2}`);
  }
  if (trocaLinhas.length > 0) obsParts.push(trocaLinhas.join("\n"));
  if (preench.local) obsParts.push(`📍 Local preferido: ${preench.local}`);
  if (preench.instagram) obsParts.push(`Instagram: ${preench.instagram}`);
  obsParts.push(`Encaminhada do link ${link.short_code}`);
  const observacaoFinal = obsParts.filter(Boolean).join("\n");

  // Campo detalhes_upgrade é usado pela aba de entregas pra listar trocas do pedido
  const detalhesUpgrade = trocaLinhas.length > 0
    ? trocaLinhas.map(l => l.replace(/^🔄\s*Troca \d:\s*/, "")).join("\n")
    : null;

  const { data: entrega, error: e2 } = await supabase
    .from("entregas")
    .insert({
      cliente,
      telefone,
      endereco,
      bairro,
      data_entrega,
      horario: horario || preench.horario || null,
      status: "PENDENTE",
      entregador: entregador || null,
      observacao: observacaoFinal,
      detalhes_upgrade: detalhesUpgrade,
      produto: produtoTxt,
      tipo: link.tipo === "TROCA" || trocaLinhas.length > 0 ? "TROCA" : null,
      forma_pagamento: (() => {
        if (!forma) return null;
        if (isCartao && parcelasNum > 0) return `${parcelasNum}x no ${forma === "Link de Pagamento" ? "Link" : "Cartão"}`;
        return forma;
      })(),
      valor: valorFinal > 0 ? valorFinal : (valorBase > 0 ? valorBase : null),
      entrada: entradaVal > 0 ? entradaVal : null,
      parcelas: parcelasNum > 0 ? parcelasNum : null,
      valor_total: valorFinal > 0 ? valorFinal : (valorBase > 0 ? valorBase : null),
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
