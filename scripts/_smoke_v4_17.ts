/**
 * v4-17 smoke — A only 모드 업종 단위 분석 재설계.
 * brand 단위 X. industry + topic 입력, distributions / ranking / outliers 출력.
 */
import Module from "node:module";
const ModAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModAny._load;
ModAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

let okAll = true;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  if (!ok) okAll = false;
}

async function main() {
  console.log("\n=== v4-17 smoke ===\n");

  const fs = await import("node:fs/promises");

  // T1 — types IndustryAnalysisFacts
  console.log("[T1] types IndustryAnalysisFacts / V4AOnlyInput");
  const typesSrc = await fs.readFile("lib/geo/v4/types.ts", "utf-8");
  check(`IndustryAnalysisFacts type`, typesSrc.includes("IndustryAnalysisFacts"));
  check(`IndustryDistribution type`, typesSrc.includes("IndustryDistribution"));
  check(`V4AOnlyInput type (industry + topic)`, typesSrc.includes("V4AOnlyInput") && typesSrc.includes("industry: string"));

  // T2 — buildIndustryAnalysisFacts
  console.log("\n[T2] buildIndustryAnalysisFacts");
  const { buildIndustryAnalysisFacts, DEFAULT_RANKING_METRIC } = await import(
    "../lib/geo/v4/build_industry_analysis"
  );
  check(`DEFAULT_RANKING_METRIC = "avg_sales_2024_total"`, DEFAULT_RANKING_METRIC === "avg_sales_2024_total");

  // 샘플 brand 5개 (avg_sales_2024_total 천원 단위 → ÷10 = 만원 transform)
  const brands = [
    { brand_nm: "브랜드A", avg_sales_2024_total: 800000 }, // 80,000만원 (8억)
    { brand_nm: "브랜드B", avg_sales_2024_total: 500000 }, // 5억
    { brand_nm: "브랜드C", avg_sales_2024_total: 200000 }, // 2억
    { brand_nm: "브랜드D", avg_sales_2024_total: 150000 }, // 1억 5천
    { brand_nm: "브랜드E", avg_sales_2024_total: 100000 }, // 1억
    { brand_nm: "브랜드F", avg_sales_2024_total: 50000 }, // 5천만원
    { brand_nm: "브랜드G", avg_sales_2024_total: 30000 }, // 3천만원
    { brand_nm: "브랜드H", avg_sales_2024_total: 20000 }, // 2천만원
    { brand_nm: "브랜드I", avg_sales_2024_total: 50_000_000 }, // outlier — 5조 (말도 안 되지만 ±2σ)
    { brand_nm: "브랜드J", avg_sales_2024_total: 15000 },
  ];
  // industry_facts — agg_method × value_num
  const industry_facts = [
    { metric_id: "avg_sales_2024_total", agg_method: "p25", value_num: 20000, n: 10 },
    { metric_id: "avg_sales_2024_total", agg_method: "p50", value_num: 75000, n: 10 },
    { metric_id: "avg_sales_2024_total", agg_method: "p75", value_num: 175000, n: 10 },
    { metric_id: "avg_sales_2024_total", agg_method: "p90", value_num: 600000, n: 10 },
    { metric_id: "avg_sales_2024_total", agg_method: "mean", value_num: 200000, n: 10 },
  ];

  const r = buildIndustryAnalysisFacts({
    industry: "분식",
    topic: "분식 평균 매출 분포 분석",
    selected_metrics: ["avg_sales_2024_total"],
    key_angle: "분식 매출 격차 분석",
    analysis_axes: ["분포", "ranking", "outlier"],
    ranking_metric: "avg_sales_2024_total",
    brands,
    industry_facts,
  });

  check(`industry preserved`, r.industry === "분식");
  check(`n_brands = 10`, r.n_brands === 10);
  check(`analysis_axes 3건`, r.analysis_axes.length === 3);
  check(`ranking_metric = avg_sales_2024_total`, r.ranking_metric === "avg_sales_2024_total");

  // distribution — industry_facts 값은 이미 만원 단위 집계됨 (transform 미적용)
  check(`distributions.avg_sales_2024_total 존재`, !!r.distributions.avg_sales_2024_total);
  const dist = r.distributions.avg_sales_2024_total;
  check(`distribution p50.raw = 75000 (만원, 정규화 X)`, dist?.p50?.raw === 75000, String(dist?.p50?.raw));
  check(
    `distribution p50.display = "7억 5,000만원"`,
    dist?.p50?.display === "7억 5,000만원",
    dist?.p50?.display ?? "",
  );
  check(`distribution n_population = 10`, dist?.n_population === 10);

  // ranking
  check(`ranking.metric_id = avg_sales_2024_total`, r.ranking.metric_id === "avg_sales_2024_total");
  check(`ranking.label = "가맹점 평균 연매출 — 전체 (2024)"`, r.ranking.label.includes("평균 연매출"));
  check(`ranking.top10 ≥ 5`, r.ranking.top10.length >= 5);
  // 1위는 outlier 브랜드 I (raw=5조 = 5,000,000만원)
  check(`top1 = 브랜드I (outlier)`, r.ranking.top10[0]?.brand_label === "브랜드I", r.ranking.top10[0]?.brand_label);
  // 2위는 브랜드A (80,000만원)
  check(`top2 = 브랜드A`, r.ranking.top10[1]?.brand_label === "브랜드A", r.ranking.top10[1]?.brand_label);
  check(`bottom10 ≥ 1`, r.ranking.bottom10.length >= 1);

  // outlier (avg_sales 평균 ±2σ)
  check(`outliers ≥ 1 (브랜드I 검출)`, r.outliers.length >= 1);
  if (r.outliers.length > 0) {
    check(`outlier 1위 = 브랜드I`, r.outliers[0]?.brand_label === "브랜드I");
    check(`outlier deviation = 상단`, r.outliers[0]?.deviation === "상단");
    check(`outlier sigma > 2`, (r.outliers[0]?.sigma ?? 0) > 2);
  }

  // T3 — sysprompt llm1 analyze (industry 모드)
  console.log("\n[T3] llm1_analyze_a_only sysprompt — industry 모드");
  const llm1 = await import("../lib/geo/v4/sysprompts/llm1_analyze_a_only");
  const sp1 = llm1.buildLlm1AnalyzeAOnlySysprompt();
  check(`ranking_metric 출력 명시`, sp1.includes("ranking_metric"));
  check(`업종 단위 분석 명시`, sp1.includes("업종") || sp1.includes("industry"));
  check(`단일 brand 비교 X 명시`, sp1.includes("단일 brand") || sp1.includes("업종 N개"));
  const u1 = llm1.buildLlm1AnalyzeAOnlyUser({ industry: "분식", topic: "분식 매출 분포", n_brands: 238 });
  check(`user prompt — industry 명시`, u1.includes("분식"));
  check(`user prompt — n_brands 명시`, u1.includes("238"));
  check(`user prompt — brand_id 안 들어감`, !u1.includes("brand_id"));

  // T4 — writer_a_only (industry 모드)
  console.log("\n[T4] writer_a_only sysprompt — industry 모드");
  const writer = await import("../lib/geo/v4/sysprompts/writer_a_only");
  const wsp = writer.buildWriterAOnlySysprompt({
    industry: "분식",
    topic: "분식 매출 분포 분석",
    n_brands: 238,
    today: "2026-05-04",
  });
  check(`★ 단일 brand 비교 X`, wsp.includes("단일 brand 비교 X"));
  check(`★ C 데이터 인용 절대 X`, wsp.includes("C 데이터 인용 절대 X"));
  check(`업종 단위 분석`, wsp.includes("업종") && wsp.includes("238"));
  check(`본문 3블럭 / 4,000자`, wsp.includes("3블럭") && wsp.includes("4,000자"));
  check(`distributions / ranking / outliers 명시`, wsp.includes("distributions") && wsp.includes("ranking") && wsp.includes("outliers"));
  check(`p25/p50 약어 X 룰`, wsp.includes("p25") && wsp.includes("자연어"));

  // user prompt
  const wuser = writer.buildWriterAOnlyUserPrompt({
    topic: "분식 매출",
    industry: "분식",
    a_only_facts: r,
  });
  check(`user — industry 명시`, wuser.includes("분식"));
  // a_only_facts JSON 안에 ranking[].brand_label 은 들어감 (정상). user prompt 본문에 brand_label 별도 X.
  check(
    `user prompt — "# brand_label" 헤더 X (industry 모드)`,
    !wuser.includes("# brand_label"),
  );

  // T5 — buildIndustryFrontmatter / FAQ
  console.log("\n[T5] build_industry_frontmatter — frontmatter + FAQ industry");
  const fm = await import("../lib/geo/v4/build_industry_frontmatter");
  const frontmatter = fm.buildIndustryFrontmatter({
    topic: "분식 평균 매출 분포 분석",
    industry: "분식",
    draft_id: "abc12345-def0-...",
    today: "2026-05-04",
    facts: r,
  });
  check(`title = topic`, frontmatter.title === "분식 평균 매출 분포 분석");
  check(`description 분식 + N 명시`, frontmatter.description.includes("분식") && frontmatter.description.includes("10개"));
  check(`description 출처 공정위`, frontmatter.description.includes("공정위 정보공개서"));
  check(`category = "업종 분석"`, frontmatter.category === "업종 분석");
  check(`tags 포함 분식 + 외식`, frontmatter.tags.includes("분식") && frontmatter.tags.includes("외식"));
  check(`slug "industry-분식-..."`, frontmatter.slug.startsWith("industry-분식-"));

  const faq = fm.buildIndustryFaq({ industry: "분식", facts: r });
  check(`FAQ ≥ 1`, faq.length >= 1);
  // Q1 매출 — 분식 + n_brands + 중앙값
  const qSales = faq.find((f) => f.q.includes("연매출"));
  check(
    `Q 매출 — n_brands "10개" + p50 display "7억 5,000만원"`,
    !!qSales && qSales.a.includes("10개") && qSales.a.includes("7억 5,000만원"),
    qSales?.a,
  );
  // Q2 ranking top — 브랜드 I/A 등장
  const qRank = faq.find((f) => f.q.includes("상위"));
  check(`Q ranking — 1위 브랜드 명 등장`, !!qRank && (qRank.a.includes("브랜드I") || qRank.a.includes("브랜드A")));

  // T6 — API endpoint signature
  console.log("\n[T6] /api/geo/a-only/analyze — industry + topic (brand_id X)");
  const epSrc = await fs.readFile("app/api/geo/a-only/analyze/route.ts", "utf-8");
  check(`industry 입력 검증`, epSrc.includes("industry") && epSrc.includes("필수"));
  // brand_id 파싱 / fetch 코드 제거 — 주석 안 historical 언급은 OK.
  check(`brand_id 파싱 제거`, !epSrc.includes("r.brand_id"));
  check(`V4AOnlyInput type import`, epSrc.includes("V4AOnlyInput"));
  check(`v4-17 마커`, epSrc.includes("v4-17"));

  // T7 — pipeline runStep1AnalyzeAOnly signature (industry)
  console.log("\n[T7] pipeline runStep1AnalyzeAOnly — industry signature");
  const pipelineSrc = await fs.readFile("lib/geo/v4/pipeline.ts", "utf-8");
  check(`runStep1AnalyzeAOnly takes V4AOnlyInput`, pipelineSrc.includes("runStep1AnalyzeAOnly(input: V4AOnlyInput)"));
  check(`fetchAOnlyBundle 함수`, pipelineSrc.includes("function fetchAOnlyBundle"));
  check(`buildIndustryAnalysisFacts import`, pipelineSrc.includes("buildIndustryAnalysisFacts"));
  check(`buildIndustryFrontmatter import`, pipelineSrc.includes("buildIndustryFrontmatter"));
  check(`buildIndustryFaq import`, pipelineSrc.includes("buildIndustryFaq"));
  check(`brand_id: null INSERT`, pipelineSrc.includes("brand_id: null"));
  check(`v4-17 마커`, pipelineSrc.includes("v4-17"));
  check(`pipeline_version "v4-17"`, pipelineSrc.includes('pipeline_version: "v4-17"'));
  // v4-16 buildAOnlyFacts 참조 제거됨
  check(`buildAOnlyFacts 참조 제거`, !pipelineSrc.includes("buildAOnlyFacts"));

  // T8 — editor page UI — industry select + brand 검색 분기
  console.log("\n[T8] editor page — industry select + chain 분기");
  const editorSrc = await fs.readFile("app/(groupware)/content/editor/page.tsx", "utf-8");
  check(`INDUSTRIES_15 const`, editorSrc.includes("INDUSTRIES_15"));
  check(`industry state`, editorSrc.includes("[industry, setIndustry]"));
  check(`업종 선택 UI 노출 (a_only)`, editorSrc.includes("업종 선택"));
  check(`industry select dropdown`, editorSrc.includes("INDUSTRIES_15.map"));
  check(`a-only/analyze body { industry, topic }`, editorSrc.includes("JSON.stringify({ industry, topic })"));
  check(`기존 brand 검색 (a_plus_c) 유지`, editorSrc.includes("브랜드명 검색"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
