/**
 * Parâmetros legais versionados por vigência. Espelham a tabela `rule_sets.params` (jsonb).
 * Valores em CENTAVOS inteiros. Nada aqui é "código": trocar de ano = novo RuleParams.
 */
export interface InssBracket {
  /** Teto da faixa (inclusive), em centavos */
  upTo: number;
  /** Alíquota, ex.: 0.075 */
  rate: number;
}

export interface RuleParams {
  id: string;
  validFrom: string; // YYYY-MM-DD
  validTo: string | null;
  minimumWageCents: number;
  inssCeilingCents: number;
  inssBrackets: InssBracket[];
  /** Alíquotas do empregador (Simples Doméstico) */
  employer: { inss: number; rat: number; fgts: number; fgtsCompensatory: number };
  /** Jornada */
  dailyLimitMin: number; // 8h
  weeklyLimitMin: number; // 44h
  monthlyHoursDivisor: number; // 220 (art. 2º §2º)
  salaryDayDivisor: number; // 30 (art. 2º §3º)
  overtimeRate: number; // 0.5 (mínimo)
  /** Trabalho não compensado em domingo/feriado: pago em dobro (art. 2º §8º) */
  holidayWorkMultiplier: number; // 2
  /** Noturno (art. 14) */
  night: { startMin: number; endMin: number; rate: number; reducedHourSeconds: number };
  /** Vale-transporte: desconto máx. do empregado sobre o salário base */
  transportDeductionRate: number; // 0.06
  /** Limite de descontos por acordo (planos de saúde etc., art. 18 §1º) */
  agreedDeductionsCap: number; // 0.20
  /** IRRF: isenção da Lei 15.270/2025 até este rendimento tributável mensal */
  irrfExemptUpToCents: number;
  sourceNote: string;
}

export const RULES_2026: RuleParams = {
  id: "br-domestico-2026",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  minimumWageCents: 162_100,
  inssCeilingCents: 847_555,
  inssBrackets: [
    { upTo: 162_100, rate: 0.075 },
    { upTo: 290_284, rate: 0.09 },
    { upTo: 435_427, rate: 0.12 },
    { upTo: 847_555, rate: 0.14 },
  ],
  employer: { inss: 0.08, rat: 0.008, fgts: 0.08, fgtsCompensatory: 0.032 },
  dailyLimitMin: 8 * 60,
  weeklyLimitMin: 44 * 60,
  monthlyHoursDivisor: 220,
  salaryDayDivisor: 30,
  overtimeRate: 0.5,
  holidayWorkMultiplier: 2,
  night: { startMin: 22 * 60, endMin: 5 * 60, rate: 0.2, reducedHourSeconds: 52 * 60 + 30 },
  transportDeductionRate: 0.06,
  agreedDeductionsCap: 0.2,
  irrfExemptUpToCents: 500_000,
  sourceNote:
    "LC 150/2015 (arts. 2, 10, 12-18, 22); salário mínimo e faixas INSS 2026; Lei 15.270/2025 (IRRF). " +
    "Conferir com eSocial/Receita antes de uso em produção.",
};

/** Escolhe o RuleParams vigente em uma data. */
export function ruleFor(date: string, rules: RuleParams[]): RuleParams {
  const r = rules.find((x) => x.validFrom <= date && (x.validTo === null || date <= x.validTo));
  if (!r) throw new Error(`Sem regras vigentes para ${date}`);
  return r;
}
