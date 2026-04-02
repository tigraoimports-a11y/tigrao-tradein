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

// ── Cores por categoria (PORTUGUÊS) ──

/** Cores de iPhone por linha/modelo */
export const IPHONE_CORES_POR_MODELO: Record<string, string[]> = {
  "11":            ["PRETO", "VERDE", "ROXO", "VERMELHO", "BRANCO", "AMARELO"],
  "11 PRO":        ["DOURADO", "VERDE MEIA-NOITE", "PRATA", "CINZA ESPACIAL"],
  "11 PRO MAX":    ["DOURADO", "VERDE MEIA-NOITE", "PRATA", "CINZA ESPACIAL"],
  "12":            ["PRETO", "AZUL", "VERDE", "ROXO", "VERMELHO", "BRANCO"],
  "12 PRO":        ["DOURADO", "GRAFITE", "AZUL PACIFICO", "PRATA"],
  "12 PRO MAX":    ["DOURADO", "GRAFITE", "AZUL PACIFICO", "PRATA"],
  "13":            ["AZUL", "VERDE", "MEIA-NOITE", "ROSA", "VERMELHO", "ESTELAR"],
  "13 PRO":        ["VERDE ALPINO", "DOURADO", "GRAFITE", "AZUL SIERRA", "PRATA"],
  "13 PRO MAX":    ["VERDE ALPINO", "DOURADO", "GRAFITE", "AZUL SIERRA", "PRATA"],
  "14":            ["AZUL", "MEIA-NOITE", "ROXO", "VERMELHO", "ESTELAR", "AMARELO"],
  "14 PLUS":       ["AZUL", "MEIA-NOITE", "ROXO", "VERMELHO", "ESTELAR", "AMARELO"],
  "14 PRO":        ["ROXO PROFUNDO", "DOURADO", "PRATA", "PRETO ESPACIAL"],
  "14 PRO MAX":    ["ROXO PROFUNDO", "DOURADO", "PRATA", "PRETO ESPACIAL"],
  "15":            ["PRETO", "AZUL", "VERDE", "ROSA", "AMARELO"],
  "15 PLUS":       ["PRETO", "AZUL", "VERDE", "ROSA", "AMARELO"],
  "15 PRO":        ["TITANIO PRETO", "TITANIO AZUL", "TITANIO NATURAL", "TITANIO BRANCO"],
  "15 PRO MAX":    ["TITANIO PRETO", "TITANIO AZUL", "TITANIO NATURAL", "TITANIO BRANCO"],
  "16":            ["PRETO", "ROSA", "TEAL", "ULTRAMARINO", "BRANCO"],
  "16 PLUS":       ["PRETO", "ROSA", "TEAL", "ULTRAMARINO", "BRANCO"],
  "16 PRO":        ["TITANIO PRETO", "TITANIO DESERTO", "TITANIO NATURAL", "TITANIO BRANCO"],
  "16 PRO MAX":    ["TITANIO PRETO", "TITANIO DESERTO", "TITANIO NATURAL", "TITANIO BRANCO"],
  "16E":           ["PRETO", "BRANCO"],
  "17":            ["PRETO", "LAVANDA", "AZUL NEVOA", "SAGE", "BRANCO"],
  "17 AIR":        ["BRANCO NUVEM", "DOURADO CLARO", "AZUL CEU", "PRETO ESPACIAL"],
  "17 PRO":        ["LARANJA COSMICO", "AZUL PROFUNDO", "PRATA"],
  "17 PRO MAX":    ["LARANJA COSMICO", "AZUL PROFUNDO", "PRATA"],
};

/** Lista completa de todas as cores de iPhone (fallback) */
export const IPHONE_CORES = [
  "AMARELO", "AZUL", "AZUL CEU", "AZUL NEVOA", "AZUL PACIFICO", "AZUL PROFUNDO", "AZUL SIERRA",
  "BRANCO", "BRANCO NUVEM", "CINZA ESPACIAL",
  "DOURADO", "DOURADO CLARO", "ESTELAR",
  "GRAFITE", "LARANJA COSMICO", "LAVANDA",
  "MEIA-NOITE", "PRETO", "PRETO ESPACIAL", "PRATA",
  "ROSA", "ROXO", "ROXO PROFUNDO", "SAGE",
  "TEAL", "TITANIO AZUL", "TITANIO BRANCO", "TITANIO DESERTO", "TITANIO NATURAL", "TITANIO PRETO",
  "ULTRAMARINO", "VERDE", "VERDE ALPINO", "VERDE MEIA-NOITE", "VERMELHO",
];

/** Retorna as cores do iPhone baseado no modelo selecionado */
export function getIphoneCores(modelo: string): string[] {
  return IPHONE_CORES_POR_MODELO[modelo] || IPHONE_CORES;
}

export const MACBOOK_CORES = ["MEIA-NOITE", "PRATA", "ESTELAR", "AZUL CEU", "PRETO ESPACIAL"];

export const IPAD_CORES = ["AZUL", "CINZA ESPACIAL", "ESTELAR", "ROXO"];

export const WATCH_CORES = [
  "TITANIO PRETO", "DOURADO", "GRAFITE", "PRETO ONYX", "MEIA-NOITE",
  "NATURAL", "TITANIO NATURAL", "ROSA", "VERMELHO", "OURO ROSA",
  "PRATA", "ARDOSIA", "CINZA ESPACIAL", "ESTELAR",
];

export const AIRPODS_CORES = ["MEIA-NOITE", "ESTELAR"];

export const ACESSORIOS_CORES = ["PRETO", "BRANCO"];

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
export const MACBOOK_CHIPS = ["M1", "M2", "M2 PRO", "M3", "M3 PRO", "M3 MAX", "M4", "M4 PRO", "M4 MAX", "M5", "M5 PRO", "M5 MAX"];
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
export const IPAD_CHIPS = ["A15", "A16", "M1", "M2", "M3", "M4"];
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

export const AIRPODS_MODELOS = ["AIRPODS 4", "AIRPODS 4 ANC", "AIRPODS PRO 2", "AIRPODS PRO 3", "AIRPODS MAX", "AIRPODS MAX 2"];

// ── Interface dos specs ──

export interface ProdutoSpec {
  ip_modelo: string; ip_linha: string; ip_storage: string; ip_origem: string;
  mb_modelo: string; mb_tela: string; mb_chip: string; mb_nucleos: string; mb_ram: string; mb_storage: string;
  mm_chip: string; mm_ram: string; mm_storage: string;
  ipad_modelo: string; ipad_chip: string; ipad_tela: string; ipad_storage: string; ipad_conn: string;
  aw_modelo: string; aw_tamanho: string; aw_conn: string; aw_pulseira: string; aw_band: string;
  air_modelo: string;
}

export const DEFAULT_SPEC: ProdutoSpec = {
  ip_modelo: "16", ip_linha: "", ip_storage: "128GB", ip_origem: "",
  mb_modelo: "AIR", mb_tela: '13"', mb_chip: "M4", mb_nucleos: "", mb_ram: "16GB", mb_storage: "256GB",
  mm_chip: "M4", mm_ram: "16GB", mm_storage: "256GB",
  ipad_modelo: "AIR", ipad_chip: "", ipad_tela: '11"', ipad_storage: "128GB", ipad_conn: "WIFI",
  aw_modelo: "SERIES 10", aw_tamanho: "42mm", aw_conn: "GPS", aw_pulseira: "", aw_band: "",
  air_modelo: "AIRPODS 4",
};

// ── Gera o nome do produto a partir dos specs (mesmo formato do estoque) ──

export function buildProdutoName(cat: string, spec: ProdutoSpec, cor?: string): string {
  const c = cor ? ` ${cor.toUpperCase()}` : "";
  switch (cat) {
    case "IPHONES": {
      const linha = spec.ip_linha ? ` ${spec.ip_linha}` : "";
      const storage = spec.ip_storage ? ` ${spec.ip_storage}` : "";
      const origem = spec.ip_origem ? ` ${spec.ip_origem.split(" ")[0]}` : "";
      return `IPHONE ${spec.ip_modelo}${linha}${storage}${c}${origem}`.toUpperCase();
    }
    case "MAC_MINI": {
      const ram = spec.mm_ram ? ` ${spec.mm_ram}` : "";
      const storage = spec.mm_storage ? ` ${spec.mm_storage}` : "";
      return `MAC MINI ${spec.mm_chip}${ram}${storage}`.toUpperCase();
    }
    case "MACBOOK": {
      const tipo = spec.mb_modelo === "AIR" ? "MACBOOK AIR" : spec.mb_modelo === "NEO" ? "MACBOOK NEO" : "MACBOOK PRO";
      const nucleos = spec.mb_nucleos ? ` (${spec.mb_nucleos})` : "";
      const tela = spec.mb_tela ? ` ${spec.mb_tela}` : "";
      const ram = spec.mb_ram ? ` ${spec.mb_ram}` : "";
      const storage = spec.mb_storage ? ` ${spec.mb_storage}` : "";
      return `${tipo} ${spec.mb_chip}${nucleos}${tela}${ram}${storage}${c}`.toUpperCase();
    }
    case "IPADS": {
      const modelo = spec.ipad_modelo === "IPAD" ? "IPAD" : `IPAD ${spec.ipad_modelo}`;
      const chip = spec.ipad_chip ? ` ${spec.ipad_chip}` : "";
      const tela = spec.ipad_tela ? ` ${spec.ipad_tela}` : "";
      const storage = spec.ipad_storage ? ` ${spec.ipad_storage}` : "";
      const conn = spec.ipad_conn === "WIFI+CELL" ? " WI-FI+CELLULAR" : spec.ipad_conn === "WIFI" ? " WI-FI" : "";
      return `${modelo}${chip}${tela}${storage}${c}${conn}`.toUpperCase();
    }
    case "APPLE_WATCH": {
      const tamanho = spec.aw_tamanho ? ` ${spec.aw_tamanho}` : "";
      const conn = spec.aw_conn === "GPS+CELL" ? " GPS+CELLULAR" : spec.aw_conn === "GPS" ? " GPS" : "";
      const pulseira = spec.aw_pulseira ? ` ${spec.aw_pulseira}` : "";
      const band = spec.aw_band ? ` ${spec.aw_band}` : "";
      return `APPLE WATCH ${spec.aw_modelo}${tamanho}${conn}${c}${pulseira}${band}`.toUpperCase();
    }
    case "AIRPODS":
      return `${spec.air_modelo}${c}`.toUpperCase();
    default:
      return "";
  }
}
