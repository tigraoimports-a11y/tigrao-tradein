import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noCacheHeaders = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" };

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest) {
  return decodeURIComponent(req.headers.get("x-admin-user") || "sistema");
}

// ── GET: lista todos os lojistas cadastrados ──
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCacheHeaders });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (id) {
    const { data: lojista, error } = await supabase.from("lojistas").select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCacheHeaders });
    if (!lojista) return NextResponse.json({ lojista: null, log: [] }, { headers: noCacheHeaders });
    const { data: log } = await supabase
      .from("lojistas_movimentacoes")
      .select("*")
      .eq("lojista_id", id)
      .order("created_at", { ascending: false })
      .limit(100);
    return NextResponse.json({ lojista, log: log || [] }, { headers: noCacheHeaders });
  }
  const { data, error } = await supabase.from("lojistas").select("*").order("nome");
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCacheHeaders });
  return NextResponse.json({ lojistas: data || [], _count: data?.length ?? 0 }, { headers: noCacheHeaders });
}

// ── POST: cria novo lojista OU movimenta saldo ──
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCacheHeaders });
  const usuario = getUsuario(req);
  const body = await req.json();

  // Movimentar saldo: requer lojista_id + tipo + valor
  if (body.action === "mover_saldo") {
    const { lojista_id, tipo, valor, motivo, venda_id } = body;
    if (!lojista_id) return NextResponse.json({ error: "lojista_id obrigatório" }, { status: 400, headers: noCacheHeaders });
    if (!["CREDITO", "DEBITO", "AJUSTE"].includes(tipo)) return NextResponse.json({ error: "tipo inválido" }, { status: 400, headers: noCacheHeaders });
    const { data, error } = await supabase.rpc("mover_saldo_lojista", {
      p_lojista_id: lojista_id,
      p_tipo: tipo,
      p_valor: Number(valor),
      p_venda_id: venda_id || null,
      p_motivo: motivo || null,
      p_usuario: usuario,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400, headers: noCacheHeaders });
    await logActivity(usuario, `Saldo lojista (${tipo})`, `id=${lojista_id}: R$${valor}`, "clientes");
    return NextResponse.json({ ok: true, ...(data as object) }, { headers: noCacheHeaders });
  }

  // Cadastrar novo lojista
  const { nome, cpf, cnpj, observacao } = body;
  if (!nome?.trim()) return NextResponse.json({ error: "nome obrigatório" }, { status: 400, headers: noCacheHeaders });
  const { data, error } = await supabase
    .from("lojistas")
    .insert({ nome: nome.trim(), cpf: cpf || null, cnpj: cnpj || null, observacao: observacao || null, saldo_credito: 0 })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCacheHeaders });
  await logActivity(usuario, "Cadastrou lojista", nome.trim(), "clientes", data.id);
  return NextResponse.json({ ok: true, lojista: data }, { headers: noCacheHeaders });
}

// ── PATCH: edita nome/cpf/cnpj ──
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCacheHeaders });
  const body = await req.json();
  const { id, nome, cpf, cnpj, observacao } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400, headers: noCacheHeaders });
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nome !== undefined) upd.nome = nome;
  if (cpf !== undefined) upd.cpf = cpf || null;
  if (cnpj !== undefined) upd.cnpj = cnpj || null;
  if (observacao !== undefined) upd.observacao = observacao || null;
  const { error } = await supabase.from("lojistas").update(upd).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCacheHeaders });
  return NextResponse.json({ ok: true }, { headers: noCacheHeaders });
}

// ── DELETE: remove lojista (cascade no log) ──
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCacheHeaders });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400, headers: noCacheHeaders });
  const { error } = await supabase.from("lojistas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCacheHeaders });
  return NextResponse.json({ ok: true }, { headers: noCacheHeaders });
}
