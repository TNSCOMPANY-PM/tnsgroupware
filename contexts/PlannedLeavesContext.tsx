"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import type { CalendarLeaveEvent } from "@/constants/leaveSchedule";
import type { LeaveRequest } from "@/constants/leave";
import { addDays, parseISO, format } from "date-fns";

interface PlannedLeavesContextType {
  plannedEvents: CalendarLeaveEvent[];
  plannedLeaveRequests: LeaveRequest[];
  addPlannedLeave: (req: LeaveRequest) => void;
}

const PlannedLeavesContext = createContext<PlannedLeavesContextType | undefined>(undefined);

function leaveRequestToEvents(req: LeaveRequest, userName: string): CalendarLeaveEvent[] {
  const events: CalendarLeaveEvent[] = [];
  const start = parseISO(req.startDate);
  const end = parseISO(req.endDate);
  let d = new Date(start);
  while (d <= end) {
    events.push({
      id: `planned-${req.id}-${format(d, "yyyy-MM-dd")}`,
      userId: req.applicantId,
      userName,
      leaveType: req.leaveType,
      startDate: format(d, "yyyy-MM-dd"),
      endDate: format(d, "yyyy-MM-dd"),
    });
    d = addDays(d, 1);
  }
  return events;
}

function dbRowToLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id: row.id as string,
    applicantId: row.applicant_id as string,
    applicantName: row.applicant_name as string,
    applicantDepartment: row.applicant_department as string,
    leaveType: row.leave_type as LeaveRequest["leaveType"],
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    days: Number(row.days),
    reason: (row.reason as string) ?? "",
    status: "PLANNED",
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

export function PlannedLeavesProvider({ children }: { children: React.ReactNode }) {
  const [plannedLeaveRequests, setPlannedLeaveRequests] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    fetch("/api/planned-leaves")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: unknown[]) => {
        if (Array.isArray(rows)) {
          setPlannedLeaveRequests(rows.map((r) => dbRowToLeaveRequest(r as Record<string, unknown>)));
        }
      })
      .catch(() => {});
  }, []);

  const plannedEvents = useMemo(() => {
    return plannedLeaveRequests.flatMap((r) =>
      leaveRequestToEvents(r, r.applicantName)
    );
  }, [plannedLeaveRequests]);

  const addPlannedLeave = useCallback((req: LeaveRequest) => {
    if (!req.startDate || !req.endDate || req.startDate > req.endDate || req.days <= 0) return;
    // 낙관적 업데이트
    setPlannedLeaveRequests((prev) => [...prev, { ...req }]);
    // DB 저장
    fetch("/api/planned-leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: req.id,
        applicantId: req.applicantId,
        applicantName: req.applicantName,
        applicantDepartment: req.applicantDepartment,
        leaveType: req.leaveType,
        startDate: req.startDate,
        endDate: req.endDate,
        days: req.days,
        reason: req.reason,
      }),
    }).catch(() => {});
  }, []);

  return (
    <PlannedLeavesContext.Provider value={{ plannedEvents, plannedLeaveRequests, addPlannedLeave }}>
      {children}
    </PlannedLeavesContext.Provider>
  );
}

export function usePlannedLeaves() {
  const context = useContext(PlannedLeavesContext);
  if (context === undefined) {
    return {
      plannedEvents: [],
      plannedLeaveRequests: [],
      addPlannedLeave: () => {},
    };
  }
  return context;
}
