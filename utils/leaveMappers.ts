import type { ApprovalStatus, LeaveRequest } from "@/constants/leave";
import type { LeaveTypeKey } from "@/constants/leaveTypes";

/** leave_requests DB row(snake_case) → LeaveRequest(camelCase) 변환 */
export function dbRowToLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id: row.id as string,
    applicantId: row.applicant_id as string,
    applicantName: row.applicant_name as string,
    applicantDepartment: row.applicant_department as string,
    leaveType: row.leave_type as LeaveTypeKey,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    days: Number(row.days),
    reason: (row.reason as string) ?? "",
    status: row.status as ApprovalStatus,
    teamLeadApprovedAt: (row.team_lead_approved_at as string) ?? undefined,
    cLevelApprovedAt: (row.c_level_approved_at as string) ?? undefined,
    rejectedAt: (row.rejected_at as string) ?? undefined,
    rejectReason: (row.reject_reason as string) ?? undefined,
    requiresProof: (row.requires_proof as boolean) ?? undefined,
    proofStatus: (row.proof_status as "pending" | "submitted") ?? undefined,
    proofFileName: (row.proof_file_name as string) ?? undefined,
    proofUploadedAt: (row.proof_uploaded_at as string) ?? undefined,
    autoApproved: (row.auto_approved as boolean) ?? undefined,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}
