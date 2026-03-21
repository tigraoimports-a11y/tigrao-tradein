// lib/barcode.ts — Utilitários para código de barras TigrãoImports

/**
 * Verifica se string é código Tigrão válido: TG + 6 dígitos
 */
export function isCodigoTigrao(codigo: string): boolean {
  return /^TG\d{6}$/.test(codigo);
}

/**
 * Formata código para exibição: TG000001 → TG 000.001
 */
export function formatarCodigo(codigo: string): string {
  if (!isCodigoTigrao(codigo)) return codigo;
  const num = codigo.slice(2);
  return `TG ${num.slice(0, 3)}.${num.slice(3)}`;
}

/**
 * Renderiza barcode Code128 em um elemento SVG via JsBarcode
 */
export function renderBarcode(elementId: string, codigo: string, options?: { small?: boolean }) {
  if (typeof window === "undefined") return;

  import("jsbarcode").then(({ default: JsBarcode }) => {
    try {
      const el = document.querySelector(`#${elementId}`);
      if (!el) return;
      JsBarcode(`#${elementId}`, codigo, {
        format: "CODE128",
        width: options?.small ? 1.5 : 2,
        height: options?.small ? 35 : 50,
        displayValue: true,
        fontSize: options?.small ? 10 : 12,
        fontOptions: "bold",
        margin: options?.small ? 2 : 4,
        background: "#ffffff",
        lineColor: "#000000",
        text: codigo,
        textAlign: "center",
        textPosition: "bottom",
        textMargin: 4,
      });
    } catch (e) {
      console.error("Erro ao renderizar barcode:", e);
    }
  });
}

/**
 * Tamanhos de etiqueta suportados (mm)
 */
export const TAMANHOS_ETIQUETA: Record<string, { label: string; width: number; height: number }> = {
  "29x30": { label: "29 × 30mm (Padrão TigrãoImports)", width: 29, height: 30 },
  "62x29": { label: "62 × 29mm (Brother QL-820NWB — DK2210)", width: 62, height: 29 },
  "57x32": { label: "57 × 32mm (Rolo térmico genérico)", width: 57, height: 32 },
  "40x25": { label: "40 × 25mm (Mini)", width: 40, height: 25 },
  "100x50": { label: "100 × 50mm (Grande)", width: 100, height: 50 },
  "58x40": { label: "58 × 40mm (Elgin / Argox)", width: 58, height: 40 },
};

/**
 * Categorias de produtos com modelos, memórias e cores
 */
export const CATEGORIAS_ETIQUETA: Record<string, string[]> = {
  IPHONES: [
    "iPhone 11", "iPhone 11 Pro", "iPhone 11 Pro Max",
    "iPhone 12", "iPhone 12 Pro", "iPhone 12 Pro Max",
    "iPhone 13", "iPhone 13 Pro", "iPhone 13 Pro Max",
    "iPhone 14", "iPhone 14 Plus", "iPhone 14 Pro", "iPhone 14 Pro Max",
    "iPhone 15", "iPhone 15 Plus", "iPhone 15 Pro", "iPhone 15 Pro Max",
    "iPhone 16", "iPhone 16 Plus", "iPhone 16 Pro", "iPhone 16 Pro Max",
    "iPhone 17", "iPhone 17 Pro", "iPhone 17 Pro Max",
  ],
  IPADS: [
    "iPad 10ª geração", "iPad Air M2 11\"", "iPad Air M3 11\"", "iPad Air M3 13\"",
    "iPad Mini 6", "iPad Mini 7",
    "iPad Pro M4 11\"", "iPad Pro M4 13\"",
  ],
  MACBOOK: [
    "MacBook Air M2 13\"", "MacBook Air M3 13\"", "MacBook Air M4 13\"",
    "MacBook Air M3 15\"", "MacBook Air M4 15\"",
    "MacBook Pro M4 14\"", "MacBook Pro M4 Pro 14\"",
    "MacBook Pro M4 16\"", "MacBook Pro M4 Pro 16\"",
  ],
  APPLE_WATCH: [
    "Watch Series 10 42mm", "Watch Series 10 46mm",
    "Watch S11 GPS 42mm", "Watch S11 GPS 46mm",
    "Watch Ultra 2",
  ],
  AIRPODS: [
    "AirPods 4", "AirPods 4 ANC", "AirPods Pro 2", "AirPods Pro 3",
    "AirPods Max USB-C",
  ],
  MAC_MINI: ["Mac Mini M4", "Mac Mini M4 Pro"],
  ACESSORIOS: ["Apple Pencil Pro", "Apple Pencil USB-C", "Magic Keyboard", "AirTag"],
};

export const ARMAZENAMENTOS: Record<string, string[]> = {
  IPHONES: ["64GB", "128GB", "256GB", "512GB", "1TB"],
  IPADS: ["64GB", "128GB", "256GB", "512GB", "1TB", "2TB"],
  MACBOOK: ["256GB", "512GB", "1TB", "2TB"],
  MAC_MINI: ["256GB", "512GB", "1TB", "2TB"],
  APPLE_WATCH: [],
  AIRPODS: [],
  ACESSORIOS: [],
};

export const CORES_ETIQUETA: Record<string, string[]> = {
  IPHONES: ["Preto", "Branco", "Natural", "Deserto", "Rosa", "Verde", "Azul", "Roxo", "Amarelo", "Verde-Azulado", "Meia-Noite", "Estelar", "(PRODUCT)RED"],
  IPADS: ["Cinza Espacial", "Prata", "Azul", "Rosa", "Roxo", "Amarelo", "Verde", "Estelar"],
  MACBOOK: ["Meia-Noite", "Estelar", "Prata", "Cinza Espacial", "Azul Céu"],
  MAC_MINI: ["Prata"],
  APPLE_WATCH: ["Prata", "Preto", "Natural", "Rosa", "Azul", "Branco"],
  AIRPODS: ["Branco", "Preto"],
  ACESSORIOS: ["Branco", "Preto"],
};

/**
 * Status da etiqueta/produto
 */
export const STATUS_ETIQUETA = {
  AGUARDANDO_ENTRADA: { label: "Aguardando Entrada", cor: "yellow", proximo: "EM_ESTOQUE", acao: "Confirmar Entrada" },
  EM_ESTOQUE: { label: "Em Estoque", cor: "green", proximo: "SAIU", acao: "Confirmar Saída" },
  SAIU: { label: "Saiu do Estoque", cor: "red", proximo: null, acao: null },
} as const;
