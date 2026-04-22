import type { Angle } from "./types";

export const ANGLE_LABEL: Record<Angle, string> = {
  "invest-focus": "실투자금 집중",
  "closure-focus": "폐점 리스크 집중",
  "compare-peer": "업종 내 비교",
  "faq-digest": "FAQ 요약",
  "news-hook": "시즌·뉴스 훅",
  "industry-overview": "업종 개요",
  "top-n-list": "TOP N 리스트",
};

export const ANGLE_DESCRIPTION: Record<Angle, string> = {
  "invest-focus": "실투자금·투자회수기간 위주로 프랜차이즈 진입 문턱 다룸",
  "closure-focus": "실질 폐점률·순확장수 위주로 리스크 지표 다룸",
  "compare-peer": "업종 peer 대비 매출·점포수·성장률 비교",
  "faq-digest": "canonical FAQ 모음 재가공",
  "news-hook": "계절성 이벤트·최신 규제 훅으로 canonical 연결",
  "industry-overview": "업종 시장 규모·성장률·주요 브랜드 요약",
  "top-n-list": "관심도·점포수 등 지표 기준 TOP N 랭킹",
};
