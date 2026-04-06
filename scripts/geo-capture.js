/**
 * GEO 체크 — Puppeteer로 실제 ChatGPT 웹에서 질문 → 스크린샷
 *
 * 사용법: node scripts/geo-capture.js
 *
 * 전제: Chrome에 ChatGPT 로그인이 되어 있어야 함
 * 결과: screenshots/ 폴더에 날짜_Q01.png ~ Q25.png 저장
 */

const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

// ── 설정 ──────────────────────────────────────────────────────────────────
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
// Chrome 프로필 경로 (로그인 상태 유지)
const USER_DATA_DIR = path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "User Data");
const CHATGPT_URL = "https://chatgpt.com";
const CONCURRENT = 5; // 동시 탭 수 (25개 동시는 메모리 부담 → 5개씩)
const SCREENSHOT_DIR = path.join(__dirname, "..", "screenshots");
const TODAY = new Date().toISOString().slice(0, 10);

// ── .env.local에서 Supabase 키 로딩 ──────────────────────────────────────
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

// ── 프롬프트 가져오기 (Supabase) ─────────────────────────────────────────
async function getPrompts() {
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  // 오공김밥 브랜드의 프롬프트
  const { data: brand } = await sb.from("geo_brands").select("id").eq("name", "오공김밥").single();
  if (!brand) { console.log("오공김밥 브랜드를 찾을 수 없습니다."); process.exit(1); }
  const { data: prompts } = await sb.from("geo_prompts").select("*").eq("brand_id", brand.id).order("sort_order");
  return { brandId: brand.id, prompts: prompts || [] };
}

// ── 단일 질문 처리 ───────────────────────────────────────────────────────
async function askQuestion(browser, prompt, index) {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 900 });

  const label = `Q${String(index + 1).padStart(2, "0")}`;
  console.log(`[${label}] 시작: ${prompt.prompt_text.slice(0, 40)}...`);

  try {
    // 새 대화 열기
    await page.goto(CHATGPT_URL, { waitUntil: "networkidle2", timeout: 30000 });
    await page.waitForTimeout(2000);

    // 입력창 찾기
    const inputSelector = 'div[contenteditable="true"], textarea[data-id], #prompt-textarea';
    await page.waitForSelector(inputSelector, { timeout: 15000 });

    // 질문 입력
    const input = await page.$(inputSelector);
    await input.click();
    await page.keyboard.type(prompt.prompt_text, { delay: 30 });
    await page.waitForTimeout(500);

    // 전송
    await page.keyboard.press("Enter");
    console.log(`[${label}] 질문 전송됨`);

    // 응답 대기 — "Stop generating" 버튼이 사라질 때까지 (= 응답 완료)
    await page.waitForTimeout(3000); // 최소 3초 대기

    // 응답 완료 대기: 생성 중 버튼이 없어질 때까지
    for (let i = 0; i < 60; i++) {
      const generating = await page.$('button[aria-label="Stop generating"]');
      if (!generating) break;
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(2000); // 렌더링 안정화

    // 스크린샷
    const screenshotPath = path.join(SCREENSHOT_DIR, `${TODAY}_${label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[${label}] ✅ 스크린샷 저장: ${screenshotPath}`);

    // 응답 텍스트 추출
    const responseText = await page.evaluate(() => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
      if (msgs.length === 0) return "";
      const last = msgs[msgs.length - 1];
      return last?.innerText || "";
    });

    await page.close();
    return { success: true, response: responseText, screenshot: screenshotPath };
  } catch (e) {
    console.log(`[${label}] ❌ 오류: ${e.message}`);
    try {
      const screenshotPath = path.join(SCREENSHOT_DIR, `${TODAY}_${label}_error.png`);
      await page.screenshot({ path: screenshotPath });
    } catch {}
    await page.close();
    return { success: false, response: `[오류] ${e.message}`, screenshot: "" };
  }
}

// ── 배치 실행 (CONCURRENT개씩 병렬) ──────────────────────────────────────
async function runBatch(browser, prompts) {
  const results = new Array(prompts.length);

  for (let i = 0; i < prompts.length; i += CONCURRENT) {
    const batch = prompts.slice(i, i + CONCURRENT);
    const batchResults = await Promise.all(
      batch.map((p, j) => askQuestion(browser, p, i + j))
    );
    batchResults.forEach((r, j) => { results[i + j] = r; });
    console.log(`--- 배치 ${Math.floor(i / CONCURRENT) + 1} 완료 (${i + batch.length}/${prompts.length}) ---`);
  }

  return results;
}

// ── 결과 저장 (Supabase) ─────────────────────────────────────────────────
async function saveResults(brandId, brandName, prompts, results) {
  const { createClient } = require("@supabase/supabase-js");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const brandNameLower = brandName.toLowerCase();
  const brandVariants = [brandNameLower, brandNameLower.replace(/\s/g, "")];
  const exposurePrompts = prompts.filter(p => !p.category?.startsWith("D3"));

  let mentionedCount = 0;
  const items = prompts.map((p, i) => {
    const r = results[i];
    const responseLower = (r?.response || "").toLowerCase();
    const isExposure = !p.category?.startsWith("D3");
    const mentioned = brandVariants.some(v => responseLower.includes(v));
    if (mentioned && isExposure) mentionedCount++;
    return {
      prompt_id: p.id,
      prompt_text: p.prompt_text,
      ai_response: r?.response || "[실패]",
      mentioned,
      accuracy_score: mentioned ? 50 : 0,
      check_type: isExposure ? "exposure" : "accuracy",
      category: p.category || "",
    };
  });

  const exposureScore = exposurePrompts.length > 0 ? Math.round((mentionedCount / exposurePrompts.length) * 100) : 0;

  const { data: run } = await sb.from("geo_check_runs").insert({
    brand_id: brandId,
    total_prompts: prompts.length,
    mentioned_count: mentionedCount,
    score: exposureScore,
    model: "chatgpt-web (puppeteer)",
  }).select().single();

  if (run) {
    await sb.from("geo_check_items").insert(
      items.map(item => ({ run_id: run.id, ...item }))
    );
  }

  console.log(`\n📊 결과: 노출률 ${exposureScore}% (${mentionedCount}/${exposurePrompts.length})`);
  return { exposureScore, mentionedCount };
}

// ── 메인 ─────────────────────────────────────────────────────────────────
async function main() {
  // 스크린샷 폴더 생성
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log("🔍 GEO 캡처 시작...");
  console.log(`📅 날짜: ${TODAY}`);
  console.log(`📂 스크린샷: ${SCREENSHOT_DIR}`);

  // 프롬프트 가져오기
  const { brandId, prompts } = await getPrompts();
  console.log(`📋 프롬프트: ${prompts.length}개\n`);

  // 브라우저 실행 (기존 Chrome 프로필 사용)
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    userDataDir: USER_DATA_DIR,
    headless: false, // ChatGPT 봇 차단 우회를 위해 헤드풀
    args: [
      "--no-first-run",
      "--disable-blink-features=AutomationControlled",
      "--window-size=800,900",
    ],
    defaultViewport: null,
  });

  console.log("🌐 Chrome 실행됨 (ChatGPT 로그인 상태 사용)\n");

  try {
    const results = await runBatch(browser, prompts);

    // 결과 저장
    await saveResults(brandId, "오공김밥", prompts, results);

    // 요약
    const successCount = results.filter(r => r?.success).length;
    console.log(`\n✅ 완료: ${successCount}/${prompts.length} 성공`);
    console.log(`📂 스크린샷: ${SCREENSHOT_DIR}/${TODAY}_*.png`);
  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error("❌ 치명적 오류:", e.message);
  process.exit(1);
});
