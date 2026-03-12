import type { LeaveTypeKey } from "./leaveTypes";

export interface CalendarLeaveEvent {
  id: string;
  userId: string;
  userName: string;
  leaveType: LeaveTypeKey;
  startDate: string;
  endDate: string;
}

/** 전사 연차 캘린더용 더미 일정 (승인된 휴가) */
export const CALENDAR_LEAVE_EVENTS: CalendarLeaveEvent[] = [
  { id: "cal-1", userId: "6", userName: "박재민", leaveType: "annual", startDate: "2026-03-05", endDate: "2026-03-06" },
  { id: "cal-2", userId: "3", userName: "김동균", leaveType: "half_am", startDate: "2026-03-10", endDate: "2026-03-10" },
  { id: "cal-3", userId: "1", userName: "김태정", leaveType: "military", startDate: "2026-03-12", endDate: "2026-03-12" },
  { id: "cal-4", userId: "4", userName: "김용준", leaveType: "annual", startDate: "2026-03-16", endDate: "2026-03-17" },
  { id: "cal-5", userId: "7", userName: "심규성", leaveType: "condolence_extended", startDate: "2026-03-20", endDate: "2026-03-22" },
  { id: "cal-6", userId: "2", userName: "한혜경", leaveType: "marriage_self", startDate: "2026-03-25", endDate: "2026-03-27" },
  { id: "cal-7", userId: "5", userName: "김정섭", leaveType: "half_pm", startDate: "2026-03-10", endDate: "2026-03-10" },
];
