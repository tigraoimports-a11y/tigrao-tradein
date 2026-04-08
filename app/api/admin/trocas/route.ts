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

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.trim();
  const motivo = searchParams.get("motivo");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");

  let query = supabase
    .from("trocas")
    .select("*", { count: "exact" })
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (motivo) query = query.eq("motivo", motivo);
  if (search) {
    query = query.or(
      `produto_saida_nome.ilike.%${search}%,produto_entrada_nome.ilike.%${search}%,fornecedor.ilike.%${search}%,produto_saida_serial.ilike.%${search}%,produto_entrada_serial.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ trocas: data ?? [], total: count ?? 0 });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usuario = getUsuario(req);
  const body = await req.json();

  const {
    produto_saida_id,
    motivo,
    fornecedor,
    observacao,
    // Produto novo (entrada)
    produto_entrada,
    // Financeiro
    diferenca_valor,
    banco,
  } = body as {
    produto_saida_id: string;
    motivo: string;
    fornecedor?: string;
    observacao?: string;
    produto_entrada: {
      produto: string;
      categoria: string;
      cor?: string;
      custo_unitario: number;
      serial_no?: string;
      imei?: string;
      tipo?: string;
      observacao?: string;
      bateria?: string;
      origem?: string;
      garantia?: string;
      fornecedor?: string;
    };
    diferenca_valor?: number;
    banco?: string;
  };

  if (!produto_saida_id || !motivo || !produto_entrada?.produto) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  // 1. Buscar produto que vai sair
  const { data: prodSaida, error: errSaida } = await supabase
    .from("estoque")
    .select("*")
    .eq("id", produto_saida_id)
    .single();

  if (errSaida || !prodSaida) {
    return NextResponse.json({ error: "Produto de saída não encontrado" }, { status: 404 });
  }

  // 2. Criar produto novo no estoque
  const novoEstoque = {
    produto: produto_entrada.produto.toUpperCase(),
    categoria: produto_entrada.categoria,
    cor: produto_entrada.cor || null,
    qnt: 1,
    custo_unitario: produto_entrada.custo_unitario || 0,
    status: "EM ESTOQUE",
    tipo: produto_entrada.tipo || "NOVO",
    serial_no: produto_entrada.serial_no?.toUpperCase() || null,
    imei: produto_entrada.imei?.toUpperCase() || null,
    observacao: produto_entrada.observacao || null,
    bateria: produto_entrada.bateria || null,
    origem: produto_entrada.origem || null,
    garantia: produto_entrada.garantia || null,
    fornecedor: produto_entrada.fornecedor || fornecedor || prodSaida.fornecedor || null,
    data_entrada: new Date().toISOString().split("T")[0],
  };

  const { data: novoProd, error: errNovo } = await supabase
    .from("estoque")
    .insert(novoEstoque)
    .select()
    .single();

  if (errNovo) {
    return NextResponse.json({ error: `Erro ao criar produto novo: ${errNovo.message}` }, { status: 500 });
  }

  // 3. Registrar troca
  const difVal = Number(diferenca_valor) || 0;

  const trocaRecord = {
    data: new Date().toISOString().split("T")[0],
    motivo,
    fornecedor: fornecedor || null,
    observacao: observacao || null,
    produto_saida_nome: prodSaida.produto,
    produto_saida_categoria: prodSaida.categoria,
    produto_saida_cor: prodSaida.cor,
    produto_saida_serial: prodSaida.serial_no,
    produto_saida_imei: prodSaida.imei,
    produto_saida_custo: Number(prodSaida.custo_unitario) || 0,
    produto_entrada_nome: novoProd.produto,
    produto_entrada_categoria: novoProd.categoria,
    produto_entrada_cor: novoProd.cor,
    produto_entrada_serial: novoProd.serial_no,
    produto_entrada_imei: novoProd.imei,
    produto_entrada_custo: Number(novoProd.custo_unitario) || 0,
    diferenca_valor: difVal,
    banco: banco || null,
    produto_entrada_estoque_id: novoProd.id,
  };

  const { data: troca, error: errTroca } = await supabase
    .from("trocas")
    .insert(trocaRecord)
    .select()
    .single();

  if (errTroca) {
    // Rollback: remover produto novo criado
    await supabase.from("estoque").delete().eq("id", novoProd.id);
    return NextResponse.json({ error: `Erro ao registrar troca: ${errTroca.message}` }, { status: 500 });
  }

  // 4. Remover produto original do estoque
  const { error: errDel } = await supabase
    .from("estoque")
    .delete()
    .eq("id", produto_saida_id);

  // Vincular o produto novo à troca (para exibir origem na busca/SuperSearch)
  await supabase.from("estoque").update({ troca_id: troca.id }).eq("id", novoProd.id);

  if (errDel) {
    // Rollback parcial
    await supabase.from("trocas").delete().eq("id", troca.id);
    await supabase.from("estoque").delete().eq("id", novoProd.id);
    return NextResponse.json({ error: `Erro ao remover produto original: ${errDel.message}` }, { status: 500 });
  }

  // 5. Se tem diferença de valor, criar gasto
  if (difVal !== 0) {
    const isPayment = difVal > 0; // positivo = pagamos a diferença
    await supabase.from("gastos").insert({
      data: new Date().toISOString().split("T")[0],
      tipo: isPayment ? "SAIDA" : "ENTRADA",
      categoria: "TROCA",
      descricao: `Troca: ${prodSaida.produto} → ${novoProd.produto} (${motivo})`,
      valor: Math.abs(difVal),
      banco: banco || null,
      observacao: observacao || null,
    });
  }

  // 6. Log
  await logActivity(
    usuario,
    "Troca de produto",
    `${prodSaida.produto} → ${novoProd.produto} | Motivo: ${motivo}${difVal !== 0 ? ` | Diferença: R$ ${difVal}` : ""}`,
    "trocas",
    troca.id
  );

  return NextResponse.json({ ok: true, troca, novo_produto: novoProd });
}

export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const usuario = getUsuario(req);
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Buscar troca
  const { data: troca, error: errFind } = await supabase
    .from("trocas")
    .select("*")
    .eq("id", id)
    .single();

  if (errFind || !troca) {
    return NextResponse.json({ error: "Troca não encontrada" }, { status: 404 });
  }

  // Remover produto que entrou (se ainda existe)
  if (troca.produto_entrada_estoque_id) {
    await supabase.from("estoque").delete().eq("id", troca.produto_entrada_estoque_id);
  }

  // Restaurar produto que saiu (re-criar)
  const restaurado = {
    produto: troca.produto_saida_nome,
    categoria: troca.produto_saida_categoria,
    cor: troca.produto_saida_cor,
    qnt: 1,
    custo_unitario: troca.produto_saida_custo,
    status: "EM ESTOQUE",
    tipo: "NOVO",
    serial_no: troca.produto_saida_serial,
    imei: troca.produto_saida_imei,
    fornecedor: troca.fornecedor,
    data_entrada: new Date().toISOString().split("T")[0],
  };

  await supabase.from("estoque").insert(restaurado);

  // Remover gasto associado (se existir)
  if (troca.diferenca_valor && Number(troca.diferenca_valor) !== 0) {
    await supabase
      .from("gastos")
      .delete()
      .eq("categoria", "TROCA")
      .ilike("descricao", `%${troca.produto_saida_nome}%`)
      .eq("data", troca.data);
  }

  // Remover troca
  await supabase.from("trocas").delete().eq("id", id);

  await logActivity(
    usuario,
    "Desfez troca",
    `Restaurou ${troca.produto_saida_nome}, removeu ${troca.produto_entrada_nome}`,
    "trocas",
    id
  );

  return NextResponse.json({ ok: true });
}
