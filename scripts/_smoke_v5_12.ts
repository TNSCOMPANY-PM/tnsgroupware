/**
 * v5-12 smoke — 예약 발행 A+C 모드 확장.
 *
 * 검증:
 *  · migration: mode 컬럼 + brand_id 컬럼 + industry NOT NULL 해제
 *  · POST /api/geo/scheduler/schedules: mode 분기 (a_only / a_plus_c)
 *  · scheduler_tick.mjs: a_plus_c chain (facts-a → facts-c → write)
 *  · SchedulerForm: 모드 토글 + brand autocomplete
 *  · SchedulerList: 모드 badge + 대상 (industry / brand_name) 컬럼
 *  · scheduler page: geo_brands join + brand_name 매핑
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
  console.log("\n=== v5-12 smoke ===\n");
  const fs = await import("node:fs/promises");

  // T1 — migration
  console.log("[T1] supabase/migrations/20260514_v5_12_schedules_aplusc.sql");
  const migration = await fs.readFile(
    "supabase/migrations/20260514_v5_12_schedules_aplusc.sql",
    "utf-8",
  );
  check(`migration 파일 존재`, migration.length > 0);
  check(`mode 컬럼 ADD`, /ADD COLUMN IF NOT EXISTS mode text/i.test(migration));
  check(`brand_id 컬럼 ADD + FK geo_brands`, /brand_id uuid REFERENCES geo_brands\(id\)/i.test(migration));
  check(`mode CHECK (a_only|a_plus_c)`, /a_only.*a_plus_c|a_plus_c.*a_only/.test(migration));
  check(`industry DROP NOT NULL`, /ALTER COLUMN industry DROP NOT NULL/.test(migration));
  check(`brand_id partial index`, /idx_schedules_brand_id/.test(migration));

  // T2 — SchedulerForm mode 토글 + brand autocomplete
  console.log("\n[T2] SchedulerForm.tsx — mode toggle + brand autocomplete");
  const formSrc = await fs.readFile(
    "app/(groupware)/content/scheduler/SchedulerForm.tsx",
    "utf-8",
  );
  check(`Mode type ('a_only' | 'a_plus_c')`, /'a_only' \| 'a_plus_c'|"a_only" \| "a_plus_c"/.test(formSrc));
  check(`mode state`, /useState<Mode>\("a_only"\)|setMode/.test(formSrc));
  check(`brand search fetch /api/geo/brands-search`, formSrc.includes("/api/geo/brands-search"));
  check(`mode 토글 버튼 2개`, formSrc.includes("A only") && formSrc.includes("A+C"));
  check(`POST body 분기 (brand_id / industry)`, formSrc.includes("body.brand_id") && formSrc.includes("body.industry"));
  check(`mode submit 분기`, formSrc.includes('mode: "a_only"') || /switchMode\("a_only"\)/.test(formSrc));

  // T3 — POST schedules route mode 분기
  console.log("\n[T3] app/api/geo/scheduler/schedules/route.ts — mode 분기");
  const routeSrc = await fs.readFile(
    "app/api/geo/scheduler/schedules/route.ts",
    "utf-8",
  );
  check(`mode parse (default a_only)`, /modeRaw === "a_plus_c"|mode === "a_plus_c"/.test(routeSrc));
  check(`brand_id parse`, /brand_id|brandId/.test(routeSrc));
  check(`a_only validation (industry 필수)`, /mode === "a_only" && !industry/.test(routeSrc));
  check(`a_plus_c validation (brand_id 필수)`, /mode === "a_plus_c" && !brandId/.test(routeSrc));
  check(`insertRow mode + brand_id 분기`, routeSrc.includes("insertRow.brand_id") && routeSrc.includes("insertRow.industry"));

  // T4 — scheduler_tick.mjs A+C chain
  console.log("\n[T4] scripts/scheduler_tick.mjs — a_plus_c chain");
  const tickSrc = await fs.readFile("scripts/scheduler_tick.mjs", "utf-8");
  check(`mode 분기 (a_only / a_plus_c)`, tickSrc.includes('row.mode === "a_plus_c"') || /mode === "a_only"/.test(tickSrc));
  check(`a_plus_c facts-a 호출 (brand_id)`, tickSrc.includes("/api/geo/facts-a") && tickSrc.includes("brand_id: row.brand_id"));
  check(`a_plus_c facts-c 호출`, tickSrc.includes("/api/geo/facts-c/"));
  check(`a_plus_c write 호출 (a-only 가 아닌 write)`, /\/api\/geo\/write\/\$\{draftId\}/.test(tickSrc));
  check(`a_only chain 보존`, tickSrc.includes("/api/geo/a-only/analyze") && tickSrc.includes("/api/geo/a-only/structure/"));

  // T5 — SchedulerList mode badge + 대상 컬럼
  console.log("\n[T5] SchedulerList.tsx — mode badge + 대상 컬럼");
  const listSrc = await fs.readFile(
    "app/(groupware)/content/scheduler/SchedulerList.tsx",
    "utf-8",
  );
  check(`'모드' 헤더`, listSrc.includes("모드"));
  check(`'대상' 헤더`, listSrc.includes("대상"));
  check(`A only badge`, listSrc.includes('"A only"'));
  check(`A+C badge`, listSrc.includes('"A+C"'));
  check(`brand_name fallback`, listSrc.includes("brand_name"));

  // T6 — scheduler page geo_brands join + ScheduleRow type
  console.log("\n[T6] scheduler page — geo_brands join + ScheduleRow type");
  const pageSrc = await fs.readFile(
    "app/(groupware)/content/scheduler/page.tsx",
    "utf-8",
  );
  check(`geo_brands(name) join select`, pageSrc.includes('"*, geo_brands(name)"') || pageSrc.includes("geo_brands(name)"));
  check(`ScheduleRow.mode field`, /mode:\s*"a_only"\s*\|\s*"a_plus_c"/.test(pageSrc));
  check(`ScheduleRow.brand_id field`, /brand_id:\s*string\s*\|\s*null/.test(pageSrc));
  check(`brand_name 매핑`, pageSrc.includes("brand_name"));

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
