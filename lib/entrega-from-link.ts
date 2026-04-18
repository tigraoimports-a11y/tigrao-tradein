// Helper compartilhado: monta o payload de entrega a partir de um link_compras.
// Usado em:
//  - POST /api/admin/link-compras/encaminhar-entrega (cria entrega)
//  - PATCH /api/admin/link-compras (sincroniza entrega vinculada quando link
//    eh editado depois de ja ter sido encaminhado)

type LinkRow = {
  short_code?: string | null;
  tipo?: string | null;
  produto?: string | null;
  produtos_extras?: unknown;
  valor?: number | null;
  desconto?: number | null;
  entrada?: number | null;
  parcelas?: number | null;
  forma_pagamento?: string | null;
  troca_produto?: string | null;
  troca_cor?: string | null;
  troca_condicao?: string | null;
  troca_valor?: number | null;
  troca_produto2?: string | null;
  troca_cor2?: string | null;
  troca_condicao2?: string | null;
  troca_valor2?: number | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_dados_preenchidos?: Record<string, unknown> | null;
  vendedor?: string | null;
};

// Tabela de taxa de cartao (mesma do encaminhar-entrega e gerar-link)
const TAXAS_CARTAO: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
  7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
  13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
  19: 20, 20: 21, 21: 22,
};

export interface EntregaCampos {
  produto: string;
  forma_pagamento: string | null;
  valor: number | null;
  entrada: number | null;
  parcelas: number | null;
  valor_total: number | null;
  detalhes_upgrade: string | null;
  tipo: string | null;
  // Campos vindos do preenchimento do cliente (so atualizados quando existem)
  cliente?: string;
  telefone?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  vendedor?: string | null;
}

/**
 * Calcula campos da entrega a partir do link. Extraido de
 * encaminhar-entrega/route.ts pra evitar divergencia quando link eh editado.
 */
export function entregaFromLink(link: LinkRow): EntregaCampos {
  const preench = (link.cliente_dados_preenchidos || {}) as Record<string, unknown>;

  // Produto: principal + extras
  const prods: string[] = [link.produto || ""];
  if (link.produtos_extras) {
    try {
      const extras = typeof link.produtos_extras === "string"
        ? JSON.parse(link.produtos_extras)
        : link.produtos_extras;
      if (Array.isArray(extras)) prods.push(...(extras as string[]));
    } catch { /* ignore */ }
  }
  const produto = prods.filter(Boolean).join(" + ");

  // Valor com taxa de cartao
  const valorBase = link.valor != null ? Number(link.valor) - Number(link.desconto || 0) : 0;
  const entradaVal = Number(link.entrada || 0);
  const trocaVal = Number(link.troca_valor || 0) + Number(link.troca_valor2 || 0);
  const parcelasNum = Number(link.parcelas || 0) || Number(preench.parcelas || 0);
  const forma = link.forma_pagamento || (preench.forma_pagamento as string) || "";
  const isCartao = forma === "Cartao Credito" || forma === "Link de Pagamento";
  const restante = Math.max(0, valorBase - entradaVal - trocaVal);
  const taxaPct = isCartao && parcelasNum > 0 ? (TAXAS_CARTAO[parcelasNum] || 0) : 0;
  const restanteComTaxa = taxaPct > 0 ? Math.ceil(restante * (1 + taxaPct / 100)) : restante;
  const valorFinal = entradaVal + restanteComTaxa;

  // Detalhes upgrade (trocas)
  const trocaLinhas: string[] = [];
  if (link.troca_produto) {
    const t1 = [
      link.troca_produto,
      link.troca_cor ? `cor ${link.troca_cor}` : null,
      link.troca_condicao || null,
      Number(link.troca_valor) ? `R$ ${Number(link.troca_valor).toLocaleString("pt-BR")}` : null,
    ].filter(Boolean).join(" • ");
    trocaLinhas.push(t1);
  }
  if (link.troca_produto2) {
    const t2 = [
      link.troca_produto2,
      link.troca_cor2 ? `cor ${link.troca_cor2}` : null,
      link.troca_condicao2 || null,
      Number(link.troca_valor2) ? `R$ ${Number(link.troca_valor2).toLocaleString("pt-BR")}` : null,
    ].filter(Boolean).join(" • ");
    trocaLinhas.push(t2);
  }
  const detalhesUpgrade = trocaLinhas.length > 0 ? trocaLinhas.join("\n") : null;

  // Forma de pagamento formatada
  let formaFormatada: string | null = null;
  if (forma) {
    const base = isCartao && parcelasNum > 0
      ? `${parcelasNum}x no ${forma === "Link de Pagamento" ? "Link" : "Cartão"}`
      : forma;
    if (entradaVal > 0) {
      const formaEntrada = String(preench.forma_entrada || "PIX").toUpperCase();
      const labelForma = formaEntrada.includes("ESPEC") || formaEntrada.includes("DINHEIRO") ? "Dinheiro" : "Pix";
      formaFormatada = `Entrada R$ ${entradaVal.toLocaleString("pt-BR")} via ${labelForma} + ${base}`;
    } else {
      formaFormatada = base;
    }
  }

  return {
    produto,
    forma_pagamento: formaFormatada,
    valor: valorFinal > 0 ? valorFinal : (valorBase > 0 ? valorBase : null),
    entrada: entradaVal > 0 ? entradaVal : null,
    parcelas: parcelasNum > 0 ? parcelasNum : null,
    valor_total: valorFinal > 0 ? valorFinal : (valorBase > 0 ? valorBase : null),
    detalhes_upgrade: detalhesUpgrade,
    tipo: link.tipo === "TROCA" || trocaLinhas.length > 0 ? "TROCA" : null,
  };
}
