"use client";

import "react-day-picker/style.css";
import { useState } from "react";
import { DayPicker } from "react-day-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ko } from "date-fns/locale";
import { format } from "date-fns";
interface AnnualLeavePlanModalProps {
  open: boolean;
  onClose: () => void;
  remainingDays: number;
  userId: string;
  userName: string;
  department: string;
  onSubmit: (selectedDates: Date[]) => void;
}

export function AnnualLeavePlanModal({
  open,
  onClose,
  remainingDays,
  userId,
  userName,
  department,
  onSubmit,
}: AnnualLeavePlanModalProps) {
  const [selected, setSelected] = useState<Date[] | undefined>([]);

  const canSubmit = selected && selected.length === remainingDays;

  const handleSubmit = () => {
    if (!selected || selected.length !== remainingDays) return;
    const sorted = [...selected].sort((a, b) => a.getTime() - b.getTime());
    onSubmit(sorted);
    setSelected([]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (onClose(), setSelected([]))}>
      <DialogContent className="max-w-[600px] bg-white/98 backdrop-blur-2xl border border-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)]">
        <DialogHeader>
          <DialogTitle>연차 사용 계획서 제출</DialogTitle>
          <DialogDescription>
            근로기준법 제61조에 따라 잔여 연차 사용 계획을 제출해 주세요.
            미사용 시 수당이 지급되지 않습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-slate-600">
            잔여 <span className="font-bold text-amber-600">{remainingDays}일</span>에
            해당하는 날짜를 달력에서 선택해 주세요.
          </p>
          <div className="flex justify-center [&_.rdp]:select-none">
            <DayPicker
              mode="multiple"
              selected={selected}
              onSelect={setSelected}
              min={remainingDays}
              max={remainingDays}
              locale={ko}
              disabled={{ before: new Date() }}
              defaultMonth={new Date()}
              className="rounded-lg border border-[var(--border)] p-4"
            />
          </div>
          {selected && selected.length > 0 && (
            <p className="text-sm text-slate-600">
              선택: {selected.length}일 / {remainingDays}일
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-amber-600 text-white hover:bg-amber-700"
          >
            제출 완료
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
