import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function getRole(req: NextRequest): string {
  return req.headers.get("x-admin-role") || "admin";
}

// GET — listar todos os usuarios
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  if (role !== "admin") return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const primary = await supabase
    .from("usuarios")
    .select("id, nome, login, role, ativo, permissoes, abas_ocultas, created_at")
    .order("nome");

  let data: unknown = primary.data;
  let error = primary.error;

  // Fallback: coluna abas_ocultas pode nao existir ainda (migration nao aplicada)
  if (error && /abas_ocultas/i.test(error.message)) {
    const fallback = await supabase
      .from("usuarios")
      .select("id, nome, login, role, ativo, permissoes, created_at")
      .order("nome");
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}

// PATCH — alterar role, ativo, ou permissoes de um usuario
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  if (role !== "admin") return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const usuario = getUsuario(req);
  const body = await req.json();
  const { id, ...fields } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Only allow updating role, ativo, permissoes, and abas_ocultas
  const allowed: Record<string, unknown> = {};
  if (fields.role !== undefined) allowed.role = fields.role;
  if (fields.ativo !== undefined) allowed.ativo = fields.ativo;
  if (fields.permissoes !== undefined) allowed.permissoes = fields.permissoes;
  if (fields.abas_ocultas !== undefined) allowed.abas_ocultas = fields.abas_ocultas;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  // Get current user info for logging
  const { data: antes } = await supabase.from("usuarios").select("nome, role, ativo, permissoes, abas_ocultas").eq("id", id).single();

  const { error } = await supabase.from("usuarios").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const changes: string[] = [];
  if (fields.role !== undefined && antes?.role !== fields.role) changes.push(`role: ${antes?.role} -> ${fields.role}`);
  if (fields.ativo !== undefined && antes?.ativo !== fields.ativo) changes.push(`ativo: ${antes?.ativo} -> ${fields.ativo}`);
  if (fields.permissoes !== undefined) {
    const before = (antes?.permissoes as string[] ?? []).sort().join(",");
    const after = (fields.permissoes as string[]).sort().join(",");
    if (before !== after) changes.push(`permissoes atualizadas`);
  }
  if (fields.abas_ocultas !== undefined) {
    const before = (antes?.abas_ocultas as string[] ?? []).sort().join(",");
    const after = (fields.abas_ocultas as string[]).sort().join(",");
    if (before !== after) changes.push(`abas ocultas atualizadas`);
  }

  if (changes.length > 0) {
    await logActivity(usuario, "Alterou usuario", `${antes?.nome || "?"}: ${changes.join(", ")}`, "usuarios", id);
  }

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
    role: newRole || "equipe",
    ativo: true,
    permissoes: [],
  }).select("id, nome, login, role, ativo, permissoes, created_at").single();

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return NextResponse.json({ error: "Login ja existe" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(usuario, "Criou usuario", `${nome} (${newRole || "equipe"})`, "usuarios", data?.id);

  return NextResponse.json({ ok: true, data });
}
