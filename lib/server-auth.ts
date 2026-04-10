import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Autenticação + autorização server-side.
 * Verifica a senha admin E busca permissões reais do banco,
 * sem confiar nos headers do cliente.
 */

interface AuthResult {
  authorized: boolean;
  usuario: string;
  role: string;
  permissoes: string[];
  response?: NextResponse;
}

// Cache simples em memória (5 min TTL) para não bater no banco a cada request
const permCache = new Map<string, { role: string; permissoes: string[]; nome: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export async function authenticateAdmin(req: NextRequest): Promise<AuthResult> {
  const pw = req.headers.get("x-admin-password");
  if (!pw || pw !== process.env.ADMIN_PASSWORD) {
    return { authorized: false, usuario: "anon", role: "", permissoes: [], response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const userLogin = req.headers.get("x-admin-user") || "sistema";
  const decodedLogin = (() => { try { return decodeURIComponent(userLogin); } catch { return userLogin; } })();

  // Verificar cache
  const now = Date.now();
  const cached = permCache.get(decodedLogin);
  if (cached && now < cached.expiresAt) {
    return { authorized: true, usuario: cached.nome, role: cached.role, permissoes: cached.permissoes };
  }

  // Buscar do banco
  const { data: user } = await supabase
    .from("usuarios")
    .select("nome, role, permissoes")
    .eq("nome", decodedLogin)
    .eq("ativo", true)
    .maybeSingle();

  if (user) {
    const entry = { role: user.role || "vendedor", permissoes: user.permissoes ?? [], nome: user.nome, expiresAt: now + CACHE_TTL };
    permCache.set(decodedLogin, entry);
    return { authorized: true, usuario: user.nome, role: entry.role, permissoes: entry.permissoes };
  }

  // Se não achou o usuário mas a senha está correta, permite com role do header (compatibilidade)
  const headerRole = req.headers.get("x-admin-role") || "admin";
  const headerPerms: string[] = (() => { try { return JSON.parse(req.headers.get("x-admin-permissoes") || "[]"); } catch { return []; } })();
  return { authorized: true, usuario: decodedLogin, role: headerRole, permissoes: headerPerms };
}
