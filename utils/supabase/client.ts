import { createBrowserClient } from "@supabase/ssr";

function hasValidSupabaseEnv(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (typeof url !== "string" || typeof key !== "string") return false;
  const u = url.trim();
  const k = key.trim();
  return u.length > 0 && k.length > 0 && u !== "undefined" && k !== "undefined";
}

/**
 * 브라우저 전용 Supabase 클라이언트.
 * URL/키가 없으면 no-op 객체 반환 (env 미설정 시 @supabase/ssr 에러 방지).
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!hasValidSupabaseEnv()) {
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        signOut: async () => ({ error: null }),
      },
    } as ReturnType<typeof createBrowserClient>;
  }
  return createBrowserClient(
    (url as string).trim(),
    (key as string).trim()
  );
}
