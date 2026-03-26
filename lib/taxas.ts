// ============================================
// Motor de Taxas das Maquininhas — TigraoImports
// ============================================

type TaxaMap = Record<string, Record<string, number>>;

// ── Hardcoded fallback values ──
// These are always available as backup if DB is unreachable

// Taxas ITAU (%)
const TAXAS_ITAU: TaxaMap = {
  VISA: {
    debito: 1.09, "1x": 3.57, "2x": 4.01, "3x": 4.60,
    "6x": 6.37, "12x": 10.03, "18x": 13.57, "21x": 15.34,
  },
  MASTERCARD: {
    debito: 1.09, "1x": 3.57, "2x": 4.01, "3x": 4.60,
    "6x": 6.37, "12x": 10.03, "18x": 13.57, "21x": 15.34,
  },
  ELO: {
    debito: 1.89, "1x": 4.37, "2x": 4.81, "3x": 5.40,
    "6x": 7.17, "12x": 10.83,
  },
  AMEX: {
    debito: 1.89, "1x": 4.37, "2x": 4.81, "3x": 5.40,
    "6x": 7.17, "12x": 10.83,
  },
};

// Taxas INFINITE (%)
const TAXAS_INFINITE: TaxaMap = {
  VISA: {
    debito: 0.75,
    "1x": 2.69, "2x": 3.94, "3x": 4.46, "4x": 4.98,
    "5x": 5.49, "6x": 5.99, "7x": 6.51, "8x": 6.99,
    "9x": 7.51, "10x": 7.99, "11x": 8.49, "12x": 8.99,
  },
  MASTERCARD: {
    debito: 0.75,
    "1x": 2.69, "2x": 3.94, "3x": 4.46, "4x": 4.98,
    "5x": 5.49, "6x": 5.99, "7x": 6.51, "8x": 6.99,
    "9x": 7.51, "10x": 7.99, "11x": 8.49, "12x": 8.99,
  },
  ELO: {
    debito: 1.88,
    "1x": 4.46, "2x": 5.81, "3x": 6.32, "4x": 6.83,
    "5x": 7.33, "6x": 7.83, "7x": 8.34, "8x": 8.83,
    "9x": 9.32, "10x": 9.81, "11x": 10.29, "12x": 10.77,
  },
  AMEX: {
    debito: 1.88,
    "1x": 4.46, "2x": 5.81, "3x": 6.32, "4x": 6.83,
    "5x": 7.33, "6x": 7.83, "7x": 8.34, "8x": 8.83,
    "9x": 9.32, "10x": 9.81, "11x": 10.29, "12x": 10.77,
  },
};

// Taxas MERCADO PAGO — Link (%) — Todas as bandeiras iguais
// Base: taxa parcelamento + 2,30% antecipacao de recebiveis
// Nota: taxa real pode diferir ~0,04% do app MP por arredondamento por parcela
const TAXAS_MP: Record<string, number> = {
  pix: 0, debito: 0,
  "1x": 3.25, "2x": 3.80, "3x": 4.55, "4x": 5.30,
  "5x": 6.05, "6x": 6.80, "7x": 7.55, "8x": 8.30,
  "9x": 9.05, "10x": 9.80, "11x": 10.55, "12x": 11.34,
};

const MAQUININHAS: Record<string, TaxaMap | Record<string, number>> = {
  ITAU: TAXAS_ITAU,
  INFINITE: TAXAS_INFINITE,
  MERCADO_PAGO: TAXAS_MP,
};

// ── DB-backed taxas with in-memory cache ──

interface DBTaxaRow {
  banco: string;
  bandeira: string;
  parcelas: string;
  taxa_pct: number;
}

interface TaxasCache {
  data: Record<string, TaxaMap | Record<string, number>>;
  fetchedAt: number;
}

let _taxasCache: TaxasCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch taxas from DB (Supabase) via server-side import.
 * Returns null if fetch fails — caller should fallback to hardcoded.
 */
async function fetchTaxasFromDB(): Promise<Record<string, TaxaMap | Record<string, number>> | null> {
  // Check cache
  if (_taxasCache && Date.now() - _taxasCache.fetchedAt < CACHE_TTL_MS) {
    return _taxasCache.data;
  }

  try {
    const { supabase } = await import("@/lib/supabase");
    const { data, error } = await supabase
      .from("taxas_config")
      .select("banco, bandeira, parcelas, taxa_pct");

    if (error || !data || data.length === 0) {
      console.warn("fetchTaxasFromDB: falha ou sem dados, usando fallback hardcoded");
      return null;
    }

    // Build nested structure
    const result: Record<string, TaxaMap> = {};

    for (const row of data as DBTaxaRow[]) {
      if (!result[row.banco]) result[row.banco] = {};
      if (!result[row.banco][row.bandeira]) result[row.banco][row.bandeira] = {};
      result[row.banco][row.bandeira][row.parcelas] = Number(row.taxa_pct);
    }

    // For MERCADO_PAGO, flatten to Record<string, number> (bandeira ALL)
    const mp = result.MERCADO_PAGO;
    let mpFlat: Record<string, number> | undefined;
    if (mp?.ALL) {
      mpFlat = mp.ALL;
    }

    const final: Record<string, TaxaMap | Record<string, number>> = {};
    for (const banco of Object.keys(result)) {
      if (banco === "MERCADO_PAGO" && mpFlat) {
        final[banco] = mpFlat;
      } else {
        final[banco] = result[banco];
      }
    }

    // Update cache
    _taxasCache = { data: final, fetchedAt: Date.now() };
    return final;
  } catch (err) {
    console.error("fetchTaxasFromDB error:", err);
    return null;
  }
}

/** Invalidate the in-memory taxas cache (call after admin updates) */
export function invalidateTaxasCache() {
  _taxasCache = null;
}

/**
 * Get the full taxas map — tries DB first, falls back to hardcoded.
 * Server-side only (uses Supabase service role key).
 */
async function getMaquininhas(): Promise<Record<string, TaxaMap | Record<string, number>>> {
  const dbData = await fetchTaxasFromDB();
  if (dbData) return dbData;
  return MAQUININHAS;
}

// ── Helper to resolve taxa from a given data source ──

function resolveTaxa(
  maquininhas: Record<string, TaxaMap | Record<string, number>>,
  banco: string,
  bandeira: string | null,
  parcelas: number | null,
  forma: string
): number {
  if (forma === "PIX" || forma === "DINHEIRO") return 0;
  if (forma === "FIADO") return 0;
  if (forma === "DEBITO") return 0.75;

  const key = parcelas === 0 || forma === "CARTAO" && parcelas === null
    ? "debito"
    : `${parcelas}x`;

  if (banco === "MERCADO_PAGO") {
    const mp = maquininhas[banco] as Record<string, number> | undefined;
    return mp?.[key] ?? 0;
  }

  const taxasBanco = maquininhas[banco] as TaxaMap | undefined;
  if (!taxasBanco || !bandeira) return 0;

  const taxasBandeira = taxasBanco[bandeira];
  if (!taxasBandeira) return 0;

  // Exact match
  if (taxasBandeira[key] !== undefined) return taxasBandeira[key];

  // Interpolate for intermediate installments (e.g. 4x on ITAU)
  const parcKeys = Object.keys(taxasBandeira)
    .filter((k) => k.endsWith("x"))
    .map((k) => ({ key: k, num: parseInt(k) }))
    .filter((k) => !isNaN(k.num))
    .sort((a, b) => a.num - b.num);

  const parc = parcelas ?? 1;
  let lower = parcKeys[0];
  let upper = parcKeys[parcKeys.length - 1];

  for (const pk of parcKeys) {
    if (pk.num <= parc) lower = pk;
    if (pk.num >= parc && upper.num >= pk.num) {
      upper = pk;
      break;
    }
  }

  if (lower.num === upper.num) return taxasBandeira[lower.key];

  // Linear interpolation
  const taxaLow = taxasBandeira[lower.key];
  const taxaUp = taxasBandeira[upper.key];
  const ratio = (parc - lower.num) / (upper.num - lower.num);
  return Math.round((taxaLow + (taxaUp - taxaLow) * ratio) * 100) / 100;
}

/**
 * Retorna a taxa (%) para uma combinacao banco/bandeira/parcelas.
 * Para Mercado Pago, a bandeira e ignorada (taxa igual para todas).
 * Uses hardcoded values (synchronous). For DB values, use getTaxaAsync.
 */
export function getTaxa(
  banco: string,
  bandeira: string | null,
  parcelas: number | null,
  forma: string
): number {
  // Try cached DB data first (synchronous — only if cache is warm)
  if (_taxasCache && Date.now() - _taxasCache.fetchedAt < CACHE_TTL_MS) {
    return resolveTaxa(_taxasCache.data, banco, bandeira, parcelas, forma);
  }
  // Fallback to hardcoded
  return resolveTaxa(MAQUININHAS, banco, bandeira, parcelas, forma);
}

/**
 * Async version of getTaxa — fetches from DB with fallback.
 * Use this in server-side contexts (API routes, server components).
 */
export async function getTaxaAsync(
  banco: string,
  bandeira: string | null,
  parcelas: number | null,
  forma: string
): Promise<number> {
  const maq = await getMaquininhas();
  return resolveTaxa(maq, banco, bandeira, parcelas, forma);
}

/** Calcula o valor liquido a partir do bruto */
export function calcularLiquido(valorBruto: number, taxaPct: number): number {
  return Math.round(valorBruto * (1 - taxaPct / 100) * 100) / 100;
}

/** Calcula o valor bruto (comprovante) a partir do liquido */
export function calcularBruto(valorLiquido: number, taxaPct: number): number {
  if (taxaPct >= 100) return 0;
  return Math.round((valorLiquido / (1 - taxaPct / 100)) * 100) / 100;
}

/** Determina o tipo de recebimento baseado na forma de pagamento */
export function calcularRecebimento(
  forma: string,
  parcelas: number | null
): string {
  if (forma === "PIX" || forma === "DINHEIRO") return "D+0";
  if (forma === "FIADO") return "FIADO";
  if (forma === "DEBITO") return "D+1";
  if (forma === "CARTAO") {
    if (!parcelas || parcelas <= 1) return "D+1";
    return "D+1"; // Cartao sempre D+1
  }
  return "D+0";
}

/** Retorna todas as taxas de um banco para exibicao */
export function getTaxasBanco(banco: string): TaxaMap | Record<string, number> | null {
  // Try cached DB data first
  if (_taxasCache && Date.now() - _taxasCache.fetchedAt < CACHE_TTL_MS) {
    return (_taxasCache.data[banco] as TaxaMap | Record<string, number>) ?? null;
  }
  return (MAQUININHAS[banco] as TaxaMap | Record<string, number>) ?? null;
}

/** Async version — fetches from DB with fallback */
export async function getTaxasBancoAsync(banco: string): Promise<TaxaMap | Record<string, number> | null> {
  const maq = await getMaquininhas();
  return (maq[banco] as TaxaMap | Record<string, number>) ?? null;
}
