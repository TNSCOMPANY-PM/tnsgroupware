"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";

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

function dbRowToGrantedLeave(row: Record<string, unknown>): GrantedLeaveRecord {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    userName: row.user_name as string,
    year: Number(row.year),
    days: Number(row.days),
    type: row.type as GrantLeaveType,
    reason: (row.reason as string) ?? undefined,
    grantedAt: (row.granted_at as string) ?? new Date().toISOString(),
  };
}

interface GrantedLeavesContextType {
  grantedLeaves: GrantedLeaveRecord[];
  addGrantedLeave: (record: Omit<GrantedLeaveRecord, "id" | "grantedAt">) => void;
  getGrantedDaysForUser: (userId: string, year: number) => number;
}

const GrantedLeavesContext = createContext<GrantedLeavesContextType | undefined>(undefined);

export function GrantedLeavesProvider({ children }: { children: React.ReactNode }) {
  const [grantedLeaves, setGrantedLeaves] = useState<GrantedLeaveRecord[]>([]);

  useEffect(() => {
    fetch("/api/granted-leaves")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: unknown[]) => {
        if (Array.isArray(rows)) {
          setGrantedLeaves(rows.map((r) => dbRowToGrantedLeave(r as Record<string, unknown>)));
        }
      })
      .catch(() => {});
  }, []);

  const addGrantedLeave = useCallback(
    (record: Omit<GrantedLeaveRecord, "id" | "grantedAt">) => {
      const newRecord: GrantedLeaveRecord = {
        ...record,
        id: `grant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        grantedAt: new Date().toISOString(),
      };
      // 낙관적 업데이트
      setGrantedLeaves((prev) => [newRecord, ...prev]);
      // DB 저장 (실패해도 UI는 유지 — 새로고침 시 DB 기준으로 재조회)
      fetch("/api/granted-leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRecord),
      }).catch(() => {});
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
