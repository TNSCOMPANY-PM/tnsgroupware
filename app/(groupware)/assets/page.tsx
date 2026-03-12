"use client";

import { usePermission } from "@/contexts/PermissionContext";
import { AssetSubscriptionDashboard } from "@/components/hr/AssetSubscriptionDashboard";
import { Lock } from "lucide-react";

export default function AssetsPage() {
  const { isCLevel, isTeamLead } = usePermission();
  const canView = isCLevel || isTeamLead;

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--muted)]/20 py-16 text-center">
        <Lock className="mb-4 size-12 text-[var(--muted-foreground)]" />
        <h2 className="text-lg font-semibold text-[var(--foreground)]">접근 권한이 없습니다</h2>
        <p className="mt-2 max-w-sm text-sm text-[var(--muted-foreground)]">
          자산 및 구독 관리 페이지는 C-Level 및 팀장만 열람할 수 있습니다.
        </p>
      </div>
    );
  }

  return <AssetSubscriptionDashboard />;
}
