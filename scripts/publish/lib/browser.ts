import { chromium, type Browser, type BrowserContext } from "playwright";
import path from "path";
import fs from "fs";
import type { PublishChannel } from "../types";

const SESSION_DIR = path.resolve(process.cwd(), "scripts/publish/.sessions");

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function getSessionPath(channel: PublishChannel): string {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
  return path.join(SESSION_DIR, `${channel}.json`);
}

export function hasSession(channel: PublishChannel): boolean {
  return fs.existsSync(getSessionPath(channel));
}

export interface LaunchOptions {
  headless?: boolean;
  channel: PublishChannel;
  useSession?: boolean;
}

export async function launchContext(
  options: LaunchOptions
): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await chromium.launch({
    headless: options.headless ?? false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });

  const storageStatePath = getSessionPath(options.channel);
  const shouldLoadSession =
    (options.useSession ?? true) && fs.existsSync(storageStatePath);

  const context = await browser.newContext({
    userAgent: DEFAULT_USER_AGENT,
    viewport: { width: 1440, height: 900 },
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    storageState: shouldLoadSession ? storageStatePath : undefined,
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  return { browser, context };
}

export async function saveSession(
  context: BrowserContext,
  channel: PublishChannel
): Promise<string> {
  const storageStatePath = getSessionPath(channel);
  await context.storageState({ path: storageStatePath });
  return storageStatePath;
}
