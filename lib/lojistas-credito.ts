import { supabase } from "@/lib/supabase";

/** Normaliza nome: tira acentos, colapsa espaços, upper. Garante match 1-pra-1 entre UIs. */
function normalizeNome(n: string | null | undefined): string {
  return (n || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Normaliza a chave do cliente: prioriza CPF/CNPJ (só dígitos); senão nome normalizado. */
export function buildClienteKey(p: { cpf?: string | null; cnpj?: string | null; nome?: string | null }): string {
  const onlyDigits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");
  const cpf = onlyDigits(p.cpf);
  if (cpf) return `cpf:${cpf}`;
  const cnpj = onlyDigits(p.cnpj);
  if (cnpj) return `cnpj:${cnpj}`;
  return `nome:${normalizeNome(p.nome)}`;
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
      cpf: cliente.cpf || null,
      cnpj: cliente.cnpj || null,
      saldo: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return inserted;
}

/** Aplica movimentação (CREDITO/DEBITO/AJUSTE). */
export async function moverCredito(params: {
  cliente: { nome: string; cpf?: string | null; cnpj?: string | null };
  tipo: "CREDITO" | "DEBITO" | "AJUSTE";
  valor: number;
  venda_id?: string | null;
  motivo?: string;
  usuario?: string;
}) {
  if (!params.valor || params.valor <= 0) throw new Error("valor deve ser > 0");
  const key = buildClienteKey(params.cliente);
  // Delega pra function SQL — garante atomicidade e SELECT FOR UPDATE
  const { data, error } = await supabase.rpc("mover_credito_lojista", {
    p_cliente_key: key,
    p_nome: params.cliente.nome,
    p_cpf: params.cliente.cpf || null,
    p_cnpj: params.cliente.cnpj || null,
    p_tipo: params.tipo,
    p_valor: params.valor,
    p_venda_id: params.venda_id || null,
    p_motivo: params.motivo || null,
    p_usuario: params.usuario || "sistema",
  });
  if (error) {
    // Fallback pro caminho antigo caso a function SQL ainda não foi criada
    console.error("[moverCredito] RPC falhou, usando fallback upsert:", error.message);
    const { data: existing } = await supabase
      .from("lojistas_credito")
      .select("id, saldo")
      .eq("cliente_key", key)
      .maybeSingle();
    const saldoAntes = Number(existing?.saldo || 0);
    let saldoDepois = saldoAntes;
    if (params.tipo === "CREDITO") saldoDepois = saldoAntes + params.valor;
    else if (params.tipo === "DEBITO") saldoDepois = saldoAntes - params.valor;
    else saldoDepois = params.valor;
    if (params.tipo === "DEBITO" && saldoDepois < 0) {
      throw new Error(`Saldo insuficiente. Disponível: R$ ${saldoAntes}, tentativa: R$ ${params.valor}`);
    }
    const { data: upserted, error: upErr } = await supabase
      .from("lojistas_credito")
      .upsert({
        cliente_key: key, nome: params.cliente.nome,
        cpf: params.cliente.cpf || null, cnpj: params.cliente.cnpj || null,
        saldo: saldoDepois, updated_at: new Date().toISOString(),
      }, { onConflict: "cliente_key" })
      .select("id").single();
    if (upErr) throw new Error(`upsert falhou: ${upErr.message}`);
    if (!upserted?.id) throw new Error("upsert nao retornou id");
    await supabase.from("lojistas_credito_log").insert({
      lojista_id: upserted.id, venda_id: params.venda_id || null,
      tipo: params.tipo, valor: params.valor,
      saldo_antes: saldoAntes, saldo_depois: saldoDepois,
      motivo: params.motivo || null, usuario: params.usuario || "sistema",
    });
    return { saldoAntes, saldoDepois, lojista_id: upserted.id, cliente_key: key };
  }
  const r = (data || {}) as { lojista_id: string; saldo_antes: number; saldo_depois: number; cliente_key: string };
  return { saldoAntes: Number(r.saldo_antes || 0), saldoDepois: Number(r.saldo_depois || 0), lojista_id: r.lojista_id, cliente_key: r.cliente_key };
}
