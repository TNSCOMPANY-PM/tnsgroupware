import fs from "fs";
import path from "path";

interface TokenCache {
  accessToken: string;
  expiresAt: number; // epoch ms
}

const CACHE_PATH = path.join(process.cwd(), ".tistory_token_cache");

function loadCache(): string | null {
  if (!fs.existsSync(CACHE_PATH)) return null;
  try {
    const cache: TokenCache = JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
    if (Date.now() < cache.expiresAt - 5 * 60 * 1000) {
      return cache.accessToken;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCache(token: string): void {
  const cache: TokenCache = {
    accessToken: token,
    expiresAt: Date.now() + 55 * 60 * 1000,
  };
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const params = new URLSearchParams({
    client_id: process.env.TISTORY_APP_ID!,
    client_secret: process.env.TISTORY_SECRET_KEY!,
    redirect_uri: process.env.TISTORY_REDIRECT_URI!,
    code,
    grant_type: "authorization_code",
  });

  const res = await fetch(
    `https://www.tistory.com/oauth/access_token?${params.toString()}`
  );
  const text = await res.text();
  const token = new URLSearchParams(text).get("access_token");

  if (!token) {
    throw new Error(`토큰 발급 실패: ${text}`);
  }

  saveCache(token);
  return token;
}

export async function getAccessToken(): Promise<string> {
  const cached = loadCache();
  if (cached) return cached;
  throw new Error("TISTORY_TOKEN_EXPIRED");
}
