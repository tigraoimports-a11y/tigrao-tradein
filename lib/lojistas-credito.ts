import { supabase } from "@/lib/supabase";

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
  const lojista = await getOrCreateLojista(params.cliente);
  const saldoAntes = Number(lojista.saldo || 0);
  let saldoDepois = saldoAntes;
  if (params.tipo === "CREDITO") saldoDepois = saldoAntes + params.valor;
  else if (params.tipo === "DEBITO") saldoDepois = saldoAntes - params.valor;
  else saldoDepois = params.valor;
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
