import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { buildClienteKey, moverCredito } from "@/lib/lojistas-credito";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest) {
  return decodeURIComponent(req.headers.get("x-admin-user") || "sistema");
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
  // Tenta achar por cpf, depois cnpj, depois nome (ordem de prioridade)
  const keys: string[] = [];
  if (cpf) keys.push(buildClienteKey({ cpf }));
  if (cnpj) keys.push(buildClienteKey({ cnpj }));
  if (nome) keys.push(buildClienteKey({ nome }));
  let lojista: Record<string, unknown> | null = null;
  for (const k of keys) {
    const { data } = await supabase
      .from("lojistas_credito")
      .select("*")
      .eq("cliente_key", k)
      .maybeSingle();
    if (data) { lojista = data; break; }
  }
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
