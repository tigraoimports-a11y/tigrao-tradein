import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

// GET: Listar etiquetas (com filtros opcionais)
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const categoria = searchParams.get("categoria");
  const codigo = searchParams.get("codigo");

  let query = supabase.from("etiquetas").select("*").order("created_at", { ascending: false });

  if (status) query = query.eq("status", status);
  if (categoria) query = query.eq("categoria", categoria);
  if (codigo) query = query.eq("codigo_barras", codigo);

  const { data, error } = await query.limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST: Gerar nova etiqueta
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { categoria, produto, cor, armazenamento, custo_unitario, fornecedor, observacao } = body;

    if (!produto) {
      return NextResponse.json({ error: "Produto é obrigatório" }, { status: 400 });
    }

    // Gerar código de barras único via função SQL
    const { data: codigoData, error: codigoError } = await supabase.rpc("gerar_codigo_barras_tigrao");
    if (codigoError) throw codigoError;

    const codigo_barras = codigoData as string;

    // Inserir etiqueta
    const { data, error } = await supabase
      .from("etiquetas")
      .insert({
        codigo_barras,
        categoria: categoria || null,
        produto,
        cor: cor || null,
        armazenamento: armazenamento || null,
        custo_unitario: custo_unitario || 0,
        fornecedor: fornecedor || null,
        observacao: observacao || null,
        status: "AGUARDANDO_ENTRADA",
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = e instanceof Error ? e.message : (e as any)?.message || JSON.stringify(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE: Remover etiqueta (só se AGUARDANDO_ENTRADA)
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

    // Verificar se está aguardando (não pode deletar se já entrou)
    const { data: etiqueta } = await supabase
      .from("etiquetas")
      .select("status")
      .eq("id", id)
      .single();

    if (etiqueta?.status !== "AGUARDANDO_ENTRADA") {
      return NextResponse.json({ error: "Só é possível excluir etiquetas que ainda não entraram no estoque" }, { status: 400 });
    }

    const { error } = await supabase.from("etiquetas").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
