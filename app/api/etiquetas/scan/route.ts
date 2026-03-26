import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

function auth(req: NextRequest) {
  const pw = req.headers.get("x-admin-password");
  return pw === process.env.ADMIN_PASSWORD;
}

// POST: Processar scan de código de barras (entrada ou saída)
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { codigo_barras, acao, usuario } = await req.json();

    if (!codigo_barras) {
      return NextResponse.json({ error: "Código de barras obrigatório" }, { status: 400 });
    }

    // Buscar etiqueta pelo código
    const { data: etiqueta, error: fetchError } = await supabase
      .from("etiquetas")
      .select("*")
      .eq("codigo_barras", codigo_barras)
      .single();

    if (fetchError || !etiqueta) {
      return NextResponse.json({ error: "Código não encontrado", codigo: codigo_barras }, { status: 404 });
    }

    // Se acao não foi especificada, determinar automaticamente
    const acaoFinal = acao || (etiqueta.status === "AGUARDANDO_ENTRADA" ? "ENTRADA" : etiqueta.status === "EM_ESTOQUE" ? "SAIDA" : null);

    if (!acaoFinal) {
      return NextResponse.json({
        error: "Este produto já saiu do estoque",
        etiqueta,
      }, { status: 400 });
    }

    if (acaoFinal === "ENTRADA") {
      if (etiqueta.status !== "AGUARDANDO_ENTRADA") {
        return NextResponse.json({ error: "Produto já deu entrada", etiqueta }, { status: 400 });
      }

      // 1. Atualizar status da etiqueta
      await supabase
        .from("etiquetas")
        .update({ status: "EM_ESTOQUE", data_entrada: new Date().toISOString() })
        .eq("id", etiqueta.id);

      // 2. Incrementar quantidade no estoque
      // Buscar produto correspondente no estoque pela combinação produto+cor
      const produtoNome = etiqueta.produto;
      const { data: estoqueRow } = await supabase
        .from("estoque")
        .select("*")
        .eq("produto", produtoNome)
        .eq("cor", etiqueta.cor || "")
        .maybeSingle();

      if (estoqueRow) {
        // Incrementar quantidade
        await supabase
          .from("estoque")
          .update({
            qnt: (estoqueRow.qnt || 0) + 1,
            status: "EM ESTOQUE",
            updated_at: new Date().toISOString(),
          })
          .eq("id", estoqueRow.id);

        // Vincular etiqueta ao estoque
        await supabase
          .from("etiquetas")
          .update({ estoque_id: estoqueRow.id })
          .eq("id", etiqueta.id);
      } else {
        // Auto-criar produto no estoque a partir da etiqueta
        const { data: newEstoque } = await supabase
          .from("estoque")
          .insert({
            produto: produtoNome,
            categoria: etiqueta.categoria || "OUTROS",
            cor: etiqueta.cor || "",
            qnt: 1,
            custo_unitario: etiqueta.custo_unitario || 0,
            fornecedor: etiqueta.fornecedor || "",
            status: "EM ESTOQUE",
            tipo: "NOVO",
          })
          .select()
          .single();

        if (newEstoque) {
          await supabase
            .from("etiquetas")
            .update({ estoque_id: newEstoque.id })
            .eq("id", etiqueta.id);
        }
      }

      // 3. Registrar movimentação
      await supabase.from("movimentacoes_estoque").insert({
        etiqueta_id: etiqueta.id,
        codigo_barras: etiqueta.codigo_barras,
        tipo: "ENTRADA",
        usuario: usuario || "admin",
        observacao: `Entrada confirmada: ${produtoNome}`,
      });

      const usuarioLog = (() => { const r = req.headers.get("x-admin-user") || usuario || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
      logActivity(usuarioLog, "Bipou entrada", `Produto: ${produtoNome}, Codigo: ${codigo_barras}`, "etiquetas", etiqueta.id).catch(() => {});

      return NextResponse.json({
        ok: true,
        acao: "ENTRADA",
        etiqueta: { ...etiqueta, status: "EM_ESTOQUE" },
        mensagem: `Entrada confirmada: ${produtoNome}`,
      });

    } else if (acaoFinal === "SAIDA") {
      if (etiqueta.status !== "EM_ESTOQUE") {
        return NextResponse.json({ error: "Produto não está em estoque", etiqueta }, { status: 400 });
      }

      // 1. Atualizar status da etiqueta
      await supabase
        .from("etiquetas")
        .update({ status: "SAIU", data_saida: new Date().toISOString() })
        .eq("id", etiqueta.id);

      // 2. Decrementar quantidade no estoque
      if (etiqueta.estoque_id) {
        const { data: estoqueRow } = await supabase
          .from("estoque")
          .select("*")
          .eq("id", etiqueta.estoque_id)
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
        }
      } else {
        // Tentar encontrar pelo nome do produto
        const { data: estoqueRow } = await supabase
          .from("estoque")
          .select("*")
          .eq("produto", etiqueta.produto)
          .eq("cor", etiqueta.cor || "")
          .maybeSingle();

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
        }
      }

      // 3. Registrar movimentação
      await supabase.from("movimentacoes_estoque").insert({
        etiqueta_id: etiqueta.id,
        codigo_barras: etiqueta.codigo_barras,
        tipo: "SAIDA",
        usuario: usuario || "admin",
        observacao: `Saída confirmada: ${etiqueta.produto}`,
      });

      const usuarioLog = (() => { const r = req.headers.get("x-admin-user") || usuario || "Sistema"; try { return decodeURIComponent(r); } catch { return r; } })();
      logActivity(usuarioLog, "Bipou saida", `Produto: ${etiqueta.produto}, Codigo: ${codigo_barras}`, "etiquetas", etiqueta.id).catch(() => {});

      return NextResponse.json({
        ok: true,
        acao: "SAIDA",
        etiqueta: { ...etiqueta, status: "SAIU" },
        mensagem: `Saída confirmada: ${etiqueta.produto}`,
      });
    }

    return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
