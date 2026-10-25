import { employeeInss, type InssPart } from "./inss.js";
import type { RuleParams } from "./rules.js";
import { addDays, isoWeekday, monthDays, roundCents, weekStart } from "./util.js";

/** Intervalo trabalhado, em minutos locais desde 00:00 da data do TURNO (fim pode passar de 1440). */
export interface WorkedInterval {
  startMin: number;
  endMin: number;
}

export interface DayInput {
  date: string;
  /** Intervalos já sem pausas (entrada→pausa, retorno→saída) */
  intervals: WorkedInterval[];
  /** Folga trabalhada que foi compensada por acordo: não paga em dobro */
  compensated?: boolean;
}

export interface MensalistaInput {
  month: string; // YYYY-MM
  salaryCents: number;
  /** Jornada contratual diária em minutos (ex.: 480) */
  scheduledMinPerDay: number;
  /** Dias da semana contratuais (1=seg..7=dom) */
  scheduledWeekdays: number[];
  days: DayInput[];
  holidays?: string[];
  /** Faltas justificadas (atestado, etc.) */
  justifiedAbsences?: string[];
  /** Só considera faltas até esta data (inclusive). Padrão: fim do mês. */
  asOf?: string;
  /** Primeiro dia do contrato dentro do mês, se admitido no mês */
  contractStart?: string;
  advancesCents?: number;
  agreedDeductionsCents?: number;
  transport?: { enabled: boolean; monthlyCostCents: number };
}

export interface PayrollLine {
  code: string;
  label: string;
  cents: number;
  note?: string;
}

export interface MensalistaResult {
  earnings: PayrollLine[];
  deductions: PayrollLine[];
  grossCents: number;
  inssBaseCents: number;
  inss: { total: number; parts: InssPart[] };
  irrf: { cents: number; pending: boolean };
  netCents: number;
  employer: {
    inssCents: number;
    ratCents: number;
    fgtsCents: number;
    fgtsCompensatoryCents: number;
    daeCents: number;
    totalCostCents: number;
  };
  minutes: { worked: number; overtime: number; holidayWork: number; night: number; supplementary: number; shortfall: number };
  absences: { unjustified: string[]; dsrLostWeeks: string[] };
  warnings: string[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function minutesOf(intervals: WorkedInterval[]): number {
  return sum(intervals.map((i) => Math.max(0, i.endMin - i.startMin)));
}

/** Minutos de um intervalo dentro da janela noturna (22h–5h), considerando a madrugada do mesmo dia e do dia seguinte. */
export function nightMinutes(iv: WorkedInterval, rules: RuleParams): number {
  const { startMin, endMin } = rules.night; // 1320, 300
  const windows: [number, number][] = [
    [0, endMin], // madrugada do próprio dia
    [startMin, 1440 + endMin], // 22h → 5h do dia seguinte
  ];
  return sum(windows.map(([a, b]) => Math.max(0, Math.min(iv.endMin, b) - Math.max(iv.startMin, a))));
}

export function computeMensalista(input: MensalistaInput, rules: RuleParams): MensalistaResult {
  const warnings: string[] = [];
  const holidays = new Set(input.holidays ?? []);
  const justified = new Set(input.justifiedAbsences ?? []);
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  const allDates = monthDays(input.month);
  const lastDate = allDates[allDates.length - 1]!;
  const asOf = input.asOf && input.asOf < lastDate ? input.asOf : lastDate;

  const salary = input.salaryCents;
  // Valor do minuto da hora normal: salário / (220 × 60)
  const perMinute = salary / (rules.monthlyHoursDivisor * 60);
  const dayValue = salary / rules.salaryDayDivisor;

  // --- 1. Classificação de cada dia trabalhado
  let workedTotal = 0,
    holidayWorkMin = 0,
    nightTotal = 0,
    dailyExtraTotal = 0,
    supplementaryMin = 0,
    shortfallMin = 0;

  const weekNormal = new Map<string, number>(); // minutos em dias "normais" por semana
  const weekDailyExtra = new Map<string, number>();

  for (const d of input.days) {
    if (!d.date.startsWith(input.month)) continue; // fora do mês: ignora (semanas parciais: ver limitações)
    const worked = minutesOf(d.intervals);
    if (worked === 0) continue;
    workedTotal += worked;
    nightTotal += sum(d.intervals.map((i) => nightMinutes(i, rules)));

    const wd = isoWeekday(d.date);
    const restDay = (wd === 7 || holidays.has(d.date)) && !d.compensated;
    const wk = weekStart(d.date);

    if (restDay) {
      holidayWorkMin += worked; // tudo em dobro (art. 2º §8º); não entra na conta de extras
      continue;
    }
    const extra = Math.max(0, worked - rules.dailyLimitMin);
    dailyExtraTotal += extra;
    weekDailyExtra.set(wk, (weekDailyExtra.get(wk) ?? 0) + extra);
    weekNormal.set(wk, (weekNormal.get(wk) ?? 0) + worked);

    // Suplementar: acima da jornada contratual, até o limite legal (pago a 100%, sem adicional)
    if (rules.dailyLimitMin > input.scheduledMinPerDay) {
      supplementaryMin += Math.max(0, Math.min(worked, rules.dailyLimitMin) - input.scheduledMinPerDay);
    }
    // Falta de minutos em dia contratual
    if (input.scheduledWeekdays.includes(wd) && worked < input.scheduledMinPerDay) {
      shortfallMin += input.scheduledMinPerDay - worked;
    }
  }

  // --- 2. Excedente semanal (44h) além das extras diárias
  let weeklyExtraTotal = 0;
  for (const [wk, total] of weekNormal) {
    const daily = weekDailyExtra.get(wk) ?? 0;
    weeklyExtraTotal += Math.max(0, total - daily - rules.weeklyLimitMin);
  }
  const overtimeMin = dailyExtraTotal + weeklyExtraTotal;

  // --- 3. Faltas injustificadas e perda de DSR
  const unjustified: string[] = [];
  for (const date of allDates) {
    if (date > asOf) break;
    if (input.contractStart && date < input.contractStart) continue;
    const wd = isoWeekday(date);
    if (!input.scheduledWeekdays.includes(wd)) continue;
    if (holidays.has(date) || justified.has(date)) continue;
    const day = byDate.get(date);
    if (!day || minutesOf(day.intervals) === 0) unjustified.push(date);
  }
  const dsrLostWeeks = [...new Set(unjustified.map((d) => weekStart(d)))];

  // --- 4. Proventos
  const earnings: PayrollLine[] = [{ code: "SAL", label: "Salário base", cents: salary }];
  const pay = (minutes: number, mult: number) => roundCents(minutes * perMinute * mult);

  if (overtimeMin > 0)
    earnings.push({
      code: "HE50",
      label: "Horas extras (50%)",
      cents: pay(overtimeMin, 1 + rules.overtimeRate),
      note: `${overtimeMin} min`,
    });
  if (supplementaryMin > 0)
    earnings.push({
      code: "HSUP",
      label: "Horas suplementares (sem adicional)",
      cents: pay(supplementaryMin, 1),
      note: `${supplementaryMin} min`,
    });
  if (holidayWorkMin > 0)
    earnings.push({
      code: "DOMFER",
      label: "Domingo/feriado trabalhado (em dobro)",
      cents: pay(holidayWorkMin, rules.holidayWorkMultiplier),
      note: `${holidayWorkMin} min; descanso já está no salário mensal`,
    });
  if (nightTotal > 0) {
    // Hora noturna de 52min30s paga com +20%: cada minuto real vale (60/52,5)×1,2 de minuto diurno.
    const factor = (3600 / rules.night.reducedHourSeconds) * (1 + rules.night.rate);
    earnings.push({
      code: "ADNOT",
      label: "Adicional noturno (22h–5h, hora de 52min30s)",
      cents: roundCents(nightTotal * perMinute * (factor - 1)),
      note: `${nightTotal} min noturnos`,
    });
  }

  // --- 5. Descontos de jornada (reduzem a base de contribuição)
  const absenceDiscount = roundCents(unjustified.length * dayValue);
  const dsrDiscount = roundCents(dsrLostWeeks.length * dayValue);
  const shortfallDiscount = pay(shortfallMin, 1);
  const wageDeductions: PayrollLine[] = [];
  if (absenceDiscount > 0)
    wageDeductions.push({ code: "FALTA", label: "Faltas injustificadas", cents: absenceDiscount, note: unjustified.join(", ") });
  if (dsrDiscount > 0)
    wageDeductions.push({
      code: "DSRPERDA",
      label: "Perda do descanso semanal (semana com falta)",
      cents: dsrDiscount,
      note: "Confirmar aplicação no contrato/convenção; Lei 605/49 por analogia",
    });
  if (shortfallDiscount > 0)
    wageDeductions.push({ code: "ATRASO", label: "Atrasos/saídas antecipadas", cents: shortfallDiscount, note: `${shortfallMin} min` });

  const grossBeforeDiscounts = sum(earnings.map((e) => e.cents));
  const wageDiscountTotal = sum(wageDeductions.map((d) => d.cents));
  const gross = Math.max(0, grossBeforeDiscounts - wageDiscountTotal);

  // --- 6. Encargos do empregado
  const inssBase = Math.min(gross, rules.inssCeilingCents);
  const inss = employeeInss(gross, rules);
  const irrfPending = gross - inss.total > rules.irrfExemptUpToCents;
  if (irrfPending)
    warnings.push("Rendimento acima do limite de isenção do IRRF (R$ 5.000): cálculo do IRRF ainda não implementado.");

  const deductions: PayrollLine[] = [
    ...wageDeductions,
    { code: "INSS", label: "INSS do empregado", cents: inss.total },
  ];
  if (input.transport?.enabled) {
    const cap = roundCents(salary * rules.transportDeductionRate);
    const vt = Math.min(cap, input.transport.monthlyCostCents);
    deductions.push({ code: "VT", label: "Vale-transporte (máx. 6% do salário base)", cents: vt });
  }
  if (input.advancesCents) deductions.push({ code: "ADIANT", label: "Adiantamentos", cents: input.advancesCents });
  if (input.agreedDeductionsCents) {
    const cap = roundCents(gross * rules.agreedDeductionsCap);
    const val = Math.min(input.agreedDeductionsCents, cap);
    if (val < input.agreedDeductionsCents) warnings.push("Descontos por acordo limitados a 20% (art. 18 §1º).");
    deductions.push({ code: "ACORDO", label: "Descontos acordados (plano de saúde etc.)", cents: val });
  }

  const nonWageDeductions = sum(
    deductions.filter((d) => !["FALTA", "DSRPERDA", "ATRASO"].includes(d.code)).map((d) => d.cents),
  );
  const net = gross - nonWageDeductions;

  // --- 7. Encargos do empregador (Simples Doméstico / DAE)
  const e = rules.employer;
  const employer = {
    inssCents: roundCents(inssBase * e.inss),
    ratCents: roundCents(inssBase * e.rat),
    fgtsCents: roundCents(gross * e.fgts),
    fgtsCompensatoryCents: roundCents(gross * e.fgtsCompensatory),
    daeCents: 0,
    totalCostCents: 0,
  };
  employer.daeCents =
    inss.total + employer.inssCents + employer.ratCents + employer.fgtsCents + employer.fgtsCompensatoryCents;
  employer.totalCostCents = gross + employer.daeCents - inss.total; // INSS do empregado já está no bruto

  if (salary < rules.minimumWageCents)
    warnings.push("Salário abaixo do mínimo nacional vigente (carga integral). Verificar jornada parcial (art. 3º).");
  if (overtimeMin > 40 * 60)
    warnings.push("Mais de 40h extras no mês: o excedente deve ser pago ou compensado em até 1 ano (art. 2º §5º).");

  return {
    earnings,
    deductions,
    grossCents: gross,
    inssBaseCents: inssBase,
    inss,
    irrf: { cents: 0, pending: irrfPending },
    netCents: net,
    employer,
    minutes: {
      worked: workedTotal,
      overtime: overtimeMin,
      holidayWork: holidayWorkMin,
      night: nightTotal,
      supplementary: supplementaryMin,
      shortfall: shortfallMin,
    },
    absences: { unjustified, dsrLostWeeks },
    warnings,
  };
}

// ---------- Diarista ----------

export type EnquadramentoLevel = "verde" | "atencao" | "vermelho";

export interface DiaristaInput {
  month: string;
  dailyRateCents: number;
  /** Datas trabalhadas (um turno por data) */
  workedDates: string[];
  overnightDates?: string[];
}

export interface DiaristaResult {
  days: number;
  totalCents: number;
  weeks: { weekStart: string; days: number }[];
  weeksOver2: number;
  level: EnquadramentoLevel;
  overnightDays: number;
  message: string;
}

/**
 * Diarista: pagamento = dias × diária. O alerta de enquadramento é graduado (não é regra rígida:
 * a jurisprudência sobre 2–3 dias/semana é dividida): LC 150 art. 1º fala em "mais de 2 dias por semana".
 */
export function computeDiarista(input: DiaristaInput): DiaristaResult {
  const dates = [...new Set(input.workedDates.filter((d) => d.startsWith(input.month)))].sort();
  const weeks = new Map<string, number>();
  for (const d of dates) weeks.set(weekStart(d), (weeks.get(weekStart(d)) ?? 0) + 1);
  const weekList = [...weeks].map(([w, days]) => ({ weekStart: w, days }));
  const over = weekList.filter((w) => w.days > 2).length;

  let level: EnquadramentoLevel = "verde";
  if (over >= 3) level = "vermelho";
  else if (over >= 1) level = "atencao";
  const message =
    level === "verde"
      ? "Até 2 dias por semana: sem indício de vínculo pela frequência."
      : level === "atencao"
        ? `${over} semana(s) com mais de 2 dias. Se virar rotina, pode configurar vínculo (LC 150 art. 1º). Avalie contratar mensalista.`
        : `${over} semanas com mais de 2 dias: padrão habitual de vínculo. Recomenda-se formalizar como empregado doméstico.`;

  return {
    days: dates.length,
    totalCents: dates.length * input.dailyRateCents,
    weeks: weekList,
    weeksOver2: over,
    level,
    overnightDays: (input.overnightDates ?? []).filter((d) => d.startsWith(input.month)).length,
    message,
  };
}

export { addDays };
