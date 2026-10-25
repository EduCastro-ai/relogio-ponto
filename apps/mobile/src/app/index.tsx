import { Redirect } from "expo-router";
import { useSession } from "@/lib/session";

/** Ponto de entrada: manda cada perfil para a sua área. */
export default function Index() {
  const { session, profile } = useSession();
  if (!session) return <Redirect href="/login" />;
  if (profile?.role === "employer") return <Redirect href="/equipe" />;
  if (profile?.role === "worker") return <Redirect href="/ponto" />;
  return <Redirect href="/onboarding" />;
}
