import { launchContext, saveSession } from "./lib/browser";
import type { PublishChannel } from "./types";

const LOGIN_URLS: Record<PublishChannel, string> = {
  medium: "https://medium.com/m/signin",
  tistory: "https://www.tistory.com/auth/login",
};

const SUCCESS_HINTS: Record<PublishChannel, (url: string) => boolean> = {
  medium: (url) => url.startsWith("https://medium.com/") && !url.includes("/signin"),
  tistory: (url) =>
    url.startsWith("https://www.tistory.com/") && !url.includes("/auth/login"),
};

async function main(): Promise<void> {
  const channelArg = process.argv[2] as PublishChannel | undefined;

  if (!channelArg || !(channelArg in LOGIN_URLS)) {
    process.stderr.write("Usage: tsx scripts/publish/auth-setup.ts <medium|tistory>\n");
    process.exit(1);
  }

  const channel = channelArg;
  const { browser, context } = await launchContext({
    channel,
    useSession: false,
    headless: false,
  });

  const page = await context.newPage();
  await page.goto(LOGIN_URLS[channel]);

  process.stdout.write(
    `[${channel}] 로그인 창을 열었습니다. 브라우저에서 직접 로그인을 완료하세요.\n`
  );
  process.stdout.write(
    `[${channel}] 로그인이 끝나면 홈 화면에 도달할 때까지 최대 5분 대기합니다.\n`
  );

  const isSuccess = SUCCESS_HINTS[channel];
  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    if (isSuccess(page.url())) break;
    await page.waitForTimeout(1000);
  }

  if (!isSuccess(page.url())) {
    process.stderr.write(`[${channel}] 로그인 대기 시간 초과.\n`);
    await browser.close();
    process.exit(2);
  }

  const savedPath = await saveSession(context, channel);
  process.stdout.write(`[${channel}] 세션 저장 완료: ${savedPath}\n`);
  await browser.close();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[auth-setup] 실패: ${message}\n`);
  process.exit(1);
});
