import { NextResponse } from "next/server";

// Endpoint PÚBLICO: cria um link_compras automaticamente quando o cliente
// clica "DESEJO FECHAR MEU PEDIDO" no simulador de trade-in.
// Sem auth — é chamado do site público. Apenas insere, não lê/edita/deleta.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { supabase } = await import("@/lib/supabase");

    if (!body.short_code || !body.produto) {
      return NextResponse.json({ error: "short_code e produto são obrigatórios" }, { status: 400 });
    }

    // Verificar se já existe (evitar duplicata)
    // 1. Por short_code exato
    const { data: existing } = await supabase
      .from("link_compras")
      .select("id")
      .eq("short_code", body.short_code)
      .maybeSingle();
    if (existing) return NextResponse.json({ ok: true, exists: true });

    // 2. Mesmo cliente + mesmo produto nos últimos 30 minutos (evita múltiplos cliques)
    if (body.cliente_telefone || body.cliente_nome) {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      let q = supabase.from("link_compras").select("id").eq("produto", body.produto || "").gte("created_at", since);
      if (body.cliente_telefone) q = q.eq("cliente_telefone", body.cliente_telefone);
      else if (body.cliente_nome) q = q.ilike("cliente_nome", body.cliente_nome);
      const { data: recent } = await q.limit(1);
      if (recent && recent.length > 0) return NextResponse.json({ ok: true, exists: true });
    }

    const payload = {
      short_code: body.short_code,
      url_curta: body.url_curta || null,
      tipo: body.tipo === "TROCA" ? "TROCA" : "COMPRA",
      cliente_nome: body.cliente_nome || null,
      cliente_telefone: body.cliente_telefone || null,
      produto: body.produto || "",
      cor: body.cor || null,
      valor: Number(body.valor) || 0,
      troca_produto: body.troca_produto || null,
      troca_valor: Number(body.troca_valor) || 0,
      troca_condicao: body.troca_condicao || null,
      troca_cor: body.troca_cor || null,
      troca_produto2: body.troca_produto2 || null,
      troca_valor2: Number(body.troca_valor2) || 0,
      troca_condicao2: body.troca_condicao2 || null,
      troca_cor2: body.troca_cor2 || null,
      vendedor: body.vendedor || null,
      operador: "Simulador",
    };

    const { error } = await supabase.from("link_compras").insert(payload);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
