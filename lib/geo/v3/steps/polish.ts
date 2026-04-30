/**
 * v3-05 Step 4 — Polish (post_process only).
 * 미니 LLM (haiku) 호출 제거 — Vercel timeout 회피.
 * post_process 5룰 (brand→브랜드 / 억단위 / percentile 자연어 / →즉 다양화 / 출처 압축) 만 적용.
 */

import "server-only";
import { postProcess } from "../post_process";
import type { PolishedResult } from "../types";

export async function runPolish(args: { body: string }): Promise<PolishedResult> {
  const post = postProcess(args.body);
  return {
    body: post.body,
    log: post.log,
  };
}
