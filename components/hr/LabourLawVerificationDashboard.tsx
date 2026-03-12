"use client";

import { useState, useMemo } from "react";
import {
  calculateAnnualLeave,
  REFERENCE_DATE,
} from "@/utils/leaveCalculator";
import { Input } from "@/components/ui/input";
import { differenceInYears, differenceInMonths } from "date-fns";

const REF = REFERENCE_DATE;

function parseDateStr(s: string): string {
  const normalized = s.replace(/\./g, "-").trim();
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return s;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function formatJoinDisplay(s: string): string {
  return s.replace(/-/g, ".");
}

function getTenureStr(joinStr: string): string {
  try {
    const join = new Date(joinStr.replace(/\./g, "-"));
    if (join.getTime() > REF.getTime()) return "-";
    const years = differenceInYears(REF, join);
    const months = differenceInMonths(REF, join) % 12;
    if (years > 0) return `${years}년 ${months}개월`;
    return `${months}개월`;
  } catch {
    return "-";
  }
}

const VERIFICATION_CASES = [
  { name: "신입(1개월 미만)", joinDate: "2026-02-15", expected: 0, used: 0 },
  { name: "신입(6개월 차)", joinDate: "2025-09-01", expected: 6, used: 0 },
  { name: "만 1년 경과", joinDate: "2024-12-01", expected: 15, used: 0 },
  { name: "만 3년 경과(가산 발생)", joinDate: "2022-03-01", expected: 16, used: 0 },
  { name: "장기 근속", joinDate: "2018-05-20", expected: 18, used: 0 },
];

export function LabourLawVerificationDashboard() {
  const [rows, setRows] = useState(
    VERIFICATION_CASES.map((c) => ({
      name: c.name,
      joinDate: c.joinDate.replace(/-/g, "."),
      used: c.used,
    }))
  );

  const handleJoinChange = (idx: number, value: string) => {
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, joinDate: value } : r
      )
    );
  };

  const handleUsedChange = (idx: number, value: string) => {
    const n = parseInt(value, 10);
    setRows((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, used: isNaN(n) ? 0 : n } : r
      )
    );
  };

  return (
    <div className="rounded-2xl border border-white/40 bg-white/60 backdrop-blur-xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-4">
        <h3 className="fluid-title text-lg font-bold tracking-tighter">
          노동법 엔진 검증 대시보드
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          기준일: {REF.getFullYear()}년 {REF.getMonth() + 1}월 {REF.getDate()}일 · 입사일을 수정하면 연차가 실시간으로 반영됩니다
        </p>
      </div>

      <div className="overflow-hidden rounded-xl glass-card">
        <table className="w-full font-sans">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">
                이름
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">
                입사일
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600">
                현재 근속기간
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                법정 발생 연차
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                사용 연차
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                잔여 연차
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const parsed = parseDateStr(row.joinDate);
              const { granted, bonusDays } = calculateAnnualLeave(parsed, REF);
              const remaining = granted - row.used;

              return (
                <tr
                  key={idx}
                  className="border-b border-slate-100 transition-colors hover:bg-slate-50/50"
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    {row.name}
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      value={row.joinDate}
                      onChange={(e) => handleJoinChange(idx, e.target.value)}
                      className="h-9 w-[120px] text-sm focus:ring-2 focus:ring-emerald-500/50"
                      placeholder="YYYY.MM.DD"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {getTenureStr(parsed)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800">{granted}일</span>
                      {bonusDays > 0 && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                          +{bonusDays}일 가산
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Input
                      type="number"
                      min={0}
                      value={row.used}
                      onChange={(e) => handleUsedChange(idx, e.target.value)}
                      className="h-9 w-16 text-right text-sm focus:ring-2 focus:ring-emerald-500/50"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                    {remaining}일
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 rounded-lg bg-slate-100/80 px-4 py-3">
        <span className="text-xs font-medium text-slate-600">검증 케이스:</span>
        {VERIFICATION_CASES.map((c, i) => (
          <span
            key={i}
            className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600 shadow-sm"
          >
            {c.name} → 예상 {c.expected}일
          </span>
        ))}
      </div>
    </div>
  );
}
