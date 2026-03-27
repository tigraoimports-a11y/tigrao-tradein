// lib/produto-specs.ts
// Campos estruturados por categoria — compartilhado entre Estoque e Etiquetas

export const CATEGORIAS = ["IPHONES", "IPADS", "MACBOOK", "MAC_MINI", "APPLE_WATCH", "AIRPODS", "ACESSORIOS", "OUTROS"] as const;

export const CAT_LABELS: Record<string, string> = {
  IPHONES: "iPhones",
  IPADS: "iPads",
  MACBOOK: "MacBooks",
  MAC_MINI: "Mac Mini",
  APPLE_WATCH: "Apple Watch",
  AIRPODS: "AirPods",
  ACESSORIOS: "Acessorios",
  OUTROS: "Outros",
};

export const STRUCTURED_CATS = ["IPHONES", "MACBOOK", "MAC_MINI", "IPADS", "APPLE_WATCH", "AIRPODS"];

// ── Cores por categoria ──

/** Cores de iPhone por linha/modelo */
export const IPHONE_CORES_POR_MODELO: Record<string, string[]> = {
  "11":            ["Black", "Green", "Purple", "Red", "White", "Yellow"],
  "11 PRO":        ["Gold", "Midnight Green", "Silver", "Space Gray"],
  "11 PRO MAX":    ["Gold", "Midnight Green", "Silver", "Space Gray"],
  "12":            ["Black", "Blue", "Green", "Purple", "Red", "White"],
  "12 PRO":        ["Gold", "Graphite", "Pacific Blue", "Silver"],
  "12 PRO MAX":    ["Gold", "Graphite", "Pacific Blue", "Silver"],
  "13":            ["Blue", "Green", "Midnight", "Pink", "Red", "Starlight"],
  "13 PRO":        ["Alpine Green", "Gold", "Graphite", "Sierra Blue", "Silver"],
  "13 PRO MAX":    ["Alpine Green", "Gold", "Graphite", "Sierra Blue", "Silver"],
  "14":            ["Blue", "Midnight", "Purple", "Red", "Starlight", "Yellow"],
  "14 PLUS":       ["Blue", "Midnight", "Purple", "Red", "Starlight", "Yellow"],
  "14 PRO":        ["Deep Purple", "Gold", "Silver", "Space Black"],
  "14 PRO MAX":    ["Deep Purple", "Gold", "Silver", "Space Black"],
  "15":            ["Black", "Blue", "Green", "Pink", "Yellow"],
  "15 PLUS":       ["Black", "Blue", "Green", "Pink", "Yellow"],
  "15 PRO":        ["Black Titanium", "Blue Titanium", "Natural Titanium", "White Titanium"],
  "15 PRO MAX":    ["Black Titanium", "Blue Titanium", "Natural Titanium", "White Titanium"],
  "16":            ["Black", "Pink", "Teal", "Ultramarine", "White"],
  "16 PLUS":       ["Black", "Pink", "Teal", "Ultramarine", "White"],
  "16 PRO":        ["Black Titanium", "Desert Titanium", "Natural Titanium", "White Titanium"],
  "16 PRO MAX":    ["Black Titanium", "Desert Titanium", "Natural Titanium", "White Titanium"],
  "16E":           ["Black", "White"],
  "17":            ["Black", "Lavender", "Mist Blue", "Sage", "White"],
  "17 AIR":        ["Cloud White", "Light Gold", "Sky Blue", "Space Black"],
  "17 PRO":        ["Cosmic Orange", "Deep Blue", "Silver"],
  "17 PRO MAX":    ["Cosmic Orange", "Deep Blue", "Silver"],
};

/** Lista completa de todas as cores de iPhone (fallback) */
export const IPHONE_CORES = [
  "Alpine Green", "Black", "Blue", "Black Titanium", "Blue Titanium",
  "Cloud White", "Cosmic Orange", "Deep Blue", "Deep Purple", "Desert Titanium",
  "Gold", "Graphite", "Green", "Lavender", "Light Gold",
  "Midnight", "Midnight Green", "Mist Blue", "Natural Titanium", "Pacific Blue",
  "Pink", "Purple", "Red", "Sage", "Sierra Blue",
  "Silver", "Sky Blue", "Space Black", "Space Gray", "Starlight",
  "Teal", "Ultramarine", "White", "White Titanium", "Yellow",
];

/** Retorna as cores do iPhone baseado no modelo selecionado */
export function getIphoneCores(modelo: string): string[] {
  return IPHONE_CORES_POR_MODELO[modelo] || IPHONE_CORES;
}

export const MACBOOK_CORES = ["Midnight", "Silver", "Starlight", "Sky Blue", "Space Black"];

export const IPAD_CORES = ["Blue", "Pink", "Purple", "Silver", "Space Black", "Space Gray", "Starlight", "Yellow"];

export const WATCH_CORES = [
  "Black Titanium", "Gold", "Graphite", "Jet Black", "Midnight",
  "Natural", "Natural Titanium", "Pink", "Red", "Rose Gold",
  "Silver", "Slate", "Space Gray", "Starlight",
];

export const AIRPODS_CORES = ["Midnight", "Starlight"];

export const ACESSORIOS_CORES = ["Black", "White"];

/** Mapa de cores por categoria para lookup rápido */
export const CORES_POR_CATEGORIA: Record<string, string[]> = {
  IPHONES: IPHONE_CORES,
  MACBOOK: MACBOOK_CORES,
  IPADS: IPAD_CORES,
  APPLE_WATCH: WATCH_CORES,
  AIRPODS: AIRPODS_CORES,
  ACESSORIOS: ACESSORIOS_CORES,
};

/** Categorias onde a cor é obrigatória */
export const COR_OBRIGATORIA = ["IPHONES", "MACBOOK", "IPADS", "APPLE_WATCH"];

// ── Origem iPhone ──

export const IPHONE_ORIGENS = [
  "AA (EAU) - E-sim",
  "BE (BR) - Chip Fisico + E-sim",
  "BR - Chip Fisico + E-sim",
  "BZ (BR) - Chip Fisico + E-sim",
  "CH - Chip Fisico",
  "E (MEX) - Chip Fisico + E-sim",
  "HN (IN) - Chip Fisico + E-sim",
  "J (JPA) - E-sim",
  "LL (EUA) - E-sim",
  "LZ (CL/PY/UY) - Chip Fisico + E-sim",
  "N (UK) - E-sim",
  "QL (IT, PT, ES) - Chip Fisico + E-sim",
  "VC (CAN) - E-sim",
  "ZD (EUROPE) - Chip Fisico + E-Sim",
  "ZP (HK/MO) - E-sim",
];

// ── Pulseira Apple Watch ──

export const WATCH_PULSEIRAS = ["S/M", "M/L", "One Size"];

// ── Opções por categoria ──

export const IPHONE_MODELOS = ["11", "11 PRO", "11 PRO MAX", "12", "12 PRO", "12 PRO MAX", "13", "13 PRO", "13 PRO MAX", "14", "14 PLUS", "14 PRO", "14 PRO MAX", "15", "15 PLUS", "15 PRO", "15 PRO MAX", "16", "16 PLUS", "16 PRO", "16 PRO MAX", "17", "17 PRO", "17 PRO MAX"];
export const IPHONE_STORAGES = ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"];

export const MACBOOK_TIPOS = ["AIR", "PRO"] as const;
export const MACBOOK_TELAS_AIR = ['13"', '15"'];
export const MACBOOK_TELAS_PRO = ['14"', '16"'];
export const MACBOOK_CHIPS = ["M1", "M2", "M3", "M4", "M4 PRO", "M4 MAX"];
export const MACBOOK_RAMS = ["8GB", "16GB", "18GB", "24GB", "32GB", "36GB", "48GB", "64GB", "128GB"];
export const MACBOOK_STORAGES = ["256GB", "512GB", "1TB", "2TB", "4TB", "8TB"];
export const MACBOOK_NUCLEOS = [
  "8C CPU/7C GPU",
  "8C CPU/8C GPU",
  "8C CPU/10C GPU",
  "10C CPU/8C GPU",
  "10C CPU/10C GPU",
  "12C CPU/16C GPU",
  "12C CPU/19C GPU",
  "14C CPU/20C GPU",
  "14C CPU/32C GPU",
  "16C CPU/40C GPU",
];

export const MAC_MINI_CHIPS = ["M1", "M2", "M2 PRO", "M4", "M4 PRO"];
export const MAC_MINI_RAMS = ["8GB", "16GB", "24GB", "32GB", "48GB", "64GB"];
export const MAC_MINI_STORAGES = ["256GB", "512GB", "1TB", "2TB"];

export const IPAD_MODELOS = [
  { value: "IPAD", label: "iPad" },
  { value: "MINI", label: "iPad Mini" },
  { value: "AIR", label: "iPad Air" },
  { value: "PRO", label: "iPad Pro" },
];
export const IPAD_TELAS = ['8.3"', '10.9"', '11"', '13"'];
export const IPAD_STORAGES = ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"];
export const IPAD_CONNS = [
  { value: "WIFI", label: "WiFi" },
  { value: "WIFI+CELL", label: "WiFi + Cellular (5G)" },
];

export const WATCH_MODELOS = ["SE", "SERIES 10", "SERIES 11", "ULTRA", "ULTRA 2"];
export const WATCH_TAMANHOS = ["40mm", "42mm", "44mm", "45mm", "46mm", "49mm"];
export const WATCH_CONNS = [
  { value: "GPS", label: "GPS" },
  { value: "GPS+CELL", label: "GPS + Cellular" },
];

export const AIRPODS_MODELOS = ["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX", "AIRPODS MAX 2"];

// ── Interface dos specs ──

export interface ProdutoSpec {
  ip_modelo: string; ip_linha: string; ip_storage: string; ip_origem: string;
  mb_modelo: string; mb_tela: string; mb_chip: string; mb_nucleos: string; mb_ram: string; mb_storage: string;
  mm_chip: string; mm_ram: string; mm_storage: string;
  ipad_modelo: string; ipad_tela: string; ipad_storage: string; ipad_conn: string;
  aw_modelo: string; aw_tamanho: string; aw_conn: string; aw_pulseira: string;
  air_modelo: string;
}

export const DEFAULT_SPEC: ProdutoSpec = {
  ip_modelo: "16", ip_linha: "", ip_storage: "128GB", ip_origem: "",
  mb_modelo: "AIR", mb_tela: '13"', mb_chip: "M4", mb_nucleos: "", mb_ram: "16GB", mb_storage: "256GB",
  mm_chip: "M4", mm_ram: "16GB", mm_storage: "256GB",
  ipad_modelo: "AIR", ipad_tela: '11"', ipad_storage: "128GB", ipad_conn: "WIFI",
  aw_modelo: "SERIES 10", aw_tamanho: "42mm", aw_conn: "GPS", aw_pulseira: "",
  air_modelo: "AIRPODS 4",
};

// ── Gera o nome do produto a partir dos specs (mesmo formato do estoque) ──

export function buildProdutoName(cat: string, spec: ProdutoSpec): string {
  switch (cat) {
    case "IPHONES": {
      const linha = spec.ip_linha ? ` ${spec.ip_linha}` : "";
      return `IPHONE ${spec.ip_modelo}${linha} ${spec.ip_storage}`;
    }
    case "MAC_MINI":
      return `MAC MINI ${spec.mm_chip} ${spec.mm_ram} ${spec.mm_storage}`;
    case "MACBOOK": {
      const tipo = spec.mb_modelo === "AIR" ? "MACBOOK AIR" : "MACBOOK PRO";
      const nucleos = spec.mb_nucleos ? ` (${spec.mb_nucleos})` : "";
      return `${tipo} ${spec.mb_chip}${nucleos} ${spec.mb_tela} ${spec.mb_ram} ${spec.mb_storage}`;
    }
    case "IPADS": {
      const modelo = spec.ipad_modelo === "IPAD" ? "IPAD" : `IPAD ${spec.ipad_modelo}`;
      const conn = spec.ipad_conn === "WIFI+CELL" ? " WIFI+CELLULAR" : "";
      return `${modelo} ${spec.ipad_tela} ${spec.ipad_storage}${conn}`;
    }
    case "APPLE_WATCH": {
      const conn = spec.aw_conn === "GPS+CELL" ? " GPS+CELLULAR" : " GPS";
      return `APPLE WATCH ${spec.aw_modelo} ${spec.aw_tamanho}${conn}`;
    }
    case "AIRPODS":
      return spec.air_modelo.toUpperCase();
    default:
      return "";
  }
}
