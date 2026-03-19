// ============================================
// Dias úteis e feriados brasileiros
// ============================================

/**
 * Algoritmo de Butcher/Meeus para calcular a Páscoa.
 */
export function calcularPascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

/**
 * Retorna todos os feriados nacionais brasileiros do ano.
 */
export function getFeriadosNacionais(ano: number): Date[] {
  const pascoa = calcularPascoa(ano);

  const addDias = (base: Date, dias: number): Date => {
    const d = new Date(base);
    d.setDate(d.getDate() + dias);
    return d;
  };

  // Feriados fixos
  const fixos = [
    new Date(ano, 0, 1),   // Confraternização Universal
    new Date(ano, 3, 21),  // Tiradentes
    new Date(ano, 4, 1),   // Dia do Trabalho
    new Date(ano, 8, 7),   // Independência
    new Date(ano, 9, 12),  // N. Sra. Aparecida
    new Date(ano, 10, 2),  // Finados
    new Date(ano, 10, 15), // Proclamação da República
    new Date(ano, 11, 25), // Natal
  ];

  // Feriados móveis (baseados na Páscoa)
  const moveis = [
    addDias(pascoa, -47), // Segunda de Carnaval
    addDias(pascoa, -46), // Terça de Carnaval
    addDias(pascoa, -2),  // Sexta-Santa
    addDias(pascoa, 60),  // Corpus Christi
  ];

  return [...fixos, ...moveis];
}

/** Normaliza uma data para meia-noite (remove hora/min/seg) */
function normalizeDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Compara duas datas ignorando horário */
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Verifica se uma data é dia útil (não é fim de semana nem feriado).
 */
export function isDiaUtil(data: Date): boolean {
  const day = data.getDay();
  if (day === 0 || day === 6) return false; // Fim de semana

  const feriados = getFeriadosNacionais(data.getFullYear());
  return !feriados.some((f) => isSameDay(normalizeDate(f), normalizeDate(data)));
}

/**
 * Retorna o próximo dia útil APÓS a data dada.
 * Se a data dada é segunda e dia útil, retorna terça (se útil), etc.
 */
export function proximoDiaUtil(data: Date): Date {
  const next = new Date(data);
  next.setDate(next.getDate() + 1);

  while (!isDiaUtil(next)) {
    next.setDate(next.getDate() + 1);
  }

  return normalizeDate(next);
}

/**
 * Retorna a data de recebimento para uma venda.
 * - D+0: mesma data
 * - D+1: próximo dia útil após a data da venda
 * - FIADO: null (sem data definida)
 */
export function getDataRecebimento(
  dataVenda: Date | string,
  recebimento: string
): Date | null {
  const d = typeof dataVenda === "string" ? new Date(dataVenda + "T12:00:00") : dataVenda;

  switch (recebimento) {
    case "D+0":
      return normalizeDate(d);
    case "D+1":
      return proximoDiaUtil(d);
    case "FIADO":
    case "PARCELADO":
      return null;
    default:
      return normalizeDate(d);
  }
}

/**
 * Formata uma data para exibição (dd/mm/aaaa).
 */
export function formatDateBR(data: Date | string): string {
  const d = typeof data === "string" ? new Date(data + "T12:00:00") : data;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * Retorna a data de hoje no timezone de São Paulo (YYYY-MM-DD).
 */
export function hojeISO(): string {
  const now = new Date();
  // Ajustar para BRT (UTC-3)
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${brt.getFullYear()}-${String(brt.getMonth() + 1).padStart(2, "0")}-${String(brt.getDate()).padStart(2, "0")}`;
}
