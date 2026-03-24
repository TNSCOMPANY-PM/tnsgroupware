"use client";

import "react-day-picker/style.css";
import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DUMMY_USERS } from "@/constants/users";
import {
  getApprovalSteps,
  getLeaveTypeDisplayName,
  type LeaveRequest,
  type ApprovalStatus,
} from "@/constants/leave";
import {
  LEAVE_TYPE_CARDS,
  getRequiresProof,
  type LeaveTypeKey,
} from "@/constants/leaveTypes";
import { usePermission } from "@/contexts/PermissionContext";
import { useRealtimeToast } from "@/contexts/RealtimeToastContext";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { usePlannedLeaves } from "@/contexts/PlannedLeavesContext";
import {
  getAnnualLeaveGranted,
  getAnnualLeaveRemainingAllowMinus,
  countBusinessDaysExcludingHolidays,
  getEndDateForBusinessDays,
} from "@/utils/leaveCalculator";
import {
  getBurnoutRiskUsers,
  getMilestoneRisks,
} from "@/utils/leaveMonitoring";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Clock,
  Leaf,
  Loader2,
  MoreVertical,
  Paperclip,
  FileText,
  Trash2,
  XCircle,
} from "lucide-react";
import { useGrantedLeaves, type GrantLeaveType } from "@/contexts/GrantedLeavesContext";
import { RangeDragDayPicker } from "@/components/hr/RangeDragDayPicker";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { CompanyLeaveCalendar } from "@/components/hr/CompanyLeaveCalendar";
import { AnnualLeavePlanModal } from "@/components/leave/AnnualLeavePlanModal";

/** DB row(snake_case) → LeaveRequest(camelCase) 변환 */
function dbRowToLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id: row.id as string,
    applicantId: row.applicant_id as string,
    applicantName: row.applicant_name as string,
    applicantDepartment: row.applicant_department as string,
    leaveType: row.leave_type as LeaveTypeKey,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    days: Number(row.days),
    reason: (row.reason as string) ?? "",
    status: row.status as ApprovalStatus,
    teamLeadApprovedAt: (row.team_lead_approved_at as string) ?? undefined,
    cLevelApprovedAt: (row.c_level_approved_at as string) ?? undefined,
    rejectedAt: (row.rejected_at as string) ?? undefined,
    rejectReason: (row.reject_reason as string) ?? undefined,
    requiresProof: (row.requires_proof as boolean) ?? undefined,
    proofStatus: (row.proof_status as "pending" | "submitted") ?? undefined,
    proofFileName: (row.proof_file_name as string) ?? undefined,
    proofUploadedAt: (row.proof_uploaded_at as string) ?? undefined,
    autoApproved: (row.auto_approved as boolean) ?? undefined,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

const DEFAULT_LEAVE_REQUESTS: LeaveRequest[] = [
  {
    id: "1",
    applicantId: "6",
    applicantName: "박재민",
    applicantDepartment: "마케팅사업부",
    leaveType: "annual",
    startDate: "2025-03-15",
    endDate: "2025-03-16",
    days: 2,
    reason: "개인 사정",
    status: "C레벨_최종_승인_대기",
    teamLeadApprovedAt: "2025-03-10T10:00:00",
    createdAt: "2025-03-10T09:00:00",
  },
  {
    id: "2",
    applicantId: "7",
    applicantName: "심규성",
    applicantDepartment: "마케팅사업부",
    leaveType: "annual",
    startDate: "2025-03-20",
    endDate: "2025-03-20",
    days: 1,
    reason: "병원 진료",
    status: "팀장_1차_승인_대기",
    createdAt: "2025-03-09T14:00:00",
  },
  {
    id: "3",
    applicantId: "7",
    applicantName: "심규성",
    applicantDepartment: "마케팅사업부",
    leaveType: "annual",
    startDate: "2026-01-23",
    endDate: "2026-01-23",
    days: 1,
    reason: "개인",
    status: "승인_완료",
    cLevelApprovedAt: "2026-01-20T10:00:00",
    createdAt: "2026-01-15T09:00:00",
  },
  {
    id: "4",
    applicantId: "6",
    applicantName: "박재민",
    applicantDepartment: "마케팅사업부",
    leaveType: "military",
    startDate: "2026-03-10",
    endDate: "2026-03-10",
    days: 1,
    reason: "예비군 훈련",
    status: "승인_완료",
    cLevelApprovedAt: "2026-03-08T10:00:00",
    createdAt: "2026-03-05T09:00:00",
    requiresProof: true,
    proofStatus: "pending",
  },
];

const ANNUAL_LEAVE_TYPES: LeaveTypeKey[] = [
  "annual",
  "half_am",
  "half_pm",
  "quarter_am",
  "quarter_pm",
  "hourly",
];

const LEAVE_SUB_TABS = [
  { value: "overview", label: "휴가 개요" },
  { value: "detail", label: "연차 상세" },
  { value: "plan", label: "연차 사용 계획" },
] as const;

const GRANT_LEAVE_TYPES: { value: GrantLeaveType; label: string }[] = [
  { value: "포상 휴가", label: "포상 휴가" },
  { value: "대체 휴무", label: "대체 휴무" },
  { value: "연차 개수 조정", label: "연차 개수 조정" },
  { value: "기타", label: "기타" },
];

function GrantLeaveModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (message: string) => void;
}) {
  const { addGrantedLeave } = useGrantedLeaves();
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [type, setType] = useState<GrantLeaveType>("포상 휴가");
  const [days, setDays] = useState<string>("1");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setUserId("");
      setType("포상 휴가");
      setDays("1");
      setReason("");
    }
  }, [open]);

  const handleSubmit = () => {
    const numDays = Number(days);
    if (Number.isNaN(numDays)) return;
    const user = DUMMY_USERS.find((u) => u.id === userId);
    if (!user) return;
    setLoading(true);
    setTimeout(() => {
      const year = new Date().getFullYear();
      addGrantedLeave({
        userId,
        userName: user.name,
        year,
        days: numDays,
        type,
        reason: reason.trim() || undefined,
      });
      const message =
        numDays > 0
          ? `✅ ${user.name} 님에게 ${type} ${numDays}일이 부여되었습니다.`
          : `✅ ${user.name} 님 연차가 ${numDays}일 차감되었습니다.`;
      onSuccess(message);
      setLoading(false);
      onOpenChange(false);
    }, 600);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[600px] border-white/60 bg-white/90 backdrop-blur-xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.08)] font-[var(--font-pretendard)]"
        showCloseButton={true}
      >
        <DialogHeader>
          <DialogTitle className="font-[var(--font-pretendard)]">
            직원 휴가/연차 수동 부여
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 font-[var(--font-pretendard)]">
          <div className="grid gap-2">
            <Label>대상자 선택</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger>
                <SelectValue placeholder="사원 선택" />
              </SelectTrigger>
              <SelectContent>
                {DUMMY_USERS.filter((u) => u.role !== "C레벨").map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.department})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>부여 타입</Label>
            <Select value={type} onValueChange={(v) => setType(v as GrantLeaveType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRANT_LEAVE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>부여 일수</Label>
            <Input
              type="number"
              step={0.5}
              min={-365}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="1 또는 0.5 (반차)"
            />
            <p className="text-xs text-[var(--muted-foreground)]">
              반차는 0.5일로 입력하세요. 마이너스(-)를 입력하면 연차를 차감(조정)합니다.
            </p>
          </div>
          <div className="grid gap-2">
            <Label>사유 (선택 사항)</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder='예: 2월 더널리 프로젝트 마감 고생하셨습니다!'
              rows={3}
              className="flex w-full rounded-lg border border-[var(--border)] bg-white/80 px-3 py-2 text-sm placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]/20"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || !userId || Number.isNaN(Number(days))}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                부여 중…
              </>
            ) : (
              "부여하기"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeavePlanTab({ currentUserId }: { currentUserId: string }) {
  const { plannedLeaveRequests, addPlannedLeave } = usePlannedLeaves();
  const { getGrantedDaysForUser } = useGrantedLeaves();
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const currentUser = DUMMY_USERS.find((u) => u.id === currentUserId);
  const joinDateStr = currentUser?.joinDate ?? "";
  const filterYear = new Date().getFullYear();

  const [storedLeaveRequests, setStoredLeaveRequests] = useState<LeaveRequest[]>([]);
  useEffect(() => {
    fetch("/api/leaves")
      .then((r) => r.json())
      .then((rows) => {
        if (Array.isArray(rows)) setStoredLeaveRequests(rows.map(dbRowToLeaveRequest));
      })
      .catch(() => {});
  }, []);

  const myApprovedDays = storedLeaveRequests
    .filter(
      (r) =>
        r.applicantId === currentUserId &&
        (r.status === "승인_완료" || r.status === "CANCEL_REQUESTED") &&
        ANNUAL_LEAVE_TYPES.includes(r.leaveType) &&
        r.startDate.startsWith(String(filterYear))
    )
    .reduce((s, r) => s + r.days, 0);
  const grantedDays = getGrantedDaysForUser(currentUserId, filterYear);
  const remainingDays =
    (joinDateStr
      ? getAnnualLeaveRemainingAllowMinus(joinDateStr, filterYear, myApprovedDays)
      : Math.max(0, 15 - myApprovedDays)) + grantedDays;

  const myPlans = plannedLeaveRequests.filter((r) => r.applicantId === currentUserId);

  const handlePlanSubmit = (selectedDates: Date[]) => {
    if (!currentUser || selectedDates.length === 0) return;
    const sorted = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
    const startDate = format(sorted[0]!, "yyyy-MM-dd");
    const endDate = format(sorted[sorted.length - 1]!, "yyyy-MM-dd");
    const req: LeaveRequest = {
      id: `planned-${Date.now()}`,
      applicantId: currentUserId,
      applicantName: currentUser.name,
      applicantDepartment: currentUser.department,
      leaveType: "annual",
      startDate,
      endDate,
      days: sorted.length,
      reason: "연차 사용 계획 제출",
      status: "PLANNED",
      createdAt: new Date().toISOString(),
    };
    addPlannedLeave(req);
    setPlanModalOpen(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>연차 사용 계획</CardTitle>
        <CardDescription>
          잔여 연차 사용 계획을 제출하면 수당 미지급 시 참고됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            잔여 연차 <span className="font-semibold text-slate-800">{remainingDays}일</span>
          </p>
          <Button onClick={() => setPlanModalOpen(true)}>연차 사용 계획 제출</Button>
        </div>
        {myPlans.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-700">제출한 계획</h4>
            <ul className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              {myPlans.map((r) => (
                <li key={r.id} className="flex justify-between text-sm">
                  <span className="text-slate-700">
                    {r.startDate.replace(/-/g, ".")}
                    {r.startDate !== r.endDate ? ` ~ ${r.endDate.replace(/-/g, ".")}` : ""}
                  </span>
                  <span className="text-slate-500">{r.days}일</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      <AnnualLeavePlanModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        remainingDays={Math.max(1, remainingDays)}
        userId={currentUserId}
        userName={currentUser?.name ?? ""}
        department={currentUser?.department ?? ""}
        onSubmit={handlePlanSubmit}
      />
    </Card>
  );
}

export function LeaveTab({ initialDate }: { initialDate?: string }) {
  const { currentRole, isCLevel, isTeamLead, currentUserId, currentUserName } = usePermission();
  const { showRealtimeToast } = useRealtimeToast() ?? {};
  useSupabaseRealtime("leaves", { onRealtime: showRealtimeToast });
  const [subTab, setSubTab] = useState("overview");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">내 휴가</h2>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList className="inline-flex h-10 w-auto gap-0 rounded-lg bg-[var(--muted)] p-1">
          {LEAVE_SUB_TABS.map(({ value, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-md px-4 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <LeaveOverviewTab
            currentRole={currentRole}
            isCLevel={isCLevel}
            isTeamLead={isTeamLead}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            initialDate={initialDate}
          />
        </TabsContent>

        <TabsContent value="detail" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>연차 상세</CardTitle>
              <CardDescription>연차 발생 및 사용 내역 (추후 구현)</CardDescription>
            </CardHeader>
            <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              연차 상세 탭
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plan" className="mt-6">
          <LeavePlanTab currentUserId={currentUserId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LeaveOverviewTab({
  currentRole,
  isCLevel,
  isTeamLead,
  currentUserId,
  currentUserName,
  initialDate,
}: {
  currentRole: string;
  isCLevel: boolean;
  isTeamLead: boolean;
  currentUserId: string;
  currentUserName: string;
  initialDate?: string;
}) {
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const fetchLeaves = useCallback(async () => {
    try {
      const res = await fetch("/api/leaves");
      if (!res.ok) return;
      const rows = await res.json();
      if (Array.isArray(rows)) setLeaveRequests(rows.map(dbRowToLeaveRequest));
    } catch {}
  }, []);
  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);
  const [modalOpen, setModalOpen] = useState(() => !!initialDate);
  const [selectedLeaveType, setSelectedLeaveType] = useState<LeaveTypeKey | null>(
    null
  );
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [includeRejected, setIncludeRejected] = useState(false);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [cancelConfirm, setCancelConfirm] = useState<{
    id: string;
    type: "immediate" | "request";
  } | null>(null);
  const [grantModalOpen, setGrantModalOpen] = useState(false);
  const [grantToast, setGrantToast] = useState<string | null>(null);

  const { getGrantedDaysForUser } = useGrantedLeaves();
  const currentUser = DUMMY_USERS.find((u) => u.id === currentUserId);
  const joinDateStr = currentUser?.joinDate ?? "";

  const annualGranted = joinDateStr
    ? getAnnualLeaveGranted(joinDateStr, filterYear)
    : 15;
  const myApprovedDays = leaveRequests
    .filter(
      (r) =>
        r.applicantId === currentUserId &&
        (r.status === "승인_완료" || r.status === "CANCEL_REQUESTED") &&
        ANNUAL_LEAVE_TYPES.includes(r.leaveType) &&
        r.startDate.startsWith(String(filterYear))
    )
    .reduce((s, r) => s + r.days, 0);
  const grantedDays = getGrantedDaysForUser(currentUserId, filterYear);
  /** 마이너스 연차 허용 (당겨 쓰기 가능) + C레벨 특별 부여분 */
  const annualRemaining =
    (joinDateStr
      ? getAnnualLeaveRemainingAllowMinus(joinDateStr, filterYear, myApprovedDays)
      : annualGranted - myApprovedDays) + grantedDays;

  const myRequests = leaveRequests.filter((r) => r.applicantId === currentUserId);
  const filteredRecords = useMemo(() => {
    let list = myRequests.filter((r) =>
      r.startDate.startsWith(String(filterYear))
    );
    if (!includeRejected) {
      list = list.filter((r) => r.status !== "반려");
    }
    list = list.filter((r) => r.status !== "CANCELED");
    return list.sort(
      (a, b) =>
        new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
  }, [myRequests, filterYear, includeRejected]);

  const pendingForApproval = leaveRequests.filter((r) => {
    if (isCLevel) return r.status === "C레벨_최종_승인_대기";
    if (isTeamLead) return r.status === "팀장_1차_승인_대기";
    return false;
  });

  const pendingCancelApproval = leaveRequests.filter((r) => r.status === "CANCEL_REQUESTED");

  const handleCardClick = (key: LeaveTypeKey) => {
    setSelectedLeaveType(key);
    setModalOpen(true);
  };

  const handleSubmit = useCallback(async (form: {
    leaveType: LeaveTypeKey;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
  }) => {
    if (!currentUser) return;
    if (form.startDate > form.endDate) return;
    const card = LEAVE_TYPE_CARDS.find((c) => c.key === form.leaveType);
    if (card?.fixedDays != null && form.days > card.fixedDays) return;
    const applicant = DUMMY_USERS.find((u) => u.id === currentUserId);
    const requiresProof = getRequiresProof(form.leaveType);
    const status =
      currentRole === "사원"
        ? "팀장_1차_승인_대기"
        : currentRole === "팀장"
          ? "C레벨_최종_승인_대기"
          : "승인_완료";
    await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicantId: currentUserId,
        applicantName: currentUserName || applicant?.name || "사용자",
        applicantDepartment: applicant?.department ?? "마케팅사업부",
        leaveType: form.leaveType,
        startDate: form.startDate,
        endDate: form.endDate,
        days: form.days,
        reason: form.reason,
        status,
        requiresProof: requiresProof || undefined,
      }),
    });
    await fetchLeaves();
    setModalOpen(false);
    setSelectedLeaveType(null);
  }, [currentUser, currentUserId, currentUserName, currentRole, fetchLeaves]);

  const handleApprove = useCallback(async (id: string) => {
    const req = leaveRequests.find((r) => r.id === id);
    if (!req) return;
    const now = new Date().toISOString();
    let body: Record<string, string> = {};
    if (req.status === "팀장_1차_승인_대기") {
      body = { status: "C레벨_최종_승인_대기", teamLeadApprovedAt: now };
    } else if (req.status === "C레벨_최종_승인_대기") {
      body = { status: "승인_완료", cLevelApprovedAt: now };
    }
    if (!body.status) return;
    await fetch(`/api/leaves/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    fetchLeaves();
  }, [leaveRequests, fetchLeaves]);

  const handleReject = useCallback(async (id: string) => {
    await fetch(`/api/leaves/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "반려", rejectedAt: new Date().toISOString() }),
    });
    fetchLeaves();
  }, [fetchLeaves]);

  const isPending = (s: ApprovalStatus) =>
    s === "팀장_1차_승인_대기" || s === "C레벨_최종_승인_대기";

  const handleCancel = useCallback(async (id: string) => {
    const req = leaveRequests.find((r) => r.id === id);
    if (!req || req.applicantId !== currentUserId) return;
    if (isPending(req.status)) {
      setRemovingIds((prev) => new Set(prev).add(id));
      await fetch(`/api/leaves/${id}`, { method: "DELETE" });
      setTimeout(() => {
        setRemovingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        fetchLeaves();
      }, 300);
    }
  }, [leaveRequests, currentUserId, fetchLeaves]);

  const handleCancelConfirm = () => {
    if (!cancelConfirm) return;
    if (cancelConfirm.type === "immediate") {
      handleCancel(cancelConfirm.id);
    } else {
      handleCancelRequest(cancelConfirm.id);
    }
    setCancelConfirm(null);
  };

  const handleCancelRequest = useCallback(async (id: string) => {
    const req = leaveRequests.find((r) => r.id === id);
    if (!req || req.applicantId !== currentUserId) return;
    if (req.status !== "승인_완료") return;
    await fetch(`/api/leaves/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCEL_REQUESTED" }),
    });
    fetchLeaves();
  }, [leaveRequests, currentUserId, fetchLeaves]);

  const handleApproveCancel = useCallback(async (id: string) => {
    setRemovingIds((prev) => new Set(prev).add(id));
    await fetch(`/api/leaves/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELED" }),
    });
    setTimeout(() => {
      setRemovingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      fetchLeaves();
    }, 300);
  }, [fetchLeaves]);

  const burnoutRisks = useMemo(
    () =>
      isCLevel
        ? getBurnoutRiskUsers(DUMMY_USERS, leaveRequests, [])
        : [],
    [isCLevel, leaveRequests]
  );
  const milestoneRisks = useMemo(
    () =>
      isCLevel
        ? getMilestoneRisks(leaveRequests, [], DUMMY_USERS)
        : [],
    [isCLevel, leaveRequests]
  );

  useEffect(() => {
    if (grantToast) {
      const t = setTimeout(() => setGrantToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [grantToast]);

  return (
    <div className="space-y-8 font-[var(--font-pretendard)]">
      {/* 휴가 현황판 헤더 + C레벨 전용 특별 휴가 부여 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-bold text-[var(--foreground)]">휴가 현황</h3>
        {isCLevel && (
          <Button
            onClick={() => setGrantModalOpen(true)}
            className="bg-slate-800 text-white shadow-md hover:bg-slate-700 font-[var(--font-pretendard)]"
          >
            🎁 특별 휴가 부여
          </Button>
        )}
      </div>

      {/* 전사 연차 캘린더 */}
      <section>
        <CompanyLeaveCalendar />
      </section>

      {/* C레벨 전용: 번아웃 리스크 경고 (캘린더 아래) */}
      {isCLevel && burnoutRisks.length > 0 && (
        <div className="rounded-2xl border border-red-200/40 bg-red-50/80 backdrop-blur-xl p-4">
          <h3 className="font-semibold text-red-600">90일 연차 미사용자 번아웃 경고</h3>
          <p className="mt-1 text-sm text-red-600/90">
            최근 90일간 연차를 하루도 사용하지 않은 직원입니다. 휴가 사용을 권장해 주세요.
          </p>
          <ul className="mt-3 space-y-2">
            {burnoutRisks.map((u) => (
              <li
                key={u.userId}
                className="rounded-full bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 ring-1 ring-red-200/60"
              >
                {u.userName} ({u.department})
                {u.lastLeaveDate && (
                  <span className="ml-2 text-red-500">
                    · 마지막 휴가: {u.lastLeaveDate}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* C레벨 전용: 마일스톤 부재 리스크 (캘린더 아래) */}
      {isCLevel && milestoneRisks.length > 0 && (
        <div className="rounded-2xl border border-amber-200/40 bg-amber-50/80 backdrop-blur-xl p-4">
          <h3 className="font-semibold text-amber-700">마일스톤 부재 리스크</h3>
          <p className="mt-1 text-sm text-amber-600/90">
            팀별 로드맵 일정과 핵심 인원의 휴가가 겹칩니다. 업무 배분에 참고하세요.
          </p>
          <ul className="mt-3 space-y-2">
            {milestoneRisks.map((r) => (
              <li key={r.milestone.id} className="text-sm">
                <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-amber-800">
                  {r.milestone.name} {r.milestone.startDate} ~ {r.milestone.endDate}
                </span>
                <ul className="mt-2 space-y-1">
                  {r.overlappingLeaves.map((o) => (
                    <li key={`${o.userId}-${o.leaveStart}-${o.leaveEnd}`} className="rounded-lg bg-amber-50/80 px-3 py-1.5 text-amber-700">
                      {o.userName} {o.role} · {o.leaveStart} ~ {o.leaveEnd}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 휴가 등록 — C레벨 제외 */}
      {!isCLevel && <section>
        <h3 className="mb-4 text-lg font-bold text-[var(--foreground)]">
          휴가 등록
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {LEAVE_TYPE_CARDS.map((card) => {
            const Icon = card.icon;
            const displayDays =
              card.key === "annual"
                ? `${annualRemaining >= 0 ? "" : "-"}${Math.abs(annualRemaining)}일`
                : card.fixedDays != null
                  ? `${card.fixedDays}일`
                  : card.description;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => handleCardClick(card.key)}
                className="interactive-card flex flex-col items-center gap-3 rounded-xl glass-card p-6 text-left"
              >
                <div className="flex size-12 items-center justify-center rounded-full bg-[var(--muted)]">
                  <Icon className="size-6 text-[var(--muted-foreground)]" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-[var(--foreground)]">
                    {card.label}
                  </p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {displayDays}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>}

      {/* 사용한 기록 — C레벨 제외 */}
      {!isCLevel && <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-lg font-bold text-[var(--foreground)]">
            사용한 기록
            <span className="ml-2 font-normal text-[var(--muted-foreground)]">
              지난 휴가 {filteredRecords.length}
            </span>
          </h3>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeRejected}
                onChange={(e) => setIncludeRejected(e.target.checked)}
                className="h-4 w-4 rounded border-[var(--border)]"
              />
              반려 기록 포함
            </label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setFilterYear((y) => y - 1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="min-w-[80px] text-center text-sm font-medium">
                {filterYear}년
              </span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => setFilterYear((y) => y + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl glass-card overflow-hidden">
          {filteredRecords.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--muted-foreground)]">
              사용한 기록이 없습니다.
            </div>
          ) : (
            filteredRecords.map((req) => (
              <LeaveRecordRow
                key={req.id}
                request={req}
                isRemoving={removingIds.has(req.id)}
                onCancelClick={(id, type) => setCancelConfirm({ id, type })}
                onProofUpload={(id, fileName) => {
                  fetch(`/api/leaves/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      proofStatus: "submitted",
                      proofFileName: fileName,
                      proofUploadedAt: new Date().toISOString(),
                    }),
                  }).then(() => fetchLeaves()).catch(() => {});
                }}
                onProofDelete={(id) => {
                  fetch(`/api/leaves/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      proofStatus: "pending",
                      proofFileName: null,
                      proofUploadedAt: null,
                    }),
                  }).then(() => fetchLeaves()).catch(() => {});
                }}
                currentRole={currentRole}
                isCLevel={isCLevel}
                isTeamLead={isTeamLead}
                currentUserId={currentUserId}
              />
            ))
          )}
        </div>
      </section>}

      {/* 취소 확인 모달 */}
      <Dialog open={!!cancelConfirm} onOpenChange={(o) => !o && setCancelConfirm(null)}>
        <DialogContent className="max-w-[600px] bg-white/98 backdrop-blur-2xl border border-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
          <DialogHeader>
            <DialogTitle>휴가 취소 확인</DialogTitle>
            <DialogDescription>
              정말 휴가를 취소하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConfirm(null)}>
              아니오
            </Button>
            <Button
              variant="outline"
              className="border-rose-200 text-rose-600 hover:bg-rose-50"
              onClick={handleCancelConfirm}
            >
              예, 취소합니다
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* C레벨 전용: 특별 휴가 부여 모달 */}
      <GrantLeaveModal
        open={grantModalOpen}
        onOpenChange={setGrantModalOpen}
        onSuccess={setGrantToast}
      />

      {/* 특별 휴가 부여 완료 Toast */}
      {grantToast && (
        <div
          className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-3 shadow-lg font-[var(--font-pretendard)]"
          role="status"
        >
          <p className="text-sm font-medium text-slate-800">{grantToast}</p>
        </div>
      )}

      {/* 취소 요청 승인 (팀장/C레벨) */}
      {(isTeamLead || isCLevel) && pendingCancelApproval.length > 0 && (
        <Card className="border border-rose-200/50 bg-rose-50/30 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-700">
              <XCircle className="size-5" />
              휴가 취소 요청 대기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingCancelApproval.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-4 rounded-lg glass-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{req.applicantName}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {getLeaveTypeDisplayName(req.leaveType)} · {req.startDate}
                      {req.startDate !== req.endDate && ` ~ ${req.endDate}`} (
                      {req.days}일)
                    </p>
                    <p className="mt-1 text-sm text-rose-600">취소 요청됨</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-rose-200 text-rose-600 hover:bg-rose-50"
                      onClick={() => handleApproveCancel(req.id)}
                    >
                      취소 승인
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 결재 대기 (팀장/C레벨) */}
      {(isTeamLead || isCLevel) && pendingForApproval.length > 0 && (
        <Card className="border border-amber-200/50 bg-amber-50/50 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5 text-amber-600" />
              결재 대기 중인 구성원 휴가 신청
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingForApproval.map((req) => (
                <div
                  key={req.id}
                  className="flex flex-col gap-4 rounded-lg glass-card p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium">{req.applicantName}</p>
                    <p className="text-sm text-[var(--muted-foreground)]">
                      {getLeaveTypeDisplayName(req.leaveType)} · {req.startDate}
                      {req.startDate !== req.endDate && ` ~ ${req.endDate}`} (
                      {req.days}일)
                    </p>
                    <p className="mt-1 text-sm">{req.reason}</p>
                    {req.requiresProof && req.proofStatus === "submitted" && (
                      <div className="mt-2">
                        {isCLevel ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 rounded-xl border-white/60 bg-white/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-0.5"
                          >
                            <FileText className="size-4" />
                            첨부파일 열람 및 다운로드
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-100/80 px-2.5 py-1 text-xs text-slate-500">
                            🔒 C레벨 전용 열람 문서
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => handleApprove(req.id)}>
                      <Check className="size-4" />
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600 hover:bg-rose-50"
                      onClick={() => handleReject(req.id)}
                    >
                      <X className="size-4" />
                      반려
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <LeaveApplicationModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedLeaveType(null);
        }}
        leaveType={selectedLeaveType}
        annualRemaining={annualRemaining}
        currentRole={currentRole}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

function LeaveRecordRow({
  request,
  isRemoving,
  onCancelClick,
  onProofUpload,
  onProofDelete,
  currentRole,
  isCLevel,
  isTeamLead,
  currentUserId,
}: {
  request: LeaveRequest;
  isRemoving?: boolean;
  onCancelClick?: (id: string, type: "immediate" | "request") => void;
  onProofUpload: (id: string, fileName: string) => void;
  onProofDelete: (id: string) => void;
  currentRole: string;
  isCLevel: boolean;
  isTeamLead: boolean;
  currentUserId: string;
}) {
  const [showUploadDropzone, setShowUploadDropzone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isOwnRequest = request.applicantId === currentUserId;
  const needsProof = request.requiresProof && request.proofStatus !== "submitted";

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onProofUpload(request.id, file.name);
      setShowUploadDropzone(false);
      e.target.value = "";
    }
  };

  const statusConfig: Record<
    ApprovalStatus,
    { label: string; showIcon: boolean; pillClass: string }
  > = {
    승인_완료: {
      label: "승인완료",
      showIcon: true,
      pillClass: "badge-glow-success border border-emerald-200/50 bg-emerald-50/50 text-emerald-700",
    },
    팀장_1차_승인_대기: {
      label: "팀장 승인 대기",
      showIcon: false,
      pillClass: "badge-linear border-amber-200/50 bg-amber-50/50 text-amber-700",
    },
    C레벨_최종_승인_대기: {
      label: "최종 승인 대기",
      showIcon: false,
      pillClass: "badge-linear border-amber-200/50 bg-amber-50/50 text-amber-700",
    },
    반려: {
      label: "반려",
      showIcon: false,
      pillClass: "badge-linear border-rose-200/50 bg-rose-50/50 text-rose-700",
    },
    CANCELED: {
      label: "취소됨",
      showIcon: false,
      pillClass: "badge-linear border-slate-200/50 bg-slate-50/50 text-slate-500",
    },
    CANCEL_REQUESTED: {
      label: "취소 대기중",
      showIcon: false,
      pillClass: "badge-linear border-rose-200/50 bg-rose-50/50 text-rose-600",
    },
    PLANNED: {
      label: "계획 제출",
      showIcon: false,
      pillClass: "badge-linear border-sky-200/50 bg-sky-50/50 text-sky-700",
    },
  };
  const config = statusConfig[request.status] ?? statusConfig.반려;
  const dateStr = `${request.startDate.replace(/-/g, ".")}${
    request.startDate !== request.endDate
      ? ` ~ ${request.endDate.replace(/-/g, ".")}`
      : ""
  }`;

  const isPending = request.status === "팀장_1차_승인_대기" || request.status === "C레벨_최종_승인_대기";
  const canCancel = isOwnRequest && (isPending || request.status === "승인_완료");

  return (
    <div
      className={cn(
        "border-b border-slate-200/50 px-4 py-3 last:border-0 transition-all duration-300",
        isRemoving && "opacity-0 scale-[0.98]"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {config.showIcon && (
            <div className="flex size-6 items-center justify-center rounded-full bg-emerald-500">
              <Leaf className="size-3.5 text-white" />
            </div>
          )}
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              config.pillClass
            )}
          >
            {config.label}
          </span>
          {request.status === "승인_완료" && request.autoApproved && (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
              [시스템 자동 승인]
            </span>
          )}
          <span className="text-sm text-[var(--muted-foreground)]">
            {getLeaveTypeDisplayName(request.leaveType)} · {dateStr}
          </span>
        </div>
        <div className="flex items-center gap-4">
          {canCancel && onCancelClick && (
            <Button
              size="sm"
              variant="outline"
              className="border-rose-200/80 text-rose-500 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600"
              onClick={() =>
                onCancelClick(
                  request.id,
                  isPending ? "immediate" : "request"
                )
              }
            >
              <XCircle className="size-3.5" />
              {isPending ? "휴가 취소" : "휴가 취소 요청"}
            </Button>
          )}
          {isOwnRequest && needsProof && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-300 bg-amber-50/80 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
              onClick={() => setShowUploadDropzone(true)}
            >
              <Paperclip className="size-4" />
              증빙 서류 제출
            </Button>
          )}
          <span className="text-sm font-medium">{request.days}일</span>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreVertical className="size-4" />
          </Button>
        </div>
      </div>
      {/* 증빙 서류 영역 (RBAC) */}
      {request.requiresProof && isOwnRequest && (
        <div className="mt-2 pl-9">
          {request.proofStatus === "submitted" ? (
            <div className="flex flex-wrap items-center gap-2">
              {currentRole === "C레벨" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 rounded-xl border-white/60 bg-white/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)]"
                  onClick={() => {
                    /* 열람/다운로드 - 실제 구현시 파일 URL 호출 */
                  }}
                >
                  <FileText className="size-4" />
                  첨부파일 열람 및 다운로드
                </Button>
              ) : (
                <span className="flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-slate-50/80 px-2.5 py-1 text-xs text-slate-600">
                  🔒 제출 완료 (경영진 검토 중)
                  {request.proofFileName && (
                    <span className="font-medium">· {request.proofFileName}</span>
                  )}
                </span>
              )}
              {currentRole !== "C레벨" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="size-7 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => onProofDelete(request.id)}
                  title="증빙 서류 삭제"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          ) : null}
        </div>
      )}
      {request.requiresProof && !isOwnRequest && (isTeamLead || isCLevel) && request.proofStatus === "submitted" && (
        <div className="mt-2 pl-9">
          {isCLevel ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 rounded-xl border-white/60 bg-white/80 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)]"
              onClick={() => {}}
            >
              <FileText className="size-4" />
              첨부파일 열람 및 다운로드
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 bg-slate-100/80 px-2.5 py-1 text-xs text-slate-500">
              🔒 C레벨 전용 열람 문서
            </span>
          )}
        </div>
      )}
      {/* 업로드 드롭존 */}
      {showUploadDropzone && (
        <div
          className={cn(
            "mt-2 rounded-xl border-2 border-dashed border-slate-200/80 bg-slate-50/60 px-4 py-5 backdrop-blur-sm transition-all duration-300",
            "hover:border-amber-300/60 hover:bg-amber-50/40"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-1 py-2 text-center transition-colors hover:opacity-80"
          >
            <Paperclip className="size-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">파일 업로드</span>
            <span className="text-xs text-slate-500">클릭하여 파일 선택</span>
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">
            PDF, JPG, PNG (필증, 청첩장 등)
          </p>
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowUploadDropzone(false)}
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Flex 스타일 연차 세부 종류 (4개 라디오 카드) */
type FlexLeaveSubType = "annual" | "half_am" | "half_pm" | "hourly";

const FLEX_RADIO_OPTIONS: { value: FlexLeaveSubType; label: string }[] = [
  { value: "annual", label: "하루 종일" },
  { value: "half_am", label: "오전 반차" },
  { value: "half_pm", label: "오후 반차" },
  { value: "hourly", label: "시간차" },
];

/** 시간차: 2시간 단위 옵션 (09:00~18:00) */
const TIME_SLOTS = [
  "09:00", "11:00", "13:00", "15:00", "16:00", "18:00",
].map((t) => ({ value: t, label: t.startsWith("09") || t.startsWith("10") ? `오전 ${t}` : `오후 ${t}` }));

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (h < 12) return `오전 ${h}:${String(m).padStart(2, "0")}`;
  const h12 = h === 12 ? 12 : h - 12;
  return `오후 ${h12}:${String(m).padStart(2, "0")}`;
}

function getSubTypeLabel(v: FlexLeaveSubType): string {
  return FLEX_RADIO_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

function getApprovalLine(currentRole: string): string {
  if (currentRole === "사원") return "승인권자: 팀장 ➡️ C레벨";
  if (currentRole === "팀장") return "승인권자: C레벨";
  return "승인권자: 본인 직권 승인";
}

function LeaveApplicationModal({
  open,
  onClose,
  leaveType,
  annualRemaining,
  currentRole,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  leaveType: LeaveTypeKey | null;
  annualRemaining: number;
  currentRole: string;
  onSubmit: (form: {
    leaveType: LeaveTypeKey;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
  }) => void;
}) {
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [flexSubType, setFlexSubType] = useState<FlexLeaveSubType>("annual");
  const [hourlyStart, setHourlyStart] = useState("09:00");
  const [hourlyEnd, setHourlyEnd] = useState("11:00");

  // leaveType이 바뀌면 캘린더·폼 상태 초기화
  useEffect(() => {
    setStartDate(undefined);
    setEndDate(undefined);
    setReason("");
    setFlexSubType("annual");
    setHourlyStart("09:00");
    setHourlyEnd("11:00");
  }, [leaveType]);

  const isAnnualFlow = leaveType === "annual";
  const isRangeMode = isAnnualFlow && flexSubType === "annual";

  const days = useMemo(() => {
    if (!startDate) return 0;
    if (isAnnualFlow && flexSubType === "hourly") {
      const [sh, sm] = hourlyStart.split(":").map(Number);
      const [eh, em] = hourlyEnd.split(":").map(Number);
      const hours = (eh * 60 + em - sh * 60 - sm) / 60;
      if (hours <= 0) return 0;
      return Math.round((hours / 8) * 100) / 100; // 시간당 0.125일
    }
    if (isAnnualFlow && (flexSubType === "half_am" || flexSubType === "half_pm")) return 0.5;
    const end = endDate ?? startDate;
    return countBusinessDaysExcludingHolidays(startDate, end);
  }, [startDate, endDate, isAnnualFlow, flexSubType, hourlyStart, hourlyEnd]);

  const effectiveLeaveType = useMemo((): LeaveTypeKey => {
    if (!leaveType) return "annual";
    if (isAnnualFlow) return flexSubType;
    return leaveType;
  }, [leaveType, isAnnualFlow, flexSubType]);

  const selectedDayCount = useMemo(() => {
    if (!startDate) return 0;
    if (!isRangeMode) return 1;
    const end = endDate ?? startDate;
    return countBusinessDaysExcludingHolidays(startDate, end);
  }, [startDate, endDate, isRangeMode, isAnnualFlow]);

  const handleSubmit = () => {
    if (!startDate || !reason || !leaveType) return;
    // hourly·반차는 endDate가 없으므로 startDate 사용, 나머지는 endDate 우선
    const isSingleDay = isAnnualFlow && (flexSubType === "hourly" || flexSubType === "half_am" || flexSubType === "half_pm");
    const end = isSingleDay ? startDate : (endDate ?? startDate);
    onSubmit({
      leaveType: effectiveLeaveType,
      startDate: format(startDate, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
      days,
      reason: flexSubType === "hourly" ? `${reason} (${hourlyStart}~${hourlyEnd})` : reason,
    });
    setStartDate(undefined);
    setEndDate(undefined);
    setReason("");
    setFlexSubType("annual");
    setHourlyStart("09:00");
    setHourlyEnd("11:00");
  };

  const card = leaveType ? LEAVE_TYPE_CARDS.find((c) => c.key === leaveType) : null;
  const canSubmit =
    !!startDate &&
    !!reason &&
    (flexSubType === "hourly"
      ? days > 0
      : flexSubType !== "annual"
        ? days > 0
        : days >= 1);

  /** 비연차 플로우: 기존 심플 폼 */
  if (leaveType && !isAnnualFlow) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{card?.label ?? "휴가"} 신청</DialogTitle>
            <DialogDescription>
              시작일·종료일을 선택하고 사유를 입력하세요
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label className="mb-2 block">
                {card?.fixedDays != null
                  ? "시작일을 선택하면 주말·공휴일을 제외한 영업일 기준으로 종료일이 자동 설정됩니다"
                  : "날짜 선택 (시작일부터 종료일까지 드래그)"}
              </Label>
              <div className="flex justify-center [&_.rdp]:select-none">
                <RangeDragDayPicker
                  key={leaveType ?? "none"}
                  selected={startDate ? { from: startDate, to: endDate ?? startDate } : undefined}
                  onSelect={(r) => {
                    if (!r?.from) return;
                    setStartDate(r.from);
                    if (card?.fixedDays != null)
                      setEndDate(getEndDateForBusinessDays(r.from, card.fixedDays));
                    else
                      setEndDate(r.to ?? r.from);
                  }}
                  locale={ko}
                  disabled={{ before: new Date() }}
                  className="rounded-lg border border-[var(--border)] p-4"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="reason-simple">사유</Label>
              <Input
                id="reason-simple"
                placeholder="(선택) 휴가 사유를 입력해주세요"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2"
              />
            </div>
            {leaveType && getRequiresProof(leaveType) && (
              <p className="text-sm text-amber-500">
                해당 휴가는 복귀 후 3일 이내에 증빙 서류(필증, 청첩장 등) 제출이 필요합니다.
              </p>
            )}
          </div>
          <DialogFooter>
            <p className="mr-auto text-xs text-slate-400">{getApprovalLine(currentRole)}</p>
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button onClick={handleSubmit} disabled={!startDate || !reason}>신청하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  /** Flex 스타일 연차 신청 모달 */
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] w-[min(100vw-2rem,600px)] max-w-[600px] flex-col p-0">
        <DialogTitle className="sr-only">연차 신청</DialogTitle>
        <div className="flex flex-1 flex-col overflow-y-auto">
          {/* 헤더: 연차 잔여 */}
          <div className="border-b border-[var(--border)] px-6 py-3">
            <p className="text-sm text-slate-500">
              연차 {annualRemaining}일 사용 가능 · 유급
            </p>
          </div>

          <div className="space-y-4 px-6 py-4">
            {/* 동적 타이틀: 2026년 3월 9일 (월) · 하루 종일 */}
            <div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">
                {startDate
                  ? `${format(startDate, "yyyy년 M월 d일 (EEE)", { locale: ko })} · ${getSubTypeLabel(flexSubType)}`
                  : "날짜를 선택하세요"}
              </h3>
              {startDate && days > 0 && (
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                  총 {isRangeMode ? selectedDayCount : 1}일 선택
                  {days > 0 && ` (${days}일 사용)`}
                </p>
              )}
            </div>

            {/* 1. 캘린더 (드래그로 시작일~종료일 선택 가능) */}
            <div className="flex flex-col items-center gap-2">
              {isRangeMode && (
                <p className="text-xs text-slate-500">
                  시작일을 눌러 드래그하면 종료일까지 한 번에 선택됩니다
                </p>
              )}
              <div className="flex justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-white p-4 [&_.rdp]:select-none">
                {isRangeMode ? (
                  <RangeDragDayPicker
                    key={`annual-range-${leaveType}`}
                    selected={startDate ? { from: startDate, to: endDate ?? startDate } : undefined}
                    onSelect={(r) => {
                      if (r?.from) {
                        setStartDate(r.from);
                        setEndDate(r.to ?? r.from);
                      }
                    }}
                    locale={ko}
                    disabled={{ before: new Date() }}
                    className="mx-auto"
                  />
                ) : (
                  <RangeDragDayPicker
                    key={`annual-single-${flexSubType}`}
                    selected={startDate ? { from: startDate, to: startDate } : undefined}
                    onSelect={(r) => {
                      if (r?.from) {
                        setStartDate(r.from);
                        setEndDate(undefined);
                      }
                    }}
                    locale={ko}
                    disabled={{ before: new Date() }}
                    className="mx-auto"
                  />
                )}
              </div>
            </div>

            {/* 2. 라디오 카드 리스트 (Flex 스타일) */}
            <div className="space-y-2">
              {FLEX_RADIO_OPTIONS.map((opt) => (
                <div key={opt.value}>
                  <button
                    type="button"
                    onClick={() => setFlexSubType(opt.value)}
                    className={cn(
                      "interactive-card flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-all duration-500 ease-out",
                      flexSubType === opt.value
                        ? "border border-emerald-300/60 bg-emerald-50/60 backdrop-blur-sm"
                        : "border border-slate-200/50 bg-white/80 hover:border-slate-300/60 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                          flexSubType === opt.value
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-slate-300 bg-transparent"
                        )}
                      >
                        {flexSubType === opt.value && <Check className="size-3 text-white" />}
                      </span>
                      <span className="font-medium text-[var(--foreground)]">{opt.label}</span>
                    </div>
                    {flexSubType === opt.value && (
                      <Check className="size-5 shrink-0 text-emerald-500" />
                    )}
                  </button>
                  {/* 3. 시간차 Accordion: 카드 내부 확장 영역 */}
                  {opt.value === "hourly" && flexSubType === "hourly" && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Select value={hourlyStart} onValueChange={setHourlyStart}>
                          <SelectTrigger className="h-9 w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_SLOTS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {formatTimeLabel(s.value)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-slate-400">~</span>
                        <Select value={hourlyEnd} onValueChange={setHourlyEnd}>
                          <SelectTrigger className="h-9 w-[110px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {TIME_SLOTS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {formatTimeLabel(s.value)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        2시간 단위로 입력할 수 있어요.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 4. 사용 일수 + 차감 후 잔여 */}
            {startDate && days > 0 && (
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  사용 일수: {days}일
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  차감 후 잔여 연차: {annualRemaining}일 ➡️{" "}
                  {Number.isInteger(annualRemaining - days)
                    ? annualRemaining - days
                    : Math.round((annualRemaining - days) * 100) / 100}
                  일
                </p>
              </div>
            )}

            {/* 사유 입력 */}
            <div>
              <Label htmlFor="reason">사유</Label>
              <Input
                id="reason"
                placeholder="(선택) 휴가 사유를 입력해주세요"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-2"
              />
            </div>

            {/* Footer: 우측 정렬 컨트롤 */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <p className="mb-3 text-xs text-slate-400">{getApprovalLine(currentRole)}</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  취소
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className="bg-blue-500 text-white hover:bg-blue-600"
                >
                  신청하기
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
