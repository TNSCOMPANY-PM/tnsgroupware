// FS01/FS02 — GPT fact retriever 가 가져온 5대 지표의 단위·범위 상식 검증.
// 사례: 굽네치킨 D3 "월평균매출 493만원" — 연매출을 월매출로 잘못 라벨링한 오염을 차단.
export type FactSanityIssue = {
  code: "FS01" | "FS02" | "FS03";
  factIndex: number;
  claim: string;
  value: string | number;
  unit: string | null;
  reason: string;
  suggestion: string;
};

type RangeRule = {
  match: RegExp;
  min: number;
  max: number;
  units: (string | null)[];
  label: string;
};

const RULES: RangeRule[] = [
  {
    match: /(월\s*평균\s*매출|월매출|월\s*매출)/u,
    min: 500, max: 50000, units: ["만원"],
    label: "가맹점당 월평균매출",
  },
  {
    match: /(연\s*평균\s*매출|연매출|연\s*매출)/u,
    min: 6000, max: 600000, units: ["만원"],
    label: "가맹점당 연평균매출",
  },
  {
    match: /(가맹점수|가맹점\s*수|점포수|점포\s*수)/u,
    min: 1, max: 20000, units: ["개", "곳", null],
    label: "가맹점수",
  },
  {
    match: /(실투자금|초기\s*투자금|총투자금)/u,
    min: 1000, max: 200000, units: ["만원"],
    label: "실투자금",
  },
  {
    match: /(실질\s*폐점률|폐점률)/u,
    min: 0, max: 100, units: ["%", "퍼센트"],
    label: "실질 폐점률",
  },
  {
    match: /(순마진율|영업이익률|순이익률)/u,
    min: 0, max: 60, units: ["%", "퍼센트"],
    label: "순마진율",
  },
  {
    match: /(투자회수기간|회수기간)/u,
    min: 1, max: 240, units: ["개월", "월", "년"],
    label: "투자회수기간",
  },
];

export function checkFactSanity(facts: Array<{
  claim: string;
  value: string | number;
  unit?: string | null;
}>): FactSanityIssue[] {
  const issues: FactSanityIssue[] = [];
  facts.forEach((f, idx) => {
    const numericValue = typeof f.value === "number"
      ? f.value
      : parseFloat(String(f.value).replace(/[,_\s]/g, ""));
    if (Number.isNaN(numericValue)) return;
    const unit: string | null = f.unit ?? null;
    for (const rule of RULES) {
      if (!rule.match.test(f.claim)) continue;
      if (!rule.units.includes(unit)) {
        issues.push({
          code: "FS02",
          factIndex: idx,
          claim: f.claim,
          value: f.value,
          unit,
          reason: `${rule.label} 단위가 비정상: "${unit ?? "(없음)"}" (허용: ${rule.units.map(u => u ?? "없음").join(", ")})`,
          suggestion: `${rule.label} 은 ${rule.units.filter(u => u).join(" 또는 ")} 단위로 재조회 필요`,
        });
        continue;
      }
      if (numericValue < rule.min || numericValue > rule.max) {
        issues.push({
          code: "FS01",
          factIndex: idx,
          claim: f.claim,
          value: f.value,
          unit,
          reason: `${rule.label} 값이 상식 범위 밖: ${numericValue}${unit ?? ""} (허용: ${rule.min}~${rule.max}${rule.units[0] ?? ""})`,
          suggestion: numericValue < rule.min
            ? `너무 작음 — 연매출을 월매출로 잘못 라벨링했을 가능성. 원출처 단위 재확인.`
            : `너무 큼 — 업종 합계를 브랜드 값으로 잘못 가져왔을 가능성. 브랜드 필터 재확인.`,
        });
      }
    }
  });
  return issues;
}

// D3 strict 모드 — throw 로 파이프라인 차단
export function assertFactSanityStrict(facts: Array<{
  claim: string; value: string | number; unit?: string | null;
}>): void {
  const issues = checkFactSanity(facts);
  const errors = issues.filter(i => i.code === "FS01" || i.code === "FS02");
  if (errors.length > 0) {
    const msg = errors.map(e =>
      `[${e.code}] facts[${e.factIndex}] ${e.claim}=${e.value}${e.unit ?? ""} — ${e.reason}. ${e.suggestion}`
    ).join("\n");
    throw new Error(`Fact sanity 실패 (${errors.length}건):\n${msg}`);
  }
}
