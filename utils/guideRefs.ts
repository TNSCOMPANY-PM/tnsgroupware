export type GuideCategory =
  | "창업 절차"
  | "계약·법률"
  | "자금 조달"
  | "입지 선정"
  | "운영 노하우";

const REF_MAP: Record<GuideCategory, { name: string; url?: string }[]> = {
  "창업 절차": [
    { name: "중소벤처기업부 K-Startup", url: "https://www.k-startup.go.kr" },
    { name: "소상공인시장진흥공단", url: "https://www.semas.or.kr" },
  ],
  "계약·법률": [
    { name: "공정거래위원회 가맹사업거래", url: "https://franchise.ftc.go.kr" },
    { name: "가맹사업거래 공정화에 관한 법률" },
  ],
  "자금 조달": [
    { name: "소상공인정책자금", url: "https://ols.semas.or.kr" },
    { name: "중소벤처기업진흥공단", url: "https://www.kosmes.or.kr" },
  ],
  "입지 선정": [
    { name: "서울시 상권분석서비스", url: "https://golmok.seoul.go.kr" },
    { name: "소상공인365", url: "https://www.sbiz365.or.kr" },
  ],
  "운영 노하우": [
    { name: "소상공인365", url: "https://www.sbiz365.or.kr" },
    { name: "국세청 홈택스", url: "https://hometax.go.kr" },
  ],
};

export function getGuideRefBlock(category: GuideCategory): string {
  const refs = REF_MAP[category] ?? [];
  const lines = refs.map(r => r.url ? `- ${r.name} (${r.url})` : `- ${r.name}`);
  return `[공식 참고 기관 — ${category}]\n${lines.join("\n")}`;
}
