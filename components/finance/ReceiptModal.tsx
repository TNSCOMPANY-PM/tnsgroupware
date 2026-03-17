"use client";

import { useState } from "react";
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

export type ReceiptData = {
  company_name?: string;
  representative?: string;
  business_number?: string;
  address?: string;
  phone?: string;
  business_type?: string;
  business_category?: string;
  tax_email?: string;
  item?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  financeId: string;
  amount: number;
  clientName: string;
  date: string;
  initialData?: ReceiptData | null;
  onSaved?: (data: ReceiptData) => void;
};

const EMPTY: ReceiptData = {
  company_name: "",
  representative: "",
  business_number: "",
  address: "",
  phone: "",
  business_type: "",
  business_category: "",
  tax_email: "",
  item: "",
};

function formatWon(n: number) {
  return n.toLocaleString("ko-KR");
}

export function ReceiptModal({
  open,
  onOpenChange,
  financeId,
  amount,
  clientName,
  date,
  initialData,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ReceiptData>(() => ({ ...EMPTY, ...initialData }));

  const set = (k: keyof ReceiptData, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // initialData가 바뀌면 form 동기화
  const handleOpen = (o: boolean) => {
    if (o) {
      setForm({ ...EMPTY, ...initialData });
      setEditing(!initialData?.company_name); // 처음엔 빈 상태면 편집 모드로
    }
    onOpenChange(o);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/${financeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt_data: form }),
      });
      if (res.ok) {
        onSaved?.(form);
        setEditing(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "저장 실패");
      }
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, key: keyof ReceiptData, placeholder = "") => (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <Label className="text-sm font-medium text-slate-600 text-right">{label}</Label>
      {editing ? (
        <Input
          value={form[key] ?? ""}
          onChange={(e) => set(key, e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
        />
      ) : (
        <span className="text-sm text-slate-800">{form[key] || <span className="text-slate-300">-</span>}</span>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {editing ? "✏️ 영수증 정보 입력" : "🧾 세금계산서 발행 내역"}
          </DialogTitle>
        </DialogHeader>

        {!editing ? (
          /* ── 영수증 조회 뷰 ── */
          <div className="space-y-0 rounded-xl border border-slate-200 bg-white p-5">
            {/* 헤더 */}
            <div className="mb-4 border-b border-slate-200 pb-3">
              <p className="text-center text-[11px] font-semibold tracking-widest text-slate-400 uppercase">RECEIPT</p>
              <p className="mt-1 text-center text-xl font-bold text-slate-900">
                {form.company_name || clientName || "-"}
              </p>
            </div>

            {/* 사업자 정보 */}
            <div className="space-y-1.5 text-sm">
              <Row label="대표 명" value={form.representative} />
              <Row label="사업자등록번호" value={form.business_number} />
              <Row label="주소" value={form.address} />
              <Row label="전화번호" value={form.phone} />
            </div>

            <div className="my-3 border-t border-dashed border-slate-200" />

            <div className="space-y-1.5 text-sm">
              <Row label="업태" value={form.business_type} />
              <Row label="종목" value={form.business_category} />
            </div>

            <div className="my-3 border-t border-dashed border-slate-200" />

            <div className="space-y-1.5 text-sm">
              <Row label="입금자 명" value={clientName} />
              <Row label="세금계산서 이메일" value={form.tax_email} />
            </div>

            <div className="my-3 border-t border-slate-300" />

            {/* 품목·금액 */}
            <div className="space-y-1.5 text-sm">
              <Row label="품목" value={form.item} />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">금액 [VAT포함]</span>
                <span className="text-lg font-bold text-slate-900">{formatWon(amount)}원</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>공급가액</span>
                <span>{formatWon(Math.round(amount / 1.1))}원</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>세액 (10%)</span>
                <span>{formatWon(amount - Math.round(amount / 1.1))}원</span>
              </div>
            </div>

            <div className="mt-3 border-t border-slate-200 pt-2 text-center text-xs text-slate-400">
              {date}
            </div>
          </div>
        ) : (
          /* ── 편집 뷰 ── */
          <div className="space-y-3 py-1">
            {field("상호명", "company_name", "닥터투데이")}
            {field("대표명", "representative", "홍길동")}
            {field("사업자등록번호", "business_number", "000-00-00000")}
            {field("주소", "address", "경기도 안양시 ...")}
            {field("전화번호", "phone", "031-000-0000")}
            <div className="my-1 border-t border-dashed border-slate-200" />
            {field("업태", "business_type", "도소매")}
            {field("종목", "business_category", "생활용품")}
            <div className="my-1 border-t border-dashed border-slate-200" />
            {field("세금계산서 이메일", "tax_email", "example@email.com")}
            {field("품목", "item", "마케팅대행")}
            <div className="mt-1 grid grid-cols-[140px_1fr] items-center gap-2">
              <Label className="text-sm font-medium text-slate-600 text-right">금액 [VAT포함]</Label>
              <span className="text-sm font-bold text-slate-800">{formatWon(amount)}원</span>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
              <Button onClick={() => setEditing(true)}>✏️ 편집</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setForm({ ...EMPTY, ...initialData }); }}>취소</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "저장 중..." : "💾 저장"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-[120px] shrink-0 text-slate-500">{label}</span>
      <span className="text-slate-800">{value || <span className="text-slate-300">-</span>}</span>
    </div>
  );
}
