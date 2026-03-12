"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import type { UserRole } from "@/constants/users";

interface PermissionContextType {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  isCLevel: boolean;
  isTeamLead: boolean;
  currentUserId: string;
  currentUserName: string;
}

const PermissionContext = createContext<PermissionContextType | undefined>(
  undefined
);

const ROLE_TO_USER: Record<UserRole, { id: string; name: string }> = {
  사원: { id: "6", name: "박재민" },
  팀장: { id: "6", name: "박재민" },
  "C레벨": { id: "1", name: "김태정" },
};

interface PermissionProviderProps {
  children: React.ReactNode;
  /** 서버에서 마스터 세션일 때 "C레벨"로 초기화 */
  initialRole?: UserRole;
}

export function PermissionProvider({ children, initialRole }: PermissionProviderProps) {
  const [currentRole, setCurrentRole] = useState<UserRole>(initialRole ?? "사원");
  const { id: currentUserId, name: currentUserName } =
    ROLE_TO_USER[currentRole];

  const value: PermissionContextType = useMemo(
    () => ({
      currentRole,
      setCurrentRole,
      isCLevel: currentRole === "C레벨",
      isTeamLead: currentRole === "팀장",
      currentUserId,
      currentUserName,
    }),
    [currentRole, currentUserId, currentUserName]
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
