import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

// Renomeia / atualiza dados de um cliente em massa. Antes o /admin/clientes
// fazia isso com um loop de N vendas * 2 requests — quando o cliente tinha
// 85 compras, eram 170 requests sequenciais e a UI travava. Pior: o fetch
// direto ao Supabase REST tinha a service_role key HARDCODED no bundle do
// browser (leak de seguranca).
//
// Body esperado:
// {
//   nomeAntigo: string,   // nome atual do cliente/lojista (case-insensitive, normalized)
//   nomeNovo?: string,    // novo nome (se for so atualizar outros campos, omite)
//   cpf?: string, email?: string, bairro?: string, cidade?: string, uf?: string
// }

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest) {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function normalizar(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase } = await import("@/lib/supabase");
  const body = await req.json();
  const { nomeAntigo, nomeNovo } = body as { nomeAntigo?: string; nomeNovo?: string };
  if (!nomeAntigo) return NextResponse.json({ error: "nomeAntigo obrigatorio" }, { status: 400 });

  const campos: Record<string, string | null> = {};
  if (nomeNovo && nomeNovo.trim() && nomeNovo.trim().toUpperCase() !== nomeAntigo.trim().toUpperCase()) {
    campos.cliente = nomeNovo.trim().toUpperCase();
  }
  for (const k of ["cpf", "email", "bairro", "cidade", "uf"] as const) {
    if (k in body) campos[k] = (body[k] as string) || null;
  }
  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "Nenhum campo pra atualizar" }, { status: 400 });
  }

  const antigoNorm = normalizar(nomeAntigo);

  // Busca todas as vendas do cliente (match normalizado) de uma vez
  const { data: vendasAntigas, error: selErr } = await supabase
    .from("vendas")
    .select("id, cliente")
    .not("cliente", "is", null);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });

  const ids = (vendasAntigas || [])
    .filter(v => normalizar((v as { cliente: string }).cliente) === antigoNorm)
    .map(v => (v as { id: string }).id);

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, atualizadas: 0, aviso: "Nenhuma venda com esse nome" });
  }

  // Um unico UPDATE WHERE id IN (...) — em vez de 85 PATCHs
  const { data: atualizadas, error: updErr } = await supabase
    .from("vendas")
    .update(campos)
    .in("id", ids)
    .select("id");
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logActivity(
    getUsuario(req),
    "Atualizou cadastro cliente",
    `${nomeAntigo} (${atualizadas?.length || 0} vendas) → ${JSON.stringify(campos)}`,
    "vendas",
    ids[0],
  ).catch(() => {});

  return NextResponse.json({ ok: true, atualizadas: atualizadas?.length || 0 });
}
