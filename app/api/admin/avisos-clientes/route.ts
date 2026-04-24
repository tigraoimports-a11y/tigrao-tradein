import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { annotateAvisoComEstoque, type EstoqueLinha } from "@/lib/avisos-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noCache = { "Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache" };

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest) {
  return decodeURIComponent(req.headers.get("x-admin-user") || "sistema");
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  let q = supabase.from("avisos_clientes").select("*").order("created_at", { ascending: false });
  if (status) q = q.eq("status", status);

  const [{ data, error }, estoqueRes] = await Promise.all([
    q,
    supabase.from("estoque").select("id,produto,cor,qnt,status,observacao,categoria,sku").gt("qnt", 0).eq("status", "EM ESTOQUE"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });

  const estoque = (estoqueRes.data || []) as EstoqueLinha[];
  const enriched = (data || []).map(a => {
    // a.sku existe a partir da migration Fase 3a (coluna adicionada em avisos_clientes).
    // Antes disso, fica undefined e o matching cai no fuzzy — funciona igual.
    const { matches, disponivel_qnt, matchedBySku } = annotateAvisoComEstoque(
      a.produto_desejado || "",
      estoque,
      a.sku as string | null | undefined,
    );
    return {
      ...a,
      disponivel_qnt,
      matched_by_sku: !!matchedBySku,
      estoque_matches: matches.slice(0, 5).map(m => ({
        id: m.id,
        produto: m.produto,
        cor: m.cor,
        qnt: m.qnt,
        sku: m.sku,
      })),
    };
  });

  return NextResponse.json({ data: enriched }, { headers: noCache });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const body = await req.json();
  const { nome, whatsapp, instagram, produto_desejado, observacao } = body;
  if (!nome?.trim()) return NextResponse.json({ error: "nome obrigatório" }, { status: 400, headers: noCache });
  if (!produto_desejado?.trim()) return NextResponse.json({ error: "produto_desejado obrigatório" }, { status: 400, headers: noCache });
  const { data, error } = await supabase
    .from("avisos_clientes")
    .insert({
      nome: nome.trim(),
      whatsapp: whatsapp?.trim() || null,
      instagram: instagram?.trim() || null,
      produto_desejado: produto_desejado.trim(),
      observacao: observacao?.trim() || null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  await logActivity(usuario, "Aviso cliente criado", `${nome} — ${produto_desejado}`, "clientes", data.id);
  return NextResponse.json({ ok: true, data }, { headers: noCache });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const body = await req.json();
  const { id, nome, whatsapp, instagram, produto_desejado, observacao, status } = body;
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400, headers: noCache });
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (nome !== undefined) upd.nome = nome;
  if (whatsapp !== undefined) upd.whatsapp = whatsapp || null;
  if (instagram !== undefined) upd.instagram = instagram || null;
  if (produto_desejado !== undefined) upd.produto_desejado = produto_desejado;
  if (observacao !== undefined) upd.observacao = observacao || null;
  if (status !== undefined) {
    upd.status = status;
    if (status === "NOTIFICADO") upd.notificado_em = new Date().toISOString();
  }
  const { error } = await supabase.from("avisos_clientes").update(upd).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  await logActivity(usuario, "Aviso cliente atualizado", `id=${id}`, "clientes", id);
  return NextResponse.json({ ok: true }, { headers: noCache });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400, headers: noCache });
  const { error } = await supabase.from("avisos_clientes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });
  await logActivity(usuario, "Aviso cliente removido", `id=${id}`, "clientes", id);
  return NextResponse.json({ ok: true }, { headers: noCache });
}
