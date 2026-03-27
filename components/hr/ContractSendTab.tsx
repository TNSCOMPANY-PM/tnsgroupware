"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, FileText, FileCheck, X } from "lucide-react";
import {
  CONTRACT_TYPE_LABELS,
  SALARY_FIELDS,
  EMPLOYMENT_FIELDS,
  buildContentByType,
} from "@/lib/contractForms";
import {
  formatNumberWithComma,
  parseCommaNumber,
  formatAmountKorean,
  birthDateKoToIso,
} from "@/lib/contractFormUtils";
import { ContractDocument, A4Page } from "@/lib/contractTemplates";
import type { ContractType } from "@/types/contract";
import type { ContractRow } from "@/types/contract";
import type { Employee } from "@/types/employee";
import { getProfileForEmployee } from "@/constants/profile";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

/** 직원 표시용 부서 반환 (display_department 우선) */
function getDisplayDepartment(emp: Employee): string {
  return emp.display_department ?? emp.department;
}

const CONTRACT_TYPES: ContractType[] = [
  "salary",
  "employment",
  "privacy",
  "non_compete",
  "nda",
];

const DEFAULT_MONTHLY_MEAL = 200_000;

interface ContractSendTabProps {
  employees: Employee[];
  onSuccess?: () => void;
}

export function ContractSendTab({ employees, onSuccess }: ContractSendTabProps) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [contractType, setContractType] = useState<ContractType>("salary");
  const [selectedContractForPopup, setSelectedContractForPopup] = useState<ContractRow | null>(null);
  const [previousContracts, setPreviousContracts] = useState<ContractRow[]>([]);
  const [form, setForm] = useState<Record<string, string | number>>({
    employeeName: "",
    birthDate: "",
    startDate: "",
    endDate: "",
    totalAnnual: "",
    monthlyBase: "",
    monthlyMeal: DEFAULT_MONTHLY_MEAL,
    probationEndDate: "",
    mainWork: "",
  });

  const setBirthDateFromProfile = useCallback((emp: Employee | undefined) => {
    if (!emp) return;
    const profile = getProfileForEmployee(emp);
    const iso = birthDateKoToIso(profile.personal?.birthDate);
    if (iso) {
      setForm((prev) => ({ ...prev, birthDate: iso }));
    }
  }, []);

  useEffect(() => {
    if (!employeeId) {
      setPreviousContracts([]);
      return;
    }
    const emp = employees.find((e) => e.id === employeeId);
    if (emp) {
      setForm((prev) => ({ ...prev, employeeName: emp.name ?? "" }));
      setBirthDateFromProfile(emp);
    }
    fetch(`/api/contracts?employee_id=${employeeId}`)
      .then((r) => r.json())
      .then((data) => setPreviousContracts(Array.isArray(data) ? data : []))
      .catch(() => setPreviousContracts([]));
  }, [employeeId, employees, setBirthDateFromProfile]);

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  useEffect(() => {
    if (contractType !== "salary") return;
    const total = typeof form.totalAnnual === "number" ? form.totalAnnual : parseCommaNumber(String(form.totalAnnual));
    const meal = typeof form.monthlyMeal === "number" ? form.monthlyMeal : parseCommaNumber(String(form.monthlyMeal)) || DEFAULT_MONTHLY_MEAL;
    if (total > 0) {
      const base = Math.round((total - 12 * meal) / 12);
      setForm((prev) => ({ ...prev, monthlyBase: base >= 0 ? base : 0 }));
    }
  }, [contractType, form.totalAnnual, form.monthlyMeal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId) return;
    setSending(true);
    try {
      const content = buildContentByType(contractType, form);
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          contract_type: contractType,
          content,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = err?.code === "CONTRACTS_TABLE_MISSING" ? err?.error : (err?.error ?? "발송 실패");
        throw new Error(message);
      }
      onSuccess?.();
      router.push("/hr?tab=contracts");
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  const isOath = contractType === "privacy" || contractType === "non_compete" || contractType === "nda";
  const dynamicFields =
    contractType === "salary"
      ? SALARY_FIELDS
      : contractType === "employment"
        ? EMPLOYMENT_FIELDS
        : [];

  const handleNumberChange = (key: string, displayValue: string) => {
    const num = parseCommaNumber(displayValue);
    setForm((prev) => ({ ...prev, [key]: displayValue === "" ? "" : num }));
  };

  return (
    <div className="flex gap-6">
      {/* 좌측: 선택한 직원의 이전 계약서 */}
      <aside className="w-72 shrink-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <FileCheck className="size-4" />
          이전 계약서
        </h3>
        {!employeeId ? (
          <p className="text-xs text-slate-500">우측에서 직원을 선택하면 해당 직원의 이전 계약서가 여기에 표시됩니다.</p>
        ) : (
          <ul className="space-y-2">
            {previousContracts.map((c) => (
              <li
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedContractForPopup(c)}
                onKeyDown={(e) => e.key === "Enter" && setSelectedContractForPopup(c)}
                className="cursor-pointer rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 text-sm transition hover:border-slate-200 hover:bg-slate-100"
              >
                <p className="font-medium text-slate-800">
                  {CONTRACT_TYPE_LABELS[c.contract_type as keyof typeof CONTRACT_TYPE_LABELS]}
                </p>
                <p className="text-xs text-slate-600">
                  {c.status === "signed" ? "서명완료" : "대기"}
                  {c.created_at && ` · ${format(new Date(c.created_at), "yyyy.MM.dd", { locale: ko })}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* 계약서 상세 팝업 */}
      {selectedContractForPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedContractForPopup(null)}
          role="dialog"
          aria-modal="true"
          aria-label="계약서 보기"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-[900px] flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <h4 className="font-semibold text-slate-800">
                {CONTRACT_TYPE_LABELS[selectedContractForPopup.contract_type as keyof typeof CONTRACT_TYPE_LABELS]}
                {selectedContractForPopup.created_at && (
                  <span className="ml-2 text-sm font-normal text-slate-500">
                    {format(new Date(selectedContractForPopup.created_at), "yyyy.MM.dd", { locale: ko })}
                  </span>
                )}
              </h4>
              <button
                type="button"
                onClick={() => setSelectedContractForPopup(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                aria-label="닫기"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <A4Page>
                <ContractDocument contract={selectedContractForPopup} />
              </A4Page>
            </div>
          </div>
        </div>
      )}

      {/* 우측: 발송 폼 */}
      <div className="min-w-0 flex-1">
        <h2 className="mb-6 flex items-center gap-2 text-xl font-semibold text-slate-800">
          <FileText className="size-6" />
          계약서 발송
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">직원 선택</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
            required
          >
            <option value="">선택하세요</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({getDisplayDepartment(emp)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">계약서 유형</label>
          <select
            value={contractType}
            onChange={(e) => setContractType(e.target.value as ContractType)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-800"
          >
            {CONTRACT_TYPES.map((t) => (
              <option key={t} value={t}>
                {CONTRACT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">성명</label>
            <input
              type="text"
              value={form.employeeName}
              onChange={(e) => setForm((p) => ({ ...p, employeeName: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">생년월일</label>
            <input
              type="date"
              value={String(form.birthDate ?? "")}
              onChange={(e) => setForm((p) => ({ ...p, birthDate: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
              required
            />
          </div>
        </div>

        {!isOath &&
          dynamicFields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {f.label}
                {"optional" in f && f.optional ? " (선택)" : null}
              </label>
              {f.type === "date" ? (
                <input
                  type="date"
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  required={!("optional" in f && f.optional)}
                />
              ) : f.type === "number" ? (
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatNumberWithComma(form[f.key])}
                    onChange={(e) => handleNumberChange(f.key, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2"
                    required={!("optional" in f && f.optional)}
                  />
                  <p className="mt-1 text-sm text-slate-500">
                    {formatAmountKorean(form[f.key])}
                  </p>
                </div>
              ) : (
                <input
                  type="text"
                  value={String(form[f.key] ?? "")}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                  required={!("optional" in f && f.optional)}
                />
              )}
            </div>
          ))}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="submit"
            disabled={sending}
            className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-white hover:bg-slate-900 disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Send className="size-5" />
            )}
            계약서 발송
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}
