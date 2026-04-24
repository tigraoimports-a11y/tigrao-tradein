// app/api/admin/orcamentos/route.ts
// CRUD do histórico de orçamentos gerados (#13).
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noCache = { "Cache-Control": "no-store, no-cache, must-revalidate" };

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "Sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// GET — lista histórico (filtros: vendedor, status, busca, periodo)
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });

  const sp = req.nextUrl.searchParams;
  const vendedor = sp.get("vendedor");
  const status = sp.get("status");
  const search = sp.get("q");
  const limit = Math.min(parseInt(sp.get("limit") || "200", 10) || 200, 500);

  let q = supabase.from("orcamentos_historico").select("*").order("created_at", { ascending: false }).limit(limit);
  if (vendedor) q = q.eq("vendedor", vendedor);
  if (status) q = q.eq("status", status);
  if (search) q = q.or(`cliente_nome.ilike.%${search}%,cliente_telefone.ilike.%${search}%,texto_gerado.ilike.%${search}%`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });

  return NextResponse.json({ data: data || [] }, { headers: noCache });
}

// POST — cria novo orcamento no historico
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const body = await req.json();

  const {
    tipo,
    cliente_nome,
    cliente_telefone,
    itens,
    trocas,
    desconto,
    entrada,
    parcelas_selecionadas,
    valor_total,
    texto_gerado,
    observacao,
  } = body || {};

  if (!texto_gerado) {
    return NextResponse.json({ error: "texto_gerado obrigatório" }, { status: 400, headers: noCache });
  }

  const { data, error } = await supabase
    .from("orcamentos_historico")
    .insert({
      vendedor: usuario,
      tipo: tipo === "seminovo" ? "seminovo" : "lacrado",
      cliente_nome: cliente_nome?.trim() || null,
      cliente_telefone: cliente_telefone ? String(cliente_telefone).replace(/\D/g, "") || null : null,
      itens: Array.isArray(itens) ? itens : [],
      trocas: Array.isArray(trocas) ? trocas : [],
      desconto: Number(desconto) || 0,
      entrada: Number(entrada) || 0,
      parcelas_selecionadas: Array.isArray(parcelas_selecionadas) ? parcelas_selecionadas : [],
      valor_total: Number(valor_total) || 0,
      texto_gerado,
      observacao: observacao?.trim() || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });

  logActivity(usuario, "Salvou orçamento", `${data.cliente_nome || "sem cliente"} — R$ ${data.valor_total}`, "orcamentos_historico", data.id).catch(() => {});

  return NextResponse.json({ ok: true, data }, { headers: noCache });
}

// PATCH — atualizar status (virou venda, arquivado, perdido) ou observação
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const body = await req.json();
  const { id, status, venda_id, observacao } = body || {};
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400, headers: noCache });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (status) {
    if (!["ATIVO", "VIROU_VENDA", "PERDIDO", "ARQUIVADO"].includes(status)) {
      return NextResponse.json({ error: "status inválido" }, { status: 400, headers: noCache });
    }
    patch.status = status;
    patch.marcado_em = new Date().toISOString();
    patch.marcado_por = usuario;
  }
  if (venda_id !== undefined) patch.venda_id = venda_id || null;
  if (observacao !== undefined) patch.observacao = observacao?.trim() || null;

  const { error } = await supabase.from("orcamentos_historico").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });

  logActivity(usuario, "Atualizou orçamento", `id=${id} status=${status || "—"}`, "orcamentos_historico", id).catch(() => {});

  return NextResponse.json({ ok: true }, { headers: noCache });
}

// DELETE — remove permanentemente
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noCache });
  const usuario = getUsuario(req);
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400, headers: noCache });

  const { error } = await supabase.from("orcamentos_historico").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: noCache });

  logActivity(usuario, "Removeu orçamento", `id=${id}`, "orcamentos_historico", id).catch(() => {});

  return NextResponse.json({ ok: true }, { headers: noCache });
}
