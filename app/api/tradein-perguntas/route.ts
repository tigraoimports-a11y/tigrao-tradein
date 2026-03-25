import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { TradeInQuestion } from "@/lib/types";

// Default questions fallback (when Supabase is empty/unavailable)
const DEFAULT_QUESTIONS: Omit<TradeInQuestion, "id">[] = [
  {
    slug: "hasDamage",
    titulo: "O aparelho esta trincado, quebrado ou com defeito?",
    tipo: "yesno",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "yes", label: "Sim", discount: 0, variant: "error", reject: true, rejectMessage: "Infelizmente nao aceitamos aparelhos com tela trincada, quebrada ou com defeito na troca." },
    ],
    ordem: 1,
    ativo: true,
    config: {},
    device_type: "iphone",
  },
  {
    slug: "battery",
    titulo: "Saude da bateria",
    tipo: "numeric",
    opcoes: [],
    ordem: 2,
    ativo: true,
    config: {
      min: 1,
      max: 100,
      unit: "%",
      placeholder: "Ex: 87",
      helpText: "Ajustes > Bateria > Saude da Bateria",
      thresholds: [{ below: 85, discount: -200 }],
    },
    device_type: "iphone",
  },
  {
    slug: "screenScratch",
    titulo: "Riscos na tela",
    tipo: "selection",
    opcoes: [
      { value: "none", label: "Nenhum", discount: 0 },
      { value: "one", label: "1 risco", discount: -100 },
      { value: "multiple", label: "2 ou mais", discount: -250 },
    ],
    ordem: 3,
    ativo: true,
    config: {},
    device_type: "iphone",
  },
  {
    slug: "sideScratch",
    titulo: "Riscos laterais",
    tipo: "selection",
    opcoes: [
      { value: "none", label: "Nenhum", discount: 0 },
      { value: "one", label: "1 risco", discount: -100 },
      { value: "multiple", label: "2 ou mais", discount: -250 },
    ],
    ordem: 4,
    ativo: true,
    config: {},
    device_type: "iphone",
  },
  {
    slug: "peeling",
    titulo: "Descascado / Amassado",
    tipo: "selection",
    opcoes: [
      { value: "none", label: "Nao", discount: 0 },
      { value: "light", label: "Leve", discount: -200 },
      { value: "heavy", label: "Forte", discount: -300 },
    ],
    ordem: 5,
    ativo: true,
    config: {},
    device_type: "iphone",
  },
  {
    slug: "partsReplaced",
    titulo: "O aparelho ja teve alguma peca trocada?",
    tipo: "selection",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "apple", label: "Sim, na Apple (autorizada)", discount: 0, variant: "success" },
      { value: "thirdParty", label: "Sim, fora da Apple", discount: 0, variant: "error", reject: true, rejectMessage: "Infelizmente nao aceitamos aparelhos com pecas trocadas fora da rede autorizada Apple." },
    ],
    ordem: 6,
    ativo: true,
    config: { showDetailInputOnValue: "apple", detailPlaceholder: "Ex: Tela, Bateria, Alto-falante..." },
    device_type: "iphone",
  },
  {
    slug: "hasWarranty",
    titulo: "Ainda esta na garantia Apple de 12 meses?",
    tipo: "yesno",
    opcoes: [
      { value: "yes", label: "Sim", discount: 0, variant: "success" },
      { value: "no", label: "Nao", discount: 0 },
    ],
    ordem: 7,
    ativo: true,
    config: {},
    device_type: "iphone",
  },
  {
    slug: "warrantyMonth",
    titulo: "Ate qual mes vai a garantia do seu aparelho?",
    tipo: "conditional_date",
    opcoes: [],
    ordem: 8,
    ativo: true,
    config: {
      dependsOn: "hasWarranty",
      showWhenValue: "yes",
      bonuses: { ate3m: 0.03, de3a6m: 0.05, acima6m: 0.07 },
    },
    device_type: "iphone",
  },
  {
    slug: "hasOriginalBox",
    titulo: "Ainda tem a caixa original do aparelho?",
    tipo: "yesno",
    opcoes: [
      { value: "yes", label: "Sim", discount: 0, variant: "success" },
      { value: "no", label: "Nao", discount: -100 },
    ],
    ordem: 9,
    ativo: true,
    config: {},
    device_type: "iphone",
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceType = searchParams.get("device_type") || "iphone";

  try {
    const { data, error } = await supabase
      .from("tradein_perguntas")
      .select("*")
      .eq("device_type", deviceType)
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (error || !data || data.length === 0) {
      // Fallback to defaults
      return NextResponse.json({
        data: DEFAULT_QUESTIONS.filter((q) => q.device_type === deviceType),
      });
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({
      data: DEFAULT_QUESTIONS.filter((q) => q.device_type === deviceType),
    });
  }
}
