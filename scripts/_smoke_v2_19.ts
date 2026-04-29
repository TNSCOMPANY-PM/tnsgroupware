/**
 * v2-19 smoke — splitFrontmatter 견고화 + sysprompt 톤 비율 조정.
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
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail.slice(0, 100)}` : ""}`);
  if (!ok) okAll = false;
}

// PostBodyMarkdown 의 splitFrontmatter 동일 로직 inline 재현
function splitFrontmatter(raw: string): { fm: string | null; body: string } {
  const trimmed = raw.replace(/^﻿/, "").replace(/^\s+/, "");
  const m = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/);
  if (!m) return { fm: null, body: raw };
  const fm = `---\n${m[1]}\n---`;
  const body = (m[2] ?? "").replace(/^[\r\n]+/, "");
  return { fm, body };
}

async function main() {
  console.log("\n=== v2-19 smoke ===\n");

  // T1 splitFrontmatter
  console.log("[T1] splitFrontmatter");
  {
    const raw = `---
title: "오공김밥"
date: "2026-04-29"
---

## 첫 H2
본문 시작`;
    const { fm, body } = splitFrontmatter(raw);
    check(`정상 frontmatter 분리`, fm !== null && fm.startsWith("---") && fm.endsWith("---"), `fm.len=${fm?.length ?? 0}`);
    check(`body 시작 "## 첫 H2"`, body.startsWith("## 첫 H2"), body.slice(0, 30));
  }
  // BOM 처리
  {
    const raw = `﻿---\ntitle: "x"\n---\n\n## body`;
    const { fm, body } = splitFrontmatter(raw);
    check(`BOM 앞 처리`, fm !== null && body.startsWith("## body"), `fm=${fm?.slice(0, 20)}`);
  }
  // 앞 공백
  {
    const raw = `\n\n  ---\ntitle: "x"\n---\n\n## body`;
    const { fm, body } = splitFrontmatter(raw);
    check(`앞 공백 trim`, fm !== null && body.startsWith("## body"));
  }
  // frontmatter 없음
  {
    const raw = `## 그냥 본문\nfrontmatter 없는 글`;
    const { fm, body } = splitFrontmatter(raw);
    check(`frontmatter 없음 — fm null + body 그대로`, fm === null && body === raw);
  }
  // 닫는 --- 없음 (불완전)
  {
    const raw = `---\ntitle: "x"\n## 본문`;
    const { fm, body } = splitFrontmatter(raw);
    check(`닫는 --- 없음 — fm null`, fm === null && body === raw);
  }

  // T3 sysprompt 톤 비율 가이드
  console.log("\n[T3] sysprompt 톤 비율");
  const { buildSystemPrompt } = await import("../lib/geo/v2/sysprompt");
  const sp = buildSystemPrompt({
    brand: { id: "1", name: "오공김밥", industry_main: "외식", industry_sub: "분식" },
    factsPool: [
      {
        metric_id: "x",
        metric_label: "y",
        value_num: 100,
        value_text: null,
        unit: "개",
        period: "2024-12",
        source_tier: "A",
        source_label: "공정위",
      },
    ],
    topic: "test",
    today: "2026-04-29",
  });

  check(`~입니다 60% 명시`, sp.includes("~입니다") && sp.includes("60%"));
  check(`~요 20~25% 명시`, sp.includes("~요") && (sp.includes("20~25%") || sp.includes("25%")));
  check(`~죠 5% 명시`, sp.includes("~죠") && sp.includes("5%"));
  check(`단정 평어 10% 명시`, sp.includes("단정 평어") && sp.includes("10%"));
  check(`~요 일변도 금지`, sp.includes("~요 일변도"));
  check(`~다·~이다 일변도 금지`, sp.includes("~다") && sp.includes("일변도"));

  // 좋은 예 verbatim 4쌍 (시정 — spec은 "예 4쌍" 명시)
  console.log("\n[T3] 좋은 예 / 나쁜 예");
  check(`✅ 입니다 + 죠 (신호죠)`, sp.includes("그 위에 있다는 신호죠"));
  check(`✅ 입니다 + 비유 요 (1원 80전 남는 셈이에요)`, sp.includes("100원 팔고 1원 80전 남는 셈이에요"));
  check(`✅ 입니다 + 죠 (이르죠)`, sp.includes("이르죠"));
  check(`❌ ~요 일변도 (이에요. 높아요. 낮아요.)`, sp.includes("~만원이에요"));
  check(`❌ ~다 일변도 (이다. 높다. 낮다.)`, sp.includes("~만원이다"));

  // regression — 기존 voice / 5블럭 / 분량 보존
  console.log("\n[regression]");
  check("절대 규칙", sp.includes("facts pool 외 숫자"));
  check("입장 4분면", sp.includes("✅") && sp.includes("⚠️") && sp.includes("🤔") && sp.includes("❌"));
  check("점포명 익명화", sp.includes("점포명") && sp.includes("절대 금지"));
  check("[블럭 A]~[E]", sp.includes("[블럭 A]") && sp.includes("[블럭 E]"));
  check("결론 체크리스트", sp.includes("## 결론 체크리스트"));
  check("frandoor 산출 박스", sp.includes("이 글에서 계산한 값"));
  check("출처 · 집계 방식", sp.includes("## 출처 · 집계 방식"));
  check("호명·비유 권장", sp.includes("# 호명·비유"));
  check("1,800~2,500자", sp.includes("1,800~2,500자"));
  check(`date: "2026-04-29"`, sp.includes(`date: "2026-04-29"`));

  // 길이
  console.log(`\n   sysprompt 길이 = ${sp.length} 자`);
  check(`길이 < 5,000자`, sp.length < 5000);

  console.log(`\n=== ${okAll ? "ALL PASS" : "SOME FAILED"} ===\n`);
  process.exit(okAll ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
