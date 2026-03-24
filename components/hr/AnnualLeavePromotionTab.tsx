"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePermission } from "@/contexts/PermissionContext";
import { usePlannedLeaves } from "@/contexts/PlannedLeavesContext";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { AnnualLeavePromotionWidget } from "@/components/leave/AnnualLeavePromotionWidget";
import { AnnualLeavePlanModal } from "@/components/leave/AnnualLeavePlanModal";
import { computePromotionStatus } from "@/utils/leavePromotionEngine";
import { formatWonKorean } from "@/utils/formatWon";
import { format } from "date-fns";
import { Shield, Check, Clock, DollarSign } from "lucide-react";
import type { LeaveRequest } from "@/constants/leave";
import type { Employee } from "@/types/employee";
import type { User, UserRole, EmploymentStatus } from "@/constants/users";

function employeeToUser(emp: Employee): User {
  return {
    id: emp.id,
    name: emp.name,
    position: emp.position ?? emp.role,
    department: (emp.department === "경영" || emp.department === "마케팅사업부") ? emp.department as "경영" | "마케팅사업부" : "마케팅사업부",
    role: (emp.role === "C레벨" || emp.role === "팀장" || emp.role === "사원") ? emp.role as UserRole : "사원",
    joinDate: emp.hire_date?.replace(/-/g, "."),
    employmentStatus: (emp.employment_status === "재직" || emp.employment_status === "휴직" || emp.employment_status === "퇴직") ? emp.employment_status as EmploymentStatus : "재직",
    email: emp.email ?? undefined,
    phone: emp.phone ?? undefined,
  };
}

const TODAY = new Date(2026, 2, 9);
const AVG_DAILY_WAGE = 180000;

export function AnnualLeavePromotionTab() {
  const { currentUserId, currentEmployee, isCLevel } = usePermission();
  const { plannedLeaveRequests, addPlannedLeave } = usePlannedLeaves();
  const { data: employees } = useSupabaseRealtime<Employee>("employees", {});
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const leaveRequests: LeaveRequest[] = [];
  const statuses = useMemo(
    () =>
      computePromotionStatus(
        employees.map(employeeToUser),
        leaveRequests,
        plannedLeaveRequests,
        TODAY
      ),
    [employees, leaveRequests, plannedLeaveRequests]
  );

  const myStatus = statuses.find((s) => s.userId === currentUserId);
  const showPromotionWidget =
    myStatus &&
    myStatus.remainingDays >= 1 &&
    (myStatus.inFirstPromotion || myStatus.inSecondPromotion) &&
    !myStatus.planSubmitted;

  const handlePlanSubmit = (selectedDates: Date[]) => {
    if (!myStatus || !currentEmployee) return;

    const sorted = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
    const startDate = format(sorted[0]!, "yyyy-MM-dd");
    const endDate = format(sorted[sorted.length - 1]!, "yyyy-MM-dd");

    const req: LeaveRequest = {
      id: `planned-${Date.now()}`,
      applicantId: currentUserId,
      applicantName: currentEmployee.name,
      applicantDepartment: currentEmployee.department,
      leaveType: "annual",
      startDate,
      endDate,
      days: sorted.length,
      reason: "연차 사용 계획 제출",
      status: "PLANNED",
      createdAt: new Date().toISOString(),
    };

    addPlannedLeave(req);
  };

  const totalUnused = statuses.reduce((s, st) => s + st.remainingDays, 0);
  const completedCount = statuses.filter(
    (s) => s.inFirstPromotion || s.inSecondPromotion
  ).filter((s) => s.planSubmitted || s.remainingDays === 0).length;
  const totalInPromotion = statuses.filter(
    (s) => s.inFirstPromotion || s.inSecondPromotion
  ).length;
  const complianceRate =
    totalInPromotion > 0 ? Math.round((completedCount / totalInPromotion) * 100) : 100;

  return (
    <div className="space-y-6">
      {showPromotionWidget && (
        <section>
          <AnnualLeavePromotionWidget
            remainingDays={myStatus!.remainingDays}
            expirationDate={myStatus!.expirationDate}
            inSecondPromotion={myStatus!.inSecondPromotion}
            autoDesignatedDates={myStatus!.autoDesignatedDates}
            onClick={() => setPlanModalOpen(true)}
          />
        </section>
      )}

      {isCLevel && (
        <Card className="overflow-hidden rounded-2xl border-amber-200/60 bg-amber-50/30 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <Shield className="size-5" />
              연차 촉진 현황
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-amber-200/60 bg-white/80 p-4 backdrop-blur-sm">
                <p className="text-sm text-amber-800">전체 미사용 연차 합계</p>
                <p className="mt-1 text-2xl font-bold text-amber-900">
                  {totalUnused}일
                </p>
              </div>
              <div className="rounded-xl border border-amber-200/60 bg-white/80 p-4 backdrop-blur-sm">
                <p className="text-sm text-amber-800">촉진 이행률</p>
                <p className="mt-1 text-2xl font-bold text-amber-900">
                  {complianceRate}%
                </p>
              </div>
              <div className="rounded-xl border-2 border-amber-300/80 bg-amber-100/50 p-4 shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                <p className="flex items-center gap-1 text-sm font-medium text-amber-800">
                  <DollarSign className="size-4" />
                  절감 예상 비용
                </p>
                <p className="mt-1 text-2xl font-bold text-amber-900">
                  {formatWonKorean(Math.round(totalUnused * AVG_DAILY_WAGE))}
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  (미사용 연차 × 평균 일급)
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-amber-900">촉진 완료 직원</h4>
              <div className="flex flex-wrap gap-2">
                {statuses
                  .filter((s) => (s.inFirstPromotion || s.inSecondPromotion) && (s.planSubmitted || s.remainingDays === 0))
                  .map((s) => (
                    <span
                      key={s.userId}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-3 py-1 text-sm font-medium text-emerald-800"
                    >
                      <Check className="size-3.5" />
                      {s.userName}
                    </span>
                  ))}
                {statuses.filter((s) => (s.inFirstPromotion || s.inSecondPromotion) && (s.planSubmitted || s.remainingDays === 0)).length === 0 && (
                  <p className="text-sm text-slate-500">완료 직원 없음</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-amber-900">촉진 미완료 직원</h4>
              <div className="flex flex-wrap gap-2">
                {statuses
                  .filter((s) => (s.inFirstPromotion || s.inSecondPromotion) && !s.planSubmitted && s.remainingDays > 0)
                  .map((s) => (
                    <span
                      key={s.userId}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50/80 px-3 py-1 text-sm font-medium text-amber-800"
                    >
                      <Clock className="size-3.5" />
                      {s.userName} (잔여 {s.remainingDays}일)
                    </span>
                  ))}
                {statuses.filter((s) => (s.inFirstPromotion || s.inSecondPromotion) && !s.planSubmitted && s.remainingDays > 0).length === 0 && (
                  <p className="text-sm text-slate-500">미완료 직원 없음</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!showPromotionWidget && !isCLevel && (
        <Card className="rounded-2xl border-white/80 bg-white/80 p-8 backdrop-blur-xl">
          <p className="text-center text-slate-600">
            현재 연차 촉진 대상이 아닙니다.
          </p>
        </Card>
      )}

      <AnnualLeavePlanModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        remainingDays={myStatus?.remainingDays ?? 0}
        userId={currentUserId}
        userName={currentEmployee?.name ?? ""}
        department={currentEmployee?.department ?? ""}
        onSubmit={handlePlanSubmit}
      />
    </div>
  );
}
