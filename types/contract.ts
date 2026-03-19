/**
 * Supabase public.contracts 테이블 및 계약서별 content 타입
 */

export type ContractType = "salary" | "employment" | "privacy" | "non_compete" | "nda";

export type ContractStatus = "pending" | "signed";

/** 연봉계약서 content */
export interface SalaryContractContent {
  employeeName: string;
  birthDate: string;
  startDate: string;
  endDate: string;
  totalAnnual: number;
  monthlyBase: number;
  monthlyMeal?: number;
}

/** 근로계약서 content */
export interface EmploymentContractContent {
  employeeName: string;
  birthDate: string;
  startDate: string;
  probationEndDate: string;
  mainWork: string;
  totalAnnual: number;
  monthlyBase: number;
}

/** 서약서 3종 (개인정보/경업금지/비밀유지): 이름·생년월일만 */
export interface OathContractContent {
  employeeName: string;
  birthDate: string;
}

export type ContractContent =
  | SalaryContractContent
  | EmploymentContractContent
  | OathContractContent;

export interface ContractRow {
  id: string;
  employee_id: string;
  contract_type: ContractType;
  content: ContractContent;
  status: ContractStatus;
  created_at: string;
  signed_at: string | null;
}

export interface ContractInsert {
  employee_id: string;
  contract_type: ContractType;
  content: ContractContent;
  status?: ContractStatus;
}
