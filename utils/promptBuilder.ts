type FactKeyword = { keyword: string; label: string };

export type OfficialData = {
  source_year?: string;
  stores_total?: number;
  avg_monthly_revenue?: number;
  cost_total?: number;
  franchise_fee?: number;
  education_fee?: number;
  deposit?: number;
  closure_rate?: number;
  industry_avg_revenue?: number;
  industry_avg_cost?: number;
  sources?: string[];
  competitors?: { name: string; stores_total?: number; avg_monthly_revenue?: number; cost_total?: number; source_year?: string }[];
  kosis_industry_avg?: {
    industry_code: string;
    industry_name: string;
    avg_revenue_monthly?: number;   // 만원
    growth_rate_yoy?: number;       // %
    source_period: string;          // "YYYY-MM" 조회 기준
  };
  food_safety?: {
    hygiene_grades?: { biz_name?: string; address?: string; grade?: string; designated_at?: string }[];
    recalls?: { product_name?: string; company?: string; type?: string; reason?: string; recalled_at?: string }[];
    source_period: string;          // "YYYY-MM"
  };
};

export type BrandData = {
  brand: {
    name: string;
    name_en?: string;
    slug?: string;
    since?: string;
    contact?: string;
  };
  stores: { total?: number };
  cost: {
    total?: number;
    franchise_fee?: number;
    education_fee?: number;
    deposit?: number;
    loan?: { bank_1st?: number; interest_free?: number };
    loan_structure_note?: string;
    actual_investment?: number;
  };
  revenue: {
    avg_monthly_min?: number;
    avg_monthly_max?: number;
    net_margin?: number;
    net_margin_max?: number;
    cogs_ratio?: number;
    payback_months?: number;
  };
  operation: {
    min_staff?: number;
    recommended_staff?: number;
    min_pyeong?: number;
    max_pyeong?: number;
    automation: string[];
  };
  awards: string[];
  disclaimer: string;
  rawFacts?: string; // 원본 팩트데이터 전체 (AI가 맥락 파악용)
};

function formatWon(value?: number): string {
  if (!value && value !== 0) return "본사 확인 필요";
  if (value === 0) return "0원";
  // fact_data에서 추출된 숫자는 이미 만원 단위 (6500 = 6,500만원)
  return `${value.toLocaleString()}만원`;
}

function buildDataBlock(data: BrandData, official?: OfficialData): string {
  // 값이 있는 항목만 출력
  const lines: string[] = [
    `[DATA — 참고 수치. 공식 자료(공정위·통계청)와 다르면 공식 자료 우선. 이 DATA에 없는 수치는 글에 쓰지 말 것]`,
    `브랜드명: ${data.brand.name}`,
  ];

  if (data.brand.since) lines.push(`창업연도: ${data.brand.since}년`);
  if (data.stores.total) lines.push(`가맹점 수: ${data.stores.total}개`);
  if (data.cost.total) lines.push(`창업 총비용: ${formatWon(data.cost.total)}`);
  if (data.cost.franchise_fee) lines.push(`  - 가맹금: ${formatWon(data.cost.franchise_fee)}`);
  if (data.cost.education_fee) lines.push(`  - 교육비: ${formatWon(data.cost.education_fee)}`);
  if (data.cost.deposit) lines.push(`  - 보증금: ${formatWon(data.cost.deposit)}`);
  // 대출 구조 출력: loan_structure_note 가 있으면 그 문장만 인용 (subset 관계 유지).
  // 없을 때만 개별 수치 출력. 단순 합산을 막기 위해 별도 주의 문구 함께 출력.
  if (data.cost.loan_structure_note) {
    lines.push(`  - 대출·지원 구조: ${data.cost.loan_structure_note}`);
    lines.push(`    ※ 위 문장을 본문에 그대로 인용할 것. 수치를 분리해서 합산하지 말 것.`);
  } else if (data.cost.loan?.bank_1st || data.cost.loan?.interest_free) {
    if (data.cost.loan?.bank_1st) lines.push(`  - 1금융권 대출 한도: ${formatWon(data.cost.loan.bank_1st)}`);
    if (data.cost.loan?.interest_free) lines.push(`  - 무이자 지원: ${formatWon(data.cost.loan.interest_free)}`);
    lines.push(`    ※ 위 두 수치의 관계(합산 가능 vs 포함)가 원문에 명시되지 않음. 원본 팩트데이터 전문에서 "중", "포함", "별도", "추가" 표현을 먼저 확인하라. 확인 불가 시 포함 관계로 가정하고 큰 값(대출 한도) 기준으로만 서술하라. 두 값을 단순 덧셈 금지.`);
  }
  if (data.cost.actual_investment) lines.push(`  - 실투자금: ${formatWon(data.cost.actual_investment)}`);
  if (data.revenue.avg_monthly_min) {
    const rev = data.revenue.avg_monthly_max
      ? `${formatWon(data.revenue.avg_monthly_min)}~${formatWon(data.revenue.avg_monthly_max)}`
      : formatWon(data.revenue.avg_monthly_min);
    lines.push(`평균 월매출: ${rev}`);
  }
  if (data.revenue.cogs_ratio !== undefined) lines.push(`원가율: 약 ${Math.round(data.revenue.cogs_ratio * 100)}%`);
  if (data.revenue.net_margin !== undefined) {
    const min = Math.round(data.revenue.net_margin * 100);
    const max = data.revenue.net_margin_max !== undefined ? Math.round(data.revenue.net_margin_max * 100) : null;
    lines.push(`순마진율: ${max ? `${min}~${max}%` : `${min}%`}`);
  }
  if (data.revenue.payback_months) lines.push(`투자회수: 평균 ${data.revenue.payback_months}개월`);
  if (data.operation.min_staff) lines.push(`운영 인원: ${data.operation.min_staff}명${data.operation.recommended_staff ? `~${data.operation.recommended_staff}명` : "~"}`);
  if (data.operation.min_pyeong) lines.push(`운영 평수: ${data.operation.min_pyeong}${data.operation.max_pyeong ? `~${data.operation.max_pyeong}` : ""}평`);
  if (data.operation.automation.length > 0) lines.push(`자동화: ${data.operation.automation.join(", ")}`);
  if (data.awards.length > 0) lines.push(`수상: ${data.awards.join(", ")}`);
  if (data.brand.contact) lines.push(`문의: ${data.brand.contact}`);
  lines.push(`면책: ${data.disclaimer}`);

  // 원본 팩트데이터 전문 (AI가 맥락 파악용)
  if (data.rawFacts) {
    lines.push("");
    lines.push(`[원본 팩트데이터 전문 — 위 정형화 수치와 다른 맥락이 있으면 이쪽을 우선 참조]`);
    lines.push(data.rawFacts);
  }

  lines.push("");
  // 공정위 공시 데이터 (GPT 웹검색 결과)
  if (official) {
    lines.push("");
    lines.push(`[공정위 공시 데이터 (${official.source_year ?? "연도 미확인"} 기준)]`);
    if (official.stores_total) lines.push(`가맹점 수: ${official.stores_total}개`);
    if (official.avg_monthly_revenue) lines.push(`가맹점 평균 매출: ${official.avg_monthly_revenue}만원`);
    if (official.cost_total) lines.push(`창업 총비용: ${official.cost_total}만원`);
    if (official.franchise_fee) lines.push(`가맹금: ${official.franchise_fee}만원`);
    if (official.closure_rate) lines.push(`폐점률: ${official.closure_rate}%`);
    if (official.industry_avg_revenue) lines.push(`동일업종 평균 매출: ${official.industry_avg_revenue}만원`);
    if (official.industry_avg_cost) lines.push(`동일업종 평균 창업비용: ${official.industry_avg_cost}만원`);
    if (official.kosis_industry_avg) {
      const k = official.kosis_industry_avg;
      lines.push("");
      lines.push(`[통계청 KOSIS 산업 평균 (${k.industry_name} / ${k.source_period})]`);
      if (k.avg_revenue_monthly) lines.push(`KOSIS 월평균매출: ${k.avg_revenue_monthly}만원`);
      if (k.growth_rate_yoy !== undefined) lines.push(`KOSIS 전년동월 성장률: ${k.growth_rate_yoy}%`);
    }
    if (official.food_safety) {
      const fs = official.food_safety;
      lines.push("");
      lines.push(`[식약처 식품안전나라 (${fs.source_period})]`);
      if (fs.hygiene_grades?.length) {
        lines.push(`위생등급 이력 ${fs.hygiene_grades.length}건:`);
        for (const h of fs.hygiene_grades.slice(0, 5)) {
          lines.push(`  - ${h.biz_name ?? "?"} / ${h.grade ?? "?"} / ${h.designated_at ?? "?"} / ${h.address ?? ""}`);
        }
      }
      if (fs.recalls?.length) {
        lines.push(`회수·판매중지 이력 ${fs.recalls.length}건:`);
        for (const r of fs.recalls.slice(0, 3)) {
          lines.push(`  - ${r.product_name ?? "?"} / ${r.type ?? ""} / ${r.reason ?? ""} / ${r.recalled_at ?? ""}`);
        }
      }
    }
    if (official.sources?.length) lines.push(`출처: ${official.sources.join(", ")}`);
    if (official.competitors?.length) {
      lines.push("");
      lines.push(`[경쟁 브랜드 공시 데이터 — 실명 비교 가능]`);
      for (const c of official.competitors) {
        lines.push(`${c.name}: 가맹점 ${c.stores_total ?? "?"}개, 평균매출 ${c.avg_monthly_revenue ?? "?"}만원, 창업비용 ${c.cost_total ?? "?"}만원 (${c.source_year ?? "?"})`);
      }
    }
  }

  lines.push("");
  lines.push(`[비교 규칙 — 절대 준수]`);
  lines.push(`- 타 브랜드(경쟁사) 실명 언급 절대 금지. 어떤 경우에도 다른 프랜차이즈 브랜드 이름을 쓰지 마라.`);
  lines.push(`- 비교가 필요하면 "업계 평균", "동종 업종 평균", "김밥·분식 업종 평균" 등으로만 표현`);
  lines.push(`- 비교 수치는 공정거래위원회/통계청 집계 "업종 평균"만 사용. 출처 필수.`);
  lines.push(`- competitors 데이터가 있더라도 브랜드명을 글에 노출하지 마라.`);

  return lines.join("\n");
}

// ── 앵글 3종 정의 (주 앵글: 주제에서 추출, 모든 채널 공유) ──
type Angle = "cost" | "profit" | "compare";
const ANGLE_LABEL: Record<Angle, string> = {
  cost: "얼마 드냐",
  profit: "얼마 남냐",
  compare: "왜 이걸 해야 하냐",
};

// 주제 키워드로 주 앵글 자동 판별 (3채널 공유)
function detectPrimaryAngle(topic: string): Angle {
  const t = topic.toLowerCase();
  if (/수익|마진|매출|순이익|투자회수|ROI|월매출|연매출|순수익|남는/.test(t)) return "profit";
  if (/vs|비교|차이|경쟁|장단점|추천|다른|차별|왜|선택/.test(t)) return "compare";
  // 기본값: 비용 (가장 흔한 쿼리)
  return "cost";
}

// ── 하위 프레임 (주 앵글 유지, 채널별 세부 초점만 분산) ──
type SubFrame = "A" | "B" | "C";

// 채널 → 하위 프레임 고정 매핑
const CHANNEL_SUBFRAME: Record<string, SubFrame> = {
  frandoor: "A",
  tistory: "B",
  naver: "C",
  medium: "A",
};

// 주 앵글별 하위 프레임 3종 정의
const SUBFRAME_BY_ANGLE: Record<Angle, Record<SubFrame, { label: string; focus: string; subtitleHint: string; titleHint: string }>> = {
  cost: {
    A: { label: "총비용 분해", focus: "총비용과 항목별(가맹금·교육비·보증금·인테리어) 세부 금액 중심", subtitleHint: "항목별로 뜯어보면?, 숨은 비용까지 합치면?", titleHint: "{topic} — 항목별로 뜯어본 총비용 / {topic}, 숨은 비용까지 합치면" },
    B: { label: "자금 조달·실투자금", focus: "대출 구조·무이자 지원·실투자금 계산·회수 구조 중심", subtitleHint: "대출은 어디서 얼마나?, 실투자금 계산", titleHint: "{topic} — 대출·무이자 지원까지 반영한 실투자금 / {topic}, 실제 내 돈은 얼마인가" },
    C: { label: "장기 유지비·운영비", focus: "월 고정비·재계약·리모델링·장기 유지비 중심", subtitleHint: "매달 나가는 고정비는?, 재계약·리모델링 비용", titleHint: "{topic} — 매달 나가는 고정비와 재계약 비용 / {topic}, 장기 유지비 관점에서 본 비용" },
  },
  profit: {
    A: { label: "매출·마진 구조", focus: "월매출 구성·원가율·순마진율 중심", subtitleHint: "월매출 평균은?, 원가 빼면 실제로 남는 돈은?", titleHint: "{topic} — 매출과 마진 구조 / {topic}, 원가 빼고 실제로 남는 돈은" },
    B: { label: "투자회수·손익분기", focus: "회수기간·손익분기 시점·대출 상환 반영 현금흐름 중심", subtitleHint: "투자금 회수까지 몇 개월?, 대출 상환까지 넣으면?", titleHint: "{topic} — 투자금 회수·손익분기 관점 / {topic}, 대출 상환까지 반영한 현금흐름" },
    C: { label: "수익 모델·매출 확대 구조", focus: "매출 올리는 구조(자동화·배달·시간대 비중) 중심", subtitleHint: "매출 올리는 구조는?, 시간대별·채널별 비중", titleHint: "{topic} — 매출을 올리는 구조 / {topic}, 시간대·채널별 비중으로 본 수익" },
  },
  compare: {
    A: { label: "비용 대조", focus: "초기 창업비용·항목별 금액 대조 중심", subtitleHint: "초기 자금은 어디가 유리한가?, 항목별 비용 하나하나 따져보면?", titleHint: "{topic} — 비용 관점 비교 / {topic}, 초기 자금으로 따져보면" },
    B: { label: "수익·회수 대조", focus: "월매출·마진·투자회수·리스크 대조 중심", subtitleHint: "월매출·회수기간으로 보면?, 수익 구조 어디가 안정적인가?", titleHint: "{topic} — 수익·회수 관점 비교 / {topic}, 월매출과 회수기간으로 보면" },
    C: { label: "진입·운영 대조", focus: "시작 난이도·운영 부담·지원 체계·리스크 대조 중심", subtitleHint: "혼자 시작할 수 있나?, 운영 부담은 어디가 더 큰가?", titleHint: "{topic} — 진입·운영 관점 비교 / {topic}, 혼자 시작할 수 있나" },
  },
};

// 채널별 하위 프레임 맵 반환 (주 앵글은 3채널 공유)
function getSubFrameRotation(): Record<string, SubFrame> {
  return { ...CHANNEL_SUBFRAME };
}

// 앵글별 answer-box + 본론 구조 + FAQ 방향 + 결론 지시
function buildAngleDirective(
  angle: Angle,
  subFrame: SubFrame,
  data: BrandData,
  otherChannelFrames: { channel: string; frame: SubFrame }[],
  topic?: string,
): string {
  const mine = SUBFRAME_BY_ANGLE[angle][subFrame];
  const otherDesc = otherChannelFrames
    .map(o => {
      const f = SUBFRAME_BY_ANGLE[angle][o.frame];
      return `- ${o.channel}: "${f.label}" — ${f.focus}`;
    })
    .join("\n");

  const ANGLE_BLOCKS: Record<Angle, string> = {
    cost: `
★★★ 주 앵글: "얼마 드냐?" — 비용 구조 해부 ★★★
이 주 앵글은 3채널 전체가 공유합니다. 글의 주제는 동일하게 "비용"입니다.
수익·차별점은 주제에서 벗어나므로 간접 언급만.

[앵글 상세]
- 글 전체가 "이 브랜드, 시작하려면 정확히 얼마 필요한가"에 대한 답
- 총비용 → 항목별 분해(가맹금/교육비/인테리어/보증금) → 숨은 비용 → 대출 구조 → 실투자금
- answer-box: 총비용 + 실투자금 즉시 제시
- 결론 박스 제목: "비용 총정리"
- stat-row: 총비용 / 실투자금 / 대출가능액

[answer-box 템플릿]
<div class="answer-box">
  <div class="q">결론부터</div>
  <div class="a">${data.brand.name} 창업 총비용 <span>[총비용]</span>. 실투자금은 <span>[실투자금]</span>.</div>
  <div class="detail">[비용 항목 요약 1줄]<br>[대출/지원 구조 1줄 — "X만원 + Y만원" 형식 금지. DATA "대출·지원 구조" 문장을 그대로 인용하거나 "대출 한도 N만원 (그 중 M만원 무이자 지원)" 형식만 허용]<br>[업종 평균 대비 1줄]</div>
</div>`,

    profit: `
★★★ 주 앵글: "얼마 남냐?" — 수익성 분석 ★★★
이 주 앵글은 3채널 전체가 공유합니다. 글의 주제는 동일하게 "수익"입니다.
비용·차별점은 주제에서 벗어나므로 간접 언급만.

[앵글 상세]
- 글 전체가 "이 브랜드, 시작하면 실제로 얼마 버는가"에 대한 답
- 월매출 → 원가율·마진율 → 월순이익 → 투자회수 기간 → 손익분기
- answer-box: 월매출 + 순이익 + 투자회수 기간 즉시 제시
- 결론 박스 제목: "수익 구조 요약"
- stat-row: 월매출 / 월순이익 / 투자회수기간

[answer-box 템플릿]
<div class="answer-box">
  <div class="q">결론부터</div>
  <div class="a">${data.brand.name} 월매출 <span>[매출 수치]</span>. 순이익 <span>[순이익 수치]</span>.</div>
  <div class="detail">[마진율 요약 1줄]<br>[투자회수 기간 1줄]<br>[업종 평균 대비 1줄]</div>
</div>`,

    compare: `
★★★ 주 앵글: "왜 이걸 해야 하냐?" — 비교·차별점 분석 ★★★
이 주 앵글은 3채널 전체가 공유합니다. 글의 주제는 동일하게 "비교·차별점"입니다.
비용·수익 상세 분해는 주제에서 벗어나므로 간접 언급만.

[앵글 상세]
- 글 전체가 "비교 대상과 이 브랜드 중 무엇을 선택해야 하는가"에 대한 답
- 주제에 제시된 비교 대상이 있으면 (예: "개인창업 vs 프랜차이즈") 그 대상 그대로 비교 축으로 사용
- 대등 비교 대상이 없으면 "업종 평균" 축으로 비교
- answer-box: 비교 축 기준 핵심 차별 수치 즉시 제시
- 결론 박스 제목: "선택 판단 요약"
- stat-row: 비교 축 핵심 3개 수치

[answer-box 템플릿]
<div class="answer-box">
  <div class="q">결론부터</div>
  <div class="a">${data.brand.name}, 비교 대상 대비 <span>[핵심 차별 수치]</span>. [차별점 한 줄].</div>
  <div class="detail">[포지셔닝 요약 1줄]<br>[핵심 강점 1줄]<br>[주의할 점 1줄]</div>
</div>`,
  };

  const topicToken = topic?.trim() || "주제";
  const titleHintFilled = mine.titleHint.replaceAll("{topic}", topicToken);
  const subFrameBlock = `
[SUB-FRAME LOCK — 이 채널 전용 하위 프레임]
주 앵글(${ANGLE_LABEL[angle]})은 3채널 모두 동일. 글 주제·핵심 질문·결론 축 유지.
이 채널은 "${mine.label}" 하위 프레임으로 같은 주제를 다룹니다.
중심 초점: ${mine.focus}
소제목 힌트: ${mine.subtitleHint}

다른 채널의 하위 프레임 (겹치지 말 것):
${otherDesc}

글 전체 주제는 주 앵글에 맞춰 유지하되, 본론 소제목·데이터 선택·결론 포인트·FAQ 질문을 위 "${mine.label}" 하위 프레임 관점으로 구성하라.
주제가 명시한 비교 대상(예: "개인창업 vs 프랜차이즈")이 있으면 모든 채널이 그 비교 대상을 그대로 유지한다. 하위 프레임은 비교 기준을 바꿀 뿐, 비교 대상 자체를 바꾸지 않는다.

[TITLE DIRECTIVE — 제목은 주제와 하위 프레임을 모두 반영]
- 주제 키워드("${topicToken}")와 하위 프레임("${mine.label}") 두 가지가 제목 안에서 모두 드러나야 한다.
- 다른 채널의 제목(동일 주 앵글, 다른 하위 프레임)과 제목 첫 구절·핵심 단어가 겹치지 않아야 한다.
- 제목 예시 (그대로 베끼지 말고, 브랜드명·주제 단어를 포함해 이 구조로 생성): ${titleHintFilled}
- answer-box 상단 <div class="q"> 라벨도 하위 프레임에 맞게 조정 가능: "${mine.label} 관점에서 결론부터" 등.`;

  return ANGLE_BLOCKS[angle] + "\n" + subFrameBlock;
}

const CHANNEL: Record<string, (data: BrandData, angle?: Angle, subFrame?: SubFrame, otherChannelFrames?: { channel: string; frame: SubFrame }[], topic?: string) => string> = {
  frandoor: (data, angle = "cost", subFrame = "A", otherChannelFrames = [], topic) => `
[SYSTEM]
당신은 프랜차이즈 창업 정보를 다루는 전문 에디터입니다.
결과물은 HTML로 출력합니다. .og-wrap 안에 들어갈 HTML을 생성합니다.
CSS는 외부에서 주입하므로 <style> 태그를 생성하지 마세요.

${buildAngleDirective(angle, subFrame, data, otherChannelFrames, topic)}

[STRUCTURE — 이 순서를 반드시 지킬 것]

① answer-box (위 앵글 템플릿 사용)

② 대표 이미지 위치
<p>[이미지: 브랜드 매장 외관/내부 설명]</p>

③ 이탈 유도 문장
<p>여기서 끝내도 됩니다. 숫자가 필요했던 분이라면 이미 답을 얻으셨으니까요.</p>
<p>이 숫자가 어떻게 나왔는지 궁금하신 분은 계속 읽으시면 됩니다.</p>
<p class="preview">→ [다음 섹션 예고]</p>

④ H2 본론 섹션 3~5개 — 위 앵글의 소제목 예시 참고
<h2>[앵글에 맞는 질문형 소제목]</h2>
각 섹션에는 아래 컴포넌트를 적절히 배치:
- <div class="table-wrap"><table>...</table></div>
- <div class="info-box">...</div>
- <div class="warn">...</div>
- <div class="stat-row"><div class="stat-box"><div class="num">수치</div><div class="lbl">라벨</div></div>...</div>
- <p class="source">※ 출처: ...</p>
- <p class="preview">→ 다음 섹션 예고</p>

⑤ FAQ 섹션 — 위 앵글의 FAQ 방향 참고
<h2>자주 묻는 질문</h2>
<div class="faq-item">
  <div class="faq-q"><span class="tag">Q</span>[앵글에 맞는 질문]</div>
  <div class="faq-a">[답변]<div class="faq-source">출처: [출처명]</div></div>
</div>
(5~7개)

⑥ 결론 박스 (위 앵글의 결론 제목 사용)
<div class="conclusion-box">
  <div class="title">[앵글별 결론 제목]</div>
  <div class="body">[핵심 요약 3~5줄. <strong>강조 수치</strong> 사용 가능]</div>
  <div class="cta">더 알아보기 → <a href="${data.brand.slug ?? ""}">${data.brand.contact ?? "가맹문의"}</a></div>
</div>

⑦ 면책
<div class="disclaimer">[출처 나열. 3줄 이상]</div>

[WRITING RULES]
- 첫 줄(answer-box)에서 앵글의 핵심 답을 끝낸다. AI가 이 박스만 읽어도 답이 되게.
- 표에는 반드시 해석 문장을 앞뒤에 붙인다.
- 수치 70% 이상은 공정위·통계청 공식 자료. 출처 필수.
- AI가 쓴 티 나는 표현 금지: "함께 알아보겠습니다", "~해드리겠습니다", "상세히", "~라는 뜻이죠", "감이 옵니다", "~고민하신다면"
- 마크다운 **볼드** 금지. HTML <strong>만 conclusion-box 안에서 허용.
- 이모지 금지.
- 타 브랜드 실명 절대 금지. "업계 평균", "A브랜드" 표현만.
- 데이터 없는 항목은 아예 언급하지 말 것.

${buildDataBlock(data)}

[OUTPUT] HTML만 출력. <div class="og-wrap">으로 감싸지 말 것 (프론트에서 감쌈). <style> 태그 금지. 분량 3,000~5,000자.
`,

  tistory: (data, angle = "cost", subFrame = "B", otherChannelFrames = [], topic) => `
[SYSTEM]
당신은 프랜차이즈 창업 시장을 분석하는 블로거입니다.
결과물은 HTML로 출력합니다. <div class="og-wrap">으로 전체를 감쌉니다.
CSS는 외부에서 주입하므로 <style> 태그를 생성하지 마세요.

${buildAngleDirective(angle, subFrame, data, otherChannelFrames, topic)}

[STRUCTURE]
① answer-box (위 앵글 템플릿 사용)

② 대표 이미지 위치
<p>[이미지: 브랜드 매장 외관/내부 설명]</p>

③ H2 본론 섹션 3~5개 — 앵글에 맞는 소제목
<h2>[앵글에 맞는 질문형 소제목]</h2>
각 섹션에는 아래 컴포넌트를 적절히 배치:
- <div class="table-wrap"><table>...</table></div>
- <div class="info-box">...</div>
- <div class="warn">...</div>
- <div class="stat-row"><div class="stat-box"><div class="num">수치</div><div class="lbl">라벨</div></div>...</div>
- <p class="source">※ 출처: ...</p>

④ FAQ 섹션 — 앵글에 맞는 질문 (다른 채널 FAQ와 겹치지 않게)
<h2>자주 묻는 질문</h2>
<div class="faq-item">
  <div class="faq-q"><span class="tag">Q</span>[앵글에 맞는 질문]</div>
  <div class="faq-a">[답변]<div class="faq-source">출처: [출처명]</div></div>
</div>
(5~7개)

⑤ 결론 박스
<div class="conclusion-box">
  <div class="title">[앵글별 결론 제목]</div>
  <div class="body">[핵심 요약 3~5줄. <strong>강조 수치</strong> 사용 가능]</div>
  <div class="cta">더 알아보기 → <a href="${data.brand.slug ?? ""}">${data.brand.contact ?? "가맹문의"}</a></div>
</div>

⑥ 면책
<div class="disclaimer">[출처 나열. 3줄 이상]</div>

[WRITING RULES]
- 첫 줄(answer-box)에서 앵글의 핵심 답을 끝낸다.
- 표에는 반드시 해석 문장을 앞뒤에 붙인다.
- 수치 70% 이상은 공정위·통계청 공식 자료. 출처 필수.
- AI가 쓴 티 나는 표현 금지: "함께 알아보겠습니다", "~해드리겠습니다", "상세히", "~라는 뜻이죠", "감이 옵니다", "~고민하신다면"
- 마크다운 **볼드** 금지. HTML <strong>만 conclusion-box 안에서 허용.
- 이모지 금지.
- 타 브랜드 실명 절대 금지. "업계 평균", "A브랜드" 표현만.
- 데이터 없는 항목은 아예 언급하지 말 것.

[CANONICAL 지시]
- 글 하단에 원출처 언급: "원본 데이터는 frandoor.co.kr에서 확인할 수 있습니다."

${buildDataBlock(data)}

[OUTPUT] 완성된 HTML. JSON-LD(FAQPage + Organization) + <div class="og-wrap">...</div> 전부 포함. <style>은 포함하지 말 것. 분량 3,000~5,000자.
`,

  naver: (data, angle = "cost", subFrame = "C", otherChannelFrames = [], topic) => `
[SYSTEM]
당신은 프랜차이즈 창업 정보를 블로그에 정리하는 30대 에디터입니다.
친근한 말투 + 티스토리 수준의 정리된 비주얼 둘 다 필요합니다.

★★★ 가장 중요한 규칙: content 필드에 인라인 스타일 HTML을 출력하라. ★★★
네이버 스마트에디터는 <style> 태그와 class 속성은 제거하지만, 인라인 style 속성은 살려둔다.
따라서 <div class="answer-box"> 같은 class 기반 HTML이 아니라, style="..."으로 동일한 디자인을 직접 지정한다.
<table>, <div>, <p>, <h2>, <h3>, <strong>, <br> 사용 가능. class 속성 금지, inline style만 사용.

${buildAngleDirective(angle, subFrame, data, otherChannelFrames, topic)}

[WRITING STYLE]
- 말투: "~예요", "~죠", "~거든요". 진짜 대화하듯. 본문 문장 톤만 그렇게.
- 경험형 오프닝 (answer-box 위에 1줄 짧게. 중복 서두 금지):
  - cost 앵글: "직접 견적 받아봤는데요"
  - profit 앵글: "실제 수익 계산해봤는데요"
  - compare 앵글: "이것저것 비교해봤는데요"
- 핵심 수치는 answer-box에서 바로 제시
- "본사 확인 필요" 문구 금지. 데이터 없는 항목은 아예 생략
- 이모지 금지. 텍스트 마커(★·■·▶·|) 금지. 시각 구분은 전부 HTML 태그로 처리.

[OUTPUT STRUCTURE — 반드시 아래 HTML 구조로 출력. 모든 디자인은 인라인 style로]

① 경험형 오프닝 1줄
<p style="margin:0 0 16px 0;color:#6b7280;font-size:14px">직접 견적 받아봤는데요</p>

② answer-box (핵심 결론을 가장 먼저. 앵글 템플릿의 class 버전 대신 아래 inline 버전 사용)
<div style="background:#f3f6ff;border-left:4px solid #2563eb;border-radius:8px;padding:18px 20px;margin:0 0 24px 0">
  <div style="font-size:13px;font-weight:700;color:#2563eb;margin-bottom:8px">결론부터</div>
  <div style="font-size:17px;font-weight:700;color:#111827;line-height:1.55">[핵심 한 문장. 수치는 <strong style="color:#2563eb">수치</strong> 형태로 강조]</div>
  <div style="font-size:14px;color:#4b5563;margin-top:10px;line-height:1.7">[세부 1~3줄. 줄바꿈은 <br>]</div>
</div>

③ 이미지 자리 (실제 <img> 태그로 삽입됨)
<p>[이미지: 브랜드 매장 외관/내부 설명]</p>

④ H2 본론 섹션 3~5개 (앵글의 하위 프레임 관점)
<h2 style="font-size:22px;font-weight:800;color:#111827;margin:40px 0 16px 0;padding-bottom:8px;border-bottom:2px solid #111827">[질문형 소제목]</h2>
<p style="font-size:15px;line-height:1.85;color:#374151;margin:0 0 14px 0">본문 문단...</p>

ⓔ 표 필요 시 (완전 인라인 스타일 표)
<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
  <thead>
    <tr style="background:#f9fafb">
      <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-weight:700;color:#374151">항목</th>
      <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:700;color:#374151">금액</th>
      <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-weight:700;color:#374151">출처</th>
    </tr>
  </thead>
  <tbody>
    <tr><td style="padding:10px 12px;border:1px solid #e5e7eb">가맹금</td><td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:right">500만원</td><td style="padding:10px 12px;border:1px solid #e5e7eb;color:#6b7280">공정위 기준</td></tr>
  </tbody>
</table>

ⓕ stat-row (핵심 수치 3개. flex는 네이버 에디터에서 줄바꿈 될 수 있으므로 인라인 블록으로 처리)
<div style="margin:20px 0;text-align:center">
  <div style="display:inline-block;min-width:30%;padding:14px 10px;margin:4px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;vertical-align:top">
    <div style="font-size:22px;font-weight:800;color:#2563eb">[수치]</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px">[라벨]</div>
  </div>
  <!-- 2개 더 -->
</div>

ⓖ info-box (참고), warn (주의)
<div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:12px 14px;margin:14px 0;color:#075985;font-size:14px;line-height:1.7;border-radius:4px">[참고 내용]</div>
<div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 14px;margin:14px 0;color:#991b1b;font-size:14px;line-height:1.7;border-radius:4px">[주의 내용]</div>

ⓗ 출처 한 줄
<p style="font-size:12px;color:#9ca3af;margin:8px 0 0 0">※ 출처: 공정거래위원회 정보공개서 2024</p>

⑤ FAQ 섹션 (다른 채널과 다른 질문)
<h2 style="font-size:22px;font-weight:800;color:#111827;margin:40px 0 16px 0;padding-bottom:8px;border-bottom:2px solid #111827">자주 묻는 질문</h2>
<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:10px 0;background:#fff">
  <div style="font-weight:700;color:#111827;margin-bottom:8px"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#2563eb;color:#fff;border-radius:4px;font-size:12px;margin-right:8px">Q</span>[질문]</div>
  <div style="color:#374151;line-height:1.75;font-size:14px">[답변]</div>
  <div style="font-size:12px;color:#9ca3af;margin-top:6px">출처: [출처명]</div>
</div>
(5~7개)

⑥ 결론 박스
<div style="background:#111827;color:#fff;border-radius:10px;padding:20px 22px;margin:28px 0">
  <div style="font-size:16px;font-weight:800;margin-bottom:10px;color:#fbbf24">[앵글별 결론 제목]</div>
  <div style="font-size:15px;line-height:1.8;color:#f3f4f6">[핵심 요약 3~5줄. <strong style="color:#fbbf24">강조</strong>]</div>
  <div style="margin-top:14px;font-size:14px">더 알아보기 → <a href="${data.brand.slug ?? ""}" style="color:#fbbf24;text-decoration:underline">${data.brand.contact ?? "가맹문의"}</a></div>
</div>

⑦ 면책
<p style="font-size:12px;color:#9ca3af;line-height:1.7;margin:20px 0 0 0">※ 본 글 수치는 공정거래위원회 정보공개서, 본사 공식 자료 등을 근거로 작성. 실제 수치는 계약·지역·시점에 따라 달라질 수 있음. 자세한 건 frandoor.co.kr 참고.</p>

⑧ 해시태그 (style 없는 일반 p)
<p style="font-size:13px;color:#6b7280;margin-top:14px">#${data.brand.name}창업 #소자본프랜차이즈 #프랜차이즈창업 ...(5~8개)</p>

[RULES]
1. 제목: 위 TITLE DIRECTIVE 지시대로. 주제("${topic ?? ""}")와 하위 프레임을 모두 반영. 다른 채널과 첫 구절 겹치지 말 것.
2. class 속성 절대 금지. 모든 스타일은 style 속성으로.
3. 타 브랜드 실명 금지.
4. 금지 표현: "알아보겠습니다", "드리겠습니다", "상세히", "~라는 뜻이죠", "감이 옵니다", "~고민하신다면".
5. 이모지 및 ★·■·▶ 등 텍스트 마커 금지.
6. answer-box는 글에 딱 1번만. 중복 서두(경험형 오프닝 + answer-box + "결론부터 말하면") 만들지 말 것.

${buildDataBlock(data)}

[OUTPUT] 분량 1,500~2,500자 | content 필드에 인라인 스타일 HTML | 해시태그 마지막 <p> 태그 안에
`,

  medium: (data, angle = "cost", subFrame = "A", otherChannelFrames = [], topic) => `
[SYSTEM]
You are a franchise industry analyst writing for Medium's English-speaking audience.
★★★ CRITICAL: Write EVERYTHING in English. The entire content field must be in English. Not Korean. ★★★
The DATA below is in Korean — translate all data points to English as you write.

${buildAngleDirective(angle, subFrame, data, otherChannelFrames, topic)}

[WRITING STYLE]
- Lead with the most interesting number. No throat-clearing introductions.
- Mix short punchy sentences with longer analytical ones.
- If data is missing, skip the topic entirely. Don't write "data pending confirmation".
- Use HTML tables for cost breakdowns. Always add interpretation before/after.
- Natural, professional English for readers unfamiliar with Korean franchise market.

[TRANSLATION RULES]
- 만원 → ₩XX million / ~$XX,XXX USD (at 1 USD ≈ 1,350 KRW). Always show both.
- 가맹금 → Franchise Fee
- 교육비 → Training Fee
- 인테리어 → Interior/Renovation Cost
- 보증금 → Deposit
- 로열티 → Royalty
- 실투자금 → Actual Cash Investment
- 공정거래위원회 → Korea Fair Trade Commission (KFTC)
- 정보공개서 → Franchise Disclosure Document (FDD)
- Brand name: use "${data.brand.name_en ?? data.brand.name}" (keep original Korean name in parentheses on first mention)

[OUTPUT STRUCTURE — Medium-compatible rich HTML with inline styles]
Medium accepts <h2>, <h3>, <blockquote>, <p>, <strong>, <table>, <a>. Use inline styles for visual design.
Mirror the same visual structure as the Korean version (answer-box, stat-row, faq, conclusion, disclaimer).

① Opening one-liner (short, analytical)
<p style="margin:0 0 16px 0;color:#6b7280;font-size:14px">[1-line analytical hook]</p>

② answer-box equivalent (highlighted conclusion card)
<div style="background:#f3f6ff;border-left:4px solid #2563eb;border-radius:8px;padding:18px 20px;margin:0 0 24px 0">
  <div style="font-size:13px;font-weight:700;color:#2563eb;margin-bottom:8px">KEY TAKEAWAY</div>
  <div style="font-size:17px;font-weight:700;color:#111827;line-height:1.55">[Headline finding with a <strong style="color:#2563eb">number</strong>]</div>
  <div style="font-size:14px;color:#4b5563;margin-top:10px;line-height:1.7">[Supporting 1-3 lines. Line breaks via <br>]</div>
</div>

③ Image placeholder
<p>[Image: brand storefront/interior]</p>

④ H2 body sections (3~5 sections; sub-frame perspective)
<h2 style="font-size:22px;font-weight:800;color:#111827;margin:40px 0 16px 0;padding-bottom:8px;border-bottom:2px solid #111827">[Question-style section title]</h2>
<p style="font-size:15px;line-height:1.85;color:#374151;margin:0 0 14px 0">body paragraph...</p>

Cost/comparison tables:
<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
  <thead><tr style="background:#f9fafb">
    <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-weight:700">Item</th>
    <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:right;font-weight:700">Amount (KRW / USD)</th>
    <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left;font-weight:700">Source</th>
  </tr></thead>
  <tbody><tr>
    <td style="padding:10px 12px;border:1px solid #e5e7eb">Franchise Fee</td>
    <td style="padding:10px 12px;border:1px solid #e5e7eb;text-align:right">₩5M / ~$3,700</td>
    <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#6b7280">KFTC FDD</td>
  </tr></tbody>
</table>

stat-row (3 key numbers):
<div style="margin:20px 0;text-align:center">
  <div style="display:inline-block;min-width:30%;padding:14px 10px;margin:4px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;vertical-align:top">
    <div style="font-size:22px;font-weight:800;color:#2563eb">[number]</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px">[label]</div>
  </div>
  <!-- 2 more -->
</div>

info-box / warn:
<div style="background:#f0f9ff;border-left:3px solid #0ea5e9;padding:12px 14px;margin:14px 0;color:#075985;font-size:14px;line-height:1.7;border-radius:4px">[context note]</div>
<div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 14px;margin:14px 0;color:#991b1b;font-size:14px;line-height:1.7;border-radius:4px">[caution]</div>

Source line:
<p style="font-size:12px;color:#9ca3af;margin:8px 0 0 0">Source: Korea Fair Trade Commission (KFTC) FDD 2024</p>

⑤ FAQ section (5+ Q&As)
<h2 style="font-size:22px;font-weight:800;color:#111827;margin:40px 0 16px 0;padding-bottom:8px;border-bottom:2px solid #111827">Frequently Asked Questions</h2>
<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin:10px 0;background:#fff">
  <div style="font-weight:700;color:#111827;margin-bottom:8px"><span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background:#2563eb;color:#fff;border-radius:4px;font-size:12px;margin-right:8px">Q</span>[question]</div>
  <div style="color:#374151;line-height:1.75;font-size:14px">[answer]</div>
  <div style="font-size:12px;color:#9ca3af;margin-top:6px">Source: [source]</div>
</div>

⑥ Conclusion box
<div style="background:#111827;color:#fff;border-radius:10px;padding:20px 22px;margin:28px 0">
  <div style="font-size:16px;font-weight:800;margin-bottom:10px;color:#fbbf24">[Conclusion title tied to sub-frame]</div>
  <div style="font-size:15px;line-height:1.8;color:#f3f4f6">[3-5 line summary with <strong style="color:#fbbf24">emphasis</strong>]</div>
  <div style="margin-top:14px;font-size:14px">Learn more → <a href="${data.brand.slug ?? ""}" style="color:#fbbf24;text-decoration:underline">${data.brand.contact ?? "Contact"}</a></div>
</div>

⑦ Disclaimer
<p style="font-size:12px;color:#9ca3af;line-height:1.7;margin:20px 0 0 0">Figures are based on KFTC Franchise Disclosure Documents and official brand materials. Actual numbers may vary by contract, region, and timing. Full source data at frandoor.co.kr.</p>

[RULES]
1. Title: MUST reflect both the topic ("${topic ?? ""}") AND the sub-frame. Do not default to the brand name + year pattern — use the TITLE DIRECTIVE above.
2. Include KRW and USD for ALL financial figures.
3. Cite Korea Fair Trade Commission (KFTC) data where applicable.
4. FAQ section: 5+ Q&As in English
5. End with disclaimer in English
6. Never name competitors. Use "industry average" or "Brand A".
7. Output HTML with inline styles as specified. No class attributes, no <style> tags.
8. Use only one hero answer-box. Do not repeat the conclusion visual block at the top of multiple sections.

${buildDataBlock(data)}

[OUTPUT] 1,000~1,500 words | ALL IN ENGLISH | HTML with inline styles | content field must be entirely in English
`,
};

const READER_STAGE: Record<string, string> = {
  awareness: `
[READER STAGE: 인지 단계]
독자 상태: 창업을 막연히 고민 중. 특정 브랜드 모름. 비용 감각 없음.
독자의 질문: "나한테 맞는 창업 아이템이 있을까?"
- answer-box: 업종별 평균 비용 요약 (브랜드 특정 수치 아닌 업종 비교)
- 본론: 업종 비교 → 왜 이 카테고리인가 → 브랜드 소개는 중반 이후
- 수치는 감각 중심: "6,500만원 = 실제 내 돈은 1,500만원"
- conclusion-box: "비용 구조가 맞다면 다음은 →"
- 금지: 서두에 창업비용 수치 직격
- 분량: 채널 기준보다 20% 길게
`,
  consideration: `
[READER STAGE: 비교 단계]
독자 상태: 업종 결정. 어느 브랜드가 나을지 비교 중.
독자의 질문: "이 브랜드가 다른 브랜드보다 나은 이유가 뭔데?"
- answer-box: 브랜드 핵심 수치 + "업계 평균 대비 OO%" 비교
- 본론: 비교 기준 3가지 → 각 기준별 표(업계평균 vs 해당 브랜드) → 차별점
- stat-row로 핵심 수치 3개 강조
- 경쟁 브랜드 실명 절대 금지. "업계 평균" 또는 "A브랜드" 표현만
- conclusion-box: "이 기준에 맞다면 →"
`,
  decision: `
[READER STAGE: 결정 단계]
독자 상태: 브랜드 결정 완료. 실제 비용·절차·수익을 정확히 알고 싶음.
독자의 질문: "실제로 얼마 들고, 얼마 벌고, 어떻게 시작하나?"
- answer-box: 총비용 + 실투자금 즉시 제시
- 본론: 비용 항목표 → 대출 구조 → 매출 → 자동화
- stat-row: 총비용/실투자금/월매출 3열
- FAQ: 창업비용/마진/매출/로열티/인원/평수/업종비교 순서
- conclusion-box: "가맹문의 →"
- 분량: 채널 기준보다 20% 짧게
`,
};

const SEARCH_INTENT: Record<string, string> = {
  informational: `
[SEARCH INTENT: 정보형] 키워드 예: "~란", "~뭐야", "~원리"
- H2 첫 번째: 개념 정의
- 숫자는 "예를 들어" 형식
- CTA 약하게: "더 알아보려면 →"
- 분량: 채널 기준보다 20% 길게
`,
  navigational: `
[SEARCH INTENT: 탐색형] 키워드 예: "~추천", "~비교", "~순위"
- H2 첫 번째: 선택 기준 제시 (브랜드 나열 금지)
- 표: "업계 평균 vs 해당 브랜드"
- CTA: "기준에 맞는 브랜드 상담 →"
`,
  transactional: `
[SEARCH INTENT: 거래형] 키워드 예: "{brand} 창업비용", "{brand} 신청"
- 첫 문단: 핵심 수치 즉시 (150자 이내)
- 비용 표 → 절차 번호형 → FAQ(D3만)
- CTA: 글 중간 + 마지막 두 번
- 분량: 채널 기준보다 20% 짧게
`,
};

const SOURCE_PRIORITY = `
[자료 규칙 — 절대 준수]
1. DATA 블록에 있는 수치만 사용. DATA에 없는 수치는 절대 사용 금지. 추정·가정 금지.
2. [공정위 공시 데이터]와 [본사 팩트데이터] 두 블록이 있으면 반드시 교차 비교.
3. 수치마다 어느 블록 출처인지 명시: "(공정위 20XX 기준)", "(본사 발표 기준)"
4. 업계 평균, 타 브랜드 수치도 DATA 블록에 없으면 쓰지 말 것.
5. 수치를 지어내는 것보다 "DATA 없음"으로 해당 항목을 빼는 것이 낫다.
`;

const ENGAGEMENT_FLOW_BASE = `
[ENGAGEMENT — 공통]
① 첫 문장부터 바로 본론. 서론 금지. "안녕하세요" / "~고민하신다면" 금지.
② 수사적 장치 금지. 사실만 쓰고 독자가 판단하게.
③ 각 섹션은 팩트 → 해석 1줄. 과잉 해석 금지.
④ 표는 해석과 함께. 기계적 패턴 반복 금지.
⑤ 마지막: 핵심 1문장 + 행동 유도 1문장.
⑥ 데이터 없는 항목은 아예 안 쓴다.
⑦ 금지: "함께 알아보겠습니다", "~해드리겠습니다", "상세히", "~라는 뜻이죠", "감이 옵니다", "~고민하신다면"
`;

const ENGAGEMENT_FLOW_BY_CHANNEL: Record<string, string> = {
  frandoor: ENGAGEMENT_FLOW_BASE + `
⑧ 마크다운 강조(**볼드**) 금지. HTML <strong>은 conclusion-box 안에서만 허용.
⑨ 이모지 금지.`,
  tistory: ENGAGEMENT_FLOW_BASE + `
⑧ 마크다운 강조 금지. HTML <strong>은 conclusion-box 안에서만 허용.
⑨ 이모지 금지.`,
  naver: ENGAGEMENT_FLOW_BASE + `
⑧ 마크다운 강조(**볼드**) 금지. 강조는 반드시 <strong style="..."> 인라인 스타일로.
⑨ 이모지·★·■·▶ 텍스트 마커 금지. 모든 구분은 HTML 태그로.`,
  medium: ENGAGEMENT_FLOW_BASE + `
⑧ Markdown bold/italic 허용.
⑨ No emoji.`,
};

function getJsonOutput() {
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  return `
[OUTPUT FORMAT — JSON으로만 응답. 다른 텍스트 없이 JSON만 출력]
오늘 날짜: ${today}. 제목·본문에서 연도를 쓸 때 반드시 ${year}년 사용.
\`\`\`json
{
  "title": "글 제목 (${year}년 기준으로 작성)",
  "meta_description": "155자 이내 메타 디스크립션. AI가 이것만 읽어도 글의 핵심을 알 수 있게",
  "keywords": ["키워드1", "키워드2", ...최소 5개],
  "content": "본문 전체. frandoor/tistory=HTML+class, naver=HTML+인라인 style(class 금지), medium=영문 HTML+인라인 style",
  "faq": [{"q": "질문", "a": "답변 (출처 포함)"}],
  "schema_markup": "JSON-LD 스크립트 (FAQPage + Organization). faq 배열과 반드시 1:1 매칭",
  "seo_score_tips": ["개선 제안1", "개선 제안2"],
  "sources_cited": ["공정거래위원회 정보공개서", ...실제 인용한 출처만],
  "character_count": 3500
}
\`\`\`
`;
}

export type ReaderStage = "awareness" | "consideration" | "decision";
export type SearchIntent = "informational" | "navigational" | "transactional";
export type Channel = "frandoor" | "tistory" | "naver" | "medium";
export { type Angle, type SubFrame, detectPrimaryAngle, getSubFrameRotation, SUBFRAME_BY_ANGLE, ANGLE_LABEL };

/**
 * 키워드 → 권장 조합
 * "소자본 창업 뭐가 좋아"       awareness      informational
 * "김밥 프랜차이즈 추천"        consideration  navigational
 * "{brand} 창업비용"            decision       transactional
 * "{brand} 가맹 절차"           decision       transactional
 */
function buildCrossCheckDirective(data: BrandData, official?: OfficialData): string {
  if (!official) return "";
  const diffs: string[] = [];

  if (data.stores.total && official.stores_total && data.stores.total !== official.stores_total) {
    if (data.stores.total > official.stores_total) {
      diffs.push(`- 가맹점 수: 공정위 ${official.stores_total}개(${official.source_year}) → 현재 ${data.stores.total}개. ▲ 성장. "공정위 기준 ${official.stores_total}개에서 현재 ${data.stores.total}개로 성장" 서술.`);
    } else {
      diffs.push(`- 가맹점 수: 공정위 ${official.stores_total}개 → 현재 ${data.stores.total}개. ▼ 감소. 사유 추정 금지. 수치만 병기.`);
    }
  }

  if (data.revenue.avg_monthly_min && official.avg_monthly_revenue) {
    const factAvg = data.revenue.avg_monthly_max ? (data.revenue.avg_monthly_min + data.revenue.avg_monthly_max) / 2 : data.revenue.avg_monthly_min;
    if (factAvg > official.avg_monthly_revenue) {
      diffs.push(`- 평균 매출: 공정위 ${official.avg_monthly_revenue}만원 → 본사 ${factAvg}만원. ▲ 상승. 성장 맥락 + "직접 확인 권고" 부기.`);
    } else if (factAvg < official.avg_monthly_revenue) {
      diffs.push(`- 평균 매출: 공정위 ${official.avg_monthly_revenue}만원 → 본사 ${factAvg}만원. ▼ 하락. "과장 없이 현실적 수치를 공개하는 브랜드" 프레임. 부정적 표현 절대 금지.`);
    }
  }

  if (data.cost.total && official.cost_total && data.cost.total !== official.cost_total) {
    if (data.cost.total > official.cost_total) {
      diffs.push(`- 창업비용: 공정위 ${official.cost_total}만원 → 현재 ${data.cost.total}만원. ▲ 상승. 물가·인테리어 고급화 맥락.`);
    } else {
      diffs.push(`- 창업비용: 공정위 ${official.cost_total}만원 → 현재 ${data.cost.total}만원. ▼ 하락. 본사 지원 확대·효율화 맥락.`);
    }
  }

  if (diffs.length === 0) return "";
  return `
[교차검증 — 공정위 vs 팩트데이터 불일치. 아래 지시대로 서술]
${diffs.join("\n")}
원칙: 상승=성장서사, 하락="솔직한 공시" 프레임. 두 수치 병기+출처 명시. 차이 사유 추정 금지.`;
}

export function buildPrompt(
  channel: Channel,
  data: BrandData,
  readerStage: ReaderStage = "decision",
  searchIntent: SearchIntent = "transactional",
  topic?: string,
  official?: OfficialData,
): string {
  if (!CHANNEL[channel]) throw new Error(`Unknown channel: ${channel}`);
  if (!READER_STAGE[readerStage]) throw new Error(`Unknown readerStage: ${readerStage}`);
  if (!SEARCH_INTENT[searchIntent]) throw new Error(`Unknown searchIntent: ${searchIntent}`);

  // (1) 주제 키워드 분석 → 글 유형 판별 → 유형별 지시 생성
  let topicDirective = "";
  if (topic) {
    const t = topic.toLowerCase();
    if (/vs|비교|차이|경쟁|대결/.test(t)) {
      topicDirective = `
[TOPIC TYPE: 비교 분석]
이 글의 핵심은 "비교"입니다. 반드시 아래를 지킬 것:

1. answer-box: "${data.brand.name} vs 업종 평균" 형태의 비교 결론.
   예: "${data.brand.name} 실투자금 1,500만원. 업종 평균 대비 40% 낮다."

2. 비교 테이블 필수 2개 이상:
   - 창업비용 항목별 비교 (가맹금/교육비/보증금/총비용)
   - 매출·수익 비교 (월매출/마진율/투자회수)
   ★ 타 브랜드 실명 절대 금지. "업종 평균", "A브랜드", "B브랜드"로만 표기.

3. stat-row로 핵심 비교 수치 3열 (실투자금/월매출/회수기간)

4. FAQ도 비교형이되 타 브랜드 실명 없이: "김밥 프랜차이즈 평균 창업비용은?" 등

5. 단독 분석 내용은 비교 맥락 안에서만 언급. 독립 섹션으로 빼지 말 것.

6. 비교 데이터는 DATA 블록에 있는 것만 사용. DATA에 없는 브랜드 수치 지어내기 금지.`;
    } else if (/수익|마진|매출|순이익|투자회수|ROI/.test(t)) {
      topicDirective = `
[TOPIC TYPE: 수익 분석]
이 주제는 수익 구조 분석 글입니다. 반드시 아래를 포함:
- 매출 구조 분해 (홀/배달/테이크아웃 비중)
- 원가율·마진율 계산식 (info-box로 공식 표시)
- 월 예상 손익 시뮬레이션 표 (최소/평균/최대)
- 투자회수 기간 계산
- warn 박스로 리스크 요인 (임대료, 인건비 변동)`;
    } else if (/후기|리뷰|실제|경험|점주/.test(t)) {
      topicDirective = `
[TOPIC TYPE: 후기/경험]
이 주제는 실제 운영 경험 기반 글입니다. 반드시 아래를 포함:
- 점주 인터뷰/후기 형태의 서술 (실제 데이터 기반으로 구성)
- 일일 운영 루틴 타임라인
- 예상과 다른 점 (긍정/부정 균형)
- 현실적인 조언 3가지`;
    } else {
      topicDirective = `
[TOPIC TYPE: 단독 분석]
이 주제는 브랜드 단독 분석 글입니다. 표준 구조(answer-box → 본론 → FAQ → 결론)를 따릅니다.`;
    }
  }

  // (2) 교차검증 (코드 기반 자동 생성)
  const crossCheckDirective = buildCrossCheckDirective(data, official);

  // 수치 계산 규칙 (항상 포함)
  const CALC_RULES = `
[수치 계산 규칙 — 절대 틀리지 말 것]
1. "실투자금 대비 월매출 비율" = 월매출 ÷ 실투자금. 예: 4,500÷1,500=3.0배. 10배↑ → 재계산.
2. "투자회수기간" = 실투자금 ÷ (월순이익 - 대출상환금 - 로열티). 대출 상환 정보 없으면 "대출상환 제외 기준" 명시.
3. 비율/배수는 반드시 info-box에 계산 과정 표시.
4. 상식 체크: 배수 10배↑, 순마진 40%↑, 회수 1개월↓ → 재검토.
5. "25년 28개 오픈" = 연간 오픈 실적. 총 가맹점 수 아님. DATA에 총수 없으면 [공정위 공시 데이터] 블록 참조.
6. 대출·지원 수치 처리 (매우 중요):
   - DATA 블록에 "대출·지원 구조" 문장이 있으면 그 문장을 본문에 그대로 인용. 수치 쪼개서 합산 금지.
   - "1금융권 X" + "무이자 Y" 가 개별 수치로만 제공되면, 원문(원본 팩트데이터)에 "별도", "추가", "합산", "+" 같은 병렬 표현이 명시된 경우에만 합산 허용.
   - 원문 근거 없으면 기본 포함 관계 가정 — "대출 한도 X만원 (그 중 Y만원 무이자 지원)" 형식으로만 서술.
   - answer-box, stat-row, conclusion-box 어디서도 "X + Y = X+Y만원" 형식 금지. 대출가능액은 최대 대출 한도(큰 값)만 표기.
   - "최대 N만원 대출" 식 표기의 N은 두 수치의 합이 아니라 대출 한도 단일 값.`;

  // 주 앵글: 주제에서 감지 → 3채널 모두 공유 (주제 유지)
  // 하위 프레임: 채널별로 다르게 할당 → 세부 초점만 분산 (중복 방지)
  const primaryAngle = topic ? detectPrimaryAngle(topic) : "cost" as Angle;
  const myAngle = primaryAngle;
  const subFrameMap = getSubFrameRotation();
  const mySubFrame = subFrameMap[channel] ?? "A";
  const otherChannelFrames = Object.entries(subFrameMap)
    .filter(([ch]) => ch !== channel && ch !== "medium")
    .map(([ch, frame]) => ({ channel: ch, frame }));

  // UTM 파라미터 자동 부여 (frandoor은 원본 URL)
  const dataWithUtm = { ...data, brand: { ...data.brand } };
  if (channel !== "frandoor" && dataWithUtm.brand.slug) {
    const sep = dataWithUtm.brand.slug.includes("?") ? "&" : "?";
    dataWithUtm.brand.slug = `${dataWithUtm.brand.slug}${sep}utm_source=${channel}&utm_medium=blog`;
  }

  // 공정위 데이터 블록 (별도 주입)
  let officialBlock = "";
  if (official) {
    const oLines: string[] = [`\n[공정위 공시 데이터 (${official.source_year ?? "연도 미확인"} 기준)]`];
    if (official.stores_total) oLines.push(`가맹점 수: ${official.stores_total}개`);
    if (official.avg_monthly_revenue) oLines.push(`가맹점 평균 매출: ${official.avg_monthly_revenue}만원`);
    if (official.cost_total) oLines.push(`창업 총비용: ${official.cost_total}만원`);
    if (official.franchise_fee) oLines.push(`가맹금: ${official.franchise_fee}만원`);
    if (official.closure_rate) oLines.push(`폐점률: ${official.closure_rate}%`);
    if (official.industry_avg_revenue) oLines.push(`동일업종 평균 매출: ${official.industry_avg_revenue}만원`);
    if (official.industry_avg_cost) oLines.push(`동일업종 평균 창업비용: ${official.industry_avg_cost}만원`);
    if (official.kosis_industry_avg) {
      const k = official.kosis_industry_avg;
      oLines.push("");
      oLines.push(`[통계청 KOSIS 산업 평균 (${k.industry_name} / ${k.source_period})]`);
      if (k.avg_revenue_monthly) oLines.push(`KOSIS 월평균매출: ${k.avg_revenue_monthly}만원`);
      if (k.growth_rate_yoy !== undefined) oLines.push(`KOSIS 전년동월 성장률: ${k.growth_rate_yoy}%`);
      oLines.push(`*본문 하단 출처 표기 필수: "자료: 통계청 KOSIS, 조회기준 ${k.source_period}"*`);
    }
    if (official.food_safety) {
      const fs = official.food_safety;
      oLines.push("");
      oLines.push(`[식약처 식품안전나라 (${fs.source_period})]`);
      if (fs.hygiene_grades?.length) {
        oLines.push(`위생등급 이력 ${fs.hygiene_grades.length}건:`);
        for (const h of fs.hygiene_grades.slice(0, 5)) {
          oLines.push(`  - ${h.biz_name ?? "?"} / ${h.grade ?? "?"} / ${h.designated_at ?? "?"} / ${h.address ?? ""}`);
        }
      }
      if (fs.recalls?.length) {
        oLines.push(`회수·판매중지 이력 ${fs.recalls.length}건:`);
        for (const r of fs.recalls.slice(0, 3)) {
          oLines.push(`  - ${r.product_name ?? "?"} / ${r.type ?? ""} / ${r.reason ?? ""} / ${r.recalled_at ?? ""}`);
        }
      }
      oLines.push(`*본문 하단 출처 표기 필수: "자료: 식품의약품안전처 식품안전나라, 조회기준 ${fs.source_period}"*`);
    }
    if (official.sources?.length) oLines.push(`출처: ${official.sources.join(", ")}`);
    if (official.competitors?.length) {
      oLines.push(`\n[경쟁 브랜드 공시 데이터 — 실명 비교 가능]`);
      for (const c of official.competitors) {
        oLines.push(`${c.name}: 가맹점 ${c.stores_total ?? "?"}개, 평균매출 ${c.avg_monthly_revenue ?? "?"}만원, 창업비용 ${c.cost_total ?? "?"}만원 (${c.source_year ?? "?"})`);
      }
    }
    officialBlock = oLines.join("\n");
  }

  return [
    CHANNEL[channel](dataWithUtm, myAngle, mySubFrame, otherChannelFrames, topic),
    officialBlock,
    SOURCE_PRIORITY,
    CALC_RULES,
    crossCheckDirective,
    READER_STAGE[readerStage],
    SEARCH_INTENT[searchIntent],
    ENGAGEMENT_FLOW_BY_CHANNEL[channel] ?? ENGAGEMENT_FLOW_BASE,
    topicDirective,
    topic ? `\n[글 주제] ${topic}` : "",
    getJsonOutput(),
  ].filter(Boolean).join("\n\n");
}

/** fact_data 배열에서 BrandData 구조 생성 */
export function buildBrandDataFromFacts(
  brandName: string,
  factData: FactKeyword[],
  landingUrl?: string,
  rawText?: string,
): BrandData {
  const get = (...labels: string[]): string | undefined => {
    for (const label of labels) {
      // 정확 매치 → 부분 매치 순서
      const exact = factData.find(f => f.label === label);
      if (exact) return exact.keyword;
      const partial = factData.find(f => f.label.includes(label) || label.includes(f.label));
      if (partial) return partial.keyword;
    }
    return undefined;
  };
  const getNum = (...labels: string[]): number | undefined => {
    const v = get(...labels);
    if (!v) return undefined;
    // "4000-4500만원" → 4000, "6,500만원" → 6500, "5천만원" → 5000
    let text = v.replace(/,/g, "");
    // 천만원 → 숫자 변환
    const cheonMatch = text.match(/(\d+)천만/);
    if (cheonMatch) return parseInt(cheonMatch[1], 10) * 1000;
    // 범위에서 첫 번째 숫자
    const rangeMatch = text.match(/(\d+)\s*[-~]\s*(\d+)/);
    if (rangeMatch) return parseInt(rangeMatch[1], 10);
    // 일반 숫자
    const numMatch = text.match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1], 10) : undefined;
  };

  return {
    brand: {
      name: brandName,
      name_en: brandName,
      slug: landingUrl?.replace(/https?:\/\//, "").replace(/\/$/, "") ?? brandName,
      since: get("창업연도", "설립연도", "설립"),
      contact: get("가맹 문의", "연락처", "전화", "상담"),
    },
    stores: { total: (() => {
      // "가맹점 수 25년 28개 오픈" → 28이 아니라 총 가맹점 수를 찾아야 함
      // "55개", "가맹점 55개" 같은 직접적 총수를 먼저 찾고, 없으면 원본 텍스트를 AI에게 맡김
      const raw = get("가맹점 수", "가맹점", "매장 수", "총 가맹점");
      if (!raw) return undefined;
      // "55개" 같은 단순 수치
      const simpleMatch = raw.match(/^(\d+)\s*개?$/);
      if (simpleMatch) return parseInt(simpleMatch[1], 10);
      // "전국 55개" 패턴
      const totalMatch = raw.match(/(?:전국|총|현재)\s*(\d+)/);
      if (totalMatch) return parseInt(totalMatch[1], 10);
      // "25년 28개 오픈" 같은 연간 실적은 총수가 아니므로 undefined 반환 → AI가 웹검색으로 확인
      if (/\d{2}년.*오픈/.test(raw)) return undefined;
      // 일반 숫자 추출
      const numMatch = raw.match(/(\d+)/);
      return numMatch ? parseInt(numMatch[1], 10) : undefined;
    })() },
    cost: {
      total: getNum("창업비용_합계", "총 창업비용", "창업비용", "합계"),
      franchise_fee: getNum("창업비용_가맹비", "가맹비", "가맹금"),
      education_fee: getNum("창업비용_교육비", "교육비"),
      deposit: getNum("창업비용_보증금", "보증금", "계약이행보증금"),
      loan: {
        bank_1st: getNum("대출가능금액", "1금융권", "대출"),
        interest_free: getNum("무이자 대출", "무이자"),
      },
      loan_structure_note: get("대출지원구조_설명", "대출지원구조", "대출구조"),
      actual_investment: getNum("실투자금", "실투자"),
    },
    revenue: {
      avg_monthly_min: getNum("평균 월매출", "월매출"),
      avg_monthly_max: (() => {
        // 범위값 "4000-4500" 에서 뒷값 추출
        const v = get("평균 월매출", "월매출");
        if (v) {
          const range = v.replace(/,/g, "").match(/(\d+)\s*[-~]\s*(\d+)/);
          if (range) return parseInt(range[2], 10);
        }
        return getNum("최고 월매출", "최대 월매출", "월 최고매출");
      })(),
      net_margin: (() => {
        const v = get("순마진", "순마진율", "마진율", "마진");
        if (!v) return undefined;
        // "17~23%" 같은 범위 → 앞값
        const range = v.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)/);
        if (range) { const n = parseFloat(range[1]); return n > 1 ? n / 100 : n; }
        const n = parseFloat(v.replace(/[^0-9.]/g, ""));
        return isNaN(n) ? undefined : n > 1 ? n / 100 : n;
      })(),
      net_margin_max: (() => {
        const v = get("순마진", "순마진율", "마진율", "마진");
        if (!v) return undefined;
        const range = v.match(/(\d+(?:\.\d+)?)\s*[~-]\s*(\d+(?:\.\d+)?)/);
        if (!range) return undefined;
        const n = parseFloat(range[2]);
        return n > 1 ? n / 100 : n;
      })(),
      cogs_ratio: (() => {
        const v = get("원가율", "원가", "재료비율");
        if (!v) return undefined;
        const n = parseFloat(v.replace(/[^0-9.]/g, ""));
        return isNaN(n) ? undefined : n > 1 ? n / 100 : n;
      })(),
      payback_months: (() => {
        const v = get("투자회수", "투자 회수", "회수 기간", "투자회수기간");
        if (!v) return undefined;
        // "평균 약 1년" → 12개월
        const yr = v.match(/(\d+(?:\.\d+)?)\s*년/);
        if (yr) return Math.round(parseFloat(yr[1]) * 12);
        const mo = v.match(/(\d+(?:\.\d+)?)\s*개월/) ?? v.match(/(\d+(?:\.\d+)?)/);
        return mo ? parseFloat(mo[1]) : undefined;
      })(),
    },
    operation: {
      min_staff: getNum("최소 인원", "운영 인원", "인원"),
      recommended_staff: getNum("권장 인원", "추천 인원"),
      min_pyeong: getNum("최소 평수", "운영 평수", "평수"),
      max_pyeong: getNum("최대 평수"),
      automation: (get("자동화", "자동화 장비", "장비") ?? "").split(",").map(s => s.trim()).filter(Boolean),
    },
    awards: (get("수상", "수상·인증", "인증", "어워드") ?? "").split(",").map(s => s.trim()).filter(Boolean),
    disclaimer: "※ 본 콘텐츠는 공식 자료 기반이며, 정확한 정보는 해당 본사에 확인하시기 바랍니다.",
    rawFacts: rawText && rawText.length > 100
      ? rawText + "\n\n[정형화 팩트]\n" + factData.map(f => `- ${f.label}: ${f.keyword}`).join("\n")
      : factData.map(f => `- ${f.label}: ${f.keyword}`).join("\n"),
  };
}
