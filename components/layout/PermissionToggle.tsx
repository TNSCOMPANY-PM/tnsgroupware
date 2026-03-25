"use client";

import { Shield, Users, User } from "lucide-react";
import { usePermission } from "@/contexts/PermissionContext";
import type { UserRole } from "@/constants/users";
import { cn } from "@/lib/utils";

const roleConfig: Record<
  UserRole,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  "C레벨": { label: "C레벨", icon: Shield },
  팀장: { label: "팀장", icon: Users },
  사원: { label: "사원", icon: User },
};

export function PermissionToggle() {
  const { currentRole, isMaster, setRoleOverride } = usePermission();

  const isDev = process.env.NODE_ENV !== "production";
  if (!isDev && !isMaster) return null;

  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-1 transition-all duration-200 ease-in-out">
      {(Object.entries(roleConfig) as [UserRole, (typeof roleConfig)[UserRole]][]).map(
        ([role, { label, icon: Icon }]) => (
          <button
            key={role}
            type="button"
            onClick={() => setRoleOverride(role)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              currentRole === role
                ? "bg-white text-[var(--foreground)] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        )
      )}
    </div>
  );
}
