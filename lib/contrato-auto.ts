import type { SupabaseClient } from "@supabase/supabase-js";
import { gerarTermoProcedenciaPDF, type AparelhoTermo } from "@/lib/pdf-termo-procedencia";
import { criarDocumentoEAssinar } from "@/lib/zapsign";

// ============================================================
// Geração automática do Termo de Procedência
// ============================================================
// Função compartilhada entre:
//   - /api/vendas/gerar-contrato-auto (rota HTTP pública / retry admin)
//   - /api/vendas/from-formulario (chamada inline ao criar a venda)
//
// Dedupe interna: se já existe termo pra essa venda (qualquer status), pula.
// Em caso de falha na geração do PDF ou no ZapSign, o termo fica com
// status='ERRO' e a mensagem em `observacao` pra admin ver em /admin.
// ============================================================

export interface ContratoAutoResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  termoId?: string;
  signUrl?: string | null;
  error?: string;
}

function montarCondicao(condicao?: string | null, caixa?: string | null): string | undefined {
  const parts: string[] = [];
  if (condicao) parts.push(String(condicao).trim());
  if (caixa === "SIM") parts.push("Com caixa original");
  else if (caixa === "NAO") parts.push("Sem caixa original");
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

export async function dispararContratoAuto(
  supabase: SupabaseClient,
  shortCode: string,
): Promise<ContratoAutoResult> {
  // Venda criada pelo from-formulario (mesmo shortCode)
  const { data: venda, error: vendaErr } = await supabase
    .from("vendas")
    .select("id,cliente,cpf,cnpj,telefone,troca_produto,troca_cor,troca_valor,troca_serial,troca_imei,troca_caixa,troca_produto2,troca_cor2,troca_valor2,troca_serial2,troca_imei2,troca_caixa2")
    .eq("short_code", shortCode)
    .maybeSingle();
  if (vendaErr) return { ok: false, error: `erro buscando venda: ${vendaErr.message}` };
  if (!venda) return { ok: false, error: "venda não encontrada" };

  if (!venda.troca_produto) return { ok: true, skipped: true, reason: "venda sem troca" };
  if (!venda.cliente || !venda.telefone) {
    return { ok: false, error: "venda sem cliente ou telefone" };
  }

  // Dedup: se já existe termo pra essa venda (qualquer status), pula.
  const { data: existente } = await supabase
    .from("termos_procedencia")
    .select("id,status,zapsign_sign_url")
    .eq("venda_id", venda.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existente) {
    return {
      ok: true,
      skipped: true,
      reason: `termo já existe (${existente.status})`,
      termoId: existente.id as string,
      signUrl: (existente.zapsign_sign_url as string) || null,
    };
  }

  // Condição detalhada está em link_compras (o /compra não salva em vendas)
  const { data: linkRow } = await supabase
    .from("link_compras")
    .select("troca_condicao,troca_condicao2")
    .eq("short_code", shortCode)
    .maybeSingle();

  const aparelhos: AparelhoTermo[] = [{
    modelo: String(venda.troca_produto),
    cor: venda.troca_cor ? String(venda.troca_cor) : undefined,
    imei: venda.troca_imei ? String(venda.troca_imei) : undefined,
    serial: venda.troca_serial ? String(venda.troca_serial) : undefined,
    condicao: montarCondicao(linkRow?.troca_condicao as string | undefined, venda.troca_caixa as string | undefined),
  }];
  if (venda.troca_produto2) {
    aparelhos.push({
      modelo: String(venda.troca_produto2),
      cor: venda.troca_cor2 ? String(venda.troca_cor2) : undefined,
      imei: venda.troca_imei2 ? String(venda.troca_imei2) : undefined,
      serial: venda.troca_serial2 ? String(venda.troca_serial2) : undefined,
      condicao: montarCondicao(linkRow?.troca_condicao2 as string | undefined, venda.troca_caixa2 as string | undefined),
    });
  }

  const clienteNome = String(venda.cliente).toUpperCase();
  const clienteCpf = String(venda.cpf || venda.cnpj || "");

  // Cria termo PENDENTE — se algo falhar, fica registrado como tentativa.
  const { data: termoRow, error: termoErr } = await supabase
    .from("termos_procedencia")
    .insert({
      venda_id: venda.id,
      cliente_nome: clienteNome,
      cliente_cpf: clienteCpf,
      aparelhos,
      cidade: "Rio de Janeiro",
      status: "PENDENTE",
      gerado_por: "auto-compra",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (termoErr || !termoRow) {
    return { ok: false, error: `falha ao criar termo: ${termoErr?.message}` };
  }
  const termoId = termoRow.id as string;

  try {
    const pdfBuffer = await gerarTermoProcedenciaPDF({
      clienteNome,
      clienteCPF: clienteCpf,
      aparelhos,
      cidade: "Rio de Janeiro",
    });
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    let telNorm = String(venda.telefone).replace(/\D/g, "");
    if (telNorm.length > 11 && telNorm.startsWith("55")) telNorm = telNorm.substring(2);

    const doc = await criarDocumentoEAssinar({
      nome: `Termo de Procedencia - ${clienteNome}`,
      pdfBase64,
      signatario: {
        name: clienteNome,
        phone_country: "55",
        phone_number: telNorm,
        auth_mode: "assinaturaTela-tokenSms",
        cpf: clienteCpf || undefined,
        send_automatic_whatsapp: true,
        send_automatic_email: false,
      },
    });
    const signer = doc.signers?.[0];

    await supabase
      .from("termos_procedencia")
      .update({
        status: "ENVIADO",
        zapsign_doc_token: doc.token,
        zapsign_signer_token: signer?.token || null,
        zapsign_sign_url: signer?.sign_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", termoId);

    console.log(`[contrato-auto] SUCCESS termo=${termoId} cliente=${clienteNome}`);
    return { ok: true, termoId, signUrl: signer?.sign_url || null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[contrato-auto] FAIL:", msg);
    await supabase
      .from("termos_procedencia")
      .update({
        status: "ERRO",
        observacao: msg.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", termoId);
    return { ok: false, termoId, error: msg };
  }
}
