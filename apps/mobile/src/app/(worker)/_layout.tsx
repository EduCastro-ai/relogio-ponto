import { Tabs } from "expo-router";
import { SignOutButton } from "@/components/SignOutButton";

export default function WorkerLayout() {
  return (
    <Tabs screenOptions={{ headerRight: () => <SignOutButton />, tabBarIconStyle: { display: "none" } }}>
      <Tabs.Screen name="ponto" options={{ title: "Ponto" }} />
      <Tabs.Screen name="meu-espelho" options={{ title: "Meu espelho" }} />
    </Tabs>
  );
}
