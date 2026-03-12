"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnnualLeavePromotionWidgetProps {
  remainingDays: number;
  expirationDate: string;
  inSecondPromotion?: boolean;
  autoDesignatedDates?: string[];
  onClick: () => void;
  className?: string;
}

export function AnnualLeavePromotionWidget({
  remainingDays,
  expirationDate,
  inSecondPromotion,
  autoDesignatedDates,
  onClick,
  className,
}: AnnualLeavePromotionWidgetProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-2xl border-2 border-amber-200/80 bg-amber-50/60 p-5 text-left backdrop-blur-xl transition-all duration-300",
        "shadow-[0_0_24px_rgba(245,158,11,0.15)] hover:border-amber-300/90 hover:bg-amber-50/80 hover:shadow-[0_0_32px_rgba(245,158,11,0.2)] hover:-translate-y-0.5",
        "active:scale-[0.99]",
        className
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-200/60">
          <AlertTriangle className="size-6 text-amber-700" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-amber-900">
            연차 사용 촉진 안내
          </h3>
          <p className="mt-1 text-sm font-medium text-amber-800/90">
            근로기준법 제61조에 따라 연차 유급휴가 사용 촉진이 진행됩니다.
          </p>
          <p className="mt-2 text-sm text-amber-700">
            잔여 <span className="font-bold">{remainingDays}일</span>의 연차가{" "}
            <span className="font-bold">{expirationDate}</span>에 소멸됩니다.
            미사용 시 수당이 지급되지 않으니 반드시 사용 계획을 제출해 주세요.
          </p>
          {inSecondPromotion && autoDesignatedDates && autoDesignatedDates.length > 0 && (
            <p className="mt-2 text-sm font-medium text-amber-800">
              시스템이 자동으로 {autoDesignatedDates.length}일의 휴가를 배정했습니다.
              계획서 제출이 필요합니다.
            </p>
          )}
          <p className="mt-3 text-xs font-medium text-amber-600">
            클릭하여 연차 사용 계획서 제출
          </p>
        </div>
      </div>
    </button>
  );
}
