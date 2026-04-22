import { numberCrossCheck } from "@/lib/geo/gates/crosscheck";
import type { GptFacts } from "@/lib/geo/schema";
import type { CrossCheckResult } from "@/lib/geo/types";

type FactsRaw = { facts: unknown[]; deriveds?: unknown[] };

export function crosscheckAgainstCanonical(
  html: string,
  factsRaw: FactsRaw,
): CrossCheckResult {
  const factsInput: GptFacts = {
    brand: undefined,
    industry: undefined,
    topic: undefined,
    category: undefined,
    facts: factsRaw.facts as GptFacts["facts"],
    deriveds: (factsRaw.deriveds ?? []) as GptFacts["deriveds"],
    collected_at: "1970-01-01",
    measurement_floor: false,
    conflicts: [],
  };
  const plain = html.replace(/<[^>]+>/g, " ");
  return numberCrossCheck(plain, factsInput);
}
