// lib/whatsapp-config.ts — Configuração centralizada de WhatsApp
// Todos os números em um só lugar. Quando mudar, só muda aqui.

export const WHATSAPP_NUMBERS = {
  andre: "5521967442665",
  bianca: "5521972461357",
  nicolas: "5521995618747",
  nicole: "5521972461357",  // Nicole via Instagram — formulário vai pra Bianca
} as const;

// Número padrão (Bianca)
export const WHATSAPP_DEFAULT = WHATSAPP_NUMBERS.bianca;

// Número pra formulários de compra (Bianca gerencia entregas)
export const WHATSAPP_FORMULARIO = WHATSAPP_NUMBERS.bianca;

// Número pra seminovos (Nicolas)
export const WHATSAPP_SEMINOVO = WHATSAPP_NUMBERS.nicolas;

/** @deprecated Use getWhatsAppFromVendedores(nome, vendedores, fallback) de
 *  lib/vendedores.ts — que lê a lista dinâmica do /admin/configuracoes em
 *  vez do mapa hard-coded abaixo. Mantida só como fallback legado. */
export function getWhatsAppByVendedor(vendedor: string): string {
  const key = vendedor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") as keyof typeof WHATSAPP_NUMBERS;
  return WHATSAPP_NUMBERS[key] || WHATSAPP_DEFAULT;
}

/** @deprecated Use useVendedores() em lib/vendedores.ts. */
export const VENDEDORES = [
  { nome: "André", whatsapp: WHATSAPP_NUMBERS.andre },
  { nome: "Bianca", whatsapp: WHATSAPP_NUMBERS.bianca },
  { nome: "Nicole", whatsapp: WHATSAPP_NUMBERS.nicole },
] as const;
