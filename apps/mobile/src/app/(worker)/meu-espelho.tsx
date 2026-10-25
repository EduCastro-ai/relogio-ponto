import { Espelho } from "@/components/Espelho";
import { useSession } from "@/lib/session";

export default function MeuEspelho() {
  const { profile } = useSession();
  return profile?.role === "worker" ? <Espelho workerId={profile.worker.id} /> : null;
}
