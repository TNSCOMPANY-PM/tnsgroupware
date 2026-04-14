"use client";

import { useState, useRef, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { EmployeeDetailProfile } from "@/constants/profile";
import { useProfileOverrides } from "@/contexts/ProfileOverridesContext";
import type { ProfileEmploymentOverride, ProfilePayrollOverride } from "@/contexts/ProfileOverridesContext";
import {
  Settings,
  X,
  Building2,
  Users,
  MapPin,
  Briefcase,
  User,
  Mail,
  Phone,
  CreditCard,
  Calendar,
  Banknote,
  Pencil,
  FileDown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { downloadEmploymentCertificate, downloadCareerCertificate } from "@/utils/employmentCertificate";

const PROFILE_TABS = [
  { value: "hr", label: "인사 정보", icon: User },
  { value: "work", label: "근무", icon: Briefcase },
] as const;

const ISSUE_PURPOSES = [
  { value: "financial", label: "금융기관 제출용" },
  { value: "government", label: "관공서 제출용" },
  { value: "personal", label: "개인 소장용" },
] as const;

interface ProfileCardSheetProps {
  profile: EmployeeDetailProfile | null;
  open: boolean;
  onClose: () => void;
  /** 본인 프로필일 때만 내 정보 변경·재직증명서 표시 */
  isOwnProfile?: boolean;
  /** C레벨일 때 고용/급여 정보 수정 버튼 표시 */
  isCLevel?: boolean;
  /** true면 시트 열릴 때 문서 발급 섹션으로 스크롤 */
  focusDocumentsSection?: boolean;
  onDocumentsSectionViewed?: () => void;
  /** 연차 확인 클릭 시 (예: 휴가 탭으로 전환 후 시트 닫기) */
  onRequestLeaveTab?: () => void;
  /** 프로필 사진 업로드 후 DB 반영 시 호출 (선택) */
  onAvatarUpdate?: (avatarUrl: string) => void;
}

export function ProfileCardSheet({
  profile,
  open,
  onClose,
  isOwnProfile = false,
  isCLevel = false,
  focusDocumentsSection = false,
  onDocumentsSectionViewed,
  onRequestLeaveTab,
  onAvatarUpdate,
}: ProfileCardSheetProps) {
  const [activeTab, setActiveTab] = useState("hr");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [employmentPayrollModalOpen, setEmploymentPayrollModalOpen] = useState(false);
  const documentsSectionRef = useRef<HTMLDivElement>(null);
  const { setOverride, setEmploymentPayrollOverride } = useProfileOverrides();

  // 실제 연차 데이터 동적 로드
  const [dynamicLeave, setDynamicLeave] = useState<{ granted: number; used: number; remaining: number } | null>(null);
  useEffect(() => {
    if (!open || !profile || profile.role === "C레벨") return;
    setDynamicLeave(null);
    (async () => {
      try {
        const [leavesRes, grantsRes] = await Promise.all([
          fetch("/api/leaves").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
          fetch("/api/granted-leaves").then(r => r.json()).then(d => Array.isArray(d) ? d : []),
        ]);
        const { getAnnualLeaveGranted } = await import("@/utils/leaveCalculator");
        const year = new Date().getFullYear();
        const joinDate = profile.employment.joinDate;
        // "2021년 1월 25일" or "2021. 1. 25" or "2021-01-25" 모두 대응
        const joinStr = joinDate
          ?.replace(/년\s*/g, "-").replace(/월\s*/g, "-").replace(/일/g, "")
          .replace(/\.\s*/g, "-").replace(/-$/, "").trim() ?? "";
        const legal = joinStr ? getAnnualLeaveGranted(joinStr, year) : 15;
        const adj = grantsRes.filter((g: { user_id: string; year: number }) => g.user_id === profile.id && g.year === year)
          .reduce((s: number, g: { days: number }) => s + Number(g.days), 0);
        const annualTypes = ["annual", "half_am", "half_pm", "quarter_am", "quarter_pm", "hourly"];
        const used = leavesRes
          .filter((r: { applicant_id: string; status: string; leave_type: string }) =>
            r.applicant_id === profile.id && (r.status === "승인_완료" || r.status === "CANCEL_REQUESTED") && annualTypes.includes(r.leave_type))
          .reduce((s: number, r: { days: number }) => s + (Number(r.days) || 0), 0);
        const granted = legal + adj;
        setDynamicLeave({ granted, used, remaining: granted - used });
      } catch { /* ignore */ }
    })();
  }, [open, profile]);

  useEffect(() => {
    if (open && isOwnProfile && focusDocumentsSection && documentsSectionRef.current) {
      documentsSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      onDocumentsSectionViewed?.();
    }
  }, [open, isOwnProfile, focusDocumentsSection, onDocumentsSectionViewed]);

  if (!profile) return null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="flex h-full w-full max-w-full flex-col p-0 sm:max-w-[800px]"
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">{profile.name} 프로필</SheetTitle>
        <div className="flex h-full flex-col overflow-hidden bg-slate-50">
          {/* 헤더: 배경 + 아바타 + 이름 + 설정 */}
          <HeaderSection
            profile={profile}
            onClose={onClose}
            isOwnProfile={isOwnProfile}
            onOpenSettings={isOwnProfile ? () => setEditModalOpen(true) : undefined}
            onAvatarUpdate={onAvatarUpdate}
          />

          {/* 탭 네비게이션 - Segmented Control */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-1 flex-col min-h-0 overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
              <TabsList className="inline-flex h-10 w-auto gap-0 rounded-lg bg-slate-100 p-1">
                {PROFILE_TABS.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="rounded-md px-4 py-2 text-sm font-medium text-slate-600 transition-all duration-200 ease-in-out active:scale-[0.97] data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=inactive]:hover:text-slate-800 data-[state=inactive]:hover:opacity-90"
                  >
                    <Icon className="mr-1.5 size-4 shrink-0" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {isOwnProfile && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-sm text-slate-600"
                  onClick={() => setEditModalOpen(true)}
                >
                  내 정보 변경
                </Button>
              )}
            </div>

            {/* 메인 + 사이드 패널 (반응형): 좌 1fr / 우 320px 고정 */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 overflow-hidden md:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-0 min-w-0 overflow-y-auto scrollbar-hide">
                <TabsContent value="hr" className="m-0 h-full data-[state=inactive]:hidden">
                  <HrInfoTab
                    profile={profile}
                    isOwnProfile={isOwnProfile}
                    isCLevel={isCLevel}
                    documentsSectionRef={documentsSectionRef}
                    onOpenEdit={isOwnProfile ? () => setEditModalOpen(true) : undefined}
                    onOpenEmploymentPayrollEdit={isCLevel ? () => setEmploymentPayrollModalOpen(true) : undefined}
                    onRequestLeaveTab={onRequestLeaveTab}
                    dynamicLeave={dynamicLeave}
                  />
                </TabsContent>
                <TabsContent value="work" className="m-0 p-6 data-[state=inactive]:hidden">
                  <PlaceholderTab label="근무" />
                </TabsContent>
              </div>
              <SidePanel
                profile={profile}
                isOwnProfile={isOwnProfile}
                onOpenEdit={isOwnProfile ? () => setEditModalOpen(true) : undefined}
              />
            </div>
          </Tabs>
        </div>
      </SheetContent>
      {isOwnProfile && profile && (
        <EditProfileModal
          profile={profile}
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          onSave={(data) => {
            setOverride(profile.id, data);
            setEditModalOpen(false);
          }}
        />
      )}
      {isCLevel && profile && (
        <EditEmploymentPayrollModal
          profile={profile}
          open={employmentPayrollModalOpen}
          onOpenChange={setEmploymentPayrollModalOpen}
          onSave={(employment, payroll) => {
            setEmploymentPayrollOverride(profile.id, { employment, payroll });
            setEmploymentPayrollModalOpen(false);
          }}
        />
      )}
    </Sheet>
  );
}

function EditProfileModal({
  profile,
  open,
  onOpenChange,
  onSave,
}: {
  profile: EmployeeDetailProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { phone: string; email: string; address: string }) => void;
}) {
  const [phone, setPhone] = useState(profile.personal.phone);
  const [email, setEmail] = useState(profile.personal.email);
  const [address, setAddress] = useState(profile.personal.address);
  useEffect(() => {
    if (open) {
      setPhone(profile.personal.phone);
      setEmail(profile.personal.email);
      setAddress(profile.personal.address);
    }
  }, [open, profile.personal.phone, profile.personal.email, profile.personal.address]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>내 정보 변경</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-phone">휴대전화</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-email">이메일</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-address">주소</Label>
            <Input
              id="edit-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="주소"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={() => onSave({ phone, email, address })}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EMPLOYMENT_TYPES = ["정규직", "계약직", "파견직", "인턴", "기타"];
const EMPLOYMENT_STATUSES = ["재직", "휴직", "퇴직", "퇴사예정", "기타"];
const SALARY_TYPES = ["월급", "시급", "일급", "연봉", "기타"];

function EditEmploymentPayrollModal({
  profile,
  open,
  onOpenChange,
  onSave,
}: {
  profile: EmployeeDetailProfile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    employment: ProfileEmploymentOverride,
    payroll: ProfilePayrollOverride
  ) => void;
}) {
  const { employment, payroll } = profile;
  const [emp, setEmp] = useState({
    type: employment.type,
    joinDate: employment.joinDate,
    probationStart: employment.probationStart ?? "",
    probationEnd: employment.probationEnd ?? "",
    tenure: employment.tenure,
    status: employment.status,
    contractStart: employment.contractStart ?? "",
    contractEnd: employment.contractEnd ?? "",
  });
  const [pay, setPay] = useState({
    salaryAccount: payroll.salaryAccount,
    salaryType: payroll.salaryType,
  });

  useEffect(() => {
    if (open) {
      setEmp({
        type: employment.type,
        joinDate: employment.joinDate,
        probationStart: employment.probationStart ?? "",
        probationEnd: employment.probationEnd ?? "",
        tenure: employment.tenure,
        status: employment.status,
        contractStart: employment.contractStart ?? "",
        contractEnd: employment.contractEnd ?? "",
      });
      setPay({
        salaryAccount: payroll.salaryAccount,
        salaryType: payroll.salaryType,
      });
    }
  }, [open, employment, payroll]);

  const handleSave = () => {
    onSave(
      {
        type: emp.type,
        joinDate: emp.joinDate,
        probationStart: emp.probationStart || undefined,
        probationEnd: emp.probationEnd || undefined,
        tenure: emp.tenure,
        status: emp.status,
        contractStart: emp.contractStart || undefined,
        contractEnd: emp.contractEnd || undefined,
      },
      {
        salaryAccount: pay.salaryAccount,
        salaryType: pay.salaryType,
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>고용/급여 정보 수정 (C레벨)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-700">고용 정보</h4>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>고용 형태</Label>
                <Select value={emp.type} onValueChange={(v) => setEmp((prev) => ({ ...prev, type: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>입사일</Label>
                <Input
                  value={emp.joinDate}
                  onChange={(e) => setEmp((prev) => ({ ...prev, joinDate: e.target.value }))}
                  placeholder="예: 2021년 1월 25일"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label>수습 시작</Label>
                  <Input
                    value={emp.probationStart}
                    onChange={(e) => setEmp((prev) => ({ ...prev, probationStart: e.target.value }))}
                    placeholder="선택"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>수습 종료</Label>
                  <Input
                    value={emp.probationEnd}
                    onChange={(e) => setEmp((prev) => ({ ...prev, probationEnd: e.target.value }))}
                    placeholder="선택"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>근속 기간</Label>
                <Input
                  value={emp.tenure}
                  onChange={(e) => setEmp((prev) => ({ ...prev, tenure: e.target.value }))}
                  placeholder="예: 4년 2개월"
                />
              </div>
              <div className="grid gap-2">
                <Label>재직 상태</Label>
                <Select value={emp.status} onValueChange={(v) => setEmp((prev) => ({ ...prev, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-2">
                  <Label>계약 시작</Label>
                  <Input
                    value={emp.contractStart}
                    onChange={(e) => setEmp((prev) => ({ ...prev, contractStart: e.target.value }))}
                    placeholder="선택"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>계약 종료</Label>
                  <Input
                    value={emp.contractEnd}
                    onChange={(e) => setEmp((prev) => ({ ...prev, contractEnd: e.target.value }))}
                    placeholder="선택"
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-slate-700">급여 정보</h4>
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label>급여 통장</Label>
                <Input
                  value={pay.salaryAccount}
                  onChange={(e) => setPay((p) => ({ ...p, salaryAccount: e.target.value }))}
                  placeholder="예: ********** / 신한은행"
                />
              </div>
              <div className="grid gap-2">
                <Label>급여 형태</Label>
                <Select value={pay.salaryType} onValueChange={(v) => setPay((p) => ({ ...p, salaryType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALARY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSave}>
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeaderSection({
  profile,
  onClose,
  isOwnProfile,
  onOpenSettings,
  onAvatarUpdate,
}: {
  profile: EmployeeDetailProfile;
  onClose: () => void;
  isOwnProfile?: boolean;
  onOpenSettings?: () => void;
  onAvatarUpdate?: (avatarUrl: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [personalColor, setPersonalColor] = useState<string>(profile.personalColor ?? "#6366f1");
  const [colorSaving, setColorSaving] = useState(false);
  const [colorSaved, setColorSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const { uploadAvatar } = await import("@/utils/supabase/storage");
      const result = await uploadAvatar(profile.id, file);
      if ("error" in result) {
        alert(result.error);
        return;
      }
      const supabase = (await import("@/utils/supabase/client")).createClient();
      if (supabase.from) {
        await supabase.from("employees").update({ avatar_url: result.url }).eq("id", profile.id);
        onAvatarUpdate?.(result.url);
      }
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleColorChange = async (hex: string) => {
    setPersonalColor(hex);
  };

  const handleColorSave = async () => {
    setColorSaving(true);
    try {
      const res = await fetch(`/api/employees/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personal_color: personalColor }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert("색상 저장 실패: " + (err.error ?? res.status));
        return;
      }
      setColorSaved(true);
      setTimeout(() => setColorSaved(false), 2500);
    } catch (e) {
      alert("저장 중 오류: " + String(e));
    } finally {
      setColorSaving(false);
    }
  };

  const pc = personalColor;
  const avatarBg = pc ? pc + "22" : undefined;

  return (
    <>
      <header className="relative z-10 shrink-0" style={{ background: pc ? `linear-gradient(135deg, ${pc}18 0%, ${pc}08 100%)` : undefined }}>
        {/* 퍼스널컬러 상단 줄 */}
        <div className="h-1.5 w-full" style={{ background: pc }} />
        <div className="absolute right-6 top-8 z-20 flex items-center gap-2">
          {onOpenSettings && (
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-600 hover:bg-white/80 hover:text-slate-900"
              onClick={onOpenSettings}
            >
              <Settings className="size-4" />
              설정
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-slate-600 hover:bg-white/80 hover:text-slate-900"
            onClick={onClose}
          >
            <X className="size-5" />
            <span className="sr-only">닫기</span>
          </Button>
        </div>
      </header>

      <div className="relative z-10 shrink-0 px-6 pb-5 pt-6" style={{ background: pc ? `linear-gradient(to bottom, ${pc}10, transparent)` : undefined }}>
        <div className="flex items-end gap-4">
          <div className="shrink-0 relative">
            <label className={cn("block", isOwnProfile && "cursor-pointer")}>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarChange}
                disabled={uploading || !isOwnProfile}
              />
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  className="size-20 rounded-full object-cover shadow-sm"
                  style={{ outline: pc ? `3px solid ${pc}` : "3px solid white" }}
                />
              ) : (
                <div
                  className="flex size-20 items-center justify-center overflow-hidden rounded-full text-2xl font-bold shadow-sm"
                  style={{
                    backgroundColor: avatarBg ?? "#dbeafe",
                    color: pc ?? "#2563eb",
                    outline: pc ? `3px solid ${pc}` : "3px solid white",
                  }}
                >
                  {profile.name.charAt(0)}
                </div>
              )}
              {isOwnProfile && (
                <span className="absolute bottom-0 right-0 flex size-6 items-center justify-center rounded-full text-white text-xs" style={{ backgroundColor: pc ?? "var(--primary)" }}>
                  {uploading ? "…" : "📷"}
                </span>
              )}
            </label>
          </div>
          <div className="pb-0.5 min-w-0 flex-1">
            <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] truncate">
              {profile.name}
            </h2>
            <p className="text-slate-500 text-sm sm:text-base truncate">
              {profile.position} · {profile.department}
            </p>
            {/* 퍼스널컬러 피커 (본인 프로필만) */}
            {isOwnProfile && (
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-xs text-slate-500 shrink-0">퍼스널 컬러</span>
                <div className="flex items-center gap-1.5">
                  {/* label로 color input 직접 감싸기 (sr-only 클릭 우회 불필요) */}
                  <label
                    className="relative flex size-8 cursor-pointer items-center justify-center rounded-full shadow-sm border-2 border-white transition-transform hover:scale-110 overflow-hidden"
                    style={{ backgroundColor: pc }}
                    title="컬러 변경 (클릭)"
                  >
                    <input
                      type="color"
                      value={personalColor}
                      onChange={(e) => handleColorChange(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                  <span className="text-xs font-mono text-slate-500">{personalColor}</span>
                  <button
                    type="button"
                    onClick={handleColorSave}
                    disabled={colorSaving}
                    className="rounded-md px-2.5 py-0.5 text-[11px] font-semibold text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: pc }}
                  >
                    {colorSaved ? "✓ 저장됨" : colorSaving ? "저장 중…" : "저장"}
                  </button>
                </div>
              </div>
            )}
            {/* 다른 사람 프로필: 컬러 뱃지 표시만 */}
            {!isOwnProfile && pc && (
              <div className="mt-2 flex items-center gap-1.5">
                <div className="size-3.5 rounded-full shadow-sm" style={{ backgroundColor: pc }} />
                <span className="text-xs text-slate-400">퍼스널 컬러</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  onEdit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  onEdit?: () => void;
}) {
  const displayValue = value || "-";
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <span className="shrink-0 text-sm text-slate-500">{label}</span>
        <span className="min-w-0 flex-1 break-words text-sm font-medium text-[var(--foreground)]">
          {displayValue}
        </span>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 rounded-full p-2 text-slate-300 transition-all duration-200 ease-in-out hover:bg-slate-100 hover:text-slate-700 active:scale-[0.97]"
          aria-label={`${label} 수정`}
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function HrInfoTab({
  profile,
  isOwnProfile,
  isCLevel,
  documentsSectionRef,
  onOpenEdit,
  onOpenEmploymentPayrollEdit,
  onRequestLeaveTab,
  dynamicLeave,
}: {
  profile: EmployeeDetailProfile;
  isOwnProfile: boolean;
  isCLevel?: boolean;
  documentsSectionRef: React.RefObject<HTMLDivElement | null>;
  onOpenEdit?: () => void;
  onOpenEmploymentPayrollEdit?: () => void;
  onRequestLeaveTab?: () => void;
  dynamicLeave?: { granted: number; used: number; remaining: number } | null;
}) {
  const { organization, personal, employment, payroll, leave: staticLeave } = profile;
  const leave = dynamicLeave ?? staticLeave;
  // 재직증명서
  const [issuePurpose, setIssuePurpose] = useState<string>("");
  const [purposeError, setPurposeError] = useState(false);
  // 경력증명서
  const [careerPurpose, setCareerPurpose] = useState<string>("");
  const [careerPurposeError, setCareerPurposeError] = useState(false);
  const [careerSealType, setCareerSealType] = useState<"digital" | "physical">("digital");
  const [careerMemo, setCareerMemo] = useState("");
  const [isCareerDownloading, setIsCareerDownloading] = useState(false);
  const [includeResidentId, setIncludeResidentId] = useState(false);
  const [includeJoinDate, setIncludeJoinDate] = useState(false);
  const [sealType, setSealType] = useState<"digital" | "physical">("digital");
  const [language, setLanguage] = useState<"ko" | "en">("ko");
  const [memo, setMemo] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  const logIssuance = async (certType: "employment" | "career", purpose: string, lang: string, seal: string, memoText: string) => {
    try {
      await fetch("/api/certificate-issuances", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: profile.id, employee_name: profile.name, certificate_type: certType, purpose, language: lang, seal_type: seal, memo: memoText }),
      });
    } catch { /* ignore */ }
  };

  const handleDownload = async () => {
    if (!issuePurpose) { setPurposeError(true); return; }
    setPurposeError(false);
    setIsDownloading(true);
    setToastVisible(false);
    try {
      await downloadEmploymentCertificate(profile, {
        purposeKey: issuePurpose,
        maskResidentId: !includeResidentId,
        includeJoinDate,
        sealType,
        language,
        memo: memo.trim(),
      });
      await logIssuance("employment", issuePurpose, language, sealType, memo.trim());
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 4000);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCareerDownload = async () => {
    if (!careerPurpose) { setCareerPurposeError(true); return; }
    setCareerPurposeError(false);
    setIsCareerDownloading(true);
    try {
      await downloadCareerCertificate(profile, { purposeKey: careerPurpose, sealType: careerSealType, memo: careerMemo.trim() });
      await logIssuance("career", careerPurpose, "ko", careerSealType, careerMemo.trim());
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 4000);
    } finally {
      setIsCareerDownloading(false);
    }
  };

  return (
    <div className="flex gap-6 p-6">
      <div className="min-w-0 flex-1 space-y-6">
        <Section title="조직 정보">
          <InfoRow icon={Building2} label="부서" value={organization.department} />
          <InfoRow icon={Users} label="팀" value={organization.team ?? "-"} />
          <InfoRow icon={MapPin} label="위치" value={organization.location} />
          <InfoRow icon={Briefcase} label="직위" value={organization.position} />
          <InfoRow
            icon={Briefcase}
            label="직책"
            value={organization.jobTitle ?? "-"}
          />
        </Section>

        <Section title="개인 정보">
          <InfoRow icon={User} label="성명" value={personal.name} />
          <InfoRow
            icon={CreditCard}
            label="주민등록번호"
            value={personal.residentId}
          />
          <InfoRow
            icon={CreditCard}
            label="은행 계좌"
            value={personal.bankAccount ?? "-"}
          />
          <InfoRow icon={MapPin} label="주소" value={personal.address} onEdit={onOpenEdit} />
          <InfoRow icon={Phone} label="휴대전화" value={personal.phone} onEdit={onOpenEdit} />
          <InfoRow icon={Mail} label="이메일" value={personal.email} onEdit={onOpenEdit} />
          <InfoRow icon={User} label="성별" value={personal.gender} />
          <InfoRow
            icon={Calendar}
            label="생년월일"
            value={personal.birthDate}
          />
          <InfoRow
            icon={Globe}
            label="국적"
            value={personal.nationality}
          />
          <InfoRow
            icon={Phone}
            label="비상연락처"
            value={personal.emergencyContact}
          />
        </Section>

        <Section
          title="고용 정보"
          action={
            onOpenEmploymentPayrollEdit ? (
              <Button variant="ghost" size="sm" className="gap-1 text-slate-600" onClick={onOpenEmploymentPayrollEdit}>
                <Pencil className="size-3.5" />
                수정
              </Button>
            ) : undefined
          }
        >
          <InfoRow icon={Briefcase} label="고용 형태" value={employment.type} />
          <InfoRow icon={Calendar} label="입사일" value={employment.joinDate} />
          <InfoRow
            icon={Calendar}
            label="수습 기간"
            value={
              employment.probationStart && employment.probationEnd
                ? `${employment.probationStart} ~ ${employment.probationEnd}`
                : "-"
            }
          />
          <InfoRow icon={Calendar} label="근속 기간" value={employment.tenure} />
          <InfoRow icon={Users} label="재직 상태" value={employment.status} />
        </Section>

        <Section
          title="급여 정보"
          action={
            onOpenEmploymentPayrollEdit ? (
              <Button variant="ghost" size="sm" className="gap-1 text-slate-600" onClick={onOpenEmploymentPayrollEdit}>
                <Pencil className="size-3.5" />
                수정
              </Button>
            ) : undefined
          }
        >
          <InfoRow
            icon={Banknote}
            label="급여 통장"
            value={payroll.salaryAccount}
          />
          <InfoRow icon={Banknote} label="급여 형태" value={payroll.salaryType} />
        </Section>

        {profile.role !== "C레벨" && (
        <Section title="휴가 정보">
          <div className="flex flex-wrap gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all duration-200 ease-in-out hover:shadow-sm">
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">
                발생 연차
              </p>
              <p className="font-semibold">{leave.granted}일</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">
                사용 연차
              </p>
              <p className="font-semibold">{leave.used}일</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">
                잔여 연차
              </p>
              <p className="font-semibold text-[var(--primary)]">
                {leave.remaining}일
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="self-end"
              onClick={() => onRequestLeaveTab?.()}
            >
              연차 확인
            </Button>
          </div>
        </Section>
        )}

        {/* 경력증명서 발급 — C레벨만 */}
        {isCLevel && (
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">경력증명서 발급</h3>
            <p className="text-xs text-slate-400 -mt-1">발급 받은 증명서는 최대 1회 다운로드 가능해요.</p>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium text-slate-700">
                  발급 사유 <span className="text-red-500">*</span>
                </Label>
                <Select value={careerPurpose} onValueChange={(v) => { setCareerPurpose(v); setCareerPurposeError(false); }}>
                  <SelectTrigger className={cn("w-full", careerPurposeError && "border-red-400 ring-1 ring-red-400")}>
                    <SelectValue placeholder="발급 사유 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-lg">
                    {ISSUE_PURPOSES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {careerPurposeError && <p className="text-xs text-red-500">발급 사유를 선택해 주세요.</p>}
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">직인 설정</p>
                <div className="flex gap-6">
                  {(["digital", "physical"] as const).map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input type="radio" name="career-seal" value={v} checked={careerSealType === v} onChange={() => setCareerSealType(v)} className="size-4" />
                      {v === "digital" ? "전자 직인 사용" : "실물 직인 사용"}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">비고</p>
                  <span className="text-xs text-slate-400">{careerMemo.length}/60</span>
                </div>
                <textarea
                  value={careerMemo}
                  onChange={(e) => setCareerMemo(e.target.value.slice(0, 60))}
                  rows={2}
                  placeholder="증명서에 추가 정보를 작성하여 발급할 수 있어요."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none resize-none"
                />
              </div>
              <Button
                className="w-full bg-emerald-500 font-semibold text-white hover:bg-emerald-600"
                onClick={handleCareerDownload}
                disabled={isCareerDownloading}
              >
                {isCareerDownloading ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" />PDF 생성 중…</>
                ) : (
                  <><FileDown className="mr-2 size-4" />발급 받기</>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* 문서 발급 (Documents) — 본인만 */}
        {isOwnProfile && (
          <div
            ref={documentsSectionRef}
            className="rounded-xl border border-slate-100 bg-slate-50 p-4"
          >
            <h3 className="mb-3 text-sm font-semibold text-slate-700">재직증명서 발급</h3>
            <p className="text-xs text-slate-400 -mt-1">발급 받은 증명서는 최대 1회 다운로드 가능해요.</p>
            <div className="space-y-4">
              {/* 발급 사유 */}
              <div className="space-y-1">
                <Label htmlFor="issue-purpose" className="text-sm font-medium text-slate-700">
                  발급 사유 <span className="text-red-500">*</span>
                </Label>
                <Select value={issuePurpose} onValueChange={(v) => { setIssuePurpose(v); setPurposeError(false); }}>
                  <SelectTrigger id="issue-purpose" className={cn("w-full", purposeError && "border-red-400 ring-1 ring-red-400")}>
                    <SelectValue placeholder="발급 사유 선택" />
                  </SelectTrigger>
                  <SelectContent className="bg-white shadow-lg">
                    {ISSUE_PURPOSES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {purposeError && <p className="text-xs text-red-500">발급 사유를 선택해 주세요.</p>}
              </div>

              {/* 추가 정보 */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">추가 정보</p>
                <div className="flex gap-6">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={includeResidentId} onChange={(e) => setIncludeResidentId(e.target.checked)} className="size-4 rounded" />
                    주민등록번호
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={includeJoinDate} onChange={(e) => setIncludeJoinDate(e.target.checked)} className="size-4 rounded" />
                    그룹 입사일
                  </label>
                </div>
              </div>

              {/* 직인 설정 */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">직인 설정</p>
                <div className="flex gap-6">
                  {(["digital", "physical"] as const).map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input type="radio" name="seal" value={v} checked={sealType === v} onChange={() => setSealType(v)} className="size-4" />
                      {v === "digital" ? "전자 직인 사용" : "실물 직인 사용"}
                    </label>
                  ))}
                </div>
              </div>

              {/* 언어 설정 */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">언어 설정</p>
                <div className="flex gap-6">
                  {(["ko", "en"] as const).map((v) => (
                    <label key={v} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                      <input type="radio" name="lang" value={v} checked={language === v} onChange={() => setLanguage(v)} className="size-4" />
                      {v === "ko" ? "한국어" : "영어"}
                    </label>
                  ))}
                </div>
              </div>

              {/* 비고 */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">비고</p>
                  <span className="text-xs text-slate-400">{memo.length}/60</span>
                </div>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value.slice(0, 60))}
                  rows={2}
                  placeholder="증명서에 추가 정보를 작성하여 발급할 수 있어요."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none resize-none"
                />
              </div>

              <Button
                className="w-full bg-emerald-500 font-semibold text-white hover:bg-emerald-600"
                onClick={handleDownload}
                disabled={isDownloading}
              >
                {isDownloading ? (
                  <><Loader2 className="mr-2 size-4 animate-spin" />PDF 생성 중…</>
                ) : (
                  <><FileDown className="mr-2 size-4" />발급 받기</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Toast: 우측 하단 */}
      {toastVisible && (
        <div
          className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-3 shadow-lg"
          role="status"
        >
          <span className="text-emerald-600">✅</span>
          <p className="text-sm font-medium text-slate-800">
            재직증명서가 성공적으로 발급되었습니다.
          </p>
        </div>
      )}
    </div>
  );
}

function Globe({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">
          {title}
        </h3>
        {action}
      </div>
      <div className="rounded-3xl border border-white/40 bg-white/80 px-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)]">
        {children}
      </div>
    </div>
  );
}

function SidePanel({
  profile,
  isOwnProfile,
  onOpenEdit,
}: {
  profile: EmployeeDetailProfile;
  isOwnProfile?: boolean;
  onOpenEdit?: () => void;
}) {
  const { employment, jobTags } = profile;

  return (
    <div className="min-h-0 overflow-y-auto border-t border-slate-100 bg-white p-6 scrollbar-hide md:border-l md:border-t-0">
      <div className="space-y-6">
        {/* 현재 근속 일수 - 토스 스타일 하이라이트 */}
        <div className="interactive-card rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            현재 근속 일수
          </h4>
          <p className="mb-3 text-4xl font-extrabold text-blue-500">
            {employment.tenureDays}일
          </p>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (employment.tenureDays / employment.tenureMaxDays) * 100
                )}%`,
              }}
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {employment.tenure}
          </p>
        </div>

        {/* 직무 태그 */}
        <div className="interactive-card rounded-3xl border border-white/40 bg-white/80 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            다루어본 직무
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {jobTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
              >
                {tag}
              </span>
            ))}
            {isOwnProfile && onOpenEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={onOpenEdit}
              >
                수정
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-[var(--muted-foreground)]">
      <p className="text-sm">{label} 탭 내용 (추후 구현)</p>
    </div>
  );
}
