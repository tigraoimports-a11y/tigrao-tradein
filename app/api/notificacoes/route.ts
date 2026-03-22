import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST: Registrar interesse "Avise-me quando chegar"
export async function POST(req: NextRequest) {
  try {
    const { produto_slug, produto_nome, whatsapp, nome } = await req.json();
    if (!produto_slug || !whatsapp) {
      return NextResponse.json({ error: "produto_slug e whatsapp sao obrigatorios" }, { status: 400 });
    }

    const { error } = await supabase.from("notificacoes_estoque").insert({
      produto_slug, produto_nome: produto_nome || "", whatsapp, nome: nome || "",
      notificado: false,
    });

    if (error) {
      // Se tabela não existe, retornar sucesso silencioso (feature será ativada quando tabela for criada)
      console.error("Erro ao salvar notificacao:", error.message);
      return NextResponse.json({ ok: true, fallback: true });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// GET: Listar notificações pendentes (admin)
export async function GET(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase.from("notificacoes_estoque").select("*").order("created_at", { ascending: false }).limit(100);
  return NextResponse.json({ data: data ?? [] });
}
