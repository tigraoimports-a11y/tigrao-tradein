import { hojeBR } from "@/lib/date-utils";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendPaymentNotification, sendSaleNotification, sendCancelNotification } from "@/lib/telegram";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { recalcularSaldoDia } from "@/lib/saldos";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

/** Converte valor da troca em número, suportando "R$ 2.300,00" e "2300" */
function parseTrocaValor(val: string | null | undefined): number {
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.,]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

/** Detecta categoria do produto a partir do nome */
function detectCategoriaSeminovo(produto: string | null | undefined): string {
  const p = (produto || "").toUpperCase();
  if (p.includes("MACBOOK")) return "MACBOOK";
  if (p.includes("MAC MINI")) return "MAC_MINI";
  if (p.includes("MAC STUDIO")) return "MAC_STUDIO";
  if (p.includes("IMAC")) return "IMAC";
  if (p.includes("IPAD")) return "IPADS";
  if (p.includes("APPLE WATCH")) return "APPLE_WATCH";
  if (p.includes("AIRPODS")) return "AIRPODS";
  return "IPHONES";
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

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "vendas.read", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const { searchParams } = new URL(req.url);

  // Check recompra: verifica se CPF ou nome já tem vendas
  if (searchParams.get("action") === "check_recompra") {
    const cpf = searchParams.get("cpf");
    const cliente = searchParams.get("cliente");
    let found = false;
    if (cpf) {
      const cleanCpf = cpf.replace(/[\.\-\/\s]/g, "");
      const { data } = await supabase.from("vendas").select("id").ilike("cpf", `%${cleanCpf}%`).limit(1);
      found = (data?.length || 0) > 0;
    }
    if (!found && cliente) {
      const { data } = await supabase.from("vendas").select("id").ilike("cliente", `%${cliente}%`).limit(1);
      found = (data?.length || 0) > 0;
    }
    return NextResponse.json({ recompra: found });
  }

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const search = searchParams.get("search");

  let query = supabase.from("vendas").select("*").order("data", { ascending: false });
  if (search) {
    // Se parece CPF (só números e pontos/traço), busca por CPF; senão busca por nome
    const cleanSearch = search.replace(/[\.\-\/\s]/g, "");
    if (/^\d{3,}$/.test(cleanSearch)) {
      query = query.ilike("cpf", `%${cleanSearch}%`);
    } else {
      query = query.ilike("cliente", `%${search}%`);
    }
  } else {
    if (from) query = query.gte("data", from);
    if (to) query = query.lte("data", to);
  }

  const { data, error } = await query.limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "vendas.create", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const body = await req.json();

  // Importação em lote (vendas históricas)
  if (body.action === "import_bulk") {
    const rows = body.rows as Record<string, unknown>[];
    if (!rows?.length) return NextResponse.json({ error: "rows required" }, { status: 400 });

    let imported = 0;
    const errors: string[] = [];

    // Inserir em lotes de 100 via Supabase
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase.from("vendas").insert(batch);
      if (error) {
        errors.push(`Lote ${i}-${i + batch.length}: ${error.message}`);
        // Tentar um a um no lote com erro
        for (const row of batch) {
          const { error: e2 } = await supabase.from("vendas").insert(row);
          if (e2) errors.push(`${(row as Record<string, string>).cliente}: ${e2.message}`);
          else imported++;
        }
      } else {
        imported += batch.length;
      }
    }

    return NextResponse.json({ ok: true, imported, errors: errors.slice(0, 20), total: rows.length });
  }

  // Extrair dados do seminovo antes de inserir a venda
  const seminovoData = body._seminovo;
  delete body._seminovo;
  const seminovoData2 = body._seminovo2;
  delete body._seminovo2;

  // Extrair estoque_id antes de inserir
  let estoqueId = body._estoque_id;
  delete body._estoque_id;

  // Se tem estoque_id, copiar IMEI e Serial do estoque para a venda (se existirem)
  let imeiFromEstoque: string | null = null;
  let serialFromEstoque: string | null = null;
  if (estoqueId && (!body.imei || !body.serial_no)) {
    const { data: estoqueItem } = await supabase.from("estoque").select("imei, serial_no").eq("id", estoqueId).single();
    if (estoqueItem?.imei && !body.imei) imeiFromEstoque = estoqueItem.imei;
    if (estoqueItem?.serial_no && !body.serial_no) serialFromEstoque = estoqueItem.serial_no;
  }

  // Garantir nome do cliente em caixa alta
  if (body.cliente && typeof body.cliente === "string") {
    body.cliente = body.cliente.toUpperCase();
  }

  // Auto-preencher bairro/cidade/uf a partir do CEP se não informados
  if (body.cep && body.cep !== "00000000" && !body.bairro) {
    try {
      const cepClean = String(body.cep).replace(/\D/g, "");
      if (cepClean.length === 8) {
        const res = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
        const cepData = await res.json();
        if (!cepData.erro) {
          if (!body.bairro) body.bairro = cepData.bairro || null;
          if (!body.cidade) body.cidade = cepData.localidade || null;
          if (!body.uf) body.uf = cepData.uf || null;
          if (!body.endereco) body.endereco = cepData.logradouro || null;
        }
      }
    } catch { /* ignore CEP lookup failure */ }
  }

  // Garantir que forma nunca é null (banco exige NOT NULL)
  if (!body.forma) body.forma = "DEFINIR_DEPOIS";

  const { data, error } = await supabase.from("vendas").insert({
    ...body,
    estoque_id: estoqueId || null,
    ...(imeiFromEstoque ? { imei: imeiFromEstoque } : {}),
    ...(serialFromEstoque ? { serial_no: serialFromEstoque } : {}),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Se não tem estoque_id mas tem serial, buscar automaticamente no estoque
  if (!estoqueId && body.serial_no) {
    const { data: foundBySerial } = await supabase.from("estoque").select("id").eq("serial_no", body.serial_no.toUpperCase()).eq("status", "EM ESTOQUE").limit(1).single();
    if (foundBySerial) {
      estoqueId = foundBySerial.id;
      await supabase.from("vendas").update({ estoque_id: estoqueId }).eq("id", data?.id);
    }
  }

  // Descontar do estoque se veio de um produto cadastrado
  if (estoqueId) {
    const { data: item } = await supabase.from("estoque").select("qnt,produto,tipo").eq("id", estoqueId).single();
    if (item) {
      const novaQnt = Math.max(0, Number(item.qnt) - 1);
      // Seminovos e Novos: marcar como ESGOTADO ao chegar em qnt=0 (nunca deletar)
      // Isso preserva o ID do item e permite rastreabilidade completa (retorno ao estoque na devolução)
      await supabase.from("estoque").update({
        qnt: novaQnt,
        status: novaQnt === 0 ? "ESGOTADO" : "EM ESTOQUE",
        updated_at: new Date().toISOString(),
      }).eq("id", estoqueId);
      await logActivity(
        usuario,
        novaQnt === 0 ? "Esgotou do estoque (auto)" : "Removeu do estoque (auto)",
        `${item.produto || body.produto || "?"} — restam ${novaQnt} un.`,
        "estoque",
        estoqueId
      );
    }
  }

  // Log da venda
  await logActivity(
    usuario,
    estoqueId ? "Registrou venda" : "Registrou venda (manual)",
    `${body.cliente || "?"} - ${body.produto || "?"}`,
    "vendas",
    data?.id
  );

  // Notificação Telegram movida para quando a venda for FINALIZADA (PATCH)

  // Helper: monta observacao com tags de grade/caixa/cabo/fonte
  const buildObsComTags = (obs: string | null, grade: string | null, caixa: string | null, cabo: string | null, fonte: string | null): string | null => {
    const parts: string[] = [];
    if (obs) parts.push(obs.trim());
    if (grade) parts.push(`[GRADE_${grade === "A+" ? "APLUS" : grade}]`);
    if (caixa === "SIM") parts.push("[COM_CAIXA]");
    if (cabo === "SIM") parts.push("[COM_CABO]");
    if (fonte === "SIM") parts.push("[COM_FONTE]");
    return parts.length > 0 ? parts.join(" ") : null;
  };

  // Se tem produto na troca, criar item como PENDENCIA
  // (cliente ainda tem o aparelho, devolve em 24h)
  // Fallback: se _seminovo não veio mas a venda tem valor de troca, criar pendência mesmo sem nome do produto
  const pTrocaValor1 = parseTrocaValor(data?.produto_na_troca);
  const sem1 = seminovoData && (seminovoData.produto || (seminovoData.valor || 0) > 0)
    ? seminovoData
    : pTrocaValor1 > 0
      ? { produto: data?.troca_produto || null, valor: pTrocaValor1, cor: data?.troca_cor || null, bateria: data?.troca_bateria ? parseInt(data.troca_bateria) : null, observacao: data?.troca_obs || null, serial_no: null, imei: null, grade: null, caixa: null, cabo: null, fonte: null }
      : null;

  if (sem1 && (sem1.produto || (sem1.valor || 0) > 0)) {
    const nomeCliente = (body.cliente || data?.cliente || "").toUpperCase();
    const nomeProduto1 = sem1.produto || "PRODUTO DA TROCA — IDENTIFICAR";
    const { error: errSeminovo } = await supabase.from("estoque").insert({
      produto: nomeProduto1,
      categoria: sem1.categoria || detectCategoriaSeminovo(sem1.produto),
      qnt: 1,
      custo_unitario: sem1.valor || 0,
      status: "PENDENTE",
      tipo: "PENDENCIA",
      cor: sem1.cor ? String(sem1.cor).toUpperCase() : null,
      observacao: buildObsComTags(sem1.observacao || null, sem1.grade || null, sem1.caixa || null, sem1.cabo || null, sem1.fonte || null),
      bateria: sem1.bateria || null,
      serial_no: sem1.serial_no || null,
      imei: sem1.imei || null,
      origem: sem1.origem || null,
      cliente: nomeCliente || null,
      fornecedor: nomeCliente || null,
      data_compra: body.data || data?.data || null,
      updated_at: new Date().toISOString(),
    });
    if (errSeminovo) console.error("Erro ao criar pendencia troca 1:", errSeminovo.message);
    else await logActivity(usuario, "Pendência troca criada (auto)", `${nomeProduto1} R$${sem1.valor} — ${body.cliente || "?"}`, "estoque");
  }

  // 2º produto na troca — mesmo fluxo com fallback
  const pTrocaValor2 = parseTrocaValor(data?.produto_na_troca2);
  const sem2 = seminovoData2 && (seminovoData2.produto || (seminovoData2.valor || 0) > 0)
    ? seminovoData2
    : pTrocaValor2 > 0
      ? { produto: data?.troca_produto2 || null, valor: pTrocaValor2, cor: data?.troca_cor2 || null, bateria: data?.troca_bateria2 ? parseInt(data.troca_bateria2) : null, observacao: data?.troca_obs2 || null, serial_no: null, imei: null, grade: null, caixa: null, cabo: null, fonte: null }
      : null;

  if (sem2 && (sem2.produto || (sem2.valor || 0) > 0)) {
    const nomeCliente2 = (body.cliente || data?.cliente || "").toUpperCase();
    const nomeProduto2 = sem2.produto || "PRODUTO DA TROCA 2 — IDENTIFICAR";
    const { error: errSeminovo2 } = await supabase.from("estoque").insert({
      produto: nomeProduto2,
      categoria: sem2.categoria || detectCategoriaSeminovo(sem2.produto),
      qnt: 1,
      custo_unitario: sem2.valor || 0,
      status: "PENDENTE",
      tipo: "PENDENCIA",
      cor: sem2.cor ? String(sem2.cor).toUpperCase() : null,
      observacao: buildObsComTags(sem2.observacao || null, sem2.grade || null, sem2.caixa || null, sem2.cabo || null, sem2.fonte || null),
      bateria: sem2.bateria || null,
      serial_no: sem2.serial_no || null,
      imei: sem2.imei || null,
      origem: sem2.origem || null,
      cliente: nomeCliente2 || null,
      fornecedor: nomeCliente2 || null,
      data_compra: body.data || data?.data || null,
      updated_at: new Date().toISOString(),
    });
    if (errSeminovo2) console.error("Erro ao criar pendencia troca 2:", errSeminovo2.message);
    else await logActivity(usuario, "Pendência troca 2 criada (auto)", `${nomeProduto2} R$${sem2.valor} — ${body.cliente || "?"}`, "estoque");
  }

  // Entrega NÃO é criada automaticamente — equipe cria manualmente na agenda

  // Recalcular saldos do dia automaticamente
  if (body.data) recalcularSaldoDia(supabase, body.data).catch(() => {});

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  if (!hasPermission(role, "vendas.create")) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const body = await req.json();

  // Bulk update: finalizar todas vendas de uma data
  if (body.action === "finalizar_dia") {
    const { data: dia } = body;
    if (!dia) return NextResponse.json({ error: "data required" }, { status: 400 });
    const { data: updated, error } = await supabase
      .from("vendas")
      .update({ status_pagamento: "FINALIZADO" })
      .eq("data", dia)
      .eq("status_pagamento", "AGUARDANDO")
      .select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, finalizadas: updated?.length || 0 });
  }

  // Sync troca_produto/troca_cor/troca_categoria em vendas vinculadas
  if (body.action === "sync_by_cliente_data") {
    const { cliente, data_compra, produto, cor, categoria } = body;
    if (!cliente) return NextResponse.json({ error: "cliente obrigatorio" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (produto) updates.troca_produto = produto;
    if (cor !== undefined) updates.troca_cor = cor;
    if (categoria) updates.troca_categoria = categoria;

    // 1) Tentar por cliente + data exata
    if (data_compra) {
      const { data: r1, error: e1 } = await supabase.from("vendas")
        .update(updates)
        .ilike("cliente", cliente)
        .eq("data", data_compra)
        .not("troca_produto", "is", null)
        .select("id");
      if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
      if (r1 && r1.length > 0) return NextResponse.json({ ok: true, updated: r1.length });
    }

    // 2) Fallback: buscar TODAS as vendas desse cliente com troca_produto preenchido
    //    (seleciona primeiro, depois decide qual atualizar)
    const { data: candidatas, error: eCand } = await supabase.from("vendas")
      .select("id, data, troca_produto, troca_produto2")
      .ilike("cliente", cliente)
      .not("troca_produto", "is", null)
      .order("data", { ascending: false });
    if (eCand) return NextResponse.json({ error: eCand.message }, { status: 500 });

    if (!candidatas || candidatas.length === 0) {
      // 3) Último fallback: qualquer venda do cliente (inclusive sem troca_produto ainda)
      //    atualiza apenas a mais recente
      const { data: rFallback, error: eFallback } = await supabase.from("vendas")
        .select("id, data")
        .ilike("cliente", cliente)
        .order("data", { ascending: false })
        .limit(1);
      if (eFallback) return NextResponse.json({ error: eFallback.message }, { status: 500 });
      if (!rFallback || rFallback.length === 0) return NextResponse.json({ ok: true, updated: 0 });
      await supabase.from("vendas").update(updates).eq("id", rFallback[0].id);
      return NextResponse.json({ ok: true, updated: 1, fallback: "latest" });
    }

    // Se só 1 candidata, atualiza direto
    if (candidatas.length === 1) {
      await supabase.from("vendas").update(updates).eq("id", candidatas[0].id);
      return NextResponse.json({ ok: true, updated: 1 });
    }

    // Se há data_compra, tentar achar a candidata mais próxima da data
    if (data_compra) {
      const match = candidatas.find(v => v.data === data_compra) || candidatas[0];
      await supabase.from("vendas").update(updates).eq("id", match.id);
      return NextResponse.json({ ok: true, updated: 1 });
    }

    // Múltiplas sem data: atualiza a mais recente
    await supabase.from("vendas").update(updates).eq("id", candidatas[0].id);
    return NextResponse.json({ ok: true, updated: 1 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Remover campos internos que não existem na tabela vendas
  delete fields._seminovo;
  delete fields._seminovo2;
  delete fields._estoque_id;

  const { data, error } = await supabase.from("vendas").update(fields).eq("id", id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enviar notificação no Telegram quando venda é FINALIZADA
  if (fields.status_pagamento === "FINALIZADO" && data && data.length > 0) {
    const venda = data[0];
    const lucroCalc = Number(venda.preco_vendido || 0) - Number(venda.custo || 0);
    console.log("[Vendas] Enviando notificação Telegram para venda finalizada:", venda.cliente, venda.produto);
    sendSaleNotification({
      produto: venda.produto,
      cor: venda.cor,
      cliente: venda.cliente,
      preco_vendido: venda.preco_vendido,
      custo: venda.custo,
      lucro: lucroCalc,
      banco: venda.banco,
      forma: venda.forma,
      qnt_parcelas: venda.qnt_parcelas,
      bandeira: venda.bandeira,
      vendedor: venda.vendedor || "sistema",
    }).then(ok => {
      if (!ok) console.error("[Vendas] Falha ao enviar notificação Telegram para:", venda.cliente);
      else console.log("[Vendas] Notificação Telegram enviada com sucesso para:", venda.cliente);
    }).catch(err => console.error("[Vendas] Erro notificação Telegram:", err));
  }

  // Se tem reajustes, sincronizar com tabela reajustes (para relatório da noite)
  if (fields.reajustes && Array.isArray(fields.reajustes) && data?.[0]) {
    const venda = data[0];
    // Deletar reajustes antigos desta venda
    await supabase.from("reajustes").delete().eq("venda_ref", id);
    // Inserir todos os reajustes atuais
    const reajInserts = fields.reajustes.map((r: { valor: number; motivo: string; banco: string; data: string }) => ({
      data: r.data || hojeBR(),
      cliente: venda.cliente || "?",
      motivo: r.motivo || "",
      valor: r.valor,
      banco: r.banco || null,
      venda_ref: id,
    }));
    if (reajInserts.length > 0) {
      await supabase.from("reajustes").insert(reajInserts);
    }
    // Recalcular saldo do dia do reajuste (pode ser diferente do dia da venda)
    const reajDatas = [...new Set(reajInserts.map((r: { data: string }) => r.data))];
    for (const d of reajDatas) {
      recalcularSaldoDia(supabase, d as string).catch(() => {});
    }
  }

  // Recalcular saldos do dia automaticamente
  const vendaData = data?.[0]?.data || fields.data;
  if (vendaData) recalcularSaldoDia(supabase, vendaData).catch(() => {});

  // Sync automático para pendências no estoque quando troca é editada na venda
  if (data?.[0]) {
    const venda = data[0];
    const trocaFields = ["troca_produto", "troca_cor", "troca_categoria", "troca_produto2", "troca_cor2", "troca_categoria2"];
    const hasTrocaChange = trocaFields.some(f => f in fields);
    if (hasTrocaChange && venda.cliente) {
      // Buscar pendências do cliente (fornecedor = cliente da venda)
      const { data: pendencias } = await supabase
        .from("estoque")
        .select("id, produto, data_compra")
        .ilike("fornecedor", venda.cliente)
        .eq("status", "PENDENTE")
        .order("data_compra", { ascending: false });

      if (pendencias && pendencias.length > 0) {
        // Troca 1
        if ((fields.troca_produto || fields.troca_cor || fields.troca_categoria) && venda.troca_produto) {
          // Tentar achar a pendência com data igual ou a primeira da lista
          const p1 = pendencias.find(p => p.data_compra === venda.data) || pendencias[0];
          const upd1: Record<string, unknown> = {};
          if (fields.troca_produto) upd1.produto = fields.troca_produto;
          if (fields.troca_cor !== undefined) upd1.cor = fields.troca_cor;
          if (fields.troca_categoria) upd1.categoria = fields.troca_categoria;
          if (Object.keys(upd1).length > 0) {
            await supabase.from("estoque").update(upd1).eq("id", p1.id);
          }
        }
        // Troca 2
        if ((fields.troca_produto2 || fields.troca_cor2 || fields.troca_categoria2) && venda.troca_produto2 && pendencias.length >= 2) {
          const p2 = pendencias.find(p => p.data_compra === venda.data && p.id !== pendencias[0]?.id) || pendencias[1];
          const upd2: Record<string, unknown> = {};
          if (fields.troca_produto2) upd2.produto = fields.troca_produto2;
          if (fields.troca_cor2 !== undefined) upd2.cor = fields.troca_cor2;
          if (fields.troca_categoria2) upd2.categoria = fields.troca_categoria2;
          if (Object.keys(upd2).length > 0) {
            await supabase.from("estoque").update(upd2).eq("id", p2.id);
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, updated: data });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = getRole(req);
  const permissoes = getPermissoes(req);
  if (!hasPermission(role, "vendas.create", permissoes)) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  const usuario = getUsuario(req);

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Buscar venda antes de deletar (para limpar seminovo se houver)
  const { data: venda } = await supabase.from("vendas").select("*").eq("id", id).single();

  // Apagar entrega vinculada (se existir)
  await supabase.from("entregas").delete().eq("venda_id", id);

  const { error } = await supabase.from("vendas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logActivity(
    usuario,
    "Excluiu venda",
    `${venda?.cliente || "?"} - ${venda?.produto || "?"}`,
    "vendas",
    id
  );

  // Notificação Telegram de venda cancelada
  if (venda) {
    sendCancelNotification({
      produto: venda.produto,
      cliente: venda.cliente,
      preco_vendido: venda.preco_vendido,
      usuario,
    }).catch(err => console.error("[Vendas] Erro notificação cancelamento:", err));
  }

  // Devolver ao estoque se a venda veio de produto cadastrado
  if (venda && venda.estoque_id) {
    const { data: item } = await supabase.from("estoque").select("id, qnt, tipo").eq("id", venda.estoque_id).single();
    if (item) {
      await supabase.from("estoque").update({
        qnt: Number(item.qnt) + 1,
        status: "EM ESTOQUE",
        updated_at: new Date().toISOString(),
      }).eq("id", venda.estoque_id);
      await logActivity(usuario, "Devolveu ao estoque (cancelamento)", venda.produto, "estoque");
    } else {
      // Item foi deletado ou não encontrado pelo estoque_id
      // Tentar recuperar pelo serial_no (qualquer status — preserva rastreabilidade)
      let found = false;
      if (venda.serial_no) {
        const { data: bySerial } = await supabase.from("estoque").select("id, qnt, status").eq("serial_no", venda.serial_no).limit(1).single();
        if (bySerial) {
          await supabase.from("estoque").update({ qnt: 1, status: "EM ESTOQUE", updated_at: new Date().toISOString() }).eq("id", bySerial.id);
          found = true;
          await logActivity(usuario, "Devolveu ao estoque (cancelamento, serial rastreado)", `${venda.produto} serial=${venda.serial_no}`, "estoque", bySerial.id);
        }
      }
      // Se não achou por serial, tentar por produto+cor (ESGOTADO conta)
      if (!found && venda.produto) {
        let q = supabase.from("estoque").select("id, qnt, status").eq("produto", venda.produto).in("status", ["EM ESTOQUE", "ESGOTADO"]);
        if (venda.cor) q = q.eq("cor", venda.cor);
        const { data: byName } = await q.order("qnt", { ascending: false }).limit(1);
        if (byName && byName.length > 0) {
          await supabase.from("estoque").update({ qnt: Number(byName[0].qnt) + 1, status: "EM ESTOQUE", updated_at: new Date().toISOString() }).eq("id", byName[0].id);
          found = true;
          await logActivity(usuario, "Devolveu ao estoque (cancelamento, por produto)", venda.produto, "estoque", byName[0].id);
        }
      }
      // Último recurso: recriar (apenas se produto não existe em nenhuma forma no estoque)
      if (!found && venda.produto) {
        const novoItem: Record<string, unknown> = {
          produto: venda.produto,
          cor: venda.cor || null,
          serial_no: venda.serial_no || null,
          imei: venda.imei || null,
          qnt: 1,
          status: "EM ESTOQUE",
          tipo: "SEMINOVO",
          categoria: venda.categoria || null,
          custo_unitario: venda.custo || null,
          fornecedor: venda.fornecedor || null,
          updated_at: new Date().toISOString(),
        };
        const { error: errInsert } = await supabase.from("estoque").insert(novoItem);
        if (!errInsert) {
          await logActivity(usuario, "Recriou no estoque (cancelamento)", `${venda.produto} serial=${venda.serial_no || "?"}`, "estoque");
        } else {
          await logActivity(usuario, "Cancelamento: falha ao recriar no estoque", `${venda.produto}: ${errInsert.message}`, "estoque");
        }
      }
    }
  } else if (venda && venda.produto) {
    // Fallback: buscar produto no estoque pelo serial ou nome+cor e devolver
    // Inclui "ESGOTADO" pois o item pode ter ficado com qnt=0 após a venda
    let found = false;
    if (venda.serial_no) {
      const { data: item } = await supabase.from("estoque").select("id, qnt").eq("serial_no", venda.serial_no).single();
      if (item) {
        await supabase.from("estoque").update({ qnt: Number(item.qnt) + 1, status: "EM ESTOQUE", updated_at: new Date().toISOString() }).eq("id", item.id);
        found = true;
      }
    }
    if (!found) {
      // Buscar por nome do produto — inclui EM ESTOQUE e ESGOTADO
      let query = supabase.from("estoque").select("id, qnt, status").eq("produto", venda.produto).in("status", ["EM ESTOQUE", "ESGOTADO"]);
      if (venda.cor) query = query.eq("cor", venda.cor);
      const { data: items } = await query.order("qnt", { ascending: false }).limit(1);
      if (items && items.length > 0) {
        await supabase.from("estoque").update({ qnt: Number(items[0].qnt) + 1, status: "EM ESTOQUE", updated_at: new Date().toISOString() }).eq("id", items[0].id);
        found = true;
      }
    }
    if (found) {
      await logActivity(usuario, "Devolveu ao estoque (cancelamento)", venda.produto, "estoque");
    } else {
      await logActivity(usuario, "Cancelamento: produto não encontrado no estoque", venda.produto || "?", "estoque");
    }
  }

  // Se tinha produto na troca, remover o seminovo/pendencia do estoque
  if (venda && venda.produto_na_troca && venda.cliente) {
    await supabase.from("estoque")
      .delete()
      .eq("cliente", venda.cliente)
      .in("tipo", ["PENDENCIA", "SEMINOVO"]);
  }

  // Recalcular saldos do dia automaticamente
  if (venda?.data) recalcularSaldoDia(supabase, venda.data).catch(() => {});

  return NextResponse.json({ ok: true });
}
