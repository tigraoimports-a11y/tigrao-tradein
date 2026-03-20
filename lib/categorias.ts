/**
 * Gerenciamento de categorias dinâmicas.
 * Categorias padrão + customizadas salvas em localStorage.
 * Compartilhado entre Preços e Estoque.
 */

export interface Categoria {
  key: string;
  label: string;
  emoji: string;
  custom?: boolean;
}

// Categorias padrão (não podem ser removidas)
export const DEFAULT_CATEGORIAS_PRECOS: Categoria[] = [
  { key: "IPHONE", label: "iPhones", emoji: "\u{1F4F1}" },
  { key: "MACBOOK", label: "MacBooks", emoji: "\u{1F4BB}" },
  { key: "IPAD", label: "iPads", emoji: "\u{1F4DF}" },
  { key: "APPLE_WATCH", label: "Apple Watch", emoji: "\u231A" },
  { key: "AIRPODS", label: "AirPods", emoji: "\u{1F3A7}" },
  { key: "ACESSORIOS", label: "Acess\u00F3rios", emoji: "\u{1F50C}" },
];

export const DEFAULT_CATEGORIAS_ESTOQUE: Categoria[] = [
  { key: "IPHONES", label: "iPhones", emoji: "\u{1F4F1}" },
  { key: "IPADS", label: "iPads", emoji: "\u{1F4DF}" },
  { key: "MACBOOK", label: "MacBooks", emoji: "\u{1F4BB}" },
  { key: "MAC_MINI", label: "Mac Mini", emoji: "\u{1F5A5}\uFE0F" },
  { key: "APPLE_WATCH", label: "Apple Watch", emoji: "\u231A" },
  { key: "AIRPODS", label: "AirPods", emoji: "\u{1F3A7}" },
  { key: "ACESSORIOS", label: "Acess\u00F3rios", emoji: "\u{1F50C}" },
  { key: "OUTROS", label: "Outros", emoji: "\u{1F4E6}" },
];

const STORAGE_KEY_PRECOS = "tigrao_custom_categorias_precos";
const STORAGE_KEY_ESTOQUE = "tigrao_custom_categorias_estoque";

function loadCustom(storageKey: string): Categoria[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustom(storageKey: string, cats: Categoria[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify(cats));
}

export function getCategoriasPrecos(): Categoria[] {
  return [...DEFAULT_CATEGORIAS_PRECOS, ...loadCustom(STORAGE_KEY_PRECOS)];
}

export function getCategoriasEstoque(): Categoria[] {
  return [...DEFAULT_CATEGORIAS_ESTOQUE, ...loadCustom(STORAGE_KEY_ESTOQUE)];
}

export function addCategoriaPrecos(cat: Categoria): Categoria[] {
  const custom = loadCustom(STORAGE_KEY_PRECOS);
  const all = [...DEFAULT_CATEGORIAS_PRECOS, ...custom];
  if (all.some((c) => c.key === cat.key)) return getCategoriasPrecos();
  custom.push({ ...cat, custom: true });
  saveCustom(STORAGE_KEY_PRECOS, custom);
  return getCategoriasPrecos();
}

export function addCategoriaEstoque(cat: Categoria): Categoria[] {
  const custom = loadCustom(STORAGE_KEY_ESTOQUE);
  const all = [...DEFAULT_CATEGORIAS_ESTOQUE, ...custom];
  if (all.some((c) => c.key === cat.key)) return getCategoriasEstoque();
  custom.push({ ...cat, custom: true });
  saveCustom(STORAGE_KEY_ESTOQUE, custom);
  return getCategoriasEstoque();
}

export function removeCategoriaPrecos(key: string): Categoria[] {
  const custom = loadCustom(STORAGE_KEY_PRECOS).filter((c) => c.key !== key);
  saveCustom(STORAGE_KEY_PRECOS, custom);
  return getCategoriasPrecos();
}

export function removeCategoriaEstoque(key: string): Categoria[] {
  const custom = loadCustom(STORAGE_KEY_ESTOQUE).filter((c) => c.key !== key);
  saveCustom(STORAGE_KEY_ESTOQUE, custom);
  return getCategoriasEstoque();
}

/** Emojis populares para escolha rápida */
export const EMOJI_OPTIONS = [
  "\u{1F4F1}", "\u{1F4BB}", "\u{1F4DF}", "\u231A", "\u{1F3A7}", "\u{1F50C}",
  "\u{1F4E6}", "\u{1F3AE}", "\u{1F4F7}", "\u{1F4FA}", "\u{1F50B}", "\u{1F4BD}",
  "\u2328\uFE0F", "\u{1F5A8}\uFE0F", "\u{1F5A5}\uFE0F", "\u{1F4A1}", "\u{1F527}", "\u{1F3AC}",
];
