import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { getSessionEmployee, unauthorized, forbidden, isCLevel } from "@/utils/apiAuth";

// role 변경 허용 필드 (C레벨만)
const C_LEVEL_ONLY_FIELDS = ["role", "employment_status", "emp_number"];
// 일반 수정 허용 필드 (본인 또는 C레벨)
const ALLOWED_FIELDS = [
  "name", "email", "phone", "department", "position",
  "hire_date", "birth_date", "address", "bank_account",
  "profile_image", "note",
];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionEmployee();
    if (!session) return unauthorized();

    const { id } = await params;
    const body = await req.json();

    // C레벨 전용 필드가 포함된 경우 C레벨만 허용
    const hasCLevelFields = C_LEVEL_ONLY_FIELDS.some((f) => f in body);
    if (hasCLevelFields && !isCLevel(session.role)) {
      return forbidden();
    }

    // 본인 정보가 아닌 경우 C레벨만 허용
    const isSelf = String(session.employeeId) === String(id);
    if (!isSelf && !isCLevel(session.role)) {
      return forbidden();
    }

    // 허용된 필드만 추출 (C레벨은 전체 허용)
    const sanitized = isCLevel(session.role)
      ? body
      : Object.fromEntries(
          Object.entries(body).filter(([k]) => ALLOWED_FIELDS.includes(k))
        );

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json({ error: "수정할 수 있는 필드가 없습니다." }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("employees")
      .update(sanitized)
      .eq("id", id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
