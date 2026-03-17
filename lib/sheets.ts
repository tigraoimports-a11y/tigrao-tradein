// lib/sheets.ts

import Papa from "papaparse";
import type { NewProduct, UsedDeviceValue, DiscountRule, AppConfig } from "./types";

const REVALIDATE_SECONDS = 300;

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
  const cleaned = str
    .replace(/R\$\s*/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

export async function fetchNewProducts(): Promise<NewProduct[]> {
  const url = process.env.SHEET_PRODUTOS_URL;
  if (!url) throw new Error("SHEET_PRODUTOS_URL nao configurada");

  const csv = await fetchCSV(url);
  const raw = parseCSV<Record<string, string>>(csv);

  return raw
    .filter((row) => row["Modelo"] && row["Preco Pix"] || row["Preço Pix"])
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
  };
}

export async function fetchAllSheetData() {
  const [newProducts, usedValues, discountRules, excludedModels, config] =
    await Promise.all([fetchNewProducts(), fetchUsedValues(), fetchDiscountRules(), fetchExcludedModels(), fetchConfig()]);

  return { newProducts, usedValues, excludedModels, discountRules, config, loadedAt: Date.now() };
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
