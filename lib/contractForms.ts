import type {
  ContractType,
  SalaryContractContent,
  EmploymentContractContent,
  OathContractContent,
  ContractContent,
} from "@/types/contract";

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  salary: "연봉계약서",
  employment: "근로계약서",
  privacy: "개인정보 이용동의서",
  non_compete: "경업금지서약서",
  nda: "비밀유지서약서",
};

/** 연봉계약서 필드 */
export const SALARY_FIELDS = [
  { key: "startDate", label: "계약 시작일", type: "date" as const },
  { key: "endDate", label: "계약 종료일", type: "date" as const },
  { key: "totalAnnual", label: "총 연봉액 (원)", type: "number" as const },
  { key: "monthlyBase", label: "월 기본급 (원)", type: "number" as const },
  { key: "monthlyMeal", label: "월 식비 (원)", type: "number" as const, optional: true },
];

/** 근로계약서 필드 */
export const EMPLOYMENT_FIELDS = [
  { key: "startDate", label: "계약 시작일", type: "date" as const },
  { key: "probationEndDate", label: "수습 종료일", type: "date" as const },
  { key: "mainWork", label: "주요 업무 내용", type: "text" as const },
  { key: "totalAnnual", label: "총 연봉액 (원)", type: "number" as const },
  { key: "monthlyBase", label: "월 기본급 (원)", type: "number" as const },
];

/** 서약서 3종: 이름·생년월일만 (폼에서는 공통) */
export const OATH_KEYS = ["employeeName", "birthDate"] as const;

export function buildSalaryContent(form: Record<string, string | number>): SalaryContractContent {
  return {
    employeeName: String(form.employeeName ?? ""),
    birthDate: String(form.birthDate ?? ""),
    startDate: String(form.startDate ?? ""),
    endDate: String(form.endDate ?? ""),
    totalAnnual: Number(form.totalAnnual) || 0,
    monthlyBase: Number(form.monthlyBase) || 0,
    monthlyMeal: form.monthlyMeal != null ? Number(form.monthlyMeal) : undefined,
  };
}

export function buildEmploymentContent(form: Record<string, string | number>): EmploymentContractContent {
  return {
    employeeName: String(form.employeeName ?? ""),
    birthDate: String(form.birthDate ?? ""),
    startDate: String(form.startDate ?? ""),
    probationEndDate: String(form.probationEndDate ?? ""),
    mainWork: String(form.mainWork ?? ""),
    totalAnnual: Number(form.totalAnnual) || 0,
    monthlyBase: Number(form.monthlyBase) || 0,
  };
}

export function buildOathContent(form: Record<string, string | number>): OathContractContent {
  return {
    employeeName: String(form.employeeName ?? ""),
    birthDate: String(form.birthDate ?? ""),
  };
}

export function buildContentByType(
  contractType: ContractType,
  form: Record<string, string | number>
): ContractContent {
  switch (contractType) {
    case "salary":
      return buildSalaryContent(form);
    case "employment":
      return buildEmploymentContent(form);
    case "privacy":
    case "non_compete":
    case "nda":
      return buildOathContent(form);
    default:
      return buildOathContent(form);
  }
}
