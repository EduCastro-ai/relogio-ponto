import { describe, expect, it } from "vitest";
import { localMidnightMs, punchesToDays, tzOffsetMin, type PunchInput } from "../src/index.js";

const TZ = "America/Sao_Paulo";
const p = (kind: PunchInput["kind"], local: string, shiftDate = local.slice(0, 10)): PunchInput => ({
  kind,
  punchedAt: new Date(`${local}:00-03:00`).toISOString(),
  shiftDate,
});

describe("fuso horário", () => {
  it("São Paulo é UTC−3 (sem horário de verão)", () => {
    expect(tzOffsetMin(new Date("2026-11-02T12:00:00Z"), TZ)).toBe(-180);
    expect(new Date(localMidnightMs("2026-11-02", TZ)).toISOString()).toBe("2026-11-02T03:00:00.000Z");
  });
});

describe("batidas → dias de trabalho", () => {
  it("jornada com pausa vira dois intervalos", () => {
    const { days, issues } = punchesToDays(
      [p("in", "2026-11-02T08:00"), p("break_start", "2026-11-02T12:00"), p("break_end", "2026-11-02T13:00"), p("out", "2026-11-02T17:00")],
      TZ,
    );
    expect(issues).toEqual([]);
    expect(days).toEqual([{ date: "2026-11-02", intervals: [{ startMin: 480, endMin: 720 }, { startMin: 780, endMin: 1020 }] }]);
  });

  it("turno que cruza a meia-noite fica no dia da entrada (fim > 1440)", () => {
    const { days } = punchesToDays([p("in", "2026-11-02T22:00"), p("out", "2026-11-03T06:00", "2026-11-02")], TZ);
    expect(days).toEqual([{ date: "2026-11-02", intervals: [{ startMin: 1320, endMin: 1800 }] }]);
  });

  it("ordem de chegada não importa (fila offline)", () => {
    const { days } = punchesToDays([p("out", "2026-11-02T17:00"), p("in", "2026-11-02T08:00")], TZ);
    expect(days[0]?.intervals).toEqual([{ startMin: 480, endMin: 1020 }]);
  });

  it("sequências incompletas viram pendências", () => {
    const { days, issues } = punchesToDays([p("out", "2026-11-04T17:00"), p("in", "2026-11-05T08:00")], TZ);
    expect(days.map((d) => d.intervals.length)).toEqual([0, 0]);
    expect(issues).toEqual([
      { date: "2026-11-04", message: "fechamento sem abertura (descartado)" },
      { date: "2026-11-05", message: "turno sem saída" },
    ]);
  });
});
