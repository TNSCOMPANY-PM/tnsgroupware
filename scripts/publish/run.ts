import fs from "fs";
import path from "path";
import { publishToMedium } from "./medium-publish";
import { publishToTistory } from "./tistory-publish";
import type { Article, PublishResult } from "./types";

function readArticle(filePath: string): Article {
  const absolute = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`article 파일을 찾을 수 없음: ${absolute}`);
  }

  if (absolute.endsWith(".json")) {
    const raw = fs.readFileSync(absolute, "utf-8");
    return JSON.parse(raw) as Article;
  }

  throw new Error("article 파일은 .json 포맷이어야 합니다");
}

function validate(article: Article): void {
  if (!article.channel || !["medium", "tistory"].includes(article.channel)) {
    throw new Error("channel 은 'medium' 또는 'tistory' 여야 합니다");
  }
  if (!article.mode || !["import", "paste"].includes(article.mode)) {
    throw new Error("mode 는 'import' 또는 'paste' 여야 합니다");
  }
  if (!article.title?.trim()) {
    throw new Error("title 이 비어 있습니다");
  }
  if (article.mode === "import" && !article.sourceUrl) {
    throw new Error("import 모드는 sourceUrl 필수");
  }
  if (article.mode === "paste" && !article.contentHtml) {
    throw new Error("paste 모드는 contentHtml 필수");
  }
}

async function main(): Promise<void> {
  const articlePath = process.argv[2];
  if (!articlePath) {
    process.stderr.write("Usage: tsx scripts/publish/run.ts <article.json>\n");
    process.exit(1);
  }

  const article = readArticle(articlePath);
  validate(article);

  process.stdout.write(
    `[publish] ${article.channel} / ${article.mode} / "${article.title}"\n`
  );

  const result: PublishResult =
    article.channel === "medium"
      ? await publishToMedium(article)
      : await publishToTistory(article);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (!result.success) process.exit(2);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[run] 실패: ${message}\n`);
  process.exit(1);
});
