import * as Location from "expo-location";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, Share, Text, View } from "react-native";
import { Button, Card, Field, Muted, Row, Screen, Title, colors } from "@/components/ui";
import type { Contract, Database, Worker } from "@/lib/database.types";
import { fmtBRL, parseBRL, today } from "@/lib/format";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

type Household = Database["public"]["Tables"]["households"]["Row"];
type Regime = Contract["default_kind"];

export default function Equipe() {
  const { profile } = useSession();
  const householdId = profile?.role === "employer" ? profile.householdId : "";
  const router = useRouter();
  const [household, setHousehold] = useState<Household | null>(null);
  const [workers, setWorkers] = useState<(Worker & { contracts: Contract[] })[]>([]);

  const load = useCallback(async () => {
    const [h, w, c] = await Promise.all([
      supabase.from("households").select("*").eq("id", householdId).single(),
      supabase.from("workers").select("*").eq("household_id", householdId).order("created_at"),
      supabase.from("contracts").select("*").eq("household_id", householdId),
    ]);
    if (h.data) setHousehold(h.data);
    setWorkers((w.data ?? []).map((x) => ({ ...x, contracts: (c.data ?? []).filter((k) => k.worker_id === x.id) })));
  }, [householdId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function setSiteHere() {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return Alert.alert("Sem permissão de localização");
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const { error } = await supabase
      .from("households")
      .update({ site_lat: pos.coords.latitude, site_lng: pos.coords.longitude })
      .eq("id", householdId);
    if (error) return Alert.alert("Erro", error.message);
    load();
  }

  return (
    <Screen>
      <Title>{household?.name ?? "Domicílio"}</Title>
      <Card>
        <Row
          label="Local de trabalho"
          value={household?.site_lat != null ? `definido (raio ${household.site_radius_m} m)` : "não definido"}
        />
        <Muted>Usado para marcar se a batida foi feita dentro do raio. A batida fora do raio é aceita, mas sinalizada.</Muted>
        <Button title="Usar minha localização atual" variant="secondary" onPress={setSiteHere} />
      </Card>

      {workers.map((w) => {
        const c = w.contracts.find((k) => !k.end_date) ?? w.contracts[0];
        return (
          <Card key={w.id}>
            <Pressable onPress={() => router.push({ pathname: "/espelho/[workerId]", params: { workerId: w.id } })}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>{w.full_name}</Text>
              <Row
                label={c ? c.default_kind : "sem contrato"}
                value={c ? fmtBRL((c.default_kind === "mensalista" ? c.monthly_salary_cents : c.daily_rate_cents) ?? 0) : "—"}
              />
              <Text style={{ color: colors.primary, marginTop: 4 }}>Ver espelho do mês ›</Text>
            </Pressable>
            {!w.user_id && w.invite_code && (
              <View style={{ gap: 6 }}>
                <Row label="Convite (ainda não aceito)" value={w.invite_code} strong />
                <Button
                  title="Compartilhar convite"
                  variant="secondary"
                  onPress={() => Share.share({ message: `Código de convite do Relógio de Ponto: ${w.invite_code}` })}
                />
              </View>
            )}
          </Card>
        );
      })}

      <NewWorker householdId={householdId} onCreated={load} />
    </Screen>
  );
}

function NewWorker({ householdId, onCreated }: { householdId: string; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [regime, setRegime] = useState<Regime>("diarista");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const cents = parseBRL(value);

  async function create() {
    setBusy(true);
    try {
      const w = await supabase.from("workers").insert({ household_id: householdId, full_name: name.trim() }).select().single();
      if (w.error) throw w.error;
      const c = await supabase.from("contracts").insert({
        household_id: householdId,
        worker_id: w.data.id,
        start_date: today(),
        default_kind: regime,
        monthly_salary_cents: regime === "mensalista" ? cents : null,
        daily_rate_cents: regime === "diarista" ? cents : null,
        scheduled_weekdays: regime === "mensalista" ? [1, 2, 3, 4, 5] : [],
      });
      if (c.error) throw c.error;
      setName("");
      setValue("");
      onCreated();
    } catch (e) {
      Alert.alert("Erro ao cadastrar", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Text style={{ fontWeight: "700", color: colors.text }}>Novo empregado</Text>
      <Field label="Nome completo" value={name} onChangeText={setName} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        {(["diarista", "mensalista"] as const).map((r) => (
          <View key={r} style={{ flex: 1 }}>
            <Button title={r} variant={regime === r ? "primary" : "secondary"} onPress={() => setRegime(r)} />
          </View>
        ))}
      </View>
      <Field
        label={regime === "mensalista" ? "Salário mensal (R$)" : "Valor da diária (R$)"}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        placeholder="0,00"
      />
      <Muted>CPF é opcional e pode ser incluído depois. Jornada padrão: 8h, seg a sex (mensalista).</Muted>
      <Button title="Cadastrar e gerar convite" onPress={create} loading={busy} disabled={!name.trim() || !(cents > 0)} />
    </Card>
  );
}
