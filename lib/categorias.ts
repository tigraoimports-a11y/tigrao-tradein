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
  { key: "MAC_MINI", label: "Mac Mini", emoji: "\u{1F5A5}\uFE0F" },
  { key: "IPAD", label: "iPads", emoji: "\u{1F4DF}" },
  { key: "APPLE_WATCH", label: "Apple Watch", emoji: "\u231A" },
  { key: "AIRPODS", label: "AirPods", emoji: "\u{1F3A7}" },
  { key: "ACESSORIOS", label: "Acess\u00F3rios", emoji: "\u{1F50C}" },
];

/** Categorias fixas da aba "Alteração Valores Seminovos" em /admin/precos.
 *  Deliberadamente mais enxuta que as de lacrados — só os 4 tipos que a loja
 *  oferece como seminovo hoje. Não expõe botão de "+ Categoria" pra evitar
 *  cadastros soltos que ninguém usa. */
export const DEFAULT_CATEGORIAS_SEMINOVOS: Categoria[] = [
  { key: "IPHONE_SEMINOVO", label: "iPhones", emoji: "\u{1F4F1}" },
  { key: "IPAD_SEMINOVO", label: "iPads", emoji: "\u{1F4DF}" },
  { key: "MACBOOK_SEMINOVO", label: "MacBooks", emoji: "\u{1F4BB}" },
  { key: "APPLE_WATCH_SEMINOVO", label: "Apple Watch", emoji: "\u231A" },
];

export const DEFAULT_CATEGORIAS_ESTOQUE: Categoria[] = [
  { key: "IPHONES", label: "iPhones", emoji: "\u{1F4F1}" },
  { key: "IPADS", label: "iPads", emoji: "\u{1F4DF}" },
  { key: "MACBOOK", label: "MacBooks", emoji: "\u{1F4BB}" },
  { key: "MAC_MINI", label: "Mac Mini", emoji: "\u{1F5A5}\uFE0F" },
  { key: "MAC_STUDIO", label: "Mac Studio", emoji: "\u{1F5A5}\uFE0F" },
  { key: "IMAC", label: "iMac", emoji: "\u{1F5A5}\uFE0F" },
  { key: "APPLE_WATCH", label: "Apple Watch", emoji: "\u231A" },
  { key: "AIRPODS", label: "AirPods", emoji: "\u{1F3A7}" },
  { key: "ACESSORIOS", label: "Acess\u00F3rios", emoji: "\u{1F50C}" },
  { key: "SEMINOVOS", label: "Seminovos", emoji: "\u{1F4F1}" },
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
  const custom = loadCustom(STORAGE_KEY_PRECOS);
  const merged = DEFAULT_CATEGORIAS_PRECOS.map((def) => {
    const override = custom.find((c) => c.key === def.key);
    return override ? { ...def, ...override } : def;
  });
  const defaultKeys = new Set(DEFAULT_CATEGORIAS_PRECOS.map((c) => c.key));
  const pureCustom = custom.filter((c) => !defaultKeys.has(c.key));
  return [...merged, ...pureCustom];
}

export function getCategoriasEstoque(): Categoria[] {
  const custom = loadCustom(STORAGE_KEY_ESTOQUE);
  // Merge: custom entries override defaults with same key
  const merged = DEFAULT_CATEGORIAS_ESTOQUE.map((def) => {
    const override = custom.find((c) => c.key === def.key);
    return override ? { ...def, ...override } : def;
  });
  // Add purely custom categories (keys not in defaults)
  const defaultKeys = new Set(DEFAULT_CATEGORIAS_ESTOQUE.map((c) => c.key));
  const pureCustom = custom.filter((c) => !defaultKeys.has(c.key));
  return [...merged, ...pureCustom];
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

export function editCategoriaEstoque(key: string, updates: Partial<Pick<Categoria, "label" | "emoji">>): Categoria[] {
  // Check if it's a default category — save override in custom list
  const defaults = DEFAULT_CATEGORIAS_ESTOQUE;
  const custom = loadCustom(STORAGE_KEY_ESTOQUE);
  const isDefault = defaults.some((c) => c.key === key);
  const customIdx = custom.findIndex((c) => c.key === key);

  if (isDefault) {
    // Store as override in custom list with special flag
    const existing = custom.find((c) => c.key === key);
    if (existing) {
      Object.assign(existing, updates);
    } else {
      const def = defaults.find((c) => c.key === key)!;
      custom.push({ ...def, ...updates, custom: true });
    }
  } else if (customIdx >= 0) {
    custom[customIdx] = { ...custom[customIdx], ...updates };
  }
  saveCustom(STORAGE_KEY_ESTOQUE, custom);
  return getCategoriasEstoque();
}

export function editCategoriaPrecos(key: string, updates: Partial<Pick<Categoria, "label" | "emoji">>): Categoria[] {
  const defaults = DEFAULT_CATEGORIAS_PRECOS;
  const custom = loadCustom(STORAGE_KEY_PRECOS);
  const isDefault = defaults.some((c) => c.key === key);
  const customIdx = custom.findIndex((c) => c.key === key);

  if (isDefault) {
    const existing = custom.find((c) => c.key === key);
    if (existing) {
      Object.assign(existing, updates);
    } else {
      const def = defaults.find((c) => c.key === key)!;
      custom.push({ ...def, ...updates, custom: true });
    }
  } else if (customIdx >= 0) {
    custom[customIdx] = { ...custom[customIdx], ...updates };
  }
  saveCustom(STORAGE_KEY_PRECOS, custom);
  return getCategoriasPrecos();
}

/** Emojis populares para escolha rápida */
export const EMOJI_OPTIONS = [
  "\u{1F4F1}", "\u{1F4BB}", "\u{1F4DF}", "\u231A", "\u{1F3A7}", "\u{1F50C}",
  "\u{1F4E6}", "\u{1F3AE}", "\u{1F4F7}", "\u{1F4FA}", "\u{1F50B}", "\u{1F4BD}",
  "\u2328\uFE0F", "\u{1F5A8}\uFE0F", "\u{1F5A5}\uFE0F", "\u{1F4A1}", "\u{1F527}", "\u{1F3AC}",
];
