/**
 * AEO 스캔 워커 — aeo_scan_queue 테이블 폴링 + scripts/aeo-scan.ts 실행
 *
 * 용도:
 *  - 사용자가 웹 UI에서 "실제 브라우저 스캔" 버튼을 누르면
 *    aeo-scan-queue API가 큐에 pending 로우를 추가한다.
 *  - 이 워커는 로컬 Windows 머신에서 백그라운드로 돌면서
 *    60초마다 pending 작업을 확인하고 aeo-scan.ts를 실행한다.
 *
 * 실행:
 *   npx tsx scripts/aeo-scan-worker.ts
 *
 * 백그라운드 실행(Windows):
 *   start /b npx tsx scripts/aeo-scan-worker.ts
 *
 * 작업 스케줄러 스케줄 실행(주 5회)은 start-aeo-scan.bat 을 쓰면 되고,
 * 이 워커는 웹 UI 수동 요청에만 반응한다.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const POLL_INTERVAL_MS = 60_000; // 60초

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

function createSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`❌ ${"NEXT_PUBLIC_SUPABASE_URL"} / ${"SUPABASE_SERVICE_ROLE"}_KEY 필요`);
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function runAeoScan(brandId: string, platform: "google" | "naver" | "both"): Promise<void> {
  return new Promise((resolve, reject) => {
    // --brand-id(UUID)를 씀 — 한글 브랜드명을 CMD shell 으로 넘기면 인코딩 깨짐
    const args = ["tsx", "scripts/aeo-scan.ts", `--brand-id=${brandId}`];
    if (platform !== "both") args.push(`--platform=${platform}`);

    console.log(`▶ npx ${args.join(" ")}`);
    const proc = spawn("npx", args, {
      cwd: path.join(__dirname, ".."),
      shell: true,
      stdio: "inherit",
    });

    proc.on("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`aeo-scan.ts exit code ${code}`));
    });
    proc.on("error", reject);
  });
}

async function processNextJob(sb: SupabaseClient): Promise<boolean> {
  // pending 중 가장 오래된 것 1개 가져오기
  const { data: job, error } = await sb
    .from("aeo_scan_queue")
    .select("*, geo_brands(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("큐 조회 오류:", error.message);
    return false;
  }
  if (!job) return false;

  const brandId = job.brand_id as string;
  const brandName = (job.geo_brands as unknown as { name: string } | null)?.name ?? brandId;

  if (!brandId) {
    await sb.from("aeo_scan_queue").update({
      status: "failed",
      error_message: "브랜드 정보 없음",
      finished_at: new Date().toISOString(),
    }).eq("id", job.id);
    return true;
  }

  // running 으로 마킹
  await sb.from("aeo_scan_queue").update({
    status: "running",
    started_at: new Date().toISOString(),
  }).eq("id", job.id);

  console.log(`\n🏃 작업 시작: ${brandName} (${job.platform})`);

  try {
    await runAeoScan(brandId, job.platform);
    await sb.from("aeo_scan_queue").update({
      status: "done",
      finished_at: new Date().toISOString(),
    }).eq("id", job.id);
    console.log(`✅ 완료: ${brandName}`);
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from("aeo_scan_queue").update({
      status: "failed",
      error_message: msg,
      finished_at: new Date().toISOString(),
    }).eq("id", job.id);
    console.error(`❌ 실패: ${brandName} — ${msg}`);
  }

  return true;
}

async function main() {
  const sb = createSupabase();
  console.log("🔁 AEO 스캔 워커 시작 — 폴링 간격 60초");
  console.log("   Ctrl+C 로 종료\n");

  // 시작 시 orphan running job 복구 (워커 재시작 케이스)
  await sb.from("aeo_scan_queue")
    .update({ status: "failed", error_message: "워커 재시작으로 중단됨", finished_at: new Date().toISOString() })
    .eq("status", "running");

  // 무한 루프
  while (true) {
    try {
      const processed = await processNextJob(sb);
      if (processed) {
        // 작업 처리 후 바로 다음 작업 체크 (여러 건 쌓여 있을 수 있음)
        continue;
      }
    } catch (e) {
      console.error("워커 루프 오류:", (e as Error).message);
    }
    // pending 없으면 대기
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch(e => {
  console.error("❌ 치명적 오류:", e);
  process.exit(1);
});
