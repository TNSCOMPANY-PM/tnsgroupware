"use client";

import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmployeeFlipCard, type EmployeeFlipCardData } from "@/components/hr/EmployeeFlipCard";
import { NewEmployeeModal, type NewEmployeeFormData } from "@/components/hr/NewEmployeeModal";

const ProfileCardSheet = dynamic(() => import("@/components/hr/ProfileCardSheet").then((m) => ({ default: m.ProfileCardSheet })), { ssr: false });
const LeaveTab = dynamic(() => import("@/components/hr/LeaveTab").then((m) => ({ default: m.LeaveTab })), { ssr: false, loading: () => <div className="flex items-center justify-center py-20"><Loader2 className="size-6 animate-spin text-slate-400" /></div> });
const AnnualLeavePromotionTab = dynamic(() => import("@/components/hr/AnnualLeavePromotionTab").then((m) => ({ default: m.AnnualLeavePromotionTab })), { ssr: false });
const LabourLawVerificationDashboard = dynamic(() => import("@/components/hr/LabourLawVerificationDashboard").then((m) => ({ default: m.LabourLawVerificationDashboard })), { ssr: false });
const ContractSendTab = dynamic(() => import("@/components/hr/ContractSendTab").then((m) => ({ default: m.ContractSendTab })), { ssr: false });
const ContractManageTab = dynamic(() => import("@/components/hr/ContractManageTab").then((m) => ({ default: m.ContractManageTab })), { ssr: false });
const PayslipTab = dynamic(() => import("@/components/hr/PayslipTab").then((m) => ({ default: m.PayslipTab })), { ssr: false });
import { createEmployee } from "./actions";
import { useSearchParams } from "next/navigation";
import { usePermission } from "@/contexts/PermissionContext";
import { useRealtimeToast } from "@/contexts/RealtimeToastContext";
import { useSupabaseRealtime } from "@/hooks/useSupabaseRealtime";
import { getProfileForEmployee } from "@/constants/profile";
import { DUMMY_USERS } from "@/constants/users";
import { Users, Calendar, ShieldCheck, UserPlus, Loader2, FileSignature, FileCheck, Receipt } from "lucide-react";
import type { Employee } from "@/types/employee";
import { format } from "date-fns";

type CardSection = "c-level" | "member";

type EmployeeCardData = EmployeeFlipCardData & {
  departmentKey: string;
  section: CardSection;
};

/** 구성원 표시: 직위(총괄/팀장/사원)·부서는 DUMMY_USERS 우선, 권한은 role(팀장=총괄+팀장) */
function employeeToCardData(emp: Employee): EmployeeCardData {
  const joinDate =
    emp.hire_date != null
      ? format(new Date(emp.hire_date), "yyyy. M. d")
      : "-";
  const byName = DUMMY_USERS.find((u) => u.name === emp.name);
  const positionForDisplay = byName?.positionDisplay ?? byName?.role ?? emp.role;
  const departmentForDisplay = byName?.displayDepartment ?? byName?.department ?? emp.department;
  const departmentKey =
    departmentForDisplay === "경영" || departmentForDisplay === "경영지원"
      ? "경영"
      : "마케팅사업부";
  const roleForSection = byName?.role ?? emp.role;
  const section: CardSection =
    roleForSection === "C레벨" ? "c-level" : "member";
  return {
    id: emp.id,
    name: emp.name,
    position: positionForDisplay,
    department: departmentForDisplay,
    team: departmentForDisplay,
    joinDate,
    contact: emp.email ?? "-",
    userId: emp.id,
    departmentKey,
    section,
    personalColor: emp.personal_color,
  };
}

function HRPageContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("members");
  const { isCLevel } = usePermission();

  useEffect(() => {
    if (searchParams.get("tab") === "contracts" && isCLevel) setActiveTab("contracts");
    if (searchParams.get("tab") === "leaves") setActiveTab("leaves");
  }, [searchParams, isCLevel]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">HR</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          구성원 관리 · 휴가 관리 · 전자계약 발송 · 플렉스(FLEX) 스타일
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="inline-flex h-12 w-full max-w-3xl flex-wrap rounded-xl bg-[var(--muted)] p-1">
          <TabsTrigger
            value="members"
            className="flex-1 gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Users className="size-4" />
            구성원 관리
          </TabsTrigger>
          <TabsTrigger
            value="leave"
            className="flex-1 gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Calendar className="size-4" />
            휴가 관리
          </TabsTrigger>
          <TabsTrigger
            value="promotion"
            className="flex-1 gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <ShieldCheck className="size-4" />
            연차 촉진
          </TabsTrigger>
          {!isCLevel && (
            <TabsTrigger
              value="contract-manage"
              className="flex-1 gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <FileCheck className="size-4" />
              계약서 관리
            </TabsTrigger>
          )}
          {isCLevel && (
            <TabsTrigger
              value="contracts"
              className="flex-1 gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <FileSignature className="size-4" />
              전자계약 발송
            </TabsTrigger>
          )}
          <TabsTrigger
            value="payslip"
            className="flex-1 gap-2 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
          >
            <Receipt className="size-4" />
            급여 명세
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <MembersTab onSwitchToLeaveTab={() => setActiveTab("leave")} />
        </TabsContent>

        <TabsContent value="leave">
          <LeaveTab initialDate={searchParams.get("date") ?? undefined} />
        </TabsContent>

        <TabsContent value="promotion">
          <AnnualLeavePromotionTab />
        </TabsContent>

        {!isCLevel && (
          <TabsContent value="contract-manage">
            <ContractManageTab />
          </TabsContent>
        )}

        {isCLevel && (
          <TabsContent value="contracts">
            <ContractSendTabWrapper />
          </TabsContent>
        )}

        <TabsContent value="payslip">
          <PayslipTab />
        </TabsContent>
      </Tabs>

      {isCLevel && (
        <section className="pt-4">
          <LabourLawVerificationDashboard />
        </section>
      )}
    </div>
  );
}

export default function HRPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[200px] items-center justify-center"><Loader2 className="size-8 animate-spin text-slate-400" /></div>}>
      <HRPageContent />
    </Suspense>
  );
}

function MembersTab({ onSwitchToLeaveTab }: { onSwitchToLeaveTab?: () => void }) {
  const { currentUserId, currentUserName, isCLevel, isTeamLead } = usePermission();
  const { showRealtimeToast } = useRealtimeToast() ?? {};
  const { data: employees, loading } = useSupabaseRealtime<Employee>("employees", {
    onRealtime: showRealtimeToast,
  });
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [focusDocumentsSection, setFocusDocumentsSection] = useState(false);
  const [newEmployeeModalOpen, setNewEmployeeModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const profile = useMemo(() => {
    if (!selectedEmployee) return null;
    return getProfileForEmployee(selectedEmployee);
  }, [selectedEmployee]);

  const filteredCards = useMemo(() => {
    const cards = employees.map(employeeToCardData);
    if (deptFilter === "all") return cards;
    return cards.filter((c) => c.departmentKey === deptFilter);
  }, [employees, deptFilter]);

  const cLevelCards = useMemo(
    () => filteredCards.filter((c) => c.section === "c-level"),
    [filteredCards]
  );
  const memberCards = useMemo(
    () => filteredCards.filter((c) => c.section === "member"),
    [filteredCards]
  );

  const renderCard = (card: EmployeeCardData) => {
    const emp = employees.find((e) => e.id === card.id);
    return (
      <EmployeeFlipCard
        key={card.id}
        data={card}
        onClick={() => {
          if (emp) {
            setSelectedEmployee(emp);
            setFocusDocumentsSection(false);
          }
        }}
        onRequestCertificate={
          card.name === currentUserName && emp
            ? () => {
                setSelectedEmployee(emp);
                setFocusDocumentsSection(true);
              }
            : undefined
        }
      />
    );
  };

  const showNewEmployeeButton = isTeamLead || isCLevel;

  const handleNewEmployeeSubmit = async (data: NewEmployeeFormData) => {
    if (!data.hireDate) return;
    const result = await createEmployee({
      name: data.name,
      hireDate: new Date(data.hireDate),
      department: data.department,
      role: data.role,
      generatedId: data.generatedId,
    });
    if (result.ok) {
      setNewEmployeeModalOpen(false);
      setToastMessage("✅ 사원 계정이 성공적으로 생성되었습니다.");
      // Realtime 구독으로 목록 자동 반영
    } else {
      setToastMessage(`❌ 등록 실패: ${result.error}`);
    }
    setTimeout(() => setToastMessage(null), 4000);
  };

  return (
    <div className="space-y-8 font-sans">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          <Card className="border-0 bg-[var(--primary)]/5">
            <CardContent className="flex items-center gap-3 px-5 py-4">
              <div className="flex size-10 items-center justify-center rounded-full bg-[var(--primary)]/20">
                <Users className="size-5 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-sm text-[var(--muted-foreground)]">
                  전체 구성원
                </p>
                <p className="text-2xl font-bold">{filteredCards.length}명</p>
              </div>
            </CardContent>
          </Card>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="부서" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 부서</SelectItem>
              <SelectItem value="경영">경영</SelectItem>
              <SelectItem value="마케팅사업부">마케팅사업부</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {showNewEmployeeButton && (
          <Button
            onClick={() => setNewEmployeeModalOpen(true)}
            className="shrink-0 gap-2 rounded-xl bg-[var(--primary)] text-white shadow-sm hover:opacity-90"
          >
            <UserPlus className="size-4" />
            신규 사원 등록
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <Loader2 className="size-10 animate-spin text-[var(--muted-foreground)]" />
          <p className="text-sm text-[var(--muted-foreground)]">사원 목록 불러오는 중...</p>
        </div>
      ) : (
        <>
          {/* C레벨: CEO · CFO 위 */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              C레벨
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {cLevelCards.map(renderCard)}
            </div>
          </section>

          {/* 멤버 */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
              멤버
            </h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {memberCards.map(renderCard)}
            </div>
          </section>
        </>
      )}

      {!loading && filteredCards.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--muted)]/20 py-16 text-[var(--muted-foreground)]">
          <Users className="mb-2 size-12 opacity-50" />
          <p>조건에 맞는 구성원이 없습니다.</p>
        </div>
      )}

      <ProfileCardSheet
        profile={profile}
        open={!!selectedEmployee}
        onClose={() => {
          setSelectedEmployee(null);
          setFocusDocumentsSection(false);
        }}
        isOwnProfile={!!selectedEmployee && selectedEmployee.name === currentUserName}
        isCLevel={isCLevel}
        focusDocumentsSection={focusDocumentsSection}
        onDocumentsSectionViewed={() => setFocusDocumentsSection(false)}
        onRequestLeaveTab={
          onSwitchToLeaveTab
            ? () => {
                onSwitchToLeaveTab();
                setSelectedEmployee(null);
                setFocusDocumentsSection(false);
              }
            : undefined
        }
      />

      <NewEmployeeModal
        open={newEmployeeModalOpen}
        onOpenChange={setNewEmployeeModalOpen}
        onSubmit={handleNewEmployeeSubmit}
      />

      {toastMessage && (
        <div
          role="status"
          className="view-fade-in fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl border border-white/40 bg-white/95 px-5 py-3 text-sm font-medium text-slate-800 shadow-2xl backdrop-blur-xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}

function ContractSendTabWrapper() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => setEmployees(Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, []);
  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-slate-400" />
      </div>
    );
  }
  return <ContractSendTab employees={employees} />;
}
