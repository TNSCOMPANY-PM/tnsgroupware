import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Admin(Client) – Service Role Key 필요.
 * - 반드시 서버에서만 사용 (Route Handler / Server Action)
 * - 절대 클라이언트 번들로 노출 금지
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    throw new Error("Supabase admin is not configured (missing SUPABASE_SERVICE_ROLE_KEY or URL).");
  }
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

