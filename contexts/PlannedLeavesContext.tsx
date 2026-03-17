"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import type { CalendarLeaveEvent } from "@/constants/leaveSchedule";
import type { LeaveRequest } from "@/constants/leave";
import { addDays, parseISO, format } from "date-fns";

const PLANNED_LEAVES_STORAGE_KEY = "groupware-hr-planned-leaves";

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

function loadPlannedLeaves(): LeaveRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const s = localStorage.getItem(PLANNED_LEAVES_STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as LeaveRequest[];
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

export function PlannedLeavesProvider({ children }: { children: React.ReactNode }) {
  // 서버/클라이언트 첫 렌더를 동일하게 시작 → hydration mismatch 방지
  const [plannedLeaveRequests, setPlannedLeaveRequests] = useState<LeaveRequest[]>([]);

  useEffect(() => {
    // 클라이언트 마운트 후 localStorage 로드
    setPlannedLeaveRequests(loadPlannedLeaves());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PLANNED_LEAVES_STORAGE_KEY, JSON.stringify(plannedLeaveRequests));
    } catch {}
  }, [plannedLeaveRequests]);

  const plannedEvents = useMemo(() => {
    return plannedLeaveRequests.flatMap((r) =>
      leaveRequestToEvents(r, r.applicantName)
    );
  }, [plannedLeaveRequests]);

  const addPlannedLeave = useCallback((req: LeaveRequest) => {
    if (!req.startDate || !req.endDate || req.startDate > req.endDate || req.days <= 0) return;
    setPlannedLeaveRequests((prev) => [...prev, { ...req }]);
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
