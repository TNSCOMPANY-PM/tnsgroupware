import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("certificate_issuances")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    if (error.code === "42P01") return NextResponse.json([]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  const body = await request.json() as {
    employee_id: string;
    employee_name: string;
    certificate_type: "employment" | "career";
    purpose?: string;
    language?: string;
    seal_type?: string;
    memo?: string;
  };

  if (!body.employee_id || !body.certificate_type) {
    return NextResponse.json({ error: "employee_id, certificate_type 필수" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("certificate_issuances")
    .insert({
      employee_id: body.employee_id,
      employee_name: body.employee_name,
      certificate_type: body.certificate_type,
      purpose: body.purpose ?? "",
      language: body.language ?? "ko",
      seal_type: body.seal_type ?? "digital",
      memo: body.memo ?? "",
      issued_by_id: String(session.employeeId),
      issued_by_name: session.name,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "42P01") return NextResponse.json({ error: "테이블 미생성" }, { status: 500 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
