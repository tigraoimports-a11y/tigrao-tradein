// Helper compartilhado: monta a URL do WhatsApp com mensagem pronta
// pra follow-up de clientes que passaram pelo trade-in/compra.
//
// Usado por:
//   - /admin/simulacoes (modal detalhes do cliente na aba Histórico de Formulários)
//   - /admin/gerar-link (botão WhatsApp em cada link não preenchido)
//
// A mensagem se adapta ao estado do pedido:
//   - Entrega criada: "tudo certo com sua entrega?"
//   - Pago sem entrega: "recebemos pagamento, preparando entrega"
//   - Preencheu form, não pagou: "preencheu mas não finalizou"
//   - Só gerou link ou simulou (não preencheu): "gostou da proposta, não finalizou"
//
// Em todos os casos terminamos com a pergunta aberta
// "Precisa de alguma ajuda para finalizar seu pedido?"
// pra incentivar o cliente a responder.

export interface WaFollowUpInput {
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  // Produto novo
  produto?: string | null;
  cor?: string | null;
  valor?: number | null;
  desconto?: number | null;
  // Parcelamento (opcional — se não vier, usa 12x padrão)
  parcelas?: number | string | null;
  // Troca (opcional)
  trocaNome?: string | null;
  trocaCor?: string | null;
  trocaValor?: number | null;
  trocaNome2?: string | null;
  trocaCor2?: string | null;
  trocaValor2?: number | null;
  // Estado
  preencheuEm?: string | null;
  pagamentoPago?: string | null;
  entregaId?: string | null;
}

const money = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

// Taxa de parcelamento no cartão — mesmas da loja (vide encaminhar-entrega).
const TAXAS: Record<number, number> = {
  1: 4, 2: 5, 3: 5.5, 4: 6, 5: 7, 6: 7.5,
  7: 8, 8: 9.1, 9: 10, 10: 11, 11: 12, 12: 13,
  13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19,
  19: 20, 20: 21, 21: 22,
};

/**
 * Monta um resumo completo do pedido: produto, troca e valores à vista + parcelado.
 * Se não souber quantas parcelas, assume 12x (padrão mais comum).
 */
function buildResumo(input: WaFollowUpInput): string[] {
  const linhas: string[] = [];
  const valorProduto = Number(input.valor || 0);
  const desconto = Number(input.desconto || 0);
  const trocaVal = Number(input.trocaValor || 0);
  const trocaVal2 = Number(input.trocaValor2 || 0);
  const totalTroca = trocaVal + trocaVal2;

  // Helper: concatena produto+cor sem duplicar quando o próprio nome do
  // produto já contém a cor (ex.: "iPhone 17 256GB Titânio Branco" + cor
  // "Titânio Branco" viraria "iPhone 17 256GB Titânio Branco Titânio Branco").
  const juntarCor = (nome: string, cor?: string | null) => {
    const c = (cor || "").trim();
    if (!c) return nome;
    if (nome.toLowerCase().includes(c.toLowerCase())) return nome;
    return `${nome} — ${c}`;
  };

  // Produto desejado
  if (input.produto) {
    linhas.push(`📱 Produto na compra: ${juntarCor(input.produto, input.cor)}`);
    if (valorProduto > 0) linhas.push(`💰 Valor: ${money(valorProduto)}`);
    linhas.push("");
  }

  // Aparelho(s) na troca
  if (input.trocaNome) {
    linhas.push(`🔄 Aparelho na troca: ${juntarCor(input.trocaNome, input.trocaCor)}`);
    if (trocaVal > 0) linhas.push(`   Valor abatido: ${money(trocaVal)}`);
    if (input.trocaNome2) {
      linhas.push(
        "",
        `🔄 Aparelho 2 na troca: ${juntarCor(input.trocaNome2, input.trocaCor2)}`
      );
      if (trocaVal2 > 0) linhas.push(`   Valor abatido: ${money(trocaVal2)}`);
    }
    linhas.push("");
  }

  // Valor final + formas de pagamento (à vista no Pix e parcelado no cartão).
  // Quando há troca/desconto, mostra "Valor final a pagar" pra deixar claro
  // que o valor inicial foi reduzido. Sem troca/desconto, pula essa linha
  // (redundante com "Valor:" logo acima).
  const valorFinal = Math.max(valorProduto - desconto - totalTroca, 0);
  if (valorFinal > 0) {
    if (totalTroca > 0 || desconto > 0) {
      linhas.push(`✅ Valor final a pagar: ${money(valorFinal)}`);
    }
    linhas.push(`💵 À vista no Pix: ${money(valorFinal)}`);
    const parcelasNum = Number(input.parcelas) || 12;
    const parcelas = parcelasNum > 0 && parcelasNum <= 21 ? parcelasNum : 12;
    const taxa = TAXAS[parcelas] ?? 13;
    const totalComTaxa = Math.ceil(valorFinal * (1 + taxa / 100));
    const porParcela = Math.ceil(totalComTaxa / parcelas);
    linhas.push(`💳 Ou parcelado em ${parcelas}x de ${money(porParcela)} no cartão`);
    linhas.push("");
  }

  return linhas;
}

/**
 * Monta o corpo da mensagem de follow-up (sem URL wrapper).
 * Retorna string com quebras de linha \n (não encodada).
 */
export function buildWaFollowUpMessage(input: WaFollowUpInput): string {
  const firstName = (input.clienteNome || "").split(" ")[0] || "";
  const linhas: string[] = [`Olá ${firstName}!`, ""];

  if (input.entregaId) {
    linhas.push(
      "Tudo certo com a sua entrega? Qualquer dúvida é só me chamar por aqui."
    );
    return linhas.join("\n");
  }

  if (input.pagamentoPago) {
    linhas.push(
      "Recebemos seu pagamento! Já estamos preparando tudo para a entrega.",
      ""
    );
    const resumo = buildResumo(input);
    if (resumo.length) linhas.push(...resumo);
    linhas.push("Qualquer dúvida, estou à disposição!");
    return linhas.join("\n");
  }

  if (input.preencheuEm) {
    linhas.push(
      "Vi que você já preencheu o formulário mas ainda não finalizou o pagamento.",
      "",
      "Segue um resumo do seu pedido:",
      ""
    );
  } else {
    linhas.push(
      "Vi que você gostou da nossa proposta de troca, porém não finalizou seu pedido.",
      "",
      "Segue um resumo da sua avaliação:",
      ""
    );
  }

  const resumo = buildResumo(input);
  if (resumo.length) linhas.push(...resumo);
  linhas.push("Precisa de alguma ajuda para finalizar seu pedido?");

  return linhas.join("\n");
}

/**
 * Retorna a URL `https://wa.me/55...?text=...` pronta pra usar em `<a href>`.
 * Se o telefone estiver vazio/inválido, retorna string vazia.
 */
export function buildWaFollowUpUrl(input: WaFollowUpInput): string {
  const tel = (input.clienteTelefone || "").replace(/\D/g, "");
  if (!tel) return "";
  const msg = buildWaFollowUpMessage(input);
  return `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
}
