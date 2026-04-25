import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAccounts } from "@/lib/pluggy";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/admin/bancos/sync
// Body: { conexao_id?: number }   ← se passado, sync so essa. senao TODAS ativas.
//
// Faz pull dos saldos atualizados das conexoes Pluggy ativas.
// Insere nova row em bancos_saldos_historico pra cada conta de cada conexao.
//
// Retorna resumo: { atualizadas, erros, detalhes[] }
//
// Auth: x-admin-password

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const conexaoIdEspecifica: number | undefined = body.conexao_id;

  const supabase = getSupabase();

  let query = supabase.from("bancos_conexoes").select("*").eq("ativo", true);
  if (conexaoIdEspecifica) {
    query = query.eq("id", conexaoIdEspecifica);
  }

  const { data: conexoes, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!conexoes || conexoes.length === 0) {
    return NextResponse.json({ atualizadas: 0, erros: 0, detalhes: [], message: "Nenhuma conexao ativa" });
  }

  let atualizadas = 0;
  let erros = 0;
  const detalhes: Array<{ conexao_id: number; banco: string; status: string; contas?: number; erro?: string }> = [];

  // Processa em serie pra nao explodir rate limit Pluggy.
  // 6 conexoes × 2s = 12s, dentro do maxDuration=60.
  for (const c of conexoes) {
    try {
      const accounts = await getAccounts(c.pluggy_item_id);
      const inserts = accounts.map((acc) => ({
        conexao_id: c.id,
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
        const { error: insErr } = await supabase.from("bancos_saldos_historico").insert(inserts);
        if (insErr) throw new Error(insErr.message);
      }
      await supabase.from("bancos_conexoes").update({
        ultimo_sync_em: new Date().toISOString(),
        ultimo_sync_status: "OK",
        ultimo_sync_erro: null,
        atualizado_em: new Date().toISOString(),
      }).eq("id", c.id);
      atualizadas++;
      detalhes.push({ conexao_id: c.id, banco: c.banco_nome, status: "OK", contas: inserts.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[bancos/sync] conexao=${c.id} (${c.banco_nome}):`, msg);
      await supabase.from("bancos_conexoes").update({
        ultimo_sync_em: new Date().toISOString(),
        ultimo_sync_status: "ERRO",
        ultimo_sync_erro: msg.slice(0, 500),
        atualizado_em: new Date().toISOString(),
      }).eq("id", c.id);
      erros++;
      detalhes.push({ conexao_id: c.id, banco: c.banco_nome, status: "ERRO", erro: msg });
    }
  }

  return NextResponse.json({ atualizadas, erros, total: conexoes.length, detalhes });
}
