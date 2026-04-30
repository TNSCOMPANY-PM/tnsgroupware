/**
 * v3-01 Step 4 — Polish (post-process + haiku mini).
 */

import "server-only";
import { callClaude, HAIKU_MODEL } from "../claude";
import { buildPolishSysprompt, buildPolishUser } from "../sysprompts/polish";
import { postProcess } from "../post_process";
import type { PolishedResult } from "../types";

export async function runPolish(args: { body: string }): Promise<PolishedResult> {
  // 4-A 결정론
  const post = postProcess(args.body);

  // 4-B haiku mini — 메타 코멘트 + 어색한 첫 H2 의문문 교체
  let polished = post.body;
  try {
    const sys = buildPolishSysprompt();
    const user = buildPolishUser({ body: post.body });
    const raw = await callClaude({
      model: HAIKU_MODEL,
      system: sys,
      user,
      maxTokens: 4000,
    });
    // sanity — 결과 길이 너무 짧으면 (haiku 가 변경 거부 등) 원본 사용
    if (raw && raw.trim().length > Math.floor(post.body.length * 0.5)) {
      polished = raw.trim();
    } else {
      post.log.push("polish haiku: 결과 길이 부족 — 원본 사용");
    }
  } catch (e) {
    post.log.push(`polish haiku 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    body: polished,
    log: post.log,
  };
}
