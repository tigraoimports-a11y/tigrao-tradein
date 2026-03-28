// lib/date-utils.ts
// Utilitários de data com fuso horário do Brasil (America/Sao_Paulo)

/** Retorna a data de hoje no formato YYYY-MM-DD no fuso horário do Brasil */
export function hojeBR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Retorna a hora atual no formato HH:MM no fuso horário do Brasil */
export function horaBR(): string {
  return new Date().toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}
