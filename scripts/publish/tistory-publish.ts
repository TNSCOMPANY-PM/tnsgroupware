import { launchContext, hasSession } from "./lib/browser";
import type { Article, PublishResult } from "./types";
import type { Page, FrameLocator } from "playwright";

const MANAGE_URL_PATTERN = /tistory\.com\/manage\//i;

function buildWriteUrl(): string {
  const blogName = process.env.TISTORY_BLOG_NAME ?? "frandoor";
  return `https://${blogName}.tistory.com/manage/newpost/`;
}

async function ensureHtmlMode(page: Page): Promise<void> {
  const modeButton = page.locator('button:has-text("HTML")').first();
  if (await modeButton.isVisible().catch(() => false)) {
    await modeButton.click();
    const confirmBtn = page.getByRole("button", { name: /확인|ok/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }
    await page.waitForTimeout(500);
  }
}

async function getEditorFrame(page: Page): Promise<FrameLocator | null> {
  const frame = page.frameLocator("iframe#editor-tistory_ifr").first();
  const body = frame.locator("body");
  if (await body.isVisible().catch(() => false)) return frame;
  return null;
}

async function fillEditor(page: Page, article: Article): Promise<void> {
  const titleField = page.locator("#post-title-inp, input[name='title']").first();
  await titleField.waitFor({ state: "visible", timeout: 30_000 });
  await titleField.fill(article.title);

  await ensureHtmlMode(page);

  const htmlTextarea = page.locator("textarea.CodeMirror, textarea[name='content']").first();
  if (await htmlTextarea.isVisible().catch(() => false)) {
    await htmlTextarea.fill(article.contentHtml ?? "");
    return;
  }

  const frame = await getEditorFrame(page);
  if (frame) {
    await frame.locator("body").click();
    await page.evaluate((html: string) => {
      const iframe = document.querySelector(
        "iframe#editor-tistory_ifr"
      ) as HTMLIFrameElement | null;
      if (iframe?.contentDocument?.body) {
        iframe.contentDocument.body.innerHTML = html;
      }
    }, article.contentHtml ?? "");
    return;
  }

  throw new Error("티스토리 에디터를 찾지 못했습니다");
}

async function fillTags(page: Page, tags: string[]): Promise<void> {
  const tagInput = page.locator("#tagText, input[name='tag']").first();
  if (!(await tagInput.isVisible().catch(() => false))) return;
  await tagInput.fill(tags.join(","));
}

async function submitPost(page: Page, article: Article): Promise<string> {
  const publishBtn = page.locator("#publish-layer-btn, button:has-text('완료')").first();
  await publishBtn.click();

  const visibilityLabel =
    article.visibility === "draft" ? /저장|비공개/ : /공개/;
  const visibilityRadio = page.getByRole("radio", { name: visibilityLabel }).first();
  if (await visibilityRadio.isVisible().catch(() => false)) {
    await visibilityRadio.check();
  }

  const finalBtn = page.locator("#publish-btn, button:has-text('공개 발행'), button:has-text('저장')").first();
  await finalBtn.click();

  await page.waitForURL(/tistory\.com\/\d+|manage\/posts/i, { timeout: 60_000 });
  return page.url();
}

export async function publishToTistory(article: Article): Promise<PublishResult> {
  const startedAt = new Date().toISOString();

  if (article.mode !== "paste") {
    return {
      channel: "tistory",
      success: false,
      error: "티스토리는 paste 모드만 지원합니다",
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  if (!hasSession("tistory")) {
    return {
      channel: "tistory",
      success: false,
      error: "세션 없음. 먼저 `npm run publish:auth tistory` 실행하세요.",
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }

  const { browser, context } = await launchContext({
    channel: "tistory",
    headless: false,
  });
  const page = await context.newPage();

  try {
    await page.goto(buildWriteUrl(), { waitUntil: "domcontentloaded" });
    await page.waitForURL(MANAGE_URL_PATTERN, { timeout: 30_000 });

    const saveDialog = page.getByRole("button", { name: /취소|닫기/i }).first();
    if (await saveDialog.isVisible().catch(() => false)) {
      await saveDialog.click();
    }

    await fillEditor(page, article);

    if (article.tags && article.tags.length > 0) {
      await fillTags(page, article.tags);
    }

    const postUrl = await submitPost(page, article);

    return {
      channel: "tistory",
      success: true,
      postUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      channel: "tistory",
      success: false,
      error: message,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
