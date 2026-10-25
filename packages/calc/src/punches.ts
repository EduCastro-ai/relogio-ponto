import type { DayInput, WorkedInterval } from "./payroll.js";
import { parseDate } from "./util.js";

/** Batida já efetiva (sem as anuladas por ajuste), como vem da view `effective_punches`. */
export interface PunchInput {
  kind: "in" | "out" | "break_start" | "break_end";
  /** Instante ISO 8601 */
  punchedAt: string;
  /** Dia do TURNO (YYYY-MM-DD), calculado no servidor */
  shiftDate: string;
}

export interface PunchIssue {
  date: string;
  message: string;
}

/** Diferença (minutos) entre a hora local do fuso e UTC naquele instante. */
export function tzOffsetMin(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Instante (ms) da meia-noite local de uma data no fuso. */
export function localMidnightMs(date: string, tz: string): number {
  const guess = parseDate(date).getTime();
  let ms = guess - tzOffsetMin(new Date(guess), tz) * 60000;
  ms = guess - tzOffsetMin(new Date(ms), tz) * 60000; // reajuste se houver horário de verão
  return ms;
}

/**
 * Converte batidas em dias de trabalho para o motor: entrada/fim de pausa abrem um intervalo,
 * início de pausa/saída fecham. Minutos contam a partir de 00:00 do dia do turno (podem passar de 1440).
 * Sequências incompletas viram `issues` para revisão e não entram no cálculo.
 */
export function punchesToDays(punches: PunchInput[], tz: string): { days: DayInput[]; issues: PunchIssue[] } {
  const byShift = new Map<string, PunchInput[]>();
  for (const p of punches) {
    const list = byShift.get(p.shiftDate) ?? [];
    list.push(p);
    byShift.set(p.shiftDate, list);
  }

  const days: DayInput[] = [];
  const issues: PunchIssue[] = [];
  for (const date of [...byShift.keys()].sort()) {
    const midnight = localMidnightMs(date, tz);
    const sorted = byShift.get(date)!.slice().sort((a, b) => a.punchedAt.localeCompare(b.punchedAt));
    const intervals: WorkedInterval[] = [];
    let open: number | null = null;
    for (const p of sorted) {
      const min = Math.round((Date.parse(p.punchedAt) - midnight) / 60000);
      if (p.kind === "in" || p.kind === "break_end") {
        if (open !== null) issues.push({ date, message: "abertura sem fechamento anterior (descartada)" });
        open = min;
      } else if (open === null) {
        issues.push({ date, message: "fechamento sem abertura (descartado)" });
      } else {
        intervals.push({ startMin: open, endMin: min });
        open = null;
      }
    }
    if (open !== null) issues.push({ date, message: "turno sem saída" });
    days.push({ date, intervals });
  }
  return { days, issues };
}
