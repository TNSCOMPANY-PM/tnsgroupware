import { numberCrossCheck } from "@/lib/geo/gates/crosscheck";
import type { GptFacts } from "@/lib/geo/schema";
import type { CrossCheckResult } from "@/lib/geo/types";

type FactsRaw = { facts: unknown[]; deriveds?: unknown[] };

// L01 계열 금지어 — lint.ts 와 동일한 의도. "약" 은 계약/약관/약정 오탐 피하려고
// 앞이 Hangul 이 아니고 뒤에 공백+숫자 또는 바로 숫자가 오는 "근사치" 용례만 포착.
const FORBIDDEN_YAK = /(?:^|[^가-힣])약\s*\d/u;
const FORBIDDEN_RE = /(대략|정도|쯤|아마도|업계\s*관계자|많은\s*전문가들?|수령확인서|1\s*위|최고|추천|업계\s*1위)/u;

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

/** L01 계열 금지어 검출 — syndicate rewrite 결과 HTML 에서 한 건이라도 찾으면 fail. */
export function forbiddenWordCheck(html: string): { ok: boolean; hits: string[] } {
  const plain = html.replace(/<[^>]+>/g, " ");
  const hits: string[] = [];
  const yak = plain.match(FORBIDDEN_YAK);
  if (yak) hits.push(`약(근사치): "${yak[0].trim()}"`);
  const m = plain.match(FORBIDDEN_RE);
  if (m) hits.push(`${m[0]}`);
  return { ok: hits.length === 0, hits };
}
