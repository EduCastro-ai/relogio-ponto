import type { RuleParams } from "@relogio/calc";
import { supabase } from "./supabase";

let cache: RuleParams[] | null = null;

/** Regras legais vêm de `rule_sets` (versionadas por vigência), nunca de constantes na UI. */
export async function loadRules(): Promise<RuleParams[]> {
  if (cache) return cache;
  const { data, error } = await supabase.from("rule_sets").select("*").order("valid_from");
  if (error) throw error;
  cache = data.map((r) => ({
    ...(r.params as unknown as Omit<RuleParams, "validFrom" | "validTo" | "sourceNote">),
    validFrom: r.valid_from,
    validTo: r.valid_to,
    sourceNote: r.source_note,
  }));
  return cache;
}
