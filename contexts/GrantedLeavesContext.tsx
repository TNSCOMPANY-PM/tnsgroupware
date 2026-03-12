"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";

const STORAGE_KEY = "groupware-hr-granted-leave";

export type GrantLeaveType = "포상 휴가" | "대체 휴무" | "연차 개수 조정" | "기타";

export interface GrantedLeaveRecord {
  id: string;
  userId: string;
  userName: string;
  year: number;
  days: number;
  type: GrantLeaveType;
  reason?: string;
  grantedAt: string;
}

function loadGrantedLeaves(): GrantedLeaveRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const parsed = JSON.parse(s) as GrantedLeaveRecord[];
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch {}
  return [];
}

interface GrantedLeavesContextType {
  grantedLeaves: GrantedLeaveRecord[];
  addGrantedLeave: (record: Omit<GrantedLeaveRecord, "id" | "grantedAt">) => void;
  getGrantedDaysForUser: (userId: string, year: number) => number;
}

const GrantedLeavesContext = createContext<GrantedLeavesContextType | undefined>(undefined);

export function GrantedLeavesProvider({ children }: { children: React.ReactNode }) {
  const [grantedLeaves, setGrantedLeaves] = useState<GrantedLeaveRecord[]>(loadGrantedLeaves);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(grantedLeaves));
    } catch {}
  }, [grantedLeaves]);

  const addGrantedLeave = useCallback(
    (record: Omit<GrantedLeaveRecord, "id" | "grantedAt">) => {
      const newRecord: GrantedLeaveRecord = {
        ...record,
        id: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        grantedAt: new Date().toISOString(),
      };
      setGrantedLeaves((prev) => [newRecord, ...prev]);
    },
    []
  );

  const getGrantedDaysForUser = useCallback(
    (userId: string, year: number) => {
      return grantedLeaves
        .filter((r) => r.userId === userId && r.year === year)
        .reduce((sum, r) => sum + r.days, 0);
    },
    [grantedLeaves]
  );

  const value = useMemo(
    () => ({ grantedLeaves, addGrantedLeave, getGrantedDaysForUser }),
    [grantedLeaves, addGrantedLeave, getGrantedDaysForUser]
  );

  return (
    <GrantedLeavesContext.Provider value={value}>
      {children}
    </GrantedLeavesContext.Provider>
  );
}

export function useGrantedLeaves() {
  const context = useContext(GrantedLeavesContext);
  if (context === undefined) {
    return {
      grantedLeaves: [] as GrantedLeaveRecord[],
      addGrantedLeave: () => {},
      getGrantedDaysForUser: () => 0,
    };
  }
  return context;
}
