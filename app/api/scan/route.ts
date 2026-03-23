import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function getUsuario(req: NextRequest): string {
  return req.headers.get("x-admin-user") || "sistema";
}

/**
 * POST /api/scan
 *
 * Busca produto por Serial Number.
 * - Se não encontrado → { found: false } → frontend abre cadastro
 * - Se encontrado + EM_ESTOQUE → retorna dados para auto-fill na venda
 * - Se encontrado + VENDIDO → aviso
 *
 * Body: { serial_no: string }
 */
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { serial_no } = await req.json();

    if (!serial_no || serial_no.trim().length < 5) {
      return NextResponse.json({ error: "Serial Number inválido" }, { status: 400 });
    }

    const serialClean = serial_no.trim().toUpperCase();

    // 1. Buscar na tabela produtos_individuais
    const { data: produto, error } = await supabase
      .from("produtos_individuais")
      .select("*")
      .eq("serial_no", serialClean)
      .maybeSingle();

    if (error) {
      console.error("Scan error:", error);
      return NextResponse.json({ error: "Erro ao buscar produto" }, { status: 500 });
    }

    // NÃO encontrado → produto novo, precisa cadastrar
    if (!produto) {
      return NextResponse.json({
        found: false,
        serial_no: serialClean,
        message: "Produto não cadastrado. Preencha os dados para dar entrada.",
      });
    }

    // Encontrado + VENDIDO
    if (produto.status === "VENDIDO") {
      // Buscar venda vinculada
      let vendaInfo = null;
      if (produto.venda_id) {
        const { data: venda } = await supabase
          .from("vendas")
          .select("id, data, cliente, produto, preco_vendido")
          .eq("id", produto.venda_id)
          .single();
        vendaInfo = venda;
      }

      return NextResponse.json({
        found: true,
        status: "VENDIDO",
        produto,
        venda: vendaInfo,
        message: `Este produto já foi vendido${vendaInfo?.cliente ? ` para ${vendaInfo.cliente}` : ""}.`,
      });
    }

    // Encontrado + EM_ESTOQUE → pronto para venda
    if (produto.status === "EM_ESTOQUE") {
      return NextResponse.json({
        found: true,
        status: "EM_ESTOQUE",
        produto,
        message: `Produto encontrado: ${produto.produto}`,
      });
    }

    // Encontrado + RESERVADO
    return NextResponse.json({
      found: true,
      status: produto.status,
      produto,
      message: `Produto com status: ${produto.status}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PUT /api/scan
 *
 * Registra entrada de produto (cadastro inicial via scan)
 *
 * Body: {
 *   serial_no, imei?, imei2?, categoria, produto, cor?,
 *   armazenamento?, custo_unitario?, fornecedor?, data_compra?, observacao?
 * }
 */
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const usuario = getUsuario(req);

    const {
      serial_no,
      imei,
      imei2,
      categoria,
      produto,
      cor,
      armazenamento,
      custo_unitario,
      fornecedor,
      data_compra,
      observacao,
    } = body;

    if (!serial_no || !categoria || !produto) {
      return NextResponse.json({ error: "Serial Number, categoria e produto são obrigatórios" }, { status: 400 });
    }

    const serialClean = serial_no.trim().toUpperCase();

    // Verificar se já existe
    const { data: existing } = await supabase
      .from("produtos_individuais")
      .select("id, status")
      .eq("serial_no", serialClean)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        error: "Serial Number já cadastrado",
        produto: existing,
      }, { status: 409 });
    }

    // 1. Buscar/Criar registro agregado no estoque
    const produtoNome = produto.trim().toUpperCase();
    const corNome = (cor || "").trim().toUpperCase();

    const { data: estoqueRow } = await supabase
      .from("estoque")
      .select("*")
      .eq("produto", produtoNome)
      .eq("cor", corNome)
      .maybeSingle();

    let estoqueId: string | null = null;
    const custoNum = custo_unitario ? Number(custo_unitario) : 0;

    if (estoqueRow) {
      // Incrementar quantidade e recalcular custo médio
      const novaQnt = (estoqueRow.qnt || 0) + 1;
      const custoAnterior = estoqueRow.custo_unitario || 0;
      const novoCusto = custoNum > 0
        ? Math.round(((custoAnterior * (estoqueRow.qnt || 0)) + custoNum) / novaQnt)
        : custoAnterior;

      await supabase
        .from("estoque")
        .update({
          qnt: novaQnt,
          custo_unitario: novoCusto,
          status: "EM ESTOQUE",
          fornecedor: fornecedor || estoqueRow.fornecedor,
          updated_at: new Date().toISOString(),
        })
        .eq("id", estoqueRow.id);

      estoqueId = estoqueRow.id;
    } else {
      // Criar novo registro no estoque
      const { data: newEstoque } = await supabase
        .from("estoque")
        .insert({
          categoria: categoria.toUpperCase(),
          produto: produtoNome,
          cor: corNome,
          armazenamento: armazenamento || null,
          qnt: 1,
          custo_unitario: custoNum,
          status: "EM ESTOQUE",
          tipo: "NOVO",
          fornecedor: fornecedor || null,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      estoqueId = newEstoque?.id || null;
    }

    // 2. Criar registro individual
    const { data: novoProduto, error: insertError } = await supabase
      .from("produtos_individuais")
      .insert({
        serial_no: serialClean,
        imei: imei?.trim() || null,
        imei2: imei2?.trim() || null,
        categoria: categoria.toUpperCase(),
        produto: produtoNome,
        cor: corNome || null,
        armazenamento: armazenamento || null,
        custo_unitario: custoNum,
        fornecedor: fornecedor || null,
        data_compra: data_compra || null,
        observacao: observacao || null,
        status: "EM_ESTOQUE",
        estoque_id: estoqueId,
        data_entrada: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // 3. Registrar movimentação
    await supabase.from("movimentacoes_estoque").insert({
      etiqueta_id: novoProduto.id,
      codigo_barras: serialClean,
      tipo: "ENTRADA",
      usuario,
      observacao: `Entrada por scan: ${produtoNome} ${corNome} — SN: ${serialClean}`,
    });

    // 4. Sync mostruário — marcar como disponível se variação existe
    await syncMostruario(produtoNome, corNome);

    // 5. Log
    logActivity(usuario, "Scan entrada", `${produtoNome} ${corNome} — SN: ${serialClean}`, "estoque", estoqueId || undefined).catch(() => {});

    return NextResponse.json({
      ok: true,
      produto: novoProduto,
      estoque_id: estoqueId,
      message: `Produto cadastrado: ${produtoNome} ${corNome}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/scan
 *
 * Registra saída de produto (venda)
 *
 * Body: { serial_no: string, venda_id?: string }
 */
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { serial_no, venda_id } = await req.json();
    const usuario = getUsuario(req);

    if (!serial_no) {
      return NextResponse.json({ error: "Serial Number obrigatório" }, { status: 400 });
    }

    const serialClean = serial_no.trim().toUpperCase();

    // Buscar produto
    const { data: produto } = await supabase
      .from("produtos_individuais")
      .select("*")
      .eq("serial_no", serialClean)
      .single();

    if (!produto) {
      return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 });
    }

    if (produto.status !== "EM_ESTOQUE") {
      return NextResponse.json({ error: `Produto não está em estoque (status: ${produto.status})` }, { status: 400 });
    }

    // 1. Marcar como vendido
    await supabase
      .from("produtos_individuais")
      .update({
        status: "VENDIDO",
        venda_id: venda_id || null,
        data_saida: new Date().toISOString(),
      })
      .eq("id", produto.id);

    // 2. Decrementar estoque
    if (produto.estoque_id) {
      const { data: estoqueRow } = await supabase
        .from("estoque")
        .select("*")
        .eq("id", produto.estoque_id)
        .single();

      if (estoqueRow && estoqueRow.qnt > 0) {
        const novaQnt = estoqueRow.qnt - 1;
        await supabase
          .from("estoque")
          .update({
            qnt: novaQnt,
            status: novaQnt === 0 ? "ESGOTADO" : "EM ESTOQUE",
            updated_at: new Date().toISOString(),
          })
          .eq("id", estoqueRow.id);

        // Se zerou, sync mostruário
        if (novaQnt === 0) {
          await syncMostruarioEsgotado(produto.produto, produto.cor || "");
        }
      }
    }

    // 3. Registrar movimentação
    await supabase.from("movimentacoes_estoque").insert({
      etiqueta_id: produto.id,
      codigo_barras: serialClean,
      tipo: "SAIDA",
      usuario,
      observacao: `Saída por venda: ${produto.produto} — SN: ${serialClean}`,
    });

    // 4. Log
    logActivity(usuario, "Scan saída", `${produto.produto} — SN: ${serialClean}`, "vendas", venda_id).catch(() => {});

    return NextResponse.json({
      ok: true,
      message: `Saída registrada: ${produto.produto}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────
// Sync Mostruário helpers
// ──────────────────────────────────────────────────

/**
 * When a product enters stock, ensure mostruário shows it as available
 */
async function syncMostruario(produtoNome: string, cor: string) {
  try {
    // Search loja_variacoes for matching product
    const { data: variacoes } = await supabase
      .from("loja_variacoes")
      .select("id, nome, atributos, tags")
      .ilike("nome", `%${produtoNome.split(" ").slice(0, 4).join("%")}%`);

    if (!variacoes || variacoes.length === 0) return;

    for (const v of variacoes) {
      // Check if color matches (in attributes or name)
      const attrs = v.atributos || {};
      const matchesCor = !cor ||
        (attrs.cor && attrs.cor.toUpperCase() === cor) ||
        v.nome.toUpperCase().includes(cor);

      if (matchesCor) {
        // Remove "esgotado" tag if present, ensure visible
        const currentTags = Array.isArray(v.tags) ? v.tags : [];
        const newTags = currentTags.filter((t: string) => t.toLowerCase() !== "esgotado");
        if (!newTags.includes("disponível")) newTags.push("disponível");

        await supabase
          .from("loja_variacoes")
          .update({ tags: newTags, visivel: true })
          .eq("id", v.id);
      }
    }
  } catch {
    // Non-critical, don't fail the main operation
  }
}

/**
 * When stock reaches 0, mark mostruário as esgotado
 */
async function syncMostruarioEsgotado(produtoNome: string, cor: string) {
  try {
    const { data: variacoes } = await supabase
      .from("loja_variacoes")
      .select("id, nome, atributos, tags")
      .ilike("nome", `%${produtoNome.split(" ").slice(0, 4).join("%")}%`);

    if (!variacoes || variacoes.length === 0) return;

    for (const v of variacoes) {
      const attrs = v.atributos || {};
      const matchesCor = !cor ||
        (attrs.cor && attrs.cor.toUpperCase() === cor) ||
        v.nome.toUpperCase().includes(cor);

      if (matchesCor) {
        const currentTags = Array.isArray(v.tags) ? v.tags : [];
        const newTags = currentTags.filter((t: string) =>
          t.toLowerCase() !== "disponível" && t.toLowerCase() !== "esgotado"
        );
        newTags.push("esgotado");

        await supabase
          .from("loja_variacoes")
          .update({ tags: newTags })
          .eq("id", v.id);
      }
    }
  } catch {
    // Non-critical
  }
}
