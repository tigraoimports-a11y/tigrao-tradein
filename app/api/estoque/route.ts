import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";

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
      .ilike("imei", `%${imeiSearch}%`);

    const { data: vendaItems } = await supabase
      .from("vendas")
      .select("*")
      .ilike("imei", `%${imeiSearch}%`);

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

  let query = supabase.from("estoque").select("*").order("categoria").order("produto");
  if (categoria) query = query.eq("categoria", categoria);

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

    // Deduplicar por (produto, cor) — mantém o último, mas soma quantidades e calcula custo médio
    const seen = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
      const key = `${r.produto}|${r.cor ?? ""}`;
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        const existQnt = Number(existing.qnt || 0);
        const existCost = Number(existing.custo_unitario || 0);
        const newQnt = Number(r.qnt || 0);
        const newCost = Number(r.custo_unitario || 0);
        const totalQnt = existQnt + newQnt;
        const avgCost = totalQnt > 0 ? Math.round(((existQnt * existCost) + (newQnt * newCost)) / totalQnt) : newCost;
        seen.set(key, { ...r, qnt: totalQnt, custo_unitario: avgCost, updated_at: new Date().toISOString() });
      } else {
        seen.set(key, { ...r, updated_at: new Date().toISOString() });
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
        // Merge: somar quantidade e calcular custo médio ponderado
        const existQnt = Number(existing.qnt || 0);
        const existCost = Number(existing.custo_unitario || 0);
        const addQnt = Number(row.qnt || 0);
        const addCost = Number(row.custo_unitario || 0);
        const totalQnt = existQnt + addQnt;
        const avgCost = totalQnt > 0 && existQnt > 0 && existCost > 0
          ? Math.round(((existQnt * existCost) + (addQnt * addCost)) / totalQnt)
          : addCost;

        const { error: ue } = await supabase.from("estoque").update({
          qnt: totalQnt,
          custo_unitario: avgCost,
          status: totalQnt > 0 ? "EM ESTOQUE" : "ESGOTADO",
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
        if (ue) errors.push(`${produto} (merge): ${ue.message}`);
        else merged++;
      } else {
        const { error: ie } = await supabase.from("estoque").insert(row);
        if (ie) errors.push(`${produto}: ${ie.message}`);
        else imported++;
      }
    }

    return NextResponse.json({ ok: true, imported, merged, errors: errors.slice(0, 5), total: unique.length });
  }

  // Inserir novo produto — verificar se já existe (merge por produto+cor+categoria)
  // Se tem serial_no, NUNCA faz merge — cada serial é uma unidade individual
  const produtoNome = String(body.produto || "").trim();
  const corNome = String(body.cor || "").trim() || null;
  const categoriaNome = String(body.categoria || "").trim();
  const hasSerial = !!body.serial_no;

  if (produtoNome && !hasSerial) {
    let existQuery = supabase.from("estoque").select("id, qnt, custo_unitario").eq("produto", produtoNome).in("status", ["EM ESTOQUE", "ESGOTADO"]);
    if (categoriaNome) existQuery = existQuery.eq("categoria", categoriaNome);
    if (corNome) existQuery = existQuery.eq("cor", corNome);
    else existQuery = existQuery.is("cor", null);
    const { data: existing } = await existQuery.limit(1).single();

    if (existing) {
      // Merge: calcular custo médio ponderado e somar quantidade
      const existQnt = Number(existing.qnt || 0);
      const existCost = Number(existing.custo_unitario || 0);
      const addQnt = Number(body.qnt || 1);
      const addCost = Number(body.custo_unitario || 0);
      const totalQnt = existQnt + addQnt;
      const avgCost = totalQnt > 0 && existQnt > 0 && existCost > 0
        ? Math.round(((existQnt * existCost) + (addQnt * addCost)) / totalQnt)
        : addCost;

      const { error: ue } = await supabase.from("estoque").update({
        qnt: totalQnt,
        custo_unitario: avgCost,
        status: totalQnt > 0 ? "EM ESTOQUE" : "ESGOTADO",
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (ue) return NextResponse.json({ error: ue.message }, { status: 500 });

      const usuario = getUsuario(req);
      const mergeLog = `Preço médio aplicado: ${existQnt} un x R$${existCost} + ${addQnt} un x R$${addCost} = ${totalQnt} un x R$${avgCost}`;
      await logEstoque(
        usuario, "alteracao", existing.id, produtoNome,
        "merge (qnt+custo_medio)",
        `${existQnt}un x R$${existCost}`,
        `${totalQnt}un x R$${avgCost}`
      );
      await logActivity(usuario, "Merge estoque (preço médio)", `${produtoNome}${corNome ? ` ${corNome}` : ""}: ${mergeLog}`, "estoque", existing.id);

      return NextResponse.json({
        ok: true, merged: true, id: existing.id,
        mergeDetails: { existQnt, existCost, addQnt, addCost, totalQnt, avgCost, log: mergeLog },
      });
    }
  }

  // Forçar serial_no e imei em caixa alta
  if (body.serial_no && typeof body.serial_no === "string") body.serial_no = body.serial_no.toUpperCase();
  if (body.imei && typeof body.imei === "string") body.imei = body.imei.toUpperCase();

  const { data, error } = await supabase.from("estoque").insert({
    ...body,
    updated_at: new Date().toISOString(),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(getUsuario(req), "Adicionou ao estoque", `${produtoNome}. Quantidade: ${parseInt(body.qnt) || 0}`, "estoque", data?.id);

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
      .select("id, produto, cor, qnt, custo_unitario, categoria")
      .eq("categoria", categoria)
      .eq("status", "EM ESTOQUE");

    if (!items || items.length === 0) return NextResponse.json({ ok: true, rebalanced: 0 });

    // Importar getModeloBase não é possível aqui (é client-side), então reimplementar a lógica de agrupamento
    // Agrupar por modelo-base: extrair modelo+memória do nome do produto (sem cor)
    function extractModeloBase(produto: string, cat: string): string {
      const p = produto.toUpperCase().trim();
      const getMem = () => {
        const all = [...p.matchAll(/(\d+)\s*(GB|TB)/gi)];
        if (all.length === 0) return "";
        const vals = all.map(m => ({ raw: `${m[1]}${m[2].toUpperCase()}`, gb: m[2].toUpperCase() === "TB" ? parseInt(m[1]) * 1024 : parseInt(m[1]) }));
        return ` ${vals.sort((a, b) => b.gb - a.gb)[0].raw}`;
      };
      const getSize = () => { const m = p.match(/(\d{2})[""]/); return m ? ` ${m[1]}"` : ""; };
      if (cat === "IPHONES") {
        const match = p.match(/IPHONE\s*(\d+)\s*(PRO\s*MAX|PRO|PLUS|AIR)?/i);
        if (match) return `iPhone ${match[1]}${match[2] ? " " + match[2].trim() : ""}${getMem()}`;
      }
      if (cat === "IPADS") {
        const mem = getMem(); const size = getSize();
        if (p.includes("MINI")) return `iPad Mini${size}${mem}`;
        if (p.includes("AIR")) return `iPad Air${size}${mem}`;
        if (p.includes("PRO")) return `iPad Pro${size}${mem}`;
        return `iPad${mem}`;
      }
      if (cat === "APPLE_WATCH") {
        const match = p.match(/(?:WATCH|APPLE\s*WATCH)\s*(S\d+|SE|ULTRA\s*\d*|SERIES\s*\d+)/i);
        const size = getSize();
        return match ? `Apple Watch ${match[1].trim()}${size}` : produto;
      }
      if (cat === "MAC_MINI") { return `Mac Mini${getMem()}`; }
      return produto;
    }

    // Filtrar itens do mesmo modelo-base
    const groupItems = items.filter(i => extractModeloBase(i.produto, i.categoria) === modelo);
    if (groupItems.length <= 1) return NextResponse.json({ ok: true, rebalanced: 0 });

    // Calcular preço médio ponderado
    let totalCusto = 0, totalQnt = 0;
    for (const i of groupItems) {
      totalCusto += (i.custo_unitario || 0) * (i.qnt || 1);
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

  // Custo Médio Automático: quando quantidade aumenta (reposição) e novo custo é informado,
  // calcular custo médio ponderado automaticamente
  if (antes && fields.qnt !== undefined && fields.custo_unitario !== undefined) {
    const existingQty = Number(antes.qnt || 0);
    const existingCost = Number(antes.custo_unitario || 0);
    const newQty = Number(fields.qnt);
    const newCost = Number(fields.custo_unitario);

    // Só calcula média se está AUMENTANDO a quantidade (reposição)
    if (newQty > existingQty && existingQty > 0 && existingCost > 0 && newCost !== existingCost) {
      const addedQty = newQty - existingQty;
      const avgCost = Math.round(((existingQty * existingCost) + (addedQty * newCost)) / newQty);
      fields.custo_unitario = avgCost;

      // Log da operação de custo médio
      await logEstoque(
        usuario, "alteracao", id, antes.produto,
        "custo_unitario (média ponderada)",
        String(existingCost),
        `${avgCost} (${existingQty}un x R$${existingCost} + ${addedQty}un x R$${newCost})`
      );
    }
  }

  // Forçar serial_no e imei em caixa alta
  if (fields.serial_no && typeof fields.serial_no === "string") fields.serial_no = fields.serial_no.toUpperCase();
  if (fields.imei && typeof fields.imei === "string") fields.imei = fields.imei.toUpperCase();

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
