import { Stack } from "expo-router";

/** Abas do empregador + espelho empilhado por cima (tela oculta dentro de Tabs voltava sozinha). */
export default function EmployerLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="espelho/[workerId]" options={{ title: "Espelho do mês", headerBackTitle: "Equipe" }} />
    </Stack>
  );
}
