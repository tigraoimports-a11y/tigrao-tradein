import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchUsedValues, fetchExcludedModels, fetchDiscountRules, fetchModelDiscounts } from "@/lib/sheets";
import { gerarSkuSafe, detectarCategoriaPorTexto } from "@/lib/sku";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

// Auto-popular SKU canonico em rows de avaliacao_usados.
// Sempre tipo=SEMINOVO; categoria detectada pelo nome do modelo.
// Sem cor (avaliacao_usados nao guarda cor — preco e o mesmo independente).
function addSkuUsado(row: Record<string, unknown>): void {
  if (row.sku) return;
  const modelo = String(row.modelo || "");
  const storage = String(row.armazenamento || "");
  if (!modelo) return;
  const sku = gerarSkuSafe({
    produto: `${modelo} ${storage}`.trim(),
    categoria: detectarCategoriaPorTexto(modelo),
    cor: null,
    observacao: null,
    tipo: "SEMINOVO",
  });
  if (sku) row.sku = sku;
}

// PUT: Importar tudo do Google Sheets para o Supabase
export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [usedValues, excludedModels, discountRules, modelDiscounts] = await Promise.all([
      fetchUsedValues(),
      fetchExcludedModels(),
      fetchDiscountRules(),
      fetchModelDiscounts(),
    ]);

    const now = new Date().toISOString();
    let importedValores = 0;
    let importedDescontos = 0;
    let importedExcluidos = 0;
    let importedDescontosModelo = 0;

    // 1. Valores Base
    if (usedValues.length > 0) {
      const rows = usedValues.map((v) => {
        const row: Record<string, unknown> = {
          modelo: v.modelo,
          armazenamento: v.armazenamento,
          valor_base: v.valorBase,
          updated_at: now,
        };
        addSkuUsado(row);
        return row;
      });
      const { error } = await supabase.from("avaliacao_usados").upsert(rows, { onConflict: "modelo,armazenamento" });
      if (!error) importedValores = rows.length;
    }

    // 2. Descontos Condição (gerais)
    if (discountRules.length > 0) {
      const rows = discountRules.map((d) => ({
        condicao: d.condicao,
        detalhe: d.detalhe,
        desconto: d.desconto,
        updated_at: now,
      }));
      const { error } = await supabase.from("descontos_condicao").upsert(rows, { onConflict: "condicao,detalhe" });
      if (!error) importedDescontos = rows.length;
    }

    // 3. Descontos por Modelo (nested Record: modelo -> condicao -> detalhe -> desconto)
    if (Object.keys(modelDiscounts).length > 0) {
      const rows: { condicao: string; detalhe: string; desconto: number; updated_at: string }[] = [];
      for (const [modelo, condicoes] of Object.entries(modelDiscounts)) {
        for (const [condicao, detalhes] of Object.entries(condicoes)) {
          for (const [detalhe, desconto] of Object.entries(detalhes)) {
            rows.push({
              condicao: `${modelo} - ${condicao}`,
              detalhe,
              desconto,
              updated_at: now,
            });
          }
        }
      }
      if (rows.length > 0) {
        const { error } = await supabase.from("descontos_condicao").upsert(rows, { onConflict: "condicao,detalhe" });
        if (!error) importedDescontosModelo = rows.length;
      }
    }

    // 4. Modelos Excluídos
    if (excludedModels.length > 0) {
      const rows = excludedModels.map((m) => ({ modelo: m }));
      const { error } = await supabase.from("modelos_excluidos").upsert(rows, { onConflict: "modelo" });
      if (!error) importedExcluidos = rows.length;
    }

    return NextResponse.json({
      ok: true,
      importedValores,
      importedDescontos,
      importedDescontosModelo,
      importedExcluidos,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET: Listar todos os valores de avaliação, descontos e excluídos
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [valores, descontos, excluidos, catConfig, garantias] = await Promise.all([
    supabase.from("avaliacao_usados").select("*").order("modelo").order("armazenamento"),
    supabase.from("descontos_condicao").select("*").order("condicao").order("detalhe"),
    supabase.from("modelos_excluidos").select("*").order("modelo"),
    supabase.from("tradein_categoria_config").select("*"),
    supabase.from("tradein_garantia").select("*").order("modelo").order("armazenamento"),
  ]);

  return NextResponse.json({
    valores: valores.data ?? [],
    descontos: descontos.data ?? [],
    excluidos: excluidos.data ?? [],
    catConfig: catConfig.data ?? [],
    garantias: garantias.data ?? [],
  });
}

// POST: Upsert valor de avaliação
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  if (action === "upsert_valor") {
    const { modelo, armazenamento, valor_base } = body;
    const row: Record<string, unknown> = { modelo, armazenamento, valor_base, updated_at: new Date().toISOString() };
    addSkuUsado(row);
    const { error } = await supabase.from("avaliacao_usados").upsert(
      row,
      { onConflict: "modelo,armazenamento" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "upsert_desconto") {
    const { condicao, detalhe, desconto } = body;
    const { error } = await supabase.from("descontos_condicao").upsert(
      { condicao, detalhe, desconto, updated_at: new Date().toISOString() },
      { onConflict: "condicao,detalhe" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_desconto") {
    const { condicao, detalhe } = body;
    const { error } = await supabase.from("descontos_condicao").delete().eq("condicao", condicao).eq("detalhe", detalhe);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "add_excluido") {
    const { modelo } = body;
    const { error } = await supabase.from("modelos_excluidos").upsert(
      { modelo },
      { onConflict: "modelo" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "remove_excluido") {
    const { modelo } = body;
    const { error } = await supabase.from("modelos_excluidos").delete().eq("modelo", modelo);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_valor") {
    const { id } = body;
    const { error } = await supabase.from("avaliacao_usados").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "rename_storage") {
    // Renomeia a string do campo `armazenamento` pra um par (modelo, armazenamento).
    // Atualiza em cascata avaliacao_usados + tradein_garantia. Valida colisao com
    // o mesmo par (modelo, armazenamento_novo) antes — se ja existe, recusa.
    const { modelo, armazenamento_antigo, armazenamento_novo } = body;
    if (!modelo || !armazenamento_antigo || armazenamento_novo === undefined) {
      return NextResponse.json({ error: "modelo, armazenamento_antigo e armazenamento_novo required" }, { status: 400 });
    }
    const antigo = String(armazenamento_antigo).trim();
    const novo = String(armazenamento_novo).trim();
    if (!antigo || !novo) return NextResponse.json({ error: "armazenamento nao pode ser vazio" }, { status: 400 });
    if (antigo === novo) return NextResponse.json({ ok: true, renamed: 0 });

    const { data: colisao } = await supabase
      .from("avaliacao_usados")
      .select("id")
      .eq("modelo", modelo)
      .eq("armazenamento", novo)
      .maybeSingle();
    if (colisao) {
      return NextResponse.json({ error: `Ja existe "${modelo}" com armazenamento "${novo}". Renomeie ou apague antes.` }, { status: 409 });
    }

    const e1 = await supabase.from("avaliacao_usados").update({ armazenamento: novo }).eq("modelo", modelo).eq("armazenamento", antigo);
    if (e1.error) return NextResponse.json({ error: `avaliacao_usados: ${e1.error.message}` }, { status: 500 });

    const e2 = await supabase.from("tradein_garantia").update({ armazenamento: novo }).eq("modelo", modelo).eq("armazenamento", antigo);
    if (e2.error) return NextResponse.json({ error: `tradein_garantia: ${e2.error.message}` }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  // Toggle modo (automatico/manual) ou ativo (true/false) por categoria
  if (action === "update_cat_config") {
    const { categoria, modo, ativo } = body;
    if (!categoria) return NextResponse.json({ error: "categoria required" }, { status: 400 });
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (modo !== undefined) upd.modo = modo;
    if (ativo !== undefined) upd.ativo = ativo;
    const { error } = await supabase.from("tradein_categoria_config").upsert(
      { categoria, ...upd },
      { onConflict: "categoria" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Upsert garantia individual por modelo+armazenamento
  if (action === "upsert_garantia") {
    const { modelo, armazenamento, valor_garantia } = body;
    if (!modelo || !armazenamento) return NextResponse.json({ error: "modelo e armazenamento required" }, { status: 400 });
    const { error } = await supabase.from("tradein_garantia").upsert(
      { modelo, armazenamento, valor_garantia: Number(valor_garantia) || 0, updated_at: new Date().toISOString() },
      { onConflict: "modelo,armazenamento" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "rename_modelo") {
    // Renomeia um modelo em cascata pelas 4 tabelas que usam a string do
    // modelo como chave. Valida colisao antes — se ja existe uma row com
    // o novo nome + mesmo armazenamento em avaliacao_usados, recusa.
    const { modelo_antigo, modelo_novo } = body;
    if (!modelo_antigo || !modelo_novo) {
      return NextResponse.json({ error: "modelo_antigo e modelo_novo required" }, { status: 400 });
    }
    const antigo = String(modelo_antigo).trim();
    const novo = String(modelo_novo).trim();
    if (!antigo || !novo) return NextResponse.json({ error: "nomes nao podem ser vazios" }, { status: 400 });
    if (antigo === novo) return NextResponse.json({ ok: true, renamed: 0 });

    // 1. Pega storages atuais do modelo antigo
    const { data: rows } = await supabase
      .from("avaliacao_usados")
      .select("armazenamento")
      .eq("modelo", antigo);
    const storages = (rows ?? []).map((r) => r.armazenamento);

    // 2. Verifica colisao: algum row (modelo_novo, storage) ja existe?
    if (storages.length > 0) {
      const { data: colisoes } = await supabase
        .from("avaliacao_usados")
        .select("modelo,armazenamento")
        .eq("modelo", novo)
        .in("armazenamento", storages);
      if (colisoes && colisoes.length > 0) {
        return NextResponse.json({
          error: `Ja existe "${novo}" com armazenamentos: ${colisoes.map((c) => c.armazenamento).join(", ")}. Apague ou renomeie antes.`,
        }, { status: 409 });
      }
    }

    // 3. UPDATE em cascata. Se qualquer uma falhar, retorna erro imediato
    // (parcial — mas o DB fica consistente pra proximo retry porque o
    // update nao acontece nas tabelas seguintes).
    const e1 = await supabase.from("avaliacao_usados").update({ modelo: novo }).eq("modelo", antigo);
    if (e1.error) return NextResponse.json({ error: `avaliacao_usados: ${e1.error.message}` }, { status: 500 });

    const e2 = await supabase.from("modelos_excluidos").update({ modelo: novo }).eq("modelo", antigo);
    if (e2.error) return NextResponse.json({ error: `modelos_excluidos: ${e2.error.message}` }, { status: 500 });

    const e3 = await supabase.from("tradein_garantia").update({ modelo: novo }).eq("modelo", antigo);
    if (e3.error) return NextResponse.json({ error: `tradein_garantia: ${e3.error.message}` }, { status: 500 });

    // 4. descontos_condicao usa formato "{modelo} - {detalhe}". Busca todas
    // que comecam com o nome antigo + " - " e troca o prefixo.
    const { data: descsAfetados } = await supabase
      .from("descontos_condicao")
      .select("condicao")
      .like("condicao", `${antigo} - %`);
    if (descsAfetados && descsAfetados.length > 0) {
      for (const d of descsAfetados) {
        const novaCondicao = `${novo}${d.condicao.substring(antigo.length)}`;
        const e4 = await supabase
          .from("descontos_condicao")
          .update({ condicao: novaCondicao })
          .eq("condicao", d.condicao);
        if (e4.error) return NextResponse.json({ error: `descontos_condicao: ${e4.error.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      renamed: storages.length,
      descontos_atualizados: descsAfetados?.length || 0,
    });
  }

  if (action === "delete_modelo_full") {
    // Apaga um modelo por completo: todas as rows de avaliacao_usados +
    // cascata em modelos_excluidos, tradein_garantia e descontos_condicao
    // (linhas com condicao "{modelo} - *"). Usar quando precisa remover um
    // modelo cadastrado errado ou obsoleto (diferente de "excluir do
    // simulador", que so marca como invisivel mas mantem os valores).
    const { modelo } = body;
    if (!modelo) return NextResponse.json({ error: "modelo required" }, { status: 400 });
    const nome = String(modelo).trim();
    if (!nome) return NextResponse.json({ error: "modelo nao pode ser vazio" }, { status: 400 });

    const d1 = await supabase.from("avaliacao_usados").delete().eq("modelo", nome);
    if (d1.error) return NextResponse.json({ error: `avaliacao_usados: ${d1.error.message}` }, { status: 500 });

    const d2 = await supabase.from("modelos_excluidos").delete().eq("modelo", nome);
    if (d2.error) return NextResponse.json({ error: `modelos_excluidos: ${d2.error.message}` }, { status: 500 });

    const d3 = await supabase.from("tradein_garantia").delete().eq("modelo", nome);
    if (d3.error) return NextResponse.json({ error: `tradein_garantia: ${d3.error.message}` }, { status: 500 });

    const d4 = await supabase.from("descontos_condicao").delete().like("condicao", `${nome} - %`);
    if (d4.error) return NextResponse.json({ error: `descontos_condicao: ${d4.error.message}` }, { status: 500 });

    return NextResponse.json({ ok: true });
  }

  if (action === "import_defaults") {
    // Importar valores padrão do CLAUDE.md/fallback
    const defaults = body.valores as { modelo: string; armazenamento: string; valor_base: number }[];
    if (!defaults?.length) return NextResponse.json({ error: "valores required" }, { status: 400 });

    const rows = defaults.map((d) => {
      const row: Record<string, unknown> = { ...d, updated_at: new Date().toISOString() };
      addSkuUsado(row);
      return row;
    });
    const { error } = await supabase.from("avaliacao_usados").upsert(
      rows,
      { onConflict: "modelo,armazenamento" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, imported: defaults.length });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
