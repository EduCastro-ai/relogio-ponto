import { ruleFor, simulate, type RuleParams } from "@relogio/calc";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button, Card, Field, Muted, Row, Screen, Title, colors } from "@/components/ui";
import { fmtBRL, parseBRL, today } from "@/lib/format";
import { loadRules } from "@/lib/rules";

/** Diarista × mensalista: custo mensal estimado para o empregador. */
export default function Simulador() {
  const [rules, setRules] = useState<RuleParams | null>(null);
  const [daily, setDaily] = useState("200,00");
  const [days, setDays] = useState(2);
  const [salary, setSalary] = useState("");
  const [transport, setTransport] = useState("");

  useEffect(() => {
    loadRules().then((all) => {
      const r = ruleFor(today(), all);
      setRules(r);
      setSalary((r.minimumWageCents / 100).toFixed(2).replace(".", ","));
    });
  }, []);

  const input = {
    dailyRateCents: parseBRL(daily),
    daysPerWeek: days,
    monthlySalaryCents: parseBRL(salary),
    transportMonthlyCents: transport ? parseBRL(transport) : 0,
  };
  const valid = rules && Object.values(input).every((v) => Number.isFinite(v) && v >= 0);
  const r = valid ? simulate(input, rules) : null;

  return (
    <Screen>
      <Title>Diarista × mensalista</Title>
      <Card>
        <Field label="Valor da diária (R$)" value={daily} onChangeText={setDaily} keyboardType="decimal-pad" />
        <Text style={{ fontWeight: "600", color: colors.text }}>Dias por semana</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {[1, 2, 3, 4, 5, 6].map((d) => (
            <View key={d} style={{ flex: 1 }}>
              <Button title={String(d)} variant={d === days ? "primary" : "secondary"} onPress={() => setDays(d)} />
            </View>
          ))}
        </View>
        <Field label="Salário do mensalista (R$)" value={salary} onChangeText={setSalary} keyboardType="decimal-pad" />
        <Field label="Transporte mensal (R$, opcional)" value={transport} onChangeText={setTransport} keyboardType="decimal-pad" />
        {rules && input.monthlySalaryCents < rules.minimumWageCents && (
          <Text style={{ color: colors.warn }}>Salário abaixo do mínimo ({fmtBRL(rules.minimumWageCents)}).</Text>
        )}
      </Card>

      {r && (
        <>
          <Card>
            <Text style={{ fontWeight: "700", color: colors.text }}>Diarista</Text>
            <Row label={`${r.diarista.daysPerMonth} diárias/mês`} value={fmtBRL(r.diarista.monthlyCents)} strong />
            {r.diarista.riskNote && <Text style={{ color: colors.danger }}>{r.diarista.riskNote}</Text>}
          </Card>
          <Card>
            <Text style={{ fontWeight: "700", color: colors.text }}>Mensalista</Text>
            <Row label="Salário" value={fmtBRL(r.mensalista.salaryCents)} />
            <Row label="Provisão 13º e férias + 1/3" value={fmtBRL(r.mensalista.provisionsCents)} />
            <Row label="Encargos (DAE)" value={fmtBRL(r.mensalista.encargosCents)} />
            {r.mensalista.transportEmployerCents > 0 && (
              <Row label="Transporte (acima de 6%)" value={fmtBRL(r.mensalista.transportEmployerCents)} />
            )}
            <Row label="Custo mensal" value={fmtBRL(r.mensalista.monthlyCents)} strong />
          </Card>
          <Card>
            <Row
              label={r.differenceCents >= 0 ? "Mensalista custa a mais" : "Mensalista custa a menos"}
              value={fmtBRL(Math.abs(r.differenceCents))}
              strong
            />
            {r.breakEvenDaysPerWeek !== null && (
              <Muted>Com esta diária, o mensalista empata a partir de {r.breakEvenDaysPerWeek} dias/semana.</Muted>
            )}
          </Card>
        </>
      )}
      <Muted>Estimativa sem horas extras, rescisão ou aviso prévio. Regras: {rules?.id ?? "carregando…"}.</Muted>
    </Screen>
  );
}
