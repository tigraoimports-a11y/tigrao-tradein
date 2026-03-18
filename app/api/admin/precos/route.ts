import { NextRequest, NextResponse } from "next/server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET — lista todos os preços (Supabase + seed do Sheets se vazio)
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");

  const { data, error } = await supabase
    .from("precos")
    .select("*")
    .order("modelo")
    .order("armazenamento");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// POST — upsert de um produto (modelo + armazenamento + preco_pix + status)
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { modelo, armazenamento, preco_pix, status } = body;

  if (!modelo || !armazenamento || preco_pix === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { supabase } = await import("@/lib/supabase");

  const { error } = await supabase.from("precos").upsert(
    { modelo, armazenamento, preco_pix: Number(preco_pix), status: status ?? "ativo", updated_at: new Date().toISOString() },
    { onConflict: "modelo,armazenamento" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PUT — importa todos os produtos do Google Sheets para o Supabase
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { fetchNewProducts } = await import("@/lib/sheets");
  const { supabase } = await import("@/lib/supabase");

  const products = await fetchNewProducts();

  const rows = products.map((p) => ({
    modelo: p.modelo,
    armazenamento: p.armazenamento,
    preco_pix: p.precoPix,
    status: "ativo",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("precos")
    .upsert(rows, { onConflict: "modelo,armazenamento" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, imported: rows.length });
}
