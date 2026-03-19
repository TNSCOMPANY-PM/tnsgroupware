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
import { DUMMY_USERS } from "@/constants/users";
import { getBurnoutRiskUsers } from "@/utils/leaveMonitoring";
import {
  DASHBOARD_ANNOUNCEMENTS,
  LUNCH_MENUS,
} from "@/constants/dashboard";
import { parseDashboardFinance, type FinanceCurrentJson } from "@/lib/financeCurrent";
import {
  computeDashboardLedgerSummary,
  loadLedgerCustom,
  loadLedgerEdits,
  loadLedgerHidden,
  type FinanceRowForLedger,
  type LedgerRowForSummary,
} from "@/lib/dashboardLedgerSummary";
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
  seedDefaultsIfEmpty,
  type DashboardAnnouncement,
} from "@/lib/dashboardAnnouncementStorage";

// leave_requests는 useEffect에서 API로 로드 (하드코딩 제거)

const defaultAnnouncements: DashboardAnnouncement[] = DASHBOARD_ANNOUNCEMENTS.map(
  (a) => ({
    id: a.id,
    title: a.title,
    date: a.date,
    isImportant: a.isImportant,
    body: undefined,
    authorId: undefined,
    authorName: undefined,
  })
);

export default function DashboardPage() {
  const [lunchResult, setLunchResult] = useState<string | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<DashboardAnnouncement[]>(defaultAnnouncements);
  const [announceWriteOpen, setAnnounceWriteOpen] = useState(false);
  const [announceEditId, setAnnounceEditId] = useState<string | null>(null);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [announceImportant, setAnnounceImportant] = useState(false);
  const [horoscopeCheckedPeriod, setHoroscopeCheckedPeriod] = useState<string | null>(null);
  const [financeData, setFinanceData] = useState<FinanceCurrentJson | null>(null);
  const [financeRows, setFinanceRows] = useState<FinanceRowForLedger[]>([]);
  const [ledgerFromApi, setLedgerFromApi] = useState<LedgerRowForSummary[]>([]);
  const { currentUserId, currentUserName, isCLevel, isTeamLead } = usePermission();
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const { plannedLeaveRequests, addPlannedLeave } = usePlannedLeaves();

  // 통합 원장과 동일: DB + 엑셀(ledgerEntries) + 수동 원장 + ledger API → 당월 PAID만 집계
  const dashboardFinance = useMemo(() => {
    const monthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const fromExcel = financeData?.ledgerEntries;
    const ledgerSource: LedgerRowForSummary[] =
      fromExcel && fromExcel.length > 0
        ? fromExcel.map((e) => ({
            id: e.id,
            date: e.date,
            amount: e.amount,
            type: e.type,
            status: e.status,
          }))
        : ledgerFromApi;
    const custom = loadLedgerCustom();
    const edits = loadLedgerEdits();
    const hidden = loadLedgerHidden();
    const summary = computeDashboardLedgerSummary(
      financeRows,
      ledgerSource,
      custom,
      edits,
      hidden,
      monthKey
    );
    if (
      summary.monthlyRevenue > 0 ||
      summary.monthlyGrossProfit !== 0 ||
      summary.survivalBalance !== 0
    ) {
      return summary;
    }
    return parseDashboardFinance(financeData);
  }, [financeData, financeRows, ledgerFromApi]);

  useEffect(() => {
    seedDefaultsIfEmpty(DASHBOARD_ANNOUNCEMENTS)
      .then(() => getAnnouncements())
      .then((list) => setAnnouncements(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/finance-current.json")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setFinanceData(d as FinanceCurrentJson | null))
      .catch(() => setFinanceData(null));
  }, []);

  // 통합 원장과 동일 소스: DB finance + ledger API
  useEffect(() => {
    Promise.all([
      fetch("/api/finance").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/transactions/ledger").then((r) => (r.ok ? r.json() : { ledger: [] })),
    ])
      .then(([rows, ledgerRes]) => {
        setFinanceRows(Array.isArray(rows) ? rows : []);
        const list = Array.isArray(ledgerRes?.ledger) ? ledgerRes.ledger : [];
        setLedgerFromApi(
          list.map((r: { id: string; date?: string; amount: number; type: string; status: string }) => ({
            id: r.id,
            date: r.date ?? "",
            amount: Number(r.amount) || 0,
            type: r.type === "WITHDRAWAL" ? "WITHDRAWAL" : "DEPOSIT",
            status: r.status === "PAID" ? "PAID" : "UNMAPPED",
          }))
        );
      })
      .catch(() => {
        setFinanceRows([]);
        setLedgerFromApi([]);
      });
  }, []);

  useEffect(() => {
    setHoroscopeCheckedPeriod(getStoredHoroscopePeriod());
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

  // 실제 휴가 데이터 로드 (번아웃 리스크 · 연차 촉진 계산용)
  useEffect(() => {
    fetch("/api/leaves")
      .then((r) => r.ok ? r.json() : [])
      .then((rows: unknown[]) => {
        if (!Array.isArray(rows)) return;
        setLeaveRequests(
          rows.map((row) => {
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
      })
      .catch(() => setLeaveRequests([]));
  }, []);

  const now = new Date();
  const horoscopePeriodStart = getHoroscopePeriodStart(now);
  const canCheckHoroscope = now.getHours() >= 9;
  const showHoroscope = horoscopeCheckedPeriod === horoscopePeriodStart;

  const revealHoroscope = () => {
    setStoredHoroscopePeriod(horoscopePeriodStart);
    setHoroscopeCheckedPeriod(horoscopePeriodStart);
  };

  const statuses = useMemo(
    () => computePromotionStatus(DUMMY_USERS, leaveRequests, plannedLeaveRequests, new Date()),
    [leaveRequests, plannedLeaveRequests]
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

  const burnoutRisks = useMemo(
    () => getBurnoutRiskUsers(DUMMY_USERS, leaveRequests, []),
    [leaveRequests]
  );

  const currentUser = useMemo(
    () => DUMMY_USERS.find((u) => u.id === currentUserId),
    [currentUserId]
  );
  const horoscopeUser = useMemo(
    () => ({
      name: currentUser?.name ?? "게스트",
      // 생년월일·성별은 프로필 DB 미연동 상태 — 이름 기반 시드로 개인화
      birthdate: currentUserId ? `${1985 + (parseInt(currentUserId, 10) % 15)}-${String((parseInt(currentUserId, 10) % 12) + 1).padStart(2, "0")}-15` : "1990-01-01",
      gender: "남",
    }),
    [currentUser?.name, currentUserId]
  );
  const fortune = useMemo(
    () => generateDailyHoroscope(horoscopeUser, todayStr),
    [horoscopeUser, todayStr]
  );

  const handlePlanSubmit = (selectedDates: Date[]) => {
    if (!myStatus) return;
    const user = DUMMY_USERS.find((u) => u.id === currentUserId);
    if (!user) return;
    const sorted = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
    const startDate = format(sorted[0]!, "yyyy-MM-dd");
    const endDate = format(sorted[sorted.length - 1]!, "yyyy-MM-dd");
    const req: LeaveRequest = {
      id: `planned-${Date.now()}`,
      applicantId: currentUserId,
      applicantName: user.name,
      applicantDepartment: user.department,
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

        {/* [1.5] 2026 분기별 로드맵 달성 현황 (간트 에픽 연동) */}
        <div className="col-span-12">
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
            {isCLevel && (
              <button
                type="button"
                onClick={openAnnounceWrite}
                className="shrink-0 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]"
              >
                <Plus className="size-3.5 mr-1 inline" />
                새 글 쓰기
              </button>
            )}
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
            {burnoutRisks.length > 0 && (
              <div className="rounded-2xl bg-red-50 px-3 py-2">
                <p className="text-xs font-medium text-red-600">
                  🚨 번아웃 위험군 알림
                </p>
                <p className="mt-0.5 text-xs text-red-600">
                  최근 90일간 연차 0일 사용: {burnoutRisks.map((u) => u.userName).join(", ")}
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
        userName={DUMMY_USERS.find((u) => u.id === currentUserId)?.name ?? ""}
        department={DUMMY_USERS.find((u) => u.id === currentUserId)?.department ?? ""}
        onSubmit={handlePlanSubmit}
      />

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
