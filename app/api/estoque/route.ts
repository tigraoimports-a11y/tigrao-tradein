import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { recalcBalancos } from "@/lib/recalc-balancos";
import { getModeloBase } from "@/lib/produto-display";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

function getRole(req: NextRequest): string {
  return req.headers.get("x-admin-role") || "admin";
}

function getPermissoes(req: NextRequest): string[] {
  try { return JSON.parse(req.headers.get("x-admin-permissoes") || "[]"); } catch { return []; }
}

/** Normaliza nomes de produto antes de salvar no estoque.
 *  Ex: "Apple Watch SE 46MM GPS" → "Apple Watch Series 11 46MM GPS" */
function normalizeProdutoNome(nome: string): string {
  // Apple Watch SE 42mm/46mm → Series 11
  return nome.replace(/\bApple\s+Watch\s+SE\b(\s+(?:4[26])\s*mm)/gi, "Apple Watch Series 11$1");
}

async function logEstoque(usuario: string, acao: string, produtoId: string | null, produtoNome: string, campo: string, valorAnterior: string, valorNovo: string) {
  await supabase.from("estoque_log").insert({
    usuario, acao, produto_id: produtoId, produto_nome: produtoNome, campo,
    valor_anterior: valorAnterior, valor_novo: valorNovo,
  });
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");
  const action = searchParams.get("action");
  const imeiSearch = searchParams.get("imei");

  // Buscar por IMEI
  if (imeiSearch) {
    const { data: estoqueItems } = await supabase
      .from("estoque")
      .select("*")
      .ilike("imei", `%${imeiSearch}%`)
      .limit(50);

    const { data: vendaItems } = await supabase
      .from("vendas")
      .select("*")
      .ilike("imei", `%${imeiSearch}%`)
      .limit(50);

    return NextResponse.json({ estoque: estoqueItems ?? [], vendas: vendaItems ?? [] });
  }

  // Buscar entrada (produtos do mesmo fornecedor + data)
  if (action === "entrada") {
    const data = searchParams.get("data");
    const fornecedor = searchParams.get("fornecedor");
    if (!data || !fornecedor) return NextResponse.json({ error: "data e fornecedor obrigatorios" }, { status: 400 });
    let query = supabase.from("estoque").select("*")
      .eq("fornecedor", fornecedor)
      .order("produto");
    // Tentar por data_entrada primeiro, senão data_compra
    const { data: byEntrada } = await query.eq("data_entrada", data);
    if (byEntrada && byEntrada.length > 0) {
      return NextResponse.json({ data: byEntrada });
    }
    const { data: byCompra } = await supabase.from("estoque").select("*").eq("fornecedor", fornecedor).eq("data_compra", data).order("produto");
    return NextResponse.json({ data: byCompra ?? [] });
  }

  // Historico de movimentações
  if (action === "historico") {
    const limit = parseInt(searchParams.get("limit") || "100");
    const { data } = await supabase.from("estoque_log").select("*").order("created_at", { ascending: false }).limit(limit);
    return NextResponse.json({ logs: data ?? [] });
  }

  // Buscar último log para desfazer
  if (action === "last_log") {
    const { data } = await supabase.from("estoque_log").select("*").order("created_at", { ascending: false }).limit(1).single();
    return NextResponse.json({ log: data });
  }

  // Desfazer última ação — busca no activity_log e reverte
  if (action === "undo") {
    // Buscar última ação relevante (excluir short_links e logs antigos)
    const { data: lastAction } = await supabase
      .from("activity_log")
      .select("*")
      .neq("entidade", "short_link")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!lastAction) return NextResponse.json({ error: "Nenhuma acao para desfazer" }, { status: 400 });

    const { acao, entidade, entidade_id, detalhes } = lastAction;

    // 1. Desfazer: "Adicionou ao estoque" → deletar o item
    if (acao === "Adicionou ao estoque" && entidade_id) {
      const { data: item } = await supabase.from("estoque").select("produto, qnt").eq("id", entidade_id).single();
      if (item) {
        await supabase.from("estoque").delete().eq("id", entidade_id);
        await supabase.from("activity_log").delete().eq("id", lastAction.id);
        return NextResponse.json({ ok: true, undone: `Removido do estoque: ${item.produto}` });
      }
    }

    // 2. Desfazer: "Removeu do estoque (auto)" → restaurar quantidade
    if (acao.includes("Removeu do estoque") && entidade_id) {
      const { data: item } = await supabase.from("estoque").select("id, qnt, status").eq("id", entidade_id).single();
      if (item) {
        await supabase.from("estoque").update({ qnt: Number(item.qnt) + 1, status: "EM ESTOQUE", updated_at: new Date().toISOString() }).eq("id", entidade_id);
        await supabase.from("activity_log").delete().eq("id", lastAction.id);
        return NextResponse.json({ ok: true, undone: `Restaurado ao estoque: ${detalhes?.split("—")[0]?.trim() || entidade_id}` });
      }
    }

    // 3. Desfazer: "Registrou venda" → deletar a venda e restaurar estoque
    if (acao === "Registrou venda" && entidade_id) {
      const { data: venda } = await supabase.from("vendas").select("*").eq("id", entidade_id).single();
      if (venda) {
        // Restaurar estoque se vinculado
        if (venda.estoque_id) {
          const { data: estoqueItem } = await supabase.from("estoque").select("qnt").eq("id", venda.estoque_id).single();
          if (estoqueItem) {
            await supabase.from("estoque").update({ qnt: Number(estoqueItem.qnt) + 1, status: "EM ESTOQUE", updated_at: new Date().toISOString() }).eq("id", venda.estoque_id);
          }
        }
        // Deletar entrega vinculada
        await supabase.from("entregas").delete().eq("venda_id", entidade_id);
        // Deletar pendência de troca (se tinha)
        if (venda.produto_na_troca && venda.cliente) {
          await supabase.from("estoque").delete().eq("cliente", venda.cliente).in("tipo", ["PENDENCIA"]).eq("data_compra", venda.data);
        }
        // Deletar a venda
        await supabase.from("vendas").delete().eq("id", entidade_id);
        await supabase.from("activity_log").delete().eq("id", lastAction.id);
        return NextResponse.json({ ok: true, undone: `Venda desfeita: ${venda.cliente} - ${venda.produto}` });
      }
    }

    // 4. Desfazer: "Merge estoque (preço médio)" → reverter via estoque_log
    if (acao.includes("Merge estoque") && entidade_id) {
      const { data: lastEstoqueLog } = await supabase.from("estoque_log").select("*").eq("produto_id", entidade_id).order("created_at", { ascending: false }).limit(1).single();
      if (lastEstoqueLog && lastEstoqueLog.valor_anterior) {
        await supabase.from("estoque").update({ [lastEstoqueLog.campo]: lastEstoqueLog.valor_anterior, updated_at: new Date().toISOString() }).eq("id", entidade_id);
        await supabase.from("estoque_log").delete().eq("id", lastEstoqueLog.id);
        await supabase.from("activity_log").delete().eq("id", lastAction.id);
        return NextResponse.json({ ok: true, undone: `Merge desfeito: ${lastEstoqueLog.produto_nome}` });
      }
    }

    // 5. Desfazer: alteração via estoque_log (fallback antigo)
    const { data: lastLog } = await supabase.from("estoque_log").select("*").order("created_at", { ascending: false }).limit(1).single();
    if (lastLog && lastLog.acao === "alteracao" && lastLog.produto_id) {
      await supabase.from("estoque").update({ [lastLog.campo]: lastLog.valor_anterior, updated_at: new Date().toISOString() }).eq("id", lastLog.produto_id);
      await supabase.from("estoque_log").delete().eq("id", lastLog.id);
      return NextResponse.json({ ok: true, undone: `${lastLog.produto_nome}: ${lastLog.campo} voltou para ${lastLog.valor_anterior}` });
    }

    // Não conseguiu desfazer — remover o log pra não travar
    await supabase.from("activity_log").delete().eq("id", lastAction.id);
    return NextResponse.json({ ok: true, undone: `Ação "${acao}" removida do histórico (não reversível automaticamente)` });
  }

  // Buscar por pedido_fornecedor_id (usado pelo histórico de gastos)
  const pedidoFornecedorId = searchParams.get("pedido_fornecedor_id");
  if (pedidoFornecedorId) {
    const { data, error } = await supabase
      .from("estoque")
      .select("*")
      .eq("pedido_fornecedor_id", pedidoFornecedorId)
      .order("produto");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  }

  let query = supabase.from("estoque").select("*").order("categoria").order("produto").limit(2000);
  if (categoria) query = query.eq("categoria", categoria);
  const statusFilter = searchParams.get("status");
  if (statusFilter) query = query.eq("status", statusFilter);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "estoque.read", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const body = await req.json();

  // Ação de importar em lote
  if (body.action === "import") {
    const rows = body.rows as Record<string, unknown>[];
    if (!rows?.length) return NextResponse.json({ error: "rows required" }, { status: 400 });

    // Normaliza nomes antes de deduplicar
    for (const r of rows) {
      if (r.produto && typeof r.produto === "string") r.produto = normalizeProdutoNome(r.produto.trim());
    }
    // Deduplicar por (produto, cor) — soma quantidades. NÃO calcula média aqui
    // (balanço = custo_unitario é recalculado depois pelo endpoint recalc-balancos).
    const seen = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const key = `${r.produto}|${r.cor ?? ""}`;
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        const existQnt = Number(existing.qnt || 0);
        const newQnt = Number(r.qnt || 0);
        seen.set(key, { ...existing, qnt: existQnt + newQnt, updated_at: new Date().toISOString() });
      } else {
        // Garante custo_compra no primeiro insert
        const base: Record<string, unknown> = { ...r, updated_at: new Date().toISOString() };
        if (base.custo_compra == null) base.custo_compra = base.custo_unitario;
        seen.set(key, base);
      }
    }
    const unique = [...seen.values()];

    // Importar: se produto+cor já existe no estoque, fazer merge (somar qnt + custo médio)
    let imported = 0;
    let merged = 0;
    const errors: string[] = [];
    for (const row of unique) {
      const produto = String(row.produto || "").trim();
      const cor = String(row.cor || "").trim() || null;

      // Verificar se já existe no estoque
      let existQuery = supabase.from("estoque").select("id, qnt, custo_unitario").eq("produto", produto).in("status", ["EM ESTOQUE", "ESGOTADO"]);
      if (cor) existQuery = existQuery.eq("cor", cor);
      else existQuery = existQuery.is("cor", null);
      const { data: existing } = await existQuery.limit(1).single();

      if (existing) {
        // Merge: somar quantidade. NÃO recalcula custo_unitario (balanço)
        // — use o endpoint /api/admin/recalc-balancos depois.
        const existQnt = Number(existing.qnt || 0);
        const addQnt = Number(row.qnt || 0);
        const totalQnt = existQnt + addQnt;

        const { error: ue } = await supabase.from("estoque").update({
          qnt: totalQnt,
          status: totalQnt > 0 ? "EM ESTOQUE" : "ESGOTADO",
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
        if (ue) errors.push(`${produto} (merge): ${ue.message}`);
        else merged++;
      } else {
        const rowIns: Record<string, unknown> = { ...row };
        if (rowIns.custo_compra == null) rowIns.custo_compra = rowIns.custo_unitario;
        const { error: ie } = await supabase.from("estoque").insert(rowIns);
        if (ie) errors.push(`${produto}: ${ie.message}`);
        else imported++;
      }
    }

    // Auto-recalcular balanço (preço médio) após importação
    if (imported + merged > 0) {
      try { await recalcBalancos(); } catch { /* silent */ }
    }

    return NextResponse.json({ ok: true, imported, merged, errors: errors.slice(0, 5), total: unique.length });
  }

  // Inserir novo produto — verificar se já existe (merge por produto+cor+categoria)
  // Se tem serial_no, NUNCA faz merge — cada serial é uma unidade individual
  // Auto-renomeia nomes conhecidos (Apple Watch SE 42/46mm → Series 11)
  if (body.produto) body.produto = normalizeProdutoNome(String(body.produto).trim());
  const produtoNome = String(body.produto || "").trim();
  const corNome = String(body.cor || "").trim() || null;
  const categoriaNome = String(body.categoria || "").trim();
  const hasSerial = !!body.serial_no;

  // Verificar serial duplicado: se serial já existe em estoque (qualquer status), bloquear ou restaurar
  if (hasSerial) {
    const serialUpper = (body.serial_no as string).toUpperCase();
    const { data: existingSerial } = await supabase
      .from("estoque")
      .select("id, status, produto, qnt")
      .eq("serial_no", serialUpper)
      .limit(1)
      .single();

    if (existingSerial) {
      // Bloquear se produto ainda está ativo no sistema (não foi vendido)
      if (existingSerial.status !== "ESGOTADO") {
        return NextResponse.json(
          { error: `Serial ${serialUpper} já existe no sistema como "${existingSerial.produto}" (status: ${existingSerial.status}). Só é possível re-registrar um serial após o produto ter sido vendido.` },
          { status: 409 }
        );
      }
      // Serial está ESGOTADO (foi vendido) — restaurar o item original preservando rastreabilidade
      const usuario = getUsuario(req);
      const updateData: Record<string, unknown> = { status: "EM ESTOQUE", qnt: 1, updated_at: new Date().toISOString() };
      // Atualizar apenas campos fornecidos no body (mantém dados originais para os demais)
      const allowedFields = ["produto", "cor", "categoria", "custo_unitario", "custo_compra", "fornecedor", "data_entrada", "data_compra", "observacao", "tipo", "bateria", "preco_sugerido", "imei"];
      for (const f of allowedFields) {
        if (body[f] !== undefined && body[f] !== null && body[f] !== "") updateData[f] = body[f];
      }
      // Se body veio sem custo_compra mas com custo_unitario, garante custo_compra
      if (updateData.custo_compra == null && updateData.custo_unitario != null) {
        updateData.custo_compra = updateData.custo_unitario;
      }
      const { error: ue } = await supabase.from("estoque").update(updateData).eq("id", existingSerial.id);
      if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });
      await logActivity(
        usuario,
        "Restaurou ao estoque (serial rastreado)",
        `${existingSerial.produto} → serial ${serialUpper} voltou ao estoque`,
        "estoque",
        existingSerial.id
      );
      return NextResponse.json({ ok: true, restored: true, id: existingSerial.id });
    }
  }

  if (produtoNome && !hasSerial) {
    let existQuery = supabase.from("estoque").select("id, qnt, custo_unitario, custo_compra").eq("produto", produtoNome).in("status", ["EM ESTOQUE", "ESGOTADO"]);
    if (categoriaNome) existQuery = existQuery.eq("categoria", categoriaNome);
    if (corNome) existQuery = existQuery.eq("cor", corNome);
    else existQuery = existQuery.is("cor", null);
    const { data: existing } = await existQuery.limit(1).single();

    if (existing) {
      // Merge: somar quantidade E recalcular custo_compra como média ponderada.
      // Isso garante que o balanço (preço médio) fique correto após recalcBalancos.
      const existQnt = Number(existing.qnt || 0);
      const addQnt = Number(body.qnt || 1);
      const totalQnt = existQnt + addQnt;

      // Calcular custo_compra médio ponderado no merge
      const existCusto = Number(existing.custo_compra || existing.custo_unitario || 0);
      const newCusto = Number(body.custo_compra || body.custo_unitario || 0);
      const newCustoCompra = totalQnt > 0
        ? Math.round(((existQnt * existCusto) + (addQnt * newCusto)) / totalQnt * 100) / 100
        : existCusto;

      const { error: ue } = await supabase.from("estoque").update({
        qnt: totalQnt,
        custo_compra: newCustoCompra,
        status: totalQnt > 0 ? "EM ESTOQUE" : "ESGOTADO",
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

      const usuario = getUsuario(req);
      await logEstoque(
        usuario, "alteracao", existing.id, produtoNome,
        "qnt (merge)",
        String(existQnt),
        String(totalQnt)
      );
      await logActivity(usuario, "Merge estoque (qnt)", `${produtoNome}${corNome ? ` ${corNome}` : ""}: ${existQnt} + ${addQnt} = ${totalQnt}`, "estoque", existing.id);

      return NextResponse.json({
        ok: true, merged: true, id: existing.id,
        mergeDetails: { existQnt, addQnt, totalQnt },
      });
    }
  }

  // Forçar serial_no e imei em caixa alta
  if (body.serial_no && typeof body.serial_no === "string") body.serial_no = body.serial_no.toUpperCase();
  if (body.imei && typeof body.imei === "string") body.imei = body.imei.toUpperCase();

  // Se tem serial_no, força qnt=1 (serial único = 1 unidade)
  if (body.serial_no) body.qnt = 1;

  // Garante custo_compra fixo no insert (igual ao custo_unitario informado, se não veio)
  const insertBody: Record<string, unknown> = { ...body, updated_at: new Date().toISOString() };
  if (insertBody.custo_compra == null && insertBody.custo_unitario != null) {
    insertBody.custo_compra = insertBody.custo_unitario;
  }

  const { data, error } = await supabase.from("estoque").insert(insertBody).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(getUsuario(req), "Adicionou ao estoque", `${produtoNome}. Quantidade: ${parseInt(body.qnt) || 0}`, "estoque", data?.id);

  // Auto-recalcular balanço (preço médio) após inserir produto
  try { await recalcBalancos(); } catch { /* silent */ }

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "estoque.read", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();

  // Rebalancear preço médio de um grupo de modelo
  const action = new URL(req.url).searchParams.get("action");
  if (action === "rebalance") {
    const { categoria, modelo } = body;
    if (!categoria || !modelo) return NextResponse.json({ error: "categoria and modelo required" }, { status: 400 });

    // Buscar todos os itens EM ESTOQUE da mesma categoria
    const { data: items } = await supabase
      .from("estoque")
      .select("id, produto, cor, qnt, custo_compra, custo_unitario, categoria")
      .eq("categoria", categoria)
      .eq("status", "EM ESTOQUE");

    if (!items || items.length === 0) return NextResponse.json({ ok: true, rebalanced: 0 });

    // Filtrar itens do mesmo modelo-base usando getModeloBase compartilhado
    const groupItems = items.filter(i => getModeloBase(i.produto, i.categoria) === modelo);
    if (groupItems.length <= 1) return NextResponse.json({ ok: true, rebalanced: 0 });

    // Calcular preço médio ponderado usando custo_compra (custo real de aquisição)
    let totalCusto = 0, totalQnt = 0;
    for (const i of groupItems) {
      totalCusto += (i.custo_compra || i.custo_unitario || 0) * (i.qnt || 1);
      totalQnt += (i.qnt || 1);
    }
    if (totalQnt === 0) return NextResponse.json({ ok: true, rebalanced: 0 });
    const avgCost = Math.round(totalCusto / totalQnt);

    // Verificar se precisa atualizar (algum tem preço diferente?)
    const needsUpdate = groupItems.some(i => i.custo_unitario !== avgCost);
    if (!needsUpdate) return NextResponse.json({ ok: true, rebalanced: 0, avgCost });

    // Atualizar todos pro preço médio
    const ids = groupItems.map(i => i.id);
    const { error: ue } = await supabase
      .from("estoque")
      .update({ custo_unitario: avgCost, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

    await logActivity(getUsuario(req), "Rebalance preço médio", `${modelo}: ${groupItems.length} itens → R$ ${avgCost}`, "estoque");
    return NextResponse.json({ ok: true, rebalanced: groupItems.length, avgCost });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Buscar estado anterior para o log
  const { data: antes } = await supabase.from("estoque").select("*").eq("id", id).single();

  // custo_compra é IMUTÁVEL após cadastro (custo real da compra).
  // custo_unitario = balanço (média ponderada) só muda via endpoint /api/admin/recalc-balancos.
  // Se o cliente tentar alterar custo_compra, preservamos o valor original.
  if (antes && fields.custo_compra !== undefined && antes.custo_compra != null && Number(antes.custo_compra) > 0) {
    delete fields.custo_compra;
  }

  // Forçar serial_no e imei em caixa alta
  if (fields.serial_no && typeof fields.serial_no === "string") fields.serial_no = fields.serial_no.toUpperCase();
  if (fields.imei && typeof fields.imei === "string") fields.imei = fields.imei.toUpperCase();

  // Se tem serial_no, força qnt=1
  const serialFinal = fields.serial_no ?? antes?.serial_no;
  if (serialFinal) fields.qnt = 1;

  const { error } = await supabase.from("estoque").update({
    ...fields,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Registrar log para cada campo alterado
  const alteracoes: string[] = [];
  if (antes) {
    for (const [campo, valorNovo] of Object.entries(fields)) {
      const valorAnterior = String((antes as Record<string, unknown>)[campo] ?? "");
      const novo = String(valorNovo ?? "");
      if (valorAnterior !== novo) {
        await logEstoque(usuario, "alteracao", id, antes.produto, campo, valorAnterior, novo);
        alteracoes.push(`${campo}: ${valorAnterior} → ${novo}`);
      }
    }
  }
  // Log no activity_log para aparecer no painel
  if (alteracoes.length > 0) {
    await logActivity(usuario, "Editou estoque", `${antes?.produto || "?"}: ${alteracoes.join(", ")}`, "estoque", id).catch(() => {});
  }

  // Recalcular preço médio se custo_unitario foi alterado manualmente
  if (fields.custo_unitario !== undefined || fields.qnt !== undefined || fields.status !== undefined) {
    try { await recalcBalancos(); } catch { /* silent */ }
  }

  // ── Auto-update encomenda vinculada quando produto chega ──
  if (fields.status === "EM ESTOQUE" && antes?.status === "A CAMINHO" && antes?.encomenda_id) {
    await supabase.from("encomendas").update({
      status: "CHEGOU",
      updated_at: new Date().toISOString(),
    }).eq("id", antes.encomenda_id).in("status", ["PENDENTE", "COMPRADO", "A CAMINHO"]);
  }

  // ── Sincronizar com Mostruário: estoque zerou ou voltou ──
  if (fields.qnt !== undefined) {
    const newQnt = Number(fields.qnt);
    const prodNome = antes?.produto || "";
    try {
      // Buscar produtos do mostruário que correspondem
      const { data: lojaProds } = await supabase
        .from("loja_produtos")
        .select("id, nome")
        .ilike("nome", `%${prodNome.replace(/iPhone |MacBook |iPad |Apple Watch |AirPods /gi, "").split(" ")[0]}%`);

      if (lojaProds) {
        for (const prod of lojaProds) {
          if (prodNome.toLowerCase().includes(prod.nome.toLowerCase().split(" ").slice(-2).join(" ").toLowerCase()) ||
              prod.nome.toLowerCase().includes(prodNome.toLowerCase().split(" ").slice(-2).join(" ").toLowerCase())) {
            // Atualizar status no precos
            if (newQnt === 0) {
              await supabase.from("precos").update({ status: "esgotado" }).ilike("modelo", `%${prodNome}%`);
            } else if (Number(antes?.qnt || 0) === 0 && newQnt > 0) {
              await supabase.from("precos").update({ status: "ativo" }).ilike("modelo", `%${prodNome}%`);
            }

            // Sincronizar visibilidade no mostruário (loja_variacoes)
            // Buscar variações desse produto que correspondem à cor/storage do estoque
            const corEstoque = (antes?.cor || "").toLowerCase();
            const { data: variacoes } = await supabase
              .from("loja_variacoes")
              .select("id, nome, atributos")
              .eq("produto_id", prod.id);

            if (variacoes) {
              for (const v of variacoes) {
                const attrs = v.atributos as Record<string, string> | null;
                const corVariacao = (attrs?.cor || v.nome || "").toLowerCase();
                // Match por cor (se houver) ou atualizar todas as variações do produto
                const corMatch = !corEstoque || !corVariacao ||
                  corVariacao.includes(corEstoque) || corEstoque.includes(corVariacao);

                if (corMatch) {
                  if (newQnt === 0) {
                    // Estoque zerou → esconder variação no mostruário
                    await supabase.from("loja_variacoes").update({ visivel: false }).eq("id", v.id);
                    console.log(`[Sync] Mostruário: ${v.nome} → escondido (estoque zerou)`);
                  } else if (Number(antes?.qnt || 0) === 0 && newQnt > 0) {
                    // Estoque voltou → mostrar variação no mostruário
                    await supabase.from("loja_variacoes").update({ visivel: true }).eq("id", v.id);
                    console.log(`[Sync] Mostruário: ${v.nome} → visível (estoque reabastecido)`);
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("Erro ao sincronizar estoque->mostruario:", err);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "estoque.read", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();
  const ids: string[] = body.ids || (body.id ? [body.id] : []);
  if (ids.length === 0) return NextResponse.json({ error: "id or ids required" }, { status: 400 });

  // Log e deletar cada item
  const { data: antes } = await supabase.from("estoque").select("id, produto").in("id", ids);
  const nomeMap = new Map((antes || []).map((a: { id: string; produto: string }) => [a.id, a.produto]));

  for (const id of ids) {
    const nome = nomeMap.get(id) || "?";
    await logEstoque(usuario, "exclusao", id, nome, "", "", "");
  }

  const { error } = await supabase.from("estoque").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const id of ids) {
    const nome = nomeMap.get(id) || "?";
    await logActivity(usuario, "Removeu do estoque", nome, "estoque", id);
  }

  return NextResponse.json({ ok: true, deleted: ids.length });
}
