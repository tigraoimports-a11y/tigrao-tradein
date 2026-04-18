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

/**
 * GET: lista funcionarios.
 * Query: ?tag=TIGRAO (default), ?ativo=true/false (default: all), ?cargo=DONO/FUNCIONARIO/ENTREGADOR
 */
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");
    const ativo = url.searchParams.get("ativo");
    const cargo = url.searchParams.get("cargo");
    let q = supabase.from("funcionarios").select("*").order("cargo").order("nome");
    if (tag) q = q.eq("tag", tag);
    if (ativo !== null) q = q.eq("ativo", ativo === "true");
    if (cargo) q = q.eq("cargo", cargo);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST: cria funcionario.
 * Body: { nome, cargo, tag?, telefone?, email?, observacao?, data_admissao? }
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  try {
    const body = await req.json();
    const { nome, cargo, tag, telefone, email, observacao, data_admissao } = body;
    if (!nome?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    if (!["DONO", "FUNCIONARIO", "ENTREGADOR"].includes(cargo)) return NextResponse.json({ error: "Cargo inválido" }, { status: 400 });

    const { data, error } = await supabase.from("funcionarios").insert({
      nome: nome.trim(),
      cargo,
      tag: tag || "TIGRAO",
      telefone: telefone || null,
      email: email || null,
      observacao: observacao || null,
      data_admissao: data_admissao || null,
      ativo: true,
    }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity(usuario, "Cadastrou funcionario", `${nome} (${cargo})`, "funcionarios", data.id);
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH: atualiza funcionario.
 * Body: { id, ...campos }
 */
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fields.nome !== undefined) updatePayload.nome = String(fields.nome).trim();
    if (fields.cargo !== undefined) updatePayload.cargo = fields.cargo;
    if (fields.tag !== undefined) updatePayload.tag = fields.tag;
    if (fields.telefone !== undefined) updatePayload.telefone = fields.telefone || null;
    if (fields.email !== undefined) updatePayload.email = fields.email || null;
    if (fields.observacao !== undefined) updatePayload.observacao = fields.observacao || null;
    if (fields.data_admissao !== undefined) updatePayload.data_admissao = fields.data_admissao || null;
    if (fields.data_desligamento !== undefined) updatePayload.data_desligamento = fields.data_desligamento || null;
    if (fields.ativo !== undefined) updatePayload.ativo = !!fields.ativo;

    const { error } = await supabase.from("funcionarios").update(updatePayload).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity(usuario, "Editou funcionario", String(updatePayload.nome || id), "funcionarios", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE: soft-delete (marca como inativo). Pra hard delete, usar SQL direto.
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const { data: antes } = await supabase.from("funcionarios").select("nome").eq("id", id).single();
    const { error } = await supabase.from("funcionarios").update({
      ativo: false,
      data_desligamento: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity(usuario, "Desativou funcionario", antes?.nome || id, "funcionarios", id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
