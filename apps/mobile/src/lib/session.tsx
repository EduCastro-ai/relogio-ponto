import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Worker } from "./database.types";
import { supabase } from "./supabase";

/** Perfil é definido pelo vínculo no banco, não por escolha na tela. */
export type Profile =
  | { role: "employer"; householdId: string }
  | { role: "worker"; householdId: string; worker: Worker }
  | { role: "none" };

type Ctx = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Ctx | null>(null);

async function loadProfile(userId: string): Promise<Profile> {
  const [emp, wk] = await Promise.all([
    supabase.from("household_employers").select("household_id").eq("user_id", userId).limit(1),
    supabase.from("workers").select("*").eq("user_id", userId).limit(1),
  ]);
  if (emp.error) throw emp.error;
  if (wk.error) throw wk.error;
  const e = emp.data[0];
  if (e) return { role: "employer", householdId: e.household_id };
  const w = wk.data[0];
  if (w) return { role: "worker", householdId: w.household_id, worker: w };
  return { role: "none" };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    setProfile(uid ? await loadProfile(uid) : null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) setProfile(await loadProfile(data.session.user.id).catch(() => ({ role: "none" as const })));
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") setProfile(null);
      if (event === "SIGNED_IN" && s) {
        // fora do callback: chamadas ao Supabase dentro dele podem travar o cliente
        setTimeout(() => loadProfile(s.user.id).then(setProfile, () => setProfile({ role: "none" })), 0);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <SessionContext.Provider value={{ loading, session, profile, refreshProfile, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession fora do SessionProvider");
  return ctx;
}
