// lib/whatsapp-config.ts — Configuração centralizada de WhatsApp
// Todos os números em um só lugar. Quando mudar, só muda aqui.

export const WHATSAPP_NUMBERS = {
  andre: "5521967442665",
  bianca: "5521972461357",
  nicolas: "5521995618747",
  nicole: "5521972461357",  // Nicole via Instagram — formulário vai pra Bianca
} as const;

// Número padrão (André)
export const WHATSAPP_DEFAULT = WHATSAPP_NUMBERS.andre;

// Número pra formulários de compra (Bianca gerencia entregas)
export const WHATSAPP_FORMULARIO = WHATSAPP_NUMBERS.bianca;

// Buscar número por nome do vendedor
export function getWhatsAppByVendedor(vendedor: string): string {
  const key = vendedor.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") as keyof typeof WHATSAPP_NUMBERS;
  return WHATSAPP_NUMBERS[key] || WHATSAPP_DEFAULT;
}

// Vendedores disponíveis
export const VENDEDORES = [
  { nome: "André", whatsapp: WHATSAPP_NUMBERS.andre },
  { nome: "Bianca", whatsapp: WHATSAPP_NUMBERS.bianca },
  { nome: "Nicolas", whatsapp: WHATSAPP_NUMBERS.nicolas },
  { nome: "Nicole", whatsapp: WHATSAPP_NUMBERS.nicole },
] as const;
