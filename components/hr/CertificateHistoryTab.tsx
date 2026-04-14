"use client";

import { useState, useEffect } from "react";
import { FileSignature, FileCheck, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";

type Issuance = {
  id: string;
  employee_name: string;
  certificate_type: "employment" | "career";
  purpose: string;
  language: string;
  seal_type: string;
  memo: string;
  issued_by_name: string;
  created_at: string;
};

const PURPOSE_LABELS: Record<string, string> = {
  financial: "금융기관 제출",
  government: "관공서 제출",
  personal: "개인 소장",
};

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  employment: { label: "재직증명서", color: "bg-blue-50 text-blue-700" },
  career: { label: "경력증명서", color: "bg-emerald-50 text-emerald-700" },
};

export function CertificateHistoryTab() {
  const [records, setRecords] = useState<Issuance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/certificate-issuances")
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRecords(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="text-center py-20">
        <FileSignature className="size-12 text-slate-200 mx-auto mb-3" />
        <p className="text-sm text-slate-400">발행 내역이 없습니다</p>
        <p className="text-xs text-slate-300 mt-1">증명서를 발급하면 여기에 기록됩니다</p>
      </div>
    );
  }

  // 월별 그룹핑
  const grouped: Record<string, Issuance[]> = {};
  for (const r of records) {
    const month = r.created_at.slice(0, 7);
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push(r);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-800">증명서 발행 내역</h2>
        <span className="text-xs text-slate-400">총 {records.length}건</span>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{records.length}</p>
          <p className="text-xs text-slate-400 mt-1">전체 발행</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-600">{records.filter(r => r.certificate_type === "employment").length}</p>
          <p className="text-xs text-slate-400 mt-1">재직증명서</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{records.filter(r => r.certificate_type === "career").length}</p>
          <p className="text-xs text-slate-400 mt-1">경력증명서</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-slate-600">{new Set(records.map(r => r.employee_name)).size}</p>
          <p className="text-xs text-slate-400 mt-1">발급 대상 인원</p>
        </div>
      </div>

      {/* 월별 목록 */}
      {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([month, items]) => (
        <div key={month}>
          <h3 className="text-sm font-semibold text-slate-500 mb-2">{month.replace("-", "년 ")}월</h3>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
            {items.map(r => {
              const typeInfo = TYPE_LABELS[r.certificate_type] ?? { label: r.certificate_type, color: "bg-slate-50 text-slate-600" };
              return (
                <div key={r.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-50">
                    {r.certificate_type === "employment"
                      ? <FileCheck className="size-4 text-blue-500" />
                      : <FileSignature className="size-4 text-emerald-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{r.employee_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                      {r.language === "en" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">영문</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400">{PURPOSE_LABELS[r.purpose] ?? r.purpose}</span>
                      {r.memo && <span className="text-xs text-slate-300">· {r.memo}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-slate-500">{format(parseISO(r.created_at), "M/d (EEE)", { locale: ko })}</p>
                    <p className="text-[10px] text-slate-300">{format(parseISO(r.created_at), "HH:mm")}</p>
                    {r.issued_by_name && r.issued_by_name !== r.employee_name && (
                      <p className="text-[10px] text-slate-300">by {r.issued_by_name}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
