// lib/sheets.ts

import Papa from "papaparse";
import type { NewProduct, UsedDeviceValue, DiscountRule, AppConfig } from "./types";
import type { BatteryTier } from "./calculations";

const REVALIDATE_SECONDS = 60;

async function fetchCSV(url: string): Promise<string> {
  const response = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) {
    throw new Error(`Erro ao buscar planilha: ${response.status}`);
  }
  return response.text();
}

function parseCSV<T>(csv: string): T[] {
  const result = Papa.parse<T>(csv, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return result.data;
}

function parseNumber(str: string): number {
  if (!str) return 0;
  let cleaned = str
    .replace(/R\$\s*/g, "")
    .replace(/\s/g, "");
  // Detectar formato: se tem ponto seguido de exatamente 2 dígitos no final (ex: "5000.00"),
  // é formato US (ponto = decimal). Caso contrário, formato BR (ponto = milhar).
  if (/\.\d{2}$/.test(cleaned) && !cleaned.includes(",")) {
    // Formato US: "5000.00" → 5000
    return parseFloat(cleaned) || 0;
  }
  // Formato BR: "5.000" ou "5.000,00"
  cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export async function fetchNewProducts(): Promise<NewProduct[]> {
  const url = process.env.SHEET_PRODUTOS_URL;
  if (!url) throw new Error("SHEET_PRODUTOS_URL nao configurada");

  const csv = await fetchCSV(url);
  const raw = parseCSV<Record<string, string>>(csv);

  return raw
    .filter((row) => {
      if (!row["Modelo"] || !(row["Preco Pix"] || row["Preço Pix"])) return false;
      const status = (row["Status"] || "").trim().toLowerCase();
      return status !== "esgotado";
    })
    .map((row) => ({
      modelo: row["Modelo"].trim(),
      armazenamento: (row["Armazenamento"] || "").trim(),
      precoPix: parseNumber(row["Preco Pix"] || row["Preço Pix"] || "0"),
    }));
}

export async function fetchUsedValues(): Promise<UsedDeviceValue[]> {
  const url = process.env.SHEET_USADOS_BASE_URL;
  if (!url) throw new Error("SHEET_USADOS_BASE_URL nao configurada");

  const csv = await fetchCSV(url);
  const raw = parseCSV<Record<string, string>>(csv);

  return raw
    .filter((row) => row["Modelo"] && row["Valor Base (R$)"])
    .map((row) => ({
      modelo: row["Modelo"].trim(),
      armazenamento: (row["Armazenamento"] || "").trim(),
      valorBase: parseNumber(row["Valor Base (R$)"]),
    }));
}

export async function fetchDiscountRules(): Promise<DiscountRule[]> {
  const url = process.env.SHEET_USADOS_DESCONTOS_URL;
  if (!url) throw new Error("SHEET_USADOS_DESCONTOS_URL nao configurada");

  const csv = await fetchCSV(url);
  const raw = parseCSV<Record<string, string>>(csv);

  return raw
    .filter((row) => row["Condição"] || row["Condicao"])
    .map((row) => ({
      condicao: (row["Condição"] || row["Condicao"] || "").trim(),
      detalhe: (row["Detalhe"] || "").trim(),
      desconto: parseNumber(row["Desconto (R$)"] || "0"),
    }));
}

export async function fetchExcludedModels(): Promise<string[]> {
  const url = process.env.SHEET_USADOS_EXCLUIDOS_URL;
  if (!url) throw new Error("SHEET_USADOS_EXCLUIDOS_URL nao configurada");

  const csv = await fetchCSV(url);
  const raw = parseCSV<Record<string, string>>(csv);

  return raw
    .filter((row) => row["Modelo (não aceito trade-in)"] || row["Modelo (nao aceito trade-in)"])
    .map((row) => (row["Modelo (não aceito trade-in)"] || row["Modelo (nao aceito trade-in)"] || "").trim());
}

export async function fetchConfig(): Promise<AppConfig> {
  const url = process.env.SHEET_CONFIG_URL;
  if (!url) throw new Error("SHEET_CONFIG_URL nao configurada");

  const csv = await fetchCSV(url);
  const raw = parseCSV<Record<string, string>>(csv);

  const configMap: Record<string, string> = {};
  for (const row of raw) {
    const key = (row["Parâmetro"] || row["Parametro"] || "").trim();
    if (key) {
      configMap[key] = (row["Valor"] || "").trim();
    }
  }

  return {
    multiplier12: parseNumber(configMap["Parcela 12x - Multiplicador"] || "1,14"),
    multiplier18: parseNumber(configMap["Parcela 18x - Multiplicador"] || "1,2"),
    multiplier21: parseNumber(configMap["Parcela 21x - Multiplicador"] || "1,21"),
    validadeHoras: parseInt(configMap["Validade orçamento (horas)"] || configMap["Validade orcamento (horas)"] || "24"),
    whatsappNumero: configMap["WhatsApp número"] || configMap["WhatsApp numero"] || process.env.WHATSAPP_NUMBER || "5521999999999",
    bonusGarantiaAte3m: parseNumber(configMap["Bonus garantia ate 3 meses"] || "0.03"),
    bonusGarantia3a6m: parseNumber(configMap["Bonus garantia 3 a 6 meses"] || "0.05"),
    bonusGarantia6mMais: parseNumber(configMap["Bonus garantia 6 meses ou mais"] || "0.07"),
  };
}

/**
 * Fetch descontos por modelo (nova aba na planilha)
 * Formato: Modelo | Condição | Detalhe | Desconto (R$)
 * Ex: iPhone 16 Pro | Bateria | Abaixo de 85% | -400
 * Se nao tiver a env var configurada, retorna vazio (usa fallback geral)
 */
export async function fetchModelDiscounts(): Promise<Record<string, Record<string, Record<string, number>>>> {
  const url = process.env.SHEET_USADOS_DESCONTOS_MODELO_URL;
  if (!url) return {};

  try {
    const csv = await fetchCSV(url);
    const raw = parseCSV<Record<string, string>>(csv);

    // Agrupa por modelo -> condicao -> detalhe -> desconto
    const result: Record<string, Record<string, Record<string, number>>> = {};

    for (const row of raw) {
      const modelo = (row["Modelo"] || row["MODELO"] || "").trim();
      const condicao = (row["Condição"] || row["Condicao"] || row["CONDIÇÃO"] || row["CONDICAO"] || "").trim();
      const detalhe = (row["Detalhe"] || row["DETALHE"] || "").trim();
      const desconto = parseNumber(row["Desconto (R$)"] || row["DESCONTO"] || "0");

      if (!modelo || !condicao) continue;

      if (!result[modelo]) result[modelo] = {};
      if (!result[modelo][condicao]) result[modelo][condicao] = {};
      result[modelo][condicao][detalhe] = desconto;
    }

    return result;
  } catch {
    return {};
  }
}

/**
 * Converte os dados brutos da planilha de descontos por modelo
 * para o formato ModelDiscounts usado no calculations.ts
 */
export function buildModelDiscountsMap(
  rawMap: Record<string, Record<string, Record<string, number>>>
): Record<string, {
  screenScratch: { none: number; one: number; multiple: number };
  sideScratch: { none: number; one: number; multiple: number };
  peeling: { none: number; light: number; heavy: number };
  batteryTiers: BatteryTier[];
  warrantyBonuses?: { ate3m: number; de3a6m: number; acima6m: number };
}> {
  const result: Record<string, {
    screenScratch: { none: number; one: number; multiple: number };
    sideScratch: { none: number; one: number; multiple: number };
    peeling: { none: number; light: number; heavy: number };
    batteryTiers: BatteryTier[];
    warrantyBonuses?: { ate3m: number; de3a6m: number; acima6m: number };
  }> = {};

  for (const [modelo, condicoes] of Object.entries(rawMap)) {
    const tela = condicoes["Riscos na tela"] || {};
    const lateral = condicoes["Riscos laterais"] || {};
    const desc = condicoes["Descascado/Amassado"] || {};
    const bat = condicoes["Bateria"] || {};
    const garantia = condicoes["Garantia"] || {};

    // Parse battery tiers — suporta qualquer combinacao de thresholds
    const BATTERY_THRESHOLD_MAP: Record<string, number> = {
      "Abaixo de 95%": 95,
      "Abaixo de 90%": 90,
      "Abaixo de 85%": 85,
      "Abaixo de 80%": 80,
    };
    const batteryTiers: BatteryTier[] = [];
    for (const [detail, threshold] of Object.entries(BATTERY_THRESHOLD_MAP)) {
      if (bat[detail] !== undefined) {
        batteryTiers.push({ threshold, discount: bat[detail] });
      }
    }

    const hasWarrantyBonuses = Object.keys(garantia).length > 0;

    result[modelo] = {
      screenScratch: {
        none: tela["Nenhum"] ?? 0,
        one: tela["1 risco"] ?? -100,
        multiple: tela["2 ou mais"] ?? -250,
      },
      sideScratch: {
        none: lateral["Nenhum"] ?? 0,
        one: lateral["1 risco"] ?? -100,
        multiple: lateral["2 ou mais"] ?? -250,
      },
      peeling: {
        none: desc["Não"] ?? desc["Nao"] ?? 0,
        light: desc["Leve"] ?? -200,
        heavy: desc["Forte"] ?? -300,
      },
      batteryTiers: batteryTiers.length > 0 ? batteryTiers : [{ threshold: 85, discount: -200 }],
      ...(hasWarrantyBonuses ? {
        warrantyBonuses: {
          ate3m: garantia["Ate 3 meses"] ?? 0.03,
          de3a6m: garantia["3 a 6 meses"] ?? 0.05,
          acima6m: garantia["6 meses ou mais"] ?? 0.07,
        },
      } : {}),
    };
  }

  return result;
}

export async function fetchAllSheetData() {
  const [newProducts, usedValues, discountRules, excludedModels, config, modelDiscountsRaw] =
    await Promise.all([fetchNewProducts(), fetchUsedValues(), fetchDiscountRules(), fetchExcludedModels(), fetchConfig(), fetchModelDiscounts()]);

  const modelDiscounts = buildModelDiscountsMap(modelDiscountsRaw);

  return { newProducts, usedValues, excludedModels, discountRules, config, modelDiscounts, loadedAt: Date.now() };
}

// Frontend helpers

export function getUniqueModels(products: NewProduct[]): string[] {
  return [...new Set(products.map((p) => p.modelo))];
}

export function getStoragesForModel(products: NewProduct[], modelo: string): string[] {
  return [...new Set(products.filter((p) => p.modelo === modelo).map((p) => p.armazenamento))];
}

export function getProductPrice(products: NewProduct[], modelo: string, armazenamento: string): number | null {
  const product = products.find((p) => p.modelo === modelo && p.armazenamento === armazenamento);
  return product?.precoPix ?? null;
}

export function getUniqueUsedModels(usedValues: UsedDeviceValue[]): string[] {
  return [...new Set(usedValues.map((d) => d.modelo))];
}

export function getUsedStoragesForModel(usedValues: UsedDeviceValue[], modelo: string): string[] {
  return [...new Set(usedValues.filter((d) => d.modelo === modelo).map((d) => d.armazenamento))];
}

export function getUsedBaseValue(usedValues: UsedDeviceValue[], modelo: string, armazenamento: string): number | null {
  const device = usedValues.find((d) => d.modelo === modelo && d.armazenamento === armazenamento);
  return device?.valorBase ?? null;
}
