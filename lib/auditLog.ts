import { createClient } from "@/utils/supabase/server";

export type AuditAction =
  | "approval.approved"
  | "approval.rejected"
  | "approval.created"
  | "finance.created"
  | "finance.deleted"
  | "finance.updated"
  | "leave.approved"
  | "leave.rejected"
  | "leave.created"
  | "employee.updated"
  | "contract.signed"
  | "bonus.settings.updated";

export async function logAudit(
  action: AuditAction,
  opts: {
    actorId?: string;
    actorName?: string;
    targetId?: string;
    targetType?: string;
    detail?: Record<string, unknown>;
  }
) {
  try {
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      action,
      actor_id: opts.actorId ?? null,
      actor_name: opts.actorName ?? null,
      target_id: opts.targetId ?? null,
      target_type: opts.targetType ?? null,
      detail: opts.detail ?? null,
    });
  } catch {
    // 감사 로그 실패는 메인 흐름을 방해하지 않음
  }
}
