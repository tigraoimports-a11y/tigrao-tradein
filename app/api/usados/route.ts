import { NextResponse } from "next/server";
import { fetchUsedValues, fetchExcludedModels, fetchDiscountRules } from "@/lib/sheets";
import type { UsedDeviceValue } from "@/lib/types";

// Fallback: valores base hardcoded (CLAUDE.md)
const FALLBACK_USED_VALUES: UsedDeviceValue[] = [
  { modelo: "iPhone 11", armazenamento: "64GB", valorBase: 900 },
  { modelo: "iPhone 11", armazenamento: "128GB", valorBase: 1050 },
  { modelo: "iPhone 11 Pro", armazenamento: "64GB", valorBase: 1050 },
  { modelo: "iPhone 11 Pro", armazenamento: "128GB", valorBase: 1150 },
  { modelo: "iPhone 11 Pro", armazenamento: "256GB", valorBase: 1300 },
  { modelo: "iPhone 11 Pro Max", armazenamento: "64GB", valorBase: 1200 },
  { modelo: "iPhone 11 Pro Max", armazenamento: "128GB", valorBase: 1350 },
  { modelo: "iPhone 11 Pro Max", armazenamento: "256GB", valorBase: 1500 },
  { modelo: "iPhone 12", armazenamento: "64GB", valorBase: 1200 },
  { modelo: "iPhone 12", armazenamento: "128GB", valorBase: 1400 },
  { modelo: "iPhone 12", armazenamento: "256GB", valorBase: 1550 },
  { modelo: "iPhone 12 Pro", armazenamento: "128GB", valorBase: 1600 },
  { modelo: "iPhone 12 Pro", armazenamento: "256GB", valorBase: 1750 },
  { modelo: "iPhone 12 Pro Max", armazenamento: "128GB", valorBase: 1750 },
  { modelo: "iPhone 12 Pro Max", armazenamento: "256GB", valorBase: 1900 },
  { modelo: "iPhone 12 Pro Max", armazenamento: "512GB", valorBase: 2100 },
  { modelo: "iPhone 13", armazenamento: "128GB", valorBase: 1700 },
  { modelo: "iPhone 13", armazenamento: "256GB", valorBase: 1900 },
  { modelo: "iPhone 13", armazenamento: "512GB", valorBase: 2100 },
  { modelo: "iPhone 13 Pro", armazenamento: "128GB", valorBase: 2000 },
  { modelo: "iPhone 13 Pro", armazenamento: "256GB", valorBase: 2200 },
  { modelo: "iPhone 13 Pro", armazenamento: "512GB", valorBase: 2400 },
  { modelo: "iPhone 13 Pro", armazenamento: "1TB", valorBase: 2600 },
  { modelo: "iPhone 13 Pro Max", armazenamento: "128GB", valorBase: 2300 },
  { modelo: "iPhone 13 Pro Max", armazenamento: "256GB", valorBase: 2500 },
  { modelo: "iPhone 13 Pro Max", armazenamento: "512GB", valorBase: 2700 },
  { modelo: "iPhone 13 Pro Max", armazenamento: "1TB", valorBase: 2900 },
  { modelo: "iPhone 14", armazenamento: "128GB", valorBase: 2300 },
  { modelo: "iPhone 14", armazenamento: "256GB", valorBase: 2550 },
  { modelo: "iPhone 14", armazenamento: "512GB", valorBase: 2800 },
  { modelo: "iPhone 14 Plus", armazenamento: "128GB", valorBase: 2500 },
  { modelo: "iPhone 14 Plus", armazenamento: "256GB", valorBase: 2750 },
  { modelo: "iPhone 14 Plus", armazenamento: "512GB", valorBase: 3000 },
  { modelo: "iPhone 14 Pro", armazenamento: "128GB", valorBase: 2800 },
  { modelo: "iPhone 14 Pro", armazenamento: "256GB", valorBase: 3050 },
  { modelo: "iPhone 14 Pro", armazenamento: "512GB", valorBase: 3300 },
  { modelo: "iPhone 14 Pro", armazenamento: "1TB", valorBase: 3550 },
  { modelo: "iPhone 14 Pro Max", armazenamento: "128GB", valorBase: 3100 },
  { modelo: "iPhone 14 Pro Max", armazenamento: "256GB", valorBase: 3350 },
  { modelo: "iPhone 14 Pro Max", armazenamento: "512GB", valorBase: 3600 },
  { modelo: "iPhone 14 Pro Max", armazenamento: "1TB", valorBase: 3850 },
  { modelo: "iPhone 15", armazenamento: "128GB", valorBase: 3000 },
  { modelo: "iPhone 15", armazenamento: "256GB", valorBase: 3250 },
  { modelo: "iPhone 15", armazenamento: "512GB", valorBase: 3500 },
  { modelo: "iPhone 15 Plus", armazenamento: "128GB", valorBase: 3300 },
  { modelo: "iPhone 15 Plus", armazenamento: "256GB", valorBase: 3550 },
  { modelo: "iPhone 15 Plus", armazenamento: "512GB", valorBase: 3800 },
  { modelo: "iPhone 15 Pro", armazenamento: "128GB", valorBase: 3600 },
  { modelo: "iPhone 15 Pro", armazenamento: "256GB", valorBase: 3900 },
  { modelo: "iPhone 15 Pro", armazenamento: "512GB", valorBase: 4200 },
  { modelo: "iPhone 15 Pro", armazenamento: "1TB", valorBase: 4500 },
  { modelo: "iPhone 15 Pro Max", armazenamento: "256GB", valorBase: 4500 },
  { modelo: "iPhone 15 Pro Max", armazenamento: "512GB", valorBase: 4800 },
  { modelo: "iPhone 15 Pro Max", armazenamento: "1TB", valorBase: 5100 },
  { modelo: "iPhone 16", armazenamento: "128GB", valorBase: 3800 },
  { modelo: "iPhone 16", armazenamento: "256GB", valorBase: 4100 },
  { modelo: "iPhone 16", armazenamento: "512GB", valorBase: 4400 },
  { modelo: "iPhone 16 Plus", armazenamento: "128GB", valorBase: 4200 },
  { modelo: "iPhone 16 Plus", armazenamento: "256GB", valorBase: 4500 },
  { modelo: "iPhone 16 Plus", armazenamento: "512GB", valorBase: 4800 },
  { modelo: "iPhone 16 Pro", armazenamento: "128GB", valorBase: 4600 },
  { modelo: "iPhone 16 Pro", armazenamento: "256GB", valorBase: 4900 },
  { modelo: "iPhone 16 Pro", armazenamento: "512GB", valorBase: 5300 },
  { modelo: "iPhone 16 Pro", armazenamento: "1TB", valorBase: 5700 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "256GB", valorBase: 5500 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "512GB", valorBase: 5900 },
  { modelo: "iPhone 16 Pro Max", armazenamento: "1TB", valorBase: 6300 },
];

const FALLBACK_EXCLUDED = [
  "iPhone 7", "iPhone 8", "iPhone X", "iPhone XS", "iPhone XR",
  "iPhone 12 Mini", "iPhone 13 Mini", "iPhone SE",
];

export async function GET() {
  try {
    const [usedValues, excludedModels, discountRules] = await Promise.all([
      fetchUsedValues(),
      fetchExcludedModels(),
      fetchDiscountRules(),
    ]);
    return NextResponse.json({ usedValues, excludedModels, discountRules });
  } catch (error) {
    console.error("Erro ao buscar dados de usados:", error);
    return NextResponse.json({
      usedValues: FALLBACK_USED_VALUES,
      excludedModels: FALLBACK_EXCLUDED,
      discountRules: [],
    });
  }
}
