"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { User, UserRole, EmploymentStatus } from "@/constants/users";
import { getBurnoutRiskUsers } from "@/utils/leaveMonitoring";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import type { Employee } from "@/types/employee";
import { LUNCH_MENUS } from "@/constants/dashboard";
import { generateDailyHoroscope } from "@/utils/generateDailyHoroscope";
import {
  Calendar,
  UtensilsCrossed,
  Sparkles,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";
import { UserTodoWidget } from "@/components/dashboard/UserTodoWidget";
import { format, parseISO, subDays } from "date-fns";
import { ko } from "date-fns/locale";

const HOROSCOPE_STORAGE_KEY = "horoscope-last-checked-period";
function getHoroscopePeriodStart(now: Date): string {
  const hour = now.getHours();
  const date = hour < 8 ? subDays(now, 1) : now;
  return format(date, "yyyy-MM-dd");
}
function getStoredHoroscopePeriod(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(HOROSCOPE_STORAGE_KEY);
}
function setStoredHoroscopePeriod(period: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HOROSCOPE_STORAGE_KEY, period);
}
import { cn } from "@/lib/utils";
import Link from "next/link";
import { formatWonKorean } from "@/utils/formatWon";
import type { LeaveRequest } from "@/constants/leave";
import { usePermission } from "@/contexts/PermissionContext";
import { usePlannedLeaves } from "@/contexts/PlannedLeavesContext";
import { computePromotionStatus } from "@/utils/leavePromotionEngine";
import { AnnualLeavePromotionWidget } from "@/components/leave/AnnualLeavePromotionWidget";
import { AnnualLeavePlanModal } from "@/components/leave/AnnualLeavePlanModal";
import { QuarterlyRoadmapWidget } from "@/components/dashboard/QuarterlyRoadmapWidget";
import {
  getAnnouncements,
  addAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type DashboardAnnouncement,
} from "@/lib/dashboardAnnouncementStorage";

function toUserAdapter(emp: Employee): User {
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


export default function DashboardPage() {
  const [bonusRevealed, setBonusRevealed] = useState(false);
  const [lunchResult, setLunchResult] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<DashboardAnnouncement[]>([]);
  const [announceAllOpen, setAnnounceAllOpen] = useState(false);
  const [announceWriteOpen, setAnnounceWriteOpen] = useState(false);
  const [announceEditId, setAnnounceEditId] = useState<string | null>(null);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceImportant, setAnnounceImportant] = useState(false);
  const [horoscopeCheckedPeriod, setHoroscopeCheckedPeriod] = useState<string | null>(null);
  const [dashboardSummary, setDashboardSummary] = useState<{ monthlyRevenue: number; monthlyGrossProfit: number; survivalBalance: number } | null>(null);
  const { currentUserId, currentUserName, isCLevel, isTeamLead, currentEmployee, currentEmpNumber } = usePermission();
  const { data: employees } = useSupabaseRealtime<Employee>("employees", {});
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [quarterlyBonus, setQuarterlyBonus] = useState<{
    quarter: number; year: number; quarterLabel: string;
    months: { month: string; bonus: number }[];
    total: number; paidInMonth: string; bonusKey: string | null;
  } | null>(null);
  const [teamBonus, setTeamBonus] = useState<{
    quarterLabel: string; paidInMonth: string; totalPayout: number;
    memberList: { key: string; name: string; total: number }[];
  } | null>(null);
  const [teamBonusRevealed, setTeamBonusRevealed] = useState(false);
  const { plannedLeaveRequests, addPlannedLeave } = usePlannedLeaves();

  const dashboardFinance = dashboardSummary ?? { monthlyRevenue: 0, monthlyGrossProfit: 0, survivalBalance: 0 };

  useEffect(() => {
    setHoroscopeCheckedPeriod(getStoredHoroscopePeriod());
    Promise.all([
      fetch("/api/finance/dashboard-summary").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/leaves").then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch("/api/announcements").then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([summary, leavesRows, annRows]) => {
      if (summary) setDashboardSummary(summary as { monthlyRevenue: number; monthlyGrossProfit: number; survivalBalance: number });
      if (Array.isArray(annRows)) {
        setAnnouncements(
          (annRows as Record<string, unknown>[]).map((row) => ({
            id: row.id as string,
            title: row.title as string,
            body: (row.body as string) ?? undefined,
            date: row.date as string,
            isImportant: !!(row.is_important),
            authorId: (row.author_id as string) ?? undefined,
            authorName: (row.author_name as string) ?? undefined,
          }))
        );
      }
      if (Array.isArray(leavesRows)) {
        setLeaveRequests(
          leavesRows.map((row: unknown) => {
            const r = row as Record<string, unknown>;
            return {
              id: r.id as string,
              applicantId: r.applicant_id as string,
              applicantName: r.applicant_name as string,
              applicantDepartment: r.applicant_department as string,
              leaveType: r.leave_type as LeaveRequest["leaveType"],
              startDate: r.start_date as string,
              endDate: r.end_date as string,
              days: Number(r.days),
              reason: (r.reason as string) ?? "",
              status: r.status as LeaveRequest["status"],
              createdAt: (r.created_at as string) ?? new Date().toISOString(),
            };
          })
        );
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isTeamLead && !isCLevel) return;
    fetch("/api/approvals")
      .then((r) => r.ok ? r.json() : [])
      .then((list: { status?: string }[]) => {
        const n = Array.isArray(list) ? list.filter((a) => a.status === "pending").length : 0;
        setPendingApprovalsCount(n);
      })
      .catch(() => setPendingApprovalsCount(0));
  }, [isTeamLead, isCLevel]);

  useEffect(() => {
    if (!currentEmpNumber) return;
    Promise.all([
      fetch(`/api/bonus/quarterly?empNumber=${currentEmpNumber}`).then((r) => r.ok ? r.json() : null).catch(() => null),
      isCLevel ? fetch("/api/bonus/quarterly/team").then((r) => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
    ]).then(([quarterly, team]) => {
      if (quarterly?.bonusKey) setQuarterlyBonus(quarterly);
      if (team) setTeamBonus(team);
    });
  }, [currentEmpNumber, isCLevel]);

  const now = new Date();
  const horoscopePeriodStart = getHoroscopePeriodStart(now);
  const canCheckHoroscope = now.getHours() >= 9;
  const showHoroscope = horoscopeCheckedPeriod === horoscopePeriodStart;

  const revealHoroscope = () => {
    setStoredHoroscopePeriod(horoscopePeriodStart);
    setHoroscopeCheckedPeriod(horoscopePeriodStart);
  };

  const statuses = useMemo(
    () => computePromotionStatus(employees.map(toUserAdapter), leaveRequests, plannedLeaveRequests, new Date()),
    [employees, leaveRequests, plannedLeaveRequests]
  );
  const myStatus = statuses.find((s) => s.userId === currentUserId);
  const showPromotionWidget =
    myStatus &&
    myStatus.remainingDays >= 1 &&
    (myStatus.inFirstPromotion || myStatus.inSecondPromotion) &&
    !myStatus.planSubmitted;

  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  // 오늘 휴가자: 승인 완료된 실제 데이터에서 파생
  const todayLeavers = useMemo(() => {
    const d = parseISO(todayStr);
    return leaveRequests
      .filter((r) => {
        if (r.status !== "승인_완료") return false;
        const start = parseISO(r.startDate);
        const end = parseISO(r.endDate);
        return d >= start && d <= end;
      })
      .map((r) => r.applicantName);
  }, [todayStr, leaveRequests]);

  const isMyselfBurnoutRisk = useMemo(() => {
    if (!currentUserId) return false;
    const risks = getBurnoutRiskUsers(employees.map(toUserAdapter), leaveRequests, []);
    return risks.some((u) => u.userId === currentUserId);
  }, [employees, leaveRequests, currentUserId]);

  const horoscopeUser = useMemo(
    () => ({
      name: currentEmployee?.name ?? "게스트",
      // 생년월일·성별은 프로필 DB 미연동 상태 — 이름 기반 시드로 개인화
      birthdate: currentUserId ? `${1985 + (currentUserId.charCodeAt(0) % 15)}-${String((currentUserId.charCodeAt(0) % 12) + 1).padStart(2, "0")}-15` : "1990-01-01",
      gender: "남",
    }),
    [currentEmployee?.name, currentUserId]
  );
  const fortune = useMemo(
    () => generateDailyHoroscope(horoscopeUser, todayStr),
    [horoscopeUser, todayStr]
  );

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

  const spinLunch = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    setLunchResult(null);
    const duration = 1500;
    const interval = 80;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      setLunchResult(LUNCH_MENUS[Math.floor(Math.random() * LUNCH_MENUS.length)] ?? "");
      if (elapsed >= duration) {
        clearInterval(timer);
        setLunchResult(LUNCH_MENUS[Math.floor(Math.random() * LUNCH_MENUS.length)] ?? "");
        setIsSpinning(false);
      }
    }, interval);
  };

  const openAnnounceWrite = () => {
    setAnnounceTitle("");
    setAnnounceBody("");
    setAnnounceImportant(false);
    setAnnounceEditId(null);
    setAnnounceWriteOpen(true);
  };

  const openAnnounceEdit = (ann: DashboardAnnouncement) => {
    setAnnounceTitle(ann.title ?? "");
    setAnnounceBody(ann.body ?? "");
    setAnnounceImportant(!!ann.isImportant);
    setAnnounceEditId(ann.id);
    setAnnounceWriteOpen(true);
  };

  const handleAnnounceDelete = async (id: string) => {
    if (!confirm("이 공지사항을 삭제할까요?")) return;
    await deleteAnnouncement(id);
    setAnnouncements(await getAnnouncements());
  };

  const submitAnnounceWrite = async () => {
    const title = announceTitle.trim();
    if (!title) return;
    if (announceEditId) {
      await updateAnnouncement(announceEditId, {
        title,
        body: announceBody.trim() || undefined,
        isImportant: announceImportant,
      });
    } else {
      await addAnnouncement({
        title,
        body: announceBody.trim() || undefined,
        date: format(new Date(), "yyyy-MM-dd"),
        isImportant: announceImportant,
        authorId: currentUserId,
        authorName: currentUserName,
      });
    }
    setAnnouncements(await getAnnouncements());
    setAnnounceWriteOpen(false);
    setAnnounceEditId(null);
  };

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="relative z-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tighter text-slate-900">
          TNS 대시보드
        </h1>
        <p className="mt-1 text-sm font-medium text-slate-800">
          오늘의 업무 현황을 한눈에 확인하세요
        </p>
      </div>

      {/* 연차 사용 촉진 안내 (1차/2차 촉진 대상자 대시보드 최상단) */}
      {showPromotionWidget && (
        <div className="mb-6">
          <AnnualLeavePromotionWidget
            remainingDays={myStatus!.remainingDays}
            expirationDate={myStatus!.expirationDate}
            inSecondPromotion={myStatus!.inSecondPromotion}
            autoDesignatedDates={myStatus!.autoDesignatedDates}
            onClick={() => setPlanModalOpen(true)}
          />
        </div>
      )}

      {/* 12-Col Grid Layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-6 lg:gap-8">
        {/* [1] 상단: C레벨 재무 요약 (3개 거대 카드) */}
        <Card className="relative z-10 rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] col-span-12 md:col-span-6 lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="fluid-label text-slate-800">
              당월 총 매출액
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold tracking-tighter text-slate-900">
              {formatWonKorean(dashboardFinance.monthlyRevenue)}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-700">
              부가세 10% 포함 실거래금액 기준
            </p>
          </CardContent>
        </Card>

        <Card className="relative z-10 rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] col-span-12 md:col-span-6 lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="fluid-label text-slate-800">
              당월 매출총이익
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold tracking-tighter text-blue-600">
              {formatWonKorean(dashboardFinance.monthlyGrossProfit)}
            </p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "relative z-10 rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] col-span-12 md:col-span-6 lg:col-span-4",
            dashboardFinance.survivalBalance < 0 && "border-red-200/40 bg-red-50/80"
          )}
        >
          <CardHeader className="pb-2">
            <CardTitle className="fluid-label text-slate-800">
              생존 통장 예상 잔고
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                "text-3xl font-extrabold tracking-tighter",
                dashboardFinance.survivalBalance >= 0
                  ? "text-blue-600"
                  : "text-red-600"
              )}
            >
              {formatWonKorean(dashboardFinance.survivalBalance)}
            </p>
            <p className="mt-1 text-xs text-slate-700">
              부가세 10% 포함 실거래금액 기준으로 계산됨
            </p>
          </CardContent>
        </Card>

        {/* [1.5] 이번 분기 개인 성과급 */}
        {quarterlyBonus && quarterlyBonus.bonusKey && (
          <div className="col-span-12 md:col-span-6 lg:col-span-4 relative z-10 flex flex-col">
            <div className="relative overflow-hidden rounded-2xl p-[1.5px] h-full shadow-[0_8px_32px_rgba(16,185,129,0.18)] hover:shadow-[0_16px_48px_rgba(16,185,129,0.30)] transition-all duration-500 ease-out hover:-translate-y-1">
              {/* 그라디언트 테두리 */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-400 to-cyan-400 opacity-80" />
              {/* 카드 본체 */}
              <div className="relative h-full rounded-[14px] bg-gradient-to-br from-[#0f2820] via-[#0d3b2b] to-[#0a1f18] px-5 py-5 overflow-hidden flex flex-col">
                {/* 배경 글로우 */}
                <div className="pointer-events-none absolute -right-8 -top-8 size-48 rounded-full bg-emerald-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-6 -left-6 size-36 rounded-full bg-teal-400/8 blur-2xl" />

                {/* 헤더 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-400/40">
                      <span className="text-sm">💰</span>
                    </div>
                    <span className="text-[11px] font-semibold tracking-wide text-emerald-300/80 uppercase">
                      예상 성과급
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
                    {quarterlyBonus.quarterLabel}
                  </span>
                </div>

                {/* 금액 + 월별 바 — 누르는 동안만 공개 */}
                <div className={cn("mb-3 transition-all duration-200 select-none", !bonusRevealed && "blur-sm pointer-events-none")}>
                  <p className="text-[11px] text-emerald-400/60 mb-0.5">이번 분기 누적</p>
                  <p className="text-4xl font-black tracking-tighter text-white leading-none">
                    {formatWonKorean(quarterlyBonus.total)}
                  </p>
                  {quarterlyBonus.total === 0 && (
                    <p className="mt-1 text-xs text-emerald-400/50">이번 달 실적 집계 후 반영됩니다</p>
                  )}
                </div>

                <div className={cn("space-y-1.5 mb-3 transition-all duration-200 select-none", !bonusRevealed && "blur-sm pointer-events-none")}>
                  {quarterlyBonus.months.map((m) => {
                    const label = m.month.slice(5, 7).replace(/^0/, "") + "월";
                    const maxBonus = Math.max(...quarterlyBonus.months.map((x) => x.bonus), 1);
                    const pct = Math.round((m.bonus / maxBonus) * 100);
                    return (
                      <div key={m.month} className="flex items-center gap-2">
                        <span className="w-6 shrink-0 text-[10px] font-medium text-emerald-400/70 tabular-nums">{label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className={cn(
                          "w-16 shrink-0 text-right text-[10px] font-semibold tabular-nums",
                          m.bonus > 0 ? "text-emerald-300" : "text-white/20"
                        )}>
                          +{formatWonKorean(m.bonus)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 지급 안내 + 공개 버튼 */}
                <div className="mt-auto flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-[10px] text-emerald-400/60">
                    {quarterlyBonus.paidInMonth.slice(5, 7).replace(/^0/, "")}월 월급에 포함 지급 예정
                  </span>
                  <button
                    onMouseDown={() => setBonusRevealed(true)}
                    onMouseUp={() => setBonusRevealed(false)}
                    onMouseLeave={() => setBonusRevealed(false)}
                    onTouchStart={() => setBonusRevealed(true)}
                    onTouchEnd={() => setBonusRevealed(false)}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-all duration-150",
                      bonusRevealed
                        ? "bg-emerald-400/30 text-emerald-200 scale-95"
                        : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                    )}
                  >
                    {bonusRevealed ? "확인 중" : "👁 확인"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* [1.55] C레벨 전용: 분기 성과급 지급 예상액 */}
        {isCLevel && teamBonus && (
          <div className="col-span-12 relative z-10">
            <div className="relative overflow-hidden rounded-2xl p-[1.5px] shadow-[0_8px_32px_rgba(99,102,241,0.15)] hover:shadow-[0_16px_48px_rgba(99,102,241,0.25)] transition-all duration-500 ease-out hover:-translate-y-0.5">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-400 via-violet-400 to-purple-400 opacity-70" />
              <div className="relative rounded-[14px] bg-gradient-to-br from-[#12103a] via-[#1a1560] to-[#0f0d2e] px-5 py-4 overflow-hidden">
                <div className="pointer-events-none absolute -right-10 -top-10 size-52 rounded-full bg-indigo-500/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-8 -left-8 size-40 rounded-full bg-violet-400/8 blur-2xl" />

                {/* 헤더 */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-full bg-indigo-500/20 ring-1 ring-indigo-400/40">
                      <span className="text-sm">🏦</span>
                    </div>
                    <span className="text-[11px] font-semibold tracking-wide text-indigo-300/80 uppercase">
                      분기 성과급 지급 예상액
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-300 ring-1 ring-indigo-400/20">
                      {teamBonus.quarterLabel}
                    </span>
                    <button
                      onMouseDown={() => setTeamBonusRevealed(true)}
                      onMouseUp={() => setTeamBonusRevealed(false)}
                      onMouseLeave={() => setTeamBonusRevealed(false)}
                      onTouchStart={() => setTeamBonusRevealed(true)}
                      onTouchEnd={() => setTeamBonusRevealed(false)}
                      className={cn(
                        "shrink-0 rounded-md px-2.5 py-1 text-[10px] font-semibold transition-all duration-150",
                        teamBonusRevealed
                          ? "bg-indigo-400/30 text-indigo-200 scale-95"
                          : "bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30"
                      )}
                    >
                      {teamBonusRevealed ? "확인 중" : "👁 확인"}
                    </button>
                  </div>
                </div>

                <div className={cn("transition-all duration-200 select-none", !teamBonusRevealed && "blur-sm pointer-events-none")}>
                  <div className="flex flex-wrap items-end gap-6 mb-4">
                    <div>
                      <p className="text-[10px] text-indigo-400/60 mb-0.5">전체 지급 예상액</p>
                      <p className="text-3xl font-black tracking-tighter text-white leading-none">
                        {formatWonKorean(teamBonus.totalPayout)}
                      </p>
                    </div>
                    <p className="text-[10px] text-indigo-400/50 pb-1">
                      {teamBonus.paidInMonth.slice(5, 7).replace(/^0/, "")}월 월급에 포함 지급 예정
                    </p>
                  </div>

                  {/* 멤버별 지급액 */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {teamBonus.memberList.map((m) => (
                      <div key={m.key} className="rounded-lg bg-white/5 ring-1 ring-white/10 px-3 py-2.5">
                        <p className="text-[10px] font-medium text-indigo-300/70 mb-0.5">{m.name}</p>
                        <p className={cn(
                          "text-sm font-bold tabular-nums",
                          m.total > 0 ? "text-white" : "text-white/25"
                        )}>
                          {m.total > 0 ? formatWonKorean(m.total) : "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* [1.6] 2026 분기별 로드맵 달성 현황 (간트 에픽 연동) */}
        <div className={cn(quarterlyBonus && quarterlyBonus.bonusKey ? "col-span-12 md:col-span-6 lg:col-span-8" : "col-span-12", "relative z-10 flex flex-col transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] rounded-2xl")}>
          <QuarterlyRoadmapWidget />
        </div>

        {/* [2] Row 2 - Core Work: 좌측 할 일 & 프로젝트, 우측 공지사항 */}
        <Card className="relative z-10 rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] col-span-12 lg:col-span-8">
          <CardContent className="pt-5 pb-5">
            {(isTeamLead || isCLevel) && pendingApprovalsCount > 0 && (
              <Link
                href="/approvals"
                className="mb-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-left transition-colors hover:bg-amber-100/80"
              >
                <span className="text-sm font-medium text-amber-800">
                  결재 대기 <span className="font-bold tabular-nums">{pendingApprovalsCount}</span>건이 있습니다
                </span>
                <span className="text-xs text-amber-600">전자결재에서 결재하기 →</span>
              </Link>
            )}
            <UserTodoWidget userId={currentUserId} />
          </CardContent>
        </Card>

        {/* [3] C레벨 공지사항 */}
        <Card className="relative z-10 rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] col-span-12 lg:col-span-4">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              📢 공지사항
            </CardTitle>
            <div className="flex shrink-0 items-center gap-2">
              {announcements.length > 4 && (
                <button
                  type="button"
                  onClick={() => setAnnounceAllOpen(true)}
                  className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  전체 보기 ({announcements.length})
                </button>
              )}
              {isCLevel && (
                <button
                  type="button"
                  onClick={openAnnounceWrite}
                  className="rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]"
                >
                  <Plus className="size-3.5 mr-1 inline" />
                  새 글 쓰기
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {announcements.slice(0, 4).map((ann) => (
                <li
                  key={ann.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgb(0,0,0,0.04)]",
                    ann.isImportant
                      ? "bg-gradient-to-r from-indigo-50/80 to-violet-50/50"
                      : "hover:bg-slate-50/60"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm text-slate-800",
                        ann.isImportant && "font-bold"
                      )}
                    >
                      {ann.title}
                    </p>
                    {ann.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                        {ann.body}
                      </p>
                    )}
                    {ann.isImportant && (
                      <span className="mt-1 inline-block rounded-full border border-indigo-200/60 bg-indigo-50/80 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        📌 필독
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-400">
                      {format(parseISO(ann.date), "M/d")}
                    </span>
                    {isCLevel && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openAnnounceEdit(ann)}
                          className="rounded-md border border-slate-200 bg-white/70 p-1 text-slate-600 hover:bg-white"
                          aria-label="공지 수정"
                          title="수정"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnnounceDelete(ann.id)}
                          className="rounded-md border border-rose-200 bg-white/70 p-1 text-rose-600 hover:bg-white"
                          aria-label="공지 삭제"
                          title="삭제"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* [4] Row 3 - HR & Utility: HR/휴가자, 점심 메뉴, 오늘의 운세 */}
        <Card className="relative z-10 rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] col-span-12 md:col-span-4 lg:col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Calendar className="size-5" />
              HR & 오늘의 휴가자
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-slate-800">
                오늘의 휴가자
              </p>
              {todayLeavers.length > 0 ? (
                <p className="mt-1 text-sm text-slate-900">
                  {todayLeavers.join(", ")}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-700">
                  휴가자 없음
                </p>
              )}
            </div>
            {isMyselfBurnoutRisk && (
              <div className="rounded-2xl bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-600">
                  🚨 번아웃 위험
                </p>
                <p className="mt-0.5 text-xs text-red-500">
                  최근 90일간 연차를 사용하지 않았습니다. 휴식이 필요합니다.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="relative z-10 flex min-h-[280px] flex-col overflow-hidden rounded-2xl bg-white/80 backdrop-blur-2xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] col-span-12 md:col-span-4 lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2.5 text-slate-900">
              <span className="flex size-9 items-center justify-center rounded-xl bg-amber-100 text-lg" aria-hidden>
                🎲
              </span>
              <UtensilsCrossed className="size-5 text-amber-500" />
              <span>점심 메뉴 추천기</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-[200px] flex-1 flex-col">
            <button
              type="button"
              onClick={spinLunch}
              disabled={isSpinning}
              className={cn(
                "group relative flex flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl py-8 text-center transition-all duration-300 ease-out",
                "border-2 border-dashed border-amber-200/90 bg-gradient-to-b from-amber-50/80 to-orange-50/50",
                "hover:border-amber-300 hover:from-amber-50 hover:to-orange-50 hover:shadow-[0_8px_24px_rgba(251,191,36,0.15)]",
                "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-90",
                isSpinning && "animate-pulse border-amber-300"
              )}
            >
              {lunchResult ? (
                <span className="inline-flex flex-col items-center gap-3">
                  <span className="inline-flex items-center gap-2">
                    <span className="text-amber-500 opacity-80" aria-hidden>✨</span>
                    <span className="text-2xl font-bold tracking-tight text-amber-800">
                      {lunchResult}
                    </span>
                    <span className="text-amber-500 opacity-80" aria-hidden>✨</span>
                  </span>
                  <span className="flex flex-wrap justify-center gap-2 text-xl opacity-70" aria-hidden>
                    {["🍱", "🍜", "🥗", "🍲", "🥢", "🍽️", "🥡"].map((emoji, i) => (
                      <span key={i}>{emoji}</span>
                    ))}
                  </span>
                </span>
              ) : (
                <span className="flex flex-col items-center gap-3">
                  <span className="text-base font-medium text-amber-700/90 group-hover:text-amber-800">
                    {isSpinning ? "골라주는 중…" : "오늘 뭐 먹지?"}
                  </span>
                  <span className="flex flex-wrap justify-center gap-2 text-2xl opacity-60" aria-hidden>
                    {["🍱", "🍜", "🥗", "🍲", "🥢", "🍽️", "🥡"].map((emoji, i) => (
                      <span key={i}>{emoji}</span>
                    ))}
                  </span>
                </span>
              )}
            </button>
            {lunchResult && (
              <p className="mt-3 text-center text-xs text-slate-500">
                다시 누르면 다른 메뉴를 추천해요
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="relative z-10 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/80 shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.12)] col-span-12 md:col-span-4 lg:col-span-4">
          <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <span className="text-lg">🌙</span>
              <Sparkles className="size-5" />
              오늘의 운세
            </CardTitle>
            <span className="shrink-0 text-xs font-medium text-slate-500">
              {format(today, "M/d (EEE)", { locale: ko })}
            </span>
          </CardHeader>
          <CardContent className="space-y-4">
            {showHoroscope ? (
              <>
                <p className="text-sm leading-relaxed text-indigo-600 font-medium">
                  {fortune.totalFortune}
                </p>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">재물운</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={cn(
                            "text-sm",
                            n <= fortune.wealthLuck ? "text-amber-400" : "text-slate-200"
                          )}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-400/90 transition-all duration-500"
                      style={{ width: `${(fortune.wealthLuck / 5) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-600">업무운</span>
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={cn(
                            "text-sm",
                            n <= fortune.workLuck ? "text-indigo-400" : "text-slate-200"
                          )}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-400/90 transition-all duration-500"
                      style={{ width: `${(fortune.workLuck / 5) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-xs font-medium text-slate-600">로또 추천</span>
                    <span className="inline-flex items-center gap-1">
                      {fortune.lottoNumbers.map((n) => (
                        <span
                          key={n}
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow-md",
                            "ring-2 ring-white/50 ring-offset-1",
                            n <= 9 && "bg-gradient-to-br from-amber-400 to-amber-600 shadow-amber-900/20",
                            n >= 10 && n <= 19 && "bg-gradient-to-br from-blue-400 to-blue-600 shadow-blue-900/20",
                            n >= 20 && n <= 29 && "bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-900/20",
                            n >= 30 && n <= 39 && "bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-900/20",
                            n >= 40 && "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-900/20"
                          )}
                          style={{
                            boxShadow: "inset 0 1px 2px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.2)",
                          }}
                        >
                          {n}
                        </span>
                      ))}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-slate-400 pt-1">다음 리셋: 내일 오전 8시</p>
              </>
            ) : canCheckHoroscope ? (
              <div className="space-y-3 py-2">
                <p className="text-sm text-slate-600">
                  버튼을 누르면 오늘의 운세를 확인할 수 있어요. 24시간 동안 유지됩니다.
                </p>
                <Button
                  type="button"
                  onClick={revealHoroscope}
                  className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-md hover:from-indigo-600 hover:to-violet-600"
                >
                  <Sparkles className="size-4 mr-2" />
                  오늘의 운세 확인하기
                </Button>
                <p className="text-xs text-slate-400">오전 8시에 초기화됩니다</p>
              </div>
            ) : (
              <div className="space-y-2 py-4 text-center">
                <p className="text-sm font-medium text-slate-600">
                  오전 9시부터 확인할 수 있어요
                </p>
                <p className="text-xs text-slate-400">오전 8시에 초기화됩니다</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AnnualLeavePlanModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        remainingDays={myStatus?.remainingDays ?? 0}
        userId={currentUserId}
        userName={currentEmployee?.name ?? ""}
        department={currentEmployee?.department ?? ""}
        onSubmit={handlePlanSubmit}
      />

      {/* 공지사항 전체 보기 모달 */}
      <Dialog open={announceAllOpen} onOpenChange={setAnnounceAllOpen}>
        <DialogContent className="max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>공지사항 전체</DialogTitle>
          </DialogHeader>
          <ul className="space-y-3 py-2">
            {announcements.map((ann) => (
              <li key={ann.id} className={cn("rounded-xl px-4 py-3", ann.isImportant ? "bg-indigo-50/80" : "bg-slate-50/60")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium text-slate-800", ann.isImportant && "font-bold")}>{ann.title}</p>
                    {ann.body && <p className="mt-1 text-xs text-slate-600 whitespace-pre-wrap">{ann.body}</p>}
                    {ann.isImportant && (
                      <span className="mt-1.5 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">📌 필독</span>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-slate-400">{format(parseISO(ann.date), "M/d")}</span>
                    {isCLevel && (
                      <div className="flex gap-1">
                        <button type="button" onClick={() => { setAnnounceAllOpen(false); openAnnounceEdit(ann); }} className="rounded border border-slate-200 bg-white p-1 text-slate-500 hover:bg-slate-50"><Pencil className="size-3" /></button>
                        <button type="button" onClick={async () => { await handleAnnounceDelete(ann.id); }} className="rounded border border-rose-200 bg-white p-1 text-rose-500 hover:bg-rose-50"><Trash2 className="size-3" /></button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      <Dialog
        open={announceWriteOpen}
        onOpenChange={(open) => {
          // 프로덕션에서 권한 오작동 방지 (UI 버튼은 C레벨만 보이지만, state로도 보호)
          if (open && !isCLevel) return;
          setAnnounceWriteOpen(open);
          if (!open) setAnnounceEditId(null);
        }}
      >
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{announceEditId ? "공지사항 수정" : "공지사항 작성"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ann-title">제목</Label>
              <Input
                id="ann-title"
                value={announceTitle}
                onChange={(e) => setAnnounceTitle(e.target.value)}
                placeholder="제목을 입력하세요"
                className="font-medium"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ann-body">내용 (선택)</Label>
              <textarea
                id="ann-body"
                value={announceBody}
                onChange={(e) => setAnnounceBody(e.target.value)}
                placeholder="내용을 입력하세요"
                rows={4}
                className="flex w-full rounded-md border border-[var(--border)] bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={announceImportant}
                onChange={(e) => setAnnounceImportant(e.target.checked)}
                className="size-4 rounded border-[var(--border)]"
              />
              <span className="text-sm font-medium text-slate-700">필독 공지로 표시</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnounceWriteOpen(false)}>
              취소
            </Button>
            <Button onClick={submitAnnounceWrite} disabled={!announceTitle.trim()}>
              {announceEditId ? "저장" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
