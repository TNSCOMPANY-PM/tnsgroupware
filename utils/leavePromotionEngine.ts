/**
 * 근로기준법 제61조 연차 유급휴가 사용 촉진 엔진
 * - 1차 촉진: 소멸 6개월 전
 * - 2차 촉진: 소멸 2개월 전 (자동 지정)
 */

import { addMonths, subMonths, isBefore, format } from "date-fns";
import { getAnnualLeaveGranted } from "./leaveCalculator";
import type { LeaveRequest } from "@/constants/leave";
import type { User } from "@/constants/users";

const TODAY = new Date(2026, 2, 9); // 2026-03-09
const ANNUAL_LEAVE_TYPES = ["annual", "half_am", "half_pm", "quarter_am", "quarter_pm", "hourly"];

export interface PromotionStatus {
  userId: string;
  userName: string;
  department: string;
  remainingDays: number;
  expirationDate: string;
  /** 1차 촉진 구간 (소멸 6개월 전 ~ 소멸) */
  inFirstPromotion: boolean;
  /** 2차 촉진 구간 (소멸 2개월 전 ~ 소멸) */
  inSecondPromotion: boolean;
  /** 계획 제출 여부 */
  planSubmitted: boolean;
  /** 자동 지정된 휴가일 (2차 촉진 시) */
  autoDesignatedDates?: string[];
}

/** 해당 연도 연차 소멸일: 다음 해 12월 31일 (근로기준법) */
export function getExpirationDate(year: number): Date {
  return new Date(year + 1, 11, 31);
}

/** 데모용: 촉진 시나리오 검증을 위해 소멸일을 8개월 후로 단축 (실제 서비스에서는 getExpirationDate 사용) */
export function getExpirationForPromotionDemo(year: number, baseDate: Date): Date {
  return addMonths(baseDate, 8);
}

/** 1차 촉진 시작일 (소멸 6개월 전) */
export function getFirstPromotionStart(expiration: Date): Date {
  return subMonths(expiration, 6);
}

/** 2차 촉진 시작일 (소멸 2개월 전) */
export function getSecondPromotionStart(expiration: Date): Date {
  return subMonths(expiration, 2);
}

/** 사용 연차 일수 계산 */
function getUsedDays(leaveRequests: LeaveRequest[], userId: string, year: number): number {
  return leaveRequests
    .filter(
      (r) =>
        r.applicantId === userId &&
        (r.status === "승인_완료" || r.status === "PLANNED" || r.status === "CANCEL_REQUESTED") &&
        ANNUAL_LEAVE_TYPES.includes(r.leaveType) &&
        r.startDate.startsWith(String(year))
    )
    .reduce((s, r) => s + r.days, 0);
}

/** 잔여 영업일 목록 (오늘 이후, 주말/공휴일 제외) */
function getUpcomingBusinessDays(count: number, from: Date): string[] {
  const result: string[] = [];
  const d = new Date(from);
  while (result.length < count) {
    const day = d.getDay();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const str = `${yyyy}-${mm}-${dd}`;
    const isWeekend = day === 0 || day === 6;
    const isHoliday2026 = [
      "2026-01-01", "2026-02-16", "2026-02-17", "2026-02-18",
      "2026-03-01", "2026-03-02", "2026-05-05", "2026-05-24", "2026-05-25",
      "2026-06-06", "2026-07-17", "2026-08-15", "2026-08-17",
      "2026-09-24", "2026-09-25", "2026-09-26", "2026-10-03", "2026-10-05",
      "2026-10-09", "2026-12-25",
    ].includes(str);
    if (!isWeekend && !isHoliday2026) result.push(str);
    d.setDate(d.getDate() + 1);
  }
  return result;
}

/**
 * 직원별 촉진 상태 계산
 */
export function computePromotionStatus(
  users: User[],
  leaveRequests: LeaveRequest[],
  plannedLeaveRequests: LeaveRequest[],
  baseDate: Date = TODAY
): PromotionStatus[] {
  const year = baseDate.getFullYear();
  const allRequests = [...leaveRequests, ...plannedLeaveRequests];
  const expiration = getExpirationForPromotionDemo(year, baseDate);
  const firstStart = subMonths(expiration, 6);
  const secondStart = subMonths(expiration, 2);

  return users
    .filter((u) => u.joinDate && u.employmentStatus === "재직")
    .map((user) => {
      const joinStr = user.joinDate!.replace(/\./g, "-");
      const granted = getAnnualLeaveGranted(joinStr, year);
      const used = getUsedDays(allRequests, user.id, year);
      const remaining = Math.max(0, granted - used);
      const planSubmitted = plannedLeaveRequests.some(
        (r) => r.applicantId === user.id && r.startDate.startsWith(String(year))
      );

      const inFirst = !isBefore(baseDate, firstStart) && isBefore(baseDate, expiration);
      const inSecond = !isBefore(baseDate, secondStart) && isBefore(baseDate, expiration);

      let autoDesignatedDates: string[] | undefined;
      if (inSecond && remaining > 0 && !planSubmitted) {
        autoDesignatedDates = getUpcomingBusinessDays(remaining, baseDate);
      }

      return {
        userId: user.id,
        userName: user.name,
        department: user.department,
        remainingDays: remaining,
        expirationDate: format(expiration, "yyyy-MM-dd"),
        inFirstPromotion: inFirst,
        inSecondPromotion: inSecond,
        planSubmitted,
        autoDesignatedDates,
      };
    });
}

/** 1차 촉진 대상 (잔여 1일 이상, 계획 미제출) */
export function getFirstPromotionTargets(statuses: PromotionStatus[]): PromotionStatus[] {
  return statuses.filter(
    (s) => s.inFirstPromotion && s.remainingDays >= 1 && !s.planSubmitted
  );
}

/** 2차 촉진 대상 (잔여 1일 이상, 계획 미제출) */
export function getSecondPromotionTargets(statuses: PromotionStatus[]): PromotionStatus[] {
  return statuses.filter(
    (s) => s.inSecondPromotion && s.remainingDays >= 1 && !s.planSubmitted
  );
}
