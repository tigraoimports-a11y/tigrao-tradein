import { NextResponse } from "next/server";
import { createMpPreference } from "@/lib/mpPreference";

// ============================================================
// POST /api/create-mp-from-form
// ============================================================
// Endpoint PÚBLICO (sem auth admin) — chamado pelo /compra quando o cliente
// clica em "Pagar com Mercado Pago" após preencher o formulário.
//
// Fluxo:
//   1. Cliente preenche /compra (link gerado em /admin/gerar-link).
//   2. Clica em "Pagar com Mercado Pago".
//   3. Front envia TODOS os dados do formulário pra este endpoint.
//   4. Endpoint:
//      a. Valida que o short_code existe no link_compras.
//      b. UPDATE no link_compras com todos os dados preenchidos
//         (nome/cpf/endereço/produto/pagamento/troca/entrega).
//         Snapshot completo vai em cliente_dados_preenchidos (JSONB).
//      c. Cria MP preference com external_reference = short_code +
//         dados do payer pré-preenchidos (nome, email, CPF).
//      d. Retorna { init_point } pro front redirecionar cliente pro MP.
//   5. Cliente paga no MP.
//   6. Webhook MP (/api/mp-webhook) busca link_compras pelo short_code,
//      monta mensagem COMPLETA com todos os dados e envia pro grupo.
//   7. MP redireciona cliente pra /pagamento-confirmado.
//
// Autenticação: sem auth admin (é público). Protege validando que o
// short_code existe e foi gerado previamente em /admin/gerar-link.
// ============================================================

interface CreateMpFromFormBody {
  shortCode: string;
  // Cliente
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
  // Produto
  produto: string;
  cor?: string;
  preco: number;
  produtosExtras?: Array<{ nome: string; preco: number }>;
  desconto?: number;
  // Pagamento
  formaPagamento?: string;
  parcelas?: string;
  entradaPix?: number;
  // Troca (opcional)
  troca?: {
    aparelhos?: Array<{
      modelo: string;
      cor?: string;
      valor?: number;
      condicao?: string;
      caixa?: boolean;
    }>;
    descricaoLivre?: string;
  };
  // Entrega
  entrega?: {
    local?: string;
    tipoEntrega?: string;
    shopping?: string;
    data?: string;
    horario?: string;
    vendedor?: string;
    origem?: string;
  };
  isFromTradeIn?: boolean;
  // Valor cobrado no MP (já calculado no front com taxas).
  // IMPORTANTE: o cliente manda o valor que vai ser cobrado no MP.
  // Se há entrada PIX, o MP cobra só o restante (valorParcelar). Se não,
  // cobra o valor total do pedido.
  valorMp: number;
  // Número do WhatsApp do vendedor (ex: "5521999998888") — usado pela
  // /pagamento-confirmado pra redirecionar o cliente pro chat do vendedor
  // com a mensagem do pedido + comprovante MP já pré-preenchida.
  whatsappVendedor?: string;
}

export async function POST(request: Request) {
  let body: CreateMpFromFormBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { shortCode } = body;
  if (!shortCode) {
    return NextResponse.json(
      { error: "shortCode obrigatório" },
      { status: 400 }
    );
  }
  if (!body.nome || !body.produto) {
    return NextResponse.json(
      { error: "nome e produto obrigatórios" },
      { status: 400 }
    );
  }
  const valorMp = Number(body.valorMp);
  if (!Number.isFinite(valorMp) || valorMp <= 0) {
    return NextResponse.json(
      { error: "valorMp inválido — deve ser maior que zero" },
      { status: 400 }
    );
  }

  const { supabase } = await import("@/lib/supabase");

  // 1. Valida short_code
  const { data: link, error: errFetch } = await supabase
    .from("link_compras")
    .select("id, short_code, status")
    .eq("short_code", shortCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errFetch || !link) {
    return NextResponse.json(
      { error: "Link não encontrado. Peça um link novo ao vendedor." },
      { status: 404 }
    );
  }

  // 2. Monta snapshot completo pra cliente_dados_preenchidos (JSONB)
  const snapshot = {
    cliente: {
      nome: body.nome,
      pessoa: body.pessoa || "PF",
      cpf: body.cpf || null,
      cnpj: body.cnpj || null,
      email: body.email || null,
      telefone: body.telefone || null,
      instagram: body.instagram || null,
      cep: body.cep || null,
      endereco: body.endereco || null,
      numero: body.numero || null,
      complemento: body.complemento || null,
      bairro: body.bairro || null,
    },
    produto: {
      nome: body.produto,
      cor: body.cor || null,
      preco: Number(body.preco) || 0,
      extras: body.produtosExtras || [],
    },
    pagamento: {
      forma: body.formaPagamento || "Link de Pagamento",
      parcelas: body.parcelas || null,
      entrada: Number(body.entradaPix) || 0,
      desconto: Number(body.desconto) || 0,
    },
    troca: body.troca || null,
    entrega: body.entrega || null,
    isFromTradeIn: !!body.isFromTradeIn,
    valorMp,
    // WhatsApp do vendedor (pra redirect do cliente após pagamento aprovado)
    whatsappVendedor: body.whatsappVendedor || null,
    preenchidoEm: new Date().toISOString(),
  };

  // 3. UPDATE link_compras com campos fixos + snapshot
  const patch: Record<string, unknown> = {
    cliente_nome: body.nome,
    cliente_cpf: body.pessoa === "PJ" ? body.cnpj || null : body.cpf || null,
    cliente_email: body.email || null,
    cliente_telefone: body.telefone || null,
    produto: body.produto,
    cor: body.cor || null,
    valor: Number(body.preco) || 0,
    desconto: Number(body.desconto) || 0,
    forma_pagamento: body.formaPagamento || "Link de Pagamento",
    parcelas: body.parcelas || null,
    entrada: Number(body.entradaPix) || 0,
    produtos_extras:
      body.produtosExtras && body.produtosExtras.length > 0
        ? JSON.stringify(body.produtosExtras)
        : null,
    // Troca — campos fixos (pra queries históricas); detalhes completos vão no JSONB
    troca_produto: body.troca?.aparelhos?.[0]?.modelo || null,
    troca_valor: Number(body.troca?.aparelhos?.[0]?.valor) || 0,
    troca_produto2: body.troca?.aparelhos?.[1]?.modelo || null,
    troca_valor2: Number(body.troca?.aparelhos?.[1]?.valor) || 0,
    // Snapshot completo
    cliente_dados_preenchidos: snapshot,
    cliente_preencheu_em: new Date().toISOString(),
    status: "PREENCHIDO",
    updated_at: new Date().toISOString(),
  };

  const { error: errUpdate } = await supabase
    .from("link_compras")
    .update(patch)
    .eq("id", link.id);

  if (errUpdate) {
    console.error("[create-mp-from-form] erro update:", errUpdate);
    return NextResponse.json(
      { error: "Erro ao salvar dados. Tente novamente.", details: errUpdate.message },
      { status: 500 }
    );
  }

  // 4. Cria preference MP com payer pré-preenchido
  // Extrai área/número do telefone brasileiro (ex: "(21) 99999-9999")
  let areaCode: string | undefined;
  let phoneNumber: string | undefined;
  if (body.telefone) {
    const digits = body.telefone.replace(/\D/g, "");
    // Formato esperado: 5521999999999 ou 21999999999 ou 999999999
    if (digits.length >= 10) {
      const local = digits.slice(-9); // últimos 9 = celular com 9 na frente
      const area = digits.slice(-11, -9); // 2 dígitos antes = DDD
      areaCode = area;
      phoneNumber = local;
    }
  }

  const [primeiroNome, ...restoNome] = (body.nome || "").trim().split(/\s+/);
  const sobrenome = restoNome.join(" ");

  const cpfLimpo = (body.cpf || "").replace(/\D/g, "");
  const cnpjLimpo = (body.cnpj || "").replace(/\D/g, "");

  const mpResult = await createMpPreference({
    titulo: body.produto,
    valor: valorMp,
    shortCode,
    externalRef: shortCode, // garante que webhook consegue achar o link
    payer: {
      name: primeiroNome,
      surname: sobrenome || undefined,
      email: body.email || undefined,
      phone: areaCode && phoneNumber ? { area_code: areaCode, number: phoneNumber } : undefined,
      identification:
        body.pessoa === "PJ" && cnpjLimpo
          ? { type: "CNPJ", number: cnpjLimpo }
          : cpfLimpo
          ? { type: "CPF", number: cpfLimpo }
          : undefined,
      address: body.cep
        ? {
            zip_code: body.cep.replace(/\D/g, ""),
            street_name: body.endereco || undefined,
            street_number: body.numero || undefined,
          }
        : undefined,
    },
  });

  if (!mpResult.ok) {
    return NextResponse.json(
      { error: mpResult.error, details: mpResult.details },
      { status: mpResult.status }
    );
  }

  // 5. Salva preference_id no link pra rastreabilidade via webhook
  await supabase
    .from("link_compras")
    .update({
      mp_preference_id: mpResult.data.preference_id,
      mp_link: mpResult.data.init_point,
      updated_at: new Date().toISOString(),
    })
    .eq("id", link.id);

  return NextResponse.json({
    ok: true,
    init_point: mpResult.data.init_point,
    preference_id: mpResult.data.preference_id,
    shortCode,
  });
}
