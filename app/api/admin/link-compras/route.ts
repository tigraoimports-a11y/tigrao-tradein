import { NextResponse } from "next/server";
import { logActivity } from "@/lib/activity-log";

function auth(request: Request) {
  const pw = request.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}
function getUser(request: Request) {
  const r = request.headers.get("x-admin-user") || "Sistema";
  try { return decodeURIComponent(r); } catch { return r; }
}

// GET: lista histórico com filtros
// Query params: q (busca nome/telefone/cpf), tipo (COMPRA|TROCA), arquivado (0|1|all),
//               from, to, limit, offset
export async function GET(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase } = await import("@/lib/supabase");

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const autocomplete = url.searchParams.get("autocomplete") === "1";
  const tipo = url.searchParams.get("tipo") || "";

  // Autocomplete de clientes cadastrados (vendas + link_compras + entregas)
  if (autocomplete) {
    if (!q || q.length < 2) return NextResponse.json({ clientes: [] });
    const like = `%${q}%`;
    // Para CPF/telefone: stored pode estar com ou sem pontuação.
    // Ex.: usuário digita "12345", DB tem "123.456.789-00".
    // Padrão "%1%2%3%4%5%" casa ambos os formatos.
    const qDigits = q.replace(/\D/g, "");
    const digitsLike = qDigits.length >= 3 ? `%${qDigits.split("").join("%")}%` : null;
    const cpfOrNome = (nomeCol: string, cpfCol: string, emailCol?: string) => {
      const parts = [`${nomeCol}.ilike.${like}`, `${cpfCol}.ilike.${like}`];
      if (digitsLike) parts.push(`${cpfCol}.ilike.${digitsLike}`);
      if (emailCol) parts.push(`${emailCol}.ilike.${like}`);
      return parts.join(",");
    };
    const telOrNome = (nomeCol: string, telCol: string) => {
      const parts = [`${nomeCol}.ilike.${like}`, `${telCol}.ilike.${like}`];
      if (digitsLike) parts.push(`${telCol}.ilike.${digitsLike}`);
      return parts.join(",");
    };

    // 1) vendas: nome, cpf, email, endereço
    const [vRes, lRes, eRes] = await Promise.all([
      supabase.from("vendas")
        .select("cliente, cpf, cnpj, email, endereco, bairro, cidade, uf, data")
        .or(cpfOrNome("cliente", "cpf", "email"))
        .order("data", { ascending: false })
        .limit(100),
      supabase.from("link_compras")
        .select("cliente_nome, cliente_telefone, cliente_cpf, cliente_email, created_at")
        .or([
          `cliente_nome.ilike.${like}`,
          `cliente_telefone.ilike.${like}`,
          `cliente_cpf.ilike.${like}`,
          ...(digitsLike ? [`cliente_telefone.ilike.${digitsLike}`, `cliente_cpf.ilike.${digitsLike}`] : []),
        ].join(","))
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("entregas")
        .select("cliente, telefone, endereco, bairro, created_at")
        .or(telOrNome("cliente", "telefone"))
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    type Cli = { nome: string; telefone: string | null; cpf: string | null; email: string | null; endereco: string | null; bairro: string | null; cidade: string | null; uf: string | null };
    const map = new Map<string, Cli>();
    const keyOf = (nome: string, cpf: string | null, tel: string | null) =>
      `${(nome || "").toLowerCase().trim()}|${(cpf || "").replace(/\D/g, "")}|${(tel || "").replace(/\D/g, "")}`;
    const mergeInto = (c: Cli) => {
      const k = keyOf(c.nome, c.cpf, c.telefone);
      const ex = map.get(k);
      if (!ex) { map.set(k, c); return; }
      ex.telefone = ex.telefone || c.telefone;
      ex.cpf = ex.cpf || c.cpf;
      ex.email = ex.email || c.email;
      ex.endereco = ex.endereco || c.endereco;
      ex.bairro = ex.bairro || c.bairro;
      ex.cidade = ex.cidade || c.cidade;
      ex.uf = ex.uf || c.uf;
    };

    for (const v of vRes.data || []) {
      if (!v.cliente) continue;
      mergeInto({ nome: v.cliente, telefone: null, cpf: v.cpf || null, email: v.email || null, endereco: v.endereco || null, bairro: v.bairro || null, cidade: v.cidade || null, uf: v.uf || null });
    }
    for (const l of lRes.data || []) {
      if (!l.cliente_nome) continue;
      mergeInto({ nome: l.cliente_nome, telefone: l.cliente_telefone || null, cpf: l.cliente_cpf || null, email: l.cliente_email || null, endereco: null, bairro: null, cidade: null, uf: null });
    }
    for (const e of eRes.data || []) {
      if (!e.cliente) continue;
      mergeInto({ nome: e.cliente, telefone: e.telefone || null, cpf: null, email: null, endereco: e.endereco || null, bairro: e.bairro || null, cidade: null, uf: null });
    }

    const clientes = Array.from(map.values()).slice(0, 20);
    return NextResponse.json({ clientes });
  }

  const arquivado = url.searchParams.get("arquivado") || "0";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "200"), 500);
  const offset = parseInt(url.searchParams.get("offset") || "0");

  let query = supabase
    .from("link_compras")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (arquivado === "0") query = query.eq("arquivado", false);
  else if (arquivado === "1") query = query.eq("arquivado", true);

  if (tipo === "COMPRA" || tipo === "TROCA") query = query.eq("tipo", tipo);
  if (url.searchParams.get("preenchidos") === "1") {
    // Se incluir_simulador=1, também retorna link_compras auto-criados pelo
    // simulador de trade-in (operador=Simulador), mesmo que o cliente tenha
    // enviado o formulário só via WhatsApp (sem POST de preenchimento).
    if (url.searchParams.get("incluir_simulador") === "1") {
      query = query.or("cliente_preencheu_em.not.is.null,operador.eq.Simulador");
    } else {
      query = query.not("cliente_preencheu_em", "is", null);
    }
  }
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to + "T23:59:59");

  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `cliente_nome.ilike.${like},cliente_telefone.ilike.${like},cliente_cpf.ilike.${like},produto.ilike.${like},short_code.ilike.${like}`
    );
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Heal orphan entrega_id: entregas podem ter sido apagadas.
  const rows = data ?? [];
  const entregaIds = Array.from(new Set(rows.map(r => r.entrega_id).filter(Boolean))) as string[];
  if (entregaIds.length) {
    const { data: ex } = await supabase.from("entregas").select("id").in("id", entregaIds);
    const alive = new Set((ex || []).map(e => e.id));
    const orphans = entregaIds.filter(id => !alive.has(id));
    if (orphans.length) {
      await supabase.from("link_compras").update({ entrega_id: null, status: "PREENCHIDO" }).in("entrega_id", orphans);
      for (const r of rows) if (r.entrega_id && !alive.has(r.entrega_id)) { r.entrega_id = null; r.status = "PREENCHIDO"; }
    }
  }

  return NextResponse.json({ data: rows, total: count ?? 0 });
}

// POST: criar registro — chamado pelo /gerar-link após gerar o short_code
export async function POST(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { supabase } = await import("@/lib/supabase");

  const payload = {
    short_code: body.short_code,
    url_curta: body.url_curta || null,
    tipo: body.tipo === "TROCA" ? "TROCA" : "COMPRA",
    cliente_nome: body.cliente_nome || null,
    cliente_telefone: body.cliente_telefone || null,
    cliente_cpf: body.cliente_cpf || null,
    cliente_email: body.cliente_email || null,
    produto: body.produto || "",
    produtos_extras: body.produtos_extras ? JSON.stringify(body.produtos_extras) : null,
    cor: body.cor || null,
    valor: Number(body.valor) || 0,
    forma_pagamento: body.forma_pagamento || null,
    parcelas: body.parcelas || null,
    entrada: Number(body.entrada) || 0,
    troca_produto: body.troca_produto || null,
    troca_valor: Number(body.troca_valor) || 0,
    troca_condicao: body.troca_condicao || null,
    troca_cor: body.troca_cor || null,
    troca_produto2: body.troca_produto2 || null,
    troca_valor2: Number(body.troca_valor2) || 0,
    troca_condicao2: body.troca_condicao2 || null,
    troca_cor2: body.troca_cor2 || null,
    desconto: Number(body.desconto) || 0,
    vendedor: body.vendedor || null,
    operador: getUser(request),
    simulacao_id: body.simulacao_id || null,
    observacao: body.observacao || null,
    pagamento_pago: body.pagamento_pago || null,
    // Campos específicos quando o link é criado via Mercado Pago
    mp_link: body.mp_link || null,
    mp_preference_id: body.mp_preference_id || null,
  };

  if (!payload.short_code || !payload.produto) {
    return NextResponse.json({ error: "short_code e produto são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase.from("link_compras").insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  logActivity(getUser(request), "Gerou link de compra", `${payload.tipo} — ${payload.produto}`, "link_compras", data.id).catch(() => {});
  return NextResponse.json({ ok: true, data });
}

// PATCH: arquivar / editar
export async function PATCH(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, ...patch } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { supabase } = await import("@/lib/supabase");

  const allowed: Record<string, unknown> = {};
  const editableFields = [
    "arquivado", "status", "observacao",
    "cliente_nome", "cliente_telefone", "cliente_cpf", "cliente_email",
    "produto", "cor", "valor", "desconto", "forma_pagamento", "parcelas", "entrada",
    "produtos_extras",
    "troca_produto", "troca_valor", "troca_condicao", "troca_cor",
    "troca_produto2", "troca_valor2", "troca_condicao2", "troca_cor2",
    "vendedor", "entrega_id", "cliente_dados_preenchidos", "cliente_preencheu_em",
    "pagamento_pago",
    "mp_link", "mp_preference_id",
  ];
  for (const k of editableFields) {
    if (k in patch) allowed[k] = patch[k];
  }
  // produtos_extras deve ser salvo como JSON string
  if (allowed.produtos_extras && Array.isArray(allowed.produtos_extras)) {
    allowed.produtos_extras = JSON.stringify(allowed.produtos_extras);
  }
  allowed.updated_at = new Date().toISOString();

  const { error } = await supabase.from("link_compras").update(allowed).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logActivity(getUser(request), "Atualizou link de compra", `ID ${id}`, "link_compras", id).catch(() => {});
  return NextResponse.json({ ok: true });
}

// DELETE: remover definitivamente (prefira PATCH arquivado=true)
export async function DELETE(request: Request) {
  if (!auth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { supabase } = await import("@/lib/supabase");
  const { error } = await supabase.from("link_compras").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  logActivity(getUser(request), "Removeu link de compra", `ID ${id}`, "link_compras", id).catch(() => {});
  return NextResponse.json({ ok: true });
}
