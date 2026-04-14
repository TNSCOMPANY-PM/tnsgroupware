import type { FactLabel } from "./factSchema";

type Fact = { label: FactLabel | string; keyword: string; unit?: string; source?: string };
export type ValidationIssue = { label: string; keyword: string; issue: string; severity: "error" | "warning" };

const NUMERIC_RULES: Record<string, { min?: number; max?: number; unit: string }> = {
  "창업비용_합계": { min: 100, max: 100000, unit: "만원" },
  "창업비용_가맹비": { min: 10, max: 10000, unit: "만원" },
  "창업비용_교육비": { min: 10, max: 5000, unit: "만원" },
  "창업비용_보증금": { min: 10, max: 5000, unit: "만원" },
  "창업비용_인테리어": { min: 100, max: 50000, unit: "만원" },
  "창업비용_장비": { min: 100, max: 30000, unit: "만원" },
  "대출가능금액": { min: 100, max: 50000, unit: "만원" },
  "실투자금": { min: 0, max: 50000, unit: "만원" },
  "평균 월매출": { min: 100, max: 100000, unit: "만원" },
  "최대 월매출": { min: 100, max: 500000, unit: "만원" },
  "가맹점 수": { min: 1, max: 10000, unit: "개" },
  "순마진율": { min: 0, max: 100, unit: "%" },
  "투자회수": { min: 1, max: 240, unit: "개월" },
  "운영 인원": { min: 1, max: 50, unit: "명" },
  "최소 평수": { min: 1, max: 500, unit: "평" },
  "최대 평수": { min: 1, max: 500, unit: "평" },
  "로열티": { min: 0, max: 5000, unit: "만원" },
};

export function validateFacts(facts: Fact[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const f of facts) {
    const rule = NUMERIC_RULES[f.label];
    if (!rule) continue;

    // Extract first number from keyword
    const cleaned = f.keyword.replace(/,/g, "");
    const numMatch = cleaned.match(/(\d+\.?\d*)/);
    if (!numMatch) {
      issues.push({ label: f.label, keyword: f.keyword, issue: "숫자를 찾을 수 없음", severity: "warning" });
      continue;
    }

    const num = parseFloat(numMatch[1]);
    if (isNaN(num)) {
      issues.push({ label: f.label, keyword: f.keyword, issue: "숫자 파싱 실패", severity: "warning" });
      continue;
    }

    if (rule.min !== undefined && num < rule.min) {
      issues.push({ label: f.label, keyword: f.keyword, issue: `최소값(${rule.min}${rule.unit}) 미만`, severity: "error" });
    }
    if (rule.max !== undefined && num > rule.max) {
      issues.push({ label: f.label, keyword: f.keyword, issue: `최대값(${rule.max}${rule.unit}) 초과`, severity: "error" });
    }
  }

  // Check for missing critical fields
  const labels = new Set(facts.map(f => f.label));
  const critical = ["창업비용_합계", "평균 월매출", "가맹점 수"];
  for (const c of critical) {
    if (!labels.has(c)) {
      issues.push({ label: c, keyword: "", issue: "필수 항목 누락", severity: "warning" });
    }
  }

  return issues;
}
