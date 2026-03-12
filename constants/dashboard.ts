/**
 * TNS 대시보드용 더미 데이터
 */

export const DASHBOARD_TODOS = [
  { id: "1", text: "Q1 매출 보고서 최종 검토", done: false },
  { id: "2", text: "신규 프로젝트 기획회의 (14:00)", done: false },
  { id: "3", text: "이커머스 프로모션 결재 요청", done: true },
  { id: "4", text: "월간 인사 재무 리뷰 미팅", done: false },
];

export const DASHBOARD_PROJECTS = [
  { team: "더널리", name: "홈페이지 리뉴얼", progress: 65 },
  { team: "더널리", name: "결제 모듈 통합", progress: 30 },
  { team: "티제이웹", name: "이커머스 프로모션", progress: 25 },
  { team: "티제이웹", name: "캠페인 랜딩 페이지", progress: 10 },
];

export const DASHBOARD_CASH_ALERTS = [
  { id: "1", type: "미수금", label: "A사 입금 예정", amount: 45000000, dueDate: "2026-03-12" },
  { id: "2", type: "미지급금", label: "B사 결제 예정", amount: 28000000, dueDate: "2026-03-14" },
  { id: "3", type: "미수금", label: "C사 입금 예정", amount: 12000000, dueDate: "2026-03-15" },
];

/** C레벨 공지사항 (대시보드용) */
export const DASHBOARD_ANNOUNCEMENTS = [
  { id: "1", title: "2026년 Q1 경영 전략 회의 결과 공유", date: "2026-03-09", isImportant: true },
  { id: "2", title: "연차 사용 현황 점검 및 번아웃 예방 안내", date: "2026-03-07", isImportant: false },
  { id: "3", title: "재택근무 정책 개정 사항 (4월 시행)", date: "2026-03-05", isImportant: false },
  { id: "4", title: "신규 보안 교육 이수 대상자 공지", date: "2026-03-03", isImportant: false },
];

export const DASHBOARD_FINANCE = {
  monthlyRevenue: 185000000,       // 당월 총 매출 (부가세 포함 실거래금액)
  monthlyGrossProfit: 62500000,   // 당월 매출총이익
  survivalBalance: 42000000,      // 생존 통장 예상 잔고 (플러스/마이너스)
};

export const LUNCH_MENUS = [
  "된장찌개", "김치볶음밥", "돈까스", "비빔밥", "쌈밥",
  "제육볶음", "불고기덮밥", "수육", "칼국수", "돌솥비빔밥",
  "삼겹살", "찜닭", "냉면", "파스타", "햄버거",
];

export const FORTUNE_MESSAGES = [
  "오늘은 협업이 잘 맞는 날입니다. 팀원들과 소통을 활발히 해보세요.",
  "새로운 아이디어가 빛을 발할 수 있는 날입니다. 자신감을 갖고 제안해 보세요.",
  "재물운이 상승하는 날. 중요한 계약이나 협상에 유리합니다.",
  "인맥운이 좋은 날입니다. 새로운 인연을 만날 수 있어요.",
  "창의성이 폭발하는 날. 기획 회의에 최적의 타이밍입니다.",
  "조급함보다 여유가 필요해요. 한 걸음 물러서 보는 것이 좋습니다.",
];
