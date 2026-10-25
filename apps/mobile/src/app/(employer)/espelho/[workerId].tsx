import { useLocalSearchParams } from "expo-router";
import { Espelho } from "@/components/Espelho";

export default function EspelhoEmpregador() {
  const { workerId } = useLocalSearchParams<{ workerId: string }>();
  return <Espelho key={workerId} workerId={workerId} />;
}
