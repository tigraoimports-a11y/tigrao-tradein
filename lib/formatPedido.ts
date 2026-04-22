// ============================================================
// Formato canônico da mensagem de PEDIDO (WhatsApp Tigrão)
// ============================================================
// Mesma função é usada em 2 lugares:
//   1. /compra/page.tsx — cliente clica "Enviar WhatsApp" e a mensagem
//      é gerada client-side e aberta via wa.me.
//   2. /api/mp-webhook — quando cliente paga Link MP após preencher o
//      formulário, o webhook monta a mesma mensagem e envia via Z-API
//      pro grupo empresa (sem depender do cliente apertar "enviar").
//
// O formato é idêntico ao que o cliente enviaria pelo WhatsApp manualmente,
// garantindo que a equipe receba a mesma informação em qualquer fluxo.
//
// Emojis: ASCII-only (▸ e colchetes) — alguns devices não renderizam emojis
// do plano suplementar Unicode (U+1F000+) no WhatsApp.
// ============================================================

// Tabela de taxas de parcelamento (igual ao /compra e /admin/orcamento)
const TAXAS_PARCELA: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
  7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
  13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
  19: 20, 20: 21, 21: 22,
};

export interface PedidoCliente {
  nome: string;
  pessoa?: "PF" | "PJ";
  cpf?: string;
  cnpj?: string;
  email?: string;
  telefone?: string;
  instagram?: string;
  cep?: string;
  endereco?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
}

export interface PedidoProduto {
  nome: string;
  cor?: string;
  preco: number;
  extras?: Array<{ nome: string; preco: number }>;
}

export interface PedidoPagamento {
  forma?: string; // "PIX" | "Cartao" | "PIX + Cartao" | "Debito" | "Link de Pagamento"
  parcelas?: string | number;
  entrada?: number; // entrada PIX (se houver)
  desconto?: number;
  pagamentoPago?: "mp" | "pix" | null; // se já foi pago
  mpPaymentId?: string | null;
  mpPreferenceId?: string | null;
}

export interface PedidoTrocaItem {
  modelo: string;
  cor?: string;
  valor?: number;
  condicao?: string;
  caixa?: boolean;
  serial?: string;
  imei?: string;
}

export interface PedidoTroca {
  aparelhos?: PedidoTrocaItem[];
  descricaoLivre?: string; // fallback quando não tem detalhes estruturados
}

export interface PedidoEntrega {
  local: "Entrega" | "Correios" | "Shopping" | "Loja" | string;
  tipoEntrega?: "Residencia" | "Comercial";
  shopping?: string;
  data?: string; // "YYYY-MM-DD"
  horario?: string;
  vendedor?: string;
  origem?: string; // indicação (Instagram, Google, etc)
}

export interface PedidoData {
  cliente: PedidoCliente;
  produto: PedidoProduto;
  pagamento: PedidoPagamento;
  troca?: PedidoTroca;
  entrega: PedidoEntrega;
  isFromTradeIn?: boolean; // muda o header "fiz avaliação" vs "vim pelo formulário"
}

// ── Helpers de formatação ──

const fmt = (v: number): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const fmt2 = (v: number): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calcParcelas(valor: number, parcelas: number): { n: number; total: number; vp: number } | null {
  if (!parcelas || parcelas < 1) return null;
  const taxa = TAXAS_PARCELA[parcelas] ?? 0;
  const total = valor * (1 + taxa / 100);
  const vp = total / parcelas;
  return { n: parcelas, total, vp };
}

function formatarLocalEntrega(entrega: PedidoEntrega): string {
  const { local, tipoEntrega, shopping } = entrega;
  if (local === "Correios") return "Envio Correios";
  if (local === "Loja") return "Retirada na loja";
  if (local === "Shopping" && shopping) return `Entrega - Shopping: ${shopping}`;
  if (local === "Shopping") return "Entrega - Shopping";
  if (local === "Entrega" && tipoEntrega === "Comercial") return "Entrega - Comercial";
  if (local === "Entrega") return "Entrega - Residência";
  return local || "—";
}

// ── Bloco principal ──

/**
 * Monta a mensagem de pedido no formato canônico Tigrão.
 *
 * @param data Todos os dados do pedido (cliente, produto, pagamento, troca, entrega).
 * @param opts Opções extras. `header: false` omite a linha "Olá, me chamo..." —
 *             útil quando a msg é enviada pelo servidor (webhook MP) e o prefixo
 *             fica com "💰 PAGAMENTO APROVADO" em vez da saudação do cliente.
 * @returns String completa no formato que o cliente enviaria pelo WhatsApp.
 */
export function formatPedidoMessage(
  data: PedidoData,
  opts: { header?: boolean; prefix?: string[] } = {}
): string {
  const { header = true, prefix } = opts;
  const { cliente, produto, pagamento, troca, entrega, isFromTradeIn } = data;

  const preco = Number(produto.preco) || 0;
  const extrasTotal = (produto.extras || []).reduce((s, e) => s + (Number(e.preco) || 0), 0);
  const desconto = Number(pagamento.desconto) || 0;
  const trocaTotal = (troca?.aparelhos || []).reduce((s, a) => s + (Number(a.valor) || 0), 0);

  const valorBase = Math.max(preco + extrasTotal - desconto - trocaTotal, 0);
  const entrada = Number(pagamento.entrada) || 0;
  const valorParcelar = entrada > 0 ? Math.max(valorBase - entrada, 0) : valorBase;

  const parcelasNum =
    pagamento.parcelas !== undefined
      ? parseInt(String(pagamento.parcelas)) || 0
      : 0;
  const parcelasCalc = parcelasNum > 0 ? calcParcelas(valorParcelar, parcelasNum) : null;

  // ── Header ──
  const lines: string[] = [];

  if (prefix && prefix.length) {
    lines.push(...prefix, "");
  }

  if (header) {
    const saudacao = isFromTradeIn
      ? `Olá, me chamo ${cliente.nome}. Fiz a avaliação de troca no site e preenchi o formulário de compra.`
      : `Olá, me chamo ${cliente.nome}. Vim pelo formulário de compra!`;
    lines.push(saudacao, "");
  }

  lines.push(`*━━━ DADOS DA COMPRA — Tigrão Imports ━━━*`, "");

  // ── Dados pessoais ──
  lines.push(`*▸ DADOS PESSOAIS*`);
  if (cliente.pessoa === "PJ") {
    lines.push(`*Tipo:* Pessoa Jurídica`);
    lines.push(`*Razão Social:* ${cliente.nome}`);
    if (cliente.cnpj) lines.push(`*CNPJ:* ${cliente.cnpj}`);
  } else {
    lines.push(`*Nome completo:* ${cliente.nome}`);
    if (cliente.cpf) lines.push(`*CPF:* ${cliente.cpf}`);
  }
  if (cliente.email) lines.push(`*E-mail:* ${cliente.email}`);
  if (cliente.telefone) lines.push(`*Telefone:* ${cliente.telefone}`);
  if (cliente.instagram) lines.push(`*Instagram:* ${cliente.instagram}`);
  if (cliente.cep) lines.push(`*CEP:* ${cliente.cep}`);
  if (cliente.endereco) {
    const enderecoFull = `${cliente.endereco}${cliente.numero ? `, ${cliente.numero}` : ""}${cliente.complemento ? ` - ${cliente.complemento}` : ""}`;
    lines.push(`*Endereço:* ${enderecoFull}`);
  }
  if (cliente.bairro) lines.push(`*Bairro:* ${cliente.bairro}`);

  // ── Produto(s) ──
  lines.push("", `*▸ ${(produto.extras?.length ?? 0) > 0 ? "PRODUTOS" : "PRODUTO"}*`);
  lines.push(
    `*Produto 1:* ${produto.nome}${produto.cor ? ` — ${produto.cor}` : ""}${preco > 0 ? ` — R$ ${fmt(preco)}` : ""}`
  );
  (produto.extras || []).forEach((p, i) => {
    lines.push(`*Produto ${i + 2}:* ${p.nome}${p.preco > 0 ? ` — R$ ${fmt(p.preco)}` : ""}`);
  });
  if (desconto > 0) lines.push(`*Desconto:* - R$ ${fmt(desconto)}`);
  if (desconto > 0 || (produto.extras && produto.extras.length > 0)) {
    lines.push(`*Total:* R$ ${fmt(valorBase)}`);
  }

  // ── Pagamento ──
  lines.push("", `*▸ PAGAMENTO*`);
  const forma = (pagamento.forma || "").trim();
  const isMpComPixPendente = pagamento.pagamentoPago === "mp" && entrada > 0;

  if (isMpComPixPendente && parcelasCalc) {
    lines.push(
      `*Pagamento 1:* Link MP — ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)} (total R$ ${fmt2(parcelasCalc.total)}) [PAGO]`
    );
    lines.push(`*Pagamento 2:* PIX R$ ${fmt(entrada)} [PENDENTE]`);
  } else if (isMpComPixPendente) {
    lines.push(`*Pagamento 1:* Link MP R$ ${fmt(valorParcelar)} [PAGO]`);
    lines.push(`*Pagamento 2:* PIX R$ ${fmt(entrada)} [PENDENTE]`);
  } else if (forma === "PIX") {
    lines.push(`*Forma:* PIX`);
    lines.push(`*Valor:* R$ ${fmt(valorBase)}`);
  } else if (forma === "Debito") {
    lines.push(`*Forma:* Débito`);
    lines.push(`*Valor:* R$ ${fmt(valorBase)}`);
  } else if ((forma.includes("Cartao") || forma === "PIX + Cartao") && parcelasCalc) {
    if (entrada > 0) {
      lines.push(`*Forma:* PIX + Cartão`);
      lines.push(`*Entrada PIX:* R$ ${fmt(entrada)}`);
      lines.push(`*Parcelas:* ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)}`);
      lines.push(`*Total no cartão:* R$ ${fmt2(parcelasCalc.total)}`);
    } else {
      lines.push(`*Forma:* Cartão de Crédito`);
      lines.push(`*Parcelas:* ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)}`);
      lines.push(`*Total:* R$ ${fmt2(parcelasCalc.total)}`);
    }
  } else if (forma === "Link de Pagamento" && parcelasCalc) {
    lines.push(`*Forma:* Link de Pagamento`);
    lines.push(`*Parcelas:* ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)}`);
    lines.push(`*Total:* R$ ${fmt2(parcelasCalc.total)}`);
  } else if (forma === "Link de Pagamento" && parcelasNum > 0) {
    lines.push(`*Forma:* Link de Pagamento — ${parcelasNum}x`);
  } else if (forma) {
    lines.push(`*Forma:* ${forma}`);
  } else if (pagamento.pagamentoPago === "mp" && parcelasCalc) {
    // Pago no link MP sem PIX pendente — ainda mostra parcelas pra clareza
    lines.push(`*Forma:* Link MP [PAGO]`);
    lines.push(`*Parcelas:* ${parcelasCalc.n}x de R$ ${fmt2(parcelasCalc.vp)}`);
  } else if (pagamento.pagamentoPago === "mp") {
    lines.push(`*Forma:* Link MP [PAGO]`);
    if (valorBase > 0) lines.push(`*Valor:* R$ ${fmt(valorBase)}`);
  }

  // Detalhes extras MP (ID do pagamento)
  if (pagamento.pagamentoPago === "mp" && !isMpComPixPendente && valorBase > 0) {
    lines.push(`*Valor pago no link:* R$ ${fmt(valorBase)}`);
  }
  if (pagamento.pagamentoPago === "mp" && pagamento.mpPaymentId) {
    lines.push(`*ID do pagamento MP:* ${pagamento.mpPaymentId}`);
  } else if (pagamento.pagamentoPago === "mp" && pagamento.mpPreferenceId) {
    lines.push(`*Preference MP:* ${pagamento.mpPreferenceId}`);
  }

  // ── Troca ──
  const aparelhos = troca?.aparelhos || [];
  if (aparelhos.length > 0 || troca?.descricaoLivre) {
    const temMultiplos = aparelhos.length > 1;
    lines.push("", `*▸ ${temMultiplos ? "APARELHOS NA TROCA" : "APARELHO NA TROCA"}*`);
    if (aparelhos.length > 0) {
      aparelhos.forEach((ap, idx) => {
        if (temMultiplos) lines.push("", `*Aparelho ${idx + 1}:*`);
        lines.push(`*Modelo:* ${ap.modelo}`);
        if (ap.cor) lines.push(`*Cor:* ${ap.cor}`);
        if (ap.valor && ap.valor > 0) lines.push(`*Valor avaliado:* R$ ${fmt(ap.valor)}`);
        if (ap.condicao) lines.push(`*Condição:* ${ap.condicao}`);
        if (ap.caixa !== undefined) lines.push(`*Caixa original:* ${ap.caixa ? "Sim" : "Não"}`);
        if (ap.serial && ap.serial.trim()) lines.push(`*Nº de Série:* ${ap.serial.trim()}`);
        if (ap.imei && ap.imei.trim()) lines.push(`*IMEI:* ${ap.imei.trim()}`);
      });
    } else if (troca?.descricaoLivre) {
      lines.push(`*Modelo:* ${troca.descricaoLivre}`);
    }
    if (valorBase > 0 && aparelhos.length > 0) {
      lines.push("", `*Diferença a pagar:* R$ ${fmt(valorBase)}`);
    }
  }

  // ── Entrega ──
  lines.push("", `*▸ ENTREGA*`);
  if (entrega.vendedor) lines.push(`*Vendedor:* ${entrega.vendedor}`);
  if (entrega.origem) lines.push(`*Indicação:* ${entrega.origem}`);
  if (entrega.horario) lines.push(`*Horário:* ${entrega.horario}`);
  if (entrega.data) {
    const [y, m, d] = entrega.data.split("-");
    if (y && m && d) lines.push(`*Data:* ${d}/${m}/${y}`);
  }
  lines.push(`*Local:* ${formatarLocalEntrega(entrega)}`);

  // Pagamento na entrega: só mostra se ainda não foi pago
  if (!pagamento.pagamentoPago) {
    if (entrega.local === "Correios") {
      lines.push("! PAGAMENTO ANTECIPADO");
    } else if (entrega.local === "Entrega" && entrega.tipoEntrega === "Residencia") {
      lines.push("! PAGAMENTO ANTECIPADO");
    } else if (entrega.local === "Entrega") {
      lines.push("PAGAR NA ENTREGA");
    }
  }

  return lines.join("\n");
}
