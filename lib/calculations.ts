// lib/calculations.ts

export interface ConditionData {
  screenScratch: "none" | "one" | "multiple";
  sideScratch: "none" | "one" | "multiple";
  peeling: "none" | "light" | "heavy";
  battery: number;
  hasDamage: boolean;
  hasWarranty: boolean;
  warrantyMonth: number | null; // 1-12
  warrantyYear: number | null;  // ex: 2026, 2027
  hasOriginalBox: boolean;
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
  ate3m: number;   // bonus para ate 3 meses restantes
  de3a6m: number;  // bonus para 3 a 6 meses restantes
  acima6m: number; // bonus para 6 meses ou mais
}

const DEFAULT_WARRANTY_BONUSES: WarrantyBonuses = {
  ate3m: 200,
  de3a6m: 300,
  acima6m: 400,
};

/**
 * Calcula bonus de garantia Apple baseado no mes informado.
 * Os valores de bonus sao configurados via Google Sheets (aba Configuracoes).
 */
export function calculateWarrantyBonus(
  warrantyMonth: number | null,
  bonuses?: WarrantyBonuses,
  warrantyYear?: number | null
): number {
  if (warrantyMonth === null) return 0;

  const b = bonuses || DEFAULT_WARRANTY_BONUSES;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  // Se ano foi informado, usa direto. Senao, assume o proximo mes/ano futuro.
  const targetYear = warrantyYear ?? (warrantyMonth > currentMonth ? currentYear : currentYear + 1);

  const diffMonths = (targetYear - currentYear) * 12 + (warrantyMonth - currentMonth);

  if (diffMonths <= 0) return 0; // garantia ja vencida ou vence esse mes
  if (diffMonths <= 3) return b.ate3m;
  if (diffMonths <= 6) return b.de3a6m;
  return b.acima6m;
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

  const d = modelDiscounts || DEFAULT_DISCOUNTS;
  let value = baseValue;

  value += d.screenScratch[condition.screenScratch];
  value += d.sideScratch[condition.sideScratch];
  value += d.peeling[condition.peeling];

  value += applyBatteryDiscount(condition.battery, d.batteryTiers);

  // Usa bonus de garantia especifico do modelo (se tiver), senao usa o global
  const effectiveBonuses = d.warrantyBonuses || warrantyBonuses;
  value += calculateWarrantyBonus(condition.warrantyMonth, effectiveBonuses, condition.warrantyYear);

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
