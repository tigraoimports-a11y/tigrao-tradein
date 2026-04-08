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
