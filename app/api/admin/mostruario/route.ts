import { NextRequest, NextResponse } from "next/server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// GET — list all data: categorias, produtos (with variacoes), config
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");

  const [categoriasRes, produtosRes, variacoesRes, configRes] = await Promise.all([
    supabase
      .from("loja_categorias")
      .select("*")
      .order("ordem", { ascending: true }),
    supabase
      .from("loja_produtos")
      .select("*")
      .order("ordem", { ascending: true })
      .order("nome"),
    supabase
      .from("loja_variacoes")
      .select("*")
      .order("ordem", { ascending: true })
      .order("nome"),
    supabase
      .from("mostruario_config")
      .select("*")
      .limit(1)
      .single(),
  ]);

  if (categoriasRes.error) return NextResponse.json({ error: categoriasRes.error.message }, { status: 500 });
  if (produtosRes.error) return NextResponse.json({ error: produtosRes.error.message }, { status: 500 });
  if (variacoesRes.error) return NextResponse.json({ error: variacoesRes.error.message }, { status: 500 });

  // Group variacoes by produto_id
  const variacoesByProduto = new Map<string, typeof variacoesRes.data>();
  for (const v of variacoesRes.data ?? []) {
    const list = variacoesByProduto.get(v.produto_id) ?? [];
    list.push(v);
    variacoesByProduto.set(v.produto_id, list);
  }

  // Attach variacoes to produtos
  const produtos = (produtosRes.data ?? []).map((p) => ({
    ...p,
    variacoes: variacoesByProduto.get(p.id) ?? [],
  }));

  // Debug: log config fetch result
  console.log("mostruario_config fetch:", { data: configRes.data, error: configRes.error?.message });

  const config = configRes.data ?? {
    banner_titulo: "Produtos Apple Originais",
    banner_subtitulo: "Nota fiscal no seu nome | Lacrados | 1 ano garantia Apple",
    banner_image_url: null,
    accent_color: "#E8740E",
    whatsapp_numero: "5521999999999",
    tema: "tigrao",
    manutencao: false,
  };

  return NextResponse.json({
    categorias: categoriasRes.data ?? [],
    produtos,
    config,
  });
}

// POST — Create operations
export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { supabase } = await import("@/lib/supabase");
  const { action } = body;

  // ── Create Categoria ──
  if (action === "create_categoria") {
    const { nome, emoji } = body;
    if (!nome) return NextResponse.json({ error: "Missing nome" }, { status: 400 });

    const slug = slugify(nome);

    // Get max ordem
    const { data: maxData } = await supabase
      .from("loja_categorias")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1);
    const nextOrdem = (maxData?.[0]?.ordem ?? 0) + 1;

    const { data, error } = await supabase
      .from("loja_categorias")
      .insert({ nome, slug, emoji: emoji || "📦", ordem: nextOrdem, visivel: true })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  // ── Create Produto ──
  if (action === "create_produto") {
    const { nome, categoria_id, descricao, descricao_curta, tags, imagem_url } = body;
    if (!nome) return NextResponse.json({ error: "Missing nome" }, { status: 400 });

    let slug = slugify(nome);

    // Ensure unique slug
    const { data: existing } = await supabase
      .from("loja_produtos")
      .select("slug")
      .eq("slug", slug);
    if (existing && existing.length > 0) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Get max ordem
    const { data: maxData } = await supabase
      .from("loja_produtos")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1);
    const nextOrdem = (maxData?.[0]?.ordem ?? 0) + 1;

    const row: Record<string, unknown> = {
      nome,
      slug,
      ordem: nextOrdem,
      visivel: true,
    };
    if (categoria_id) row.categoria_id = categoria_id;
    if (descricao) row.descricao = descricao;
    if (descricao_curta) row.descricao_curta = descricao_curta;
    if (tags) row.tags = tags;
    if (imagem_url) row.imagem_url = imagem_url;

    const { data, error } = await supabase
      .from("loja_produtos")
      .insert(row)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  // ── Create Variacao ──
  if (action === "create_variacao") {
    const { produto_id, nome, atributos, preco, preco_parcelado, imagem_url } = body;
    if (!produto_id || !nome) return NextResponse.json({ error: "Missing produto_id or nome" }, { status: 400 });

    // Get max ordem for this product
    const { data: maxData } = await supabase
      .from("loja_variacoes")
      .select("ordem")
      .eq("produto_id", produto_id)
      .order("ordem", { ascending: false })
      .limit(1);
    const nextOrdem = (maxData?.[0]?.ordem ?? 0) + 1;

    const row: Record<string, unknown> = {
      produto_id,
      nome,
      atributos: atributos ?? {},
      preco: Number(preco) || 0,
      ordem: nextOrdem,
    };
    if (preco_parcelado !== undefined) row.preco_parcelado = preco_parcelado;
    if (imagem_url) row.imagem_url = imagem_url;

    const { data, error } = await supabase
      .from("loja_variacoes")
      .insert(row)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// PATCH — Update operations
export async function PATCH(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { supabase } = await import("@/lib/supabase");
  const { action } = body;

  // ── Update Categoria ──
  if (action === "update_categoria") {
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const allowed = ["nome", "emoji", "ordem", "visivel", "slug"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) update[key] = fields[key];
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const { error } = await supabase.from("loja_categorias").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Update Produto ──
  if (action === "update_produto") {
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const allowed = ["nome", "slug", "categoria_id", "descricao", "descricao_curta", "imagem_url", "tags", "destaque", "visivel", "ordem"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) update[key] = fields[key];
    }
    update.updated_at = new Date().toISOString();

    if (Object.keys(update).length <= 1) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const { error } = await supabase.from("loja_produtos").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Update Variacao ──
  if (action === "update_variacao") {
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const allowed = ["nome", "atributos", "preco", "preco_parcelado", "imagem_url", "visivel", "ordem"];
    const update: Record<string, unknown> = {};
    for (const key of allowed) {
      if (fields[key] !== undefined) update[key] = fields[key];
    }
    if (update.preco !== undefined) update.preco = Number(update.preco);

    if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    const { error } = await supabase.from("loja_variacoes").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Reorder Produtos ──
  if (action === "reorder_produtos") {
    const { items } = body;
    if (!Array.isArray(items)) return NextResponse.json({ error: "Missing items array" }, { status: 400 });

    const updates = items.map((item: { id: string; ordem: number }) =>
      supabase.from("loja_produtos").update({ ordem: item.ordem }).eq("id", item.id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Reorder Categorias ──
  if (action === "reorder_categorias") {
    const { items } = body;
    if (!Array.isArray(items)) return NextResponse.json({ error: "Missing items array" }, { status: 400 });

    const updates = items.map((item: { id: string; ordem: number }) =>
      supabase.from("loja_categorias").update({ ordem: item.ordem }).eq("id", item.id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Update Config ──
  if (action === "update_config") {
    const allowedFields = ["banner_titulo", "banner_subtitulo", "banner_image_url", "accent_color", "whatsapp_numero", "tema", "tema_tradein", "tema_tradein_noite", "manutencao"];
    const update: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) update[key] = body[key];
    }

    if (Object.keys(update).length === 0) return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });

    // First check if a config row exists
    const { data: existing } = await supabase.from("mostruario_config").select("id").limit(1).single();

    let error;
    if (existing?.id) {
      // Update existing row
      const res = await supabase.from("mostruario_config").update(update).eq("id", existing.id);
      error = res.error;
      console.log("Config UPDATE result:", { id: existing.id, update, error: res.error?.message });
    } else {
      // Insert new row
      const res = await supabase.from("mostruario_config").insert({ ...update });
      error = res.error;
      console.log("Config INSERT result:", { update, error: res.error?.message });
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// DELETE — Delete operations
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { supabase } = await import("@/lib/supabase");
  const { action, id } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // ── Delete Categoria ──
  if (action === "delete_categoria") {
    // First delete all products in this category (cascades to variacoes)
    const { data: prods } = await supabase
      .from("loja_produtos")
      .select("id")
      .eq("categoria_id", id);

    if (prods && prods.length > 0) {
      const prodIds = prods.map((p) => p.id);
      // Variacoes cascade-delete automatically
      await supabase.from("loja_produtos").delete().in("id", prodIds);
    }

    const { error } = await supabase.from("loja_categorias").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Delete Produto ──
  if (action === "delete_produto") {
    // Variacoes cascade-delete automatically via ON DELETE CASCADE
    const { error } = await supabase.from("loja_produtos").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Delete Variacao ──
  if (action === "delete_variacao") {
    const { error } = await supabase.from("loja_variacoes").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
