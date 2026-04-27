/**
 * PR057 — frandoor.co.kr 자동 발행 API.
 *
 * POST { post_id } → frandoor_blog_drafts 조회 → content (frontmatter+본문) 추출
 *   → GitHub API 로 TNSCOMPANY-PM/Frandoor 레포 main 에 commit
 *   → published_url 업데이트
 */

import { NextResponse } from "next/server";
import { getSessionEmployee, unauthorized } from "@/utils/apiAuth";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  commitToFrandoor,
  isFrandoorPublishConfigured,
  extractSlugFromMarkdown,
} from "@/lib/geo/publish/githubFrandoor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getSessionEmployee();
  if (!session) return unauthorized();

  if (!isFrandoorPublishConfigured()) {
    return NextResponse.json(
      { error: "FRANDOOR_GITHUB_TOKEN_MISSING", message: "FRANDOOR_GITHUB_TOKEN env 미설정" },
      { status: 503 },
    );
  }

  const raw = await req.json().catch(() => null);
  const post_id = (raw as { post_id?: unknown } | null)?.post_id;
  if (typeof post_id !== "string" || post_id.length === 0) {
    return NextResponse.json({ error: "INVALID_INPUT", message: "post_id 필요" }, { status: 422 });
  }

  const sb = createAdminClient();
  const { data: draft, error } = await sb
    .from("frandoor_blog_drafts")
    .select("id, title, content, published_url")
    .eq("id", post_id)
    .maybeSingle();
  if (error || !draft) {
    return NextResponse.json({ error: "NOT_FOUND", message: "draft 조회 실패" }, { status: 404 });
  }

  const content = (draft as { content?: string }).content ?? "";
  if (!content.trim()) {
    return NextResponse.json({ error: "EMPTY_CONTENT", message: "draft 본문 비어있음" }, { status: 400 });
  }

  const slug = extractSlugFromMarkdown(content);
  if (!slug) {
    return NextResponse.json(
      { error: "SLUG_NOT_FOUND", message: "frontmatter slug 없음 — frandoor 자동 발행 불가" },
      { status: 400 },
    );
  }

  try {
    const result = await commitToFrandoor({ slug, content });
    // published_url 업데이트
    await sb
      .from("frandoor_blog_drafts")
      .update({ published_url: result.pageUrl, status: "published" })
      .eq("id", post_id);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "PUBLISH_FAILED", message: msg }, { status: 500 });
  }
}
