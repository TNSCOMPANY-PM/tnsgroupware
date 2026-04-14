import type { FactRecord, FactDiff } from "@/types/factSchema";

export type FactCheckViolation = {
  number: string;          // 본문에서 발견된 수치 원문 (예: "5,210만원")
  normalized: number;      // 정규화 값
  unit: string;            // 단위
  reason: string;          // 위반 사유
};

export type FactCheckResult = {
  ok: boolean;
  violations: FactCheckViolation[];
  total_numbers: number;
  matched_numbers: number;
};

// 수치 + 단위 패턴: "1,234만원", "5억원", "52개", "17%", "3년", "20평" 등
const NUMBER_UNIT_RE = /([\d,]+(?:\.\d+)?)\s*(억원|만원|천원|원|개월|개|명|평|㎡|%|년)/g;

function normalize(raw: string, unit: string): number {
  const num = parseFloat(raw.replace(/,/g, ""));
  if (isNaN(num)) return NaN;
  switch (unit) {
    case "억원": return num * 10_000;     // 만원 기준
    case "만원": return num;
    case "천원": return num * 0.1;
    case "원":   return num / 10_000;
    default:     return num;
  }
}

function normalizeFact(value: string, unit: string): number | null {
  const m = value.match(/([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  return normalize(m[1], unit);
}

/**
 * 블로그 본문의 숫자가 제공된 fact 레코드에 존재하는지 검증.
 * - fact_data 의 value_normalized 또는 원문 매치
 * - diff 의 docx_value / public_value 도 허용
 * - ±1% 오차 허용 (반올림 차이)
 */
export function checkBlogFacts(
  content: string,
  facts: FactRecord[],
  diffs: FactDiff[] = [],
): FactCheckResult {
  // 허용 풀: (normalized, unit) 쌍 + 원문 문자열
  const allowedNumbers: { n: number; unit: string }[] = [];
  const allowedRawStrings = new Set<string>();

  for (const f of facts) {
    allowedRawStrings.add(f.value.replace(/\s/g, ""));
    const n = f.value_normalized ?? normalizeFact(f.value, f.unit);
    if (n != null && !isNaN(n)) allowedNumbers.push({ n, unit: f.unit });
  }
  for (const d of diffs) {
    allowedRawStrings.add(d.docx_value.replace(/\s/g, ""));
    allowedRawStrings.add(d.public_value.replace(/\s/g, ""));
    if (d.docx_normalized != null) allowedNumbers.push({ n: d.docx_normalized, unit: "만원" });
    if (d.public_normalized != null) allowedNumbers.push({ n: d.public_normalized, unit: "만원" });
  }

  const violations: FactCheckViolation[] = [];
  let total = 0;
  let matched = 0;

  // HTML 태그 / 주석 / 이미지 URL 제거
  const text = content
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const seen = new Set<string>();
  NUMBER_UNIT_RE.lastIndex = 0;
  for (;;) {
    const m = NUMBER_UNIT_RE.exec(text);
    if (!m) break;
    const rawNum = m[1];
    const unit = m[2];
    const raw = `${rawNum}${unit}`;
    if (seen.has(raw)) continue;
    seen.add(raw);
    total++;

    const normalized = normalize(rawNum, unit);
    if (isNaN(normalized)) continue;

    const numVal = parseFloat(rawNum.replace(/,/g, ""));
    if (numVal < 10 && unit === "") continue;

    if (allowedRawStrings.has(raw.replace(/\s/g, ""))) { matched++; continue; }
    const hit = allowedNumbers.some(a => {
      const tolerance = Math.max(Math.abs(a.n) * 0.01, 1);
      return Math.abs(a.n - normalized) <= tolerance;
    });
    if (hit) { matched++; continue; }

    violations.push({
      number: raw,
      normalized,
      unit,
      reason: "fact_data / diff 에 없는 수치",
    });
  }

  return {
    ok: violations.length === 0,
    violations,
    total_numbers: total,
    matched_numbers: matched,
  };
}
