import {
  computeDiarista,
  computeMensalista,
  minutesOf,
  monthDays,
  punchesToDays,
  ruleFor,
  type DiaristaResult,
  type MensalistaResult,
  type PunchIssue,
} from "@relogio/calc";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Loading, Muted, Row, Screen, Title, colors } from "./ui";
import type { Contract, Punch } from "@/lib/database.types";
import { currentMonth, fmtBRL, fmtHours, shiftMonth, today } from "@/lib/format";
import { loadRules } from "@/lib/rules";
import { supabase } from "@/lib/supabase";

type Data = {
  name: string;
  contract: Contract | null;
  days: { date: string; minutes: number; flags: string[] }[];
  issues: PunchIssue[];
  mensalista?: MensalistaResult;
  diarista?: DiaristaResult;
};

const LEVEL = { verde: colors.ok, atencao: colors.warn, vermelho: colors.danger } as const;

/** Espelho do mês: batidas efetivas → dias de trabalho → motor de cálculo (@relogio/calc). */
export function Espelho({ workerId }: { workerId: string }) {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      const all = monthDays(month);
      const first = all[0]!;
      const last = all[all.length - 1]!;
      const [w, c, p, wd, rules] = await Promise.all([
        supabase.from("workers").select("full_name, household_id, households(tz)").eq("id", workerId).single(),
        supabase.from("contracts").select("*").eq("worker_id", workerId).lte("start_date", last).order("start_date", { ascending: false }),
        supabase.from("effective_punches").select("*").eq("worker_id", workerId).gte("shift_date", first).lte("shift_date", last),
        supabase.from("work_days").select("work_date, overnight").eq("worker_id", workerId).gte("work_date", first).lte("work_date", last),
        loadRules(),
      ]);
      if (w.error) throw w.error;
      const tz = (w.data.households as unknown as { tz: string } | null)?.tz ?? "America/Sao_Paulo";
      const contract = (c.data ?? []).find((k) => !k.end_date || k.end_date >= first) ?? null;
      const punches = (p.data ?? []) as Punch[];

      const { days, issues } = punchesToDays(
        punches.map((x) => ({ kind: x.kind, punchedAt: x.punched_at, shiftDate: x.shift_date })),
        tz,
      );
      const flagsOf = (date: string) => {
        const ps = punches.filter((x) => x.shift_date === date);
        const f = new Set<string>();
        if (ps.some((x) => x.quality === "suspect_clock")) f.add("relógio suspeito");
        if (ps.some((x) => x.quality === "offline_synced")) f.add("offline");
        if (ps.some((x) => x.quality === "adjusted")) f.add("ajustado");
        if (ps.some((x) => x.within_site === false)) f.add("fora do raio");
        return [...f];
      };

      const out: Data = {
        name: w.data.full_name,
        contract,
        days: days.map((d) => ({ date: d.date, minutes: minutesOf(d.intervals), flags: flagsOf(d.date) })),
        issues,
      };

      if (contract?.default_kind === "mensalista" && contract.monthly_salary_cents) {
        const now = today();
        out.mensalista = computeMensalista(
          {
            month,
            salaryCents: contract.monthly_salary_cents,
            scheduledMinPerDay: Math.round(contract.scheduled_hours_per_day * 60),
            scheduledWeekdays: contract.scheduled_weekdays,
            days,
            asOf: now.startsWith(month) ? now : undefined,
            contractStart: contract.start_date > first ? contract.start_date : undefined,
          },
          ruleFor(first, rules),
        );
      } else if (contract?.default_kind === "diarista" && contract.daily_rate_cents) {
        out.diarista = computeDiarista({
          month,
          dailyRateCents: contract.daily_rate_cents,
          workedDates: days.filter((d) => d.intervals.length).map((d) => d.date),
          overnightDates: (wd.data ?? []).filter((x) => x.overnight).map((x) => x.work_date),
        });
      }
      setData(out);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [month, workerId]);

  useEffect(() => {
    load();
  }, [load]);

  const [y, m] = month.split("-");
  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="‹" variant="secondary" onPress={() => setMonth(shiftMonth(month, -1))} />
        </View>
        <Text style={{ flex: 2, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.text }}>{`${m}/${y}`}</Text>
        <View style={{ flex: 1 }}>
          <Button title="›" variant="secondary" onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth()} />
        </View>
      </View>

      {error && <Text style={{ color: colors.danger }}>{error}</Text>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <Title>{data.name}</Title>
          {!data.contract && <Muted>Sem contrato vigente neste mês.</Muted>}
          {data.mensalista && <MensalistaCard r={data.mensalista} />}
          {data.diarista && <DiaristaCard r={data.diarista} />}

          <Card>
            <Text style={{ fontWeight: "700", color: colors.text }}>Dias</Text>
            {data.days.length === 0 && <Muted>Nenhuma batida no mês.</Muted>}
            {data.days.map((d) => (
              <View key={d.date}>
                <Row label={d.date.split("-").reverse().slice(0, 2).join("/")} value={fmtHours(d.minutes)} />
                {d.flags.length > 0 && <Muted>{d.flags.join(" · ")}</Muted>}
              </View>
            ))}
          </Card>

          {data.issues.length > 0 && (
            <Card>
              <Text style={{ fontWeight: "700", color: colors.warn }}>Pendências para revisão</Text>
              {data.issues.map((i, k) => (
                <Muted key={k}>{`${i.date.split("-").reverse().slice(0, 2).join("/")}: ${i.message}`}</Muted>
              ))}
            </Card>
          )}
          <Muted>Prévia calculada no aparelho. Feriados ainda não são cadastrados. Conferir com o eSocial antes de pagar.</Muted>
        </>
      )}
    </Screen>
  );
}

// faltas/DSR/atrasos já reduzem o bruto; os demais descontos (INSS, VT…) vão entre o bruto e o líquido
const WAGE_DEDUCTIONS = ["FALTA", "DSRPERDA", "ATRASO"];

function MensalistaCard({ r }: { r: MensalistaResult }) {
  const line = (d: { code: string; label: string; cents: number }) => (
    <Row key={d.code} label={d.label} value={`− ${fmtBRL(d.cents)}`} />
  );
  return (
    <Card>
      {r.earnings.map((e) => (
        <Row key={e.code} label={e.label} value={fmtBRL(e.cents)} />
      ))}
      {r.deductions.filter((d) => WAGE_DEDUCTIONS.includes(d.code)).map(line)}
      <Row label="Bruto" value={fmtBRL(r.grossCents)} strong />
      {r.deductions.filter((d) => !WAGE_DEDUCTIONS.includes(d.code)).map(line)}
      <Row label="Líquido" value={fmtBRL(r.netCents)} strong />
      <Row label="DAE (empregador)" value={fmtBRL(r.employer.daeCents)} />
      <Row label="Horas trabalhadas" value={fmtHours(r.minutes.worked)} />
      <Row label="Horas extras" value={fmtHours(r.minutes.overtime)} />
      {r.absences.unjustified.length > 0 && <Row label="Faltas" value={String(r.absences.unjustified.length)} />}
      {r.warnings.map((w, i) => (
        <Text key={i} style={{ color: colors.warn }}>
          {w}
        </Text>
      ))}
    </Card>
  );
}

function DiaristaCard({ r }: { r: DiaristaResult }) {
  return (
    <Card>
      <Row label="Diárias no mês" value={String(r.days)} />
      {r.overnightDays > 0 && <Row label="Pernoites" value={String(r.overnightDays)} />}
      <Row label="Total" value={fmtBRL(r.totalCents)} strong />
      <Text style={{ color: LEVEL[r.level], fontWeight: "600" }}>{r.message}</Text>
    </Card>
  );
}
