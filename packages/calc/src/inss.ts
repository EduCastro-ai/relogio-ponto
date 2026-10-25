import type { RuleParams } from "./rules.js";
import { floorCents } from "./util.js";

export interface InssPart {
  upTo: number;
  rate: number;
  base: number;
  amount: number;
}

/**
 * INSS do empregado doméstico: alíquotas progressivas (cada alíquota só incide sobre a parcela
 * dentro da faixa). Base limitada ao teto.
 *
 * Arredondamento: trunca cada faixa em centavos. Essa convenção reproduz os exemplos publicados
 * (R$ 121,57 no mínimo; R$ 248,58 para R$ 3.000). Confirmar contra o simulador do eSocial.
 */
export function employeeInss(baseCents: number, rules: RuleParams): { total: number; parts: InssPart[] } {
  const base = Math.min(Math.max(baseCents, 0), rules.inssCeilingCents);
  let prev = 0;
  let total = 0;
  const parts: InssPart[] = [];
  for (const b of rules.inssBrackets) {
    if (base <= prev) break;
    const slice = Math.min(base, b.upTo) - prev;
    const amount = floorCents(slice * b.rate);
    parts.push({ upTo: b.upTo, rate: b.rate, base: slice, amount });
    total += amount;
    prev = b.upTo;
  }
  return { total, parts };
}
