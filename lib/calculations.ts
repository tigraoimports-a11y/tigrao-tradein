// lib/calculations.ts

export interface ConditionData {
  screenScratch: "none" | "one" | "multiple";
  sideScratch: "none" | "one" | "multiple";
  peeling: "none" | "light" | "heavy";
  battery: number;
  hasDamage: boolean;
  hasWarranty: boolean;
  warrantyMonth: number | null; // 1-12
}

export interface QuoteResult {
  tradeInValue: number;
  newPrice: number;
  difference: number;
  pix: number;
  installment12: number;
  total12: number;
  installment18: number;
  total18: number;
  installment21: number;
  total21: number;
}

/** Descontos por modelo - cada modelo pode ter seus proprios valores */
export interface ModelDiscounts {
  screenScratch: { none: number; one: number; multiple: number };
  sideScratch: { none: number; one: number; multiple: number };
  peeling: { none: number; light: number; heavy: number };
  batteryDiscount: number; // desconto quando bateria < 85%
}

// Fallback geral (usado quando nao tem desconto especifico pro modelo)
const DEFAULT_DISCOUNTS: ModelDiscounts = {
  screenScratch: { none: 0, one: -100, multiple: -250 },
  sideScratch: { none: 0, one: -100, multiple: -250 },
  peeling: { none: 0, light: -200, heavy: -300 },
  batteryDiscount: -200,
};

const BATTERY_THRESHOLD = 85;

const DEFAULT_MULTIPLIERS = {
  12: 1.14,
  18: 1.20,
  21: 1.21,
};

/**
 * Calcula bonus de garantia Apple baseado no mes informado.
 * Ate 3 meses restantes:    +R$ 200
 * 3 a 6 meses restantes:    +R$ 300
 * 6 meses ou mais:          +R$ 400
 */
export function calculateWarrantyBonus(warrantyMonth: number | null): number {
  if (warrantyMonth === null) return 0;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  let warrantyYear = currentYear;
  if (warrantyMonth <= currentMonth) {
    warrantyYear = currentYear + 1;
  }

  const warrantyDate = new Date(warrantyYear, warrantyMonth - 1, 28);
  const diffMs = warrantyDate.getTime() - now.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30);

  if (diffMonths <= 3) return 200;
  if (diffMonths <= 6) return 300;
  return 400;
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
    batteryDiscount: specific.batteryDiscount ?? DEFAULT_DISCOUNTS.batteryDiscount,
  };
}

/**
 * Calcula a avaliacao final do aparelho usado
 * Agora aceita descontos especificos por modelo
 */
export function calculateTradeInValue(
  baseValue: number,
  condition: ConditionData,
  modelDiscounts?: ModelDiscounts
): number {
  if (condition.hasDamage) return 0;

  const d = modelDiscounts || DEFAULT_DISCOUNTS;
  let value = baseValue;

  value += d.screenScratch[condition.screenScratch];
  value += d.sideScratch[condition.sideScratch];
  value += d.peeling[condition.peeling];

  if (condition.battery < BATTERY_THRESHOLD) {
    value += d.batteryDiscount;
  }

  value += calculateWarrantyBonus(condition.warrantyMonth);

  return Math.max(value, 0);
}

/**
 * Calcula a cotacao completa
 */
export function calculateQuote(
  tradeInValue: number,
  newPrice: number,
  multipliers?: Record<number, number>
): QuoteResult {
  const m = multipliers || DEFAULT_MULTIPLIERS;
  const difference = Math.max(newPrice - tradeInValue, 0);

  const installment12 = Math.round((difference * m[12]) / 12);
  const total12 = installment12 * 12;
  const installment18 = Math.round((difference * m[18]) / 18);
  const total18 = installment18 * 18;
  const installment21 = Math.round((difference * m[21]) / 21);
  const total21 = installment21 * 21;

  return {
    tradeInValue, newPrice, difference, pix: difference,
    installment12, total12, installment18, total18, installment21, total21,
  };
}

/**
 * Gera texto da condicao
 */
export function getConditionText(condition: ConditionData): string {
  const parts: string[] = [];

  if (condition.battery < BATTERY_THRESHOLD) {
    parts.push(`Bateria: ${condition.battery}%`);
  }
  if (condition.screenScratch !== "none") {
    parts.push(condition.screenScratch === "one" ? "1 risco na tela" : "2+ riscos na tela");
  }
  if (condition.sideScratch !== "none") {
    parts.push(condition.sideScratch === "one" ? "1 risco lateral" : "2+ riscos laterais");
  }
  if (condition.peeling === "light") {
    parts.push("descascado/amassado leve");
  } else if (condition.peeling === "heavy") {
    parts.push("descascado/amassado forte");
  }
  if (condition.warrantyMonth !== null) {
    const monthNames = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    parts.push(`Garantia Apple ate ${monthNames[condition.warrantyMonth - 1]}`);
  }

  return parts.length > 0 ? parts.join(" | ") : "Bom estado geral";
}

export function getWhatsAppUrl(phoneNumber: string, message: string): string {
  return `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
}

export function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
