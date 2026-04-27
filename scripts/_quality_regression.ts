/**
 * PR053 Part B — D3 회귀 스위트.
 * BRANDS × TOPICS 조합 generate → 30 체크 항목 평가 → 통계 + JSON 출력.
 *
 * 사용법:
 *   npx tsx scripts/_quality_regression.ts
 *   npx tsx scripts/_quality_regression.ts --brand=오공김밥 --topic=창업비용
 *   npx tsx scripts/_quality_regression.ts --max=3 (최대 N runs)
 */

import Module from "node:module";
const ModAny = Module as unknown as { _load: (req: string, ...rest: unknown[]) => unknown };
const origLoad = ModAny._load;
ModAny._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return origLoad.call(this, req, ...rest);
};

import * as fs from "node:fs";
import * as path from "node:path";
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=([\s\S]*)$/);
    if (!m) continue;
    let v = m[2];
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

const DEFAULT_BRANDS = [{ id: "82c7ffc9-ed53-44bf-859d-a9a72b147b20", name: "오공김밥" }];
const TOPICS = ["창업비용 분석", "가맹점 확장 추세", "월매출 분석"];

/**
 * PR057 — fact_data 풍부 + ftc 매칭 가용 + industry_main 다양성 5 brand 자동 선정.
 * ftc 미가동 또는 후보 부족 시 graceful fallback (DEFAULT_BRANDS 만).
 * --auto 플래그 시에만 동작.
 */
async function pickRegressionBrands(): Promise<{ id: string; name: string }[]> {
  const { createAdminClient } = await import("../utils/supabase/admin");
  const { isFtc2024Configured, fetchFtcBrand } = await import("../lib/geo/prefetch/ftc2024");

  const adminSb = createAdminClient();
  const { data: candidates, error } = await adminSb
    .from("geo_brands")
    .select("id, name, industry_main, fact_data")
    .not("fact_data", "is", null)
    .limit(50);
  if (error || !candidates) {
    console.warn(`[pickRegressionBrands] geo_brands 조회 실패: ${error?.message ?? "no data"}`);
    return DEFAULT_BRANDS;
  }

  // 오공김밥 항상 첫번째
  const seedName = "오공김밥";
  const seed = candidates.find((c) => c.name === seedName);
  const selected: { id: string; name: string }[] = [];
  const usedIndustries = new Set<string>();
  if (seed) {
    selected.push({ id: seed.id, name: seed.name });
    if (seed.industry_main) usedIndustries.add(seed.industry_main);
  }

  // ftc 매칭 가능 + industry 다양성
  const ftcOn = isFtc2024Configured();
  for (const c of candidates) {
    if (selected.find((s) => s.id === c.id)) continue;
    if (c.industry_main && usedIndustries.has(c.industry_main)) continue;
    if (ftcOn) {
      const ftc = await fetchFtcBrand({ brand_nm: c.name });
      if (!ftc) continue;
    }
    // fact_data 가 충분히 풍부한지 (기본: docx 비교표 ≥ 1개 또는 official_data 존재)
    const fd = c.fact_data as { __comparison_tables__?: unknown[]; official_data?: unknown } | null;
    const rich =
      (Array.isArray(fd?.__comparison_tables__) && (fd?.__comparison_tables__?.length ?? 0) >= 1) ||
      !!fd?.official_data;
    if (!rich) continue;

    selected.push({ id: c.id, name: c.name });
    if (c.industry_main) usedIndustries.add(c.industry_main);
    if (selected.length === 5) break;
  }
  if (selected.length === 0) return DEFAULT_BRANDS;
  return selected;
}

type Args = { brand?: string; topic?: string; max?: number; auto?: boolean };
function parseArgs(): Args {
  const a: Args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--brand=")) a.brand = arg.slice("--brand=".length);
    else if (arg.startsWith("--topic=")) a.topic = arg.slice("--topic=".length);
    else if (arg.startsWith("--max=")) a.max = parseInt(arg.slice("--max=".length), 10);
    else if (arg === "--auto") a.auto = true;
  }
  return a;
}

type CheckOutcome = { id: string; description: string; pass: boolean; detail?: string };

function getBody(out: { payload: { sections?: { heading: string; body: string }[]; meta?: { frontmatter?: unknown; frontmatterYaml?: string } } }): string {
  const sections = out.payload.sections ?? [];
  const fm = out.payload.meta?.frontmatterYaml ?? "";
  const sectionMd = sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  return fm ? `${fm}\n${sectionMd}` : sectionMd;
}

function getFrontmatter(out: { payload: { meta?: { frontmatter?: unknown } } }): {
  title?: string;
  description?: string;
  slug?: string;
  category?: string;
  tags?: string[];
  faq?: { q: string; a: string }[];
} {
  return (out.payload.meta?.frontmatter as Record<string, unknown>) as {
    title?: string;
    description?: string;
    slug?: string;
    category?: string;
    tags?: string[];
    faq?: { q: string; a: string }[];
  } ?? {};
}

function buildChecks(brand: string): Array<{
  id: string;
  description: string;
  check: (body: string, fm: ReturnType<typeof getFrontmatter>) => boolean;
}> {
  return [
    // frontmatter (PR047)
    { id: "FM01", description: "frontmatter 시작 ---", check: (b) => b.startsWith("---") },
    { id: "FM02", description: "title 존재", check: (_b, fm) => !!fm.title },
    { id: "FM03", description: "description ≤ 100자", check: (_b, fm) => (fm.description?.length ?? 0) <= 100 },
    { id: "FM04", description: "slug url-safe", check: (_b, fm) => /^[a-z0-9-]+$/.test(fm.slug ?? "") },
    { id: "FM05", description: "category 존재", check: (_b, fm) => !!fm.category },
    { id: "FM06", description: "tags ≥ 3", check: (_b, fm) => (fm.tags?.length ?? 0) >= 3 },
    { id: "FM07", description: "faq 3~5개", check: (_b, fm) => { const n = fm.faq?.length ?? 0; return n >= 3 && n <= 5; } },

    // 본문 진입 (PR045·PR046)
    { id: "LD01", description: "메타 안내 1회 ('여기서 끝내도 됩니다')", check: (b) => b.includes("여기서 끝내도 됩니다") },
    { id: "LD02", description: "stat-row markdown 표 진입부", check: (b) => /^\| 지표 \|/m.test(b) },
    { id: "LD03", description: "화살표 진입 ≥ 1", check: (b) => (b.match(/^→ /gm)?.length ?? 0) >= 1 },

    // 산식 박스 (PR049·PR050)
    { id: "FB01", description: "산식 H2 1회", check: (b) => (b.match(/## 이 글에서 계산한 값들/g)?.length ?? 0) === 1 },
    { id: "FB02", description: "굵은 결과값 ≥ 2", check: (b) => (b.match(/\*\*[^*]+\*\*/g)?.length ?? 0) >= 2 },
    { id: "FB03", description: "산식 박스 코드 표현 0건", check: (b) => !/(A급\[|B급\[|C급\[|frcs_cnt|source_tier|fact_key)/.test(b) },
    { id: "FB04", description: "실질폐점률·양도양수율 0건 (PR050)", check: (b) => !/실질\s*폐점률|양도양수율/.test(b) },

    // 결론 박스 (PR045·PR051)
    { id: "CC01", description: "결론 H2 1회", check: (b) => (b.match(/## 결론/g)?.length ?? 0) === 1 },
    { id: "CC02", description: "share-line 1회 (PR051)", check: (b) => /지인이 있다면 이 글을 함께 보세요|이 정리를 전해주세요/.test(b) },
    { id: "CC03", description: "자기과시 0건 (L66)", check: (b) => !/도움이?\s*되었?다면|공유\s*부탁|저희?\s*프랜도어|프랜도어\s*데이터/.test(b) },

    // 영역 매핑 (PR052)
    { id: "AR01", description: "비교표 (| 항목 | ... |) ≥ 1개", check: (b) => /^\|\s*항목\s*\|/m.test(b) },
    { id: "AR02", description: "비고 자연어 풀이", check: (b) => /차이가? 있|일치|기준 (면적|평수)/u.test(b) },

    // 정확도 (PR048·PR050)
    {
      id: "AC01",
      description: "정량 수치 출처 키워드 동반 (공정위/본사/KOSIS/식약처)",
      check: (b) => /(공정위|본사|KOSIS|식약처)/u.test(b),
    },
    {
      id: "AC02",
      description: "한 문장 80자+ 비율 < 5%",
      check: (b) => {
        const sentences = b
          .replace(/^\|.*\|$/gm, "")
          .replace(/^>.*$/gm, "")
          .replace(/^\s*[-*]\s+.*$/gm, "")
          .split(/(?<=[.!?])\s+|\n\n+/);
        const cleaned = sentences.filter((s) => /[가-힣]/.test(s));
        if (cleaned.length === 0) return true;
        const long = cleaned.filter((s) => s.length > 80).length;
        return long / cleaned.length < 0.05;
      },
    },
    {
      id: "AC03",
      description: `받침 조사 정상 (${brand}은/는)`,
      check: (b) => {
        const wrong = new RegExp(`${brand}[는을] `, "g");
        // 임시: 정확한 한국어 받침 검사는 josa.ts 사용. 단순 문자열 검사.
        return !wrong.test(b);
      },
    },

    // 금지선 (PR031·PR038·PR042·PR047)
    { id: "BL01", description: "점포명 노출 0 (수원점·봉천점·등촌점·답십리점)", check: (b) => !/수원점|봉천점|등촌점|답십리점/.test(b) },
    { id: "BL02", description: "우열·권유 단어 0 (PR038)", check: (b) => !/추천합니다|유리합니다|매력적입니다|진입\s*가능|조건부\s*가능|판단\s*유보|비권장/.test(b) },
    { id: "BL03", description: "ABC 라벨 본문 0 (L46)", check: (b) => !/\b[ABC]급\s*=|\b[ABC]급\s*\(상위|출처\s*등급/.test(b) },
    { id: "BL04", description: "HTML 박스 클래스 0 (L49)", check: (b) => !/class\s*=\s*"[^"]*(answer-box|stat-row|conclusion-box|formula-box|info-box|warn|og-wrap)[^"]*"/.test(b) },
    { id: "BL05", description: "메타 투명성 문장 ≤ 1회 (L47)", check: (b) => (b.match(/원본\s*수치와|모두\s*공개|나란히\s*공개|투명.*공개/g)?.length ?? 0) <= 1 },
    { id: "BL06", description: "원인 추측 단어 0 (L48)", check: (b) => !/경기\s*(악화|침체|불황)|가격\s*인상\s*때문|브랜드\s*노후화|코로나|팬데믹|업황\s*악화/.test(b) },
  ];
}

async function runOne(input: { brandId: string; brandName: string; topic: string }): Promise<CheckOutcome[]> {
  const { generate } = await import("../lib/geo");
  const out = (await generate({
    depth: "D3",
    brandId: input.brandId,
    brand: input.brandName,
    topic: input.topic,
    tiers: ["A", "B", "C"],
  } as unknown as Parameters<typeof generate>[0])) as Parameters<typeof getBody>[0];
  const body = getBody(out);
  const fm = getFrontmatter(out);
  const checks = buildChecks(input.brandName);
  return checks.map((c) => {
    let pass = false;
    let detail: string | undefined;
    try {
      pass = c.check(body, fm);
    } catch (e) {
      detail = e instanceof Error ? e.message : String(e);
      pass = false;
    }
    return { id: c.id, description: c.description, pass, detail };
  });
}

async function main() {
  const args = parseArgs();
  // PR057 — --auto 플래그 시 fact_data + ftc 매칭 + industry 다양성 휴리스틱으로 5 brand 자동 선정.
  const brandPool = args.auto ? await pickRegressionBrands() : DEFAULT_BRANDS;
  if (args.auto) {
    console.log(`[--auto] ${brandPool.length} brands: ${brandPool.map((b) => b.name).join(", ")}\n`);
  }
  const targets: { brandId: string; brandName: string; topic: string }[] = [];
  for (const b of brandPool) {
    if (args.brand && b.name !== args.brand) continue;
    for (const topic of TOPICS) {
      if (args.topic && !topic.includes(args.topic)) continue;
      targets.push({ brandId: b.id, brandName: b.name, topic });
    }
  }
  const limited = args.max ? targets.slice(0, args.max) : targets;
  console.log(`=== Quality Regression: ${limited.length} runs ===\n`);

  const results: { brand: string; topic: string; passCount: number; total: number; outcomes: CheckOutcome[] }[] = [];
  for (let i = 0; i < limited.length; i++) {
    const t = limited[i];
    console.log(`[${i + 1}/${limited.length}] ${t.brandName} · ${t.topic}`);
    try {
      const outcomes = await runOne(t);
      const passCount = outcomes.filter((o) => o.pass).length;
      const total = outcomes.length;
      const fails = outcomes.filter((o) => !o.pass);
      console.log(
        `  ${passCount}/${total} (${Math.round((passCount / total) * 1000) / 10}%)${fails.length > 0 ? " — fails: " + fails.map((f) => f.id).join(",") : ""}`,
      );
      results.push({ brand: t.brandName, topic: t.topic, passCount, total, outcomes });
    } catch (e) {
      console.error(`  FAILED: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 집계
  console.log("\n=== Per-check summary ===");
  if (results.length > 0) {
    const allOutcomes = results[0].outcomes.map((o) => o.id);
    for (const id of allOutcomes) {
      const passed = results.filter((r) => r.outcomes.find((o) => o.id === id)?.pass).length;
      const desc = results[0].outcomes.find((o) => o.id === id)?.description ?? "";
      const pct = Math.round((passed / results.length) * 1000) / 10;
      const flag = pct < 90 ? " ⚠️" : "";
      console.log(`  ${id} ${desc}: ${passed}/${results.length} (${pct}%)${flag}`);
    }
  }

  if (results.length > 0) {
    const ratios = results.map((r) => r.passCount / r.total);
    const avg = ratios.reduce((s, x) => s + x, 0) / ratios.length;
    const min = Math.min(...ratios);
    const max = Math.max(...ratios);
    console.log(`\n집계: 평균 ${(avg * 100).toFixed(1)}%, 최저 ${(min * 100).toFixed(1)}%, 최고 ${(max * 100).toFixed(1)}%`);

    // 임계값 exit code (0 / 1 / 2)
    const exitCode = avg >= 0.95 ? 0 : avg >= 0.9 ? 1 : 2;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const tmpDir = path.resolve(process.cwd(), "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const out = path.join(tmpDir, `regression-${ts}.json`);
    fs.writeFileSync(out, JSON.stringify({ results, avg, min, max }, null, 2), "utf8");
    console.log(`결과 JSON: ${out}\n`);
    process.exit(exitCode);
  } else {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
