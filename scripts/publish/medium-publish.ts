import { launchContext, hasSession } from "./lib/browser";
import type { Article, PublishResult } from "./types";
import type { Page } from "playwright";

const IMPORT_URL = "https://medium.com/p/import";
const NEW_STORY_URL = "https://medium.com/new-story";
const HOME_URL = "https://medium.com/";

async function publishViaImport(page: Page, article: Article): Promise<string> {
  if (!article.sourceUrl) {
    throw new Error("mode=import 에는 sourceUrl 이 필요합니다");
  }

  await page.goto(IMPORT_URL, { waitUntil: "domcontentloaded" });

  const urlInput = page.getByPlaceholder(/url/i).first();
  await urlInput.waitFor({ state: "visible", timeout: 30_000 });
  await urlInput.fill(article.sourceUrl);

  await page.getByRole("button", { name: /import/i }).click();
  await page.waitForURL(/\/p\/[a-z0-9]+\/edit/i, { timeout: 120_000 });

  if (article.tags && article.tags.length > 0) {
    await openPublishDialog(page);
    await fillTags(page, article.tags);
    await confirmPublish(page, article);
  } else {
    await openPublishDialog(page);
    await confirmPublish(page, article);
  }

  await page.waitForURL(/medium\.com\/@/, { timeout: 120_000 });
  return page.url();
}

async function publishViaPaste(page: Page, article: Article): Promise<string> {
  if (!article.contentHtml) {
    throw new Error("mode=paste 에는 contentHtml 이 필요합니다");
  }

  await page.goto(NEW_STORY_URL, { waitUntil: "domcontentloaded" });

  const titleField = page.locator('[data-testid="editorTitleParagraph"], h3[contenteditable]').first();
  await titleField.waitFor({ state: "visible", timeout: 30_000 });
  await titleField.click();
  await titleField.type(article.title, { delay: 10 });

  const bodyField = page.locator('[data-testid="editorParagraph"], p[contenteditable]').first();
  await bodyField.click();

  await page.evaluate(async (html: string) => {
    const blob = new Blob([html], { type: "text/html" });
    const data = new DataTransfer();
    data.items.add(new File([blob], "content.html", { type: "text/html" }));
    const event = new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement?.dispatchEvent(event);
  }, article.contentHtml);

  await page.waitForTimeout(1500);

  await openPublishDialog(page);
  if (article.tags && article.tags.length > 0) {
    await fillTags(page, article.tags);
  }
  await confirmPublish(page, article);

  await page.waitForURL(/medium\.com\/@/, { timeout: 120_000 });
  return page.url();
}

async function openPublishDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^publish$/i }).first().click();
  await page.waitForSelector("text=/publish to|publishing to/i", { timeout: 30_000 });
}

async function fillTags(page: Page, tags: string[]): Promise<void> {
  const tagInput = page.locator('input[placeholder*="tag" i]').first();
  await tagInput.waitFor({ state: "visible", timeout: 10_000 });
  const limited = tags.slice(0, 5);
  for (const tag of limited) {
    await tagInput.fill(tag);
    await tagInput.press("Enter");
  }
}

async function confirmPublish(page: Page, article: Article): Promise<void> {
  const label =
    article.visibility === "draft"
      ? /save draft|schedule/i
      : /publish now|publish to/i;
  await page.getByRole("button", { name: label }).last().click();
}

export async function publishToMedium(article: Article): Promise<PublishResult> {
  const startedAt = new Date().toISOString();

  if (!hasSession("medium")) {
    return {
      channel: "medium",
      success: false,
      error: "세션 없음. 먼저 `npm run publish:auth medium` 실행하세요.",
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  const { browser, context } = await launchContext({
    channel: "medium",
    headless: false,
  });
  const page = await context.newPage();

  try {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });

    const postUrl =
      article.mode === "import"
        ? await publishViaImport(page, article)
        : await publishViaPaste(page, article);

    return {
      channel: "medium",
      success: true,
      postUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      channel: "medium",
      success: false,
      error: message,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
