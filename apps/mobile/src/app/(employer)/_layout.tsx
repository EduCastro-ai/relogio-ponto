import { Tabs } from "expo-router";
import { SignOutButton } from "@/components/SignOutButton";

export default function EmployerLayout() {
  return (
    <Tabs screenOptions={{ headerRight: () => <SignOutButton />, tabBarIconStyle: { display: "none" } }}>
      <Tabs.Screen name="equipe" options={{ title: "Equipe" }} />
      <Tabs.Screen name="simulador" options={{ title: "Simulador" }} />
      <Tabs.Screen name="espelho/[workerId]" options={{ title: "Espelho do mês", href: null }} />
    </Tabs>
  );
}
