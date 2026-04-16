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
  tipo: "yesno" | "selection" | "numeric" | "conditional_date" | "multiselect";
  opcoes: TradeInQuestionOption[];
  ordem: number;
  ativo: boolean;
  config: Record<string, unknown>;
  device_type: string;
}

/** Categoria do seminovo ofertado ao cliente (aba no admin + filtro no StepNewDevice). */
export type SeminovoCategoria = "iphone" | "ipad" | "macbook" | "watch";

/** Ordem canônica das categorias (usada para abas e filtros). */
export const SEMINOVO_CATEGORIAS: readonly SeminovoCategoria[] = ["iphone", "ipad", "macbook", "watch"] as const;

/** Label + ícone por categoria. Consumido pelo admin e pelo StepNewDevice. */
export const SEMINOVO_CAT_LABELS: Record<SeminovoCategoria, { label: string; icon: string }> = {
  iphone: { label: "iPhone", icon: "📱" },
  ipad: { label: "iPad", icon: "📱" },
  macbook: { label: "MacBook", icon: "💻" },
  watch: { label: "Apple Watch", icon: "⌚" },
};

/** Configuração do formulário trade-in (Supabase tradein_config).
 *  `preco` é opcional e reservado para futura precificação direta —
 *  ainda não aparece no formulário do cliente. */
export interface SeminovoOption {
  modelo: string;
  storages: string[];
  ativo: boolean;
  categoria: SeminovoCategoria;
  preco?: number;
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
