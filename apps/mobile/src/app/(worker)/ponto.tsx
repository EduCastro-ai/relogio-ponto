import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Text, View } from "react-native";
import { Button, Card, Muted, Screen, Title, colors } from "@/components/ui";
import type { Punch, PunchKind } from "@/lib/database.types";
import { PUNCH_LABEL, fmtTime } from "@/lib/format";
import { flushQueue, pendingCount, punch, queuedPunches } from "@/lib/punchQueue";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const CONSENT_VERSION = "geo-2026-10-v1";
const REFUSED_KEY = "relogio.geoRefused";
// cópia local do aceite: a batida offline não consegue consultar a tabela consents
const ACCEPTED_KEY = "relogio.geoAccepted";

/** Próximas batidas possíveis a partir da última do turno. */
function nextKinds(last: PunchKind | undefined): PunchKind[] {
  if (last === "in" || last === "break_end") return ["break_start", "out"];
  if (last === "break_start") return ["break_end"];
  return ["in"];
}

const QUALITY_NOTE: Partial<Record<Punch["quality"], string>> = {
  offline_synced: "enviada depois (sem internet)",
  suspect_clock: "relógio do aparelho divergente — vai para revisão",
  adjusted: "incluída por ajuste",
};

export default function Ponto() {
  const { profile, session } = useSession();
  const worker = profile?.role === "worker" ? profile.worker : null;
  const [punches, setPunches] = useState<Punch[]>([]);
  const [tz, setTz] = useState("America/Sao_Paulo");
  const [pending, setPending] = useState(pendingCount());
  const [busy, setBusy] = useState<PunchKind | null>(null);
  const [clock, setClock] = useState(new Date());

  const load = useCallback(async () => {
    if (!worker) return;
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const [p, h] = await Promise.all([
      supabase.from("effective_punches").select("*").eq("worker_id", worker.id).gte("punched_at", since).order("punched_at"),
      supabase.from("households").select("tz").eq("id", worker.household_id).single(),
    ]);
    if (p.data) setPunches(p.data as Punch[]);
    if (h.data) setTz(h.data.tz);
  }, [worker]);

  const sync = useCallback(async () => {
    if (pendingCount() === 0) return;
    const r = await flushQueue();
    setPending(pendingCount());
    if (r.failed.length) Alert.alert("Batidas recusadas pelo servidor", r.failed.join("\n"));
    if (r.sent) load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      sync().then(load);
    }, [sync, load]),
  );

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 15_000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && sync());
    return () => (clearInterval(t), sub.remove());
  }, [sync]);

  /** Consentimento LGPD antes de usar a localização; recusa = batida sem localização. */
  async function askConsent(): Promise<boolean> {
    if (localStorage.getItem(ACCEPTED_KEY) === CONSENT_VERSION) return true;
    const { data, error } = await supabase.from("consents").select("id").eq("kind", "geolocation").is("revoked_at", null).limit(1);
    if (data?.length) {
      localStorage.setItem(ACCEPTED_KEY, CONSENT_VERSION);
      localStorage.removeItem(REFUSED_KEY);
      return true;
    }
    // sem conexão não dá para registrar o aceite: bate sem localização, sem perguntar
    if (error) return false;
    if (localStorage.getItem(REFUSED_KEY)) return false;
    const accepted = await new Promise<boolean>((resolve) =>
      Alert.alert(
        "Localização na batida",
        "Para conferir que o ponto foi batido no local de trabalho, o app registra sua localização SOMENTE no momento de cada batida. Não há rastreamento contínuo. Você pode bater o ponto mesmo sem autorizar.",
        [
          { text: "Não autorizo", style: "cancel", onPress: () => resolve(false) },
          { text: "Autorizo", onPress: () => resolve(true) },
        ],
      ),
    );
    if (!accepted) {
      localStorage.setItem(REFUSED_KEY, "1");
      return false;
    }
    const ins = await supabase.from("consents").insert({ user_id: session!.user.id, kind: "geolocation", document_version: CONSENT_VERSION });
    if (ins.error) return false;
    localStorage.setItem(ACCEPTED_KEY, CONSENT_VERSION);
    return true;
  }

  async function getPosition() {
    if (!(await askConsent())) return undefined;
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return undefined;
    const timeout = new Promise<undefined>((r) => setTimeout(() => r(undefined), 10_000));
    // sem internet o GPS demora mais para fixar: cai para a última posição conhecida (até 5 min)
    const pos =
      (await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => undefined), timeout])) ??
      (await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 }).catch(() => null)) ??
      undefined;
    return pos && { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? undefined };
  }

  async function onPunch(kind: PunchKind) {
    if (!worker) return;
    setBusy(kind);
    try {
      const pos = await getPosition().catch(() => undefined);
      const r = await punch({ workerId: worker.id, kind, ...pos });
      if (r === "queued") Alert.alert("Sem internet", "A batida foi guardada no aparelho e será enviada quando a conexão voltar.");
      setPending(pendingCount());
      await load();
    } catch (e) {
      Alert.alert("Batida não registrada", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!worker) return null;
  // a fila offline conta para saber qual é a próxima batida
  const timeline = [
    ...punches.map((p) => ({ at: p.punched_at, kind: p.kind })),
    ...queuedPunches().filter((q) => q.workerId === worker.id).map((q) => ({ at: q.deviceTime, kind: q.kind })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const options = nextKinds(timeline.at(-1)?.kind);

  return (
    <Screen>
      <Title>Olá, {worker.full_name.split(" ")[0]}</Title>
      <Text style={{ fontSize: 44, fontWeight: "700", color: colors.text, fontVariant: ["tabular-nums"] }}>
        {clock.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" })}
      </Text>

      <View style={{ gap: 10 }}>
        {options.map((k) => (
          <Button key={k} title={PUNCH_LABEL[k]} onPress={() => onPunch(k)} loading={busy === k} disabled={!!busy} />
        ))}
      </View>

      {pending > 0 && (
        <Card>
          <Text style={{ color: colors.warn, fontWeight: "600" }}>{pending} batida(s) aguardando internet</Text>
          <Button title="Enviar agora" variant="secondary" onPress={sync} />
        </Card>
      )}

      <Card>
        <Text style={{ fontWeight: "700", color: colors.text }}>Turno atual</Text>
        {punches.length === 0 && <Muted>Nenhuma batida nas últimas horas.</Muted>}
        {punches.map((p) => (
          <View key={p.id} style={{ gap: 2 }}>
            <Text style={{ color: colors.text }}>
              {fmtTime(p.punched_at, tz)} · {PUNCH_LABEL[p.kind]}
            </Text>
            {(QUALITY_NOTE[p.quality] || p.within_site === false) && (
              <Muted>{[QUALITY_NOTE[p.quality], p.within_site === false && "fora do raio do local"].filter(Boolean).join(" · ")}</Muted>
            )}
          </View>
        ))}
      </Card>
      <Muted>Batidas não podem ser apagadas. Para corrigir, peça um ajuste: ele só vale depois que o empregador aceitar.</Muted>
    </Screen>
  );
}
