const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://fjnndxxzcuqkcuvytcxv.supabase.co",
  "<REDACTED_SERVICE_ROLE_KEY>"
);

const PJM = "26324355-dd18-438c-9e92-6f9fd66a9b45";
const KJS = "5e9b0118-b22f-4255-80db-00d2ef6cf327";
const KDG = "d02fd372-5869-4b17-afc6-a7b19e687621";
const SGS = "13f10962-acdb-4658-a3de-8fedee9a68ad";

async function seed() {
  // 1. Create cowork
  const { data: cw, error: cwErr } = await sb
    .from("coworks")
    .insert({
      title: "GEO 콘텐츠 생산 서비스",
      description:
        "F&B 프랜차이즈 대상 GEO(Generative Engine Optimization) 콘텐츠 생산 서비스. ChatGPT/퍼플렉시티 등 AI 검색엔진에서 브랜드가 인용·추천되도록 콘텐츠 구조를 최적화. MVP 타겟: 오공김밥.\n\n핵심 기술: Next.js + Tailwind SSG, franchiseData 객체 → JSON-LD/FAQ/비용표 자동생성, Vercel 배포.",
      created_by: PJM,
      creator_name: "박재민",
      memo: "핵심 결정사항:\n- 챗봇 제거 → GEO 콘텐츠 생산 집중\n- 기술스택: Next.js + Tailwind + SSG + Vercel\n- franchiseData 객체 하나로 JSON-LD/FAQ/비용표 자동생성\n- 에이전시 vs SaaS 결정은 MVP 이후\n\nfranchiseData 구조:\n  brand: { name, since, stores, contact }\n  cost: { total, franchise, education, interior_per_pyeong, deposit }\n  revenue: { avg_monthly, top_monthly, examples }\n  faq: [{ q, a }]\n\n페이지 구조:\n  /[브랜드명] ← 랜딩\n  /[브랜드명]/faq ← FAQ\n  /[브랜드명]/article ← 정보성 글",
    })
    .select()
    .single();

  if (cwErr) {
    console.error("cowork error:", cwErr);
    return;
  }
  console.log("Cowork created:", cw.id);
  const cwId = cw.id;

  // 2. Members
  await sb.from("cowork_members").insert([
    { cowork_id: cwId, employee_id: PJM, employee_name: "박재민", role: "owner" },
    { cowork_id: cwId, employee_id: KJS, employee_name: "김정섭", role: "member" },
    { cowork_id: cwId, employee_id: KDG, employee_name: "김동균", role: "member" },
    { cowork_id: cwId, employee_id: SGS, employee_name: "심규성", role: "member" },
  ]);
  console.log("Members added");

  // 3. Tasks (from roadmap)
  const tasks = [
    // Phase 1 done
    { title: "GEO 원리 & 경쟁사 분석", status: "done", priority: "high", due_date: "2026-04-03", assignee_id: KJS, assignee_name: "김정섭", order_index: 1 },
    { title: "서비스 구조 확정 · 대표님 미팅", status: "done", priority: "high", due_date: "2026-04-02", assignee_id: PJM, assignee_name: "박재민", order_index: 2 },
    { title: "기획세션 보고서 정리", status: "done", priority: "normal", due_date: "2026-04-02", assignee_id: PJM, assignee_name: "박재민", order_index: 3 },
    // Phase 2
    { title: "Claude API 연동 테스트", status: "in_progress", priority: "high", due_date: "2026-04-07", assignee_id: KDG, assignee_name: "김동균", order_index: 4 },
    { title: "franchiseData 객체 스키마 확정", status: "todo", priority: "high", due_date: "2026-04-07", assignee_id: PJM, assignee_name: "박재민", order_index: 5 },
    { title: "브랜드 정보 입력 폼 제작", status: "todo", priority: "high", due_date: "2026-04-09", assignee_id: KDG, assignee_name: "김동균", order_index: 6 },
    { title: "3종 콘텐츠 프롬프트 설계 (FAQ/JSON-LD/정보글)", status: "todo", priority: "high", due_date: "2026-04-10", assignee_id: KJS, assignee_name: "김정섭", order_index: 7 },
    // Phase 3
    { title: "Next.js 프로젝트 초기 세팅 + Vercel 배포", status: "todo", priority: "high", due_date: "2026-04-13", assignee_id: KDG, assignee_name: "김동균", order_index: 8 },
    { title: "JSON-LD 자동 생성 컴포넌트 구현", status: "todo", priority: "high", due_date: "2026-04-15", assignee_id: KDG, assignee_name: "김동균", order_index: 9 },
    { title: "오공김밥 데이터 파일(ogong.js) 작성", status: "todo", priority: "normal", due_date: "2026-04-14", assignee_id: SGS, assignee_name: "심규성", order_index: 10 },
    { title: "FAQ·비용표 컴포넌트 구현 및 랜딩 조립", status: "todo", priority: "high", due_date: "2026-04-16", assignee_id: KDG, assignee_name: "김동균", order_index: 11 },
    { title: "콘텐츠 자동생성 대시보드 구현", status: "todo", priority: "high", due_date: "2026-04-16", assignee_id: KDG, assignee_name: "김동균", order_index: 12 },
    { title: "오공김밥 콘텐츠 생성 & 검수", status: "todo", priority: "normal", due_date: "2026-04-17", assignee_id: KJS, assignee_name: "김정섭", order_index: 13 },
    // Phase 4
    { title: "오공김밥 홈페이지 콘텐츠 업로드", status: "todo", priority: "normal", due_date: "2026-04-21", assignee_id: SGS, assignee_name: "심규성", order_index: 14 },
    { title: "AI 노출 테스트 1회차 (10개 프롬프트)", status: "todo", priority: "high", due_date: "2026-04-24", assignee_id: KJS, assignee_name: "김정섭", order_index: 15 },
    { title: "리포트 템플릿 제작", status: "todo", priority: "normal", due_date: "2026-04-28", assignee_id: PJM, assignee_name: "박재민", order_index: 16 },
  ];

  const { error: taskErr } = await sb.from("cowork_tasks").insert(
    tasks.map((t) => ({ cowork_id: cwId, created_by: PJM, creator_name: "박재민", ...t }))
  );
  if (taskErr) console.error("tasks error:", taskErr);
  else console.log("Tasks added:", tasks.length);

  // 4. Schedules (phases + key milestones)
  const schedules = [
    { title: "Phase 1 — 연구", start_date: "2026-04-01", end_date: "2026-04-03", color: "#8b5cf6", assignee_name: "전체" },
    { title: "Phase 2 — 초기 모델", start_date: "2026-04-06", end_date: "2026-04-10", color: "#3b82f6", assignee_name: "전체" },
    { title: "Phase 3 — MVP", start_date: "2026-04-13", end_date: "2026-04-17", color: "#10b981", assignee_name: "전체" },
    { title: "Phase 4 — 실전", start_date: "2026-04-20", end_date: "2026-04-28", color: "#f59e0b", assignee_name: "전체" },
    { title: "Claude API 연동", start_date: "2026-04-06", end_date: "2026-04-07", color: "#ef4444", assignee_name: "김동균" },
    { title: "대시보드 구현", start_date: "2026-04-13", end_date: "2026-04-16", color: "#ef4444", assignee_name: "김동균" },
    { title: "AI 노출 테스트", start_date: "2026-04-22", end_date: "2026-04-24", color: "#ec4899", assignee_name: "김정섭" },
    { title: "대표님 미팅", start_date: "2026-04-02", end_date: "2026-04-02", color: "#ef4444", assignee_name: "박재민" },
  ];

  const { error: schErr } = await sb.from("cowork_schedules").insert(
    schedules.map((s) => ({ cowork_id: cwId, ...s }))
  );
  if (schErr) console.error("schedules error:", schErr);
  else console.log("Schedules added:", schedules.length);

  // 5. Documents
  const docs = [
    { type: "link", link_title: "오공김밥 공식 홈페이지", link_url: "https://50gimbab.co.kr", uploaded_by: PJM, uploader_name: "박재민" },
    { type: "link", link_title: "GEO 논문 - Generative Engine Optimization", link_url: "https://arxiv.org/abs/2311.09735", uploaded_by: KJS, uploader_name: "김정섭" },
    { type: "link", link_title: "JSON-LD Schema.org 가이드", link_url: "https://schema.org/docs/gs.html", uploaded_by: KDG, uploader_name: "김동균" },
  ];

  const { error: docErr } = await sb.from("cowork_documents").insert(
    docs.map((d) => ({ cowork_id: cwId, ...d }))
  );
  if (docErr) console.error("docs error:", docErr);
  else console.log("Documents added:", docs.length);

  // 6. Activity log
  await sb.from("cowork_activities").insert([
    { cowork_id: cwId, actor_id: PJM, actor_name: "박재민", action: "cowork_created", target_title: "GEO 콘텐츠 생산 서비스" },
  ]);

  console.log("\nDONE! Cowork ID:", cwId);
}

seed().catch(console.error);
