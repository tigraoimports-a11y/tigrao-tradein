import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}
function getUsuario(req: NextRequest): string {
  const raw = req.headers.get("x-admin-user") || "sistema";
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/**
 * GET: lista todos os produtos vinculados a funcionarios.
 * Retorna agrupado por funcionario, com pagamentos.
 * Query opcional: ?funcionario=nome
 */
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(req.url);
    const funcFilter = url.searchParams.get("funcionario");
    let query = supabase
      .from("produtos_funcionarios")
      .select("*")
      .order("created_at", { ascending: false });
    if (funcFilter) query = query.ilike("funcionario", `%${funcFilter}%`);
    const { data: itens, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Busca pagamentos
    const ids = (itens || []).map(i => i.id);
    const { data: pags } = ids.length > 0
      ? await supabase.from("produtos_funcionarios_pagamentos").select("*").in("produto_funcionario_id", ids).order("data", { ascending: false })
      : { data: [] as Array<{ produto_funcionario_id: string }> };
    const pagsMap = new Map<string, typeof pags>();
    for (const p of (pags || []) as Array<{ produto_funcionario_id: string }>) {
      const arr = pagsMap.get(p.produto_funcionario_id) || [];
      arr.push(p as never);
      pagsMap.set(p.produto_funcionario_id, arr);
    }
    const enriched = (itens || []).map(i => ({ ...i, pagamentos: pagsMap.get(i.id) || [] }));

    return NextResponse.json({ data: enriched });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST: vincula um produto a um funcionario.
 * Body:
 * - { estoque_id, funcionario, tipo_acordo, percentual_funcionario?, observacao, data_saida? }
 *   ou
 * - { manual: true, produto, categoria, cor?, serial_no?, imei?, funcionario, tipo_acordo, percentual_funcionario?, observacao }
 *
 * Quando vinculado do estoque: marca status=COM_FUNCIONARIO e qnt=0.
 * percentual_funcionario 0..100 — % do custo_compra que o funcionario paga (resto eh empresa).
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  try {
    const body = await req.json();
    const {
      estoque_id, manual, produto: produtoManual, categoria: catManual, cor: corManual,
      serial_no: serialManual, imei: imeiManual,
      funcionario, tipo_acordo, percentual_funcionario, observacao, data_saida,
      valor_total_manual,
    } = body;

    if (!funcionario?.trim()) return NextResponse.json({ error: "Funcionário é obrigatório" }, { status: 400 });
    if (!tipo_acordo) return NextResponse.json({ error: "Tipo de acordo é obrigatório" }, { status: 400 });
    if (!observacao?.trim()) return NextResponse.json({ error: "Observação é obrigatória" }, { status: 400 });

    let produto = produtoManual;
    let categoria = catManual;
    let cor = corManual;
    let serial_no = serialManual;
    let imei = imeiManual;
    let valorTotal = Number(valor_total_manual || 0);

    // Se veio do estoque, busca snapshot e marca item
    if (estoque_id && !manual) {
      const { data: item, error: itemErr } = await supabase
        .from("estoque").select("*").eq("id", estoque_id).single();
      if (itemErr || !item) return NextResponse.json({ error: "Item do estoque não encontrado" }, { status: 404 });
      produto = item.produto;
      categoria = item.categoria;
      cor = item.cor;
      serial_no = item.serial_no;
      imei = item.imei;
      valorTotal = Number(item.custo_compra || item.custo_unitario || 0);

      // Marca item como COM_FUNCIONARIO (sai do estoque disponivel)
      await supabase.from("estoque").update({
        status: "COM_FUNCIONARIO",
        qnt: 0,
        updated_at: new Date().toISOString(),
      }).eq("id", estoque_id);
    }

    if (!produto?.trim()) return NextResponse.json({ error: "Produto é obrigatório" }, { status: 400 });

    // Calcula divisao com base no percentual
    const pct = Math.max(0, Math.min(100, Number(percentual_funcionario || 0)));
    let valorEmpresa = 0;
    let valorFuncionario = 0;
    if (tipo_acordo === "CEDIDO") {
      valorEmpresa = valorTotal;
      valorFuncionario = 0;
    } else if (tipo_acordo === "TOTAL") {
      valorEmpresa = 0;
      valorFuncionario = valorTotal;
    } else if (tipo_acordo === "PARCIAL" || tipo_acordo === "SUBSIDIADO") {
      valorFuncionario = Math.round(valorTotal * pct) / 100;
      valorEmpresa = Math.round((valorTotal - valorFuncionario) * 100) / 100;
    } else {
      // OUTRO — preenche como veio
      valorFuncionario = 0;
      valorEmpresa = valorTotal;
    }

    const statusInicial = tipo_acordo === "CEDIDO" ? "CEDIDO"
      : valorFuncionario > 0 ? "ACORDO_ATIVO"
      : "EM_USO";

    const insertData = {
      estoque_id: estoque_id && !manual ? estoque_id : null,
      funcionario: funcionario.trim(),
      produto: produto.trim(),
      categoria: categoria || null,
      cor: cor || null,
      serial_no: serial_no || null,
      imei: imei || null,
      tipo_acordo,
      percentual_funcionario: pct,
      valor_total: valorTotal,
      valor_empresa: valorEmpresa,
      valor_funcionario: valorFuncionario,
      valor_pago: 0,
      observacao: observacao.trim(),
      status: statusInicial,
      data_saida: data_saida || new Date().toISOString().slice(0, 10),
      criado_por: usuario,
    };

    const { data, error } = await supabase
      .from("produtos_funcionarios").insert(insertData).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity(
      usuario,
      "Vinculou produto a funcionario",
      `${funcionario} — ${produto} (${tipo_acordo})`,
      "produtos_funcionarios",
      data.id
    );

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * PATCH: atualiza status, acordo, observação ou devolve o produto.
 * Body: { id, status?, observacao?, tipo_acordo?, percentual_funcionario?, devolver? }
 *
 * Se devolver=true: retorna o produto ao estoque (se tinha estoque_id) e marca status=DEVOLVIDO.
 */
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  try {
    const body = await req.json();
    const { id, devolver, ...rest } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const { data: antes } = await supabase
      .from("produtos_funcionarios").select("*").eq("id", id).single();
    if (!antes) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    if (devolver) {
      // Retorna ao estoque se tinha origem
      if (antes.estoque_id) {
        await supabase.from("estoque").update({
          status: "EM ESTOQUE",
          qnt: 1,
          updated_at: new Date().toISOString(),
        }).eq("id", antes.estoque_id);
      }
      await supabase.from("produtos_funcionarios").update({
        status: "DEVOLVIDO",
        data_devolucao: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      }).eq("id", id);

      await logActivity(
        usuario,
        "Devolveu produto de funcionario",
        `${antes.funcionario} — ${antes.produto}`,
        "produtos_funcionarios",
        id
      );
      return NextResponse.json({ ok: true });
    }

    // Update comum
    const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (rest.status !== undefined) fields.status = rest.status;
    if (rest.observacao !== undefined) fields.observacao = String(rest.observacao).trim();
    if (rest.funcionario !== undefined) fields.funcionario = String(rest.funcionario).trim();
    if (rest.tipo_acordo !== undefined) fields.tipo_acordo = rest.tipo_acordo;
    if (rest.percentual_funcionario !== undefined) {
      const pct = Math.max(0, Math.min(100, Number(rest.percentual_funcionario)));
      fields.percentual_funcionario = pct;
      // Recalcula divisao
      const vt = Number(antes.valor_total || 0);
      const vf = Math.round(vt * pct) / 100;
      fields.valor_funcionario = vf;
      fields.valor_empresa = Math.round((vt - vf) * 100) / 100;
    }

    const { error } = await supabase.from("produtos_funcionarios").update(fields).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity(
      usuario,
      "Editou vinculo com funcionario",
      `${antes.funcionario} — ${antes.produto}`,
      "produtos_funcionarios",
      id
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * DELETE: remove o registro. Se tinha estoque_id, retorna o produto ao estoque.
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const usuario = getUsuario(req);
  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const { data: antes } = await supabase
      .from("produtos_funcionarios").select("*").eq("id", id).single();
    if (!antes) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    // Retorna ao estoque
    if (antes.estoque_id) {
      await supabase.from("estoque").update({
        status: "EM ESTOQUE",
        qnt: 1,
        updated_at: new Date().toISOString(),
      }).eq("id", antes.estoque_id);
    }

    const { error } = await supabase.from("produtos_funcionarios").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await logActivity(
      usuario,
      "Removeu vinculo com funcionario",
      `${antes.funcionario} — ${antes.produto}`,
      "produtos_funcionarios",
      id
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
