import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { logAudit } from "@/lib/auditLog";

/** GET: 단일 계약 조회 (본인 계약만) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = createAdminClient();
    const { data: emp } = await admin
      .from("employees")
      .select("id")
      .eq("email", user.email)
      .limit(1)
      .single();
    const { data, error } = await admin
      .from("contracts")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      const msg = error?.message ?? "";
      if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("relation"))) {
        return NextResponse.json(
          { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
    }
    if (!emp?.id || data.employee_id !== emp.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const msg = err.message ?? "";
    if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist"))) {
      return NextResponse.json(
        { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** PATCH: 서명 (status=signed, signed_at=now) — 본인 계약만 가능 */
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = createAdminClient();
    const { data: emp } = await admin
      .from("employees")
      .select("id")
      .eq("email", user.email)
      .limit(1)
      .single();
    if (!emp?.id) {
      return NextResponse.json({ error: "Employee not found" }, { status: 403 });
    }
    const { data: row, error: fetchErr } = await admin
      .from("contracts")
      .select("employee_id")
      .eq("id", id)
      .single();
    if (fetchErr) {
      const msg = fetchErr.message ?? "";
      if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("relation"))) {
        return NextResponse.json(
          { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
          { status: 503 }
        );
      }
    }
    if (!row || row.employee_id !== emp.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // 서명 전 계약 내용 조회 (type + content)
    const { data: contractData } = await admin
      .from("contracts")
      .select("contract_type, content")
      .eq("id", id)
      .single();

    const { data: updated, error } = await admin
      .from("contracts")
      .update({ status: "signed", signed_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("relation"))) {
        return NextResponse.json(
          { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 서명 완료 시 직원 정보 자동 반영
    if (contractData && emp?.id) {
      const content = contractData.content as Record<string, unknown> ?? {};
      const empPatch: Record<string, unknown> = {};

      if (contractData.contract_type === "employment") {
        // 근로계약서 서명 → 입사일 자동 설정
        if (content.startDate) empPatch.hire_date = String(content.startDate);
      }

      if (contractData.contract_type === "salary") {
        // 연봉계약서 서명 → 연봉 정보 반영 (salary 컬럼이 있으면)
        if (content.totalAnnual) empPatch.salary = Number(content.totalAnnual);
      }

      if (Object.keys(empPatch).length > 0) {
        await admin.from("employees").update(empPatch).eq("id", emp.id);
      }

      logAudit("contract.signed", {
        targetId: id,
        targetType: "contract",
        detail: { contractType: contractData.contract_type, employeeId: emp.id },
      }).catch(() => {});
    }

    return NextResponse.json(updated);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const msg = err.message ?? "";
    if (msg.includes("contracts") && (msg.includes("schema cache") || msg.includes("does not exist"))) {
      return NextResponse.json(
        { error: "contracts 테이블이 없습니다. Supabase 대시보드 → SQL Editor에서 supabase-contracts.sql을 실행해 주세요.", code: "CONTRACTS_TABLE_MISSING" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
