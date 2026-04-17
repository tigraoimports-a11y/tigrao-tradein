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
  const { link_id, data_entrega, horario, entregador, observacao, vendedor: vendedorOverride } = body || {};
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
  // Endereço final da entrega:
  // - Shopping: "Entrega - Shopping: X" vira endereço "X" (pro motoboy ir ao shopping)
  // - Correios/Retirada em loja: usa o próprio label como endereço (bairro fica null)
  // - Residência (default): rua + número + complemento (endereço de casa do cliente)
  const localPref = typeof preench.local === "string" ? preench.local.trim() : "";
  const localLower = localPref.toLowerCase();
  let endereco: string | null = null;
  let bairro: string | null = preench.bairro || null;
  if (localLower.includes("shopping:")) {
    // "Entrega - Shopping: Shopping Metropolitano" → "Shopping Metropolitano"
    const m = localPref.match(/shopping:\s*(.+)$/i);
    endereco = m ? m[1].trim() : localPref;
    bairro = null;
  } else if (localLower.includes("correios") || localLower.includes("retirada")) {
    endereco = localPref;
    bairro = null;
  } else {
    // Residência (padrão): endereço de casa do cliente
    endereco = preench.endereco_completo
      || (preench.endereco ? `${preench.endereco}${preench.numero ? `, ${preench.numero}` : ""}${preench.complemento ? ` - ${preench.complemento}` : ""}` : null);
  }

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
  const parcelasNum = Number(link.parcelas || 0) || Number(preench.parcelas || 0);
  // Pega forma de pagamento do link_compras ou do formulário preenchido pelo cliente
  // (link-compras-auto não salva forma_pagamento; ela só chega via preenchimento do /compra).
  const forma = link.forma_pagamento || preench.forma_pagamento || "";
  const isCartao = forma === "Cartao Credito" || forma === "Link de Pagamento";
  const restante = Math.max(0, valorBase - entradaVal - trocaVal);
  const taxaPct = isCartao && parcelasNum > 0 ? (TAXAS[parcelasNum] || 0) : 0;
  const restanteComTaxa = taxaPct > 0 ? Math.ceil(restante * (1 + taxaPct / 100)) : restante;
  const valorFinal = entradaVal + restanteComTaxa;

  // Campo detalhes_upgrade é usado pela aba de entregas pra listar trocas do pedido
  // (o texto do motoboy tem uma seção "PRODUTO NA TROCA" própria que lê desse campo).
  const trocaLinhas: string[] = [];
  if (link.troca_produto) {
    const t1 = [
      link.troca_produto,
      link.troca_cor ? `cor ${link.troca_cor}` : null,
      link.troca_condicao ? link.troca_condicao : null,
      Number(link.troca_valor) ? `R$ ${Number(link.troca_valor).toLocaleString("pt-BR")}` : null,
    ].filter(Boolean).join(" • ");
    trocaLinhas.push(t1);
  }
  if (link.troca_produto2) {
    const t2 = [
      link.troca_produto2,
      link.troca_cor2 ? `cor ${link.troca_cor2}` : null,
      link.troca_condicao2 ? link.troca_condicao2 : null,
      Number(link.troca_valor2) ? `R$ ${Number(link.troca_valor2).toLocaleString("pt-BR")}` : null,
    ].filter(Boolean).join(" • ");
    trocaLinhas.push(t2);
  }
  const detalhesUpgrade = trocaLinhas.length > 0 ? trocaLinhas.join("\n") : null;

  // Observação enxuta (sem duplicar dados que já saem em outros campos do texto do motoboy):
  // - observação manual do admin (se houver)
  // - instagram do cliente (info extra útil)
  // - short_code (rastreabilidade)
  // Troca e local NÃO entram aqui: troca vai em detalhes_upgrade (seção PRODUTO NA TROCA),
  // e o local vira o próprio endereco da entrega.
  const obsParts: string[] = [];
  if (observacao) obsParts.push(String(observacao).trim());
  if (preench.instagram) obsParts.push(`Instagram: ${preench.instagram}`);
  obsParts.push(`Encaminhada do link ${link.short_code}`);
  const observacaoFinal = obsParts.filter(Boolean).join("\n");

  // Vendedor da entrega:
  //  1. Se operador escolheu explicitamente no modal (vendedorOverride) → usa esse
  //  2. Senao, se quem esta encaminhando tem recebe_links=true (Bianca/André) → usa ele
  //  3. Fallback: mantem o vendedor original do link
  let vendedorFinal: string | null = link.vendedor || null;
  if (vendedorOverride && String(vendedorOverride).trim()) {
    vendedorFinal = String(vendedorOverride).trim();
  } else {
    try {
      const userLogado = getUser(request);
      if (userLogado && userLogado !== "Sistema") {
        const { data: cfg } = await supabase
          .from("tradein_config")
          .select("labels")
          .limit(1)
          .maybeSingle();
        const labels = (cfg?.labels || {}) as Record<string, unknown>;
        const recebeMap = (labels._whatsapp_vendedores_recebe_links || {}) as Record<string, boolean>;
        const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const userKey = norm(userLogado);
        // Procura match case-insensitive e sem acento
        const recebe = Object.entries(recebeMap).some(([nome, flag]) => norm(nome) === userKey && flag === true);
        if (recebe) {
          vendedorFinal = userLogado;
        }
      }
    } catch { /* silent: fallback ja e link.vendedor */ }
  }

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
        // Monta a forma base do restante (pos-entrada)
        const base = isCartao && parcelasNum > 0
          ? `${parcelasNum}x no ${forma === "Link de Pagamento" ? "Link" : "Cartão"}`
          : forma;
        // Se tem entrada (Pix/Especie), mostra separadamente pro motoboy saber
        // a quebra (ex: "Entrada R$ 500 via Pix + 10x no Cartão"). Banco do Pix
        // nao interessa no texto do motoboy — e info interna.
        if (entradaVal > 0) {
          const formaEntrada = String(preench.forma_entrada || "PIX").toUpperCase();
          const labelForma = formaEntrada.includes("ESPEC") || formaEntrada.includes("DINHEIRO") ? "Dinheiro" : "Pix";
          return `Entrada R$ ${entradaVal.toLocaleString("pt-BR")} via ${labelForma} + ${base}`;
        }
        return base;
      })(),
      valor: valorFinal > 0 ? valorFinal : (valorBase > 0 ? valorBase : null),
      entrada: entradaVal > 0 ? entradaVal : null,
      parcelas: parcelasNum > 0 ? parcelasNum : null,
      valor_total: valorFinal > 0 ? valorFinal : (valorBase > 0 ? valorBase : null),
      vendedor: vendedorFinal,
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
