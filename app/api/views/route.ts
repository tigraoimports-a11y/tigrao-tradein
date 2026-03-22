import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST: Registrar visualização de produto
export async function POST(req: NextRequest) {
  try {
    const { produto_slug, produto_nome } = await req.json();
    if (!produto_slug) return NextResponse.json({ error: "produto_slug obrigatorio" }, { status: 400 });

    // Upsert: incrementar contador ou criar novo registro
    const { data: existing } = await supabase
      .from("produto_views")
      .select("id, views")
      .eq("produto_slug", produto_slug)
      .single();

    if (existing) {
      await supabase.from("produto_views").update({ views: (existing.views || 0) + 1, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabase.from("produto_views").insert({ produto_slug, produto_nome: produto_nome || "", views: 1 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    // Tabela pode não existir ainda — retornar sucesso silencioso
    return NextResponse.json({ ok: true, fallback: true });
  }
}

// GET: Relatório de visualizações (admin)
export async function GET(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase.from("produto_views").select("*").order("views", { ascending: false }).limit(50);
  return NextResponse.json({ data: data ?? [] });
}
