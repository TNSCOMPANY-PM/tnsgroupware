/**
 * AEO 스캔 — Playwright 실제 브라우저 기반
 *
 * Google AI Overview / 네이버 AI 브리핑 에 frandoor 콘텐츠가 인용됐는지 체크.
 *
 * 사용법:
 *   npx tsx scripts/aeo-scan.ts                     # 기본 브랜드, google+naver 둘 다
 *   npx tsx scripts/aeo-scan.ts --platform=google   # 구글만
 *   npx tsx scripts/aeo-scan.ts --platform=naver    # 네이버만
 *   npx tsx scripts/aeo-scan.ts --brand=프랜도어 --headful
 *   npx tsx scripts/aeo-scan.ts --keywords=5        # 상위 5개 키워드만 (디버그)
 *
 * 결과는 기존 aeo_check_runs 테이블에 platform = "aeo_google" | "aeo_naver" 로 저장.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_BRAND = "프랜도어";
const USER_DATA_DIR = path.join(__dirname, ".aeo-chrome-profile");
const SCREENSHOT_DIR = path.join(__dirname, "..", "screenshots", "aeo");
const TODAY = new Date().toISOString().slice(0, 10);

const OUR_DOMAINS = [
  "frandoor.co.kr",
  "frandoor",
  "50gimbab.frandoor.co.kr",
  "hanshinudong.frandoor.co.kr",
  "jangsajang.frandoor.co.kr",
  "blog.naver.com/frandoor",
  "frandoor.tistory.com",
  "medium.com/@frandoor",
];

// ─────────────────────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────────────────────
type Platform = "google" | "naver";

type Cite = {
  title: string;
  url: string;
  domain: string;
};

type ScanResult = {
  keyword: string;
  keyword_id: string;
  platform: string;
  ai_block_found: boolean; // AI Overview/브리핑 블록 자체가 떴는지
  cited: boolean;          // 우리 도메인이 인용됐는지
  our_mentions: string[];  // 매칭된 우리 도메인
  our_urls: string[];      // 매칭된 실제 URL
  ai_summary: string;      // AI 답변 본문 텍스트
  source_urls: string[];   // AI 답변이 인용한 전체 URL 목록
  sources: Cite[];         // 구조화된 인용 목록
  screenshot_path?: string;
  error?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Env 로드
// ─────────────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ─────────────────────────────────────────────────────────────────────────────
// Args 파싱
// ─────────────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts: {
    platform: Platform[];
    brand: string;
    brandId: string;
    headful: boolean;
    limit: number;
    debug: boolean;
  } = {
    platform: ["google", "naver"],
    brand: DEFAULT_BRAND,
    brandId: "",
    headful: false,
    limit: 0,
    debug: false,
  };

  for (const a of args) {
    if (a.startsWith("--platform=")) {
      const v = a.split("=")[1];
      if (v === "google" || v === "naver") opts.platform = [v];
    } else if (a.startsWith("--brand=")) {
      opts.brand = a.split("=")[1];
    } else if (a.startsWith("--brand-id=")) {
      opts.brandId = a.split("=")[1];
    } else if (a === "--headful") {
      opts.headful = true;
    } else if (a.startsWith("--keywords=")) {
      opts.limit = parseInt(a.split("=")[1], 10) || 0;
    } else if (a === "--debug") {
      opts.debug = true;
    }
  }
  return opts;
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase
// ─────────────────────────────────────────────────────────────────────────────
function createSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local 확인)");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─────────────────────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────────────────────
function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "") + u.pathname.split("/").slice(0, 2).join("/");
  } catch {
    return url;
  }
}

function matchOurDomain(url: string): string[] {
  const lower = url.toLowerCase();
  return OUR_DOMAINS.filter(d => lower.includes(d.toLowerCase()));
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

function jitter(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google AI Overview 스캔
// ─────────────────────────────────────────────────────────────────────────────
async function scanGoogleKeyword(page: Page, keyword: string, debug = false): Promise<Omit<ScanResult, "keyword_id" | "keyword" | "platform">> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&hl=ko&gl=kr&pws=0`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // AI Overview는 천천히 로드됨 — 최대 8초 대기
  await sleep(jitter(2500, 4500));

  // "AI 개요" 또는 "AI Overview" 텍스트가 있는 블록 대기 (있으면)
  try {
    await page.waitForFunction(() => {
      const all = document.body.innerText || "";
      return all.includes("AI 개요") || all.includes("AI Overview") || all.includes("AI 요약");
    }, { timeout: 5000 });
  } catch {
    // AI Overview가 안 뜨는 키워드도 있음 — 정상 케이스
  }

  // 추가 대기 (렌더링 안정화)
  await sleep(1500);

  const data = await page.evaluate(() => {
    const out: {
      found: boolean;
      summary: string;
      citations: { title: string; url: string }[];
    } = { found: false, summary: "", citations: [] };

    // 1. "AI 개요" / "AI Overview" / "AI 요약" 텍스트를 포함한 블록 찾기
    const headingCandidates = Array.from(document.querySelectorAll("h1,h2,h3,div,span")).filter(el => {
      const t = (el.textContent || "").trim();
      return t === "AI 개요" || t === "AI Overview" || t === "AI 요약" || t.startsWith("AI 개요") || t.startsWith("AI Overview");
    });

    let container: Element | null = null;
    for (const h of headingCandidates) {
      // 상위로 올라가면서 AI Overview 전체 컨테이너 찾기
      let cur: Element | null = h;
      for (let i = 0; i < 8 && cur; i++) {
        const txt = (cur.textContent || "").length;
        if (txt > 200) { container = cur; break; }
        cur = cur.parentElement;
      }
      if (container) break;
    }

    // 2. 대안: data-attrid나 특정 role 기반
    if (!container) {
      const alt = document.querySelector('[data-attrid*="ai_overview"], [data-attrid*="AiOverview"], div[jsname][data-async-type*="ai"]');
      if (alt) container = alt;
    }

    // 3. 대안 2: 응답 영역에 "AI 생성 결과" / "Generative AI" 류 라벨
    if (!container) {
      const alt2 = Array.from(document.querySelectorAll("div")).find(d => {
        const t = d.textContent || "";
        return t.includes("Generative AI is experimental") || t.includes("AI가 생성한") || t.includes("생성형 AI");
      });
      if (alt2) container = alt2;
    }

    if (!container) return out;

    out.found = true;
    out.summary = (container.textContent || "").replace(/\s+/g, " ").trim().slice(0, 2000);

    // citation 링크 추출 — container 내부의 모든 a[href] + role=link
    const seen = new Set<string>();
    const links = container.querySelectorAll('a[href], [role="link"]');
    links.forEach(el => {
      const a = el as HTMLAnchorElement;
      let href = a.href || a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      // Google 리다이렉트 URL 정리
      if (href.includes("/url?")) {
        try {
          const u = new URL(href);
          const real = u.searchParams.get("q") || u.searchParams.get("url");
          if (real) href = real;
        } catch { /* noop */ }
      }
      if (seen.has(href)) return;
      seen.add(href);
      const title = (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 200);
      out.citations.push({ title, url: href });
    });

    return out;
  });

  // 매칭
  const sources: Cite[] = data.citations.map(c => ({
    title: c.title,
    url: c.url,
    domain: extractDomain(c.url),
  }));

  const ourMentionsSet = new Set<string>();
  const ourUrls: string[] = [];
  for (const s of sources) {
    const matches = matchOurDomain(s.url);
    if (matches.length > 0) {
      matches.forEach(m => ourMentionsSet.add(m));
      ourUrls.push(s.url);
    }
  }

  // 스크린샷 (디버그 모드 또는 AI Overview 블록이 있을 때)
  let screenshotPath: string | undefined;
  if (debug || data.found) {
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const safeKeyword = keyword.replace(/[^a-zA-Z0-9가-힣]/g, "_").slice(0, 40);
    screenshotPath = path.join(SCREENSHOT_DIR, `${TODAY}_google_${safeKeyword}.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch { screenshotPath = undefined; }
  }

  return {
    ai_block_found: data.found,
    cited: ourUrls.length > 0,
    our_mentions: Array.from(ourMentionsSet),
    our_urls: ourUrls,
    ai_summary: data.summary,
    source_urls: sources.map(s => s.url).slice(0, 15),
    sources: sources.slice(0, 15),
    screenshot_path: screenshotPath,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 네이버 AI 브리핑 스캔
// ─────────────────────────────────────────────────────────────────────────────
async function scanNaverKeyword(page: Page, keyword: string, debug = false): Promise<Omit<ScanResult, "keyword_id" | "keyword" | "platform">> {
  const url = `https://search.naver.com/search.naver?query=${encodeURIComponent(keyword)}&ssc=tab.nx.all`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // 네이버는 SSR이라 빠름. 2초 대기
  await sleep(jitter(1500, 2500));

  const data = await page.evaluate(() => {
    const out: {
      found: boolean;
      summary: string;
      citations: { title: string; url: string }[];
    } = { found: false, summary: "", citations: [] };

    // 네이버 AI 브리핑 블록 셀렉터 후보
    // 실제 클래스명은 자주 바뀌므로 여러 패턴 시도
    const selectors = [
      '.ai_brief',
      '.sp_ai_brief',
      '[data-cr-rank*="ai_brief"]',
      '[class*="ai_brief"]',
      '[class*="aiBrief"]',
      '[class*="AiBrief"]',
      '[data-module-id*="ai_brief"]',
      '[class*="sds_brief"]',
    ];

    let container: Element | null = null;
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) { container = el; break; }
    }

    // 대안: "AI 브리핑" 텍스트 헤딩 기반 탐색
    if (!container) {
      const headings = Array.from(document.querySelectorAll("h1,h2,h3,strong,span,div")).filter(el => {
        const t = (el.textContent || "").trim();
        return t === "AI 브리핑" || t.startsWith("AI 브리핑") || t === "AI답변" || t.startsWith("네이버 AI");
      });
      for (const h of headings) {
        let cur: Element | null = h;
        for (let i = 0; i < 8 && cur; i++) {
          if ((cur.textContent || "").length > 150) { container = cur; break; }
          cur = cur.parentElement;
        }
        if (container) break;
      }
    }

    if (!container) return out;

    out.found = true;
    out.summary = (container.textContent || "").replace(/\s+/g, " ").trim().slice(0, 2000);

    // citation 링크 추출
    const seen = new Set<string>();
    const links = container.querySelectorAll('a[href]');
    links.forEach(el => {
      const a = el as HTMLAnchorElement;
      let href = a.href || a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
      // 네이버 리다이렉트 URL 정리
      if (href.startsWith("/link?") || href.includes("cr.naver.com")) {
        try {
          const u = new URL(href, "https://search.naver.com");
          const real = u.searchParams.get("u") || u.searchParams.get("url");
          if (real) href = real;
        } catch { /* noop */ }
      }
      if (seen.has(href)) return;
      seen.add(href);
      const title = (a.textContent || a.getAttribute("aria-label") || "").trim().slice(0, 200);
      out.citations.push({ title, url: href });
    });

    return out;
  });

  const sources: Cite[] = data.citations.map(c => ({
    title: c.title,
    url: c.url,
    domain: extractDomain(c.url),
  }));

  const ourMentionsSet = new Set<string>();
  const ourUrls: string[] = [];
  for (const s of sources) {
    const matches = matchOurDomain(s.url);
    if (matches.length > 0) {
      matches.forEach(m => ourMentionsSet.add(m));
      ourUrls.push(s.url);
    }
  }

  let screenshotPath: string | undefined;
  if (debug || data.found) {
    if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const safeKeyword = keyword.replace(/[^a-zA-Z0-9가-힣]/g, "_").slice(0, 40);
    screenshotPath = path.join(SCREENSHOT_DIR, `${TODAY}_naver_${safeKeyword}.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false });
    } catch { screenshotPath = undefined; }
  }

  return {
    ai_block_found: data.found,
    cited: ourUrls.length > 0,
    our_mentions: Array.from(ourMentionsSet),
    our_urls: ourUrls,
    ai_summary: data.summary,
    source_urls: sources.map(s => s.url).slice(0, 15),
    sources: sources.slice(0, 15),
    screenshot_path: screenshotPath,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 브랜드 단위 실행
// ─────────────────────────────────────────────────────────────────────────────
async function runScan(opts: ReturnType<typeof parseArgs>) {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("🔍 AEO 스캔 시작");
  console.log(`📅 ${TODAY}  브랜드:${opts.brand}  플랫폼:${opts.platform.join(",")}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  const sb = createSupabase();

  // 브랜드 조회: brand-id 우선, 없으면 name 정확 매치, 그래도 없으면 ilike 부분 매치
  let brand: { id: string; name: string; landing_url: string | null } | null = null;
  let brandErrMsg: string | undefined;

  if (opts.brandId) {
    const { data, error } = await sb
      .from("geo_brands")
      .select("id, name, landing_url")
      .eq("id", opts.brandId)
      .maybeSingle();
    brand = data;
    brandErrMsg = error?.message;
  } else {
    // 정확 매치
    const exact = await sb
      .from("geo_brands")
      .select("id, name, landing_url")
      .eq("name", opts.brand)
      .maybeSingle();
    if (exact.data) {
      brand = exact.data;
    } else {
      // ilike 부분 매치 (프랜도어 ↔ Frandoor ↔ frandoor 혼용 대비)
      const fuzzy = await sb
        .from("geo_brands")
        .select("id, name, landing_url")
        .ilike("name", `%${opts.brand}%`)
        .limit(1);
      if (fuzzy.data && fuzzy.data.length > 0) {
        brand = fuzzy.data[0];
        console.log(`ℹ️  '${opts.brand}' → '${brand.name}' 으로 부분 매치됨`);
      } else {
        brandErrMsg = exact.error?.message ?? fuzzy.error?.message;
      }
    }
  }

  if (!brand) {
    console.error(`❌ 브랜드 '${opts.brandId || opts.brand}' 조회 실패${brandErrMsg ? `: ${brandErrMsg}` : ""}`);
    // 등록된 브랜드 전체 나열해서 사용자가 올바른 이름을 알 수 있게 함
    const { data: all } = await sb
      .from("geo_brands")
      .select("id, name")
      .order("created_at", { ascending: true });
    if (all && all.length > 0) {
      console.error("\n📋 등록된 브랜드 목록:");
      for (const b of all) {
        console.error(`   - "${b.name}"  (id: ${b.id})`);
      }
      console.error("\n💡 사용법:");
      console.error(`   npx tsx scripts/aeo-scan.ts --brand="${all[0].name}"`);
      console.error(`   npx tsx scripts/aeo-scan.ts --brand-id=${all[0].id}`);
    } else {
      console.error("\n⚠️  geo_brands 테이블에 등록된 브랜드가 없습니다. 웹 UI에서 먼저 브랜드를 등록하세요.");
    }
    throw new Error("BRAND_NOT_FOUND");
  }

  console.log(`✅ 브랜드 확인: ${brand.name} (${brand.id})`);

  // 키워드 조회
  const { data: keywords, error: kwErr } = await sb
    .from("aeo_keywords")
    .select("id, keyword, sort_order")
    .eq("brand_id", brand.id)
    .order("sort_order");

  if (kwErr || !keywords || keywords.length === 0) {
    console.error(`❌ 키워드 없음. aeo_keywords 테이블에 ${brand.name} 키워드를 먼저 등록하세요.`);
    throw new Error("NO_KEYWORDS");
  }

  const kwList = opts.limit > 0 ? keywords.slice(0, opts.limit) : keywords;
  console.log(`📋 키워드 ${kwList.length}개 / 전체 ${keywords.length}개`);

  // 브라우저 시작
  console.log(`\n🌐 Chromium 시작 (${opts.headful ? "headful" : "headless"})`);
  if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: !opts.headful,
    viewport: { width: 1366, height: 900 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
    ],
  });

  // webdriver 플래그 숨기기
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  const page = await context.newPage();

  // 플랫폼별 실행
  for (const platform of opts.platform) {
    console.log(`\n━━━ ${platform.toUpperCase()} AEO 스캔 (${kwList.length}개 키워드) ━━━`);

    const results: ScanResult[] = [];
    let idx = 0;

    for (const kw of kwList) {
      idx++;
      const label = `[${idx}/${kwList.length}]`;
      try {
        console.log(`${label} ${platform} "${kw.keyword}"`);

        const partial = platform === "google"
          ? await scanGoogleKeyword(page, kw.keyword, opts.debug)
          : await scanNaverKeyword(page, kw.keyword, opts.debug);

        const result: ScanResult = {
          keyword: kw.keyword,
          keyword_id: kw.id,
          platform: `aeo_${platform}`,
          ...partial,
        };
        results.push(result);

        const status = result.ai_block_found
          ? (result.cited ? `✅ 인용됨 (${result.our_mentions.join(",")})` : `⚪ AI블록 있음 · 미인용`)
          : `➖ AI블록 없음`;
        console.log(`   ${status}  sources:${result.sources.length}`);

        // 레이트 리밋 — 봇 탐지 회피
        await sleep(jitter(4000, 8000));
      } catch (e) {
        console.error(`   ❌ ${(e as Error).message}`);
        results.push({
          keyword: kw.keyword,
          keyword_id: kw.id,
          platform: `aeo_${platform}`,
          ai_block_found: false,
          cited: false,
          our_mentions: [],
          our_urls: [],
          ai_summary: "",
          source_urls: [],
          sources: [],
          error: (e as Error).message,
        });
        await sleep(jitter(3000, 6000));
      }
    }

    // 집계
    const aiBlockCount = results.filter(r => r.ai_block_found).length;
    const citedCount = results.filter(r => r.cited).length;
    const score = kwList.length > 0 ? Math.round((citedCount / kwList.length) * 100) : 0;

    // aeo_check_runs에 저장 (기존 UI와 호환)
    const { error: insertErr } = await sb.from("aeo_check_runs").insert({
      brand_id: brand.id,
      platform: `aeo_${platform}`,
      total_keywords: kwList.length,
      cited_count: citedCount,
      score,
      results: JSON.stringify(results.map(r => ({
        keyword: r.keyword,
        keyword_id: r.keyword_id,
        platform: r.platform,
        cited: r.cited,
        our_mentions: r.our_mentions,
        ai_summary: r.ai_summary,
        source_urls: r.source_urls,
        // 추가 필드 (기존 UI는 무시, 새 UI에서 활용)
        ai_block_found: r.ai_block_found,
        our_urls: r.our_urls,
        sources: r.sources,
        screenshot_path: r.screenshot_path,
        scan_method: "playwright",
        scanned_at: new Date().toISOString(),
      }))),
    });

    if (insertErr) {
      console.error(`❌ DB 저장 실패:`, insertErr.message);
    } else {
      console.log(`\n📊 ${platform.toUpperCase()} 결과:`);
      console.log(`   AI 블록 노출: ${aiBlockCount}/${kwList.length}`);
      console.log(`   인용률(score): ${score}% (${citedCount}/${kwList.length})`);
      console.log(`   DB 저장 완료 (platform=aeo_${platform})`);
    }
  }

  await context.close();
  console.log("\n✅ 전체 완료");
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry
// ─────────────────────────────────────────────────────────────────────────────
const opts = parseArgs();
runScan(opts)
  .then(() => {
    // 정상 종료 — libuv가 핸들을 다 닫을 시간을 주기 위해 강제 exit 대신 exitCode 만 설정
    process.exitCode = 0;
  })
  .catch(e => {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "BRAND_NOT_FOUND" && msg !== "NO_KEYWORDS") {
      console.error("❌ 치명적 오류:", e);
    }
    // process.exit(1) 을 바로 호출하면 supabase keep-alive 소켓 teardown 중에
    // libuv UV_HANDLE_CLOSING assertion 이 발생할 수 있음 → exitCode 만 설정
    process.exitCode = 1;
  });
