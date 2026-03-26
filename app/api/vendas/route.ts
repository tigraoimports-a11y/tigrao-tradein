import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendPaymentNotification, sendSaleNotification } from "@/lib/telegram";
import { logActivity } from "@/lib/activity-log";
import { hasPermission } from "@/lib/permissions";
import { recalcularSaldoDia } from "@/lib/saldos";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  return req.headers.get("x-admin-user") || "sistema";
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

  // Extrair estoque_id antes de inserir
  const estoqueId = body._estoque_id;
  delete body._estoque_id;

  // Se tem estoque_id, copiar IMEI do estoque para a venda (se existir)
  let imeiFromEstoque: string | null = null;
  if (estoqueId && !body.imei) {
    const { data: estoqueItem } = await supabase.from("estoque").select("imei").eq("id", estoqueId).single();
    if (estoqueItem?.imei) imeiFromEstoque = estoqueItem.imei;
  }

  // Garantir nome do cliente em caixa alta
  if (body.cliente && typeof body.cliente === "string") {
    body.cliente = body.cliente.toUpperCase();
  }

  const { data, error } = await supabase.from("vendas").insert({
    ...body,
    estoque_id: estoqueId || null,
    ...(imeiFromEstoque ? { imei: imeiFromEstoque } : {}),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Descontar do estoque se veio de um produto cadastrado
  if (estoqueId) {
    const { data: item } = await supabase.from("estoque").select("qnt,produto").eq("id", estoqueId).single();
    if (item) {
      const novaQnt = Math.max(0, Number(item.qnt) - 1);
      await supabase.from("estoque").update({
        qnt: novaQnt,
        status: novaQnt === 0 ? "ESGOTADO" : "EM ESTOQUE",
        updated_at: new Date().toISOString(),
      }).eq("id", estoqueId);
      // Log remoção automática do estoque
      await logActivity(
        usuario,
        "Removeu do estoque (auto)",
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

  // Se tem produto na troca, criar item como PENDENCIA
  // (cliente ainda tem o aparelho, devolve em 24h)
  if (seminovoData && seminovoData.produto) {
    await supabase.from("estoque").insert({
      produto: seminovoData.produto,
      categoria: "IPHONES",
      qnt: 1,
      custo_unitario: seminovoData.valor || 0,
      status: "PENDENTE",
      tipo: "PENDENCIA",
      cor: seminovoData.cor || null,
      observacao: seminovoData.observacao || null,
      bateria: seminovoData.bateria || null,
      cliente: body.cliente || null,
      data_compra: body.data || null,
      updated_at: new Date().toISOString(),
    });
  }

  // Auto-criar entrega quando local é ENTREGA
  if (data && (body.local || "").toUpperCase() === "ENTREGA") {
    try {
      await supabase.from("entregas").insert({
        venda_id: data.id,
        cliente: body.cliente || "",
        telefone: null,
        endereco: body.endereco || null,
        bairro: body.bairro || null,
        data_entrega: body.data || new Date().toISOString().split("T")[0],
        horario: null,
        status: "PENDENTE",
        entregador: null,
        observacao: null,
        produto: body.produto || "",
        tipo: body.tipo || "VENDA",
        forma_pagamento: body.forma || "PIX",
        valor: body.preco_vendido || 0,
        vendedor: usuario || "sistema",
        regiao: body.bairro || null,
        detalhes_upgrade: (seminovoData?.produto) ? `Troca: ${seminovoData.produto} (R$ ${seminovoData.valor || 0})` : null,
      });
    } catch { /* ignore entrega creation error */ }
  }

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

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

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

  // Recalcular saldos do dia automaticamente
  const vendaData = data?.[0]?.data || fields.data;
  if (vendaData) recalcularSaldoDia(supabase, vendaData).catch(() => {});

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

  // Devolver ao estoque se a venda veio de produto cadastrado
  if (venda && venda.estoque_id) {
    const { data: item } = await supabase.from("estoque").select("qnt").eq("id", venda.estoque_id).single();
    if (item) {
      await supabase.from("estoque").update({
        qnt: Number(item.qnt) + 1,
        status: "EM ESTOQUE",
        updated_at: new Date().toISOString(),
      }).eq("id", venda.estoque_id);
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
