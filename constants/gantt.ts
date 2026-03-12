/**
 * TNS 컴퍼니 팀별 로드맵 간트차트 데이터
 * 실제 목표 & 월간 계획 (2024년 3월)
 */

export const GANTT_TEAMS = ["더널리", "티제이웹", "경영지원"] as const;
export type GanttTeamId = (typeof GANTT_TEAMS)[number];

export interface GanttTask {
  id: string;
  name: string;
  team: GanttTeamId;
  startDate: string; // yyyy-MM-dd
  endDate: string;
  progress: number; // 0~100
  /** 선행 작업 id (의존성) */
  dependsOn?: string[];
}

/** 에픽(상위 프로젝트) - 하위 태스크 배열로 2-Depth 구조 */
export interface GanttEpic {
  id: string;
  name: string;
  team: GanttTeamId;
  subTasks: GanttTask[];
}

/** 1차원 플랫 태스크 목록 (기존 호환용) — 에픽에서 flatten */
export function flattenEpicsToTasks(epics: GanttEpic[]): GanttTask[] {
  return epics.flatMap((e) => e.subTasks);
}

export const INITIAL_GANTT_TASKS: GanttTask[] = [
  // ===== 더널리 - 쇼핑 =====
  {
    id: "t1",
    name: "태그값 크롤링 점검",
    team: "더널리",
    startDate: "2026-03-03",
    endDate: "2026-03-11",
    progress: 60,
    dependsOn: [],
  },
  {
    id: "t2",
    name: "태그값 수정 업데이트",
    team: "더널리",
    startDate: "2026-03-12",
    endDate: "2026-03-13",
    progress: 0,
    dependsOn: ["t1"],
  },
  {
    id: "t3",
    name: "관리형 450슬롯 목표 (광고주 추천)",
    team: "더널리",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    progress: 20,
  },
  {
    id: "t4",
    name: "더널리 AI 상품 순위 레퍼런스 홍보",
    team: "더널리",
    startDate: "2026-03-09",
    endDate: "2026-03-31",
    progress: 15,
  },
  {
    id: "t5",
    name: "쇼핑 가구매 200건 목표",
    team: "더널리",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    progress: 10,
  },
  // ===== 더널리 - 플레이스 =====
  {
    id: "t6",
    name: "플레이스 3월 평균 35,000 작업량 달성",
    team: "더널리",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    progress: 25,
  },
  // ===== 더널리 - 쿠팡 =====
  {
    id: "t7",
    name: "쿠팡 슬롯 300슬롯 목표",
    team: "더널리",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    progress: 30,
  },
  // ===== 더널리 - CPC =====
  {
    id: "t8",
    name: "진원정밀 CPC 진행",
    team: "더널리",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    progress: 50,
  },
  {
    id: "t9",
    name: "금수실업 신규 CPC 진행",
    team: "더널리",
    startDate: "2026-03-06",
    endDate: "2026-03-31",
    progress: 20,
  },
  {
    id: "t10",
    name: "신규 CPC 대행 서치 (AMP&M fees/suspension)",
    team: "더널리",
    startDate: "2026-03-16",
    endDate: "2026-03-31",
    progress: 5,
  },
  {
    id: "t11",
    name: "신규 CPC 대행 확인 후 진행",
    team: "더널리",
    startDate: "2026-03-20",
    endDate: "2026-03-31",
    progress: 0,
    dependsOn: ["t10"],
  },
  // ===== 티제이웹 - Cursor 연구 =====
  {
    id: "t12",
    name: "Cursor 개발 환경 구축 및 기본 기능 테스트",
    team: "티제이웹",
    startDate: "2026-03-09",
    endDate: "2026-03-13",
    progress: 80,
  },
  {
    id: "t13",
    name: "AI 코드 생성 및 기존 홈페이지 구조 분석 테스트",
    team: "티제이웹",
    startDate: "2026-03-16",
    endDate: "2026-03-20",
    progress: 40,
    dependsOn: ["t12"],
  },
  {
    id: "t14",
    name: "자연어 기반 코드 수정 기능 검증",
    team: "티제이웹",
    startDate: "2026-03-23",
    endDate: "2026-03-27",
    progress: 10,
    dependsOn: ["t13"],
  },
  {
    id: "t15",
    name: "홈페이지 제작 자동화 가능성 검토 및 연구 결과 정리",
    team: "티제이웹",
    startDate: "2026-03-30",
    endDate: "2026-03-31",
    progress: 0,
    dependsOn: ["t14"],
  },
  // ===== 경영지원 - Flex 대체 =====
  {
    id: "t16",
    name: "Flex 기능 분석 및 설계",
    team: "경영지원",
    startDate: "2026-03-03",
    endDate: "2026-03-06",
    progress: 100,
  },
  {
    id: "t17",
    name: "MVP 기능 구현 (프론트엔드)",
    team: "경영지원",
    startDate: "2026-03-09",
    endDate: "2026-03-18",
    progress: 70,
    dependsOn: ["t16"],
  },
  {
    id: "t18",
    name: "안정성 검증 (백엔드)",
    team: "경영지원",
    startDate: "2026-03-18",
    endDate: "2026-03-27",
    progress: 50,
    dependsOn: ["t17"],
  },
  {
    id: "t19",
    name: "Flex 대체 가동",
    team: "경영지원",
    startDate: "2026-03-30",
    endDate: "2026-03-31",
    progress: 0,
    dependsOn: ["t18"],
  },
];

/** 2-Depth: 에픽(Epic) + 하위 태스크(SubTasks). 에픽 바 = 하위 태스크의 최소 시작일 ~ 최대 종료일. */
export const INITIAL_GANTT_EPICS: GanttEpic[] = [
  {
    id: "ep1",
    name: "태그값 크롤링·수정",
    team: "더널리",
    subTasks: [
      INITIAL_GANTT_TASKS.find((t) => t.id === "t1")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t2")!,
    ],
  },
  {
    id: "ep2",
    name: "쇼핑·관리형·가구매 목표",
    team: "더널리",
    subTasks: [
      INITIAL_GANTT_TASKS.find((t) => t.id === "t3")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t4")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t5")!,
    ],
  },
  {
    id: "ep3",
    name: "플레이스 3월 작업량",
    team: "더널리",
    subTasks: [INITIAL_GANTT_TASKS.find((t) => t.id === "t6")!],
  },
  {
    id: "ep4",
    name: "쿠팡 슬롯 목표",
    team: "더널리",
    subTasks: [INITIAL_GANTT_TASKS.find((t) => t.id === "t7")!],
  },
  {
    id: "ep5",
    name: "CPC 진행 (진원·금수·신규)",
    team: "더널리",
    subTasks: [
      INITIAL_GANTT_TASKS.find((t) => t.id === "t8")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t9")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t10")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t11")!,
    ],
  },
  {
    id: "ep6",
    name: "Cursor 개발 환경 및 AI 코드 연구",
    team: "티제이웹",
    subTasks: [
      INITIAL_GANTT_TASKS.find((t) => t.id === "t12")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t13")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t14")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t15")!,
    ],
  },
  {
    id: "ep7",
    name: "Flex 대체",
    team: "경영지원",
    subTasks: [
      INITIAL_GANTT_TASKS.find((t) => t.id === "t16")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t17")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t18")!,
      INITIAL_GANTT_TASKS.find((t) => t.id === "t19")!,
    ],
  },
];
