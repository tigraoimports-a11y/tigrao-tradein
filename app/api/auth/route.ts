import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { login, senha } = await req.json();

  if (!login || !senha) {
    return NextResponse.json({ error: "Login e senha obrigatorios" }, { status: 400 });
  }

  const { data: user } = await supabase
    .from("usuarios")
    .select("*")
    .eq("login", login.toLowerCase().trim())
    .eq("senha", senha)
    .eq("ativo", true)
    .single();

  if (!user) {
    return NextResponse.json({ error: "Login ou senha incorretos" }, { status: 401 });
  }

  // Retorna o token de API (admin password) para o client usar nas chamadas
  const apiToken = process.env.ADMIN_PASSWORD ?? "";

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      nome: user.nome,
      login: user.login,
      role: user.role,
      permissoes: user.permissoes ?? [],
    },
    apiToken,
  });
}
