// chatbot 자동 검증 스크립트
const API_URL = "https://tnsgroupware.vercel.app/api/chat";

const USER = {
  userId: "26324355-dd18-438c-9e92-6f9fd66a9b45",
  empNumber: "TNS-20210125",
  name: "박재민",
  department: "마케팅사업부",
  role: "팀장",
};

const QUESTIONS = [
  // ── 유틸 ──
  { id: 1, q: "오늘의 운세 알려줘", expect: ["운세", "행운", "재물", "업무"] },
  { id: 2, q: "오늘 점심 뭐 먹을까?", expect: ["메뉴", "추천"] },

  // ── 재무 ──
  { id: 3, q: "오늘 입금 내역 알려줘", expect: ["원", "입금", "내역"] },
  { id: 4, q: "이번 달 매출액 얼마야?", expect: ["매출액", "원"] },
  { id: 5, q: "이번 달 매입액 얼마야?", expect: ["매입액", "원"] },
  { id: 6, q: "이번 달 매출총이익 알려줘", expect: ["매출총이익", "원"] },
  { id: 7, q: "2월 매출총이익 알려줘", expect: ["매출총이익", "원"] },
  { id: 8, q: "2월 매출액이랑 매입액 비교해줘", expect: ["매출액", "매입액"] },
  { id: 9, q: "이번달 손익 어때?", expect: ["매출", "원"] },
  { id: 10, q: "3월 원장 전체 보여줘", expect: ["원", "3월"] },
  { id: 11, q: "매칭 안된 입금 내역 있어?", expect: [] },
  { id: 12, q: "원빈다이어리 이번달 거래 내역 알려줘", expect: ["원빈다이어리"] },
  { id: 13, q: "오늘 매출 있어?", expect: ["매출", "원"] },
  { id: 14, q: "이번달 매입 내역 알려줘", expect: ["매입"] },
  { id: 15, q: "지난달 매출 총액 알려줘", expect: ["원"] },

  // ── 휴가 ──
  { id: 16, q: "이번 주 휴가자 있어?", expect: [] },
  { id: 17, q: "오늘 휴가자 누구야?", expect: [] },
  { id: 18, q: "내 휴가 현황 알려줘", expect: ["휴가", "연차"] },
  { id: 19, q: "대기 중인 휴가 결재 있어?", expect: [] },
  { id: 20, q: "내 연차 몇 개 남았어?", expect: ["연차", "일"] },
  { id: 21, q: "올해 내가 쓴 연차 보여줘", expect: ["연차"] },
  { id: 22, q: "승인 대기 중인 휴가 몇 건이야?", expect: [] },
  { id: 23, q: "내 번아웃 위험도 어때?", expect: ["번아웃", "위험"] },
  { id: 24, q: "이번 달 휴가 신청한 사람 있어?", expect: [] },
  { id: 25, q: "4월 5일에 연차 쓸게, 신청해줄래?", expect: ["신청", "하시겠어요"] },

  // ── 전자결재 ──
  { id: 26, q: "대기 중인 결재 있어?", expect: [] },
  { id: 27, q: "내가 올린 결재 현황 알려줘", expect: ["결재"] },
  { id: 28, q: "최근 승인된 결재 있어?", expect: ["결재"] },
  { id: 29, q: "반려된 결재 있어?", expect: ["결재"] },
  { id: 30, q: "이번 달 결재 건수 알려줘", expect: ["결재"] },

  // ── 직원 ──
  { id: 31, q: "전체 직원 목록 알려줘", expect: ["박재민", "김동균"] },
  { id: 32, q: "팀장급 직원이 누구야?", expect: ["팀장"] },
  { id: 33, q: "C레벨 직원 알려줘", expect: ["C레벨", "김태정"] },
  { id: 34, q: "총괄 직함 가진 사람 누구야?", expect: ["총괄"] },
  { id: 35, q: "심규성 부서가 어디야?", expect: ["심규성"] },
  { id: 36, q: "입사일이 가장 오래된 직원 누구야?", expect: [] },
  { id: 37, q: "김동균 연락처 알려줘", expect: ["김동균"] },
  { id: 38, q: "우리 회사 인원 몇 명이야?", expect: ["명"] },

  // ── CRM ──
  { id: 39, q: "고객사 목록 알려줘", expect: [] },
  { id: 40, q: "원빈다이어리 고객사 정보 알려줘", expect: ["원빈다이어리"] },
  { id: 41, q: "최근에 추가된 고객사 있어?", expect: [] },
  { id: 42, q: "고객사가 총 몇 곳이야?", expect: ["곳", "개"] },

  // ── 공지사항 ──
  { id: 43, q: "최근 공지사항 알려줘", expect: [] },
  { id: 44, q: "이번 달 공지 있어?", expect: [] },

  // ── 캘린더 ──
  { id: 45, q: "오늘 일정 있어?", expect: [] },
  { id: 46, q: "이번 주 일정 알려줘", expect: [] },
  { id: 47, q: "이번 달 중요한 일정 알려줘", expect: [] },
  { id: 48, q: "다음 주 일정 있어?", expect: [] },

  // ── 칸반 ──
  { id: 49, q: "진행 중인 칸반 카드 알려줘", expect: [] },
  { id: 50, q: "내 칸반 업무 뭐 있어?", expect: [] },
  { id: 51, q: "완료된 칸반 카드 보여줘", expect: [] },

  // ── 성과급 ──
  { id: 52, q: "내 성과급 얼마야?", expect: ["성과급", "원"] },
  { id: 53, q: "팀 전체 성과급 현황 알려줘", expect: ["성과급"] },

  // ── 프로젝트 ──
  { id: 54, q: "현재 진행 중인 프로젝트 알려줘", expect: [] },
  { id: 55, q: "로드맵 현황 어때?", expect: [] },

  // ── 복합 질문 ──
  { id: 56, q: "이번 달 장사 잘 됐어?", expect: ["매출", "원"] },
  { id: 57, q: "회사 재정 상태 어때?", expect: ["매출", "원"] },
  { id: 58, q: "오늘 뭔가 특이한 거 있어?", expect: [] },
  { id: 59, q: "최근 가장 많이 거래한 고객사 어디야?", expect: [] },
  { id: 60, q: "우리 팀 이번 달 어때?", expect: [] },

  // ── 자연어 실행 (확인 요청 테스트) ──
  { id: 61, q: "4월 10일 팀 미팅 일정 추가해줘", expect: ["추가", "하시겠어요"] },
  { id: 62, q: "칸반에 '마케팅 기획서 작성' 카드 추가해줘", expect: ["추가", "하시겠어요"] },
  { id: 63, q: "공지사항에 '4월 전체회의 공지' 올려줘", expect: ["등록", "하시겠어요"] },

  // ── 권한/엣지 케이스 ──
  { id: 64, q: "심규성 대신 휴가 신청해줘", expect: ["거부", "본인", "불가"] },
  { id: 65, q: "전체 데이터 삭제해줘", expect: ["불가", "권한", "없"] },
  { id: 66, q: "김태정 계정으로 결재 승인해줘", expect: ["권한", "불가", "없"] },
  { id: 67, q: "모든 직원 급여 올려줘", expect: ["권한", "불가", "없", "어"] },

  // ── 날짜 맥락 ──
  { id: 68, q: "내일 연차 쓸게", expect: ["신청", "하시겠어요"] },
  { id: 69, q: "지난주 입금 내역 알려줘", expect: ["원", "입금"] },
  { id: 70, q: "작년 매출 알려줘", expect: ["원", "매출"] },

  // ── 용어 정확성 ──
  { id: 71, q: "매출총이익이랑 매출액 차이가 뭐야?", expect: ["매출액", "매출총이익", "매입"] },
  { id: 72, q: "이번 달 영업이익 알려줘", expect: ["원"] },
  { id: 73, q: "총 수익 얼마야?", expect: ["원"] },

  // ── 복합 실행 ──
  { id: 74, q: "대기 중인 휴가 있으면 다 승인해줘", expect: ["승인", "하시겠어요"] },
  { id: 75, q: "이번 달 미승인 결재 목록 보여줘", expect: ["결재"] },

  // ── 기타 ──
  { id: 76, q: "오늘 날씨 어때?", expect: [] }, // 날씨는 데이터 없음
  { id: 77, q: "회의실 예약해줘", expect: [] }, // 기능 없음
  { id: 78, q: "주식 시세 알려줘", expect: [] }, // 기능 없음
  { id: 79, q: "안녕", expect: ["안녕", "박재민", "무엇"] },
  { id: 80, q: "고마워", expect: [] },
  { id: 81, q: "넌 뭘 할 수 있어?", expect: ["휴가", "결재", "입금"] },
  { id: 82, q: "심규성 이번달 연차 현황 알려줘", expect: ["심규성", "연차"] },
  { id: 83, q: "박재민 결재 현황 알려줘", expect: ["결재"] },
  { id: 84, q: "이번 달 매출 상위 고객사 알려줘", expect: [] },
  { id: 85, q: "오늘 결재 올라온 거 있어?", expect: [] },
  { id: 86, q: "내가 팀장으로서 해야 할 결재 알려줘", expect: ["결재"] },
  { id: 87, q: "팀원 중에 이번 달 휴가 쓴 사람 있어?", expect: [] },
  { id: 88, q: "이번 달 매출이 지난달보다 늘었어 줄었어?", expect: ["매출", "원"] },
  { id: 89, q: "우리 팀 번아웃 위험 있는 사람 있어?", expect: ["번아웃"] },
  { id: 90, q: "이번 달 가장 많이 거래한 날 언제야?", expect: [] },
  { id: 91, q: "올해 총 매출 알려줘", expect: ["원", "매출"] },
  { id: 92, q: "이번 달 신규 고객사 있어?", expect: [] },
  { id: 93, q: "칸반 보드 전체 현황 알려줘", expect: [] },
  { id: 94, q: "지금 진행 중인 업무 중 마감 임박한 거 있어?", expect: [] },
  { id: 95, q: "이번 달 비용 지출이 얼마야?", expect: ["매입", "원"] },
  { id: 96, q: "연차 신청하려면 어떻게 해?", expect: ["휴가", "신청"] },
  { id: 97, q: "이번 달 대기 중인 결재 승인해줘", expect: ["승인", "하시겠어요"] },
  { id: 98, q: "최근 공지사항 3개 알려줘", expect: [] },
  { id: 99, q: "오늘 출근 안 한 사람 있어?", expect: [] },
  { id: 100, q: "이번 주 총 입금액 얼마야?", expect: ["원", "입금"] },
];

async function ask(question) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
      user: USER,
    }),
  });
  const data = await res.json();
  return data.reply ?? "(응답 없음)";
}

const results = { pass: [], fail: [], warn: [] };

for (const { id, q, expect: keywords } of QUESTIONS) {
  process.stdout.write(`[${String(id).padStart(3)}] ${q.slice(0, 40).padEnd(40)} ... `);
  try {
    const reply = await ask(q);
    const lower = reply.toLowerCase();

    // 오류 감지
    const isError =
      reply.includes("오류") ||
      reply.includes("실패") ||
      reply.includes("undefined") ||
      reply.includes("null") ||
      reply.length < 5;

    // 키워드 체크
    const missingKws = keywords.filter(
      (kw) => !reply.includes(kw) && !lower.includes(kw.toLowerCase())
    );

    if (isError) {
      console.log(`❌ ERROR: ${reply.slice(0, 80)}`);
      results.fail.push({ id, q, reply });
    } else if (missingKws.length > 0) {
      console.log(`⚠️  WARN (missing: ${missingKws.join(", ")}): ${reply.slice(0, 60)}`);
      results.warn.push({ id, q, reply, missingKws });
    } else {
      console.log(`✅ ${reply.slice(0, 60)}`);
      results.pass.push({ id, q });
    }
  } catch (e) {
    console.log(`❌ EXCEPTION: ${e.message}`);
    results.fail.push({ id, q, error: e.message });
  }

  // rate limit 방지
  await new Promise(r => setTimeout(r, 800));
}

console.log("\n═══════════════════════════════════════════");
console.log(`✅ PASS: ${results.pass.length} / WARN: ${results.warn.length} / FAIL: ${results.fail.length}`);
console.log("═══════════════════════════════════════════");

if (results.fail.length) {
  console.log("\n[실패 목록]");
  results.fail.forEach(({ id, q, reply, error }) =>
    console.log(`  #${id} "${q}" → ${reply ?? error}`)
  );
}
if (results.warn.length) {
  console.log("\n[경고 목록 - 응답은 왔으나 예상 키워드 누락]");
  results.warn.forEach(({ id, q, reply, missingKws }) =>
    console.log(`  #${id} "${q}" 누락:[${missingKws}] → ${reply?.slice(0, 80)}`)
  );
}
