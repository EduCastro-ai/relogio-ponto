import type { RuleParams } from "./rules.js";
import { roundCents } from "./util.js";

export interface SimulationInput {
  dailyRateCents: number;
  daysPerWeek: number;
  monthlySalaryCents: number;
  /** Custo mensal de transporte do trabalhador (empregador paga o que exceder 6% do salário) */
  transportMonthlyCents?: number;
}

export interface SimulationResult {
  diarista: { monthlyCents: number; daysPerMonth: number; riskNote: string | null };
  mensalista: {
    salaryCents: number;
    encargosCents: number;
    provisionsCents: number;
    transportEmployerCents: number;
    monthlyCents: number;
  };
  differenceCents: number; // mensalista − diarista (positivo = mensalista mais caro)
  /** Número de dias/semana a partir do qual o mensalista sai mais barato */
  breakEvenDaysPerWeek: number | null;
}

const WEEKS_PER_MONTH = 52 / 12;

/**
 * Custo mensal do mensalista = (salário + provisão 13º + provisão férias com 1/3) × (1 + encargos)
 * + parte do transporte acima de 6%. Encargos = INSS patronal + RAT + FGTS + 3,2% (DAE).
 * Não inclui eventual rescisão/aviso prévio nem horas extras.
 */
export function simulate(input: SimulationInput, rules: RuleParams): SimulationResult {
  const days = input.daysPerWeek * WEEKS_PER_MONTH;
  const diaristaMonthly = roundCents(days * input.dailyRateCents);

  const e = rules.employer;
  const rate = e.inss + e.rat + e.fgts + e.fgtsCompensatory;
  const salary = input.monthlySalaryCents;
  const provisions = roundCents(salary / 12 + (salary / 12) * (4 / 3));
  const encargos = roundCents((salary + provisions) * rate);
  const vtCap = roundCents(salary * rules.transportDeductionRate);
  const vtEmployer = Math.max(0, (input.transportMonthlyCents ?? 0) - vtCap);
  const mensalistaMonthly = salary + provisions + encargos + vtEmployer;

  let breakEven: number | null = null;
  const perDayMonth = input.dailyRateCents * WEEKS_PER_MONTH;
  if (perDayMonth > 0) breakEven = Math.round((mensalistaMonthly / perDayMonth) * 100) / 100;

  return {
    diarista: {
      monthlyCents: diaristaMonthly,
      daysPerMonth: Math.round(days * 10) / 10,
      riskNote:
        input.daysPerWeek > 2
          ? "Mais de 2 dias por semana de forma habitual tende a caracterizar vínculo (LC 150 art. 1º): risco de passivo trabalhista."
          : null,
    },
    mensalista: {
      salaryCents: salary,
      encargosCents: encargos,
      provisionsCents: provisions,
      transportEmployerCents: vtEmployer,
      monthlyCents: mensalistaMonthly,
    },
    differenceCents: mensalistaMonthly - diaristaMonthly,
    breakEvenDaysPerWeek: breakEven,
  };
}
