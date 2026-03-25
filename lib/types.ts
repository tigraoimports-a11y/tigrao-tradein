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
  bonusGarantiaAte3m: number;
  bonusGarantia3a6m: number;
  bonusGarantia6mMais: number;
}

/** Regra de desconto por condição */
export interface DiscountRule {
  condicao: string;
  detalhe: string;
  desconto: number;
}

/** Opção de resposta de uma pergunta trade-in */
export interface TradeInQuestionOption {
  value: string;
  label: string;
  discount: number;
  variant?: "default" | "success" | "error";
  reject?: boolean;
  rejectMessage?: string;
}

/** Pergunta configurável do trade-in */
export interface TradeInQuestion {
  id: string;
  slug: string;
  titulo: string;
  tipo: "yesno" | "selection" | "numeric" | "conditional_date";
  opcoes: TradeInQuestionOption[];
  ordem: number;
  ativo: boolean;
  config: Record<string, unknown>;
  device_type: string;
}

/** Configuração do formulário trade-in (Supabase tradein_config) */
export interface SeminovoOption {
  modelo: string;
  storages: string[];
  ativo: boolean;
}

export interface TradeInConfig {
  id: string;
  seminovos: SeminovoOption[];
  labels: Record<string, string>;
  origens: string[];
  updated_at: string;
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
