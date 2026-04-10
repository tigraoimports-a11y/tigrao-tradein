import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { gerarTermoProcedenciaPDF, type AparelhoTermo } from "@/lib/pdf-termo-procedencia";

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

  let { cliente_nome, cliente_cpf, aparelhos, venda_id, encomenda_id, pendencia_id, cidade, gerar_pdf } = body;

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
