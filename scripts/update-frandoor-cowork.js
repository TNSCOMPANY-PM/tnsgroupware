const { createClient } = require("@supabase/supabase-js");
const sb = createClient(
  "https://fjnndxxzcuqkcuvytcxv.supabase.co",
  "<REDACTED_SERVICE_ROLE_KEY>"
);

const cwId = "ea98a34b-1223-4673-9f68-ebaec4db9581";
const PJM = "26324355-dd18-438c-9e92-6f9fd66a9b45";
const KDG = "d02fd372-5869-4b17-afc6-a7b19e687621";
const KTJ = "c844d89e-ab21-499b-a786-b2b94be0f5f7";

async function update() {
  // 1. 코워크 제목/설명/메모 업데이트
  await sb.from("coworks").update({
    title: "Frandoor - F&B본사 전문 AI최적화",
    description: "Frandoor : 예비창업자를 모으는 F&B본사 전문 AI최적화 서비스\n\n3중 최적화: SEO(구글·네이버) + AEO(빠른답변 박스) + GEO(ChatGPT·Perplexity 브랜드 추천)\n\n도메인: frandoor.co.kr\n서브도메인: 50gimbab.frandoor.co.kr / hanshinudong.frandoor.co.kr\n\n핵심: AI가 신뢰하는 브랜드를 만드는 것",
    memo: "■ 서비스 포지셔닝\n- 외부: 예비창업자를 모으는 F&B본사 전문 AI최적화\n- 내부: SEO + AEO + GEO 3중 최적화\n- 성과지표: AI 브랜드 언급 + 가맹 문의 DB 수집\n\n■ 유료화 판단 기준 (4개 중 3개 달성)\n- D1·D2 인용률 40%+\n- 방문자 월 100명+\n- DB 수집 월 3건+\n- AI 채널 비율 30%+\n\n■ 사업 구조\n- 운영주체: 김태정 대표 개인계정 (지원사업 자격 유지)\n- 결제주체: 티앤에스컴퍼니\n- 추후 신규 사업자 설립 후 이관\n\n■ 콘텐츠 채널\n- 랜딩: frandoor.co.kr (4/10 오픈)\n- 티스토리: 월 4건 (구글 SEO+GEO)\n- 네이버블로그: 월 2건 (네이버 SEO)\n- Medium 영문: 월 1건 (ChatGPT 학습 공략)\n\n■ 영업 로드맵\n- 4/16 CEO 모임 바이브코딩 강의\n- 5/12 CEO 모임 당사입 강의 (포트폴리오 2개 완성 필수)",
  }).eq("id", cwId);
  console.log("1. 코워크 업데이트 완료");

  // 2. 기존 태스크 삭제
  await sb.from("cowork_tasks").delete().eq("cowork_id", cwId);
  console.log("2. 기존 태스크 삭제");

  const tasks = [
    // 4/6
    { title: "ChatGPT Before 테스트 (25개 질문 캡처)", status: "done", priority: "high", due_date: "2026-04-06", assignee_id: PJM, assignee_name: "박재민", order_index: 1 },
    { title: "frandoor.co.kr 도메인 구입", status: "done", priority: "high", due_date: "2026-04-06", assignee_id: KDG, assignee_name: "김동균", order_index: 2 },
    { title: "50gimbab.frandoor.co.kr 서브도메인 연결", status: "in_progress", priority: "high", due_date: "2026-04-06", assignee_id: KDG, assignee_name: "김동균", order_index: 3 },
    { title: "DB폼 최종 항목 확정 → 김동균 전달", status: "done", priority: "high", due_date: "2026-04-06", assignee_id: KTJ, assignee_name: "김태정", order_index: 4 },
    { title: "오공김밥 유튜브 채널 링크 공유", status: "done", priority: "normal", due_date: "2026-04-06", assignee_id: KTJ, assignee_name: "김태정", order_index: 5 },
    // 4/7
    { title: "Before 결과 정리 문서화 (D0~D3)", status: "todo", priority: "high", due_date: "2026-04-07", assignee_id: PJM, assignee_name: "박재민", order_index: 6 },
    { title: "히어로·신뢰지표·창업정보 섹션 제작", status: "todo", priority: "high", due_date: "2026-04-07", assignee_id: KDG, assignee_name: "김동균", order_index: 7 },
    { title: "JSON-LD + llms.txt + robots.txt 설정", status: "todo", priority: "high", due_date: "2026-04-07", assignee_id: KDG, assignee_name: "김동균", order_index: 8 },
    { title: "frandoor.co.kr 메인 최소 구성", status: "todo", priority: "high", due_date: "2026-04-07", assignee_id: KDG, assignee_name: "김동균", order_index: 9 },
    // 4/8
    { title: "티스토리 1번글: 오공김밥 창업비용 완전 분석 2026", status: "todo", priority: "high", due_date: "2026-04-08", assignee_id: PJM, assignee_name: "박재민", order_index: 10 },
    { title: "FAQ 25개 삽입 + DB폼 자동발송 연동", status: "todo", priority: "high", due_date: "2026-04-08", assignee_id: KDG, assignee_name: "김동균", order_index: 11 },
    { title: "GA4 + UTM 4종 생성", status: "todo", priority: "normal", due_date: "2026-04-08", assignee_id: KDG, assignee_name: "김동균", order_index: 12 },
    // 4/9
    { title: "전체 검수 (팩트·모바일·출처표기)", status: "todo", priority: "high", due_date: "2026-04-09", assignee_id: PJM, assignee_name: "박재민", order_index: 13 },
    { title: "기술 검수 (DB폼 테스트·GA4·AI크롤러)", status: "todo", priority: "high", due_date: "2026-04-09", assignee_id: KDG, assignee_name: "김동균", order_index: 14 },
    // 4/10 ★
    { title: "네이버블로그 1번글: 오공김밥 가맹 수익 구조 분석", status: "todo", priority: "high", due_date: "2026-04-10", assignee_id: PJM, assignee_name: "박재민", order_index: 15 },
    { title: "★ 오공김밥 랜딩페이지 라이브", status: "todo", priority: "high", due_date: "2026-04-10", assignee_id: KDG, assignee_name: "김동균", order_index: 16 },
    { title: "frandoor.co.kr 메인 동시 오픈", status: "todo", priority: "high", due_date: "2026-04-10", assignee_id: KDG, assignee_name: "김동균", order_index: 17 },
    { title: "랜딩 검토 + 오공김밥 대표 공유 + 한신우동 착수 알림", status: "todo", priority: "normal", due_date: "2026-04-10", assignee_id: KTJ, assignee_name: "김태정", order_index: 18 },
    // 한신우동 4/10~17
    { title: "한신우동 홈페이지 분석 + 자료 정리 + Before 테스트", status: "todo", priority: "normal", due_date: "2026-04-11", assignee_id: PJM, assignee_name: "박재민", order_index: 19 },
    { title: "hanshinudong.frandoor.co.kr 서브도메인 + WP 복제", status: "todo", priority: "normal", due_date: "2026-04-11", assignee_id: KDG, assignee_name: "김동균", order_index: 20 },
    { title: "한신우동 FAQ 작성 + Before 캡처 완료", status: "todo", priority: "high", due_date: "2026-04-14", assignee_id: PJM, assignee_name: "박재민", order_index: 21 },
    { title: "한신우동 랜딩페이지 제작 + JSON-LD + DB폼 + GA4", status: "todo", priority: "high", due_date: "2026-04-14", assignee_id: KDG, assignee_name: "김동균", order_index: 22 },
    { title: "한신우동 티스토리 1번글", status: "todo", priority: "normal", due_date: "2026-04-16", assignee_id: PJM, assignee_name: "박재민", order_index: 23 },
    { title: "★ 한신우동 랜딩페이지 라이브", status: "todo", priority: "high", due_date: "2026-04-17", assignee_id: KDG, assignee_name: "김동균", order_index: 24 },
    // 콘텐츠 드라이브 4/13~30
    { title: "Medium 영문: Ogong Gimbap Franchise Guide", status: "todo", priority: "normal", due_date: "2026-04-17", assignee_id: PJM, assignee_name: "박재민", order_index: 25 },
    { title: "콘텐츠: 순마진 17~23% 수익 구조 상세", status: "todo", priority: "normal", due_date: "2026-04-17", assignee_id: PJM, assignee_name: "박재민", order_index: 26 },
    { title: "콘텐츠: 소자본 실투자금 1,500만원 가능 이유", status: "todo", priority: "normal", due_date: "2026-04-24", assignee_id: PJM, assignee_name: "박재민", order_index: 27 },
    { title: "한신우동 콘텐츠: 수익 구조 분석", status: "todo", priority: "normal", due_date: "2026-04-24", assignee_id: PJM, assignee_name: "박재민", order_index: 28 },
    { title: "Medium 영문: Hanshin Udon Franchise Guide", status: "todo", priority: "normal", due_date: "2026-04-24", assignee_id: PJM, assignee_name: "박재민", order_index: 29 },
    { title: "오공김밥 점주 후기 분석 (유튜브 기반)", status: "todo", priority: "normal", due_date: "2026-04-30", assignee_id: PJM, assignee_name: "박재민", order_index: 30 },
    { title: "한신우동 우동 프랜차이즈 비교 가이드", status: "todo", priority: "normal", due_date: "2026-04-30", assignee_id: PJM, assignee_name: "박재민", order_index: 31 },
    // 영업·마일스톤
    { title: "프랜차이즈 CEO 모임 바이브코딩 강의", status: "todo", priority: "normal", due_date: "2026-04-16", assignee_id: KTJ, assignee_name: "김태정", order_index: 32 },
    { title: "1차 체크포인트: DB수집 + AI노출 변화 확인", status: "todo", priority: "high", due_date: "2026-04-30", assignee_id: KTJ, assignee_name: "김태정", order_index: 33 },
    { title: "5/12 CEO 모임 강의 준비 (포트폴리오 2개 완성)", status: "todo", priority: "high", due_date: "2026-05-10", assignee_id: KTJ, assignee_name: "김태정", order_index: 34 },
    // AI 테스트 루틴
    { title: "AI 노출 테스트 1회차 (4/13)", status: "todo", priority: "normal", due_date: "2026-04-13", assignee_id: PJM, assignee_name: "박재민", order_index: 35 },
    { title: "AI 노출 테스트 2회차 (4/20)", status: "todo", priority: "normal", due_date: "2026-04-20", assignee_id: PJM, assignee_name: "박재민", order_index: 36 },
    { title: "AI 노출 테스트 3회차 (4/27)", status: "todo", priority: "normal", due_date: "2026-04-27", assignee_id: PJM, assignee_name: "박재민", order_index: 37 },
  ];

  const { error: taskErr } = await sb.from("cowork_tasks").insert(
    tasks.map((t) => ({ cowork_id: cwId, created_by: PJM, creator_name: "박재민", ...t }))
  );
  if (taskErr) console.error("tasks error:", taskErr);
  else console.log("3. 태스크", tasks.length, "개 추가");

  // 3. 스케줄 삭제 후 재생성
  await sb.from("cowork_schedules").delete().eq("cowork_id", cwId);

  const schedules = [
    { title: "긴급 스프린트 — 오공김밥 라이브", start_date: "2026-04-06", end_date: "2026-04-10", color: "#ef4444", assignee_name: "전체" },
    { title: "한신우동 착수", start_date: "2026-04-10", end_date: "2026-04-17", color: "#3b82f6", assignee_name: "전체" },
    { title: "콘텐츠 드라이브", start_date: "2026-04-13", end_date: "2026-04-30", color: "#10b981", assignee_name: "박재민" },
    { title: "★ 오공김밥 라이브", start_date: "2026-04-10", end_date: "2026-04-10", color: "#ef4444", assignee_name: "김동균" },
    { title: "★ 한신우동 라이브", start_date: "2026-04-17", end_date: "2026-04-17", color: "#3b82f6", assignee_name: "김동균" },
    { title: "CEO 모임 강의 (김우현)", start_date: "2026-04-16", end_date: "2026-04-16", color: "#8b5cf6", assignee_name: "김태정" },
    { title: "AI 노출 테스트", start_date: "2026-04-13", end_date: "2026-04-13", color: "#f59e0b", assignee_name: "박재민" },
    { title: "AI 노출 테스트", start_date: "2026-04-20", end_date: "2026-04-20", color: "#f59e0b", assignee_name: "박재민" },
    { title: "AI 노출 테스트", start_date: "2026-04-27", end_date: "2026-04-27", color: "#f59e0b", assignee_name: "박재민" },
    { title: "1차 체크포인트", start_date: "2026-04-30", end_date: "2026-04-30", color: "#ef4444", assignee_name: "김태정" },
    { title: "5/12 CEO 모임 강의", start_date: "2026-05-12", end_date: "2026-05-12", color: "#ec4899", assignee_name: "김태정" },
  ];

  const { error: schErr } = await sb.from("cowork_schedules").insert(
    schedules.map((s) => ({ cowork_id: cwId, ...s }))
  );
  if (schErr) console.error("schedules error:", schErr);
  else console.log("4. 스케줄", schedules.length, "개 추가");

  console.log("\nDONE!");
}

update().catch(console.error);
