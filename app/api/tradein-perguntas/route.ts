import { NextRequest, NextResponse } from "next/server";
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
    slug: "hasWearMarks",
    titulo: "Seu aparelho possui marcas de uso?",
    tipo: "yesno",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "yes", label: "Sim", discount: 0 },
    ],
    ordem: 3,
    ativo: true,
    config: {},
    device_type: "iphone",
  },
  {
    slug: "wearMarks",
    titulo: "Selecione as marcas de uso:",
    tipo: "multiselect",
    opcoes: [
      { value: "screen_scratches", label: "Arranhoes na tela", discount: -200 },
      { value: "side_marks", label: "Marcas nas laterais", discount: -200 },
      { value: "light_peeling", label: "Descascado leve", discount: -200 },
      { value: "heavy_peeling", label: "Descascado forte", discount: -300 },
    ],
    ordem: 4,
    ativo: true,
    config: { dependsOn: "hasWearMarks", showWhenValue: "yes" },
    device_type: "iphone",
  },
  // Legacy questions (disabled by default in new installs)
  {
    slug: "screenScratch",
    titulo: "Riscos na tela",
    tipo: "selection",
    opcoes: [
      { value: "none", label: "Nenhum", discount: 0 },
      { value: "one", label: "1 risco", discount: -100 },
      { value: "multiple", label: "2 ou mais", discount: -250 },
    ],
    ordem: 13,
    ativo: false,
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
    ordem: 14,
    ativo: false,
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
    ordem: 15,
    ativo: false,
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
    ordem: 5,
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
    ordem: 6,
    ativo: true,
    config: {},
    device_type: "iphone",
  },
  {
    slug: "warrantyMonth",
    titulo: "Ate qual mes vai a garantia do seu aparelho?",
    tipo: "conditional_date",
    opcoes: [],
    ordem: 7,
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
    ordem: 8,
    ativo: true,
    config: {},
    device_type: "iphone",
  },

  // ── iPAD ──
  {
    slug: "hasDamage", titulo: "O iPad esta trincado, quebrado ou com defeito?", tipo: "yesno",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "yes", label: "Sim", discount: 0, variant: "error", reject: true, rejectMessage: "Infelizmente nao aceitamos iPads com tela trincada, quebrada ou com defeito na troca." },
    ],
    ordem: 1, ativo: true, config: {}, device_type: "ipad",
  },
  {
    slug: "battery", titulo: "Saude da bateria", tipo: "numeric", opcoes: [],
    ordem: 2, ativo: true, config: { min: 1, max: 100, unit: "%", placeholder: "Ex: 92", helpText: "Ajustes > Bateria > Saude da Bateria", thresholds: [{ below: 85, discount: -200 }] },
    device_type: "ipad",
  },
  {
    slug: "hasWearMarks", titulo: "Seu iPad possui marcas de uso?", tipo: "yesno",
    opcoes: [ { value: "no", label: "Nao", discount: 0, variant: "success" }, { value: "yes", label: "Sim", discount: 0 } ],
    ordem: 3, ativo: true, config: {}, device_type: "ipad",
  },
  {
    slug: "wearMarks", titulo: "Selecione as marcas de uso:", tipo: "multiselect",
    opcoes: [
      { value: "screen_scratches", label: "Arranhoes na tela", discount: -200 },
      { value: "side_marks", label: "Marcas nas laterais", discount: -200 },
      { value: "back_marks", label: "Marcas na traseira", discount: -150 },
      { value: "light_peeling", label: "Descascado leve", discount: -200 },
      { value: "heavy_peeling", label: "Descascado forte", discount: -300 },
    ],
    ordem: 4, ativo: true, config: { dependsOn: "hasWearMarks", showWhenValue: "yes" }, device_type: "ipad",
  },
  {
    slug: "partsReplaced", titulo: "O iPad ja teve alguma peca trocada?", tipo: "selection",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "apple", label: "Sim, na Apple (autorizada)", discount: 0, variant: "success" },
      { value: "thirdParty", label: "Sim, fora da Apple", discount: 0, variant: "error", reject: true, rejectMessage: "Infelizmente nao aceitamos iPads com pecas trocadas fora da rede autorizada Apple." },
    ],
    ordem: 5, ativo: true, config: { showDetailInputOnValue: "apple", detailPlaceholder: "Ex: Tela, Bateria..." }, device_type: "ipad",
  },
  {
    slug: "hasWarranty", titulo: "Ainda esta na garantia Apple de 12 meses?", tipo: "yesno",
    opcoes: [ { value: "yes", label: "Sim", discount: 0, variant: "success" }, { value: "no", label: "Nao", discount: 0 } ],
    ordem: 6, ativo: true, config: {}, device_type: "ipad",
  },
  {
    slug: "warrantyMonth", titulo: "Ate qual mes vai a garantia?", tipo: "conditional_date", opcoes: [],
    ordem: 7, ativo: true, config: { dependsOn: "hasWarranty", showWhenValue: "yes", bonuses: { ate3m: 0.03, de3a6m: 0.05, acima6m: 0.07 } }, device_type: "ipad",
  },
  {
    slug: "hasOriginalBox", titulo: "Ainda tem a caixa original?", tipo: "yesno",
    opcoes: [ { value: "yes", label: "Sim", discount: 0, variant: "success" }, { value: "no", label: "Nao", discount: -100 } ],
    ordem: 8, ativo: true, config: {}, device_type: "ipad",
  },

  // ── MacBook ──
  {
    slug: "hasDamage", titulo: "O MacBook esta trincado, quebrado ou com defeito?", tipo: "yesno",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "yes", label: "Sim", discount: 0, variant: "error", reject: true, rejectMessage: "Infelizmente nao aceitamos MacBooks com tela trincada, quebrada ou com defeito na troca." },
    ],
    ordem: 1, ativo: true, config: {}, device_type: "macbook",
  },
  {
    slug: "battery", titulo: "Ciclos de bateria", tipo: "numeric", opcoes: [],
    ordem: 2, ativo: true, config: { min: 1, max: 2000, unit: " ciclos", placeholder: "Ex: 250", helpText: "Menu Apple > Sobre Este Mac > Relatorio do Sistema > Energia > Contagem de Ciclos", thresholds: [{ below: 300, discount: 0 }, { below: 500, discount: -200 }, { below: 9999, discount: -400 }] },
    device_type: "macbook",
  },
  {
    slug: "hasWearMarks", titulo: "Seu MacBook possui marcas de uso?", tipo: "yesno",
    opcoes: [ { value: "no", label: "Nao", discount: 0, variant: "success" }, { value: "yes", label: "Sim", discount: 0 } ],
    ordem: 3, ativo: true, config: {}, device_type: "macbook",
  },
  {
    slug: "wearMarks", titulo: "Selecione as marcas de uso:", tipo: "multiselect",
    opcoes: [
      { value: "screen_scratches", label: "Arranhoes na tela", discount: -250 },
      { value: "body_scratches", label: "Arranhoes no corpo/tampa", discount: -200 },
      { value: "dents", label: "Amassados", discount: -300 },
      { value: "keyboard_wear", label: "Teclas desgastadas/falhando", discount: -300 },
      { value: "trackpad_wear", label: "Trackpad com marcas", discount: -150 },
    ],
    ordem: 4, ativo: true, config: { dependsOn: "hasWearMarks", showWhenValue: "yes" }, device_type: "macbook",
  },
  {
    slug: "partsReplaced", titulo: "O MacBook ja teve alguma peca trocada?", tipo: "selection",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "apple", label: "Sim, na Apple (autorizada)", discount: 0, variant: "success" },
      { value: "thirdParty", label: "Sim, fora da Apple", discount: 0, variant: "error", reject: true, rejectMessage: "Infelizmente nao aceitamos MacBooks com pecas trocadas fora da rede autorizada Apple." },
    ],
    ordem: 5, ativo: true, config: { showDetailInputOnValue: "apple", detailPlaceholder: "Ex: Tela, Bateria, Teclado..." }, device_type: "macbook",
  },
  {
    slug: "hasWarranty", titulo: "Ainda esta na garantia Apple de 12 meses?", tipo: "yesno",
    opcoes: [ { value: "yes", label: "Sim", discount: 0, variant: "success" }, { value: "no", label: "Nao", discount: 0 } ],
    ordem: 6, ativo: true, config: {}, device_type: "macbook",
  },
  {
    slug: "warrantyMonth", titulo: "Ate qual mes vai a garantia?", tipo: "conditional_date", opcoes: [],
    ordem: 7, ativo: true, config: { dependsOn: "hasWarranty", showWhenValue: "yes", bonuses: { ate3m: 0.03, de3a6m: 0.05, acima6m: 0.07 } }, device_type: "macbook",
  },
  {
    slug: "hasOriginalBox", titulo: "Ainda tem a caixa original + carregador?", tipo: "yesno",
    opcoes: [ { value: "yes", label: "Sim", discount: 0, variant: "success" }, { value: "no", label: "Nao", discount: -200 } ],
    ordem: 8, ativo: true, config: {}, device_type: "macbook",
  },

  // ── Apple Watch ──
  {
    slug: "hasDamage", titulo: "O Apple Watch esta trincado, quebrado ou com defeito?", tipo: "yesno",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "yes", label: "Sim", discount: 0, variant: "error", reject: true, rejectMessage: "Infelizmente nao aceitamos Apple Watch com tela trincada, quebrada ou com defeito na troca." },
    ],
    ordem: 1, ativo: true, config: {}, device_type: "watch",
  },
  {
    slug: "battery", titulo: "Saude da bateria", tipo: "numeric", opcoes: [],
    ordem: 2, ativo: true, config: { min: 1, max: 100, unit: "%", placeholder: "Ex: 90", helpText: "No Apple Watch: Ajustes > Bateria > Saude da Bateria", thresholds: [{ below: 80, discount: -200 }] },
    device_type: "watch",
  },
  {
    slug: "hasWearMarks", titulo: "Seu Apple Watch possui marcas de uso?", tipo: "yesno",
    opcoes: [ { value: "no", label: "Nao", discount: 0, variant: "success" }, { value: "yes", label: "Sim", discount: 0 } ],
    ordem: 3, ativo: true, config: {}, device_type: "watch",
  },
  {
    slug: "wearMarks", titulo: "Selecione as marcas de uso:", tipo: "multiselect",
    opcoes: [
      { value: "screen_scratches", label: "Arranhoes na tela/vidro", discount: -200 },
      { value: "case_marks", label: "Marcas na caixa (corpo)", discount: -150 },
      { value: "band_wear", label: "Pulseira desgastada", discount: -100 },
    ],
    ordem: 4, ativo: true, config: { dependsOn: "hasWearMarks", showWhenValue: "yes" }, device_type: "watch",
  },
  {
    slug: "partsReplaced", titulo: "O Apple Watch ja teve alguma peca trocada?", tipo: "selection",
    opcoes: [
      { value: "no", label: "Nao", discount: 0, variant: "success" },
      { value: "apple", label: "Sim, na Apple (autorizada)", discount: 0, variant: "success" },
      { value: "thirdParty", label: "Sim, fora da Apple", discount: 0, variant: "error", reject: true, rejectMessage: "Infelizmente nao aceitamos Apple Watch com pecas trocadas fora da rede autorizada Apple." },
    ],
    ordem: 5, ativo: true, config: { showDetailInputOnValue: "apple", detailPlaceholder: "Ex: Tela, Bateria..." }, device_type: "watch",
  },
  {
    slug: "hasWarranty", titulo: "Ainda esta na garantia Apple de 12 meses?", tipo: "yesno",
    opcoes: [ { value: "yes", label: "Sim", discount: 0, variant: "success" }, { value: "no", label: "Nao", discount: 0 } ],
    ordem: 6, ativo: true, config: {}, device_type: "watch",
  },
  {
    slug: "warrantyMonth", titulo: "Ate qual mes vai a garantia?", tipo: "conditional_date", opcoes: [],
    ordem: 7, ativo: true, config: { dependsOn: "hasWarranty", showWhenValue: "yes", bonuses: { ate3m: 0.03, de3a6m: 0.05, acima6m: 0.07 } }, device_type: "watch",
  },
  {
    slug: "hasOriginalBox", titulo: "Ainda tem a caixa original?", tipo: "yesno",
    opcoes: [ { value: "yes", label: "Sim", discount: 0, variant: "success" }, { value: "no", label: "Nao", discount: -100 } ],
    ordem: 8, ativo: true, config: {}, device_type: "watch",
  },
];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const deviceType = searchParams.get("device_type") || "iphone";

  try {
    const { supabase } = await import("@/lib/supabase");
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
