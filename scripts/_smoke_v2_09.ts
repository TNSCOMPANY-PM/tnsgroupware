/**
 * v2-09 smoke — normalizeBrandName + matchBrand (LLM1 batch 의 brand 매칭 핵심).
 * scripts/llm1_ingest_ftc.ts 내부 함수가 module export 안 되므로 동일 로직을 inline 재현해 검증.
 */
import Module from "node:module";
const ModAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModAny._load;
ModAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

let okAll = true;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 80)}` : ""}`);
  if (!ok) okAll = false;
}

// llm1_ingest_ftc.ts 의 normalizeBrandName 동일 로직
function normalizeBrandName(s: string): string {
  if (!s) return "";
  let n = s;
  n = n.replace(/\([^)]*\)/g, "");
  n = n.replace(/（[^）]*）/g, "");
  n = n.replace(/주식회사|유한회사|합자회사|합명회사|\(주\)|\（주\）/g, "");
  n = n.replace(/[\s.,'"\-_/·•~`!@#$%^&*+=|\\<>?:;{}[\]]/g, "");
  return n.toLowerCase().trim();
}

type GeoEntry = { id: string; name: string; normalized: string };
type MatchTier = "exact" | "normalized" | "contains";
type MatchResult =
  | { id: string; tier: MatchTier; raw: string; matchedTo: string }
  | null;

function matchBrand(
  ftcName: string,
  geoList: GeoEntry[],
  rawMap: Map<string, string>,
  normMap: Map<string, string>,
): MatchResult {
  const trimmed = ftcName.trim();
  if (!trimmed) return null;
  const exactId = rawMap.get(trimmed);
  if (exactId) return { id: exactId, tier: "exact", raw: trimmed, matchedTo: trimmed };
  const norm = normalizeBrandName(trimmed);
  if (norm) {
    const normId = normMap.get(norm);
    if (normId) {
      const matchedTo = geoList.find((g) => g.id === normId)?.name ?? "?";
      return { id: normId, tier: "normalized", raw: trimmed, matchedTo };
    }
  }
  if (norm.length >= 3) {
    const candidates = geoList.filter(
      (g) =>
        g.normalized.length >= 3 &&
        (g.normalized.includes(norm) || norm.includes(g.normalized)),
    );
    if (candidates.length === 1) {
      const c = candidates[0];
      return { id: c.id, tier: "contains", raw: trimmed, matchedTo: c.name };
    }
  }
  return null;
}

async function main() {
  console.log("\n=== v2-09 smoke ===\n");

  // T1 normalizeBrandName
  console.log("[normalizeBrandName]");
  check(`"(주)오공김밥" → "오공김밥"`, normalizeBrandName("(주)오공김밥") === "오공김밥");
  check(`"주식회사 오공김밥" → "오공김밥"`, normalizeBrandName("주식회사 오공김밥") === "오공김밥");
  check(`"오공김밥(외식)" → "오공김밥"`, normalizeBrandName("오공김밥(외식)") === "오공김밥");
  check(`"OGONG.KIMBAB" → "ogongkimbab"`, normalizeBrandName("OGONG.KIMBAB") === "ogongkimbab");
  check(`"  오공  김밥  " → "오공김밥"`, normalizeBrandName("  오공  김밥  ") === "오공김밥");
  check(`""  → ""`, normalizeBrandName("") === "");
  check(`"오공-김밥_점" → "오공김밥점"`, normalizeBrandName("오공-김밥_점") === "오공김밥점");
  check(`"(주)（한국）오공김밥" → "오공김밥"`, normalizeBrandName("(주)（한국）오공김밥") === "오공김밥");
  check(`"a's b\\"" → "asb"`, normalizeBrandName(`a's b"`) === "asb");

  // T2 matchBrand
  console.log("\n[matchBrand]");
  const geoList: GeoEntry[] = [
    { id: "g1", name: "오공김밥", normalized: normalizeBrandName("오공김밥") },
    { id: "g2", name: "본죽&비빔밥cafe", normalized: normalizeBrandName("본죽&비빔밥cafe") },
    { id: "g3", name: "맘스터치", normalized: normalizeBrandName("맘스터치") },
    { id: "g4", name: "지코바양념치킨", normalized: normalizeBrandName("지코바양념치킨") },
  ];
  const rawMap = new Map(geoList.map((g) => [g.name, g.id]));
  const normMap = new Map(geoList.map((g) => [g.normalized, g.id]));

  // exact
  {
    const r = matchBrand("오공김밥", geoList, rawMap, normMap);
    check(`"오공김밥" → exact (g1)`, r?.tier === "exact" && r?.id === "g1");
  }

  // normalized — 법인격
  {
    const r = matchBrand("(주)오공김밥", geoList, rawMap, normMap);
    check(`"(주)오공김밥" → normalized (g1)`, r?.tier === "normalized" && r?.id === "g1");
  }
  {
    const r = matchBrand("주식회사 오공김밥", geoList, rawMap, normMap);
    check(`"주식회사 오공김밥" → normalized`, r?.tier === "normalized" && r?.id === "g1");
  }
  // 괄호 안 내용
  {
    const r = matchBrand("오공김밥(외식)", geoList, rawMap, normMap);
    check(`"오공김밥(외식)" → normalized`, r?.tier === "normalized" && r?.id === "g1");
  }
  // 공백·점
  {
    const r = matchBrand("오공 김밥", geoList, rawMap, normMap);
    check(`"오공 김밥" → normalized`, r?.tier === "normalized" && r?.id === "g1");
  }

  // contains — geo norm 이 ftc norm 에 포함
  {
    const r = matchBrand("(주)지코바양념치킨 본사", geoList, rawMap, normMap);
    check(
      `"(주)지코바양념치킨 본사" → contains (g4)`,
      r?.tier === "contains" && r?.id === "g4",
      r ? `${r.tier}/${r.matchedTo}` : "no match",
    );
  }

  // 미매칭 (3자 미만)
  {
    const r = matchBrand("XX", geoList, rawMap, normMap);
    check(`"XX" → null`, r === null);
  }

  // 미매칭 (전혀 다른 brand)
  {
    const r = matchBrand("교촌치킨", geoList, rawMap, normMap);
    check(`"교촌치킨" → null`, r === null, r ? `${r.tier}/${r.matchedTo}` : "null");
  }

  // 빈 문자열
  {
    const r = matchBrand("", geoList, rawMap, normMap);
    check(`"" → null`, r === null);
  }
  {
    const r = matchBrand("   ", geoList, rawMap, normMap);
    check(`"   " → null`, r === null);
  }

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
