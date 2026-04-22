export type Angle =
  | "invest-focus"
  | "closure-focus"
  | "compare-peer"
  | "faq-digest"
  | "news-hook"
  | "industry-overview"
  | "top-n-list";

export type Platform = "tistory" | "naver" | "medium";

export type SyndicateInput = {
  sourceUrl: string;
  angle: Angle;
  platform: Platform;
  length?: number;
};

export type SyndicateOutput = {
  title: string;
  html: string;
  canonical: string;
  anchor: string;
  angle: Angle;
  platform: Platform;
  logs: string[];
};
