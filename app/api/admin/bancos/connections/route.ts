import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getItem, aliasParaConnectorName, getAccounts } from "@/lib/pluggy";

export const runtime = "nodejs";
export const maxDuration = 30;

// GET /api/admin/bancos/connections
//   → lista todas conexoes ativas com saldos atuais (do banco local) +
//     ultimo sync info
//
// POST /api/admin/bancos/connections
//   Body: { itemId: string }
//   → registra uma nova conexao apos o widget Pluggy ter retornado itemId.
//     Busca metadados do item na Pluggy + salva em bancos_conexoes +
//     ja faz o primeiro fetch de accounts pra popular saldos_historico.
//
// DELETE /api/admin/bancos/connections?id=N
//   → marca conexao como ativo=false (nao deleta do Pluggy — admin pode
//     reativar dps. Pra deletar de verdade, ir no painel Pluggy)
//
// Auth: x-admin-password

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();

  // Busca conexoes ativas
  const { data: conexoes, error: errConn } = await supabase
    .from("bancos_conexoes")
    .select("*")
    .eq("ativo", true)
    .order("criado_em", { ascending: false });

  if (errConn) {
    return NextResponse.json({ error: errConn.message }, { status: 500 });
  }

  if (!conexoes || conexoes.length === 0) {
    return NextResponse.json({ conexoes: [], saldoTotal: 0 });
  }

  // Pra cada conexao, busca o saldo MAIS RECENTE de cada conta
  // (uma conexao = 1 banco, pode ter varias contas: corrente + cartao)
  const conexaoIds = conexoes.map((c) => c.id);
  const { data: saldos, error: errSaldos } = await supabase
    .from("bancos_saldos_historico")
    .select("*")
    .in("conexao_id", conexaoIds)
    .order("consultado_em", { ascending: false });

  if (errSaldos) {
    return NextResponse.json({ error: errSaldos.message }, { status: 500 });
  }

  // Agrupa por conexao_id + pluggy_account_id, pega so o mais recente de cada
  const saldosUltimos = new Map<string, typeof saldos[number]>();
  for (const s of saldos || []) {
    const key = `${s.conexao_id}:${s.pluggy_account_id}`;
    if (!saldosUltimos.has(key)) {
      saldosUltimos.set(key, s);
    }
  }

  // Monta resposta agregada
  const conexoesComSaldos = conexoes.map((c) => {
    const contas = Array.from(saldosUltimos.values())
      .filter((s) => s.conexao_id === c.id)
      .map((s) => ({
        accountId: s.pluggy_account_id,
        accountName: s.account_name,
        accountType: s.account_type,
        accountSubtype: s.account_subtype,
        saldo: Number(s.saldo),
        creditLimite: s.credit_limite ? Number(s.credit_limite) : null,
        consultadoEm: s.consultado_em,
      }));
    // Soma saldos so de contas BANK (cartao de credito nao soma — e divida)
    const saldoTotal = contas
      .filter((c) => c.accountType !== "CREDIT")
      .reduce((sum, c) => sum + c.saldo, 0);
    return { ...c, contas, saldoTotal };
  });

  // Total geral somando todos os saldos de conta corrente
  const saldoTotal = conexoesComSaldos.reduce((sum, c) => sum + c.saldoTotal, 0);

  return NextResponse.json({ conexoes: conexoesComSaldos, saldoTotal });
}

export async function POST(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const itemId: string = body.itemId;
  if (!itemId) {
    return NextResponse.json({ error: "Passe { itemId }" }, { status: 400 });
  }

  try {
    // Busca metadados do item no Pluggy
    const item = await getItem(itemId);
    const alias = aliasParaConnectorName(item.connector?.name || "OUTRO");

    const supabase = getSupabase();

    // Insert ou update se ja existir (admin pode reconectar mesmo banco)
    const { data: conexao, error: upsertErr } = await supabase
      .from("bancos_conexoes")
      .upsert({
        pluggy_item_id: item.id,
        banco_alias: alias,
        banco_nome: item.connector?.name || "Banco",
        status: item.status,
        connector_id: item.connector?.id || null,
        connector_image_url: item.connector?.imageUrl || null,
        connector_primary_color: item.connector?.primaryColor || null,
        ativo: true,
        atualizado_em: new Date().toISOString(),
      }, { onConflict: "pluggy_item_id" })
      .select()
      .single();

    if (upsertErr || !conexao) {
      return NextResponse.json({ error: upsertErr?.message || "Falha ao salvar conexao" }, { status: 500 });
    }

    // Ja faz o primeiro fetch de accounts pra popular saldos_historico
    let contasSync = 0;
    try {
      const accounts = await getAccounts(itemId);
      const inserts = accounts.map((acc) => ({
        conexao_id: conexao.id,
        pluggy_account_id: acc.id,
        account_type: acc.type,
        account_subtype: acc.subtype,
        account_name: acc.marketingName || acc.name,
        saldo: acc.balance,
        credit_limite: acc.creditData?.creditLimit || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        raw: acc as any,
      }));
      if (inserts.length > 0) {
        await supabase.from("bancos_saldos_historico").insert(inserts);
        contasSync = inserts.length;
      }
      await supabase.from("bancos_conexoes").update({
        ultimo_sync_em: new Date().toISOString(),
        ultimo_sync_status: "OK",
        ultimo_sync_erro: null,
      }).eq("id", conexao.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase.from("bancos_conexoes").update({
        ultimo_sync_em: new Date().toISOString(),
        ultimo_sync_status: "ERRO",
        ultimo_sync_erro: msg.slice(0, 500),
      }).eq("id", conexao.id);
    }

    return NextResponse.json({ ok: true, conexao, contasSync });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Passe ?id=" }, { status: 400 });

  const supabase = getSupabase();
  const { error } = await supabase
    .from("bancos_conexoes")
    .update({ ativo: false, atualizado_em: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
