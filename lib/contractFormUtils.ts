/**
 * 계약서 폼: 숫자 콤마, 한글 금액 표기, 생년월일 변환
 */

/** 숫자를 콤마 포맷 문자열로 (입력 표시용) */
export function formatNumberWithComma(value: string | number | undefined): string {
  if (value === "" || value === undefined || value === null) return "";
  const n = typeof value === "number" ? value : parseCommaNumber(String(value));
  if (Number.isNaN(n)) return "";
  return n.toLocaleString("ko-KR");
}

/** 콤마 포함 문자열을 숫자로 파싱 */
export function parseCommaNumber(s: string): number {
  if (!s || typeof s !== "string") return 0;
  const n = Number(String(s).replace(/,/g, "").trim());
  return Number.isNaN(n) ? 0 : n;
}

/** 금액 한글 표기 (예: 1억 2천만 원, 3천만 원) */
export function formatAmountKorean(value: string | number | undefined): string {
  if (value === "" || value === undefined || value === null) return "";
  const n = typeof value === "number" ? value : parseCommaNumber(String(value));
  if (Number.isNaN(n) || n < 0) return "";
  if (n === 0) return "0원";
  const man = 10_000;
  const ok = 100_000_000;
  const okPart = Math.floor(n / ok);
  const manPart = Math.floor((n % ok) / man);
  const rest = n % man;
  const parts: string[] = [];
  if (okPart > 0) parts.push(`${okPart}억`);
  if (manPart > 0) parts.push(`${manPart}만`);
  if (rest > 0) parts.push(rest.toLocaleString("ko-KR"));
  return (parts.length ? parts.join(" ") : "0") + " 원";
}

/** 프로필 생년월일 "1997년 8월 16일" → input용 "1997-08-16" */
export function birthDateKoToIso(ko: string | undefined): string {
  if (!ko || typeof ko !== "string") return "";
  const m = ko.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (!m) return "";
  const [, y, month, day] = m;
  const mm = String(Number(month)).padStart(2, "0");
  const dd = String(Number(day)).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** ISO "1997-08-16" → 표시용 "1997년 8월 16일" (계약서 본문용은 contractTemplates에서 처리) */
export function birthDateIsoToKo(iso: string | undefined): string {
  if (!iso || typeof iso !== "string") return "";
  const [y, month, day] = iso.split("-");
  if (!y || !month || !day) return "";
  return `${y}년 ${Number(month)}월 ${Number(day)}일`;
}
