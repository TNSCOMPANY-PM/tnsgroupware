import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 전용 Supabase 클라이언트 (쿠키 기반).
 * Server Components, Server Actions, Route Handlers에서 사용.
 * URL/키가 없으면 호출하지 말 것 (env 미설정 시 에러 방지).
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key || url === "undefined" || key === "undefined") {
    throw new Error("Supabase is not configured (missing URL or anon key).");
  }
  const cookieStore = await cookies();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
          }));
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options ?? { path: "/" })
            );
          } catch {
            // Server Component에서는 set 불가 → 미들웨어/Route Handler에서 처리
          }
        },
      },
    }
  );
}
