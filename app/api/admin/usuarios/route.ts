import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  return req.headers.get("x-admin-user") || "sistema";
}

function getRole(req: NextRequest): string {
  return req.headers.get("x-admin-role") || "admin";
}

// GET — listar todos os usuarios
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  if (role !== "admin") return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, login, role, ativo, created_at")
    .order("nome");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// PATCH — alterar role ou ativo de um usuario
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  if (role !== "admin") return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const usuario = getUsuario(req);
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Only allow updating role and ativo
  const allowed: Record<string, unknown> = {};
  if (fields.role !== undefined) allowed.role = fields.role;
  if (fields.ativo !== undefined) allowed.ativo = fields.ativo;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  // Get current user info for logging
  const { data: antes } = await supabase.from("usuarios").select("nome, role, ativo").eq("id", id).single();

  const { error } = await supabase.from("usuarios").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const changes: string[] = [];
  if (fields.role !== undefined && antes?.role !== fields.role) changes.push(`role: ${antes?.role} -> ${fields.role}`);
  if (fields.ativo !== undefined && antes?.ativo !== fields.ativo) changes.push(`ativo: ${antes?.ativo} -> ${fields.ativo}`);

  await logActivity(usuario, "Alterou usuario", `${antes?.nome || "?"}: ${changes.join(", ")}`, "usuarios", id);

  return NextResponse.json({ ok: true });
}

// POST — criar novo usuario
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  if (role !== "admin") return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const usuario = getUsuario(req);
  const body = await req.json();
  const { nome, login, senha, role: newRole } = body;

  if (!nome || !login || !senha) {
    return NextResponse.json({ error: "nome, login e senha obrigatorios" }, { status: 400 });
  }

  const { data, error } = await supabase.from("usuarios").insert({
    nome,
    login: login.toLowerCase().trim(),
    senha,
    role: newRole || "visualizador",
    ativo: true,
  }).select("id, nome, login, role, ativo, created_at").single();

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return NextResponse.json({ error: "Login ja existe" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(usuario, "Criou usuario", `${nome} (${newRole || "visualizador"})`, "usuarios", data?.id);

  return NextResponse.json({ ok: true, data });
}
