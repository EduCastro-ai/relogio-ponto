import { useState } from "react";
import { Alert } from "react-native";
import { Button, Card, Field, Muted, Screen, Title } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/** Primeiro acesso: cria o domicílio (empregador) ou aceita o convite (empregado). */
export default function Onboarding() {
  const { refreshProfile, signOut, session } = useSession();
  const [household, setHousehold] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"h" | "c" | null>(null);

  async function run(kind: "h" | "c") {
    setBusy(kind);
    const { error } =
      kind === "h"
        ? await supabase.rpc("create_household", { p_name: household.trim() })
        : await supabase.rpc("accept_invite", { p_code: code.trim() });
    setBusy(null);
    if (error) return Alert.alert("Não deu certo", error.message);
    await refreshProfile();
  }

  return (
    <Screen top>
      <Title>Bem-vindo</Title>
      <Muted>Conectado como {session?.user.email}</Muted>

      <Card>
        <Muted style={{ fontWeight: "600" }}>Sou empregador</Muted>
        <Field label="Nome do domicílio" placeholder="Ex.: Casa da Vila Madalena" value={household} onChangeText={setHousehold} />
        <Button title="Criar domicílio" onPress={() => run("h")} loading={busy === "h"} disabled={!household.trim()} />
      </Card>

      <Card>
        <Muted style={{ fontWeight: "600" }}>Sou empregado(a)</Muted>
        <Field label="Código de convite" value={code} onChangeText={setCode} autoCapitalize="none" />
        <Button title="Entrar com o convite" onPress={() => run("c")} loading={busy === "c"} disabled={!code.trim()} />
      </Card>

      <Button title="Sair" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
