/**
 * PR045 — 만원 단위 수치 포맷팅.
 *
 * 규칙:
 *   < 1억 (10,000만원 미만)         : "5,210만원"
 *   1억 ~ 99억 (verbose=false)      : "6.81억원"
 *   1억 ~ 99억 (verbose=true)       : "6억 8,132만원"
 *   ≥ 100억                         : "123억원"
 *   null / NaN / undefined          : "—" (또는 fallback)
 */

export type ManwonOpts = {
  verbose?: boolean;
  digits?: number;
  fallback?: string;
};

function toFiniteNumber(v: number | null | undefined): number | null {
  if (v == null) return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function commaInt(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

export function formatManwon(value: number | null | undefined, opts: ManwonOpts = {}): string {
  const fallback = opts.fallback ?? "—";
  const v = toFiniteNumber(value);
  if (v === null) return fallback;
  if (v < 0) return `-${formatManwon(-v, opts)}`;

  // < 1억 (1만원 ~ 9999만원)
  if (v < 10000) {
    return `${commaInt(v)}만원`;
  }

  // 100억 이상 (100억 = 1,000,000만원)
  if (v >= 1_000_000) {
    const eokOnly = Math.round(v / 10000);
    return `${commaInt(eokOnly)}억원`;
  }

  // 1억 ~ 99억
  if (opts.verbose) {
    const eok = Math.floor(v / 10000);
    const man = v - eok * 10000;
    if (man <= 0) return `${eok}억원`;
    return `${eok}억 ${commaInt(man)}만원`;
  }
  const digits = typeof opts.digits === "number" ? Math.max(0, Math.min(3, opts.digits)) : 2;
  const eokFloat = v / 10000;
  return `${eokFloat.toFixed(digits)}억원`;
}

export function formatManwonVerbose(value: number | null | undefined): string {
  return formatManwon(value, { verbose: true });
}
