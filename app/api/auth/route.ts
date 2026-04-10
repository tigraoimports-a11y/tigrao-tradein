import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import bcrypt from "bcryptjs";

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
  // Rate limit: 5 tentativas por minuto por IP
  const rl = rateLimit(req, 5, 60 * 1000, "auth-login");
  if (rl) return rl;

  const { login, senha } = await req.json();

  if (!login || !senha) {
    return NextResponse.json({ error: "Login e senha obrigatorios" }, { status: 400 });
  }

  // Buscar usuário pelo login (sem comparar senha direto no query)
  const { data: user } = await supabase
    .from("usuarios")
    .select("*")
    .eq("login", login.toLowerCase().trim())
    .eq("ativo", true)
    .single();

  if (!user) {
    return NextResponse.json({ error: "Login ou senha incorretos" }, { status: 401 });
  }

  // Verificar senha: suporta bcrypt hash ($2a$/$2b$) ou texto puro (legado)
  const senhaDB = user.senha || "";
  const isHash = senhaDB.startsWith("$2a$") || senhaDB.startsWith("$2b$");

  let senhaValida = false;
  if (isHash) {
    senhaValida = await bcrypt.compare(senha, senhaDB);
  } else {
    // Legado: comparação direta em texto puro
    senhaValida = senha === senhaDB;
    // Auto-migrar para hash na próxima oportunidade
    if (senhaValida) {
      const hash = await bcrypt.hash(senha, 10);
      await supabase.from("usuarios").update({ senha: hash }).eq("id", user.id);
    }
  }

  if (!senhaValida) {
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
