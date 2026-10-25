export { fmtBRL } from "@relogio/calc";

/** "1.621,00" / "1621" / "1621.5" → centavos inteiros. NaN se inválido. */
export function parseBRL(text: string): number {
  const t = text.replace(/[R$\s]/g, "");
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Math.round(Number(normalized) * 100) : NaN;
}

export const fmtHours = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;

export const fmtTime = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

/** Hoje no relógio do aparelho, YYYY-MM-DD */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const currentMonth = () => today().slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export const PUNCH_LABEL = { in: "Entrada", break_start: "Início da pausa", break_end: "Fim da pausa", out: "Saída" } as const;
