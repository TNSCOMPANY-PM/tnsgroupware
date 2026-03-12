const KO_NF = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** 금융 테이블용: 12,345,678 형태 (콤마만) */
export function formatWonIntl(n: number): string {
  return KO_NF.format(Math.round(n));
}

/** 한국어 금액 포맷 (예: 1억 8,500만 원) */
export function formatWonKorean(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100_000_000) {
    const eok = Math.floor(abs / 100_000_000);
    const remainder = Math.floor((abs % 100_000_000) / 10_000);
    if (remainder > 0) {
      return `${n < 0 ? "-" : ""}${eok}억 ${remainder.toLocaleString()}만 원`;
    }
    return `${n < 0 ? "-" : ""}${eok}억 원`;
  }
  if (abs >= 10_000) {
    const man = Math.floor(abs / 10_000);
    return `${n < 0 ? "-" : ""}${man.toLocaleString()}만 원`;
  }
  return `${n < 0 ? "-" : ""}${Math.floor(abs).toLocaleString()}원`;
}
