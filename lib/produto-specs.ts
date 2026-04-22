// lib/produto-specs.ts
// Campos estruturados por categoria — compartilhado entre Estoque e Etiquetas

export const CATEGORIAS = ["IPHONES", "IPADS", "MACBOOK", "MAC_MINI", "MAC_STUDIO", "APPLE_WATCH", "AIRPODS", "ACESSORIOS", "OUTROS"] as const;

export const CAT_LABELS: Record<string, string> = {
  IPHONES: "iPhones",
  IPADS: "iPads",
  MACBOOK: "MacBooks",
  MAC_MINI: "Mac Mini",
  MAC_STUDIO: "Mac Studio",
  APPLE_WATCH: "Apple Watch",
  AIRPODS: "AirPods",
  ACESSORIOS: "Acessorios",
  OUTROS: "Outros",
};

export const STRUCTURED_CATS = ["IPHONES", "MACBOOK", "MAC_MINI", "MAC_STUDIO", "IPADS", "APPLE_WATCH", "AIRPODS"];

// ── Cores por categoria (PORTUGUÊS) ──

/** Cores de iPhone por linha/modelo */
export const IPHONE_CORES_POR_MODELO: Record<string, string[]> = {
  "11":            ["BLACK", "GREEN", "PURPLE", "RED", "WHITE", "YELLOW"],
  "11 PRO":        ["GOLD", "MIDNIGHT GREEN", "SILVER", "SPACE GRAY"],
  "11 PRO MAX":    ["GOLD", "MIDNIGHT GREEN", "SILVER", "SPACE GRAY"],
  "12":            ["BLACK", "BLUE", "GREEN", "PURPLE", "RED", "WHITE"],
  "12 PRO":        ["GOLD", "GRAPHITE", "PACIFIC BLUE", "SILVER"],
  "12 PRO MAX":    ["GOLD", "GRAPHITE", "PACIFIC BLUE", "SILVER"],
  "13":            ["BLUE", "GREEN", "MIDNIGHT", "PINK", "RED", "STARLIGHT"],
  "13 PRO":        ["ALPINE GREEN", "GOLD", "GRAPHITE", "SIERRA BLUE", "SILVER"],
  "13 PRO MAX":    ["ALPINE GREEN", "GOLD", "GRAPHITE", "SIERRA BLUE", "SILVER"],
  "14":            ["BLUE", "MIDNIGHT", "PURPLE", "RED", "STARLIGHT", "YELLOW"],
  "14 PLUS":       ["BLUE", "MIDNIGHT", "PURPLE", "RED", "STARLIGHT", "YELLOW"],
  "14 PRO":        ["DEEP PURPLE", "GOLD", "SILVER", "SPACE BLACK"],
  "14 PRO MAX":    ["DEEP PURPLE", "GOLD", "SILVER", "SPACE BLACK"],
  "15":            ["BLACK", "BLUE", "GREEN", "PINK", "YELLOW"],
  "15 PLUS":       ["BLACK", "BLUE", "GREEN", "PINK", "YELLOW"],
  "15 PRO":        ["BLACK TITANIUM", "BLUE TITANIUM", "NATURAL TITANIUM", "WHITE TITANIUM"],
  "15 PRO MAX":    ["BLACK TITANIUM", "BLUE TITANIUM", "NATURAL TITANIUM", "WHITE TITANIUM"],
  "16":            ["BLACK", "PINK", "TEAL", "ULTRAMARINE", "WHITE"],
  "16 PLUS":       ["BLACK", "PINK", "TEAL", "ULTRAMARINE", "WHITE"],
  "16 PRO":        ["BLACK TITANIUM", "DESERT TITANIUM", "NATURAL TITANIUM", "WHITE TITANIUM"],
  "16 PRO MAX":    ["BLACK TITANIUM", "DESERT TITANIUM", "NATURAL TITANIUM", "WHITE TITANIUM"],
  "16E":           ["BLACK", "WHITE"],
  "17":            ["BLACK", "LAVENDER", "MIST BLUE", "SAGE", "WHITE"],
  "17 AIR":        ["CLOUD WHITE", "LIGHT GOLD", "SKY BLUE", "SPACE BLACK"],
  "17 PRO":        ["COSMIC ORANGE", "DEEP BLUE", "SILVER"],
  "17 PRO MAX":    ["COSMIC ORANGE", "DEEP BLUE", "SILVER"],
};

/** Lista completa de todas as cores de iPhone (fallback) */
export const IPHONE_CORES = [
  "ALPINE GREEN", "BLACK", "BLACK TITANIUM", "BLUE", "BLUE TITANIUM",
  "CLOUD WHITE", "COSMIC ORANGE", "DEEP BLUE", "DEEP PURPLE", "DESERT TITANIUM",
  "GOLD", "GRAPHITE", "GREEN",
  "LAVENDER", "LIGHT GOLD", "MIDNIGHT", "MIDNIGHT GREEN", "MIST BLUE",
  "NATURAL TITANIUM", "PACIFIC BLUE", "PINK", "PURPLE", "RED",
  "SAGE", "SIERRA BLUE", "SILVER", "SKY BLUE", "SPACE BLACK", "SPACE GRAY", "STARLIGHT",
  "TEAL", "ULTRAMARINE", "WHITE", "WHITE TITANIUM", "YELLOW",
];

/** Retorna as cores do iPhone baseado no modelo selecionado */
export function getIphoneCores(modelo: string): string[] {
  return IPHONE_CORES_POR_MODELO[modelo] || IPHONE_CORES;
}

export const MACBOOK_CORES = ["BLUSH", "CITRUS", "INDIGO", "MIDNIGHT", "SILVER", "SKY BLUE", "SPACE BLACK", "STARLIGHT"];

export const IPAD_CORES = ["BLUE", "SPACE GRAY", "STARLIGHT", "PURPLE"];

export const WATCH_CORES = [
  "JET BLACK", "GOLD", "GRAPHITE", "ONYX BLACK", "MIDNIGHT",
  "NATURAL", "NATURAL TITANIUM", "PINK", "RED", "ROSE GOLD",
  "SILVER", "SLATE", "SPACE GRAY", "STARLIGHT", "SPACE BLACK",
];

export const AIRPODS_CORES = ["MIDNIGHT", "STARLIGHT", "WHITE", "BLACK", "BLUE", "ORANGE", "PURPLE", "SILVER"];

export const ACESSORIOS_CORES = ["BLACK", "WHITE"];

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

export const WATCH_BAND_MODELS = [
  "Pulseira Esportiva Azul",
  "Pulseira Esportiva Estelar",
  "Pulseira Esportiva Preta",
  "Pulseira esportiva roxo-névoa",
  "Pulseira loop Alpina azul-clara",
  "Pulseira loop Alpina índigo",
  "Pulseira loop Alpina preta",
  "Pulseira loop Alpina verde",
  "Pulseira loop esportiva azul-âncora",
  "Pulseira loop esportiva cinza-escura",
  "Pulseira loop Trail azul/azul-brilhante",
  "Pulseira loop Trail azul/preta",
  "Pulseira loop Trail preta/carvão",
  "Pulseira natural estilo milanês",
  "Pulseira Ocean Azul",
  "Pulseira Ocean Preta",
  "Pulseira preta estilo milanês",
  "Puseira Ocean Verde-Neón",
];

// ── Opções por categoria ──

export const IPHONE_MODELOS = ["11", "11 PRO", "11 PRO MAX", "12", "12 MINI", "12 PRO", "12 PRO MAX", "13", "13 MINI", "13 PRO", "13 PRO MAX", "14", "14 PLUS", "14 PRO", "14 PRO MAX", "15", "15 PLUS", "15 PRO", "15 PRO MAX", "16", "16 PLUS", "16E", "16 PRO", "16 PRO MAX", "17", "17 AIR", "17 PRO", "17 PRO MAX"];
export const IPHONE_STORAGES = ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"];

/** Armazenamentos válidos por modelo de iPhone */
export const IPHONE_STORAGES_POR_MODELO: Record<string, string[]> = {
  "11":            ["64GB", "128GB", "256GB"],
  "11 PRO":        ["64GB", "256GB", "512GB"],
  "11 PRO MAX":    ["64GB", "256GB", "512GB"],
  "12":            ["64GB", "128GB", "256GB"],
  "12 MINI":       ["64GB", "128GB", "256GB"],
  "12 PRO":        ["128GB", "256GB", "512GB"],
  "12 PRO MAX":    ["128GB", "256GB", "512GB"],
  "13":            ["128GB", "256GB", "512GB"],
  "13 MINI":       ["128GB", "256GB", "512GB"],
  "13 PRO":        ["128GB", "256GB", "512GB", "1TB"],
  "13 PRO MAX":    ["128GB", "256GB", "512GB", "1TB"],
  "14":            ["128GB", "256GB", "512GB"],
  "14 PLUS":       ["128GB", "256GB", "512GB"],
  "14 PRO":        ["128GB", "256GB", "512GB", "1TB"],
  "14 PRO MAX":    ["128GB", "256GB", "512GB", "1TB"],
  "15":            ["128GB", "256GB", "512GB"],
  "15 PLUS":       ["128GB", "256GB", "512GB"],
  "15 PRO":        ["128GB", "256GB", "512GB", "1TB"],
  "15 PRO MAX":    ["256GB", "512GB", "1TB"],
  "16":            ["128GB", "256GB", "512GB"],
  "16 PLUS":       ["128GB", "256GB", "512GB"],
  "16E":           ["128GB", "256GB", "512GB"],
  "16 PRO":        ["128GB", "256GB", "512GB", "1TB"],
  "16 PRO MAX":    ["256GB", "512GB", "1TB"],
  "17":            ["256GB", "512GB"],
  "17 AIR":        ["256GB", "512GB"],
  "17 PRO":        ["256GB", "512GB", "1TB"],
  "17 PRO MAX":    ["256GB", "512GB", "1TB", "2TB"],
};

export function getIphoneStorages(modelo: string): string[] {
  return IPHONE_STORAGES_POR_MODELO[modelo] || IPHONE_STORAGES;
}

export const MACBOOK_TIPOS = ["AIR", "PRO", "NEO"] as const;
export const MACBOOK_TELAS_AIR = ['13"', '15"'];
export const MACBOOK_TELAS_PRO = ['14"', '16"'];
export const MACBOOK_TELAS_NEO = ['14"'];
export const MACBOOK_CHIPS = ["A18", "A18 PRO", "M1", "M2", "M2 PRO", "M3", "M3 PRO", "M3 MAX", "M4", "M4 PRO", "M4 MAX", "M5", "M5 PRO", "M5 MAX"];
export const MACBOOK_RAMS = ["8GB", "16GB", "18GB", "24GB", "32GB", "36GB", "48GB", "64GB", "128GB"];
export const MACBOOK_STORAGES = ["256GB", "512GB", "1TB", "2TB", "4TB", "8TB"];
export const MACBOOK_NUCLEOS = [
  "6C CPU/5C GPU",
  "8C CPU/7C GPU",
  "8C CPU/8C GPU",
  "8C CPU/10C GPU",
  "10C CPU/8C GPU",
  "10C CPU/10C GPU",
  "12C CPU/16C GPU",
  "12C CPU/18C GPU",
  "12C CPU/19C GPU",
  "14C CPU/20C GPU",
  "14C CPU/32C GPU",
  "16C CPU/40C GPU",
];

export const MAC_MINI_CHIPS = ["M1", "M2", "M2 PRO", "M4", "M4 PRO"];
export const MAC_MINI_NUCLEOS = [
  "8C CPU/8C GPU",
  "8C CPU/10C GPU",
  "10C CPU/8C GPU",
  "10C CPU/10C GPU",
  "12C CPU/16C GPU",
  "14C CPU/20C GPU",
  "16C CPU/40C GPU",
];
export const MAC_MINI_RAMS = ["8GB", "16GB", "24GB", "32GB", "48GB", "64GB"];
export const MAC_MINI_STORAGES = ["256GB", "512GB", "1TB", "2TB"];

export const MAC_STUDIO_CHIPS = ["M2 MAX", "M2 ULTRA", "M4 MAX", "M4 ULTRA"];
export const MAC_STUDIO_NUCLEOS = [
  "12C CPU/30C GPU",
  "12C CPU/38C GPU",
  "14C CPU/32C GPU",
  "16C CPU/40C GPU",
  "24C CPU/60C GPU",
  "24C CPU/76C GPU",
  "32C CPU/80C GPU",
];
export const MAC_STUDIO_RAMS = ["32GB", "48GB", "64GB", "96GB", "128GB", "192GB", "256GB", "512GB"];
export const MAC_STUDIO_STORAGES = ["512GB", "1TB", "2TB", "4TB", "8TB", "16TB"];

export const IPAD_MODELOS = [
  { value: "IPAD", label: "iPad" },
  { value: "MINI 6", label: "iPad Mini 6" },
  { value: "MINI 7", label: "iPad Mini 7" },
  { value: "AIR 4", label: "iPad Air 4" },
  { value: "AIR 5", label: "iPad Air 5" },
  { value: "AIR M2", label: "iPad Air M2" },
  { value: "AIR M3", label: "iPad Air M3" },
  { value: "AIR M4", label: "iPad Air M4" },
  { value: "PRO 11", label: "iPad Pro 11\"" },
  { value: "PRO 12.9", label: "iPad Pro 12.9\"" },
  { value: "PRO M4 11", label: "iPad Pro M4 11\"" },
  { value: "PRO M4 13", label: "iPad Pro M4 13\"" },
];
export const IPAD_CHIPS = ["A15", "A16", "M1", "M2", "M3", "M4", "M5"];
export const IPAD_TELAS = ['8.3"', '10.9"', '11"', '13"'];
export const IPAD_STORAGES = ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"];
export const IPAD_CONNS = [
  { value: "WIFI", label: "Wi-Fi" },
  { value: "WIFI+CELL", label: "Wi-Fi + Cellular (5G)" },
];

export const WATCH_MODELOS = ["SE", "SE 2ND", "SERIES 9", "SERIES 10", "SERIES 11", "ULTRA 2", "ULTRA 3"];
export const WATCH_TAMANHOS = ["40mm", "42mm", "44mm", "45mm", "46mm", "49mm"];
export const WATCH_CONNS = [
  { value: "GPS", label: "GPS" },
  { value: "GPS+CELL", label: "GPS + Cellular" },
];

export const AIRPODS_MODELOS = ["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX 2024 USB-C"];

// ── Interface dos specs ──

export interface ProdutoSpec {
  ip_modelo: string; ip_linha: string; ip_storage: string; ip_origem: string;
  mb_modelo: string; mb_tela: string; mb_chip: string; mb_nucleos: string; mb_ram: string; mb_storage: string;
  mm_chip: string; mm_nucleos: string; mm_ram: string; mm_storage: string;
  ms_chip: string; ms_nucleos: string; ms_ram: string; ms_storage: string;
  ipad_modelo: string; ipad_chip: string; ipad_tela: string; ipad_storage: string; ipad_conn: string;
  aw_modelo: string; aw_tamanho: string; aw_conn: string; aw_pulseira: string; aw_band: string;
  air_modelo: string; air_descricao: string;
  ac_tela: string;
}

export const DEFAULT_SPEC: ProdutoSpec = {
  ip_modelo: "16", ip_linha: "", ip_storage: "128GB", ip_origem: "",
  mb_modelo: "AIR", mb_tela: '13"', mb_chip: "M4", mb_nucleos: "", mb_ram: "16GB", mb_storage: "256GB",
  mm_chip: "M4", mm_nucleos: "10C CPU/10C GPU", mm_ram: "16GB", mm_storage: "256GB",
  ms_chip: "M4 MAX", ms_nucleos: "14C CPU/32C GPU", ms_ram: "36GB", ms_storage: "512GB",
  ipad_modelo: "AIR M4", ipad_chip: "", ipad_tela: '11"', ipad_storage: "128GB", ipad_conn: "WIFI",
  aw_modelo: "SERIES 10", aw_tamanho: "42mm", aw_conn: "GPS", aw_pulseira: "", aw_band: "",
  air_modelo: "AIRPODS 4", air_descricao: "",
  ac_tela: "",
};

// ── Mapa de cores Português → Inglês (nomes comerciais Apple) ──
export const COR_PT_TO_EN: Record<string, string> = {
  "AMARELO": "YELLOW",
  "AZUL": "BLUE",
  "AZUL CEU": "SKY BLUE",
  "AZUL NEVOA": "MIST BLUE",
  "AZUL PACIFICO": "PACIFIC BLUE",
  "AZUL PROFUNDO": "DEEP BLUE",
  "AZUL SIERRA": "SIERRA BLUE",
  "BLUSH": "BLUSH",
  "BRANCO": "WHITE",
  "BRANCO NUVEM": "CLOUD WHITE",
  "CITRUS": "CITRUS",
  "CINZA ESPACIAL": "SPACE GRAY",
  "DOURADO": "GOLD",
  "DOURADO CLARO": "LIGHT GOLD",
  "ESTELAR": "STARLIGHT",
  "GRAFITE": "GRAPHITE",
  "INDIGO": "INDIGO",
  "LARANJA COSMICO": "COSMIC ORANGE",
  "LAVANDA": "LAVENDER",
  "MEIA-NOITE": "MIDNIGHT",
  "NATURAL": "NATURAL",
  "PRETO": "BLACK",
  "PRETO ESPACIAL": "SPACE BLACK",
  "PRETO ONYX": "ONYX BLACK",
  "PRATA": "SILVER",
  "ROSA": "PINK",
  "ROXO": "PURPLE",
  "ROXO PROFUNDO": "DEEP PURPLE",
  "SAGE": "SAGE",
  "TEAL": "TEAL",
  "TITANIO AZUL": "BLUE TITANIUM",
  "TITANIO BRANCO": "WHITE TITANIUM",
  "TITANIO DESERTO": "DESERT TITANIUM",
  "TITANIO NATURAL": "NATURAL TITANIUM",
  "TITANIO PRETO": "BLACK TITANIUM",
  "ULTRAMARINO": "ULTRAMARINE",
  "VERDE": "GREEN",
  "VERDE ALPINO": "ALPINE GREEN",
  "VERDE MEIA-NOITE": "MIDNIGHT GREEN",
  "VERMELHO": "RED",
  "ARDOSIA": "SLATE",
  "OURO ROSA": "ROSE GOLD",
};

// Mapa reverso EN → PT (gerado a partir de COR_PT_TO_EN)
export const COR_EN_TO_PT: Record<string, string> = Object.fromEntries(
  Object.entries(COR_PT_TO_EN).map(([pt, en]) => [en, pt.charAt(0).toUpperCase() + pt.slice(1).toLowerCase()])
);

/** Converte cor em português para inglês (nome comercial Apple) */
export function corToEn(cor: string): string {
  return COR_PT_TO_EN[cor.toUpperCase()] || cor.toUpperCase();
}

// ── Gera o nome do produto a partir dos specs (mesmo formato do estoque) ──

export function buildProdutoName(cat: string, spec: ProdutoSpec, cor?: string): string {
  // Para iPhones: usar nome da cor em inglês (Apple commercial name) no nome do produto
  // O campo `cor` separado continua em português (para display/filtro)
  const c = cor ? ` ${cat === "IPHONES" ? corToEn(cor) : cor.toUpperCase()}` : "";
  switch (cat) {
    case "IPHONES": {
      const linha = spec.ip_linha ? ` ${spec.ip_linha}` : "";
      const storage = spec.ip_storage ? ` ${spec.ip_storage}` : "";
      // Origem (LL/J/HN/...) NÃO entra mais no nome — é gravada no campo `origem` da row.
      return `IPHONE ${spec.ip_modelo}${linha}${storage}${c}`.toUpperCase();
    }
    case "MAC_MINI": {
      const nucleos = spec.mm_nucleos ? ` (${spec.mm_nucleos})` : "";
      const ram = spec.mm_ram ? ` ${spec.mm_ram}` : "";
      const storage = spec.mm_storage ? ` ${spec.mm_storage}` : "";
      return `MAC MINI ${spec.mm_chip}${nucleos}${ram}${storage}`.toUpperCase();
    }
    case "MAC_STUDIO": {
      const nucleos = spec.ms_nucleos ? ` (${spec.ms_nucleos})` : "";
      const ram = spec.ms_ram ? ` ${spec.ms_ram}` : "";
      const storage = spec.ms_storage ? ` ${spec.ms_storage}` : "";
      return `MAC STUDIO ${spec.ms_chip}${nucleos}${ram}${storage}`.toUpperCase();
    }
    case "MACBOOK": {
      const tipo = spec.mb_modelo === "AIR" ? "MACBOOK AIR" : spec.mb_modelo === "NEO" ? "MACBOOK NEO" : "MACBOOK PRO";
      const chip = spec.mb_chip ? ` ${spec.mb_chip}` : "";
      // Núcleos NÃO entra no nome/preview — fica apenas como spec editável/visível nos detalhes.
      const tela = spec.mb_tela ? ` ${spec.mb_tela}` : "";
      const ram = spec.mb_ram ? ` ${spec.mb_ram}` : "";
      const storage = spec.mb_storage ? ` ${spec.mb_storage}` : "";
      return `${tipo}${chip}${tela}${ram}${storage}${c}`.toUpperCase();
    }
    case "IPADS": {
      const modelo = spec.ipad_modelo === "IPAD" ? "IPAD" : `IPAD ${spec.ipad_modelo}`;
      // Não duplicar chip se ipad_modelo já contém ele (ex: "AIR M4", "PRO M4 11")
      const modeloUpper = modelo.toUpperCase();
      const chipUpper = (spec.ipad_chip || "").toUpperCase();
      const chip = chipUpper && !modeloUpper.includes(chipUpper) ? ` ${chipUpper}` : "";
      const tela = spec.ipad_tela ? ` ${spec.ipad_tela}` : "";
      const storage = spec.ipad_storage ? ` ${spec.ipad_storage}` : "";
      const conn = spec.ipad_conn === "WIFI+CELL" ? " WI-FI+CELLULAR" : spec.ipad_conn === "WIFI" ? " WI-FI" : "";
      return `${modelo}${chip}${tela}${storage}${c}${conn}`.toUpperCase();
    }
    case "APPLE_WATCH": {
      const tamanho = spec.aw_tamanho ? ` ${spec.aw_tamanho}` : "";
      const conn = spec.aw_conn === "GPS+CELL" ? " GPS+CEL" : spec.aw_conn === "GPS" ? " GPS" : "";
      // Se o valor do pulseira ja comeca com "Pulseira" (ex: "Pulseira natural
      // estilo milanes" do WATCH_BAND_MODELS), nao duplica o prefixo — senao
      // sai "PULSEIRA PULSEIRA NATURAL ESTILO MILANES".
      const pulseira = spec.aw_pulseira
        ? (/^pulseira\b/i.test(spec.aw_pulseira.trim()) ? ` ${spec.aw_pulseira}` : ` PULSEIRA ${spec.aw_pulseira}`)
        : "";
      const band = spec.aw_band ? ` ${spec.aw_band}` : "";
      return `APPLE WATCH ${spec.aw_modelo}${tamanho}${conn}${c}${pulseira}${band}`.toUpperCase();
    }
    case "AIRPODS": {
      const desc = spec.air_descricao ? ` ${spec.air_descricao}` : "";
      return `${spec.air_modelo}${desc}${c}`.toUpperCase();
    }
    default:
      return "";
  }
}
