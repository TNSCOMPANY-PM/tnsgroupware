/**
 * 대한민국 근로기준법 제60조 기반 연차 계산
 * - 1년 미만: 입사 후 1개월 개근 시 1일씩 발생 (최대 11일)
 * - 1년 이상 ~ 3년 미만: 15일 부여
 * - 3년 차 이상: 15일 + (근속년수 - 1) / 2 마다 1일 가산, 최대 25일
 */

function parseHireDate(hireDate: string): Date | null {
  if (!hireDate || typeof hireDate !== "string") return null;
  const normalized = hireDate.trim().replace(/\./g, "-");
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 입사일(hireDate) 기준 총 발생 연차 (근로기준법 제60조)
 * @param hireDate 입사일 (YYYY-MM-DD 또는 YYYY.MM.DD)
 * @param referenceDate 기준일 (미지정 시 오늘). 해당 시점 기준 근속으로 계산
 * @returns 해당 기준일까지의 발생 연차 일수
 */
export function calculateAnnualLeaves(
  hireDate: string,
  referenceDate: Date = new Date()
): number {
  const join = parseHireDate(hireDate);
  if (!join || join.getTime() > referenceDate.getTime()) return 0;

  const fullMonths =
    (referenceDate.getFullYear() - join.getFullYear()) * 12 +
    (referenceDate.getMonth() - join.getMonth());
  const adjustedMonths = referenceDate.getDate() < join.getDate() ? fullMonths - 1 : fullMonths;
  const monthsWorked = Math.max(0, adjustedMonths);

  // 1년 미만: 1개월 개근 시 1일씩 (최대 11일)
  if (monthsWorked < 12) {
    return Math.min(monthsWorked, 11);
  }

  const tenureYears = Math.floor(monthsWorked / 12);

  // 1년 이상 ~ 3년 미만: 15일
  if (tenureYears < 3) {
    return 15;
  }

  // 3년 차 이상: 15 + Math.floor((근속년수 - 1) / 2), 최대 25일
  const addDays = Math.floor((tenureYears - 1) / 2);
  return Math.min(15 + addDays, 25);
}
