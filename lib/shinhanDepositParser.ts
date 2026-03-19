/**
 * 신한은행 입금 SMS 파싱 (웹훅·Pushbullet 동기화 공용)
 *
 * 실제 수신 형태 예시:
 *   [Web발신]
 *   신한03/13 09:46
 *   140-***-578547
 *   입금 48,400
 *   홍민수(위노시스)
 *
 * - 날짜: "신한" 바로 뒤 MM/DD (공백 없이 붙어 있어도 파싱)
 * - 금액: "입금" 뒤 숫자(콤마 허용) → 정수로 변환
 * - 입금자: "입금 금액" 줄의 바로 다음 줄, 없으면 비금액/비날짜 마지막 줄
 */
export function parseShinhanDepositSms(smsText: string): {
  date: string;
  amount: number;
  client_name: string;
} | null {
  const raw = (smsText || "").trim();
  if (!raw) return null;

  const year = new Date().getFullYear();

  // 줄 단위로 분리 (모든 줄바꿈 패턴 대응, 빈 줄 제거)
  const lines = raw.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  // 단일 줄로 합쳐진 문자열도 대응
  const flat = lines.join(" ");

  // ── 날짜 추출 ──────────────────────────────────────────────────────────────
  // 패턴: 신한(임의공백)MM/DD 또는 신한MM/DD (둘 다 대응)
  const dateMatch = flat.match(/신한\s*(\d{1,2})\/(\d{1,2})/);
  let dateStr: string;
  if (dateMatch) {
    const m = String(parseInt(dateMatch[1], 10)).padStart(2, "0");
    const d = String(parseInt(dateMatch[2], 10)).padStart(2, "0");
    dateStr = `${year}-${m}-${d}`;
  } else {
    const now = new Date();
    dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  // ── 금액 추출 ──────────────────────────────────────────────────────────────
  // 패턴: "입금" 뒤 공백(0개 이상) + 숫자(콤마 허용)
  const amountMatch = flat.match(/입금\s*([\d,]+)/);
  if (!amountMatch) return null;
  const amount = parseInt(amountMatch[1].replace(/,/g, ""), 10);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  // ── 입금자명 추출 ──────────────────────────────────────────────────────────
  // (1) "입금 금액" 패턴이 있는 줄 바로 다음 줄
  const amountLineIdx = lines.findIndex((l) => /입금\s*[\d,]+/.test(l));
  let client_name =
    amountLineIdx >= 0 && amountLineIdx + 1 < lines.length
      ? lines[amountLineIdx + 1].trim()
      : "";

  // (2) 다음 줄이 없으면 → 날짜/금액/계좌번호/Web발신이 아닌 마지막 줄
  if (!client_name) {
    const skipPattern = /신한\d|입금\s*[\d,]+|\d{3}-\*+|\[Web발신\]/i;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!skipPattern.test(lines[i])) {
        client_name = lines[i];
        break;
      }
    }
  }

  return { date: dateStr, amount, client_name };
}
