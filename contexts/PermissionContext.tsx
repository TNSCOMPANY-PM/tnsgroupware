"use client";

import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
import type { UserRole } from "@/constants/users";

export interface EmployeeProfile {
  id: string;
  emp_number: string;
  name: string;
  role: string;
  department: string;
  position: string | null;
  position_display: string | null;
  display_department: string | null;
  hire_date: string | null;
  phone: string | null;
  employment_status: string | null;
}

interface PermissionContextType {
  currentRole: UserRole;
  isCLevel: boolean;
  isTeamLead: boolean;
  currentUserId: string;
  currentUserName: string;
  currentEmpNumber: string | null;
  currentEmployee: EmployeeProfile | null;
  isMaster: boolean;
  setRoleOverride: (role: UserRole | null) => void;
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

interface PermissionProviderProps {
  children: React.ReactNode;
  initialRole?: UserRole;
}

export function PermissionProvider({ children }: PermissionProviderProps) {
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [roleOverride, setRoleOverrideState] = useState<UserRole | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/employee")
      .then((r) => r.json())
      .then((emp: EmployeeProfile | null) => {
        if (cancelled) return;
        if (emp?.id) setEmployee(emp);
      })
      .catch(() => {});
    fetch("/api/me/is-master")
      .then((r) => r.json())
      .then((d: { master: boolean }) => { if (!cancelled) setIsMaster(d?.master ?? false); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const dbRole: UserRole =
    employee?.role === "C레벨" ? "C레벨"
    : employee?.role === "팀장" ? "팀장"
    : "사원";

  const currentRole: UserRole = (isMaster && roleOverride) ? roleOverride : dbRole;

  const setRoleOverride = (role: UserRole | null) => {
    if (isMaster) setRoleOverrideState(role);
  };

  const value: PermissionContextType = useMemo(() => ({
    currentRole,
    isCLevel: currentRole === "C레벨",
    isTeamLead: currentRole === "팀장",
    currentUserId: employee?.id ?? "",
    currentUserName: employee?.name ?? "",
    currentEmpNumber: employee?.emp_number ?? null,
    currentEmployee: employee,
    isMaster,
    setRoleOverride,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [currentRole, employee, isMaster]);

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
