import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// GET /api/admin/rastreios-envio?origem=SAO_PAULO&data=2026-04-13
// Retorna lista de códigos de rastreio daquele pedido (origem + data).
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origem = req.nextUrl.searchParams.get("origem");
  const data = req.nextUrl.searchParams.get("data");
  if (!origem || !data) {
    return NextResponse.json({ error: "origem e data obrigatorios" }, { status: 400 });
  }

  try {
    const supabase = getSupabase();
    const { data: rows, error } = await supabase
      .from("rastreios_envio")
      .select("id, codigo_rastreio, created_at")
      .eq("origem_compra", origem)
      .eq("data_compra", data)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ codigos: [] });
    return NextResponse.json({ codigos: rows || [] });
  } catch {
    return NextResponse.json({ codigos: [] });
  }
}

// POST /api/admin/rastreios-envio
// body: { origem: string, data: string (YYYY-MM-DD), codigos: string[] }
// Insere 1 ou mais códigos; duplicatas são ignoradas (ON CONFLICT DO NOTHING via UNIQUE).
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { origem, data, codigos } = await req.json();
    if (!origem || !data || !Array.isArray(codigos) || codigos.length === 0) {
      return NextResponse.json({ error: "origem, data e codigos[] obrigatorios" }, { status: 400 });
    }

    const supabase = getSupabase();
    const rows = codigos
      .map((c: string) => String(c || "").trim())
      .filter((c: string) => c.length > 0)
      .map((c: string) => ({ origem_compra: origem, data_compra: data, codigo_rastreio: c }));

    if (rows.length === 0) return NextResponse.json({ error: "nenhum codigo valido" }, { status: 400 });

    const { error } = await supabase
      .from("rastreios_envio")
      .upsert(rows, { onConflict: "origem_compra,data_compra,codigo_rastreio", ignoreDuplicates: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, inseridos: rows.length });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/admin/rastreios-envio?id=<uuid>
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from("rastreios_envio").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
