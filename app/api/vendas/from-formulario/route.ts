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
  // Produto principal
  produto: string;
  cor?: string;
  preco: number;
  desconto?: number;
  // Multi-produto: quando link foi gerado com produto2/3... no /admin/gerar-link,
  // cada extra vira uma venda separada com o mesmo grupo_id.
  produtosExtras?: Array<{ nome: string; preco: number }>;
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
  // UTM tracking — passado pelo client via withUTMs() de lib/utm-tracker
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
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

  // A condição do trade-in vem como texto livre (ex: "Bateria 90% | Com caixa
  // original | Sem marcas de uso"). O admin usa coluna `troca_bateria` separada
  // pra exibir no form Editar, então extraímos o número daqui. Resto do texto
  // vai pra `troca_obs` pro admin ver.
  const extrairBateria = (cond?: string): string | null => {
    if (!cond) return null;
    const m = cond.match(/bateria\s+(\d+)\s*%/i);
    return m ? m[1] : null;
  };
  const trocaBateria = extrairBateria(body.trocaCondicao);
  const trocaBateria2 = extrairBateria(body.trocaCondicao2);

  const extras = Array.isArray(body.produtosExtras) ? body.produtosExtras.filter(p => p?.nome) : [];
  const temExtras = extras.length > 0;

  // Dados compartilhados por todas as vendas do grupo (cliente/pagamento/entrega)
  const dadosComuns: Record<string, unknown> = {
    short_code: body.shortCode,
    status_pagamento: "FORMULARIO_PREENCHIDO",
    tipo,
    data: hojeStr,
    cliente: body.nome,
    cpf: body.pessoa === "PJ" ? null : (cpfDigits || null),
    cnpj: body.pessoa === "PJ" ? (cnpjDigits || null) : null,
    telefone: telefoneDigits || null,
    email: body.email || null,
    endereco: enderecoFull || null,
    cep: body.cep || null,
    forma,
    banco,
    recebimento,
    qnt_parcelas: forma === "CARTAO" ? parcelasNum : 1,
    origem: "FORMULARIO",
    origem_detalhe: body.origem || null,
    vendedor: body.vendedor || null,
    estoque_id: null,
    utm_source: body.utm_source ? String(body.utm_source).slice(0, 200) : null,
    utm_medium: body.utm_medium ? String(body.utm_medium).slice(0, 200) : null,
    utm_campaign: body.utm_campaign ? String(body.utm_campaign).slice(0, 200) : null,
    utm_content: body.utm_content ? String(body.utm_content).slice(0, 200) : null,
    utm_term: body.utm_term ? String(body.utm_term).slice(0, 200) : null,
  };

  // Produto principal: recebe o desconto, troca e sinal_antecipado.
  // Extras: só produto/preço. Admin soma tudo ao exibir o grupo.
  const payloadPrincipal: Record<string, unknown> = {
    ...dadosComuns,
    produto: body.cor ? `${body.produto} ${String(body.cor).toUpperCase()}`.trim() : body.produto,
    preco_vendido: valorLiquido,
    sinal_antecipado: entradaPixNum > 0 ? entradaPixNum : null,
    // Troca (aparelho 1) — admin lê produto_na_troca como VALOR MONETÁRIO em
    // string (não "SIM"/"NAO"). Mantemos troca_valor também pra contratos/reports.
    produto_na_troca: body.trocaProduto ? String(trocaValorNum || 0) : null,
    troca_produto: body.trocaProduto || null,
    troca_cor: body.trocaCor || null,
    troca_valor: trocaValorNum || null,
    troca_bateria: trocaBateria,
    troca_obs: body.trocaCondicao || null,
    troca_caixa: body.trocaCaixa === true ? "SIM" : (body.trocaCaixa === false ? "NAO" : null),
    troca_serial: body.trocaSerial || null,
    troca_imei: body.trocaImei || null,
    // Troca (aparelho 2)
    produto_na_troca2: body.trocaProduto2 ? String(trocaValor2Num || 0) : null,
    troca_produto2: body.trocaProduto2 || null,
    troca_cor2: body.trocaCor2 || null,
    troca_valor2: trocaValor2Num || null,
    troca_bateria2: trocaBateria2,
    troca_obs2: body.trocaCondicao2 || null,
    troca_caixa2: body.trocaCaixa2 === true ? "SIM" : (body.trocaCaixa2 === false ? "NAO" : null),
    troca_serial2: body.trocaSerial2 || null,
    troca_imei2: body.trocaImei2 || null,
  };

  // Gera grupo_id só quando há extras — caso único segue sem grupo pra não
  // mexer em vendas antigas que não usam grupo_id.
  const grupoId = temExtras ? (globalThis.crypto?.randomUUID?.() ?? `grp_${Date.now()}_${Math.random().toString(36).slice(2,10)}`) : null;
  if (grupoId) payloadPrincipal.grupo_id = grupoId;

  const payloadsExtras = extras.map(p => ({
    ...dadosComuns,
    produto: p.nome,
    preco_vendido: Number(p.preco) || 0,
    grupo_id: grupoId,
    produto_na_troca: null,
  }));

  // Idempotência: se já existem vendas FORMULARIO_PREENCHIDO desse short_code,
  // apaga e reinsere. Se existir venda em outro status, mantém e pula (equipe
  // já moveu pra AGUARDANDO/FINALIZADO).
  const { data: existentes } = await supabase
    .from("vendas")
    .select("id, status_pagamento")
    .eq("short_code", body.shortCode);

  const jaProcessado = existentes?.find(v => v.status_pagamento !== "FORMULARIO_PREENCHIDO");
  if (jaProcessado) {
    return NextResponse.json({
      ok: true,
      vendaId: jaProcessado.id,
      skipped: true,
      reason: `Venda já está em status ${jaProcessado.status_pagamento} — não atualizado.`,
    });
  }
  const idsAntigos = (existentes || []).map(v => v.id);
  if (idsAntigos.length > 0) {
    const { error: delErr } = await supabase.from("vendas").delete().in("id", idsAntigos);
    if (delErr) {
      console.error("[vendas/from-formulario] delete err:", delErr);
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  const todosPayloads = [payloadPrincipal, ...payloadsExtras];
  const { data: inseridas, error: insErr } = await supabase
    .from("vendas")
    .insert(todosPayloads)
    .select("id");
  if (insErr || !inseridas || inseridas.length === 0) {
    console.error("[vendas/from-formulario] insert err:", insErr);
    return NextResponse.json({ error: insErr?.message || "Erro ao criar venda" }, { status: 500 });
  }

  const contrato = await gerarContratoSeTiverTroca(supabase, body.shortCode, body.trocaProduto);
  return NextResponse.json({
    ok: true,
    vendaId: inseridas[0].id,
    vendaIds: inseridas.map(v => v.id),
    grupoId,
    action: idsAntigos.length > 0 ? "replaced" : "created",
    contrato,
  });
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
