import "server-only";
import { Octokit } from "@octokit/rest";

export interface DraftPROpts {
  slug: string;
  content: string;
  lintSummary?: string;
  crossCheckSummary?: string;
  /** true(default)이면 GitHub에 push 안 함. false로 호출은 DO_NOT_USE — 스프린트 중 금지. */
  dryRun?: boolean;
}

export interface DraftPRResult {
  url?: string;
  dryRunLog?: string;
}

const DEFAULT_REPO = "TNSCOMPANY-PM/Frandoor";

export async function createDraftPR(opts: DraftPROpts): Promise<DraftPRResult> {
  const dryRun = opts.dryRun !== false; // default true
  const repoFull = process.env.FRANDOOR_REPO ?? DEFAULT_REPO;
  const [owner, repo] = repoFull.split("/");
  const filePath = `content/blog/${opts.slug}.md`;
  const branch = `geo/${opts.slug}`;
  const title = `feat(blog): add ${opts.slug}`;
  const body = [
    `### Frontmatter 요약`,
    "```yaml",
    (opts.content.split("---")[1] ?? "").trim(),
    "```",
    "",
    `### Lint`,
    opts.lintSummary ?? "(없음)",
    "",
    `### Cross-check`,
    opts.crossCheckSummary ?? "(없음)",
  ].join("\n");

  if (dryRun) {
    const log = [
      `[frandoor-pr:dryRun] target=${repoFull}`,
      `  branch: ${branch}`,
      `  file: ${filePath} (${opts.content.length} bytes)`,
      `  title: ${title}`,
      `  body lines: ${body.split("\n").length}`,
      `[frandoor-pr:dryRun] skipped real push`,
    ].join("\n");
    console.log(log);
    return { dryRunLog: log };
  }

  // DO_NOT_USE in this sprint — 실 PR 생성
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN missing");
  const octo = new Octokit({ auth: token });

  const { data: baseRepo } = await octo.repos.get({ owner, repo });
  const defaultBranch = baseRepo.default_branch;
  const { data: baseRef } = await octo.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
  try {
    await octo.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: baseRef.object.sha });
  } catch { /* 기존 branch 있으면 그대로 사용 */ }

  await octo.repos.createOrUpdateFileContents({
    owner, repo, path: filePath, branch,
    message: title,
    content: Buffer.from(opts.content, "utf-8").toString("base64"),
  });

  const { data: pr } = await octo.pulls.create({
    owner, repo, title, body,
    head: branch, base: defaultBranch, draft: true,
  });
  return { url: pr.html_url };
}
