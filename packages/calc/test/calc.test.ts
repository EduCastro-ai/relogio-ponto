import { describe, expect, it } from "vitest";
import {
  RULES_2026,
  computeDiarista,
  computeMensalista,
  employeeInss,
  isoWeekday,
  nightMinutes,
  ruleFor,
  simulate,
  type DayInput,
} from "../src/index.js";

const R = RULES_2026;
const MONTH = "2026-11";

/** Dia com uma jornada contínua (já sem pausas): minutos de trabalho a partir das 08:00 */
const day = (date: string, minutes: number, startMin = 8 * 60): DayInput => ({
  date,
  intervals: [{ startMin, endMin: startMin + minutes }],
});

// Novembro/2026: dom 1, seg 2 ... sáb 7, dom 8 ...
const weekdays = (month: string) =>
  Array.from({ length: 30 }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`).filter((d) => isoWeekday(d) <= 5);

const base = {
  month: MONTH,
  salaryCents: 200_000,
  scheduledMinPerDay: 480,
  scheduledWeekdays: [1, 2, 3, 4, 5],
};
const fullMonth = () => weekdays(MONTH).map((d) => day(d, 480));

describe("INSS do empregado (alíquotas progressivas, truncando por faixa)", () => {
  it("salário mínimo → R$ 121,57", () => {
    expect(employeeInss(162_100, R).total).toBe(12_157);
  });
  it("R$ 3.000 → R$ 248,58 (exemplo publicado)", () => {
    expect(employeeInss(300_000, R).total).toBe(24_858);
  });
  it("limita ao teto", () => {
    expect(employeeInss(1_000_000, R).total).toBe(employeeInss(847_555, R).total);
  });
  it("zero e negativo não geram contribuição", () => {
    expect(employeeInss(0, R).total).toBe(0);
    expect(employeeInss(-5, R).total).toBe(0);
  });
});

describe("adicional noturno", () => {
  it("22h–06h: 7h noturnas reais (22h–05h)", () => {
    expect(nightMinutes({ startMin: 22 * 60, endMin: 30 * 60 }, R)).toBe(420);
  });
  it("turno que começa 00:00: madrugada até 05h", () => {
    expect(nightMinutes({ startMin: 0, endMin: 360 }, R)).toBe(300);
  });
  it("jornada diurna: zero", () => {
    expect(nightMinutes({ startMin: 480, endMin: 1020 }, R)).toBe(0);
  });
});

describe("mensalista", () => {
  it("mês regular sem extras: bruto = salário; INSS e DAE conferem", () => {
    const r = computeMensalista({ ...base, days: fullMonth() }, R);
    expect(r.grossCents).toBe(200_000);
    expect(r.inss.total).toBe(15_568);
    expect(r.netCents).toBe(184_432);
    expect(r.employer.inssCents).toBe(16_000);
    expect(r.employer.ratCents).toBe(1_600);
    expect(r.employer.fgtsCents).toBe(16_000);
    expect(r.employer.fgtsCompensatoryCents).toBe(6_400);
    expect(r.employer.daeCents).toBe(55_568);
    expect(r.employer.totalCostCents).toBe(240_000); // 200.000 + 20% de encargos
    expect(r.absences.unjustified).toEqual([]);
  });

  it("2h extras num dia (10h) → R$ 27,27", () => {
    const days = fullMonth().map((d) => (d.date === "2026-11-03" ? day(d.date, 600) : d));
    const r = computeMensalista({ ...base, days }, R);
    expect(r.minutes.overtime).toBe(120);
    expect(r.earnings.find((e) => e.code === "HE50")?.cents).toBe(2_727);
    expect(r.grossCents).toBe(202_727);
  });

  it("domingo trabalhado 4h, não compensado → em dobro (R$ 72,73)", () => {
    const days = [...fullMonth(), day("2026-11-08", 240)];
    const r = computeMensalista({ ...base, days }, R);
    expect(r.earnings.find((e) => e.code === "DOMFER")?.cents).toBe(7_273);
    expect(r.minutes.overtime).toBe(0); // não conta como hora extra
  });

  it("domingo trabalhado mas compensado → sem dobro", () => {
    const days = [...fullMonth(), { ...day("2026-11-08", 240), compensated: true }];
    const r = computeMensalista({ ...base, days }, R);
    expect(r.earnings.find((e) => e.code === "DOMFER")).toBeUndefined();
  });

  it("feriado em dia útil trabalhado → em dobro", () => {
    const r = computeMensalista({ ...base, days: fullMonth(), holidays: ["2026-11-20"] }, R);
    // 8h × 2 × (2000/220) = 145,45
    expect(r.earnings.find((e) => e.code === "DOMFER")?.cents).toBe(14_545);
  });

  it("excedente semanal de 44h (6 dias × 8h) → 4h extras", () => {
    const week = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"];
    const days = fullMonth().filter((d) => !week.includes(d.date));
    week.forEach((d) => days.push(day(d, 480)));
    const r = computeMensalista({ ...base, days }, R);
    expect(r.minutes.overtime).toBe(240);
    expect(r.earnings.find((e) => e.code === "HE50")?.cents).toBe(5_455);
  });

  it("falta injustificada: desconta o dia (R$ 66,67) + perda do DSR da semana", () => {
    const days = fullMonth().filter((d) => d.date !== "2026-11-11");
    const r = computeMensalista({ ...base, days }, R);
    expect(r.absences.unjustified).toEqual(["2026-11-11"]);
    expect(r.absences.dsrLostWeeks).toEqual(["2026-11-09"]);
    expect(r.grossCents).toBe(200_000 - 6_667 - 6_667);
  });

  it("falta justificada ou feriado: sem desconto", () => {
    const days = fullMonth().filter((d) => d.date !== "2026-11-11");
    const r = computeMensalista({ ...base, days, justifiedAbsences: ["2026-11-11"] }, R);
    expect(r.grossCents).toBe(200_000);
    const r2 = computeMensalista({ ...base, days, holidays: ["2026-11-11"] }, R);
    expect(r2.grossCents).toBe(200_000);
  });

  it("não cobra falta de dias futuros (asOf) nem anteriores à admissão", () => {
    const days = fullMonth().filter((d) => d.date <= "2026-11-12");
    const r = computeMensalista({ ...base, days, asOf: "2026-11-12" }, R);
    expect(r.absences.unjustified).toEqual([]);
    const r2 = computeMensalista(
      { ...base, days: fullMonth().filter((d) => d.date >= "2026-11-16"), contractStart: "2026-11-16" },
      R,
    );
    expect(r2.absences.unjustified).toEqual([]);
  });

  it("adicional noturno: 60 min noturnos reais → R$ 3,38", () => {
    const days = [day("2026-11-02", 60, 22 * 60)];
    const r = computeMensalista({ ...base, scheduledWeekdays: [], days }, R);
    expect(r.minutes.night).toBe(60);
    expect(r.earnings.find((e) => e.code === "ADNOT")?.cents).toBe(338);
  });

  it("vale-transporte limitado a 6% do salário e ao custo real", () => {
    const r = computeMensalista({ ...base, days: fullMonth(), transport: { enabled: true, monthlyCostCents: 30_000 } }, R);
    expect(r.deductions.find((d) => d.code === "VT")?.cents).toBe(12_000);
    const r2 = computeMensalista({ ...base, days: fullMonth(), transport: { enabled: true, monthlyCostCents: 8_000 } }, R);
    expect(r2.deductions.find((d) => d.code === "VT")?.cents).toBe(8_000);
  });

  it("descontos acordados limitados a 20% (art. 18 §1º)", () => {
    const r = computeMensalista({ ...base, days: fullMonth(), agreedDeductionsCents: 100_000 }, R);
    expect(r.deductions.find((d) => d.code === "ACORDO")?.cents).toBe(40_000);
    expect(r.warnings.join(" ")).toMatch(/20%/);
  });

  it("alerta de salário abaixo do mínimo", () => {
    const r = computeMensalista({ ...base, salaryCents: 150_000, days: fullMonth() }, R);
    expect(r.warnings.join(" ")).toMatch(/mínimo/);
  });
});

describe("diarista e enquadramento", () => {
  const rate = 20_000;
  it("2 dias por semana → verde", () => {
    const r = computeDiarista({ month: MONTH, dailyRateCents: rate, workedDates: ["2026-11-03", "2026-11-05", "2026-11-10", "2026-11-12"] });
    expect(r.level).toBe("verde");
    expect(r.totalCents).toBe(80_000);
  });
  it("uma semana com 3 dias → atenção", () => {
    const r = computeDiarista({ month: MONTH, dailyRateCents: rate, workedDates: ["2026-11-02", "2026-11-03", "2026-11-04"] });
    expect(r.level).toBe("atencao");
  });
  it("3 semanas com 3 dias → vermelho", () => {
    const dates = ["02", "03", "04", "09", "10", "11", "16", "17", "18"].map((d) => `2026-11-${d}`);
    expect(computeDiarista({ month: MONTH, dailyRateCents: rate, workedDates: dates }).level).toBe("vermelho");
  });
  it("conta pernoites e ignora datas duplicadas/fora do mês", () => {
    const r = computeDiarista({
      month: MONTH,
      dailyRateCents: rate,
      workedDates: ["2026-11-03", "2026-11-03", "2026-10-30"],
      overnightDates: ["2026-11-03"],
    });
    expect(r.days).toBe(1);
    expect(r.overnightDays).toBe(1);
  });
});

describe("simulador diarista × mensalista", () => {
  it("custo do mensalista inclui provisões e encargos de 20%", () => {
    const s = simulate({ dailyRateCents: 20_000, daysPerWeek: 2, monthlySalaryCents: 162_100 }, R);
    expect(s.diarista.monthlyCents).toBe(173_333);
    expect(s.mensalista.provisionsCents).toBe(31_519);
    expect(s.mensalista.encargosCents).toBe(38_724);
    expect(s.mensalista.monthlyCents).toBe(232_343);
    expect(s.differenceCents).toBe(59_010);
    expect(s.diarista.riskNote).toBeNull();
  });
  it("3 dias por semana gera nota de risco", () => {
    const s = simulate({ dailyRateCents: 20_000, daysPerWeek: 3, monthlySalaryCents: 162_100 }, R);
    expect(s.diarista.riskNote).toMatch(/vínculo/);
  });
  it("transporte: empregador paga só o que excede 6%", () => {
    const s = simulate({ dailyRateCents: 20_000, daysPerWeek: 5, monthlySalaryCents: 200_000, transportMonthlyCents: 20_000 }, R);
    expect(s.mensalista.transportEmployerCents).toBe(8_000);
  });
});

describe("regras por vigência", () => {
  it("seleciona 2026 e falha fora da vigência", () => {
    expect(ruleFor("2026-06-15", [R]).id).toBe("br-domestico-2026");
    expect(() => ruleFor("2027-01-01", [R])).toThrow(/Sem regras/);
  });
});
