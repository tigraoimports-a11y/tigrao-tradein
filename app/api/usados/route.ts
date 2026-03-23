import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchUsedValues, fetchExcludedModels, fetchDiscountRules, fetchModelDiscounts, buildModelDiscountsMap } from "@/lib/sheets";
import { FALLBACK_IPAD_VALUES, FALLBACK_MACBOOK_VALUES } from "@/lib/calculations";
import type { UsedDeviceValue } from "@/lib/types";

// Fallback hardcoded (último recurso) — iPhones
const FALLBACK_USED_VALUES: UsedDeviceValue[] = [
  { modelo: "iPhone 11", armazenamento: "64GB", valorBase: 900 },
  { modelo: "iPhone 11", armazenamento: "128GB", valorBase: 1050 },
  { modelo: "iPhone 12", armazenamento: "64GB", valorBase: 1200 },
  { modelo: "iPhone 12", armazenamento: "128GB", valorBase: 1400 },
  { modelo: "iPhone 13", armazenamento: "128GB", valorBase: 1700 },
  { modelo: "iPhone 14", armazenamento: "128GB", valorBase: 2300 },
  { modelo: "iPhone 15", armazenamento: "128GB", valorBase: 3000 },
  { modelo: "iPhone 16", armazenamento: "128GB", valorBase: 3800 },
  // iPads
  ...FALLBACK_IPAD_VALUES,
  // MacBooks
  ...FALLBACK_MACBOOK_VALUES,
];

const FALLBACK_EXCLUDED = [
  "iPhone 7", "iPhone 8", "iPhone X", "iPhone XS", "iPhone XR",
  "iPhone 12 Mini", "iPhone 13 Mini", "iPhone SE",
];

export async function GET() {
  // PRIORIDADE 1: Supabase (dados editados pelo admin)
  try {
    const [valoresRes, descontosRes, excluidosRes] = await Promise.all([
      supabase.from("avaliacao_usados").select("*").eq("ativo", true),
      supabase.from("descontos_condicao").select("*"),
      supabase.from("modelos_excluidos").select("modelo"),
    ]);

    const dbValores = valoresRes.data ?? [];
    const dbDescontos = descontosRes.data ?? [];
    const dbExcluidos = excluidosRes.data ?? [];

    // Se há dados no Supabase, usar eles
    if (dbValores.length > 0) {
      // Converter para o formato esperado pelo frontend
      const usedValues: UsedDeviceValue[] = dbValores.map((v) => {
        let val = Number(v.valor_base);
        // Sanidade: valor base de usado nunca passa de R$ 15.000
        if (val > 15000) {
          console.error(`[SANIDADE] valor_base absurdo: ${v.modelo} ${v.armazenamento} = ${val}, ignorando`);
          val = 0;
        }
        return { modelo: v.modelo, armazenamento: v.armazenamento, valorBase: val };
      });

      const excludedModels = dbExcluidos.map((e) => e.modelo);

      // Separar descontos gerais vs por modelo
      const discountRules: { condicao: string; detalhe: string; desconto: number }[] = [];
      const modelDiscountsRaw: Record<string, Record<string, Record<string, number>>> = {};

      for (const d of dbDescontos) {
        const match = d.condicao.match(/^(iPhone .+?) - (.+)$/);
        if (match) {
          // Desconto por modelo
          const modelo = match[1];
          const cond = match[2];
          if (!modelDiscountsRaw[modelo]) modelDiscountsRaw[modelo] = {};
          if (!modelDiscountsRaw[modelo][cond]) modelDiscountsRaw[modelo][cond] = {};
          modelDiscountsRaw[modelo][cond][d.detalhe] = Number(d.desconto);
        } else {
          // Desconto geral
          discountRules.push({
            condicao: d.condicao,
            detalhe: d.detalhe,
            desconto: Number(d.desconto),
          });
        }
      }

      // Converter modelDiscountsRaw para o formato ModelDiscounts do frontend
      const modelDiscounts = buildModelDiscountsMap(modelDiscountsRaw);

      return NextResponse.json({ usedValues, excludedModels, discountRules, modelDiscounts });
    }
  } catch (err) {
    console.error("Supabase usados error (falling back to Sheets):", err);
  }

  // PRIORIDADE 2: Google Sheets
  try {
    const [usedValues, excludedModels, discountRules, modelDiscountsRaw] = await Promise.all([
      fetchUsedValues(),
      fetchExcludedModels(),
      fetchDiscountRules(),
      fetchModelDiscounts(),
    ]);
    const modelDiscounts = buildModelDiscountsMap(modelDiscountsRaw);
    return NextResponse.json({ usedValues, excludedModels, discountRules, modelDiscounts });
  } catch (error) {
    console.error("Sheets usados error (using hardcoded fallback):", error);
  }

  // PRIORIDADE 3: Fallback hardcoded
  return NextResponse.json({
    usedValues: FALLBACK_USED_VALUES,
    excludedModels: FALLBACK_EXCLUDED,
    discountRules: [],
    modelDiscounts: {},
  });
}
