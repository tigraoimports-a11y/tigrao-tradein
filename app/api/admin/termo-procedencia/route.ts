import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { gerarTermoProcedenciaPDF, type AparelhoTermo } from "@/lib/pdf-termo-procedencia";
import { criarDocumentoEAssinar } from "@/lib/zapsign";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "Sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// GET: listar termos (filtro por venda_id, pendencia_id, status, cliente)
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  let query = supabase.from("termos_procedencia").select("*").order("created_at", { ascending: false });

  const vendaId = sp.get("venda_id");
  const pendenciaId = sp.get("pendencia_id");
  const encomendaId = sp.get("encomenda_id");
  const status = sp.get("status");
  const search = sp.get("search");

  if (vendaId) query = query.eq("venda_id", vendaId);
  if (pendenciaId) query = query.eq("pendencia_id", pendenciaId);
  if (encomendaId) query = query.eq("encomenda_id", encomendaId);
  if (status) query = query.eq("status", status);
  if (search) query = query.ilike("cliente_nome", `%${search}%`);

  const { data, error } = await query.limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST: criar termo + gerar PDF
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const usuario = getUsuario(req);

  let { cliente_nome, cliente_cpf, aparelhos, venda_id, encomenda_id, pendencia_id, cidade, gerar_pdf, cliente_whatsapp, enviar_para_assinatura } = body;

  // Se faltar nome/CPF, tentar buscar da venda ou encomenda vinculada
  if ((!cliente_nome || !cliente_cpf) && venda_id) {
    const { data: venda } = await supabase.from("vendas").select("cliente,cpf").eq("id", venda_id).maybeSingle();
    if (venda) {
      if (!cliente_nome) cliente_nome = venda.cliente;
      if (!cliente_cpf) cliente_cpf = venda.cpf;
    }
  }
  if ((!cliente_nome || !cliente_cpf) && encomenda_id) {
    const { data: enc } = await supabase.from("encomendas").select("cliente,cpf").eq("id", encomenda_id).maybeSingle();
    if (enc) {
      if (!cliente_nome) cliente_nome = enc.cliente;
      if (!cliente_cpf) cliente_cpf = enc.cpf;
    }
  }
  if ((!cliente_nome || !cliente_cpf) && pendencia_id) {
    // Pendência: buscar cliente do estoque, e CPF da venda mais recente desse cliente
    const { data: pend } = await supabase.from("estoque").select("cliente").eq("id", pendencia_id).maybeSingle();
    if (pend?.cliente) {
      if (!cliente_nome) cliente_nome = pend.cliente;
      if (!cliente_cpf) {
        const { data: vendaCliente } = await supabase.from("vendas").select("cpf").ilike("cliente", pend.cliente).not("cpf", "is", null).limit(1).maybeSingle();
        if (vendaCliente?.cpf) cliente_cpf = vendaCliente.cpf;
      }
    }
  }

  if (!cliente_nome) {
    return NextResponse.json({ error: "cliente_nome não encontrado — preencha ou vincule a uma venda" }, { status: 400 });
  }
  // CPF pode ficar vazio se não encontrado (será campo em branco no PDF)
  if (!cliente_cpf) cliente_cpf = "";

  if (!aparelhos || !Array.isArray(aparelhos) || aparelhos.length === 0) {
    return NextResponse.json({ error: "aparelhos (array) obrigatório com pelo menos 1 item" }, { status: 400 });
  }

  // Criar registro
  const { data: termo, error } = await supabase.from("termos_procedencia").insert({
    cliente_nome: cliente_nome.toUpperCase(),
    cliente_cpf,
    aparelhos,
    venda_id: venda_id || null,
    encomenda_id: encomenda_id || null,
    pendencia_id: pendencia_id || null,
    cidade: cidade || "Rio de Janeiro",
    status: gerar_pdf !== false ? "GERADO" : "PENDENTE",
    gerado_por: usuario,
    updated_at: new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logActivity(usuario, "Criou termo de procedência", `Cliente: ${cliente_nome}, ${aparelhos.length} aparelho(s)`, "termos_procedencia", termo?.id).catch(() => {});

  // Fluxo: enviar pra assinatura digital via ZapSign (recebe link por WhatsApp + SMS auth)
  if (enviar_para_assinatura) {
    // Buscar whatsapp se nao veio no body
    if (!cliente_whatsapp && venda_id) {
      const { data: venda } = await supabase.from("vendas").select("telefone").eq("id", venda_id).maybeSingle();
      if (venda?.telefone) cliente_whatsapp = venda.telefone;
    }
    if (!cliente_whatsapp && encomenda_id) {
      const { data: enc } = await supabase.from("encomendas").select("telefone,whatsapp").eq("id", encomenda_id).maybeSingle();
      if (enc) cliente_whatsapp = enc.telefone || enc.whatsapp;
    }

    if (!cliente_whatsapp) {
      return NextResponse.json({ error: "WhatsApp do cliente obrigatorio para enviar assinatura digital" }, { status: 400 });
    }

    try {
      const pdfBuffer = await gerarTermoProcedenciaPDF({
        clienteNome: cliente_nome.toUpperCase(),
        clienteCPF: cliente_cpf,
        aparelhos: aparelhos as AparelhoTermo[],
        cidade: cidade || "Rio de Janeiro",
      });
      const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

      // Normalizar telefone: só dígitos, sem DDI 55
      let telNorm = String(cliente_whatsapp).replace(/\D/g, "");
      if (telNorm.length > 11 && telNorm.startsWith("55")) telNorm = telNorm.substring(2);

      const doc = await criarDocumentoEAssinar({
        nome: `Termo de Procedencia - ${cliente_nome.toUpperCase()}`,
        pdfBase64,
        signatario: {
          name: cliente_nome.toUpperCase(),
          phone_country: "55",
          phone_number: telNorm,
          auth_mode: "assinaturaTela-tokenSms",
          cpf: cliente_cpf || undefined,
          send_automatic_whatsapp: true,
          send_automatic_email: false,
        },
      });

      const signer = doc.signers?.[0];

      await supabase.from("termos_procedencia").update({
        status: "ENVIADO",
        zapsign_doc_token: doc.token,
        zapsign_signer_token: signer?.token || null,
        zapsign_sign_url: signer?.sign_url || null,
        updated_at: new Date().toISOString(),
      }).eq("id", termo.id);

      logActivity(usuario, "Enviou termo para assinatura digital", `Cliente: ${cliente_nome}, WhatsApp: ${telNorm}`, "termos_procedencia", termo.id).catch(() => {});

      return NextResponse.json({
        ok: true,
        data: { ...termo, zapsign_doc_token: doc.token, zapsign_sign_url: signer?.sign_url, status: "ENVIADO" },
        sign_url: signer?.sign_url,
        message: "Termo enviado pelo WhatsApp. Cliente vai receber link e codigo SMS pra assinar.",
      });
    } catch (err) {
      // Falhou o envio — remove o termo criado pra evitar lixo
      await supabase.from("termos_procedencia").delete().eq("id", termo.id);
      return NextResponse.json({ error: `Falha ao enviar pra assinatura: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
    }
  }

  // Gerar PDF se solicitado (default: sim)
  if (gerar_pdf !== false) {
    try {
      const pdfBuffer = await gerarTermoProcedenciaPDF({
        clienteNome: cliente_nome.toUpperCase(),
        clienteCPF: cliente_cpf,
        aparelhos: aparelhos as AparelhoTermo[],
        cidade: cidade || "Rio de Janeiro",
      });

      // Retornar PDF diretamente
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="TERMO_PROCEDENCIA_${cliente_nome.replace(/\s+/g, "_").toUpperCase()}.pdf"`,
          "X-Termo-Id": termo?.id || "",
        },
      });
    } catch (pdfErr) {
      // PDF falhou mas termo foi criado — retorna JSON com aviso
      return NextResponse.json({ ok: true, data: termo, warning: `Termo criado mas PDF falhou: ${pdfErr}` });
    }
  }

  return NextResponse.json({ ok: true, data: termo });
}

// PATCH: atualizar status ou dados
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const allowed = ["status", "observacao", "cidade", "aparelhos", "cliente_nome", "cliente_cpf", "pdf_url"];
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) {
    if (k in fields) patch[k] = fields[k];
  }

  const { error } = await supabase.from("termos_procedencia").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = getUsuario(req);
  logActivity(usuario, "Atualizou termo de procedência", `Status: ${fields.status || "—"}`, "termos_procedencia", id).catch(() => {});

  return NextResponse.json({ ok: true });
}

// DELETE: remover termo
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabase.from("termos_procedencia").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = getUsuario(req);
  logActivity(usuario, "Removeu termo de procedência", `ID: ${id}`, "termos_procedencia", id).catch(() => {});

  return NextResponse.json({ ok: true });
}

// POST com action=gerar_pdf — regenerar PDF de um termo existente
