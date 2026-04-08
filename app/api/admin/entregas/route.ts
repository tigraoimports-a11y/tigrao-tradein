import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const searchClientes = searchParams.get("search_clientes")?.trim() || "";

  // Autocomplete de clientes — busca em entregas E vendas, retorna última compra
  if (searchClientes) {
    const like = `%${searchClientes}%`;

    // Busca em entregas (por nome/telefone)
    const { data: entregasMatch, error: errEntregas } = await supabase
      .from("entregas")
      .select("cliente, telefone, endereco, bairro, regiao, data_entrega, produto")
      .or(`cliente.ilike.${like},telefone.ilike.${like}`)
      .order("data_entrega", { ascending: false })
      .limit(200);
    if (errEntregas) return NextResponse.json({ error: errEntregas.message }, { status: 500 });

    // Busca em vendas (por nome/telefone — vendas tem 'cliente' e recebimento no formato string)
    const { data: vendasMatch, error: errVendas } = await supabase
      .from("vendas")
      .select("cliente, recebimento, endereco, bairro, produto, data, preco_vendido")
      .or(`cliente.ilike.${like},recebimento.ilike.${like}`)
      .order("data", { ascending: false })
      .limit(200);
    if (errVendas) return NextResponse.json({ error: errVendas.message }, { status: 500 });

    type ClienteSug = {
      cliente: string;
      telefone: string | null;
      endereco: string | null;
      bairro: string | null;
      regiao: string | null;
      ultima_compra: { produto: string | null; data: string | null; valor: number | null } | null;
    };

    // Normaliza chave por nome+telefone (só dígitos)
    const keyFor = (nome: string | null, tel: string | null) =>
      `${(nome || "").toLowerCase().trim()}|${(tel || "").replace(/\D/g, "")}`;

    // Mescla as duas fontes, priorizando a ordenação mais recente de cada
    const acc = new Map<string, ClienteSug>();

    // Primeiro entregas (tem endereco/bairro/regiao bons)
    for (const r of entregasMatch || []) {
      const key = keyFor(r.cliente, r.telefone);
      if (!key || key === "|") continue;
      if (!acc.has(key)) {
        acc.set(key, {
          cliente: r.cliente,
          telefone: r.telefone,
          endereco: r.endereco,
          bairro: r.bairro,
          regiao: r.regiao,
          ultima_compra: null,
        });
      }
    }

    // Depois vendas — preenche dados faltantes e popula ultima_compra
    for (const v of vendasMatch || []) {
      const key = keyFor(v.cliente, v.recebimento);
      if (!key || key === "|") continue;
      let sug = acc.get(key);
      if (!sug) {
        sug = {
          cliente: v.cliente,
          telefone: v.recebimento,
          endereco: v.endereco,
          bairro: v.bairro,
          regiao: null,
          ultima_compra: null,
        };
        acc.set(key, sug);
      } else {
        // completa dados que estavam faltando
        if (!sug.endereco && v.endereco) sug.endereco = v.endereco;
        if (!sug.bairro && v.bairro) sug.bairro = v.bairro;
      }
      // Última compra = primeira venda retornada (já ordenada desc por data)
      if (!sug.ultima_compra && v.produto) {
        sug.ultima_compra = {
          produto: v.produto,
          data: v.data || null,
          valor: v.preco_vendido != null ? Number(v.preco_vendido) : null,
        };
      }
    }

    const unique = Array.from(acc.values()).slice(0, 20);
    return NextResponse.json({ clientes: unique });
  }

  let query = supabase
    .from("entregas")
    .select("*")
    .order("data_entrega", { ascending: true })
    .order("horario", { ascending: true });

  if (from) query = query.gte("data_entrega", from);
  if (to) query = query.lte("data_entrega", to);

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { cliente, telefone, endereco, bairro, data_entrega, horario, status, entregador, observacao, venda_id, produto, tipo, detalhes_upgrade, forma_pagamento, valor, vendedor, regiao } = body;

  if (!cliente || !data_entrega) {
    return NextResponse.json({ error: "Cliente e data_entrega obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("entregas")
    .insert({
      cliente,
      telefone: telefone || null,
      endereco: endereco || null,
      bairro: bairro || null,
      data_entrega,
      horario: horario || null,
      status: status || "PENDENTE",
      entregador: entregador || null,
      observacao: observacao || null,
      venda_id: venda_id || null,
      produto: produto || null,
      tipo: tipo || null,
      detalhes_upgrade: detalhes_upgrade || null,
      forma_pagamento: forma_pagamento || null,
      valor: valor != null ? valor : null,
      vendedor: vendedor || null,
      regiao: regiao || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Criou entrega", `Cliente: ${cliente}, Data: ${data_entrega}`, "entrega", data?.id).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  // Add updated_at
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("entregas")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Atualizou entrega", `Status: ${updates.status || "atualizado"}`, "entrega", id).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { id } = body;

  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  // Limpa vínculo em link_compras antes de remover a entrega,
  // para que o link possa ser reencaminhado.
  await supabase
    .from("link_compras")
    .update({ entrega_id: null, status: "PREENCHIDO", updated_at: new Date().toISOString() })
    .eq("entrega_id", id);

  const { error } = await supabase
    .from("entregas")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usuario = (() => { const r = req.headers.get("x-admin-user") || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
  logActivity(usuario, "Removeu entrega", `ID: ${id}`, "entrega", id).catch(() => {});

  return NextResponse.json({ ok: true });
}
