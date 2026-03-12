"use client";

import "react-day-picker/style.css";
import { useState, useMemo } from "react";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { UserRole } from "@/constants/users";

const DEPARTMENTS = [
  { value: "마케팅사업부", label: "마케팅사업부" },
  { value: "경영지원", label: "경영지원" },
  { value: "경영", label: "경영" },
] as const;

const ROLES: { value: UserRole; label: string }[] = [
  { value: "사원", label: "사원" },
  { value: "팀장", label: "팀장" },
  { value: "C레벨", label: "C레벨" },
];

function toIdSegment(date: Date): string {
  return format(date, "yyyyMMdd");
}

export interface NewEmployeeFormData {
  name: string;
  hireDate: Date | undefined;
  department: string;
  role: UserRole;
  /** 발급된 사번 (TNS-YYYYMMDD-01) */
  generatedId: string;
}

interface NewEmployeeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 성공 시 부모에서 모달을 닫고 리스트를 새로고침합니다. avatarFile이 있으면 등록 후 업로드·avatar_url 반영. */
  onSubmit: (data: NewEmployeeFormData, avatarFile?: File) => void | Promise<void>;
}

export function NewEmployeeModal({
  open,
  onOpenChange,
  onSubmit,
}: NewEmployeeModalProps) {
  const [name, setName] = useState("");
  const [hireDate, setHireDate] = useState<Date | undefined>(undefined);
  const [department, setDepartment] = useState("마케팅사업부");
  const [role, setRole] = useState<UserRole>("사원");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const generatedId = useMemo(() => {
    if (!hireDate) return "";
    return `TNS-${toIdSegment(hireDate)}-01`;
  }, [hireDate]);

  const resetForm = () => {
    setName("");
    setHireDate(undefined);
    setDepartment("마케팅사업부");
    setRole("사원");
    setAvatarFile(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !hireDate) return;
    setLoading(true);
    try {
      await onSubmit(
        {
          name: name.trim(),
          hireDate,
          department,
          role,
          generatedId: `TNS-${toIdSegment(hireDate)}-01`,
        },
        avatarFile ?? undefined
      );
      resetForm();
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = name.trim().length > 0 && !!hireDate;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[480px] rounded-2xl border border-white/40 bg-white/90 p-6 shadow-2xl backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-slate-800">
            신규 사원 등록
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {/* 발급될 사번 (읽기 전용) */}
          {generatedId && (
            <div className="space-y-2">
              <Label className="text-slate-600">발급될 사번 (ID)</Label>
              <Input
                readOnly
                value={generatedId}
                className="bg-slate-50 font-mono text-slate-700"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="new-employee-name">이름</Label>
            <Input
              id="new-employee-name"
              placeholder="이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>입사일</Label>
            <div className="flex justify-center [&_.rdp]:select-none">
              <DayPicker
                mode="single"
                selected={hireDate}
                onSelect={setHireDate}
                locale={ko}
                defaultMonth={new Date()}
                className="rounded-lg border border-[var(--border)] bg-white/80 p-3"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>소속 부서</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger>
                <SelectValue placeholder="부서 선택" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>직급/권한</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue placeholder="직급 선택" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-slate-600">프로필 사진 (선택)</Label>
            <input
              type="file"
              accept="image/*"
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary)]/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--primary)]"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <p className="text-xs text-slate-400">
            초기 비밀번호는 <span className="font-medium text-slate-500">tns1234!</span>로 임시 발급됩니다.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || loading}
            className="bg-[var(--primary)] text-white"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                생성 중...
              </>
            ) : (
              "계정 생성"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
