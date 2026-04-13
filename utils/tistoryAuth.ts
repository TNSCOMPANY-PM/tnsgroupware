import { createAdminClient } from "@/utils/supabase/admin";

/**
 * 티스토리 토큰을 Supabase DB(app_settings 테이블)에 저장/조회.
 * 기존 파일 기반(.tistory_token_cache)에서 DB 기반으로 전환.
 * 서버리스(Vercel) 환경에서 cold start 후에도 토큰 유지.
 */

const SETTING_KEY = "tistory_access_token";

interface TokenData {
  access_token: string;
  expires_at: number; // epoch ms
}

async function loadToken(): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", SETTING_KEY)
      .maybeSingle();

    if (!data?.value) return null;

    const parsed: TokenData = JSON.parse(data.value);
    // 만료 5분 전까지만 유효
    if (Date.now() < parsed.expires_at - 5 * 60 * 1000) {
      return parsed.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveToken(token: string): Promise<void> {
  const tokenData: TokenData = {
    access_token: token,
    expires_at: Date.now() + 55 * 60 * 1000, // 55분 (티스토리 토큰 유효기간 1시간)
  };

  const supabase = createAdminClient();
  // upsert: key가 있으면 업데이트, 없으면 삽입
  await supabase
    .from("app_settings")
    .upsert(
      { key: SETTING_KEY, value: JSON.stringify(tokenData), updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
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

  await saveToken(token);
  return token;
}

export async function getAccessToken(): Promise<string> {
  const cached = await loadToken();
  if (cached) return cached;
  throw new Error("TISTORY_TOKEN_EXPIRED");
}
