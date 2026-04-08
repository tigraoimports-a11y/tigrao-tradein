import { NextResponse } from "next/server";

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

// GET /api/admin/debug-watch — retorna contagem de Apple Watch SE/Series 11 no estoque
export async function GET(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase } = await import("@/lib/supabase");

  const { data, error } = await supabase
    .from("estoque")
    .select("id, produto, categoria, qnt")
    .eq("categoria", "APPLE_WATCH")
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const resumo = {
    total: rows.length,
    com_se_42_46: rows.filter(r => /apple\s*watch\s*se\s*4[26]\s*mm/i.test(r.produto || "")).length,
    com_series_11: rows.filter(r => /series\s*11/i.test(r.produto || "")).length,
    com_ultra: rows.filter(r => /ultra/i.test(r.produto || "")).length,
    amostras_se_42_46: rows.filter(r => /apple\s*watch\s*se\s*4[26]\s*mm/i.test(r.produto || "")).slice(0, 10).map(r => r.produto),
    amostras_series_11: rows.filter(r => /series\s*11/i.test(r.produto || "")).slice(0, 10).map(r => r.produto),
  };

  return NextResponse.json(resumo);
}

// POST { action: "rename" } — renomeia SE 42/46mm para Series 11 direto via supabase client
export async function POST(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body?.action !== "rename") return NextResponse.json({ error: "action inválida" }, { status: 400 });

  const { supabase } = await import("@/lib/supabase");

  // Busca todas as linhas de APPLE_WATCH com SE 42/46mm
  const { data, error } = await supabase
    .from("estoque")
    .select("id, produto")
    .eq("categoria", "APPLE_WATCH")
    .or("produto.ilike.%apple watch se%42%mm%,produto.ilike.%apple watch se%46%mm%");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const updates: { id: string; produto_antigo: string; produto_novo: string }[] = [];

  for (const r of rows) {
    const novo = (r.produto || "").replace(/apple\s*watch\s*se/gi, "Apple Watch Series 11");
    if (novo !== r.produto) {
      const { error: upErr } = await supabase.from("estoque").update({ produto: novo }).eq("id", r.id);
      if (!upErr) updates.push({ id: r.id, produto_antigo: r.produto, produto_novo: novo });
    }
  }

  return NextResponse.json({ ok: true, total_encontrados: rows.length, total_atualizados: updates.length, updates });
}
