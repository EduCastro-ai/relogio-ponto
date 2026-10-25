/** Utilidades de data (sem fuso: trabalham com 'YYYY-MM-DD' puros) e dinheiro (centavos inteiros). */

export function parseDate(d: string): Date {
  const [y, m, day] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day));
}

export function fmtDate(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const dt = parseDate(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fmtDate(dt);
}

/** 1 = segunda ... 7 = domingo (ISO) */
export function isoWeekday(d: string): number {
  const w = parseDate(d).getUTCDay();
  return w === 0 ? 7 : w;
}

/** Segunda-feira da semana ISO que contém a data */
export function weekStart(d: string): string {
  return addDays(d, -(isoWeekday(d) - 1));
}

export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/** Arredondamento comercial (meio para cima) para centavos */
export const roundCents = (x: number): number => Math.round(x + Number.EPSILON);

/** Truncamento para centavos (usado por faixa no INSS) */
export const floorCents = (x: number): number => Math.floor(x + 1e-9);

export const fmtBRL = (cents: number): string =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
