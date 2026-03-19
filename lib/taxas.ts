// ============================================
// Motor de Taxas das Maquininhas — TigrãoImports
// ============================================

type TaxaMap = Record<string, Record<string, number>>;

// Taxas ITAÚ (%)
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
const TAXAS_MP: Record<string, number> = {
  pix: 0, debito: 0,
  "1x": 3.25, "2x": 3.80, "3x": 4.55,
  "6x": 6.80, "12x": 11.34,
};

const MAQUININHAS: Record<string, TaxaMap | Record<string, number>> = {
  ITAU: TAXAS_ITAU,
  INFINITE: TAXAS_INFINITE,
  MERCADO_PAGO: TAXAS_MP,
};

/**
 * Retorna a taxa (%) para uma combinação banco/bandeira/parcelas.
 * Para Mercado Pago, a bandeira é ignorada (taxa igual para todas).
 */
export function getTaxa(
  banco: string,
  bandeira: string | null,
  parcelas: number | null,
  forma: string
): number {
  if (forma === "PIX" || forma === "DINHEIRO") return 0;
  if (forma === "FIADO") return 0;

  const key = parcelas === 0 || forma === "CARTAO" && parcelas === null
    ? "debito"
    : `${parcelas}x`;

  if (banco === "MERCADO_PAGO") {
    return (TAXAS_MP as Record<string, number>)[key] ?? 0;
  }

  const taxasBanco = MAQUININHAS[banco] as TaxaMap | undefined;
  if (!taxasBanco || !bandeira) return 0;

  const taxasBandeira = taxasBanco[bandeira];
  if (!taxasBandeira) return 0;

  // Procurar taxa exata ou a mais próxima menor
  if (taxasBandeira[key] !== undefined) return taxasBandeira[key];

  // Interpolar para parcelas intermediárias (ex: 4x no Itaú)
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

  // Interpolação linear
  const taxaLow = taxasBandeira[lower.key];
  const taxaUp = taxasBandeira[upper.key];
  const ratio = (parc - lower.num) / (upper.num - lower.num);
  return Math.round((taxaLow + (taxaUp - taxaLow) * ratio) * 100) / 100;
}

/** Calcula o valor líquido a partir do bruto */
export function calcularLiquido(valorBruto: number, taxaPct: number): number {
  return Math.round(valorBruto * (1 - taxaPct / 100) * 100) / 100;
}

/** Calcula o valor bruto (comprovante) a partir do líquido */
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
  if (forma === "CARTAO") {
    if (!parcelas || parcelas <= 1) return "D+1";
    return "D+1"; // Cartão sempre D+1
  }
  return "D+0";
}

/** Retorna todas as taxas de um banco para exibição */
export function getTaxasBanco(banco: string): TaxaMap | Record<string, number> | null {
  return (MAQUININHAS[banco] as TaxaMap | Record<string, number>) ?? null;
}
