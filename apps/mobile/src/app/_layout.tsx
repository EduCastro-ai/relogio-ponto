import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Loading } from "@/components/ui";
import { SessionProvider, useSession } from "@/lib/session";

function RootNav() {
  const { loading, session, profile } = useSession();
  if (loading || (session && !profile)) return <Loading />;
  const role = profile?.role;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={!!session && role === "none"}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={role === "employer"}>
        <Stack.Screen name="(employer)" />
      </Stack.Protected>
      <Stack.Protected guard={role === "worker"}>
        <Stack.Screen name="(worker)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <RootNav />
    </SessionProvider>
  );
}
