"use client";

import { useState, useEffect } from "react";
import { usePermission } from "@/contexts/PermissionContext";
import { formatWonIntl } from "@/utils/formatWon";
import { Loader2, FileText, ChevronDown, ChevronRight } from "lucide-react";

interface Contract {
  id: string;
  contract_type: "salary" | "employment" | "privacy" | "non_compete" | "nda";
  content: Record<string, unknown>;
  status: "pending" | "signed";
  signed_at: string | null;
  created_at: string;
}

interface EmployeeRow {
  id: string;
  name: string;
  department: string;
  role: string;
}

function PayslipCard({ contract, employeeName }: { contract: Contract; employeeName: string }) {
  const [open, setOpen] = useState(false);
  const c = contract.content;

  const totalAnnual = Number(c.totalAnnual) || 0;
  const monthlyBase = Number(c.monthlyBase) || 0;
  const monthlyMeal = Number(c.monthlyMeal) || 0;
  const monthlyGross = monthlyBase + monthlyMeal;

  // 4대보험 + 소득세 간이 계산 (실제 적용 시 정확한 요율 사용)
  const nationalPension = Math.round(monthlyBase * 0.045);   // 국민연금 4.5%
  const healthInsurance = Math.round(monthlyBase * 0.03545); // 건강보험 3.545%
  const longTermCare = Math.round(healthInsurance * 0.1281); // 장기요양 12.81%
  const employmentInsurance = Math.round(monthlyBase * 0.009); // 고용보험 0.9%
  const totalInsurance = nationalPension + healthInsurance + longTermCare + employmentInsurance;
  // 소득세 간이 (기본공제 150만원 이하 구간 단순 계산)
  const incomeTax = Math.max(0, Math.round((monthlyBase - 1_500_000) * 0.06));
  const localIncomeTax = Math.round(incomeTax * 0.1);
  const totalDeduction = totalInsurance + incomeTax + localIncomeTax;
  const netPay = monthlyGross - totalDeduction;

  const signedDate = contract.signed_at ? new Date(contract.signed_at).toLocaleDateString("ko-KR") : "-";
  const label = contract.contract_type === "salary" ? "연봉계약서" : "근로계약서";
  const period = c.startDate ? `${String(c.startDate)} ~ ${String(c.endDate ?? "무기한")}` : "-";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
      >
        <div className="flex items-center gap-3">
          <FileText className="size-4 text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-800">{employeeName} · {label}</p>
            <p className="text-xs text-slate-500">서명일: {signedDate} · 계약기간: {period}</p>
          </div>
        </div>
        {open ? <ChevronDown className="size-4 text-slate-400" /> : <ChevronRight className="size-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* 지급 내역 */}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">지급 내역</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">연봉 총액</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(totalAnnual)}원</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">월 기본급</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(monthlyBase)}원</td>
                  </tr>
                  {monthlyMeal > 0 && (
                    <tr className="border-b border-slate-100">
                      <td className="px-3 py-2 text-slate-600">월 식비</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatWonIntl(monthlyMeal)}원</td>
                    </tr>
                  )}
                  <tr className="bg-emerald-50/50">
                    <td className="px-3 py-2 font-semibold text-emerald-800">총 지급액</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-800">{formatWonIntl(monthlyGross)}원</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 공제 내역 (간이) */}
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">공제 내역 (간이 추정)</div>
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">국민연금 (4.5%)</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(nationalPension)}원</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">건강보험 (3.545%)</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(healthInsurance)}원</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">장기요양보험</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(longTermCare)}원</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">고용보험 (0.9%)</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(employmentInsurance)}원</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">소득세 (간이)</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(incomeTax)}원</td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-600">지방소득세</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">-{formatWonIntl(localIncomeTax)}원</td>
                  </tr>
                  <tr className="bg-rose-50/50">
                    <td className="px-3 py-2 font-semibold text-rose-800">총 공제액</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-rose-800">-{formatWonIntl(totalDeduction)}원</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <span className="text-sm font-semibold text-blue-800">예상 실수령액 (월)</span>
            <span className="text-lg font-bold tabular-nums text-blue-900">{formatWonIntl(netPay)}원</span>
          </div>
          <p className="mt-2 text-xs text-slate-400">* 공제 내역은 간이 추정값입니다. 실제 원천징수 금액과 다를 수 있습니다.</p>
        </div>
      )}
    </div>
  );
}

export function PayslipTab() {
  const { currentUserId, isCLevel } = usePermission();
  const [contracts, setContracts] = useState<(Contract & { employeeName: string })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadContracts = async () => {
      setLoading(true);
      try {
        if (isCLevel) {
          // C레벨: 모든 직원의 서명된 연봉/근로 계약서 조회
          const [contRes, empRes] = await Promise.all([
            fetch("/api/contracts?all=true&status=signed&type=salary,employment"),
            fetch("/api/employees"),
          ]);
          const contData = contRes.ok ? await contRes.json() : [];
          const empData = empRes.ok ? await empRes.json() : [];
          const empMap = new Map<string, string>(
            (empData as EmployeeRow[]).map((e) => [e.id, e.name])
          );
          const filtered = (Array.isArray(contData) ? contData : []) as (Contract & { employee_id: string })[];
          setContracts(
            filtered.map((c) => ({
              ...c,
              employeeName: empMap.get(c.employee_id) ?? String(c.content?.employeeName ?? "알 수 없음"),
            }))
          );
        } else {
          // 일반 직원: 본인 계약서만
          const res = await fetch("/api/contracts/me");
          const data = res.ok ? await res.json() : [];
          const filtered = (Array.isArray(data) ? data : []) as Contract[];
          setContracts(
            filtered
              .filter((c) => (c.contract_type === "salary" || c.contract_type === "employment") && c.status === "signed")
              .map((c) => ({ ...c, employeeName: String(c.content?.employeeName ?? "나") }))
          );
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    void loadContracts();
  }, [isCLevel, currentUserId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
        서명 완료된 연봉계약서·근로계약서 기준으로 예상 급여 명세를 표시합니다.
        {isCLevel && <span className="ml-1 text-slate-500">(C레벨: 전 직원 조회)</span>}
      </div>

      {contracts.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center">
          <FileText className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm text-slate-500">서명된 계약서가 없습니다.</p>
          <p className="mt-1 text-xs text-slate-400">전자계약 탭에서 계약서를 발송하고 서명하면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contracts.map((c) => (
            <PayslipCard key={c.id} contract={c} employeeName={c.employeeName} />
          ))}
        </div>
      )}
    </div>
  );
}
