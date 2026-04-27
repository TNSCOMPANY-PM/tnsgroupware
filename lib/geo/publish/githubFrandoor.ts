/**
 * PR057 — Frandoor 레포 (TNSCOMPANY-PM/Frandoor) 자동 commit.
 *
 * env: FRANDOOR_GITHUB_TOKEN (Personal Access Token, repo write scope).
 * 미설정 시 isFrandoorPublishConfigured() = false → 호출자 graceful skip.
 *
 * commit 경로: content/blog/${slug}.md
 * 브랜치: main (frandoor 사이트는 main push → 빌드/배포)
 */

import "server-only";
import { Octokit } from "@octokit/rest";

const FRANDOOR_OWNER = "TNSCOMPANY-PM";
const FRANDOOR_REPO = "Frandoor";
const FRANDOOR_BRANCH = "main";
const FRANDOOR_PAGE_BASE = "https://frandoor.co.kr/blog";

export function isFrandoorPublishConfigured(): boolean {
  return !!process.env.FRANDOOR_GITHUB_TOKEN;
}

export type CommitToFrandoorInput = {
  slug: string;
  /** 전체 글 마크다운 (frontmatter YAML + 본문). slug 와 일치해야 함. */
  content: string;
  /** 커밋 메시지 prefix 직접 지정 시 사용. 미지정 시 자동 생성. */
  message?: string;
};

export type CommitToFrandoorResult = {
  commitUrl: string;
  pageUrl: string;
  filePath: string;
  /** true 면 신규 생성, false 면 기존 글 수정. */
  created: boolean;
};

function assertSlugSafe(slug: string): void {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`unsafe slug: ${slug}`);
  }
}

export async function commitToFrandoor(input: CommitToFrandoorInput): Promise<CommitToFrandoorResult> {
  if (!isFrandoorPublishConfigured()) {
    throw new Error("FRANDOOR_GITHUB_TOKEN env 미설정 — frandoor 자동 발행 불가");
  }
  assertSlugSafe(input.slug);

  const octokit = new Octokit({ auth: process.env.FRANDOOR_GITHUB_TOKEN });
  const filePath = `content/blog/${input.slug}.md`;
  const contentBase64 = Buffer.from(input.content, "utf8").toString("base64");

  // 기존 파일 sha 조회 (수정 시 필요)
  let existingSha: string | undefined;
  try {
    const existing = await octokit.repos.getContent({
      owner: FRANDOOR_OWNER,
      repo: FRANDOOR_REPO,
      path: filePath,
      ref: FRANDOOR_BRANCH,
    });
    if (!Array.isArray(existing.data) && "sha" in existing.data) {
      existingSha = existing.data.sha;
    }
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 404) {
      throw e;
    }
  }

  const message = input.message ?? `feat(blog): ${input.slug} (frandoor 자동 발행)`;
  const { data } = await octokit.repos.createOrUpdateFileContents({
    owner: FRANDOOR_OWNER,
    repo: FRANDOOR_REPO,
    path: filePath,
    message,
    content: contentBase64,
    branch: FRANDOOR_BRANCH,
    sha: existingSha,
  });

  return {
    commitUrl: data.commit.html_url ?? "",
    pageUrl: `${FRANDOOR_PAGE_BASE}/${input.slug}`,
    filePath,
    created: !existingSha,
  };
}

export function extractSlugFromMarkdown(content: string): string | null {
  // frontmatter 의 slug: "..." 패턴.
  const m = content.match(/^slug:\s*"?([^"\n]+)"?/m);
  return m ? m[1].trim() : null;
}
