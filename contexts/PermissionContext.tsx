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
}

const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

interface PermissionProviderProps {
  children: React.ReactNode;
  initialRole?: UserRole;
}

export function PermissionProvider({ children }: PermissionProviderProps) {
  const [employee, setEmployee] = useState<EmployeeProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/employee")
      .then((r) => r.json())
      .then((emp: EmployeeProfile | null) => {
        if (cancelled || !emp?.id) return;
        setEmployee(emp);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const currentRole: UserRole =
    employee?.role === "C레벨" ? "C레벨"
    : employee?.role === "팀장" ? "팀장"
    : "사원";

  const value: PermissionContextType = useMemo(() => ({
    currentRole,
    isCLevel: currentRole === "C레벨",
    isTeamLead: currentRole === "팀장",
    currentUserId: employee?.id ?? "",
    currentUserName: employee?.name ?? "",
    currentEmpNumber: employee?.emp_number ?? null,
    currentEmployee: employee,
  }), [currentRole, employee]);

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
