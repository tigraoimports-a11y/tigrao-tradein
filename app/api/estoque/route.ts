import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  return req.headers.get("x-admin-user") || "sistema";
}

async function logEstoque(usuario: string, acao: string, produtoId: string | null, produtoNome: string, campo: string, valorAnterior: string, valorNovo: string) {
  await supabase.from("estoque_log").insert({
    usuario, acao, produto_id: produtoId, produto_nome: produtoNome, campo,
    valor_anterior: valorAnterior, valor_novo: valorNovo,
  });
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");

  let query = supabase.from("estoque").select("*").order("categoria").order("produto");
  if (categoria) query = query.eq("categoria", categoria);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // Ação de importar em lote
  if (body.action === "import") {
    const rows = body.rows as Record<string, unknown>[];
    if (!rows?.length) return NextResponse.json({ error: "rows required" }, { status: 400 });

    // Deduplicar por (produto, cor) — mantém o último
    const seen = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const key = `${r.produto}|${r.cor ?? ""}`;
      seen.set(key, { ...r, updated_at: new Date().toISOString() });
    }
    const unique = [...seen.values()];

    // Importar um por um para evitar conflitos
    let imported = 0;
    const errors: string[] = [];
    for (const row of unique) {
      const { error } = await supabase.from("estoque").upsert(row, { onConflict: "produto,cor" });
      if (error) errors.push(`${row.produto}: ${error.message}`);
      else imported++;
    }

    return NextResponse.json({ ok: true, imported, errors: errors.slice(0, 5), total: unique.length });
  }

  // Inserir novo produto
  const { data, error } = await supabase.from("estoque").insert({
    ...body,
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);

  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Buscar estado anterior para o log
  const { data: antes } = await supabase.from("estoque").select("*").eq("id", id).single();

  const { error } = await supabase.from("estoque").update({
    ...fields,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Registrar log para cada campo alterado
  if (antes) {
    for (const [campo, valorNovo] of Object.entries(fields)) {
      const valorAnterior = String((antes as Record<string, unknown>)[campo] ?? "");
      const novo = String(valorNovo ?? "");
      if (valorAnterior !== novo) {
        await logEstoque(usuario, "alteracao", id, antes.produto, campo, valorAnterior, novo);
      }
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Log antes de deletar
  const { data: antes } = await supabase.from("estoque").select("produto").eq("id", id).single();
  if (antes) {
    await logEstoque(usuario, "exclusao", id, antes.produto, "", "", "");
  }

  const { error } = await supabase.from("estoque").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
