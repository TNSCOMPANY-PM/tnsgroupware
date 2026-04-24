import "server-only";

export type Tier = "T1" | "T2" | "T3" | "T4";

export type TierInput = {
  stores: number | null;
  ftcYears: number;
  posMonths: number;
};

/**
 * D3 브랜드 성숙도 tier 분류.
 *  - T1: FTC 5년+ 및 점포 100+ (풀 데이터 양호). POS 36개월+는 보너스이며 FTC 단독으로도 T1 가능.
 *  - T2: FTC 2년+ && POS 24개월+  OR  점포 30~99 (A-C 갭 유의미)
 *  - T3: FTC 1년+  OR  점포 10~29 (판단 유보)
 *  - T4: 그 외 (데이터 성숙도 미달 — D3 차단, D0 신규 관측으로 편입)
 */
export function classifyTier(args: TierInput): Tier {
  const { stores, ftcYears, posMonths } = args;
  const s = stores ?? 0;
  if (ftcYears >= 5 && s >= 100) return "T1";
  if ((ftcYears >= 2 && posMonths >= 24) || (s >= 30 && s < 100)) return "T2";
  if (ftcYears >= 1 || (s >= 10 && s < 30)) return "T3";
  return "T4";
}

export class D3T4BlockedError extends Error {
  readonly code = "D3_T4_BLOCKED" as const;
  readonly tierInput: TierInput;
  constructor(brand: string, tierInput: TierInput) {
    super(
      `D3_T4_BLOCKED: brand=${brand} 데이터 성숙도 미달 (stores=${tierInput.stores ?? 0}, ftcYears=${tierInput.ftcYears}, posMonths=${tierInput.posMonths}). D0 신규 관측 글로 편입 요망.`,
    );
    this.name = "D3T4BlockedError";
    this.tierInput = tierInput;
  }
}
