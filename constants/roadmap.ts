/**
 * 2026 분기별 마스터 로드맵 (간트차트 에픽 연동용 더미)
 * status: completed(100%) | in_progress | planned
 */

/** leaveMonitoring 등에서 사용: 마일스톤 기간 + 핵심 인원 휴가 겹침 리스크 */
export interface RoadmapMilestone {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  keyPersonIds: string[];
}

export const ROADMAP_MILESTONES: RoadmapMilestone[] = [
  { id: "m1", name: "1Q 마스터 로드맵", startDate: "2026-01-01", endDate: "2026-03-31", keyPersonIds: ["1", "2", "3", "4", "6"] },
  { id: "m2", name: "2Q 마스터 로드맵", startDate: "2026-04-01", endDate: "2026-06-30", keyPersonIds: ["1", "2", "3", "4", "6"] },
  { id: "m3", name: "3Q 마스터 로드맵", startDate: "2026-07-01", endDate: "2026-09-30", keyPersonIds: ["1", "2", "3", "4", "6"] },
  { id: "m4", name: "4Q 마스터 로드맵", startDate: "2026-10-01", endDate: "2026-12-31", keyPersonIds: ["1", "2", "3", "4", "6"] },
];

export type RoadmapBlockStatus = "completed" | "in_progress" | "planned";

export type RoadmapTeamId = "더널리" | "티제이웹" | "경영지원";

export interface RoadmapBlock {
  id: string;
  name: string;
  quarter: 1 | 2 | 3 | 4;
  /** 분기 내 월 (1~3번째 달): 1Q=1,2,3월 / 2Q=4,5,6월 / 3Q=7,8,9월 / 4Q=10,11,12월 */
  month: number;
  team: RoadmapTeamId;
  status: RoadmapBlockStatus;
  progress: number;
  completedDate?: string;
}

/** 분기별·월별 목표 더미 (단일 분기 뷰 3단 컬럼용) */
export const ROADMAP_2026_QUARTERLY: RoadmapBlock[] = [
  // 1Q — 1월
  { id: "r1", name: "태그값 크롤링·수정", quarter: 1, month: 1, team: "더널리", status: "completed", progress: 100, completedDate: "2026-01-14" },
  { id: "r2", name: "쇼핑·관리형·가구매 목표", quarter: 1, month: 1, team: "더널리", status: "in_progress", progress: 20 },
  // 1Q — 2월
  { id: "r3", name: "플레이스 3월 작업량", quarter: 1, month: 2, team: "더널리", status: "in_progress", progress: 60 },
  { id: "r4", name: "쿠팡 슬롯 목표", quarter: 1, month: 2, team: "더널리", status: "in_progress", progress: 40 },
  // 1Q — 3월
  { id: "r5", name: "CPC 진행 (진원·금수·신규)", quarter: 1, month: 3, team: "더널리", status: "completed", progress: 100, completedDate: "2026-03-14" },
  { id: "r5b", name: "쇼핑 가구매 200건 목표", quarter: 1, month: 3, team: "더널리", status: "completed", progress: 100, completedDate: "2026-03-20" },
  { id: "r5c", name: "플레이스 3월 달성 마감", quarter: 1, month: 3, team: "더널리", status: "completed", progress: 100, completedDate: "2026-03-28" },
  // 2Q
  { id: "r6", name: "Cursor 개발 환경 및 AI 코드 연구", quarter: 2, month: 4, team: "티제이웹", status: "in_progress", progress: 30 },
  { id: "r7", name: "티제이웹 AI 도입 검토", quarter: 2, month: 5, team: "티제이웹", status: "planned", progress: 0 },
  { id: "r8", name: "쇼핑 Q2 목표 리뉴얼", quarter: 2, month: 6, team: "더널리", status: "planned", progress: 0 },
  // 3Q
  { id: "r9", name: "Flex 대체", quarter: 3, month: 7, team: "경영지원", status: "planned", progress: 0 },
  { id: "r10", name: "홈페이지 제작 자동화 Phase 2", quarter: 3, month: 8, team: "티제이웹", status: "planned", progress: 0 },
  { id: "r10b", name: "3Q 정기 점검", quarter: 3, month: 9, team: "경영지원", status: "planned", progress: 0 },
  // 4Q
  { id: "r11", name: "연말 결산·연차 마감", quarter: 4, month: 10, team: "경영지원", status: "planned", progress: 0 },
  { id: "r12", name: "2027 로드맵 기획", quarter: 4, month: 11, team: "경영지원", status: "planned", progress: 0 },
  { id: "r12b", name: "연간 성과 보고", quarter: 4, month: 12, team: "경영지원", status: "planned", progress: 0 },
];

const QUARTER_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "1분기 (Jan–Mar)",
  2: "2분기 (Apr–Jun)",
  3: "3분기 (Jul–Sep)",
  4: "4분기 (Oct–Dec)",
};

export function getQuarterLabel(q: 1 | 2 | 3 | 4): string {
  return QUARTER_LABELS[q];
}

/** 분기별 목표 달성률 (완료 + 진행 중 가중) — 뱃지용 */
export function getQuarterAchievementPercent(blocks: RoadmapBlock[], quarter: 1 | 2 | 3 | 4): number {
  const qBlocks = blocks.filter((b) => b.quarter === quarter);
  if (qBlocks.length === 0) return 0;
  const completed = qBlocks.filter((b) => b.status === "completed").length;
  const inProgress = qBlocks.filter((b) => b.status === "in_progress").length;
  const totalWeight = qBlocks.length;
  const completedWeight = completed + inProgress * 0.5;
  return Math.round((completedWeight / totalWeight) * 100);
}

/** 분기별 3개 월 번호 (1Q=1,2,3 / 2Q=4,5,6 / 3Q=7,8,9 / 4Q=10,11,12) */
export function getMonthsForQuarter(quarter: 1 | 2 | 3 | 4): [number, number, number] {
  const start = (quarter - 1) * 3 + 1;
  return [start, start + 1, start + 2];
}

/** 월 번호 → "1월", "2월" ... (한국어) */
const MONTH_LABELS: Record<number, string> = {
  1: "1월", 2: "2월", 3: "3월", 4: "4월", 5: "5월", 6: "6월",
  7: "7월", 8: "8월", 9: "9월", 10: "10월", 11: "11월", 12: "12월",
};
export function getMonthLabel(month: number): string {
  return MONTH_LABELS[month] ?? `${month}월`;
}

/** 선택 분기의 블록을 3개 월 컬럼으로 그룹 (인덱스 0,1,2 = 첫째/둘째/셋째 달) */
export function getBlocksByQuarterAndMonth(blocks: RoadmapBlock[], quarter: 1 | 2 | 3 | 4): [RoadmapBlock[], RoadmapBlock[], RoadmapBlock[]] {
  const [m1, m2, m3] = getMonthsForQuarter(quarter);
  const qBlocks = blocks.filter((b) => b.quarter === quarter);
  return [
    qBlocks.filter((b) => b.month === m1),
    qBlocks.filter((b) => b.month === m2),
    qBlocks.filter((b) => b.month === m3),
  ];
}

/** @deprecated getQuarterAchievementPercent(blocks, 1) 사용 */
export function getQ1AchievementPercent(blocks: RoadmapBlock[]): number {
  return getQuarterAchievementPercent(blocks, 1);
}
