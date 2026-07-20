/**
 * 대한민국 근로기준법 기반 연차 계산
 * - 1년 미만: 1개월 개근 시 1일 발생 (최대 11일)
 * - 1년 이상: 기본 15일, 이후 2년마다 1일씩 가산 (최대 25일)
 * - 마이너스 연차 사용 허용 (당겨 쓰기)
 * - 주말·공휴일 제외 영업일 수 계산
 */

/** 한국 법정 공휴일 (yyyy-MM-dd 형식, 2025~2027) */
const PUBLIC_HOLIDAYS: Record<number, string[]> = {
  2025: [
    "2025-01-01", "2025-01-28", "2025-01-29", "2025-01-30", // 신정, 설날
    "2025-03-01", "2025-03-03", // 삼일절, 대체
    "2025-05-05", "2025-05-06", // 어린이날, 대체
    "2025-05-25", // 부처님오신날
    "2025-06-06", "2025-08-15", "2025-10-03", "2025-10-04", "2025-10-05", // 추석
    "2025-10-09", "2025-12-25",
  ],
  2026: [
    "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18", // 신정, 설날
    "2026-03-01", "2026-03-02", // 삼일절, 대체
    "2026-05-05", "2026-05-24", "2026-05-25", // 어린이날, 부처님오신날
    "2026-06-06", "2026-07-17", "2026-08-15", "2026-08-17",
    "2026-09-24", "2026-09-25", "2026-09-26", // 추석
    "2026-10-03", "2026-10-05", "2026-10-09", "2026-12-25",
  ],
  2027: [
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-02-10",
    "2027-03-01", "2027-05-05", "2027-05-13", "2027-06-06",
    "2027-08-15", "2027-09-14", "2027-09-15", "2027-09-16",
    "2027-10-03", "2027-10-09", "2027-12-25",
  ],
};

export function isPublicHoliday(date: Date): boolean {
  const y = date.getFullYear();
  const list = PUBLIC_HOLIDAYS[y];
  if (!list) return false;
  const str = `${y}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return list.includes(str);
}

/**
 * 입사일 문자열 (예: "2021.01.25")을 파싱
 */
function parseJoinDate(joinDateStr: string): Date | null {
  try {
    const [y, m, d] = joinDateStr.replace(/\./g, "-").split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * 기준일 대비 입사 후 경과 개월 수
 */
function getMonthsWorked(joinDate: Date, baseDate: Date): number {
  const months =
    (baseDate.getFullYear() - joinDate.getFullYear()) * 12 +
    (baseDate.getMonth() - joinDate.getMonth());
  return Math.max(0, months);
}

/**
 * 기준일 대비 입사 후 만근한 완전한 개월 수 (1개월 만근 = 해당 달이 완전히 지남)
 */
function getFullMonthsWorked(joinDate: Date, baseDate: Date): number {
  let m =
    (baseDate.getFullYear() - joinDate.getFullYear()) * 12 +
    (baseDate.getMonth() - joinDate.getMonth());
  if (baseDate.getDate() < joinDate.getDate()) m--;
  return Math.max(0, m);
}

/**
 * 해당 연도 1월 1일
 */
function getYearStart(year: number): Date {
  return new Date(year, 0, 1);
}

/** 기준일 (연차 계산 검증용) */
export const REFERENCE_DATE = new Date(2026, 2, 9);

/**
 * /api/holidays?year=YYYY 에서 공휴일 목록을 가져오는 헬퍼 (클라이언트 전용)
 * 실패 시 null 반환 (하드코딩된 PUBLIC_HOLIDAYS 폴백)
 */
export async function fetchKoreanHolidays(year: number): Promise<string[] | null> {
  try {
    const res = await fetch(`/api/holidays?year=${year}`);
    if (!res.ok) return null;
    const json = await res.json() as { holidays: string[] };
    return Array.isArray(json.holidays) ? json.holidays : null;
  } catch {
    return null;
  }
}

/**
 * 동적 공휴일 목록을 사용한 영업일 수 계산
 * (공휴일 목록 없을 때는 하드코딩 폴백)
 */
export function countBusinessDaysExcludingHolidaysList(
  start: Date,
  end: Date,
  holidayList: string[]
): number {
  if (start > end) return 0;
  const set = new Set(holidayList);
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    const weekend = day === 0 || day === 6;
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!weekend && !set.has(str)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * 근로기준법 연차 자동 생성 (기준일 2026-03-09 고정)
 * - 1년 미만: 입사 후 1개월 만근 시마다 1일씩 발생 (최대 11일)
 * - 1년 이상: 1년차 15일, 3년차부터 2년마다 1일 가산 (최대 25일)
 * - 계산식: 15 + floor((근속연수 - 1) / 2)
 * @returns { granted, bonusDays } - bonusDays는 3년차 이상 가산 일수 (0이면 뱃지 미표시)
 */
export function calculateAnnualLeave(
  joinDate: Date | string,
  baseDate: Date = REFERENCE_DATE
): { granted: number; bonusDays: number } {
  const join =
    typeof joinDate === "string" ? parseJoinDate(joinDate) : joinDate;
  if (!join || join.getTime() > baseDate.getTime()) return { granted: 0, bonusDays: 0 };

  const fullMonths = getFullMonthsWorked(join, baseDate);

  if (fullMonths < 12) {
    return {
      granted: Math.min(fullMonths, 11),
      bonusDays: 0,
    };
  }

  const monthsWorked = getMonthsWorked(join, baseDate);

  const tenureYears = Math.floor(monthsWorked / 12);
  const bonusDays = Math.floor((tenureYears - 1) / 2);
  const granted = Math.min(15 + bonusDays, 25);

  return { granted, bonusDays };
}

/**
 * 근로기준법 연차 발생 계산 (해당 연도 기준)
 * @param joinDateStr 입사일 (YYYY.MM.DD 또는 YYYY-MM-DD)
 * @param year 계산 대상 연도
 */
export function getAnnualLeaveGranted(
  joinDateStr: string,
  year: number
): number {
  const joinDate = parseJoinDate(joinDateStr);
  if (!joinDate) return 0;

  // 입사일 기준 연차 부여: 가장 최근 입사 anniversary 시점의 근속연수로 계산
  // 예: 입사 2025-02-01, 오늘 2026-04-14 → 최근 anniversary 2026-02-01 (1년차 → 15일)
  //     입사 2019-07-09, 오늘 2026-04-14 → 최근 anniversary 2025-07-09 (6년차 → 17일)

  const now = new Date();
  const today = new Date(year, now.getMonth(), now.getDate());
  if (joinDate > today) return 0;

  // 가장 최근 입사 anniversary 계산 (오늘 이전)
  const thisYearAnniversary = new Date(year, joinDate.getMonth(), joinDate.getDate());
  const lastAnniversary = thisYearAnniversary <= today
    ? thisYearAnniversary
    : new Date(year - 1, joinDate.getMonth(), joinDate.getDate());

  const monthsAtAnniversary = getMonthsWorked(joinDate, lastAnniversary);

  if (monthsAtAnniversary < 12) {
    // 1년 미만: 오늘 기준 경과 개월 수 (최대 11일)
    const monthsNow = getMonthsWorked(joinDate, today);
    return Math.min(monthsNow, 11);
  }

  // 1년 이상: 기본 15일, 3년차부터 2년마다 1일 가산 (최대 25일) — 근로기준법
  const yearsWorked = Math.floor(monthsAtAnniversary / 12);
  const additionalDays = yearsWorked >= 1 ? Math.floor((yearsWorked - 1) / 2) : 0;
  return Math.min(15 + additionalDays, 25);
}

/**
 * 해당 연도 잔여 연차 계산 (0 이하 불가, 음수 반환 안 함)
 */
export function getAnnualLeaveRemaining(
  joinDateStr: string,
  year: number,
  usedDays: number
): number {
  const granted = getAnnualLeaveGranted(joinDateStr, year);
  return Math.max(0, granted - usedDays);
}

/**
 * 마이너스 연차 허용 잔여 연차 (당겨 쓰기 가능)
 * 부족해도 음수로 반환 (예: -3)
 */
export function getAnnualLeaveRemainingAllowMinus(
  joinDateStr: string,
  year: number,
  usedDays: number
): number {
  const granted = getAnnualLeaveGranted(joinDateStr, year);
  return granted - usedDays;
}

/** 연차로 차감되는 휴가 유형 */
export const ANNUAL_LEAVE_TYPES = [
  "annual",
  "half_am",
  "half_pm",
  "quarter_am",
  "quarter_pm",
  "hourly",
];

/** 사용으로 집계하는 상태 (취소 요청은 승인 전까지 사용으로 유지) */
export const ANNUAL_LEAVE_USED_STATUSES = ["승인_완료", "CANCEL_REQUESTED"];

/**
 * 연차 회계연도 시작일 (= 가장 최근 입사 anniversary)
 * 연차는 입사일 기준으로 부여되므로 사용 집계도 달력연도가 아닌 이 날짜부터 해야 한다.
 * 예: 입사 2019-07-09, 오늘 2026-07-20 → 2026-07-09
 * @returns YYYY-MM-DD, 입사일 파싱 실패 시 해당 연도 1월 1일
 */
export function getLeaveYearCutoff(
  joinDateStr: string | null | undefined,
  baseDate: Date = new Date()
): string {
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const joinDate = joinDateStr ? parseJoinDate(joinDateStr) : null;
  if (!joinDate) return fmt(new Date(baseDate.getFullYear(), 0, 1));

  const thisYear = new Date(baseDate.getFullYear(), joinDate.getMonth(), joinDate.getDate());
  const cutoff =
    thisYear <= baseDate
      ? thisYear
      : new Date(baseDate.getFullYear() - 1, joinDate.getMonth(), joinDate.getDate());

  return fmt(cutoff < joinDate ? joinDate : cutoff);
}

/** 잔여 연차 계산에 넘기는 휴가 신청 (호출부에서 이 형태로 정규화) */
export type AnnualLeaveUsageItem = {
  leaveType: string;
  status: string;
  startDate: string;
  days: number | string | null;
};

/**
 * 연차 회계연도 시작일 이후 사용한 연차 일수 합계
 */
export function sumAnnualLeaveUsed(
  items: AnnualLeaveUsageItem[],
  cutoffStr: string
): number {
  const total = items
    .filter(
      (r) =>
        ANNUAL_LEAVE_TYPES.includes(r.leaveType) &&
        ANNUAL_LEAVE_USED_STATUSES.includes(r.status) &&
        (r.startDate ?? "") >= cutoffStr
    )
    .reduce((s, r) => s + (Number(r.days) || 0), 0);
  return Math.round(total * 1000) / 1000;
}

/**
 * 잔여 연차 계산 표준 진입점 — 모든 화면은 이 함수를 사용한다.
 * 법정 부여일수(입사일 anniversary 기준) + 수동 조정(granted_leaves) - 회계연도 내 사용일수
 */
export function calcAnnualLeaveSummary(params: {
  hireDate: string | null | undefined;
  items: AnnualLeaveUsageItem[];
  adjustmentDays?: number;
  baseDate?: Date;
}): { granted: number; used: number; remaining: number; cutoff: string } {
  const { hireDate, items, adjustmentDays = 0, baseDate = new Date() } = params;
  const joinStr = hireDate ? hireDate.replace(/\./g, "-") : null;
  const legal = joinStr ? getAnnualLeaveGranted(joinStr, baseDate.getFullYear()) : 15;
  const cutoff = getLeaveYearCutoff(joinStr, baseDate);
  const used = sumAnnualLeaveUsed(items, cutoff);
  const granted = legal + adjustmentDays;
  return {
    granted,
    used,
    remaining: Math.round((granted - used) * 1000) / 1000,
    cutoff,
  };
}

/**
 * 주말 제외 일수 계산 (토, 일 제외)
 */
export function countBusinessDays(start: Date, end: Date): number {
  if (start > end) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * 주말 + 공휴일 제외 영업일 수 계산
 * (시작일·종료일 포함, 주말·공휴일 제외한 영업일만 카운트)
 */
export function countBusinessDaysExcludingHolidays(
  start: Date,
  end: Date
): number {
  if (start > end) return 0;
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    const weekend = day === 0 || day === 6;
    const holiday = isPublicHoliday(d);
    if (!weekend && !holiday) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * 시작일부터 N일째 영업일(주말·공휴일 제외)의 날짜 반환
 * 시작일 = 1일차. 경조사/가족돌봄 등 고정 영업일 휴가의 종료일 계산용.
 */
export function getEndDateForBusinessDays(startDate: Date, businessDays: number): Date {
  if (businessDays <= 0) return new Date(startDate);
  let count = 0;
  const d = new Date(startDate);
  while (count < businessDays) {
    const day = d.getDay();
    const weekend = day === 0 || day === 6;
    const holiday = isPublicHoliday(d);
    if (!weekend && !holiday) count++;
    if (count >= businessDays) return new Date(d);
    d.setDate(d.getDate() + 1);
  }
  return new Date(d);
}
