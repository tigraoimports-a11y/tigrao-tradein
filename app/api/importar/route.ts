import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { table, rows } = await req.json();

  if (!table || !rows || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "table and rows required" }, { status: 400 });
  }

  if (!["vendas", "gastos"].includes(table)) {
    return NextResponse.json({ error: "table must be vendas or gastos" }, { status: 400 });
  }

  // Importar em lotes de 100
  const batchSize = 100;
  let imported = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      errors.push({ row: i, error: error.message });
    } else {
      imported += batch.length;
    }
  }

  return NextResponse.json({ ok: true, imported, errors, total: rows.length });
}
