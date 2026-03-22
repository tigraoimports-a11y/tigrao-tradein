import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: buscar permissões atualizadas de um usuário (usado para re-validar sessão)
export async function GET(req: NextRequest) {
  const password = req.headers.get("x-admin-password");
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = req.nextUrl.searchParams.get("login");
  if (!login) return NextResponse.json({ error: "login required" }, { status: 400 });

  const { data: user } = await supabase
    .from("usuarios")
    .select("id, nome, login, role, permissoes")
    .eq("login", login.toLowerCase().trim())
    .eq("ativo", true)
    .single();

  if (!user) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    user: {
      id: user.id,
      nome: user.nome,
      login: user.login,
      role: user.role,
      permissoes: user.permissoes ?? [],
    },
  });
}

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
