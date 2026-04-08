import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest) {
  return decodeURIComponent(req.headers.get("x-admin-user") || "sistema");
}

/** Normaliza a chave do cliente: prioriza CPF/CNPJ (só dígitos); senão nome upper. */
export function buildClienteKey(p: { cpf?: string | null; cnpj?: string | null; nome?: string | null }): string {
  const onlyDigits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
  const cpf = onlyDigits(p.cpf);
  if (cpf) return `cpf:${cpf}`;
  const cnpj = onlyDigits(p.cnpj);
  if (cnpj) return `cnpj:${cnpj}`;
  return `nome:${(p.nome || "").trim().toUpperCase()}`;
}

/** Busca ou cria registro de lojista. Retorna linha. */
export async function getOrCreateLojista(cliente: { nome: string; cpf?: string | null; cnpj?: string | null }) {
  const key = buildClienteKey(cliente);
  const { data: existing } = await supabase
    .from("lojistas_credito")
    .select("*")
    .eq("cliente_key", key)
    .maybeSingle();
  if (existing) return existing;
  const { data: inserted, error } = await supabase
    .from("lojistas_credito")
    .insert({
      cliente_key: key,
      nome: cliente.nome,
      cpf: (cliente.cpf || null),
      cnpj: (cliente.cnpj || null),
      saldo: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return inserted;
}

/** Aplica movimentação (CREDITO/DEBITO/AJUSTE) atomicamente via leitura + update. */
export async function moverCredito(params: {
  cliente: { nome: string; cpf?: string | null; cnpj?: string | null };
  tipo: "CREDITO" | "DEBITO" | "AJUSTE";
  valor: number;
  venda_id?: string | null;
  motivo?: string;
  usuario?: string;
}) {
  if (!params.valor || params.valor <= 0) throw new Error("valor deve ser > 0");
  const lojista = await getOrCreateLojista(params.cliente);
  const saldoAntes = Number(lojista.saldo || 0);
  let saldoDepois = saldoAntes;
  if (params.tipo === "CREDITO") saldoDepois = saldoAntes + params.valor;
  else if (params.tipo === "DEBITO") saldoDepois = saldoAntes - params.valor;
  else saldoDepois = params.valor; // AJUSTE = define valor absoluto
  if (params.tipo === "DEBITO" && saldoDepois < 0) {
    throw new Error(`Saldo insuficiente. Disponível: R$ ${saldoAntes}, tentativa: R$ ${params.valor}`);
  }
  const { error: upErr } = await supabase
    .from("lojistas_credito")
    .update({ saldo: saldoDepois, updated_at: new Date().toISOString(), nome: params.cliente.nome })
    .eq("id", lojista.id);
  if (upErr) throw new Error(upErr.message);
  await supabase.from("lojistas_credito_log").insert({
    lojista_id: lojista.id,
    venda_id: params.venda_id || null,
    tipo: params.tipo,
    valor: params.valor,
    saldo_antes: saldoAntes,
    saldo_depois: saldoDepois,
    motivo: params.motivo || null,
    usuario: params.usuario || "sistema",
  });
  return { saldoAntes, saldoDepois, lojista_id: lojista.id };
}

// ── GET: saldo + extrato de um lojista (ou lista todos) ──
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const cpf = searchParams.get("cpf");
  const cnpj = searchParams.get("cnpj");
  const nome = searchParams.get("nome");
  if (!cpf && !cnpj && !nome) {
    // lista todos com saldo > 0
    const { data, error } = await supabase
      .from("lojistas_credito")
      .select("*")
      .gt("saldo", 0)
      .order("saldo", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lojistas: data || [] });
  }
  const key = buildClienteKey({ cpf, cnpj, nome });
  const { data: lojista } = await supabase
    .from("lojistas_credito")
    .select("*")
    .eq("cliente_key", key)
    .maybeSingle();
  if (!lojista) return NextResponse.json({ lojista: null, saldo: 0, log: [] });
  const { data: log } = await supabase
    .from("lojistas_credito_log")
    .select("*")
    .eq("lojista_id", lojista.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ lojista, saldo: Number(lojista.saldo || 0), log: log || [] });
}

// ── POST: movimentar manualmente (AJUSTE / CREDITO / DEBITO) ──
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  const body = await req.json();
  const { cliente, tipo, valor, motivo } = body;
  if (!cliente?.nome) return NextResponse.json({ error: "cliente.nome obrigatório" }, { status: 400 });
  if (!["CREDITO", "DEBITO", "AJUSTE"].includes(tipo)) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  try {
    const res = await moverCredito({ cliente, tipo, valor: Number(valor), motivo, usuario });
    await logActivity(usuario, `Crédito lojista (${tipo})`, `${cliente.nome}: R$${valor} — ${motivo || "sem motivo"}`, "clientes");
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 400 });
  }
}
