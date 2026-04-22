import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { rateLimitSubmission, checkHoneypot } from "@/lib/rate-limit";
import { dispararContratoAuto } from "@/lib/contrato-auto";

// ============================================================
// POST /api/vendas/from-formulario
// ============================================================
// Endpoint PÚBLICO chamado pelo /compra no momento do submit (tanto
// "Enviar no WhatsApp" quanto "Pagar com Mercado Pago").
//
// Cria uma venda rascunho em `vendas` com status_pagamento = FORMULARIO_PREENCHIDO
// contendo TODOS os dados do formulário: cliente, produto, cor, troca (incluindo
// IMEI/serial extraídos via OCR), forma de pagamento, etc. estoque_id fica NULL
// até a equipe vincular o aparelho físico na aba "Formulários Preenchidos".
//
// Deduplicação: se já existe uma venda com esse short_code, ATUALIZA em vez de
// criar duplicada (cliente pode submeter o formulário mais de uma vez, ex: corrige
// endereço e reenvia).
// ============================================================

export const runtime = "nodejs";

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

interface BodyIn {
  shortCode: string;
  // Cliente
  nome?: string;
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
  desconto?: number;
  // Pagamento
  formaPagamento?: string;
  parcelas?: string | number;
  entradaPix?: number;
  // Troca
  trocaProduto?: string;
  trocaCor?: string;
  trocaValor?: number;
  trocaCondicao?: string;
  trocaCaixa?: boolean;
  trocaSerial?: string;
  trocaImei?: string;
  trocaProduto2?: string;
  trocaCor2?: string;
  trocaValor2?: number;
  trocaCondicao2?: string;
  trocaCaixa2?: boolean;
  trocaSerial2?: string;
  trocaImei2?: string;
  // Entrega
  localEntrega?: string;
  dataEntrega?: string;
  horarioEntrega?: string;
  vendedor?: string;
  origem?: string;
  // Honeypot
  website?: string;
}

// Forma de pagamento do formulário → campos canônicos de vendas
function mapForma(formaPagamento?: string): { forma: string; banco: string; recebimento: string } {
  const f = (formaPagamento || "").toUpperCase();
  if (f.includes("PIX") && f.includes("CART")) return { forma: "PIX", banco: "ITAU", recebimento: "D+1" };
  if (f.includes("PIX")) return { forma: "PIX", banco: "ITAU", recebimento: "D+0" };
  if (f.includes("DEBITO") || f.includes("DÉBITO")) return { forma: "CARTAO", banco: "INFINITE", recebimento: "D+1" };
  if (f.includes("CART")) return { forma: "CARTAO", banco: "INFINITE", recebimento: "PARCELADO" };
  if (f.includes("DINHEIRO") || f.includes("ESPECIE")) return { forma: "DINHEIRO", banco: "ESPECIE", recebimento: "D+0" };
  if (f.includes("MERCADO") || f.includes("MP") || f.includes("LINK")) return { forma: "PIX", banco: "MERCADO_PAGO", recebimento: "D+1" };
  return { forma: "PIX", banco: "ITAU", recebimento: "D+0" };
}

export async function POST(req: NextRequest) {
  const limited = rateLimitSubmission(req, "venda-formulario");
  if (limited) return limited;

  let body: BodyIn;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const honeypot = checkHoneypot(body as unknown as Record<string, unknown>);
  if (honeypot) return honeypot;

  if (!body.shortCode) {
    return NextResponse.json({ error: "shortCode obrigatório" }, { status: 400 });
  }
  if (!body.produto) {
    return NextResponse.json({ error: "produto obrigatório" }, { status: 400 });
  }
  if (!body.nome) {
    return NextResponse.json({ error: "nome obrigatório" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Hoje local no fuso de SP (padrão do resto do sistema)
  const hojeStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  const precoNum = Number(body.preco) || 0;
  const trocaValorNum = Number(body.trocaValor) || 0;
  const trocaValor2Num = Number(body.trocaValor2) || 0;
  const descontoNum = Number(body.desconto) || 0;
  const entradaPixNum = Number(body.entradaPix) || 0;
  const valorLiquido = Math.max(precoNum - trocaValorNum - trocaValor2Num - descontoNum, 0);

  const parcelasNum = body.parcelas ? Number(body.parcelas) || 1 : 1;
  const { forma, banco, recebimento } = mapForma(body.formaPagamento);

  // Telefone normalizado
  const telefoneDigits = (body.telefone || "").replace(/\D/g, "");

  // CPF/CNPJ — usa o que vier
  const cpfDigits = (body.cpf || "").replace(/\D/g, "");
  const cnpjDigits = (body.cnpj || "").replace(/\D/g, "");

  // Endereço completo pra coluna de display
  const enderecoFull = [body.endereco, body.numero, body.complemento, body.bairro]
    .filter(Boolean).join(", ");

  // Se tem troca → tipo UPGRADE; senão → VENDA
  const tipo = body.trocaProduto ? "UPGRADE" : "VENDA";

  // Payload canônico pra inserir/atualizar em vendas
  const payload: Record<string, unknown> = {
    short_code: body.shortCode,
    status_pagamento: "FORMULARIO_PREENCHIDO",
    tipo,
    data: hojeStr,
    // Cliente
    cliente: body.nome,
    cpf: body.pessoa === "PJ" ? null : (cpfDigits || null),
    cnpj: body.pessoa === "PJ" ? (cnpjDigits || null) : null,
    telefone: telefoneDigits || null,
    email: body.email || null,
    endereco: enderecoFull || null,
    cep: body.cep || null,
    // Produto — cor vai concatenada no nome (ex: "iPhone 17 Pro Max 1TB ROSA"),
    // tabela vendas não tem coluna `cor` separada (ao contrário de link_compras).
    produto: body.cor ? `${body.produto} ${String(body.cor).toUpperCase()}`.trim() : body.produto,
    preco_vendido: valorLiquido,
    // Pagamento
    forma,
    banco,
    recebimento,
    qnt_parcelas: forma === "CARTAO" ? parcelasNum : 1,
    sinal_antecipado: entradaPixNum > 0 ? entradaPixNum : null,
    // Troca (aparelho 1)
    produto_na_troca: body.trocaProduto ? "SIM" : "NAO",
    troca_produto: body.trocaProduto || null,
    troca_cor: body.trocaCor || null,
    troca_valor: trocaValorNum || null,
    troca_caixa: body.trocaCaixa === true ? "SIM" : (body.trocaCaixa === false ? "NAO" : null),
    troca_serial: body.trocaSerial || null,
    troca_imei: body.trocaImei || null,
    // Troca (aparelho 2)
    troca_produto2: body.trocaProduto2 || null,
    troca_cor2: body.trocaCor2 || null,
    troca_valor2: trocaValor2Num || null,
    troca_caixa2: body.trocaCaixa2 === true ? "SIM" : (body.trocaCaixa2 === false ? "NAO" : null),
    troca_serial2: body.trocaSerial2 || null,
    troca_imei2: body.trocaImei2 || null,
    // Origem canônica: "FORMULARIO" (constraint da tabela vendas).
    // O origem bruto que o cliente respondeu (Anúncio/Story/Indicação/etc) fica
    // guardado em `origem_detalhe` pro admin ver na aba Formulários Preenchidos.
    origem: "FORMULARIO",
    origem_detalhe: body.origem || null,
    vendedor: body.vendedor || null,
    // estoque_id: NULL por design — equipe vincula depois na aba Formulários Preenchidos
    estoque_id: null,
  };

  // Deduplicação: já existe venda com esse short_code?
  const { data: existente } = await supabase
    .from("vendas")
    .select("id, status_pagamento")
    .eq("short_code", body.shortCode)
    .maybeSingle();

  if (existente) {
    // Só atualiza se ainda está em rascunho. Se equipe já moveu pra
    // AGUARDANDO/FINALIZADO, não sobrescreve o trabalho deles.
    if (existente.status_pagamento !== "FORMULARIO_PREENCHIDO") {
      return NextResponse.json({
        ok: true,
        vendaId: existente.id,
        skipped: true,
        reason: `Venda já está em status ${existente.status_pagamento} — não atualizado.`,
      });
    }
    const { error: updErr } = await supabase
      .from("vendas")
      .update(payload)
      .eq("id", existente.id);
    if (updErr) {
      console.error("[vendas/from-formulario] update err:", updErr);
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }
    const contrato = await gerarContratoSeTiverTroca(supabase, body.shortCode, body.trocaProduto);
    return NextResponse.json({ ok: true, vendaId: existente.id, action: "updated", contrato });
  }

  const { data: nova, error: insErr } = await supabase
    .from("vendas")
    .insert(payload)
    .select("id")
    .single();

  if (insErr || !nova) {
    console.error("[vendas/from-formulario] insert err:", insErr);
    return NextResponse.json({ error: insErr?.message || "Erro ao criar venda" }, { status: 500 });
  }

  const contrato = await gerarContratoSeTiverTroca(supabase, body.shortCode, body.trocaProduto);
  return NextResponse.json({ ok: true, vendaId: nova.id, action: "created", contrato });
}

// Helper: dispara termo de procedência só se a venda tem troca. Erros são
// logados mas não falham o from-formulario (venda já foi criada com sucesso).
async function gerarContratoSeTiverTroca(
  supabase: ReturnType<typeof getSupabase>,
  shortCode: string,
  trocaProduto?: string,
): Promise<{ ok: boolean; skipped?: boolean; termoId?: string; error?: string } | null> {
  if (!trocaProduto) return null;
  try {
    const result = await dispararContratoAuto(supabase, shortCode);
    if (!result.ok) {
      console.error("[vendas/from-formulario] contrato FAIL:", result.error);
    }
    return { ok: result.ok, skipped: result.skipped, termoId: result.termoId, error: result.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[vendas/from-formulario] contrato THROWN:", msg);
    return { ok: false, error: msg };
  }
}
