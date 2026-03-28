import { NextResponse } from "next/server";

const DEFAULT_CONFIG = {
  seminovos: [
    { modelo: "iPhone 15 Pro", storages: ["128GB", "256GB"], ativo: true },
    { modelo: "iPhone 15 Pro Max", storages: ["256GB", "512GB"], ativo: true },
    { modelo: "iPhone 16 Pro", storages: ["128GB", "256GB"], ativo: true },
    { modelo: "iPhone 16 Pro Max", storages: ["256GB"], ativo: true },
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

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: DEFAULT_CONFIG });
  }
}
