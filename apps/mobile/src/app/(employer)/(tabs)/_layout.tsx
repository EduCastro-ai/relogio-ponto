import { Tabs } from "expo-router";
import { SignOutButton } from "@/components/SignOutButton";

export default function EmployerTabs() {
  return (
    <Tabs screenOptions={{ headerRight: () => <SignOutButton />, tabBarIconStyle: { display: "none" } }}>
      <Tabs.Screen name="equipe" options={{ title: "Equipe" }} />
      <Tabs.Screen name="simulador" options={{ title: "Simulador" }} />
    </Tabs>
  );
}
