/**
 * C레벨 모니터링: 번아웃 리스크, 마일스톤 부재 리스크
 */

import { subDays } from "date-fns";
import type { LeaveRequest } from "@/constants/leave";
import type { User } from "@/constants/users";
import type { CalendarLeaveEvent } from "@/constants/leaveSchedule";
import type { RoadmapMilestone } from "@/constants/roadmap";
import { ROADMAP_MILESTONES } from "@/constants/roadmap";
import { parseISO, isWithinInterval } from "date-fns";

export interface BurnoutRiskUser {
  userId: string;
  userName: string;
  department: string;
  /** 마지막 연차 사용일 (없으면 null) */
  lastLeaveDate: string | null;
  /** 90일 연속 미사용 여부 */
  noLeaveIn90Days: boolean;
}

export interface MilestoneRisk {
  milestone: RoadmapMilestone;
  /** 겹치는 휴가 예정 핵심 인원 */
  overlappingLeaves: {
    userId: string;
    userName: string;
    role: string;
    leaveStart: string;
    leaveEnd: string;
  }[];
}

/** 승인된 연차 휴가만 (annual, half_am, half_pm 등 일수 차감되는 휴가) */
const COUNT_AS_LEAVE_TYPES = [
  "annual",
  "half_am",
  "half_pm",
  "quarter_am",
  "quarter_pm",
  "hourly",
];

/**
 * 최근 90일간 연차를 하루도 사용하지 않은 직원 추출
 */
export function getBurnoutRiskUsers(
  users: User[],
  leaveRequests: LeaveRequest[],
  calendarEvents: CalendarLeaveEvent[]
): BurnoutRiskUser[] {
  const cutoff = subDays(new Date(), 90);
  const result: BurnoutRiskUser[] = [];

  for (const user of users) {
    if (user.employmentStatus !== "재직" || !user.joinDate) continue;
    if (user.role === "C레벨") continue; // C레벨 제외 (선택)

    const approvedLeaves = leaveRequests.filter(
      (r) =>
        r.applicantId === user.id &&
        r.status === "승인_완료" &&
        COUNT_AS_LEAVE_TYPES.includes(r.leaveType)
    );
    const calendarLeaves = calendarEvents.filter(
      (e) => e.userId === user.id && COUNT_AS_LEAVE_TYPES.includes(e.leaveType)
    );

    const allLeaveDays: string[] = [];
    for (const r of approvedLeaves) {
      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      let d = new Date(start);
      while (d <= end) {
        allLeaveDays.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
      }
    }
    for (const e of calendarLeaves) {
      const start = new Date(e.startDate);
      const end = new Date(e.endDate);
      let d = new Date(start);
      while (d <= end) {
        allLeaveDays.push(d.toISOString().slice(0, 10));
        d.setDate(d.getDate() + 1);
      }
    }
    const uniqueDays = [...new Set(allLeaveDays)];
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const recentDays = uniqueDays.filter(
      (d) => new Date(d) >= cutoff && new Date(d) <= todayEnd
    );
    const lastLeaveDate =
      uniqueDays.length > 0
        ? uniqueDays.sort()[uniqueDays.length - 1]
        : null;
    const noLeaveIn90Days = recentDays.length === 0;

    if (noLeaveIn90Days) {
      result.push({
        userId: user.id,
        userName: user.name,
        department: user.displayDepartment ?? user.department,
        lastLeaveDate,
        noLeaveIn90Days: true,
      });
    }
  }

  return result;
}

/**
 * 로드맵/캠페인 기간과 핵심 인원 휴가가 겹치는 리스크
 */
export function getMilestoneRisks(
  leaveRequests: LeaveRequest[],
  calendarEvents: CalendarLeaveEvent[],
  users: User[]
): MilestoneRisk[] {
  const risks: MilestoneRisk[] = [];

  for (const m of ROADMAP_MILESTONES) {
    const mStart = parseISO(m.startDate);
    const mEnd = parseISO(m.endDate);

    const overlapping: MilestoneRisk["overlappingLeaves"] = [];

    for (const pid of m.keyPersonIds) {
      const user = users.find((u) => u.id === pid);
      if (user?.role === "C레벨") continue;
      const reqs = leaveRequests.filter(
        (r) => r.applicantId === pid && r.status === "승인_완료"
      );
      const evts = calendarEvents.filter((e) => e.userId === pid);

      for (const r of reqs) {
        const lStart = parseISO(r.startDate);
        const lEnd = parseISO(r.endDate);
        if (
          isWithinInterval(lStart, { start: mStart, end: mEnd }) ||
          isWithinInterval(lEnd, { start: mStart, end: mEnd }) ||
          (lStart <= mStart && lEnd >= mEnd)
        ) {
          overlapping.push({
            userId: r.applicantId,
            userName: r.applicantName,
            role: user?.role ?? "직원",
            leaveStart: r.startDate,
            leaveEnd: r.endDate,
          });
        }
      }
      for (const e of evts) {
        const lStart = parseISO(e.startDate);
        const lEnd = parseISO(e.endDate);
        if (
          isWithinInterval(lStart, { start: mStart, end: mEnd }) ||
          isWithinInterval(lEnd, { start: mStart, end: mEnd }) ||
          (lStart <= mStart && lEnd >= mEnd)
        ) {
          const existing = overlapping.find((o) => o.userId === pid);
          if (!existing) {
            overlapping.push({
              userId: e.userId,
              userName: e.userName,
              role: user?.role ?? "직원",
              leaveStart: e.startDate,
              leaveEnd: e.endDate,
            });
          }
        }
      }
    }

    if (overlapping.length > 0) {
      risks.push({ milestone: m, overlappingLeaves: overlapping });
    }
  }

  return risks;
}
