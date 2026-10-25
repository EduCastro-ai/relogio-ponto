import { useState } from "react";
import { Alert } from "react-native";
import { Button, Card, Field, Muted, Screen, Title } from "@/components/ui";
import { supabase } from "@/lib/supabase";

/** Login sem senha: código de 6 dígitos enviado por e-mail (Supabase Auth OTP). */
export default function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) return Alert.alert("Não foi possível enviar o código", error.message);
    setSent(true);
  }

  async function verify() {
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) Alert.alert("Código inválido", error.message);
    // sucesso: onAuthStateChange carrega o perfil e o roteador redireciona
  }

  return (
    <Screen>
      <Title>Relógio de Ponto</Title>
      <Muted>Entre com seu e-mail. O perfil (empregador ou empregado) é definido pelo seu cadastro.</Muted>
      <Card>
        <Field
          label="E-mail"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          editable={!sent}
        />
        {sent && (
          <Field label="Código recebido por e-mail" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={8} />
        )}
        {sent ? (
          <>
            <Button title="Entrar" onPress={verify} loading={busy} disabled={code.trim().length < 6} />
            <Button title="Trocar e-mail" variant="secondary" onPress={() => (setSent(false), setCode(""))} />
          </>
        ) : (
          <Button title="Enviar código" onPress={sendCode} loading={busy} disabled={!email.includes("@")} />
        )}
      </Card>
    </Screen>
  );
}
