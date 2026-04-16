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
//   - Preencheu form, não pagou: "preencheu mas não finalizou, deseja fechar hoje?"
//   - Só gerou link ou simulou (não preencheu): "gostou da proposta, deseja fechar hoje?"

export interface WaFollowUpInput {
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  // Produto novo
  produto?: string | null;
  cor?: string | null;
  valor?: number | null;
  desconto?: number | null;
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

/**
 * Monta o corpo da mensagem de follow-up (sem URL wrapper).
 * Retorna string com quebras de linha \n (não encodada).
 */
export function buildWaFollowUpMessage(input: WaFollowUpInput): string {
  const firstName = (input.clienteNome || "").split(" ")[0] || "";
  const valorFinal = Number(input.valor || 0) - Number(input.desconto || 0);
  const trocaVal = Number(input.trocaValor || 0);
  const trocaVal2 = Number(input.trocaValor2 || 0);
  const totalTroca = trocaVal + trocaVal2;

  const linhas: string[] = [`Olá ${firstName}!`, ""];

  const resumoNovo: string[] = [];
  if (input.produto) {
    resumoNovo.push(
      `📱 Produto novo: ${input.produto}${input.cor ? ` — ${input.cor}` : ""}`
    );
    if (valorFinal > 0) resumoNovo.push(`💰 Valor: ${money(valorFinal)}`);
  }

  const resumoTroca: string[] = [];
  if (input.trocaNome) {
    resumoTroca.push(
      `🔄 Aparelho na troca: ${input.trocaNome}${input.trocaCor ? ` ${input.trocaCor}` : ""}${trocaVal > 0 ? ` — ${money(trocaVal)}` : ""}`
    );
    if (input.trocaNome2) {
      resumoTroca.push(
        `🔄 Aparelho 2 na troca: ${input.trocaNome2}${input.trocaCor2 ? ` ${input.trocaCor2}` : ""}${trocaVal2 > 0 ? ` — ${money(trocaVal2)}` : ""}`
      );
      if (totalTroca > 0) resumoTroca.push(`   Total da troca: ${money(totalTroca)}`);
    }
  }

  if (input.entregaId) {
    linhas.push("Tudo certo com a sua entrega? Qualquer dúvida é só me chamar por aqui.");
  } else if (input.pagamentoPago) {
    linhas.push("Recebemos seu pagamento! Já estamos preparando tudo para a entrega.", "");
    if (resumoNovo.length) linhas.push(...resumoNovo, "");
    if (resumoTroca.length) linhas.push(...resumoTroca, "");
    linhas.push("Qualquer dúvida, estou à disposição!");
  } else if (input.preencheuEm) {
    linhas.push(
      "Tudo certo com o seu pedido? Vi que você já preencheu o formulário mas ainda não finalizou o pagamento.",
      ""
    );
    if (resumoNovo.length) linhas.push(...resumoNovo, "");
    if (resumoTroca.length) linhas.push(...resumoTroca, "");
    linhas.push("Deseja fechar seu pedido ainda hoje?");
  } else {
    linhas.push(
      "Vi que você gostou da nossa proposta de troca, porém não finalizou seu pedido.",
      ""
    );
    linhas.push("Segue um resumo da sua avaliação:", "");
    if (resumoNovo.length) linhas.push(...resumoNovo, "");
    if (resumoTroca.length) linhas.push(...resumoTroca, "");
    linhas.push("Deseja fechar seu pedido ainda hoje?");
  }

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
