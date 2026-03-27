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

  // Desfazer última ação
  if (action === "undo") {
    const { data: lastLog } = await supabase.from("estoque_log").select("*").order("created_at", { ascending: false }).limit(1).single();
    if (!lastLog) return NextResponse.json({ error: "Nenhuma acao para desfazer" }, { status: 400 });

    if (lastLog.acao === "alteracao" && lastLog.produto_id) {
      await supabase.from("estoque").update({ [lastLog.campo]: lastLog.valor_anterior, updated_at: new Date().toISOString() }).eq("id", lastLog.produto_id);
      // Remover o log
      await supabase.from("estoque_log").delete().eq("id", lastLog.id);
      return NextResponse.json({ ok: true, undone: `${lastLog.produto_nome}: ${lastLog.campo} voltou para ${lastLog.valor_anterior}` });
    }

    if (lastLog.acao === "exclusao" && lastLog.produto_id) {
      // Não consegue restaurar item deletado sem os dados completos
      await supabase.from("estoque_log").delete().eq("id", lastLog.id);
      return NextResponse.json({ ok: true, undone: `Log de exclusao removido (produto nao pode ser restaurado)` });
    }

    return NextResponse.json({ error: "Acao nao pode ser desfeita" }, { status: 400 });
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
      let existQuery = supabase.from("estoque").select("id, qnt, custo_unitario").eq("produto", produto);
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
    let existQuery = supabase.from("estoque").select("id, qnt, custo_unitario").eq("produto", produtoNome);
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

      await logEstoque(
        getUsuario(req), "alteracao", existing.id, produtoNome,
        "merge (qnt+custo_medio)",
        `${existQnt}un x R$${existCost}`,
        `${totalQnt}un x R$${avgCost}`
      );

      return NextResponse.json({ ok: true, merged: true, id: existing.id });
    }
  }

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

  const { id, ...fields } = await req.json();
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
