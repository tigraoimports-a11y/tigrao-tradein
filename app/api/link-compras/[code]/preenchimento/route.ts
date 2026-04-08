import { NextResponse } from "next/server";

// Endpoint PÚBLICO: cliente preenche dados na página /c/[code] e envia de volta.
// Salva o snapshot JSONB em link_compras.cliente_dados_preenchidos + timestamp + status=PREENCHIDO
// Sem auth (é público por design — só aceita se o short_code existe).
export async function POST(request: Request, ctx: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await ctx.params;
    if (!code) return NextResponse.json({ error: "code required" }, { status: 400 });

    const body = await request.json();
    const dados = body?.dados || body; // aceita tanto {dados:{...}} quanto raw

    const { supabase } = await import("@/lib/supabase");

    // Busca o link
    const { data: link, error: e1 } = await supabase
      .from("link_compras")
      .select("id, status, cliente_nome, cliente_telefone, cliente_cpf, cliente_email")
      .eq("short_code", code)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1 || !link) return NextResponse.json({ error: "Link não encontrado" }, { status: 404 });

    const patch: Record<string, unknown> = {
      cliente_dados_preenchidos: dados,
      cliente_preencheu_em: new Date().toISOString(),
      status: "PREENCHIDO",
      updated_at: new Date().toISOString(),
    };
    // Se os campos principais estiverem vazios, preenche com o que veio
    if (!link.cliente_nome && dados?.nome) patch.cliente_nome = dados.nome;
    if (!link.cliente_telefone && dados?.telefone) patch.cliente_telefone = dados.telefone;
    if (!link.cliente_cpf && dados?.cpf) patch.cliente_cpf = dados.cpf;
    if (!link.cliente_email && dados?.email) patch.cliente_email = dados.email;

    const { error: e2 } = await supabase.from("link_compras").update(patch).eq("id", link.id);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
