// lib/calculations.ts

export interface ConditionData {
  screenScratch: "none" | "one" | "multiple";
  sideScratch: "none" | "one" | "multiple";
  peeling: "none" | "light" | "heavy";
  battery: number;
  hasDamage: boolean;
  hasWarranty: boolean;
  warrantyMonth: number | null; // 1-12
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
  [5,  1.065], // 6.5%
  [6,  1.07],  // 7%
  [7,  1.075], // 7.5%
  [8,  1.085], // 8.5%
  [9,  1.095], // 9.5%
  [10, 1.11],  // 11%
  [11, 1.12],  // 12%
  [12, 1.13],  // 13%
  [13, 1.13],  // 13%
  [14, 1.14],  // 14%
  [15, 1.15],  // 15%
  [16, 1.16],  // 16%
  [17, 1.17],  // 17%
  [18, 1.18],  // 18%
  [19, 1.20],  // 20%
  [20, 1.21],  // 21%
  [21, 1.22],  // 22%
];

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
  bonuses?: WarrantyBonuses
): number {
  if (warrantyMonth === null) return 0;

  const b = bonuses || DEFAULT_WARRANTY_BONUSES;

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
  modelDiscounts?: ModelDiscounts,
  warrantyBonuses?: WarrantyBonuses
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

  value += calculateWarrantyBonus(condition.warrantyMonth, warrantyBonuses);

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
