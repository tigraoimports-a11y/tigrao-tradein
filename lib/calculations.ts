// lib/calculations.ts

export type DeviceType = "iphone" | "ipad" | "macbook";

export interface ConditionData {
  screenScratch: "none" | "one" | "multiple";
  sideScratch: "none" | "one" | "multiple";
  peeling: "none" | "light" | "heavy";
  battery: number;
  hasDamage: boolean;
  partsReplaced: "no" | "apple" | "thirdParty";
  partsReplacedDetail?: string;
  hasWarranty: boolean;
  warrantyMonth: number | null; // 1-12
  warrantyYear: number | null;  // ex: 2026, 2027
  hasOriginalBox: boolean;
  hasWearMarks?: boolean;          // novo: "Seu aparelho possui marcas de uso?"
  wearMarks?: string[];            // novo: seleções múltiplas de marcas de uso
  wearMarksDiscount?: number;      // novo: desconto acumulado das marcas selecionadas
}

// iPad: mesmos campos do iPhone + Apple Pencil inclusa
export interface IPadConditionData extends ConditionData {
  hasApplePencil: boolean;
}

// MacBook: campos diferentes
export interface MacBookConditionData {
  screenScratch: "none" | "one" | "multiple";
  bodyScratch: "none" | "light" | "heavy";
  batteryCycles: number; // contagem de ciclos
  keyboardCondition: "perfect" | "sticky";
  hasCharger: boolean;
  hasDamage: boolean;
  hasWarranty: boolean;
  warrantyMonth: number | null;
  warrantyYear: number | null;
  hasOriginalBox: boolean;
}

// Union type para qualquer condicao de dispositivo
export type AnyConditionData = ConditionData | IPadConditionData | MacBookConditionData;

export function isIPadCondition(c: AnyConditionData): c is IPadConditionData {
  return "hasApplePencil" in c;
}

export function isMacBookCondition(c: AnyConditionData): c is MacBookConditionData {
  return "batteryCycles" in c;
}

export interface InstallmentOption {
  parcelas: number;
  valorParcela: number;
  total: number;
}

export interface QuoteResult {
  tradeInValue: number;
  newPrice: number;
  difference: number;
  pix: number;
  installments: InstallmentOption[];
}

// Tabela de taxas por numero de parcelas (cartao de credito)
export const INSTALLMENT_RATES: [number, number][] = [
  [1,  1.04],  // 4%
  [2,  1.05],  // 5%
  [3,  1.055], // 5.5%
  [4,  1.06],  // 6%
  [5,  1.07],  // 7%
  [6,  1.075], // 7.5%
  [7,  1.08],  // 8%
  [8,  1.091], // 9.1%
  [9,  1.10],  // 10%
  [10, 1.11],  // 11%
  [11, 1.12],  // 12%
  [12, 1.13],  // 13%
  [13, 1.14],  // 14%
  [14, 1.15],  // 15%
  [15, 1.16],  // 16%
  [16, 1.17],  // 17%
  [17, 1.18],  // 18%
  [18, 1.19],  // 19%
  [19, 1.20],  // 20%
  [20, 1.21],  // 21%
  [21, 1.22],  // 22%
];

/** Par threshold/desconto para bateria */
export interface BatteryTier {
  threshold: number; // ex: 95, 90, 85
  discount: number;  // ex: -200, -300
}

/** Descontos por modelo - cada modelo pode ter seus proprios valores */
export interface ModelDiscounts {
  screenScratch: { none: number; one: number; multiple: number };
  sideScratch: { none: number; one: number; multiple: number };
  peeling: { none: number; light: number; heavy: number };
  batteryTiers: BatteryTier[]; // desconto por faixa de bateria
  warrantyBonuses?: WarrantyBonuses; // bonus de garantia especifico do modelo (opcional)
}

// Fallback geral (usado quando nao tem desconto especifico pro modelo)
const DEFAULT_DISCOUNTS: ModelDiscounts = {
  screenScratch: { none: 0, one: -100, multiple: -250 },
  sideScratch: { none: 0, one: -100, multiple: -250 },
  peeling: { none: 0, light: -200, heavy: -300 },
  batteryTiers: [{ threshold: 85, discount: -200 }],
};

/**
 * Retorna o desconto de bateria aplicavel.
 * Verifica do menor threshold pro maior — o menor threshold aplicavel vence.
 * Ex: battery=88, tiers=[{90,-300},{95,-200}] → retorna -300 (pois 88 < 90)
 */
function applyBatteryDiscount(battery: number, tiers: BatteryTier[]): number {
  const sorted = [...tiers].sort((a, b) => a.threshold - b.threshold);
  for (const tier of sorted) {
    if (battery < tier.threshold) return tier.discount;
  }
  return 0;
}


export interface WarrantyBonuses {
  ate3m: number;   // valor absoluto em R$ (ex: 200) ou percentual decimal (ex: 0.03 = 3%)
  de3a6m: number;
  acima6m: number;
}

/**
 * Calcula bonus de garantia Apple baseado no mes informado.
 * Le valores cadastrados por modelo em /admin/usados -> "+ Garantia".
 * Se o modelo nao tem bonuses configurados, retorna 0.
 */
export function calculateWarrantyBonus(
  warrantyMonth: number | null,
  bonuses: WarrantyBonuses | undefined,
  warrantyYear?: number | null,
  baseValue?: number
): number {
  if (warrantyMonth === null) return 0;
  if (!bonuses) return 0;

  const b = bonuses;
  const base = baseValue || 0;

  // Protecao: se valores de bonus > 1, sao absolutos (R$), nao percentuais
  // Ex: 200 = R$200, 0.07 = 7% do base
  const applyBonus = (rate: number): number => {
    if (rate > 1) return Math.round(rate); // valor absoluto em reais
    return Math.round(base * rate);        // percentual do base
  };

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Se ano foi informado, usa direto. Senao, assume o proximo mes/ano futuro.
  const targetYear = warrantyYear ?? (warrantyMonth > currentMonth ? currentYear : currentYear + 1);

  const diffMonths = (targetYear - currentYear) * 12 + (warrantyMonth - currentMonth);

  if (diffMonths <= 0) return 0; // garantia ja vencida ou vence esse mes
  if (diffMonths <= 3) return applyBonus(b.ate3m);
  if (diffMonths <= 6) return applyBonus(b.de3a6m);
  return applyBonus(b.acima6m);
}

/**
 * Busca os descontos corretos para um modelo.
 * Se existe desconto especifico pro modelo, usa ele.
 * Senao, usa o fallback geral.
 */
export function getDiscountsForModel(
  modelo: string,
  modelDiscountsMap?: Record<string, Partial<ModelDiscounts>>
): ModelDiscounts {
  if (!modelDiscountsMap) return DEFAULT_DISCOUNTS;

  const specific = modelDiscountsMap[modelo];
  if (!specific) return DEFAULT_DISCOUNTS;

  return {
    screenScratch: specific.screenScratch || DEFAULT_DISCOUNTS.screenScratch,
    sideScratch: specific.sideScratch || DEFAULT_DISCOUNTS.sideScratch,
    peeling: specific.peeling || DEFAULT_DISCOUNTS.peeling,
    batteryTiers: specific.batteryTiers?.length ? specific.batteryTiers : DEFAULT_DISCOUNTS.batteryTiers,
    ...(specific.warrantyBonuses ? { warrantyBonuses: specific.warrantyBonuses } : {}),
  };
}

/**
 * Calcula a avaliacao final do aparelho usado
 * Agora aceita descontos especificos por modelo
 */
export function calculateTradeInValue(
  baseValue: number,
  condition: ConditionData,
  modelDiscounts?: ModelDiscounts,
): number {
  if (condition.hasDamage) return 0;
  if (condition.partsReplaced === "thirdParty") return 0;

  const d = modelDiscounts || DEFAULT_DISCOUNTS;
  let value = baseValue;

  // Peça trocada na Apple: desconto de R$200
  if (condition.partsReplaced === "apple") {
    value -= 200;
  }

  // New wear marks system: if hasWearMarks is defined, use accumulated discount
  if (condition.hasWearMarks !== undefined) {
    value += (condition.wearMarksDiscount || 0);
  } else {
    // Legacy: individual scratch/peeling questions
    value += d.screenScratch[condition.screenScratch];
    value += d.sideScratch[condition.sideScratch];
    value += d.peeling[condition.peeling];
  }

  value += applyBatteryDiscount(condition.battery, d.batteryTiers);

  // Bonus de garantia: so aplica se o modelo tiver configuracao explicita.
  // Modelos sem warrantyBonuses configurado NAO recebem bonus (evita bonus indevido em linhas antigas).
  if (d.warrantyBonuses) {
    value += calculateWarrantyBonus(condition.warrantyMonth, d.warrantyBonuses, condition.warrantyYear, baseValue);
  }

  // Desconto por não ter caixa original: -R$ 100
  if (!condition.hasOriginalBox) {
    value -= 100;
  }

  return Math.max(value, 0);
}

/**
 * Calcula a cotacao completa com todas as opcoes de parcelamento
 */
export function calculateQuote(
  tradeInValue: number,
  newPrice: number,
): QuoteResult {
  const difference = Math.max(newPrice - tradeInValue, 0);

  const installments: InstallmentOption[] = INSTALLMENT_RATES.map(([n, rate]) => {
    const valorParcela = Math.round((difference * rate) / n);
    return { parcelas: n, valorParcela, total: valorParcela * n };
  });

  return { tradeInValue, newPrice, difference, pix: difference, installments };
}

/** Linha do resumo com o slug da pergunta hardcoded que a gerou. Permite que
 *  o StepManualHandoff intercale com perguntas dinamicas via ordem do admin. */
export interface ConditionEntry {
  slug: string;
  text: string;
}

/**
 * Gera entries (slug + texto) das condicoes hardcoded de iPhone.
 * Usar `getConditionLines` quando so o texto importa.
 */
export function getConditionEntries(condition: ConditionData, deviceType?: DeviceType): ConditionEntry[] {
  const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const entries: ConditionEntry[] = [];

  // Trincado/defeito: hasDamage=true e rejeitado (nao chega aqui), entao so
  // confirma "Sem trincado/defeito" pro aparelho aceito.
  entries.push({ slug: "hasDamage", text: condition.hasDamage ? "Com trincado/defeito" : "Sem trincado/defeito" });

  if (condition.warrantyMonth !== null) {
    const yearSuffix = condition.warrantyYear ? ` de ${condition.warrantyYear}` : "";
    entries.push({ slug: "warrantyMonth", text: `Garantia Apple ate ${monthNames[condition.warrantyMonth - 1]}${yearSuffix}` });
  }

  // MacBook: campo battery armazena CICLOS (0..9999), demais dispositivos
  // armazenam saude de bateria em %. Label muda conforme o deviceType.
  if (deviceType === "macbook") {
    entries.push({ slug: "battery", text: `Ciclos de bateria: ${condition.battery}` });
  } else {
    entries.push({ slug: "battery", text: `Saude bateria ${condition.battery}%` });
  }

  // New wear marks system
  if (condition.hasWearMarks !== undefined) {
    if (!condition.hasWearMarks || !condition.wearMarks || condition.wearMarks.length === 0) {
      entries.push({ slug: "wearMarks", text: "Sem marcas de uso" });
    } else {
      const wearLabels: Record<string, string> = {
        screen_scratches: "Arranhoes na tela",
        side_marks: "Marcas nas laterais",
        light_peeling: "Descascado leve",
        heavy_peeling: "Descascado forte",
      };
      condition.wearMarks.forEach((m) => {
        entries.push({ slug: "wearMarks", text: wearLabels[m] || m });
      });
    }
  } else {
    // Legacy
    if (condition.screenScratch === "none") entries.push({ slug: "screenScratch", text: "Sem arranhoes na tela" });
    else if (condition.screenScratch === "one") entries.push({ slug: "screenScratch", text: "1 arranhao na tela" });
    else entries.push({ slug: "screenScratch", text: "2 ou mais arranhoes na tela" });

    if (condition.sideScratch === "none") entries.push({ slug: "sideScratch", text: "Sem arranhoes laterais" });
    else if (condition.sideScratch === "one") entries.push({ slug: "sideScratch", text: "1 arranhao lateral" });
    else entries.push({ slug: "sideScratch", text: "2 ou mais arranhoes laterais" });

    if (condition.peeling === "none") entries.push({ slug: "peeling", text: "Sem marcas de uso" });
    else if (condition.peeling === "light") entries.push({ slug: "peeling", text: "Marcas de uso leves" });
    else entries.push({ slug: "peeling", text: "Marcas de uso fortes" });
  }

  if (condition.partsReplaced === "apple") entries.push({ slug: "partsReplaced", text: `Peca trocada na Apple (autorizada)${condition.partsReplacedDetail ? `: ${condition.partsReplacedDetail}` : ""}` });
  else if (condition.partsReplaced === "no") entries.push({ slug: "partsReplaced", text: "Sem pecas trocadas" });

  entries.push({ slug: "hasOriginalBox", text: condition.hasOriginalBox ? "Tem a caixa original" : "Sem caixa original" });

  return entries;
}

/**
 * Gera linhas de condicao para exibicao e WhatsApp.
 * Wrapper sobre `getConditionEntries` quando so o texto importa.
 */
export function getConditionLines(condition: ConditionData, deviceType?: DeviceType): string[] {
  return getConditionEntries(condition, deviceType).map((e) => e.text);
}

/**
 * @deprecated use getConditionLines
 */
export function getConditionText(condition: ConditionData): string {
  return getConditionLines(condition).join(" | ");
}

export function getWhatsAppUrl(phoneNumber: string, message: string): string {
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
}

export function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ──────────────────────────────────────────
// iPad trade-in
// ──────────────────────────────────────────

const DEFAULT_IPAD_DISCOUNTS = {
  screenScratch: { none: 0, one: -100, multiple: -250 },
  sideScratch: { none: 0, one: -100, multiple: -250 },
  peeling: { none: 0, light: -200, heavy: -300 },
  batteryTiers: [{ threshold: 85, discount: -200 }] as BatteryTier[],
  applePencilBonus: 200,
};

export function calculateIPadTradeInValue(
  baseValue: number,
  condition: IPadConditionData,
  modelDiscounts?: ModelDiscounts,
): number {
  if (condition.hasDamage) return 0;

  let value = baseValue;

  value += DEFAULT_IPAD_DISCOUNTS.screenScratch[condition.screenScratch];
  value += DEFAULT_IPAD_DISCOUNTS.sideScratch[condition.sideScratch];
  value += DEFAULT_IPAD_DISCOUNTS.peeling[condition.peeling];
  value += applyBatteryDiscount(condition.battery, DEFAULT_IPAD_DISCOUNTS.batteryTiers);

  value += calculateWarrantyBonus(condition.warrantyMonth, modelDiscounts?.warrantyBonuses, condition.warrantyYear, baseValue);

  if (condition.hasApplePencil) {
    value += DEFAULT_IPAD_DISCOUNTS.applePencilBonus;
  }

  if (!condition.hasOriginalBox) {
    value -= 100;
  }

  return Math.max(value, 0);
}

export function getIPadConditionEntries(condition: IPadConditionData): ConditionEntry[] {
  const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const entries: ConditionEntry[] = [];

  if (condition.warrantyMonth !== null) {
    const yearSuffix = condition.warrantyYear ? ` de ${condition.warrantyYear}` : "";
    entries.push({ slug: "warrantyMonth", text: `Garantia Apple ate ${monthNames[condition.warrantyMonth - 1]}${yearSuffix}` });
  }

  entries.push({ slug: "battery", text: `Saude bateria ${condition.battery}%` });

  if (condition.screenScratch === "none") entries.push({ slug: "screenScratch", text: "Sem arranhoes na tela" });
  else if (condition.screenScratch === "one") entries.push({ slug: "screenScratch", text: "1 arranhao na tela" });
  else entries.push({ slug: "screenScratch", text: "2 ou mais arranhoes na tela" });

  if (condition.sideScratch === "none") entries.push({ slug: "sideScratch", text: "Sem arranhoes laterais" });
  else if (condition.sideScratch === "one") entries.push({ slug: "sideScratch", text: "1 arranhao lateral" });
  else entries.push({ slug: "sideScratch", text: "2 ou mais arranhoes laterais" });

  if (condition.peeling === "none") entries.push({ slug: "peeling", text: "Sem marcas de uso" });
  else if (condition.peeling === "light") entries.push({ slug: "peeling", text: "Marcas de uso leves" });
  else entries.push({ slug: "peeling", text: "Marcas de uso fortes" });

  entries.push({ slug: "hasApplePencil", text: condition.hasApplePencil ? "Apple Pencil inclusa" : "Sem Apple Pencil" });
  entries.push({ slug: "hasOriginalBox", text: condition.hasOriginalBox ? "Tem a caixa original" : "Sem caixa original" });

  return entries;
}

export function getIPadConditionLines(condition: IPadConditionData): string[] {
  return getIPadConditionEntries(condition).map((e) => e.text);
}

// ──────────────────────────────────────────
// MacBook trade-in
// ──────────────────────────────────────────

const DEFAULT_MACBOOK_DISCOUNTS = {
  screenScratch: { none: 0, one: -100, multiple: -250 },
  bodyScratch: { none: 0, light: -200, heavy: -400 },
  batteryCycles: { low: 0, medium: -200, high: -400 }, // <300, 300-500, >500
  keyboardCondition: { perfect: 0, sticky: -300 },
  chargerMissing: -200,
};

export function calculateMacBookTradeInValue(
  baseValue: number,
  condition: MacBookConditionData,
  modelDiscounts?: ModelDiscounts,
): number {
  if (condition.hasDamage) return 0;

  let value = baseValue;

  value += DEFAULT_MACBOOK_DISCOUNTS.screenScratch[condition.screenScratch];
  value += DEFAULT_MACBOOK_DISCOUNTS.bodyScratch[condition.bodyScratch];

  // Battery cycles
  if (condition.batteryCycles > 500) {
    value += DEFAULT_MACBOOK_DISCOUNTS.batteryCycles.high;
  } else if (condition.batteryCycles >= 300) {
    value += DEFAULT_MACBOOK_DISCOUNTS.batteryCycles.medium;
  }

  value += DEFAULT_MACBOOK_DISCOUNTS.keyboardCondition[condition.keyboardCondition];

  if (!condition.hasCharger) {
    value += DEFAULT_MACBOOK_DISCOUNTS.chargerMissing;
  }

  value += calculateWarrantyBonus(condition.warrantyMonth, modelDiscounts?.warrantyBonuses, condition.warrantyYear, baseValue);

  if (!condition.hasOriginalBox) {
    value -= 100;
  }

  return Math.max(value, 0);
}

export function getMacBookConditionEntries(condition: MacBookConditionData): ConditionEntry[] {
  const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const entries: ConditionEntry[] = [];

  if (condition.warrantyMonth !== null) {
    const yearSuffix = condition.warrantyYear ? ` de ${condition.warrantyYear}` : "";
    entries.push({ slug: "warrantyMonth", text: `Garantia Apple ate ${monthNames[condition.warrantyMonth - 1]}${yearSuffix}` });
  }

  entries.push({ slug: "battery", text: `Ciclos de bateria: ${condition.batteryCycles}` });

  if (condition.screenScratch === "none") entries.push({ slug: "screenScratch", text: "Sem arranhoes na tela" });
  else if (condition.screenScratch === "one") entries.push({ slug: "screenScratch", text: "1 arranhao na tela" });
  else entries.push({ slug: "screenScratch", text: "2 ou mais arranhoes na tela" });

  if (condition.bodyScratch === "none") entries.push({ slug: "bodyScratch", text: "Sem arranhoes no corpo" });
  else if (condition.bodyScratch === "light") entries.push({ slug: "bodyScratch", text: "Arranhoes leves no corpo" });
  else entries.push({ slug: "bodyScratch", text: "Arranhoes fortes no corpo" });

  if (condition.keyboardCondition === "perfect") entries.push({ slug: "keyboardCondition", text: "Teclado perfeito" });
  else entries.push({ slug: "keyboardCondition", text: "Teclado com teclas grudando" });

  entries.push({ slug: "hasCharger", text: condition.hasCharger ? "Carregador incluso" : "Sem carregador" });
  entries.push({ slug: "hasOriginalBox", text: condition.hasOriginalBox ? "Tem a caixa original" : "Sem caixa original" });

  return entries;
}

export function getMacBookConditionLines(condition: MacBookConditionData): string[] {
  return getMacBookConditionEntries(condition).map((e) => e.text);
}

/**
 * Helper unificado: calcula trade-in value para qualquer tipo de dispositivo
 */
export function calculateAnyTradeInValue(
  deviceType: DeviceType,
  baseValue: number,
  condition: AnyConditionData,
  modelDiscounts?: ModelDiscounts,
): number {
  if (deviceType === "ipad" && isIPadCondition(condition)) {
    return calculateIPadTradeInValue(baseValue, condition, modelDiscounts);
  }
  if (deviceType === "macbook" && isMacBookCondition(condition)) {
    return calculateMacBookTradeInValue(baseValue, condition, modelDiscounts);
  }
  // iPhone (default)
  return calculateTradeInValue(baseValue, condition as ConditionData, modelDiscounts);
}

/**
 * Helper unificado: gera entries (slug + texto) das condicoes hardcoded.
 * Use no StepManualHandoff pra ordenar com perguntas dinamicas via admin.
 */
export function getAnyConditionEntries(
  deviceType: DeviceType,
  condition: AnyConditionData
): ConditionEntry[] {
  if (deviceType === "ipad" && isIPadCondition(condition)) {
    return getIPadConditionEntries(condition);
  }
  if (deviceType === "macbook" && isMacBookCondition(condition)) {
    return getMacBookConditionEntries(condition);
  }
  return getConditionEntries(condition as ConditionData, deviceType);
}

/**
 * Helper unificado: gera linhas de condicao para qualquer tipo de dispositivo.
 * Wrapper sobre `getAnyConditionEntries` quando so o texto importa.
 */
export function getAnyConditionLines(
  deviceType: DeviceType,
  condition: AnyConditionData
): string[] {
  return getAnyConditionEntries(deviceType, condition).map((e) => e.text);
}

// ──────────────────────────────────────────
// Fallback base values — iPad
// ──────────────────────────────────────────

export const FALLBACK_IPAD_VALUES = [
  { modelo: "iPad Air 11\" M2", armazenamento: "128GB", valorBase: 3500 },
  { modelo: "iPad Air 11\" M2", armazenamento: "256GB", valorBase: 3800 },
  { modelo: "iPad Air 11\" M2", armazenamento: "512GB", valorBase: 4200 },
  { modelo: "iPad Air 11\" M2", armazenamento: "1TB", valorBase: 4800 },
  { modelo: "iPad Air 13\" M2", armazenamento: "128GB", valorBase: 4200 },
  { modelo: "iPad Air 13\" M2", armazenamento: "256GB", valorBase: 4500 },
  { modelo: "iPad Air 13\" M2", armazenamento: "512GB", valorBase: 5000 },
  { modelo: "iPad Air 13\" M2", armazenamento: "1TB", valorBase: 5500 },
  { modelo: "iPad Pro 11\" M4", armazenamento: "256GB", valorBase: 5500 },
  { modelo: "iPad Pro 11\" M4", armazenamento: "512GB", valorBase: 6000 },
  { modelo: "iPad Pro 11\" M4", armazenamento: "1TB", valorBase: 7000 },
  { modelo: "iPad Pro 11\" M4", armazenamento: "2TB", valorBase: 8000 },
  { modelo: "iPad Pro 13\" M4", armazenamento: "256GB", valorBase: 7000 },
  { modelo: "iPad Pro 13\" M4", armazenamento: "512GB", valorBase: 7500 },
  { modelo: "iPad Pro 13\" M4", armazenamento: "1TB", valorBase: 8500 },
  { modelo: "iPad Pro 13\" M4", armazenamento: "2TB", valorBase: 9500 },
  { modelo: "iPad 10", armazenamento: "64GB", valorBase: 2000 },
  { modelo: "iPad 10", armazenamento: "256GB", valorBase: 2500 },
];

// ──────────────────────────────────────────
// Fallback base values — MacBook
// ──────────────────────────────────────────

export const FALLBACK_MACBOOK_VALUES = [
  { modelo: "MacBook Air M2 13\"", armazenamento: "256GB/8GB", valorBase: 4500 },
  { modelo: "MacBook Air M2 13\"", armazenamento: "512GB/8GB", valorBase: 5000 },
  { modelo: "MacBook Air M3 13\"", armazenamento: "256GB/16GB", valorBase: 5500 },
  { modelo: "MacBook Air M3 13\"", armazenamento: "512GB/16GB", valorBase: 6000 },
  { modelo: "MacBook Air M3 13\"", armazenamento: "512GB/24GB", valorBase: 6500 },
  { modelo: "MacBook Air M3 15\"", armazenamento: "256GB/16GB", valorBase: 6000 },
  { modelo: "MacBook Air M3 15\"", armazenamento: "512GB/16GB", valorBase: 6500 },
  { modelo: "MacBook Air M3 15\"", armazenamento: "512GB/24GB", valorBase: 7000 },
  { modelo: "MacBook Air M4 13\"", armazenamento: "256GB/16GB", valorBase: 6500 },
  { modelo: "MacBook Air M4 13\"", armazenamento: "512GB/16GB", valorBase: 7000 },
  { modelo: "MacBook Air M4 13\"", armazenamento: "512GB/24GB", valorBase: 7500 },
  { modelo: "MacBook Air M4 15\"", armazenamento: "256GB/16GB", valorBase: 7000 },
  { modelo: "MacBook Air M4 15\"", armazenamento: "512GB/16GB", valorBase: 7500 },
  { modelo: "MacBook Air M4 15\"", armazenamento: "512GB/24GB", valorBase: 8000 },
  { modelo: "MacBook Pro M4 14\"", armazenamento: "512GB/24GB", valorBase: 9000 },
  { modelo: "MacBook Pro M4 14\"", armazenamento: "1TB/24GB", valorBase: 10000 },
  { modelo: "MacBook Pro M4 Pro 14\"", armazenamento: "512GB/24GB", valorBase: 11000 },
  { modelo: "MacBook Pro M4 Pro 14\"", armazenamento: "1TB/24GB", valorBase: 12500 },
  { modelo: "MacBook Pro M4 Pro 14\"", armazenamento: "1TB/48GB", valorBase: 14000 },
  { modelo: "MacBook Pro M4 Pro 16\"", armazenamento: "512GB/24GB", valorBase: 12000 },
  { modelo: "MacBook Pro M4 Pro 16\"", armazenamento: "1TB/24GB", valorBase: 13500 },
  { modelo: "MacBook Pro M4 Pro 16\"", armazenamento: "1TB/48GB", valorBase: 15000 },
  { modelo: "MacBook Pro M4 Max 14\"", armazenamento: "1TB/36GB", valorBase: 16000 },
  { modelo: "MacBook Pro M4 Max 14\"", armazenamento: "1TB/48GB", valorBase: 18000 },
  { modelo: "MacBook Pro M4 Max 16\"", armazenamento: "1TB/48GB", valorBase: 19000 },
  { modelo: "MacBook Pro M4 Max 16\"", armazenamento: "2TB/48GB", valorBase: 21000 },
];
