import { NextResponse } from "next/server";

const DEFAULT_CONFIG = {
  seminovos: [
    { modelo: "iPhone 15 Pro", storages: ["128GB", "256GB"], ativo: true, categoria: "iphone" },
    { modelo: "iPhone 15 Pro Max", storages: ["256GB", "512GB"], ativo: true, categoria: "iphone" },
    { modelo: "iPhone 16 Pro", storages: ["128GB", "256GB"], ativo: true, categoria: "iphone" },
    { modelo: "iPhone 16 Pro Max", storages: ["256GB"], ativo: true, categoria: "iphone" },
  ],
  labels: {
    step1_titulo: "Qual é o modelo do seu usado?",
    step2_titulo: "Voce deseja comprar um...",
    lacrado_label: "Lacrado",
    lacrado_desc: "Novo, na caixa. 1 ano de garantia Apple, nota fiscal",
    seminovo_label: "Seminovo",
    seminovo_desc: "Usado, revisado, com garantia de 3 meses, nota fiscal",
    seminovo_info: "Aparelhos revisados e em excelente estado. O valor e condicoes serao informados por WhatsApp.",
    step3_nome_label: "Seu nome",
    step3_nome_placeholder: "Como podemos te chamar?",
    step3_whatsapp_label: "WhatsApp com DDD",
    step3_whatsapp_placeholder: "(21) 99999-9999",
    step3_instagram_label: "Instagram (opcional)",
    step3_instagram_placeholder: "@seuperfil",
    step3_origem_label: "Como nos encontrou?",
  },
  origens: ["Anúncio", "Story", "Direct", "WhatsApp", "Indicação", "Já sou cliente"],
};

export async function GET() {
  try {
    const { supabase } = await import("@/lib/supabase");
    const { data, error } = await supabase
      .from("tradein_config")
      .select("*")
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ data: DEFAULT_CONFIG });
    }

    // Extrair whatsapp config do campo labels (onde salvamos pra evitar dependencia de colunas)
    const labels = (data.labels && typeof data.labels === "object") ? data.labels as Record<string, unknown> : {};
    const result = { ...data };
    if (labels._whatsapp_principal) result.whatsapp_principal = labels._whatsapp_principal;
    if (labels._whatsapp_formularios) result.whatsapp_formularios = labels._whatsapp_formularios;
    if (labels._whatsapp_formularios_seminovos) result.whatsapp_formularios_seminovos = labels._whatsapp_formularios_seminovos;
    // WhatsApp por categoria de seminovo (fallback: whatsapp_formularios_seminovos).
    if (labels._whatsapp_seminovo_iphone) result.whatsapp_seminovo_iphone = labels._whatsapp_seminovo_iphone;
    if (labels._whatsapp_seminovo_ipad) result.whatsapp_seminovo_ipad = labels._whatsapp_seminovo_ipad;
    if (labels._whatsapp_seminovo_macbook) result.whatsapp_seminovo_macbook = labels._whatsapp_seminovo_macbook;
    if (labels._whatsapp_seminovo_watch) result.whatsapp_seminovo_watch = labels._whatsapp_seminovo_watch;
    if (labels._whatsapp_vendedores) result.whatsapp_vendedores = labels._whatsapp_vendedores;

    // Backfill defensivo: garante que todo seminovo tenha categoria (fallback iphone).
    // Cobre linhas antigas do banco que ainda não passaram pela migration.
    if (Array.isArray(result.seminovos)) {
      result.seminovos = (result.seminovos as Record<string, unknown>[]).map((s) => ({
        ...s,
        categoria: (s.categoria as string) || "iphone",
      }));
    }

    return NextResponse.json({ data: result });
  } catch {
    return NextResponse.json({ data: DEFAULT_CONFIG });
  }
}
