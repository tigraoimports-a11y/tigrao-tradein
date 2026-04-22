import Link from "next/link";
import { formatPedidoMessage, type PedidoData } from "@/lib/formatPedido";

// ============================================================
// /pagamento-confirmado
// ============================================================
// Tela após o cliente pagar MP (fluxo invertido: cliente preencheu /compra
// → pagou MP → volta aqui).
//
// FLUXO: Buscamos o link_compras pelo short_code, montamos a mensagem
// COMPLETA (igual ao WhatsApp manual) e renderizamos um botão que abre
// o WhatsApp do vendedor com a mensagem + comprovante MP pré-preenchidos.
//
// Auto-redirect: após 2s, abrimos o WhatsApp automaticamente.
// Botão: caso o auto-redirect falhe (popup bloqueado, cliente em app), o
// cliente clica manualmente.
// ============================================================

// Server component — executa no servidor, tem acesso ao supabase direto.
export default async function PagamentoConfirmadoPage({
  searchParams,
}: {
  searchParams: Promise<{ short?: string; payment_id?: string }>;
}) {
  const sp = await searchParams;
  const shortCode = sp.short || "";
  const mpPaymentId = sp.payment_id || "";

  let whatsappUrl = "";
  let whatsappNumero = "";
  let mensagemPreview = "";
  let vendedorNome = "";
  let produtoNome = "";
  let erro = "";

  if (shortCode) {
    try {
      const { supabase } = await import("@/lib/supabase");
      const { data: link } = await supabase
        .from("link_compras")
        .select("*")
        .eq("short_code", shortCode)
        .maybeSingle();

      if (!link) {
        erro = "Pedido não encontrado.";
      } else {
        const snapshot = (link.cliente_dados_preenchidos ?? null) as Record<string, unknown> | null;
        if (!snapshot || !snapshot.cliente) {
          erro = "Dados do pedido incompletos — preencha o formulário novamente.";
        } else {
          const whats = String(snapshot.whatsappVendedor || "").replace(/\D/g, "");
          if (!whats) {
            erro = "WhatsApp do vendedor não disponível.";
          } else {
            whatsappNumero = whats;
            const pedido = buildPedidoData(link, snapshot, mpPaymentId);
            produtoNome = pedido.produto.nome;
            vendedorNome = pedido.entrega?.vendedor || "";
            const mensagem = formatPedidoMessage(pedido, {
              header: true,
              prefix: [
                `✅ *COMPROVANTE DE PAGAMENTO — MERCADO PAGO*`,
                `_Pagamento aprovado automaticamente pelo MP._`,
              ],
            });
            mensagemPreview = mensagem;
            whatsappUrl = `https://wa.me/${whats}?text=${encodeURIComponent(mensagem)}`;
          }
        }
      }
    } catch (e) {
      console.error("[pagamento-confirmado] erro:", e);
      erro = "Erro ao buscar dados do pedido.";
    }
  } else {
    erro = "Código do pedido ausente.";
  }

  return (
    <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center max-w-md w-full">
        {/* Check animado */}
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#25D366] flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="w-12 h-12 text-white fill-current" aria-hidden>
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-[#1D1D1F] mb-2">Pagamento confirmado!</h1>

        {whatsappUrl ? (
          <>
            <p className="text-[#6E6E73] text-sm leading-relaxed mb-4">
              Abrindo o WhatsApp {vendedorNome ? `do ${vendedorNome} ` : ""}com seu pedido
              {produtoNome ? ` de ${produtoNome}` : ""} e comprovante...
            </p>

            {/* Auto-abre o WhatsApp após 1.5s (window.location pra não bloquear) */}
            <meta httpEquiv="refresh" content={`2;url=${whatsappUrl}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `setTimeout(() => window.location.href = ${JSON.stringify(whatsappUrl)}, 1500)`,
              }}
            />

            <a
              href={whatsappUrl}
              className="inline-flex items-center justify-center gap-2 w-full py-3.5 bg-[#25D366] text-white font-bold text-lg rounded-xl shadow-sm hover:bg-[#20BD5A] active:bg-[#1DA851] transition-colors mb-3"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Enviar pedido pelo WhatsApp
            </a>

            <p className="text-xs text-[#86868B] leading-relaxed">
              Se o WhatsApp não abrir automaticamente, clique no botão acima.
              Basta <strong>enviar</strong> a mensagem pra confirmar sua compra.
            </p>

            {/* Preview pequena da mensagem (colapsada) pro cliente ver o que vai enviar */}
            <details className="mt-4 text-left">
              <summary className="text-xs text-[#009EE3] cursor-pointer text-center">
                Ver mensagem completa
              </summary>
              <pre className="mt-2 p-3 bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg text-[11px] text-[#1D1D1F] whitespace-pre-wrap font-sans max-h-64 overflow-y-auto">
                {mensagemPreview}
              </pre>
            </details>
          </>
        ) : (
          <>
            <p className="text-[#6E6E73] text-sm leading-relaxed mb-4">
              Seu pagamento foi aprovado pelo Mercado Pago.
            </p>
            {erro && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm mb-4">
                <strong>⚠️ {erro}</strong>
                <br />
                <span className="text-xs">
                  Tudo bem — guarde o comprovante do MP. Nossa equipe vai te chamar no WhatsApp.
                </span>
              </div>
            )}
            <Link
              href="/"
              className="inline-block w-full py-3 bg-[#1D1D1F] text-white font-semibold rounded-xl hover:bg-[#2D2D2F] transition-colors"
            >
              Voltar ao início
            </Link>
          </>
        )}

        {shortCode && (
          <p className="text-[10px] text-[#86868B] mt-4 font-mono">
            #{shortCode}
            {mpPaymentId ? ` • MP ${mpPaymentId}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Converte snapshot JSONB + campos fixos em PedidoData
// (mesma lógica do webhook — poderia ser compartilhada, mas aqui é mais
// curta e usa as chaves que o /api/create-mp-from-form gera)
// ============================================================
function buildPedidoData(
  link: Record<string, unknown>,
  snapshot: Record<string, unknown>,
  mpPaymentId: string
): PedidoData {
  const snCliente = (snapshot.cliente ?? {}) as Record<string, string | undefined>;
  const snProduto = (snapshot.produto ?? {}) as Record<string, unknown>;
  const snPagamento = (snapshot.pagamento ?? {}) as Record<string, unknown>;
  const snTroca = (snapshot.troca ?? null) as {
    aparelhos?: Array<{
      modelo: string;
      cor?: string;
      valor?: number;
      condicao?: string;
      caixa?: boolean;
      serial?: string;
      imei?: string;
    }>;
    descricaoLivre?: string;
  } | null;
  const snEntrega = (snapshot.entrega ?? {}) as Record<string, string | undefined>;

  return {
    cliente: {
      nome: snCliente.nome || (link.cliente_nome as string) || "Cliente",
      pessoa: snCliente.pessoa === "PJ" ? "PJ" : "PF",
      cpf: snCliente.cpf || (link.cliente_cpf as string | undefined),
      cnpj: snCliente.cnpj || undefined,
      email: snCliente.email || (link.cliente_email as string | undefined),
      telefone: snCliente.telefone || (link.cliente_telefone as string | undefined),
      instagram: snCliente.instagram,
      cep: snCliente.cep,
      endereco: snCliente.endereco,
      numero: snCliente.numero,
      complemento: snCliente.complemento,
      bairro: snCliente.bairro,
    },
    produto: {
      nome: (snProduto.nome as string) || (link.produto as string) || "Produto",
      cor: (snProduto.cor as string | undefined) || (link.cor as string | undefined),
      preco: Number(snProduto.preco ?? link.valor ?? 0),
      extras: (snProduto.extras as Array<{ nome: string; preco: number }> | undefined) || [],
    },
    pagamento: {
      forma: (snPagamento.forma as string) || (link.forma_pagamento as string) || "Link de Pagamento",
      parcelas: (snPagamento.parcelas as string | undefined) || (link.parcelas as string | undefined),
      entrada: Number(snPagamento.entrada ?? link.entrada ?? 0),
      desconto: Number(snPagamento.desconto ?? link.desconto ?? 0),
      // pagamentoPago="mp" → formatPedidoMessage mostra "Pago via Mercado Pago (Link)"
      pagamentoPago: "mp",
      mpPaymentId: mpPaymentId || (link.mp_payment_id as string | undefined),
      mpPreferenceId: link.mp_preference_id as string | undefined,
    },
    troca: snTroca || undefined,
    entrega: {
      local: (snEntrega.local as string) || "Entrega",
      tipoEntrega: snEntrega.tipoEntrega as "Residencia" | "Comercial" | undefined,
      shopping: snEntrega.shopping,
      data: snEntrega.data,
      horario: snEntrega.horario,
      vendedor: snEntrega.vendedor || (link.vendedor as string | undefined),
      origem: snEntrega.origem,
    },
    isFromTradeIn: !!snapshot.isFromTradeIn,
  };
}
