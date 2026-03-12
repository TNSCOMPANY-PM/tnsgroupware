import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  Baby,
  Heart,
  Flower2,
  Shield,
  HeartHandshake,
  Building2,
  Users,
} from "lucide-react";

export type LeaveTypeKey =
  | "annual"
  | "half_am"
  | "half_pm"
  | "quarter_am"
  | "quarter_pm"
  | "hourly"
  | "spouse_birth"
  | "family_care"
  | "menstrual"
  | "military"
  | "marriage_self"
  | "condolence_close"
  | "condolence_extended";

export interface LeaveTypeCard {
  key: LeaveTypeKey;
  label: string;
  icon: LucideIcon;
  description: string;
  /** 고정 일수 (null이면 계산값 또는 신청 시 부여) */
  fixedDays: number | null;
  /** 증빙 서류(필증, 청첩장 등) 사후 제출 필요 */
  requiresProof?: boolean;
}

export const LEAVE_TYPE_CARDS: LeaveTypeCard[] = [
  {
    key: "annual",
    label: "연차",
    icon: Calendar,
    description: "잔여 일수 표시",
    fixedDays: null,
  },
  {
    key: "spouse_birth",
    label: "배우자 출산",
    icon: Baby,
    description: "법정 10일",
    fixedDays: 10,
  },
  {
    key: "family_care",
    label: "가족돌봄휴가",
    icon: Heart,
    description: "무급 최대 10일 (법정)",
    fixedDays: 10,
  },
  {
    key: "menstrual",
    label: "생리휴가",
    icon: Flower2,
    description: "무급 월 1일 (법정)",
    fixedDays: 1,
  },
  {
    key: "military",
    label: "공가 (예비군/민방위)",
    icon: Shield,
    description: "신청 시 부여 (기간 입력)",
    fixedDays: null,
    requiresProof: true,
  },
  {
    key: "marriage_self",
    label: "경조사 - 결혼(본인)",
    icon: HeartHandshake,
    description: "신청 시 5일 부여",
    fixedDays: 5,
    requiresProof: true,
  },
  {
    key: "condolence_close",
    label: "경조사 - 조의(부모/배우자/자녀)",
    icon: Building2,
    description: "신청 시 5일 부여",
    fixedDays: 5,
    requiresProof: true,
  },
  {
    key: "condolence_extended",
    label: "경조사 - 조의(조부모/형제/자매)",
    icon: Users,
    description: "신청 시 3일 부여",
    fixedDays: 3,
    requiresProof: true,
  },
];

/** 특수 휴가(예비군, 경조사 등)는 복귀 후 증빙 서류 제출 필요 */
export function getRequiresProof(leaveType: LeaveTypeKey): boolean {
  return LEAVE_TYPE_CARDS.find((c) => c.key === leaveType)?.requiresProof ?? false;
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "연차",
  half_am: "오전반차",
  half_pm: "오후반차",
  quarter_am: "반반차 (09~11시)",
  quarter_pm: "반반차 (16~18시)",
  hourly: "시간차",
};

export function getLeaveTypeLabel(key: LeaveTypeKey | string): string {
  return LEAVE_TYPE_LABELS[key] ?? LEAVE_TYPE_CARDS.find((c) => c.key === key)?.label ?? key;
}
