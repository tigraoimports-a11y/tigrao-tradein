import { NextRequest, NextResponse } from "next/server";

const auth = (req: NextRequest) => !!req.headers.get("x-admin-password");

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");
  const body = await req.json();
  const { nomeAntigo, nomeNovo } = body;

  if (!nomeAntigo || !nomeNovo) {
    return NextResponse.json({ error: "nomeAntigo e nomeNovo são obrigatórios" }, { status: 400 });
  }

  if (nomeAntigo.trim().toUpperCase() === nomeNovo.trim().toUpperCase()) {
    return NextResponse.json({ error: "Os nomes são iguais" }, { status: 400 });
  }

  const antigo = nomeAntigo.trim().toUpperCase();
  const novo = nomeNovo.trim().toUpperCase();

  const resultado: Record<string, number> = {};

  // 1. vendas.cliente
  const { data: d1 } = await supabase.from("vendas").update({ cliente: novo }).eq("cliente", antigo).select("id");
  resultado.vendas = d1?.length || 0;

  // 2. reajustes.cliente
  const { data: d2 } = await supabase.from("reajustes").update({ cliente: novo }).eq("cliente", antigo).select("id");
  resultado.reajustes = d2?.length || 0;

  // 3. estoque.cliente
  const { data: d3 } = await supabase.from("estoque").update({ cliente: novo }).eq("cliente", antigo).select("id");
  resultado.estoque = d3?.length || 0;

  // 4. entregas.cliente
  const { data: d4 } = await supabase.from("entregas").update({ cliente: novo }).eq("cliente", antigo).select("id");
  resultado.entregas = d4?.length || 0;

  // 5. link_compras.cliente_nome
  const { data: d5 } = await supabase.from("link_compras").update({ cliente_nome: novo }).eq("cliente_nome", antigo).select("id");
  resultado.link_compras = d5?.length || 0;

  // 6. lojistas.nome (se existir)
  const { data: lojistaAntigo } = await supabase.from("lojistas").select("id, saldo_credito").eq("nome", antigo).limit(1).maybeSingle();
  const { data: lojistaNovo } = await supabase.from("lojistas").select("id, saldo_credito").eq("nome", novo).limit(1).maybeSingle();

  if (lojistaAntigo) {
    if (lojistaNovo) {
      // Ambos existem: transferir saldo e movimentações do antigo pro novo
      const saldoSomado = (lojistaNovo.saldo_credito || 0) + (lojistaAntigo.saldo_credito || 0);
      await supabase.from("lojistas").update({ saldo_credito: saldoSomado }).eq("id", lojistaNovo.id);
      // Reatribuir movimentações
      const { data: d6 } = await supabase.from("lojistas_movimentacoes").update({ lojista_id: lojistaNovo.id }).eq("lojista_id", lojistaAntigo.id).select("id");
      resultado.lojistas_movimentacoes = d6?.length || 0;
      // Deletar lojista antigo
      await supabase.from("lojistas").delete().eq("id", lojistaAntigo.id);
      resultado.lojistas = 1;
    } else {
      // Só renomear
      await supabase.from("lojistas").update({ nome: novo }).eq("id", lojistaAntigo.id);
      resultado.lojistas = 1;
    }
  }

  const usuario = req.headers.get("x-admin-user") ? decodeURIComponent(req.headers.get("x-admin-user")!) : "sistema";
  const { logActivity } = await import("@/lib/activity-log");
  await logActivity(usuario, "Merge cliente", `"${antigo}" → "${novo}" (${JSON.stringify(resultado)})`, "vendas", "");

  return NextResponse.json({ ok: true, resultado, de: antigo, para: novo });
}
