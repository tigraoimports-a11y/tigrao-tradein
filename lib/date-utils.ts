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

/** Retorna a data efetiva de uma venda (data_programada se existir, senão data) */
export function dataEfetiva(v: { data: string; data_programada?: string | null }): string {
  return v.data_programada || v.data;
}

/** Formata Date local para YYYY-MM-DD (evita off-by-one por UTC). */
function fmtLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Janela de agendamento do Link de Compra: mínimo = hoje (ou amanhã se >=18h),
 * máximo = min + 2 dias. Domingos são pulados em ambos os extremos.
 *
 * `opts.encomenda`: encomenda tem orçamento valido por 24h, entao max = min + 1
 * dia. Se cair em domingo, NAO empurra pra segunda (encolhe pra so o min em vez
 * de estourar a janela de 24h pra 72h).
 */
export function getAgendamentoBounds(
  now: Date = new Date(),
  opts: { encomenda?: boolean } = {}
): { min: string; max: string } {
  const base = new Date(now);
  base.setDate(base.getDate() + (base.getHours() >= 18 ? 1 : 0));
  while (base.getDay() === 0) base.setDate(base.getDate() + 1);

  const max = new Date(base);
  max.setDate(max.getDate() + (opts.encomenda ? 1 : 2));
  if (max.getDay() === 0) {
    if (opts.encomenda) {
      // Encomenda: nao estoura janela de 24h — encolhe pro proprio min
      max.setDate(max.getDate() - 1);
    } else {
      max.setDate(max.getDate() + 1);
    }
  }

  return { min: fmtLocalDate(base), max: fmtLocalDate(max) };
}
