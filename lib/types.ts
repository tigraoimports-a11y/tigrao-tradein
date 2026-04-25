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

/** Opção de resposta de uma pergunta trade-in */
export interface TradeInQuestionOption {
  value: string;
  label: string;
  discount: number;
  variant?: "default" | "success" | "error";
  reject?: boolean;
  rejectMessage?: string;
  /** Frase completa exibida no resumo do produto (StepManualHandoff + WhatsApp).
   *  Quando setado, o resumo mostra apenas essa frase em vez de "titulo: label".
   *  Ex: opção "Sim" pode ter summaryLabel="Possui o carregador completo original da Apple". */
  summaryLabel?: string;
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

/** Uma variação de armazenamento de um seminovo.
 *  `preco` definido → orçamento automático (como lacrado).
 *  `preco` ausente → flow WhatsApp manual (cotação sob medida).
 *  `ativo === false` esconde esta variante sem apagar (útil quando só um
 *  storage está temporariamente esgotado). Por padrão variantes são ativas. */
export interface SeminovoVariante {
  storage: string;
  preco?: number;
  ativo?: boolean;
}

/** Configuração do formulário trade-in (Supabase tradein_config).
 *  `variantes` é o formato canônico. `storages` + `preco` (legado, pré-refactor
 *  das variantes) continuam aceitos na leitura via `getSeminovoVariantes`
 *  — nenhuma migration é necessária porque o campo `seminovos` é JSONB livre. */
export interface SeminovoOption {
  modelo: string;
  ativo: boolean;
  categoria: SeminovoCategoria;
  variantes?: SeminovoVariante[];
  /** @deprecated use `variantes` */
  storages?: string[];
  /** @deprecated preço por modelo — agora vive em cada variante */
  preco?: number;
}

/** Retorna a lista normalizada de variantes, convertendo o formato legado
 *  (`storages` + `preco` por modelo) quando `variantes` não está presente. */
export function getSeminovoVariantes(s: SeminovoOption): SeminovoVariante[] {
  if (Array.isArray(s.variantes) && s.variantes.length > 0) return s.variantes;
  const storages = Array.isArray(s.storages) ? s.storages : [];
  return storages.map((storage) => ({
    storage,
    preco: typeof s.preco === "number" ? s.preco : undefined,
    ativo: true,
  }));
}

/** Mescla duplicatas de modelo (case-insensitive, dentro da mesma categoria).
 *  Ao salvar o admin, evita que duas entradas de "iPhone 15 Pro" sobrevivam.
 *  Variantes são deduplicadas por `storage` — a primeira entrada com preço
 *  definido vence se houver conflito. */
export function consolidateSeminovos(list: SeminovoOption[]): SeminovoOption[] {
  const byKey = new Map<string, SeminovoOption>();
  for (const raw of list) {
    const modelo = (raw.modelo || "").trim();
    if (!modelo) continue;
    const categoria = raw.categoria || "iphone";
    const key = `${categoria}::${modelo.toLowerCase()}`;
    const variantes = getSeminovoVariantes(raw);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { modelo, categoria, ativo: raw.ativo !== false, variantes });
      continue;
    }
    // Mescla: ativo OR, variantes deduplicadas por storage
    const byStorage = new Map<string, SeminovoVariante>();
    for (const v of [...(prev.variantes || []), ...variantes]) {
      const storage = v.storage.trim();
      if (!storage) continue;
      const existing = byStorage.get(storage);
      if (!existing) { byStorage.set(storage, v); continue; }
      // Mantém a primeira, mas se ela não tem preço e a nova tem, promove
      if (typeof existing.preco !== "number" && typeof v.preco === "number") {
        byStorage.set(storage, { ...existing, preco: v.preco });
      }
    }
    byKey.set(key, {
      modelo: prev.modelo,
      categoria,
      ativo: prev.ativo || raw.ativo !== false,
      variantes: [...byStorage.values()],
    });
  }
  return [...byKey.values()];
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
