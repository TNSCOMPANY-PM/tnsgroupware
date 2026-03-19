import type { LeaveTypeKey } from "./leaveTypes";

export interface CalendarLeaveEvent {
  id: string;
  userId: string;
  userName: string;
  leaveType: LeaveTypeKey;
  startDate: string;
  endDate: string;
}

/** 전사 연차 캘린더 정적 이벤트 — /api/leave-events 에서 실시간 로드함 */
export const CALENDAR_LEAVE_EVENTS: CalendarLeaveEvent[] = [];
