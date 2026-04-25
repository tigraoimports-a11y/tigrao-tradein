import { NextRequest, NextResponse } from "next/server";

function auth(req: NextRequest) {
  return req.headers.get("x-admin-password") === process.env.ADMIN_PASSWORD;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");
  const { data, error } = await supabase
    .from("tradein_config")
    .select("*")
    .limit(1)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Extrair whatsapp config do campo labels
  const labels = (data?.labels && typeof data.labels === "object") ? data.labels as Record<string, unknown> : {};
  const result = { ...data };
  if (labels._whatsapp_principal) result.whatsapp_principal = labels._whatsapp_principal;
  if (labels._whatsapp_formularios) result.whatsapp_formularios = labels._whatsapp_formularios;
  if (labels._whatsapp_formularios_seminovos) result.whatsapp_formularios_seminovos = labels._whatsapp_formularios_seminovos;
  // WhatsApp por categoria de seminovo — permite roteamento granular (iPhone
  // vai pra X, iPad/MacBook/Watch pra Y, etc). Fallback no cliente cai em
  // whatsapp_formularios_seminovos se a categoria nao tiver numero especifico.
  if (labels._whatsapp_seminovo_iphone) result.whatsapp_seminovo_iphone = labels._whatsapp_seminovo_iphone;
  if (labels._whatsapp_seminovo_ipad) result.whatsapp_seminovo_ipad = labels._whatsapp_seminovo_ipad;
  if (labels._whatsapp_seminovo_macbook) result.whatsapp_seminovo_macbook = labels._whatsapp_seminovo_macbook;
  if (labels._whatsapp_seminovo_watch) result.whatsapp_seminovo_watch = labels._whatsapp_seminovo_watch;
  if (labels._whatsapp_vendedores) result.whatsapp_vendedores = labels._whatsapp_vendedores;
  if (labels._whatsapp_vendedores_nomes) result.whatsapp_vendedores_nomes = labels._whatsapp_vendedores_nomes;
  if (labels._whatsapp_vendedores_recebe_links) result.whatsapp_vendedores_recebe_links = labels._whatsapp_vendedores_recebe_links;
  if (labels._whatsapp_vendedores_ativo) result.whatsapp_vendedores_ativo = labels._whatsapp_vendedores_ativo;
  // Configuracao do SITE (landing /troca) — logo, influencers, posicionamento.
  // Mesmo padrao do _whatsapp_*: armazenado dentro de labels JSONB pra evitar
  // migrations. Veja /admin/configuracoes/site (Abr/2026).
  if (labels._site_logo_url !== undefined) result.site_logo_url = labels._site_logo_url;
  if (labels._site_logo_position !== undefined) result.site_logo_position = labels._site_logo_position;
  if (labels._site_influencers_enabled !== undefined) result.site_influencers_enabled = labels._site_influencers_enabled;
  if (labels._site_influencers !== undefined) result.site_influencers = labels._site_influencers;
  // Fase 2 (Abr/2026) — textos editaveis da landing + secao de feedbacks de
  // clientes (prints WhatsApp). Tudo no JSONB labels.
  if (labels._site_header_title !== undefined) result.site_header_title = labels._site_header_title;
  if (labels._site_header_tagline !== undefined) result.site_header_tagline = labels._site_header_tagline;
  if (labels._site_headline_p1 !== undefined) result.site_headline_p1 = labels._site_headline_p1;
  if (labels._site_headline_destaque !== undefined) result.site_headline_destaque = labels._site_headline_destaque;
  if (labels._site_headline_p2 !== undefined) result.site_headline_p2 = labels._site_headline_p2;
  if (labels._site_subtitle !== undefined) result.site_subtitle = labels._site_subtitle;
  if (labels._site_cta_text !== undefined) result.site_cta_text = labels._site_cta_text;
  if (labels._site_trust_1 !== undefined) result.site_trust_1 = labels._site_trust_1;
  if (labels._site_trust_2 !== undefined) result.site_trust_2 = labels._site_trust_2;
  if (labels._site_trust_3 !== undefined) result.site_trust_3 = labels._site_trust_3;
  if (labels._site_social_proof_text !== undefined) result.site_social_proof_text = labels._site_social_proof_text;
  if (labels._site_footer_line1 !== undefined) result.site_footer_line1 = labels._site_footer_line1;
  if (labels._site_footer_cnpj !== undefined) result.site_footer_cnpj = labels._site_footer_cnpj;
  if (labels._site_feedbacks_enabled !== undefined) result.site_feedbacks_enabled = labels._site_feedbacks_enabled;
  if (labels._site_feedbacks !== undefined) result.site_feedbacks = labels._site_feedbacks;

  return NextResponse.json({ data: result });
}

export async function PUT(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { supabase } = await import("@/lib/supabase");
  const body = await req.json();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.seminovos !== undefined) updates.seminovos = body.seminovos;
  if (body.origens !== undefined) updates.origens = body.origens;

  // Salvar whatsapp config dentro do campo labels (JSONB) pra não depender de colunas novas
  const whatsappFields = [
    "whatsapp_principal",
    "whatsapp_formularios",
    "whatsapp_formularios_seminovos",
    "whatsapp_seminovo_iphone",
    "whatsapp_seminovo_ipad",
    "whatsapp_seminovo_macbook",
    "whatsapp_seminovo_watch",
    "whatsapp_vendedores",
    "whatsapp_vendedores_nomes",
    "whatsapp_vendedores_recebe_links",
    "whatsapp_vendedores_ativo",
  ] as const;
  // Chaves de configuracao do SITE — mesmo padrao dos whatsapp_*. Salvas com
  // prefixo "_site_" dentro de labels JSONB (sem migration).
  const siteFields = [
    "site_logo_url",
    "site_logo_position",
    "site_influencers_enabled",
    "site_influencers",
    // Fase 2 (textos da landing + feedbacks de clientes)
    "site_header_title",
    "site_header_tagline",
    "site_headline_p1",
    "site_headline_destaque",
    "site_headline_p2",
    "site_subtitle",
    "site_cta_text",
    "site_trust_1",
    "site_trust_2",
    "site_trust_3",
    "site_social_proof_text",
    "site_footer_line1",
    "site_footer_cnpj",
    "site_feedbacks_enabled",
    "site_feedbacks",
  ] as const;
  const hasAnyWaField = whatsappFields.some((k) => body[k] !== undefined);
  const hasAnySiteField = siteFields.some((k) => body[k] !== undefined);
  if (hasAnyWaField || hasAnySiteField || body.labels !== undefined) {
    const { data: current } = await supabase.from("tradein_config").select("labels").limit(1).single();
    const currentLabels = (current?.labels && typeof current.labels === "object") ? current.labels as Record<string, unknown> : {};
    const newLabels = { ...currentLabels };
    if (body.labels !== undefined) Object.assign(newLabels, body.labels);
    for (const k of whatsappFields) {
      if (body[k] !== undefined) newLabels[`_${k}`] = body[k];
    }
    for (const k of siteFields) {
      if (body[k] !== undefined) newLabels[`_${k}`] = body[k];
    }
    updates.labels = newLabels;
  }

  // Get the single config row id
  const { data: existing } = await supabase
    .from("tradein_config")
    .select("id")
    .limit(1)
    .single();

  if (!existing) {
    // Insert if no row exists
    const { data, error } = await supabase
      .from("tradein_config")
      .insert({ ...updates })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  }

  const { data, error } = await supabase
    .from("tradein_config")
    .update(updates)
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
