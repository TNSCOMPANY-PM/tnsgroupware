import type { GptFacts } from "@/lib/geo/schema";
import type { Depth, CrossCheckResult } from "@/lib/geo/types";

/**
 * 한국식 큰 숫자 표기를 만원 기준 정수로 치환.
 *  - "6억 9,430만"  → "69430만"
 *  - "3억"          → "30000만"
 *  - "9,430만"      → "9,430만"  (억 없으면 변경 없음, 기존 NUM_RE 로 매칭)
 *  - "5억원"        → "50000만원" (붙여쓰기 OK)
 *  - "1조"          → 변경 없음  (범위 밖, 필요시 확장)
 */
export function normalizeKoreanNumbers(text: string): string {
  return text
    .replace(
      /(\d{1,3}(?:,\d{3})*|\d+)\s*억\s*(\d{1,3}(?:,\d{3})*|\d+)\s*만/gu,
      (_, eok: string, man: string) => {
        const eokN = parseInt(eok.replace(/,/g, ""), 10);
        const manN = parseInt(man.replace(/,/g, ""), 10);
        return `${eokN * 10000 + manN}만`;
      },
    )
    .replace(
      /(\d{1,3}(?:,\d{3})*|\d+)\s*억(?!\s*\d)/gu,
      (_, eok: string) => `${parseInt(eok.replace(/,/g, ""), 10) * 10000}만`,
    );
}

const NUM_RE = /[\d]{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/gu;
const UNIT_SUFFIX = /(?:회|명|개|원|%|점|억|만|천|년|월|일)/u;
const IGNORE_CONTEXT = /(순위|제\s*\d|\d+위|TOP\s*\d|\d{4}년\s*\d{1,2}월|\d{4}-\d{2}|\d{4}년|목차|차례|H[1-6]|표\s*\d|그림\s*\d|\([^)]*출처[^)]*\)|frandoor\s*산출|계산식|[×x\*/÷]\s*100\b|\b100\s*[×x\*/÷]|=\s*\*{0,2}\s*\d|^\d+\.|\s\d+\.\s|\s\d+\)\s|^\s*\*\s|^\s*-\s|[a-zA-Z-]+\s*:\s*[\d.]+(?:px|em|rem|%|pt|vh|vw)?|style\s*=|\*\*\s*\d+\.|#[0-9a-fA-F]{3,8}|\|\s*\d{4}\s*\||\|\s*\d+\s*\||\d+\s*개월(?:간|\s*이상|\s*이내)?|\d+\s*일\s*(?:이상|이내|간|\s*숙려|\s*기간|\s*사전|\s*제공|\s*이전|\s*이후|\s*전)|\d+\s*곳\s*중|\(\s*\d+\s*(?:일|개월|년)\s*\)|숙려\s*기간|사전\s*제공|\d+\s*차|\d+\s*호|Tier\s*[A-D]|\d+\s*[~\-]\s*\d+\s*평|\d+\s*평(?:형|대)?|\d+\s*대\s*(?:핵심|지표|요소|과제|원칙|전략|키워드|카테고리)|\d+\s*단계|\d+\s*가지)/u;

function normalize(s: string): string {
  return s.replace(/,/g, "").trim();
}

function addNum(set: Set<string>, raw: string | number) {
  // facts 값에 "6억 9,430만원" 같은 한국식 표기가 섞여 와도 pool 에 69430 으로 들어가도록 정규화
  const str = typeof raw === "string" ? normalizeKoreanNumbers(raw) : String(raw);
  const matches = str.match(NUM_RE) ?? [];
  for (const m of matches) {
    const n = normalize(m);
    set.add(n);
    const num = Number(n);
    if (!isNaN(num)) set.add(String(num));
  }
}

function buildAllowedPool(facts: GptFacts): Set<string> {
  const pool = new Set<string>();
  for (const f of facts.facts) {
    addNum(pool, f.value);
    if (f.year_month) addNum(pool, f.year_month);
  }
  for (const d of facts.deriveds ?? []) {
    addNum(pool, d.value);
    if (d.period) addNum(pool, d.period);
    for (const v of Object.values(d.inputs)) {
      if (typeof v === "number" || typeof v === "string") addNum(pool, v);
    }
  }
  return pool;
}

export function numberCrossCheck(body: string, facts: GptFacts): CrossCheckResult {
  const pool = buildAllowedPool(facts);
  const unmatched: string[] = [];
  let matched = 0;

  // 본문 내 "N억 M,MMM만" 같은 한국식 표기를 "NM만" 으로 정규화해서 pool 매칭 확률을 높임
  const normalizedBody = normalizeKoreanNumbers(body);
  const regex = new RegExp(`(${NUM_RE.source})\\s*(?:${UNIT_SUFFIX.source})?`, "gu");
  for (const m of normalizedBody.matchAll(regex)) {
    const raw = m[1];
    // PR063 — ctx 윈도우 ±8 → ±16. 매칭 정확도 영향 없고 unmatched 로그 가독성 향상.
    const ctxStart = Math.max(0, (m.index ?? 0) - 16);
    const ctxEnd = Math.min(normalizedBody.length, (m.index ?? 0) + raw.length + 16);
    const ctx = normalizedBody.slice(ctxStart, ctxEnd);
    if (IGNORE_CONTEXT.test(ctx)) continue;

    const n = Number(normalize(raw));
    if (isNaN(n) || n <= 1) continue;

    const key = normalize(raw);
    if (pool.has(key) || pool.has(String(n))) {
      matched++;
    } else {
      unmatched.push(`${raw} (ctx: ${ctx.replace(/\s+/g, " ")})`);
    }
  }
  return { ok: unmatched.length === 0, unmatched, matchedCount: matched };
}

/**
 * depth별 strict 수준:
 *  - D0/D1/D2: advisory (로그 반환용, throw 없음)
 *  - D3      : strict (throw 가능한 레벨, ok=false면 호출자가 차단)
 */
export function crosscheckForDepth(
  depth: Depth,
  body: string,
  facts: GptFacts,
): CrossCheckResult & { strict: boolean } {
  const base = numberCrossCheck(body, facts);
  const strict = depth === "D3";
  return { ...base, strict };
}
