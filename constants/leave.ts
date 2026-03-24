import type { UserRole } from "./users";
import type { LeaveTypeKey } from "./leaveTypes";
import { getLeaveTypeLabel } from "./leaveTypes";

export type ApprovalStatus =
  | "팀장_1차_승인_대기"
  | "C레벨_최종_승인_대기"
  | "승인_완료"
  | "반려"
  | "CANCELED"
  | "CANCEL_REQUESTED"
  | "PLANNED";

/** 증빙 서류 제출 상태 */
export type ProofStatus = "pending" | "submitted";

export interface LeaveRequest {
  id: string;
  applicantId: string;
  applicantName: string;
  applicantDepartment: string;
  leaveType: LeaveTypeKey;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: ApprovalStatus;
  teamLeadApprovedAt?: string;
  cLevelApprovedAt?: string;
  rejectedAt?: string;
  rejectReason?: string;
  createdAt: string;
  /** 증빙 서류 필요 여부 (예비군, 경조사 등) */
  requiresProof?: boolean;
  /** 증빙 대기 | 증빙 완료 */
  proofStatus?: ProofStatus;
  /** 업로드된 증빙 파일명 */
  proofFileName?: string;
  /** 증빙 업로드 일시 */
  proofUploadedAt?: string;
  /** 3영업일/휴가당일 미승인 시 시스템 자동 승인 여부 */
  autoApproved?: boolean;
}

export function getApprovalSteps(
  applicantRole: UserRole
): { key: ApprovalStatus; label: string }[] {
  if (applicantRole === "사원") {
    return [
      { key: "팀장_1차_승인_대기", label: "팀장 1차 승인 대기" },
      { key: "C레벨_최종_승인_대기", label: "김태정 / 한혜경 최종 승인 대기" },
      { key: "승인_완료", label: "승인 완료" },
    ];
  }
  if (applicantRole === "팀장") {
    return [
      { key: "C레벨_최종_승인_대기", label: "김태정 / 한혜경 최종 승인 대기" },
      { key: "승인_완료", label: "승인 완료" },
    ];
  }
  return [{ key: "승인_완료", label: "승인 완료" }];
}

export function getLeaveTypeDisplayName(key: LeaveTypeKey): string {
  return getLeaveTypeLabel(key);
}
