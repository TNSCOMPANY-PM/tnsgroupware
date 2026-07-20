/**
 * 근로기준법 제61조 연차 유급휴가 사용 촉진 엔진
 * - 1차 촉진: 소멸 6개월 전
 * - 2차 촉진: 소멸 2개월 전 (자동 지정)
 */

import { addYears, subMonths, isBefore, format } from "date-fns";
import {
  getAnnualLeaveGranted,
  getLeaveYearCutoff,
  isPublicHoliday,
  ANNUAL_LEAVE_TYPES,
  ANNUAL_LEAVE_USED_STATUSES,
} from "./leaveCalculator";
import type { LeaveRequest } from "@/constants/leave";
import type { User } from "@/constants/users";

/** 촉진 계산에서 사용으로 집계하는 상태 (제출된 사용 계획도 포함) */
const PROMOTION_USED_STATUSES = [...ANNUAL_LEAVE_USED_STATUSES, "PLANNED"];

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

/**
 * 연차 소멸일 = 다음 입사 anniversary 전날
 * 이 회사는 회계연도가 아닌 입사일 기준으로 연차를 부여하므로,
 * anniversary에 부여된 연차는 다음 anniversary에 소멸한다.
 */
export function getExpirationDate(
  hireDate: string | null | undefined,
  baseDate: Date = new Date()
): Date {
  const cutoffStr = getLeaveYearCutoff(hireDate, baseDate);
  const [y, m, d] = cutoffStr.split("-").map(Number);
  return addYears(new Date(y, m - 1, d), 1);
}

/** 1차 촉진 시작일 (소멸 6개월 전) */
export function getFirstPromotionStart(expiration: Date): Date {
  return subMonths(expiration, 6);
}

/** 2차 촉진 시작일 (소멸 2개월 전) */
export function getSecondPromotionStart(expiration: Date): Date {
  return subMonths(expiration, 2);
}

/** 연차연도(입사일 anniversary) 시작 이후 사용 연차 일수 계산 */
function getUsedDays(leaveRequests: LeaveRequest[], userId: string, cutoffStr: string): number {
  const total = leaveRequests
    .filter(
      (r) =>
        r.applicantId === userId &&
        PROMOTION_USED_STATUSES.includes(r.status) &&
        ANNUAL_LEAVE_TYPES.includes(r.leaveType) &&
        r.startDate >= cutoffStr
    )
    .reduce((s, r) => s + (Number(r.days) || 0), 0);
  return Math.round(total * 1000) / 1000;
}

/** 잔여 영업일 목록 (기준일 이후, 주말/공휴일 제외) */
function getUpcomingBusinessDays(count: number, from: Date, until: Date): string[] {
  const result: string[] = [];
  const d = new Date(from);
  while (result.length < count && d < until) {
    const day = d.getDay();
    const isWeekend = day === 0 || day === 6;
    if (!isWeekend && !isPublicHoliday(d)) {
      result.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      );
    }
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
  baseDate: Date = new Date(),
  /** granted_leaves 수동 조정 (user_id, year, days) */
  grantedAdjustments: { user_id: string; year: number; days: number }[] = []
): PromotionStatus[] {
  const year = baseDate.getFullYear();
  const allRequests = [...leaveRequests, ...plannedLeaveRequests];

  return users
    .filter((u) => u.joinDate && u.employmentStatus === "재직")
    .map((user) => {
      const joinStr = user.joinDate!.replace(/\./g, "-");
      // 소멸일·부여일수·사용집계 모두 입사일 anniversary 기준 (달력연도 아님)
      const cutoffStr = getLeaveYearCutoff(joinStr, baseDate);
      const expiration = getExpirationDate(joinStr, baseDate);
      const firstStart = subMonths(expiration, 6);
      const secondStart = subMonths(expiration, 2);

      const adjustment = grantedAdjustments
        .filter((g) => g.user_id === user.id && g.year === year)
        .reduce((s, g) => s + (Number(g.days) || 0), 0);
      const granted = getAnnualLeaveGranted(joinStr, year) + adjustment;
      const used = getUsedDays(allRequests, user.id, cutoffStr);
      const remaining = Math.max(0, Math.round((granted - used) * 1000) / 1000);

      const planSubmitted = plannedLeaveRequests.some(
        (r) => r.applicantId === user.id && r.startDate >= cutoffStr
      );

      const inFirst = !isBefore(baseDate, firstStart) && isBefore(baseDate, expiration);
      const inSecond = !isBefore(baseDate, secondStart) && isBefore(baseDate, expiration);

      let autoDesignatedDates: string[] | undefined;
      if (inSecond && remaining > 0 && !planSubmitted) {
        autoDesignatedDates = getUpcomingBusinessDays(remaining, baseDate, expiration);
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
