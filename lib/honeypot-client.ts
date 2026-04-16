// ============================================================
// Helper client-side pro honeypot anti-bot
// ============================================================
// Lê o valor do input escondido (renderizado por componentes com
// id="website" ou "tradein-honeypot"). O server valida via
// checkHoneypot() em lib/rate-limit.ts.
// ============================================================

/**
 * Lê o valor do campo honeypot do DOM. Retorna "" se não estiver renderizado
 * (ex: SSR ou form sem honeypot).
 *
 * Por padrão busca o id "tradein-honeypot" (usado no TradeInCalculatorMulti).
 * Passe outro id se precisar.
 */
export function getHoneypotValue(id = "tradein-honeypot"): string {
  if (typeof document === "undefined") return "";
  const el = document.getElementById(id);
  return el && "value" in el ? String((el as HTMLInputElement).value || "") : "";
}
