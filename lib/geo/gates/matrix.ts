import "server-only";
import { getRule, getExcludeReason, isAllowed } from "@/utils/matrix-guard";
import type { Depth } from "@/lib/geo/types";
import type { MatrixRule } from "@/types/geo";

export type MatrixCheckResult = { ok: boolean; rule: MatrixRule | null; reason: string | null };

// depth + topic·industry·category 를 매트릭스 콘텐츠 타입 키로 매핑.
// 현 시점 매트릭스 Sheet 3 컬럼명: 관심도 랭킹 / 점포수 랭킹 / 시장 규모 / 매출 분석 / 창업비용 / 수익 시뮬레이션 / 가맹 계약
// 명확한 topic 매칭이 없으면 null 반환 → 호출자는 "매트릭스 적용 불가, pass" 취급.
export function resolveContentType(opts: {
  depth: Depth;
  topic?: string;
  category?: string;
}): string | null {
  const hint = `${opts.topic ?? ""} ${opts.category ?? ""}`;
  if (!hint.trim()) return null;
  if (/창업비용|초기\s*자본|투자금|실투자/.test(hint)) return "창업비용";
  if (/수익|월수익|예상\s*수익|시뮬레이션/.test(hint)) return "수익 시뮬레이션";
  if (/가맹\s*계약|로열티|계약\s*조건/.test(hint)) return "가맹 계약";
  if (/매출/.test(hint)) return "매출 분석";
  if (/점포수|가맹점\s*수/.test(hint)) return "점포수 랭킹";
  if (/시장\s*규모|시장\s*분석/.test(hint)) return "시장 규모";
  if (/관심도|검색량|랭킹/.test(hint)) return "관심도 랭킹";
  return null;
}

export async function matrixCheck(opts: {
  depth: Depth;
  brand?: string;
  topic?: string;
  category?: string;
}): Promise<MatrixCheckResult> {
  // D0/D1/D2는 브랜드 없는 일반 글 → 매트릭스 대상 아님
  if (opts.depth !== "D3") return { ok: true, rule: null, reason: null };
  if (!opts.brand) return { ok: true, rule: null, reason: null };

  const contentType = resolveContentType(opts);
  if (!contentType) return { ok: true, rule: null, reason: null };

  try {
    const rule = await getRule(opts.brand, contentType);
    if (rule === "EXCLUDE") {
      const reason = await getExcludeReason(opts.brand, contentType);
      return { ok: false, rule, reason };
    }
    const allowed = await isAllowed(opts.brand, contentType);
    return { ok: allowed || rule === null, rule, reason: null };
  } catch (e) {
    // 조회 실패는 통과로 취급 (V1 레거시 동작 유지)
    console.warn(`[gates.matrix] 조회 실패, pass:`, e instanceof Error ? e.message : e);
    return { ok: true, rule: null, reason: null };
  }
}
