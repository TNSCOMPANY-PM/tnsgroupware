"use client";

import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
import type { UserRole } from "@/constants/users";
import { DUMMY_USERS } from "@/constants/users";

interface PermissionContextType {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  isCLevel: boolean;
  isTeamLead: boolean;
  currentUserId: string;
  currentUserName: string;
  /** 로그인 사용자 사번 (없으면 null) */
  currentEmpNumber: string | null;
}

const PermissionContext = createContext<PermissionContextType | undefined>(
  undefined
);

/** 역할 전환 시 선택할 대표 사용자 (팀장: 박재민, 사원: 김정섭 밑 김용준, C레벨: 김태정) */
const ROLE_TO_DEFAULT_USER_ID: Record<UserRole, string> = {
  "C레벨": "1",
  팀장: "6",
  사원: "4",
};

function getUserIdForRole(role: UserRole): string {
  return ROLE_TO_DEFAULT_USER_ID[role];
}

interface PermissionProviderProps {
  children: React.ReactNode;
  /** 서버에서 마스터 세션일 때 "C레벨"로 초기화 */
  initialRole?: UserRole;
}

export function PermissionProvider({ children, initialRole }: PermissionProviderProps) {
  const [currentUserId, setCurrentUserId] = useState<string>(() => {
    if (initialRole === "C레벨") return "1";
    return ROLE_TO_DEFAULT_USER_ID["사원"];
  });
  const [currentEmpNumber, setCurrentEmpNumber] = useState<string | null>(null);

  const currentUser = useMemo(
    () => DUMMY_USERS.find((u) => u.id === currentUserId),
    [currentUserId]
  );
  const currentRole: UserRole = currentUser?.role ?? "사원";
  const currentUserName = currentUser?.name ?? "";

  // Supabase 로그인 세션이 있으면, 해당 employees 정보를 기준으로 현재 사용자 자동 매칭
  // UI 권한/표시는 현재 코드가 DUMMY_USERS를 기반으로 하므로 "이름 매칭"으로 연결한다.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/employee")
      .then((r) => r.json())
      .then((emp: { name?: string; emp_number?: string } | null) => {
        if (cancelled) return;
        if (!emp || !emp.name) return;
        const byName = DUMMY_USERS.find((u) => u.name === emp.name);
        if (byName?.id) setCurrentUserId(byName.id);
        setCurrentEmpNumber(typeof emp.emp_number === "string" ? emp.emp_number : null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrentRole = useMemo(
    () => (role: UserRole) => setCurrentUserId(getUserIdForRole(role)),
    []
  );

  const value: PermissionContextType = useMemo(
    () => ({
      currentRole,
      setCurrentRole,
      isCLevel: currentRole === "C레벨",
      isTeamLead: currentRole === "팀장",
      currentUserId,
      currentUserName,
      currentEmpNumber,
    }),
    [currentRole, currentUserId, currentUserName, setCurrentRole, currentEmpNumber]
  );

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error("usePermission must be used within a PermissionProvider");
  }
  return context;
}
