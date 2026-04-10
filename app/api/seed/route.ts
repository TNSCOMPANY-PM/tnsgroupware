import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";

void createAdminClient;

/**
 * 일회용 시드 API: 이번 달 기본 운영 목표를 projects 테이블에 삽입합니다.
 * GET 또는 POST /api/seed 호출 후 초기 세팅이 끝나면 라우트 삭제 또는 호출 금지하세요.
 */
function getThisMonthRange(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function GET() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  return runSeed();
}

export async function POST() {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  return runSeed();
}

async function runSeed() {
  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Supabase가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  if (!supabase.from) {
    return NextResponse.json(
      { ok: false, error: "Supabase client not configured." },
      { status: 500 }
    );
  }

  const { start, end } = getThisMonthRange();

  const seedProjects = [
    { title: "더널리 알림톡 216명 유지·확대", team: "더널리", status: "진행중", progress: 0, start_date: start, end_date: end },
    { title: "더널리 광고 활성화 및 작업량 목표", team: "더널리", status: "진행중", progress: 0, start_date: start, end_date: end },
    { title: "티제이웹 유지보수 27건 처리", team: "티제이웹", status: "진행중", progress: 0, start_date: start, end_date: end },
    { title: "티제이웹 리뉴얼·신규 제작", team: "티제이웹", status: "진행중", progress: 0, start_date: start, end_date: end },
    { title: "경영지원 인사·재무 솔루션", team: "경영지원", status: "진행중", progress: 0, start_date: start, end_date: end },
  ];

  const { data, error } = await supabase.from("projects").insert(seedProjects).select("id");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, hint: "RLS 정책 또는 projects 테이블을 확인하세요." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "이번 달 기본 운영 목표가 projects 테이블에 세팅되었습니다. (일회용 시드)",
    month: `${start} ~ ${end}`,
    inserted: data?.length ?? seedProjects.length,
    ids: data?.map((r) => r.id) ?? [],
  });
}
