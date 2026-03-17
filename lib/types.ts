// lib/types.ts

/** Produto novo disponível para venda (sem cor) */
export interface NewProduct {
  modelo: string;
  armazenamento: string;
  precoPix: number;
}

/** Valor base de um aparelho usado */
export interface UsedDeviceValue {
  modelo: string;
  armazenamento: string;
  valorBase: number;
}

/** Modelo excluído do trade-in */
export interface ExcludedModel {
  modelo: string;
}

/** Configuração do sistema */
export interface AppConfig {
  multiplier12: number;
  multiplier18: number;
  multiplier21: number;
  validadeHoras: number;
  whatsappNumero: string;
}

/** Regra de desconto por condição */
export interface DiscountRule {
  condicao: string;
  detalhe: string;
  desconto: number;
}

/** Dados carregados das planilhas */
export interface SheetData {
  newProducts: NewProduct[];
  usedValues: UsedDeviceValue[];
  excludedModels: string[];
  discountRules: DiscountRule[];
  config: AppConfig;
  loadedAt: number;
}
