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
  ate3m: number;   // percentual para ate 3 meses restantes (ex: 0.03 = 3%)
  de3a6m: number;  // percentual para 3 a 6 meses restantes (ex: 0.05 = 5%)
  acima6m: number; // percentual para 6 meses ou mais (ex: 0.07 = 7%)
}

const DEFAULT_WARRANTY_BONUSES: WarrantyBonuses = {
  ate3m: 0.03,
  de3a6m: 0.05,
  acima6m: 0.07,
};

/**
 * Calcula bonus de garantia Apple baseado no mes informado.
 * O bonus e um percentual do valor base do modelo.
 * Ex: iPhone 14 128GB base R$2.300, garantia >6m => bonus = 2300 * 0.07 = R$161
 */
export function calculateWarrantyBonus(
  warrantyMonth: number | null,
  bonuses?: WarrantyBonuses,
  warrantyYear?: number | null,
  baseValue?: number
): number {
  if (warrantyMonth === null) return 0;

  const b = bonuses || DEFAULT_WARRANTY_BONUSES;
  const base = baseValue || 0;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Se ano foi informado, usa direto. Senao, assume o proximo mes/ano futuro.
  const targetYear = warrantyYear ?? (warrantyMonth > currentMonth ? currentYear : currentYear + 1);

  const diffMonths = (targetYear - currentYear) * 12 + (warrantyMonth - currentMonth);

  if (diffMonths <= 0) return 0; // garantia ja vencida ou vence esse mes
  if (diffMonths <= 3) return Math.round(base * b.ate3m);
  if (diffMonths <= 6) return Math.round(base * b.de3a6m);
  return Math.round(base * b.acima6m);
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
  warrantyBonuses?: WarrantyBonuses
): number {
  if (condition.hasDamage) return 0;
  if (condition.partsReplaced === "thirdParty") return 0;

  const d = modelDiscounts || DEFAULT_DISCOUNTS;
  let value = baseValue;

  value += d.screenScratch[condition.screenScratch];
  value += d.sideScratch[condition.sideScratch];
  value += d.peeling[condition.peeling];

  value += applyBatteryDiscount(condition.battery, d.batteryTiers);

  // Usa bonus de garantia especifico do modelo (se tiver), senao usa o global
  const effectiveBonuses = d.warrantyBonuses || warrantyBonuses;
  value += calculateWarrantyBonus(condition.warrantyMonth, effectiveBonuses, condition.warrantyYear, baseValue);

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

/**
 * Gera linhas de condicao para exibicao e WhatsApp
 */
export function getConditionLines(condition: ConditionData): string[] {
  const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const lines: string[] = [];

  if (condition.warrantyMonth !== null) {
    lines.push(`Garantia Apple ate ${monthNames[condition.warrantyMonth - 1]}`);
  }

  lines.push(`Saude bateria ${condition.battery}%`);

  if (condition.screenScratch === "none") lines.push("Sem arranhoes na tela");
  else if (condition.screenScratch === "one") lines.push("1 arranhao na tela");
  else lines.push("2 ou mais arranhoes na tela");

  if (condition.sideScratch === "none") lines.push("Sem arranhoes laterais");
  else if (condition.sideScratch === "one") lines.push("1 arranhao lateral");
  else lines.push("2 ou mais arranhoes laterais");

  if (condition.peeling === "none") lines.push("Sem marcas de uso");
  else if (condition.peeling === "light") lines.push("Marcas de uso leves");
  else lines.push("Marcas de uso fortes");

  if (condition.partsReplaced === "apple") lines.push(`Peca trocada na Apple (autorizada)${condition.partsReplacedDetail ? `: ${condition.partsReplacedDetail}` : ""}`);
  else if (condition.partsReplaced === "no") lines.push("Sem pecas trocadas");

  lines.push(condition.hasOriginalBox ? "Tem a caixa original" : "Sem caixa original");

  return lines;
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
  warrantyBonuses?: WarrantyBonuses
): number {
  if (condition.hasDamage) return 0;

  let value = baseValue;

  value += DEFAULT_IPAD_DISCOUNTS.screenScratch[condition.screenScratch];
  value += DEFAULT_IPAD_DISCOUNTS.sideScratch[condition.sideScratch];
  value += DEFAULT_IPAD_DISCOUNTS.peeling[condition.peeling];
  value += applyBatteryDiscount(condition.battery, DEFAULT_IPAD_DISCOUNTS.batteryTiers);

  value += calculateWarrantyBonus(condition.warrantyMonth, warrantyBonuses, condition.warrantyYear, baseValue);

  if (condition.hasApplePencil) {
    value += DEFAULT_IPAD_DISCOUNTS.applePencilBonus;
  }

  if (!condition.hasOriginalBox) {
    value -= 100;
  }

  return Math.max(value, 0);
}

export function getIPadConditionLines(condition: IPadConditionData): string[] {
  const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const lines: string[] = [];

  if (condition.warrantyMonth !== null) {
    lines.push(`Garantia Apple ate ${monthNames[condition.warrantyMonth - 1]}`);
  }

  lines.push(`Saude bateria ${condition.battery}%`);

  if (condition.screenScratch === "none") lines.push("Sem arranhoes na tela");
  else if (condition.screenScratch === "one") lines.push("1 arranhao na tela");
  else lines.push("2 ou mais arranhoes na tela");

  if (condition.sideScratch === "none") lines.push("Sem arranhoes laterais");
  else if (condition.sideScratch === "one") lines.push("1 arranhao lateral");
  else lines.push("2 ou mais arranhoes laterais");

  if (condition.peeling === "none") lines.push("Sem marcas de uso");
  else if (condition.peeling === "light") lines.push("Marcas de uso leves");
  else lines.push("Marcas de uso fortes");

  lines.push(condition.hasApplePencil ? "Apple Pencil inclusa" : "Sem Apple Pencil");
  lines.push(condition.hasOriginalBox ? "Tem a caixa original" : "Sem caixa original");

  return lines;
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
  warrantyBonuses?: WarrantyBonuses
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

  value += calculateWarrantyBonus(condition.warrantyMonth, warrantyBonuses, condition.warrantyYear, baseValue);

  if (!condition.hasOriginalBox) {
    value -= 100;
  }

  return Math.max(value, 0);
}

export function getMacBookConditionLines(condition: MacBookConditionData): string[] {
  const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const lines: string[] = [];

  if (condition.warrantyMonth !== null) {
    lines.push(`Garantia Apple ate ${monthNames[condition.warrantyMonth - 1]}`);
  }

  lines.push(`Ciclos de bateria: ${condition.batteryCycles}`);

  if (condition.screenScratch === "none") lines.push("Sem arranhoes na tela");
  else if (condition.screenScratch === "one") lines.push("1 arranhao na tela");
  else lines.push("2 ou mais arranhoes na tela");

  if (condition.bodyScratch === "none") lines.push("Sem arranhoes no corpo");
  else if (condition.bodyScratch === "light") lines.push("Arranhoes leves no corpo");
  else lines.push("Arranhoes fortes no corpo");

  if (condition.keyboardCondition === "perfect") lines.push("Teclado perfeito");
  else lines.push("Teclado com teclas grudando");

  lines.push(condition.hasCharger ? "Carregador incluso" : "Sem carregador");
  lines.push(condition.hasOriginalBox ? "Tem a caixa original" : "Sem caixa original");

  return lines;
}

/**
 * Helper unificado: calcula trade-in value para qualquer tipo de dispositivo
 */
export function calculateAnyTradeInValue(
  deviceType: DeviceType,
  baseValue: number,
  condition: AnyConditionData,
  modelDiscounts?: ModelDiscounts,
  warrantyBonuses?: WarrantyBonuses
): number {
  if (deviceType === "ipad" && isIPadCondition(condition)) {
    return calculateIPadTradeInValue(baseValue, condition, warrantyBonuses);
  }
  if (deviceType === "macbook" && isMacBookCondition(condition)) {
    return calculateMacBookTradeInValue(baseValue, condition, warrantyBonuses);
  }
  // iPhone (default)
  return calculateTradeInValue(baseValue, condition as ConditionData, modelDiscounts, warrantyBonuses);
}

/**
 * Helper unificado: gera linhas de condicao para qualquer tipo de dispositivo
 */
export function getAnyConditionLines(
  deviceType: DeviceType,
  condition: AnyConditionData
): string[] {
  if (deviceType === "ipad" && isIPadCondition(condition)) {
    return getIPadConditionLines(condition);
  }
  if (deviceType === "macbook" && isMacBookCondition(condition)) {
    return getMacBookConditionLines(condition);
  }
  return getConditionLines(condition as ConditionData);
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
